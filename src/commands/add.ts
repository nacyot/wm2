import { Args, Command, Flags } from '@oclif/core'
import { execa } from 'execa'
import { existsSync, readdirSync , statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { ConfigManager } from '../core/config/config-manager.js'
import { Manager } from '../core/git/manager.js'
import { HookManager } from '../core/hooks/hook-manager.js'

export default class Add extends Command {
  static override args = {
    branch: Args.string({
      description: 'Branch to use for the worktree',
      name: 'BRANCH',
      required: false,
    }),
    nameOrPath: Args.string({
      description: 'Name or path for the worktree',
      name: 'NAME_OR_PATH',
      required: true,
    }),
  }
static override description = `
    Creates a new git worktree at the specified location.

    The NAME_OR_PATH can be:
      - A simple name (e.g., 'feature'): Creates in configured worktrees_dir
      - A relative path (e.g., '../projects/feature'): Creates at that path
      - An absolute path: Creates at the exact location
  `
static override examples = [
    '<%= config.bin %> <%= command.id %> feature          # Create worktree at ../feature using existing branch',
    '<%= config.bin %> <%= command.id %> feature main     # Create worktree using \'main\' branch',
    '<%= config.bin %> <%= command.id %> feature -b new   # Create worktree with new branch \'new\'',
    '<%= config.bin %> <%= command.id %> feature -t origin/develop  # Track remote branch',
    '<%= config.bin %> <%= command.id %> ../custom/path   # Create at specific path',
  ]
static override flags = {
    branch: Flags.string({
      char: 'b',
      summary: 'Create a new branch for the worktree',
    }),
    force: Flags.boolean({
      char: 'f',
      summary: 'Force creation even if directory exists',
    }),
    'no-hooks': Flags.boolean({
      summary: 'Skip hook execution',
    }),
    track: Flags.string({
      char: 't',
      summary: 'Track a remote branch',
    }),
  }
static override summary = 'Create a new worktree'

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Add)

    // Validate we're in a main repository
    await this.validateMainRepository()

    // Validate input
    if (!args.nameOrPath || args.nameOrPath.trim() === '') {
      this.error('Name or path cannot be empty')
    }

    // Load configuration and resolve path
    const configManager = new ConfigManager()
    const path = configManager.resolveWorktreePath(args.nameOrPath)

    // Get branch name from options (options take precedence over arguments)
    let targetBranch = flags.branch || args.branch

    // Handle remote branch tracking
    let remoteBranch: string | undefined
    if (flags.track) {
      remoteBranch = flags.track
      // If target_branch is not set, derive it from remote branch
      if (!targetBranch && remoteBranch) {
        // Extract branch name from remote (e.g., origin/feature -> feature)
        targetBranch = remoteBranch.split('/', 2)[1]
      }
    } else if (args.branch && args.branch.includes('/')) {
      // Auto-detect remote branch (e.g., origin/feature)
      remoteBranch = args.branch
      // Override target_branch for auto-detected remote branches
      targetBranch = args.branch.split('/', 2)[1]
    }

    // Validate branch name
    if (targetBranch && !this.isValidBranchName(targetBranch)) {
      this.error(
        `Invalid branch name '${targetBranch}'. Branch names cannot contain spaces or special characters.`
      )
    }

    // Check for conflicts with existing worktrees
    await this.validateNoConflicts(path, targetBranch, flags)

    const manager = new Manager()
    const hookManager = new HookManager('.', { verbose: false })

    // Execute pre-add hook
    const context = {
      branch: targetBranch,
      force: flags.force,
      path,
    }

    if (!flags['no-hooks']) {
      const hookResult = await hookManager.executeHook('pre_add', context)
      if (!hookResult) {
        this.error('pre_add hook failed. Aborting worktree creation.')
      }
    }

    try {
      // Create worktree
      let result
      if (remoteBranch) {
        // Track remote branch
        result = await manager.addTrackingBranch(
          path,
          targetBranch!,
          remoteBranch,
          { force: flags.force }
        )
      } else if (targetBranch) {
        result = flags.branch
          ? await manager.addWithNewBranch(path, targetBranch, { force: flags.force }) // Create new branch
          : await manager.add(path, targetBranch, { force: flags.force }) // Use existing branch
      } else {
        result = await manager.add(path, undefined, { force: flags.force })
      }

      this.log(`Created: ${result.path} [${result.branch || 'detached'}]`)
      this.log(`Run: cd ${result.path}`)

      // Execute post-add hook
      if (!flags['no-hooks']) {
        const postContext = {
          ...context,
          success: true,
          worktreePath: result.path,
        }
        await hookManager.executeHook('post_add', postContext)
      }
    } catch (error) {
      this.log(`Error: ${error instanceof Error ? error.message : String(error)}`)

      // Execute post-add hook with error context on failure
      if (!flags['no-hooks']) {
        const errorContext = {
          ...context,
          error: error instanceof Error ? error.message : String(error),
          success: false,
        }
        await hookManager.executeHook('post_add', errorContext)
      }

      this.exit(1)
    }
  }

  private async findMainRepositoryPath(): Promise<null | string> {
    try {
      const { stdout } = await execa('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])
      const gitCommonDir = stdout.trim()
      if (!gitCommonDir) return null

      // If it ends with .git, get parent directory
      if (gitCommonDir.endsWith('/.git')) {
        return dirname(gitCommonDir)
      }

      // Check if this is the main repository
      const testDir = gitCommonDir.endsWith('.git') ? dirname(gitCommonDir) : gitCommonDir
      const gitFile = join(testDir, '.git')

      if (existsSync(gitFile) && statSync(gitFile).isDirectory()) {
        return testDir
      }
    } catch {
      // Fallback: try to get worktree list
      try {
        const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'])
        const firstLine = stdout.split('\n')[0]
        if (firstLine?.startsWith('worktree ')) {
          return firstLine.slice(9).trim()
        }
      } catch {
        // Ignore
      }
    }

    return null
  }

  private async isMainRepository(): Promise<boolean> {
    const gitPath = '.git'
    if (!existsSync(gitPath)) return false

    const stat = statSync(gitPath)
    return stat.isDirectory()
  }

  private isValidBranchName(branchName: string): boolean {
    if (!branchName || branchName.trim() === '') return false

    // Check basic Git branch name rules
    const invalidPatterns = [
      /\s/,           // Contains spaces
      /\.\./,         // Consecutive dots
      /^[.-]/,        // Starts with dot or dash
      /[.-]$/,        // Ends with dot or dash
      /[~^:?*[\]\\]/, // Special characters
    ]

    return !invalidPatterns.some(pattern => pattern.test(branchName))
  }

  private async validateMainRepository(): Promise<void> {
    const isMain = await this.isMainRepository()
    if (!isMain) {
      const mainRepoPath = await this.findMainRepositoryPath()
      this.error(
        'This command can only be run from the main Git repository (not from a worktree).\n' +
        (mainRepoPath ? `To enter the main repository, run:\n  cd ${mainRepoPath}` : '')
      )
    }
  }

  private async validateNoConflicts(
    path: string,
    branchName: string | undefined,
    flags: { branch?: string; force?: boolean }
  ): Promise<void> {
    const manager = new Manager()

    // Check for path conflicts
    const normalizedPath = resolve(path)
    const existingWorktrees = await manager.list()

    for (const worktree of existingWorktrees) {
      if (resolve(worktree.path) === normalizedPath) {
        this.error(
          `A worktree already exists at path '${path}'\n` +
          `  Existing worktree: ${worktree.path} (${worktree.branch})\n` +
          '  Use --force to override or choose a different path'
        )
      }
    }

    // Check for branch conflicts (when not creating a new branch)
    if (branchName && !flags.branch) {
      const existingBranch = existingWorktrees.find(wt => wt.branch === branchName)
      if (existingBranch) {
        this.error(
          `Branch '${branchName}' is already checked out in another worktree\n` +
          `  Existing worktree: ${existingBranch.path} (${existingBranch.branch})\n` +
          '  Use a different branch name or -b option to create a new branch'
        )
      }
    }

    // Check for branch name duplication when creating new branch
    if (flags.branch) {
      try {
        const { stdout } = await execa('git', ['branch', '--list', branchName!])
        if (stdout.trim() !== '') {
          this.error(
            `Branch '${branchName}' already exists\n` +
            '  Use a different branch name or checkout the existing branch'
          )
        }
      } catch {
        // Ignore errors
      }
    }

    // Check directory existence (when force option is not used)
    if (!flags.force && existsSync(normalizedPath)) {
      try {
        const files = readdirSync(normalizedPath)
        if (files.length > 0) {
          this.error(
            `Directory '${path}' already exists and is not empty\n` +
            '  Use --force to override or choose a different path'
          )
        }
      } catch {
        // Directory might not be readable, ignore
      }
    }
  }
}