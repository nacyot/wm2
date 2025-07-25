import { select } from '@inquirer/prompts'
import { Args, Command } from '@oclif/core'
import { execa } from 'execa'
import { existsSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { Manager } from '../core/git/manager.js'
import { Worktree } from '../models/worktree.js'

export default class Jump extends Command {
  static override args = {
    worktree: Args.string({
      description: 'Worktree name to jump to',
      name: 'WORKTREE',
      required: false,
    }),
  }
static override description = `
    Navigate to a worktree directory.
    
    If no worktree name is provided, shows an interactive selection menu.
    The command outputs only the path for use with cd command.
  `
static override examples = [
    '<%= config.bin %> <%= command.id %>           # Interactive selection',
    '<%= config.bin %> <%= command.id %> feature   # Jump to worktree with name containing "feature"',
  ]
static override summary = 'Navigate to a worktree directory'

  async run(): Promise<void> {
    const { args } = await this.parse(Jump)

    const mainRepoPath = await this.findMainRepositoryPath()
    if (!mainRepoPath) {
      this.warn('Error: Not in a Git repository.')
      this.exit(1)
    }

    const manager = new Manager(mainRepoPath)
    const worktrees = await manager.list()

    if (worktrees.length === 0) {
      this.warn('Error: No worktrees found.')
      this.exit(1)
    }

    let target: undefined | Worktree

    // If no argument provided, show interactive selection
    if (args.worktree) {
      // Find worktree by name or path
      target = worktrees.find(w =>
        w.path.includes(args.worktree!) ||
        (w.branch && w.branch.includes(args.worktree!)) ||
        basename(w.path) === args.worktree
      )

      if (!target) {
        this.warn(`Error: Worktree '${args.worktree}' not found.`)
        this.warn('\nAvailable worktrees:')
        for (const w of worktrees) {
          this.warn(`  - ${basename(w.path)} (${w.branch || 'detached'})`)
        }

        this.exit(1)
      }
    } else {
      target = await this.selectWorktreeInteractive(worktrees)
    }

    // Output only the path to stdout for cd command
    this.log(target.path)
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

  private async selectWorktreeInteractive(worktrees: Worktree[]): Promise<Worktree> {
    // Check if running in interactive mode
    if (!process.stdin.isTTY || !process.stderr.isTTY) {
      this.warn('Error: Interactive mode requires a TTY. Please specify a worktree name.')
      this.exit(1)
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
      this.warn('\nCancelled.')
      this.exit(0)
    }
  }
}