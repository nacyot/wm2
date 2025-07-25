import { Command, Flags } from '@oclif/core'
import { execa } from 'execa'
import { existsSync, readFileSync, statSync } from 'node:fs'

import { ConfigManager } from '../core/config/config-manager.js'

export default class Reset extends Command {
  static override description = `
    Reset the current worktree branch to origin/main (or configured main branch).
    
    This command must be run from a worktree, not from the main repository.
    It will fetch the latest changes from origin and reset the current branch.
  `
static override examples = [
    '<%= config.bin %> <%= command.id %>         # Reset to origin/main',
    '<%= config.bin %> <%= command.id %> --force # Force reset even with uncommitted changes',
  ]
static override flags = {
    force: Flags.boolean({
      char: 'f',
      summary: 'Force reset even if there are uncommitted changes',
    }),
  }
static override summary = 'Reset current worktree branch to origin/main'

  async run(): Promise<void> {
    const { flags } = await this.parse(Reset)

    // Check if we're in a worktree (not main repository)
    const isMain = await this.isMainRepository()
    if (isMain) {
      this.error('Cannot run reset from the main repository. This command must be run from a worktree.')
    }

    // Get current branch name
    let currentBranch: string
    try {
      const { stdout } = await execa('git', ['symbolic-ref', '--short', 'HEAD'])
      currentBranch = stdout.trim()
    } catch {
      this.error('Could not determine current branch.')
    }

    // Check if we're on the main branch
    const configManager = new ConfigManager()
    const {mainBranchName} = configManager

    if (currentBranch === mainBranchName) {
      this.error(`Cannot reset the main branch '${mainBranchName}'.`)
    }

    // Check for uncommitted changes if not forcing
    if (!flags.force) {
      try {
        const { stdout } = await execa('git', ['status', '--porcelain'])
        if (stdout.trim() !== '') {
          this.error('You have uncommitted changes. Use --force to discard them.')
        }
      } catch (error) {
        this.warn(`Warning: Could not check git status: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    this.log(`Resetting branch '${currentBranch}' to origin/${mainBranchName}...`)

    // Fetch origin/main
    try {
      await execa('git', ['fetch', 'origin', mainBranchName], { stdio: 'inherit' })
    } catch (error) {
      this.error(`Failed to fetch origin/${mainBranchName}: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Reset current branch to origin/main
    // Always use --hard reset to ensure clean working directory
    try {
      await execa('git', ['reset', '--hard', `origin/${mainBranchName}`], { stdio: 'inherit' })
      this.log(`Successfully reset '${currentBranch}' to origin/${mainBranchName}`)
    } catch (error) {
      this.error(`Failed to reset: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async isMainRepository(): Promise<boolean> {
    const gitPath = '.git'
    if (!existsSync(gitPath)) return false

    const stat = statSync(gitPath)
    if (stat.isDirectory()) {
      return true
    }

 if (stat.isFile()) {
      try {
        const content = readFileSync(gitPath, 'utf8').trim()
        return !content.startsWith('gitdir:')
      } catch {
        return false
      }
    }

    return false
  }
}