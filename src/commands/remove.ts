import { confirm, select } from '@inquirer/prompts'
import { Args, Command, Flags } from '@oclif/core'
import { existsSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { ConfigManager } from '../core/config/config-manager.js'
import { Manager } from '../core/git/manager.js'
import { HookManager } from '../core/hooks/hook-manager.js'
import { Worktree } from '../models/worktree.js'
import { formatPathForDisplay } from '../utils/paths.js'

export default class Remove extends Command {
  static override args = {
    nameOrPath: Args.string({
      description: 'Name or path of the worktree to remove',
      name: 'NAME_OR_PATH',
      required: false,
    }),
  }
static override description = `
    Remove a git worktree from the repository.
    
    If no worktree is specified, shows an interactive selection menu.
    The --all flag removes all worktrees at once (with confirmation).
  `
static override examples = [
    '<%= config.bin %> <%= command.id %>           # Interactive selection',
    '<%= config.bin %> <%= command.id %> feature   # Remove worktree named "feature"',
    '<%= config.bin %> <%= command.id %> --all     # Remove all worktrees',
    '<%= config.bin %> <%= command.id %> --force   # Force removal even with changes',
  ]
static override flags = {
    all: Flags.boolean({
      summary: 'Remove all worktrees at once',
    }),
    force: Flags.boolean({
      char: 'f',
      summary: 'Force removal even if worktree has changes',
    }),
    'no-hooks': Flags.boolean({
      summary: 'Skip hook execution',
    }),
  }
static override summary = 'Remove an existing worktree'

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Remove)

    // Validate we're in a main repository
    await this.validateMainRepository()

    const manager = new Manager()

    // Handle --all option
    if (flags.all) {
      if (args.nameOrPath) {
        this.error('Cannot specify both --all and a specific worktree')
      }

      const worktrees = await manager.list()
      if (worktrees.length === 0) {
        this.error('No worktrees found.')
      }

      await this.removeAllWorktrees(worktrees, flags)
      return
    }

    // If no argument provided, show interactive selection
    let path: string
    let targetWorktree: undefined | Worktree

    if (args.nameOrPath) {
      // Load configuration and resolve path
      const configManager = new ConfigManager()
      path = configManager.resolveWorktreePath(args.nameOrPath)
    } else {
      const worktrees = await manager.list()

      // Filter out main repository
      const removableWorktrees = worktrees.filter(worktree => !this.isMainRepositoryPath(worktree.path))

      if (removableWorktrees.length === 0) {
        this.error('No removable worktrees found (only main repository exists).')
      }

      targetWorktree = await this.selectWorktreeInteractive(removableWorktrees)
      path = targetWorktree.path
    }

    // Prevent deletion of main repository
    if (this.isMainRepositoryPath(path)) {
      this.error('Cannot remove the main repository')
    }

    const hookManager = new HookManager('.', { verbose: false })

    // Normalize path
    const normalizedPath = resolve(path)

    // Find worktree information to remove if not already selected
    if (!targetWorktree) {
      const worktrees = await manager.list()
      targetWorktree = worktrees.find(wt => resolve(wt.path) === normalizedPath)

      if (!targetWorktree) {
        this.error(`Worktree not found at path: ${formatPathForDisplay(path)}`)
      }
    }

    // Execute pre-remove hook
    const context = {
      branch: targetWorktree.branch || undefined,
      force: flags.force,
      path: targetWorktree.path,
    }

    if (!flags['no-hooks']) {
      const hookResult = await hookManager.executeHook('pre_remove', context)
      if (!hookResult) {
        this.error('pre_remove hook failed. Aborting worktree removal.')
      }
    }

    try {
      // Remove worktree
      await manager.remove(path, { force: flags.force })

      this.log(`Removed: ${formatPathForDisplay(targetWorktree.path)}`)

      // Execute post-remove hook
      if (!flags['no-hooks']) {
        const postContext = {
          ...context,
          success: true,
        }
        await hookManager.executeHook('post_remove', postContext)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log(`Error: ${errorMessage}`)

      // Check if error is due to modified/untracked files and offer force removal
      if (errorMessage.includes('contains modified or untracked files') &&
          !flags.force &&
          this.isInteractiveModeAvailable()) {
        
        const shouldForce = await confirm({
          default: false,
          message: 'Would you like to force remove the worktree? This will delete all uncommitted changes.',
        })

        if (shouldForce) {
          try {
            // Retry with force option
            await manager.remove(path, { force: true })
            this.log(`Removed: ${formatPathForDisplay(targetWorktree.path)}`)

            // Execute post-remove hook with success
            if (!flags['no-hooks']) {
              const successContext = {
                ...context,
                success: true,
              }
              await hookManager.executeHook('post_remove', successContext)
            }

            return // Successfully removed with force
          } catch (forceError) {
            this.log(`Error: ${forceError instanceof Error ? forceError.message : String(forceError)}`)
            // Fall through to regular error handling
          }
        } else {
          this.log('Removal cancelled.')
        }
      }

      // Execute post-remove hook with error context on failure
      if (!flags['no-hooks']) {
        const errorContext = {
          ...context,
          error: errorMessage,
          success: false,
        }
        await hookManager.executeHook('post_remove', errorContext)
      }

      this.exit(1)
    }
  }

  private async findMainRepositoryPath(): Promise<null | string> {
    const { execa } = await import('execa')
    const { dirname, join } = await import('node:path')

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

  private isInteractiveModeAvailable(): boolean {
    return process.stdin.isTTY === true && process.stderr.isTTY === true
  }

  private async isMainRepository(): Promise<boolean> {
    const gitPath = '.git'
    if (!existsSync(gitPath)) return false

    const stat = statSync(gitPath)
    return stat.isDirectory()
  }

  private isMainRepositoryPath(path: string): boolean {
    // Main repository has .git as a directory, worktrees have .git as a file
    const gitPath = resolve(path, '.git')
    if (!existsSync(gitPath)) return false

    try {
      const stat = statSync(gitPath)
      return stat.isDirectory()
    } catch {
      return false
    }
  }

  private async removeAllWorktrees(
    worktrees: Worktree[],
    flags: { force?: boolean; 'no-hooks'?: boolean }
  ): Promise<void> {
    // Filter out the main repository
    const removableWorktrees = worktrees.filter(worktree => !this.isMainRepositoryPath(worktree.path))

    if (removableWorktrees.length === 0) {
      this.log('No worktrees to remove (only main repository found).')
      this.exit(0)
    }

    // Show confirmation prompt
    if (this.isInteractiveModeAvailable()) {
      this.log(`Removing ${removableWorktrees.length} worktrees...`)

      const shouldRemove = await confirm({
        default: false,
        message: `Are you sure you want to remove all ${removableWorktrees.length} worktrees?`,
      })

      if (!shouldRemove) {
        this.log('Cancelled.')
        this.exit(0)
      }
    } else if (!flags.force) {
      // In non-interactive mode, require --force for safety
      this.error(
        'Removing all worktrees requires confirmation.\n' +
        'Use --force to remove all worktrees without confirmation.'
      )
    }

    const manager = new Manager()
    const hookManager = new HookManager('.', { verbose: false })

    let removedCount = 0
    let failedCount = 0
    const forceRemovableWorktrees: Worktree[] = []

    // Sequential execution is required for removing worktrees
    for (const worktree of removableWorktrees) {
      this.log(`\nRemoving worktree: ${formatPathForDisplay(worktree.path)}`)

      // Execute pre-remove hook
      const context = {
        branch: worktree.branch || undefined,
        force: flags.force,
        path: worktree.path,
      }

      if (!flags['no-hooks']) {
        // eslint-disable-next-line no-await-in-loop
        const hookResult = await hookManager.executeHook('pre_remove', context)
        if (!hookResult) {
          this.log('  Error: pre_remove hook failed. Skipping this worktree.')
          failedCount++
          continue
        }
      }

      try {
        // Remove worktree
        // eslint-disable-next-line no-await-in-loop
        await manager.remove(worktree.path, { force: flags.force })

        this.log(`  Worktree removed: ${formatPathForDisplay(worktree.path)}`)
        removedCount++

        // Execute post-remove hook
        if (!flags['no-hooks']) {
          const postContext = {
            ...context,
            success: true,
          }
          // eslint-disable-next-line no-await-in-loop
          await hookManager.executeHook('post_remove', postContext)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.log(`  Error: ${errorMessage}`)
        failedCount++

        // Track worktrees that can be force removed
        if (errorMessage.includes('contains modified or untracked files')) {
          forceRemovableWorktrees.push(worktree)
        }

        // Execute post-remove hook with error context on failure
        if (!flags['no-hooks']) {
          const errorContext = {
            ...context,
            error: errorMessage,
            success: false,
          }
          // eslint-disable-next-line no-await-in-loop
          await hookManager.executeHook('post_remove', errorContext)
        }
      }
    }

    this.log('\nSummary:')
    this.log(`  Removed: ${removedCount} worktrees`)
    if (failedCount > 0) {
      this.log(`  Failed: ${failedCount} worktrees`)
    }

    // Offer force removal for worktrees with uncommitted changes
    if (forceRemovableWorktrees.length > 0 && !flags.force && this.isInteractiveModeAvailable()) {
      this.log('\nThe following worktrees contain uncommitted changes:')
      for (const worktree of forceRemovableWorktrees) {
        this.log(`  - ${formatPathForDisplay(worktree.path)} (${worktree.branch || 'detached'})`)
      }

      const shouldForce = await confirm({
        default: false,
        message: 'Would you like to force remove these worktrees? This will delete all uncommitted changes.',
      })

      if (shouldForce) {
        this.log('\nForce removing worktrees with uncommitted changes...')

        // Sequential execution is required for force removing worktrees
        for (const worktree of forceRemovableWorktrees) {
          this.log(`\nRemoving worktree: ${formatPathForDisplay(worktree.path)}`)

          try {
            // Remove with force
            // eslint-disable-next-line no-await-in-loop
            await manager.remove(worktree.path, { force: true })

            this.log(`  Worktree removed: ${formatPathForDisplay(worktree.path)}`)
            removedCount++
            failedCount--

            // Execute post-remove hook
            if (!flags['no-hooks']) {
              const context = {
                branch: worktree.branch || undefined,
                force: true,
                path: worktree.path,
                success: true,
              }
              // eslint-disable-next-line no-await-in-loop
              await hookManager.executeHook('post_remove', context)
            }
          } catch (error) {
            this.log(`  Error: ${error instanceof Error ? error.message : String(error)}`)
          }
        }

        this.log('\nUpdated Summary:')
        this.log(`  Removed: ${removedCount} worktrees`)
        if (failedCount > 0) {
          this.log(`  Failed: ${failedCount} worktrees`)
        }
      }
    }

    this.exit(failedCount > 0 ? 1 : 0)
  }

  private async selectWorktreeInteractive(worktrees: Worktree[]): Promise<Worktree> {
    // Check if running in interactive mode
    if (!this.isInteractiveModeAvailable()) {
      this.error('Interactive mode requires a TTY. Please specify a worktree name.')
    }

    // Get current directory to highlight current worktree
    const currentPath = process.cwd()

    // Build choices for prompt
    const choices = worktrees.map(worktree => {
      const isCurrent = resolve(currentPath).startsWith(resolve(worktree.path))
      const branchInfo = worktree.branch || 'detached'
      const name = basename(worktree.path)
      let label = `${name} - ${branchInfo}`
      if (isCurrent) label += ' (current)'

      return {
        name: label,
        short: worktree.path,
        value: worktree,
      }
    })

    try {
      return await select({
        choices,
        message: 'Select a worktree:',
        pageSize: 10,
      })
    } catch {
      // User cancelled
      this.log('\nCancelled.')
      this.exit(0)
    }
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
}