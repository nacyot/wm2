/* eslint-disable camelcase */
import { dump } from 'js-yaml'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigManager } from '../../../src/core/config/config-manager.js'

describe('ConfigManager', () => {
  let testDir: string
  let configManager: ConfigManager

  beforeEach(() => {
    testDir = join(tmpdir(), `config-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    configManager = new ConfigManager(testDir)
  })

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true })
  })

  describe('worktreesDir', () => {
    it('returns the default value when no config file exists', () => {
      expect(configManager.worktreesDir).toBe('../')
    })

    it('returns the configured value when config file exists', () => {
      const configContent = { worktrees_dir: '../../custom-worktrees' }
      writeFileSync(join(testDir, '.worktree.yml'), dump(configContent))
      
      const newConfigManager = new ConfigManager(testDir)
      expect(newConfigManager.worktreesDir).toBe('../../custom-worktrees')
    })

    it('returns the configured value from .git directory', () => {
      mkdirSync(join(testDir, '.git'), { recursive: true })
      const configContent = { worktrees_dir: '../worktrees' }
      writeFileSync(join(testDir, '.git/.worktree.yml'), dump(configContent))
      
      const newConfigManager = new ConfigManager(testDir)
      expect(newConfigManager.worktreesDir).toBe('../worktrees')
    })

    it('prioritizes .worktree.yml over .git/.worktree.yml', () => {
      mkdirSync(join(testDir, '.git'), { recursive: true })
      const configContent1 = { worktrees_dir: '../priority' }
      const configContent2 = { worktrees_dir: '../secondary' }
      writeFileSync(join(testDir, '.worktree.yml'), dump(configContent1))
      writeFileSync(join(testDir, '.git/.worktree.yml'), dump(configContent2))
      
      const newConfigManager = new ConfigManager(testDir)
      expect(newConfigManager.worktreesDir).toBe('../priority')
    })
  })

  describe('hooks', () => {
    it('returns hooks configuration when present', () => {
      const configContent = {
        hooks: {
          post_add: "echo 'post add hook'",
          pre_add: "echo 'pre add hook'",
        },
        worktrees_dir: '../',
      }
      writeFileSync(join(testDir, '.worktree.yml'), dump(configContent))
      
      const newConfigManager = new ConfigManager(testDir)
      const {hooks} = newConfigManager
      expect(hooks).toBeTypeOf('object')
      expect(hooks.pre_add).toBe("echo 'pre add hook'")
      expect(hooks.post_add).toBe("echo 'post add hook'")
    })

    it('returns empty object when no hooks are configured', () => {
      expect(configManager.hooks).toEqual({})
    })
  })

  describe('mainBranchName', () => {
    it('returns the default value when not configured', () => {
      expect(configManager.mainBranchName).toBe('main')
    })

    it('returns the configured value', () => {
      const configContent = { main_branch_name: 'master' }
      writeFileSync(join(testDir, '.worktree.yml'), dump(configContent))
      
      const newConfigManager = new ConfigManager(testDir)
      expect(newConfigManager.mainBranchName).toBe('master')
    })

    it('returns custom branch name when configured', () => {
      const configContent = { main_branch_name: 'development' }
      writeFileSync(join(testDir, '.worktree.yml'), dump(configContent))
      
      const newConfigManager = new ConfigManager(testDir)
      expect(newConfigManager.mainBranchName).toBe('development')
    })
  })

  describe('resolveWorktreePath', () => {
    beforeEach(() => {
      const configContent = { worktrees_dir: '../worktrees' }
      writeFileSync(join(testDir, '.worktree.yml'), dump(configContent))
      configManager = new ConfigManager(testDir)
    })

    it('returns absolute path as is', () => {
      const absolutePath = '/absolute/path/to/worktree'
      expect(configManager.resolveWorktreePath(absolutePath)).toBe(absolutePath)
    })

    it('handles Windows absolute paths', () => {
      if (process.platform === 'win32') {
        const winPath = String.raw`C:\absolute\path`
        expect(configManager.resolveWorktreePath(winPath)).toBe(winPath)
      }
    })

    it('resolves relative path with / relative to repository', () => {
      const relativePath = '../custom/worktree'
      const expected = resolve(testDir, relativePath)
      expect(configManager.resolveWorktreePath(relativePath)).toBe(expected)
    })

    it('resolves simple name relative to worktrees_dir', () => {
      const name = 'feature-branch'
      const expected = resolve(testDir, '../worktrees', name)
      expect(configManager.resolveWorktreePath(name)).toBe(expected)
    })

    it('uses default worktrees_dir when not configured', () => {
      rmSync(join(testDir, '.worktree.yml'))
      const newConfigManager = new ConfigManager(testDir)
      
      const name = 'my-worktree'
      const expected = resolve(testDir, '../', name)
      expect(newConfigManager.resolveWorktreePath(name)).toBe(expected)
    })
  })

  describe('error handling', () => {
    it('returns defaults and warns on invalid YAML', () => {
      writeFileSync(join(testDir, '.worktree.yml'), 'invalid: yaml: content:')
      
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const newConfigManager = new ConfigManager(testDir)
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning: Failed to load config file'))
      expect(newConfigManager.worktreesDir).toBe('../')
      expect(newConfigManager.hooks).toEqual({})
      
      consoleWarnSpy.mockRestore()
    })
  })
})