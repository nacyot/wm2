import { describe, expect, it } from 'vitest'

import { Worktree } from '../../src/models/worktree.js'

describe('Worktree', () => {
  describe('constructor', () => {
    it('creates a worktree with all properties', () => {
      const worktree = new Worktree('/path/to/worktree', 'feature-branch', 'abc123', { bare: false, detached: false })
      
      expect(worktree.path).toBe('/path/to/worktree')
      expect(worktree.branch).toBe('feature-branch')
      expect(worktree.head).toBe('abc123')
      expect(worktree.detached).toBe(false)
      expect(worktree.bare).toBe(false)
    })

    it('creates a detached worktree', () => {
      const worktree = new Worktree('/path/to/worktree', null, 'abc123', { bare: false, detached: true })
      
      expect(worktree.branch).toBeNull()
      expect(worktree.detached).toBe(true)
    })

    it('creates a bare repository', () => {
      const worktree = new Worktree('/path/to/repo.git', null, 'abc123', { bare: true, detached: false })
      
      expect(worktree.bare).toBe(true)
    })
  })

  describe('isMain()', () => {
    it('returns true for main repository (null branch, not detached, not bare)', () => {
      const worktree = new Worktree('/path/to/repo', null, 'abc123', { bare: false, detached: false })
      expect(worktree.isMain()).toBe(true)
    })

    it('returns false for regular worktree', () => {
      const worktree = new Worktree('/path/to/worktree', 'feature', 'abc123', { bare: false, detached: false })
      expect(worktree.isMain()).toBe(false)
    })

    it('returns false for detached worktree', () => {
      const worktree = new Worktree('/path/to/worktree', null, 'abc123', { bare: false, detached: true })
      expect(worktree.isMain()).toBe(false)
    })

    it('returns false for bare repository', () => {
      const worktree = new Worktree('/path/to/repo.git', null, 'abc123', { bare: true, detached: false })
      expect(worktree.isMain()).toBe(false)
    })
  })

  describe('detached property', () => {
    it('should be true for detached worktree', () => {
      const worktree = new Worktree('/path/to/worktree', null, 'abc123', { bare: false, detached: true })
      expect(worktree.detached).toBe(true)
    })

    it('should be false for non-detached worktree', () => {
      const worktree = new Worktree('/path/to/worktree', 'main', 'abc123', { bare: false, detached: false })
      expect(worktree.detached).toBe(false)
    })
  })

  describe('bare property', () => {
    it('should be true for bare repository', () => {
      const worktree = new Worktree('/path/to/repo.git', null, 'abc123', { bare: true, detached: false })
      expect(worktree.bare).toBe(true)
    })

    it('should be false for non-bare repository', () => {
      const worktree = new Worktree('/path/to/worktree', 'main', 'abc123', { bare: false, detached: false })
      expect(worktree.bare).toBe(false)
    })
  })

  describe('toString()', () => {
    it('formats bare repository', () => {
      const worktree = new Worktree('/path/to/repo.git', null, 'abc123', { bare: true, detached: false })
      expect(worktree.toString()).toBe('/path/to/repo.git (bare)')
    })

    it('formats main repository', () => {
      const worktree = new Worktree('/path/to/repo', null, 'abc123', { bare: false, detached: false })
      expect(worktree.toString()).toBe('/path/to/repo abc123 [HEAD (detached)]')
    })

    it('formats regular worktree', () => {
      const worktree = new Worktree('/path/to/worktree', 'feature-branch', 'abc123', { bare: false, detached: false })
      expect(worktree.toString()).toBe('/path/to/worktree abc123 [feature-branch]')
    })

    it('formats detached worktree', () => {
      const worktree = new Worktree('/path/to/worktree', null, 'abc123', { bare: false, detached: true })
      expect(worktree.toString()).toBe('/path/to/worktree abc123 [HEAD (detached)]')
    })
  })

  describe('toObject()', () => {
    it('converts to plain object', () => {
      const worktree = new Worktree('/path/to/worktree', 'main', 'abc123', { bare: false, detached: false })
      const obj = worktree.toObject()
      
      expect(obj).toEqual({
        bare: false,
        branch: 'main',
        detached: false,
        head: 'abc123',
        path: '/path/to/worktree',
      })
    })
  })
})
