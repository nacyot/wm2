import { Command } from '@oclif/core'
import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import { Manager } from '../core/git/manager.js'

export default class List extends Command {
  static override description = `
    Displays all git worktrees in the current repository.

    This command can be run from either the main repository or any worktree.
    When run from a worktree, it shows the path to the main repository.
  `
static override examples = ['<%= config.bin %> <%= command.id %>  # List all worktrees']
static override summary = 'List all worktrees'

  async run(): Promise<void> {
    // list command can be used from worktree
    const mainRepoPath = await this.findMainRepositoryPath()
    if (!mainRepoPath) {
      this.error('Not in a Git repository.')
    }

    // Show main repository path if running from a worktree
    const isMain = await this.isMainRepository()
    if (!isMain) {
      this.log(`Main: ${mainRepoPath}`)
      this.log('')
    }

    const manager = new Manager(mainRepoPath)
    const worktrees = await manager.list()

    if (worktrees.length === 0) {
      this.log('No worktrees found.')
    } else {
      const cwd = process.cwd()
      
      // Calculate column widths for alignment
      let maxPathLength = 0
      const entries = worktrees.map(worktree => {
        const relativePath = relative(cwd, worktree.path)
        const displayPath = relativePath.startsWith('..') ? relativePath : `./${relativePath}`
        const shortHash = worktree.head.slice(0, 7)
        const branchDisplay = worktree.branch || 'HEAD (detached)'
        
        maxPathLength = Math.max(maxPathLength, displayPath.length)
        
        return { branchDisplay, displayPath, isCurrent: cwd === worktree.path, shortHash }
      })
      
      // Display aligned output
      for (const entry of entries) {
        const paddedPath = entry.displayPath.padEnd(maxPathLength + 2)
        const prefix = entry.isCurrent ? '* ' : '  '
        this.log(`${prefix}${paddedPath}${entry.shortHash}  [${entry.branchDisplay}]`)
      }
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

      const fs = await import('node:fs')
      if (existsSync(gitFile)) {
        const stat = await fs.promises.stat(gitFile)
        if (stat.isDirectory()) {
          return testDir
        }
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

    const fs = await import('node:fs')
    const stat = await fs.promises.stat(gitPath)
    return stat.isDirectory()
  }
}