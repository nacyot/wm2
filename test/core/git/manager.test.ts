import { existsSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GitError, Manager } from '../../../src/core/git/manager.js'
import { Worktree } from '../../../src/models/worktree.js'
import { createTestRepository } from '../../helpers/index.js'

// Helper to normalize paths for comparison (handles /private/var vs /var on macOS)
function normalizePath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

describe('Manager', () => {
  let testRepo: { cleanup: () => Promise<void>; path: string; }

  beforeEach(async () => {
    testRepo = await createTestRepository()
  })

  afterEach(async () => {
    await testRepo.cleanup()
  })

  describe('constructor', () => {
    it('initializes with a repository path', () => {
      expect(() => new Manager(testRepo.path)).not.toThrow()
    })

    it('throws an error if not a git repository', () => {
      expect(() => new Manager('/tmp/not-a-git-repo')).toThrow('Not a git repository')
    })

    it('uses current directory by default', () => {
      const originalCwd = process.cwd()
      process.chdir(testRepo.path)
      expect(() => new Manager()).not.toThrow()
      process.chdir(originalCwd)
    })
  })

  describe('list()', () => {
    it('returns an empty array for a new repository', async () => {
      const manager = new Manager(testRepo.path)
      const worktrees = await manager.list()
      
      expect(worktrees).toHaveLength(1) // Only the main worktree
      expect(worktrees[0]).toBeInstanceOf(Worktree)
      expect(normalizePath(worktrees[0].path)).toBe(normalizePath(testRepo.path))
      expect(worktrees[0].bare).toBe(false)
    })

    it('returns all worktrees', async () => {
      const manager = new Manager(testRepo.path)
      
      // Add a worktree
      const worktreePath = join(testRepo.path, '..', `test-worktree-${Date.now()}`)
      await manager.addWithNewBranch(worktreePath, 'test-branch')
      
      const worktrees = await manager.list()
      expect(worktrees).toHaveLength(2)
      
      const paths = worktrees.map(w => normalizePath(w.path))
      expect(paths).toContain(normalizePath(testRepo.path))
      expect(paths).toContain(normalizePath(worktreePath))
    })
  })

  describe('add()', () => {
    it('adds a worktree with an existing branch', async () => {
      const manager = new Manager(testRepo.path)
      
      // Create a branch first
      const { execa } = await import('execa')
      await execa('git', ['checkout', '-b', 'existing-branch'], { cwd: testRepo.path })
      await execa('git', ['checkout', 'main'], { cwd: testRepo.path })
      
      const worktreePath = join(testRepo.path, '..', `test-worktree-${Date.now()}`)
      const worktree = await manager.add(worktreePath, 'existing-branch')
      
      expect(worktree).toBeInstanceOf(Worktree)
      expect(worktree.path).toBe(worktreePath)
      expect(worktree.branch).toBe('existing-branch')
      expect(existsSync(worktreePath)).toBe(true)
    })

    it('adds a worktree with HEAD detached', async () => {
      const manager = new Manager(testRepo.path)
      
      const worktreePath = join(testRepo.path, '..', `test-worktree-${Date.now()}`)
      const worktree = await manager.add(worktreePath)
      
      expect(worktree).toBeInstanceOf(Worktree)
      expect(worktree.path).toBe(worktreePath)
      expect(existsSync(worktreePath)).toBe(true)
    })

    it('throws an error if branch does not exist', async () => {
      const manager = new Manager(testRepo.path)
      const worktreePath = join(testRepo.path, '..', `test-worktree-${Date.now()}`)
      
      await expect(manager.add(worktreePath, 'non-existent-branch')).rejects.toThrow(GitError)
    })

    it('forces add when force option is true', async () => {
      const manager = new Manager(testRepo.path)
      const worktreePath = join(testRepo.path, '..', `test-worktree-${Date.now()}`)
      
      // Create a branch
      const { execa } = await import('execa')
      await execa('git', ['checkout', '-b', 'test-branch'], { cwd: testRepo.path })
      
      // Create a file and leave it uncommitted to create a "dirty" state
      const { writeFile } = await import('node:fs/promises')
      await writeFile(join(testRepo.path, 'uncommitted.txt'), 'test')
      
      // Try to add worktree with force (should work despite uncommitted changes)
      const worktree = await manager.add(worktreePath, 'test-branch', { force: true })
      expect(worktree).toBeInstanceOf(Worktree)
      expect(worktree.branch).toBe('test-branch')
    })
  })

  describe('addWithNewBranch()', () => {
    it('creates a worktree with a new branch', async () => {
      const manager = new Manager(testRepo.path)
      const worktreePath = join(testRepo.path, '..', `new-feature-${Date.now()}`)
      
      const worktree = await manager.addWithNewBranch(worktreePath, 'feature-branch')
      
      expect(worktree).toBeInstanceOf(Worktree)
      expect(worktree.path).toBe(worktreePath)
      expect(worktree.branch).toBe('feature-branch')
      expect(existsSync(worktreePath)).toBe(true)
      
      // Verify the branch was created
      const { execa } = await import('execa')
      const { stdout } = await execa('git', ['branch'], { cwd: testRepo.path })
      expect(stdout).toContain('feature-branch')
    })

    it('throws an error if branch already exists', async () => {
      const manager = new Manager(testRepo.path)
      
      // Create a branch first
      const { execa } = await import('execa')
      await execa('git', ['checkout', '-b', 'existing-branch'], { cwd: testRepo.path })
      await execa('git', ['checkout', 'main'], { cwd: testRepo.path })
      
      const worktreePath = join(testRepo.path, '..', `test-worktree-${Date.now()}`)
      await expect(
        manager.addWithNewBranch(worktreePath, 'existing-branch')
      ).rejects.toThrow(GitError)
    })
  })

  describe('addTrackingBranch()', () => {
    it('creates a worktree tracking a remote branch', async () => {
      const manager = new Manager(testRepo.path)
      const { execa } = await import('execa')
      
      // Set up a fake remote
      await execa('git', ['remote', 'add', 'origin', testRepo.path], { cwd: testRepo.path })
      await execa('git', ['checkout', '-b', 'remote-branch'], { cwd: testRepo.path })
      await execa('git', ['checkout', 'main'], { cwd: testRepo.path })
      
      const worktreePath = join(testRepo.path, '..', `tracking-worktree-${Date.now()}`)
      
      const worktree = await manager.addTrackingBranch(
        worktreePath,
        'local-tracking',
        'origin/main'
      )
      
      expect(worktree).toBeInstanceOf(Worktree)
      expect(worktree.path).toBe(worktreePath)
      expect(worktree.branch).toBe('local-tracking')
      expect(existsSync(worktreePath)).toBe(true)
    })

    it('throws an error if remote branch does not exist', async () => {
      const manager = new Manager(testRepo.path)
      const worktreePath = join(testRepo.path, '..', `tracking-worktree-${Date.now()}`)
      
      await expect(
        manager.addTrackingBranch(worktreePath, 'local-branch', 'origin/non-existent')
      ).rejects.toThrow(GitError)
    })
  })

  describe('remove()', () => {
    it('removes an existing worktree', async () => {
      const manager = new Manager(testRepo.path)
      const worktreePath = join(testRepo.path, '..', `to-remove-${Date.now()}`)
      
      await manager.addWithNewBranch(worktreePath, 'remove-me')
      expect(existsSync(worktreePath)).toBe(true)
      
      await manager.remove(worktreePath)
      // Remove no longer returns a value
      expect(existsSync(worktreePath)).toBe(false)
    })

    it('throws an error if worktree does not exist', async () => {
      const manager = new Manager(testRepo.path)
      const worktreePath = join(testRepo.path, '..', `non-existent-${Date.now()}`)
      
      await expect(manager.remove(worktreePath)).rejects.toThrow(GitError)
    })

    it('forces removal when force option is true', async () => {
      const manager = new Manager(testRepo.path)
      const worktreePath = join(testRepo.path, '..', `force-remove-${Date.now()}`)
      
      await manager.addWithNewBranch(worktreePath, 'force-branch')
      
      // Make changes in the worktree
      const { writeFile } = await import('node:fs/promises')
      await writeFile(join(worktreePath, 'new-file.txt'), 'changes')
      
      await manager.remove(worktreePath, { force: true })
      // Remove no longer returns a value
      expect(existsSync(worktreePath)).toBe(false)
    })
  })

  describe('prune()', () => {
    it('prunes worktree references', async () => {
      const manager = new Manager(testRepo.path)
      await manager.prune()
      // Prune no longer returns a value
    })
  })

  describe('parseWorktreeList', () => {
    it('correctly parses porcelain output', async () => {
      const manager = new Manager(testRepo.path)
      
      // Add multiple worktrees
      const worktree1 = join(testRepo.path, '..', `worktree1-${Date.now()}`)
      const worktree2 = join(testRepo.path, '..', `worktree2-${Date.now()}-2`)
      
      await manager.addWithNewBranch(worktree1, 'branch1')
      await manager.addWithNewBranch(worktree2, 'branch2')
      
      const worktrees = await manager.list()
      
      expect(worktrees).toHaveLength(3) // main + 2 worktrees
      
      const branches = worktrees.map(w => w.branch).filter(Boolean)
      expect(branches).toContain('branch1')
      expect(branches).toContain('branch2')
    })
  })
})