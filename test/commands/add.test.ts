import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Manager } from '../../src/core/git/manager.js'
import { createTestRepository, runWm2Command } from '../helpers/index.js'

describe('add command', () => {
  let testRepo: { cleanup: () => Promise<void>; path: string; }

  beforeEach(async () => {
    testRepo = await createTestRepository()
  })

  afterEach(async () => {
    await testRepo.cleanup()
  })

  describe('argument parsing', () => {
    it('correctly parses name/path as first argument', async () => {
      const worktreeName = `test-worktree-${Date.now()}`
      const result = await runWm2Command(['add', worktreeName], { cwd: testRepo.path })
      
      expect(result.exitCode).toBe(0)
      const worktreePath = join(testRepo.path, '..', worktreeName)
      expect(existsSync(worktreePath)).toBe(true)
    })

    it('correctly parses branch as second argument', async () => {
      const result = await runWm2Command(['add', `branch-test-${Date.now()}`, '-b', 'feature-branch'], {
        cwd: testRepo.path,
      })
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('feature-branch')
      
      const manager = new Manager(testRepo.path)
      const worktrees = await manager.list()
      const newWorktree = worktrees.find(w => w.branch === 'feature-branch')
      expect(newWorktree).toBeDefined()
    })

    it('creates detached worktree when branch is not specified', async () => {
      const result = await runWm2Command(['add', `detached-test-${Date.now()}`], { cwd: testRepo.path })
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('[detached]')
    })

    it('uses existing branch when specified as second argument', async () => {
      // Create a branch first
      const { execa } = await import('execa')
      await execa('git', ['checkout', '-b', 'existing-branch'], { cwd: testRepo.path })
      await execa('git', ['checkout', 'main'], { cwd: testRepo.path })
      
      const result = await runWm2Command(['add', `existing-branch-test-${Date.now()}`, 'existing-branch'], {
        cwd: testRepo.path,
      })
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('existing-branch')
    })

    it('fails when required name/path argument is missing', async () => {
      const result = await runWm2Command(['add'], { cwd: testRepo.path })
      
      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('Missing 1 required arg')
    })
  })

  describe('path handling', () => {
    it('creates worktree with simple name in parent directory', async () => {
      const worktreeName = `simple-name-${Date.now()}`
      const result = await runWm2Command(['add', worktreeName], { cwd: testRepo.path })
      
      expect(result.exitCode).toBe(0)
      const expectedPath = join(testRepo.path, '..', worktreeName)
      expect(existsSync(expectedPath)).toBe(true)
    })

    it('creates worktree with relative path', async () => {
      const timestamp = Date.now()
      const result = await runWm2Command(['add', `../custom/location-${timestamp}`, '-b', 'custom-branch'], {
        cwd: testRepo.path,
      })
      
      expect(result.exitCode).toBe(0)
      const expectedPath = join(testRepo.path, '..', 'custom', `location-${timestamp}`)
      expect(existsSync(expectedPath)).toBe(true)
    })

    it('creates worktree with absolute path', async () => {
      const absolutePath = join(testRepo.path, '..', `absolute-test-${Date.now()}`)
      const result = await runWm2Command(['add', absolutePath, '-b', 'absolute-branch'], {
        cwd: testRepo.path,
      })
      
      expect(result.exitCode).toBe(0)
      expect(existsSync(absolutePath)).toBe(true)
    })
  })

  describe('error handling', () => {
    it('fails when branch is already checked out', async () => {
      const result = await runWm2Command(['add', `duplicate-branch-${Date.now()}`, 'main'], {
        cwd: testRepo.path,
      })
      
      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain("Branch 'main' is already checked out")
    })

    it('fails when creating new branch that already exists', async () => {
      // Create a branch first
      const { execa } = await import('execa')
      await execa('git', ['checkout', '-b', 'existing'], { cwd: testRepo.path })
      await execa('git', ['checkout', 'main'], { cwd: testRepo.path })
      
      const result = await runWm2Command(['add', `duplicate-new-${Date.now()}`, '-b', 'existing'], {
        cwd: testRepo.path,
      })
      
      if (result.exitCode !== 1) {
        console.log('Exit code:', result.exitCode)
        console.log('Stdout:', result.stdout)
        console.log('Stderr:', result.stderr)
      }
      
      expect(result.exitCode).toBe(1)
      // The error message might be in stdout instead of stderr
      const output = result.stderr || result.stdout
      expect(output).toContain("already exists")
    })
  })
})