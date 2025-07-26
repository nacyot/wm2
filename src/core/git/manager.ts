import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { Worktree } from '../../models/worktree.js'

export class GitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitError'
  }
}

export class Manager {
  private readonly repositoryPath: string

  constructor(repositoryPath = '.') {
    this.repositoryPath = resolve(repositoryPath)
    this.validateGitRepository()
  }

  async add(path: string, branch?: string, options: { force?: boolean } = {}): Promise<Worktree> {
    this.validateInput(path, 'path')
    if (branch) this.validateInput(branch, 'branch')
    
    const args = ['worktree', 'add']
    if (options.force) args.push('--force')
    args.push(path)
    if (branch) args.push(branch)

    const { stderr } = await this.executeGitCommand(args)
    if (stderr && !stderr.includes('Preparing worktree')) {
      throw new GitError(stderr)
    }

    return new Worktree(path, branch || null, '', { bare: false, detached: false })
  }

  async addTrackingBranch(
    path: string,
    localBranch: string,
    remoteBranch: string,
    options: { force?: boolean } = {},
  ): Promise<Worktree> {
    this.validateInput(path, 'path')
    this.validateInput(localBranch, 'branch')
    
    // Parse remote and branch name
    const [remote, ...branchParts] = remoteBranch.split('/')
    const branchName = branchParts.join('/')

    // Fetch the remote branch first
    try {
      await this.executeGitCommand(['fetch', remote, branchName])
    } catch (error) {
      throw new GitError(`Failed to fetch remote branch: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Create worktree with new branch tracking the remote
    const args = ['worktree', 'add']
    if (options.force) args.push('--force')
    args.push('-b', localBranch, path, remoteBranch)

    const { stderr } = await this.executeGitCommand(args)
    if (stderr && !stderr.includes('Preparing worktree')) {
      throw new GitError(stderr)
    }

    return new Worktree(path, localBranch, '', { bare: false, detached: false })
  }

  async addWithNewBranch(path: string, branch: string, options: { force?: boolean } = {}): Promise<Worktree> {
    this.validateInput(path, 'path')
    this.validateInput(branch, 'branch')
    
    const args = ['worktree', 'add']
    if (options.force) args.push('--force')
    args.push('-b', branch, path)

    const { stderr } = await this.executeGitCommand(args)
    if (stderr && !stderr.includes('Preparing worktree')) {
      throw new GitError(stderr)
    }

    return new Worktree(path, branch, '', { bare: false, detached: false })
  }

  async list(): Promise<Worktree[]> {
    try {
      const { stdout } = await this.executeGitCommand(['worktree', 'list', '--porcelain'])
      return this.parseWorktreeList(stdout)
    } catch {
      return []
    }
  }

  async prune(): Promise<void> {
    await this.executeGitCommand(['worktree', 'prune'])
  }

  async remove(path: string, options: { force?: boolean } = {}): Promise<void> {
    this.validateInput(path, 'path')
    
    const args = ['worktree', 'remove']
    if (options.force) args.push('--force')
    args.push(path)

    await this.executeGitCommand(args)
  }

  private async executeGitCommand(args: string[]): Promise<{ stderr: string; stdout: string; }> {
    try {
      const result = await execa('git', args, {
        cwd: this.repositoryPath,
        reject: false,
      })

      if (result.exitCode !== 0 && result.stderr) {
        throw new GitError(result.stderr)
      }

      return { stderr: result.stderr, stdout: result.stdout }
    } catch (error) {
      if (error instanceof GitError) {
        throw error
      }

      throw new GitError(error instanceof Error ? error.message : String(error))
    }
  }

  private parseWorktreeList(output: string): Worktree[] {
    const worktrees: Worktree[] = []
    let currentWorktree: Record<string, unknown> = {}

    const createWorktree = (wt: Record<string, unknown>): Worktree => new Worktree(
        wt.path as string,
        (wt.branch as string) || null,
        (wt.head as string) || '',
        {
          bare: (wt.bare as boolean) || false,
          detached: (wt.detached as boolean) || false,
        },
      )

    const lines = output.split('\n').filter(line => line.trim())

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (trimmedLine.startsWith('worktree ')) {
        if (Object.keys(currentWorktree).length > 0) {
          worktrees.push(createWorktree(currentWorktree))
        }

        currentWorktree = { path: trimmedLine.slice(9) }
      } else if (trimmedLine.startsWith('HEAD ')) {
        currentWorktree.head = trimmedLine.slice(5)
      } else if (trimmedLine.startsWith('branch ')) {
        const branch = trimmedLine.slice(7)
        // Remove refs/heads/ prefix if present
        currentWorktree.branch = branch.startsWith('refs/heads/') 
          ? branch.slice(11) 
          : branch
      } else if (trimmedLine === 'detached') {
        currentWorktree.detached = true
      } else if (trimmedLine === 'bare') {
        currentWorktree.bare = true
      }
    }

    if (Object.keys(currentWorktree).length > 0) {
      worktrees.push(createWorktree(currentWorktree))
    }

    return worktrees
  }

  private validateGitRepository(): void {
    if (!existsSync(join(this.repositoryPath, '.git'))) {
      throw new GitError(`Not a git repository: ${this.repositoryPath}`)
    }
  }

  private validateInput(input: string, type: 'branch' | 'path'): void {
    // Prevent command injection by checking for dangerous characters
    const dangerousChars = /[;&|`$<>\\]/
    if (dangerousChars.test(input)) {
      throw new GitError(`Invalid ${type}: contains potentially dangerous characters`)
    }
    
    // Additional validation for branch names
    if (type === 'branch') {
      // Git branch name restrictions
      const invalidBranchChars = /[\s~^:?*[\]\\]/
      if (invalidBranchChars.test(input)) {
        throw new GitError('Invalid branch name: contains forbidden characters')
      }

      if (input.startsWith('-')) {
        throw new GitError('Invalid branch name: cannot start with hyphen')
      }
    }
  }
}
