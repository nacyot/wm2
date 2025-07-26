/* eslint-disable camelcase */
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'

import { HookManager } from '../../../src/core/hooks/hook-manager.js'

describe('HookManager', () => {
  let tempDir: string
  let hookManager: HookManager

  beforeEach(() => {
    tempDir = join(tmpdir(), `hook-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
    hookManager = new HookManager(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe('constructor', () => {
    it('creates a hook manager instance', () => {
      expect(hookManager).toBeInstanceOf(HookManager)
    })
  })

  describe('executeHook', () => {
    describe('when no hook file exists', () => {
      it('returns true for any hook type', async () => {
        expect(await hookManager.executeHook('pre_add')).toBe(true)
        expect(await hookManager.executeHook('post_add')).toBe(true)
        expect(await hookManager.executeHook('pre_remove')).toBe(true)
        expect(await hookManager.executeHook('post_remove')).toBe(true)
      })
    })

    describe('when hook file exists', () => {
      // Function needs to be inside scope to access tempDir
      // eslint-disable-next-line unicorn/consistent-function-scoping
      const getHookFile = () => join(tempDir, '.worktree.yml')

      describe('with string command', () => {
        beforeEach(() => {
          writeFileSync(getHookFile(), stringify({
            pre_add: "echo 'Pre-add hook executed'"
          }))
        })

        it('executes the command and returns true', async () => {
          expect(await hookManager.executeHook('pre_add')).toBe(true)
        })

        it('executes the command with context', async () => {
          const context = { branch: 'main', path: '/test/path' }
          expect(await hookManager.executeHook('pre_add', context)).toBe(true)
        })
      })

      describe('with array of commands', () => {
        beforeEach(() => {
          writeFileSync(getHookFile(), stringify({
            pre_add: ["echo 'First command'", "echo 'Second command'"]
          }))
        })

        it('executes all commands and returns true if all succeed', async () => {
          expect(await hookManager.executeHook('pre_add')).toBe(true)
        })
      })

      describe('with hash configuration', () => {
        beforeEach(() => {
          writeFileSync(getHookFile(), stringify({
            pre_add: {
              command: "echo 'Hook with config'",
              stop_on_error: true
            }
          }))
        })

        it('executes the command from hash config', async () => {
          expect(await hookManager.executeHook('pre_add')).toBe(true)
        })
      })

      describe('when command fails', () => {
        beforeEach(() => {
          writeFileSync(getHookFile(), stringify({
            pre_add: 'exit 1'
          }))
        })

        it('returns false when command fails', async () => {
          const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
          // Verify file exists
          expect(existsSync(join(tempDir, '.worktree.yml'))).toBe(true)
          const content = readFileSync(join(tempDir, '.worktree.yml'), 'utf8')
          console.log('YAML content:', content)
          
          const newHookManager = new HookManager(tempDir, { verbose: true })
          // Check if hook is loaded
          expect(newHookManager.hasHook('pre_add')).toBe(true)
          
          const result = await newHookManager.executeHook('pre_add')
          expect(result).toBe(false)
          consoleErrorSpy.mockRestore()
        })
      })

      describe('with invalid hook type', () => {
        it('returns true for invalid hook types', async () => {
          // @ts-expect-error Testing invalid input
          expect(await hookManager.executeHook('invalid_hook')).toBe(true)
        })
      })
    })

    describe('with malformed YAML', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), 'invalid: yaml: content: [')
      })

      it('handles YAML parsing errors gracefully', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const newHookManager = new HookManager(tempDir)
        expect(await newHookManager.executeHook('pre_add')).toBe(true)
        consoleWarnSpy.mockRestore()
      })
    })

    describe('with new config structure', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: {
            pre_add: {
              commands: ["echo 'Command 1'", "echo 'Command 2'"]
            }
          }
        }))
      })

      it('executes commands from new structure', async () => {
        const newHookManager = new HookManager(tempDir)
        expect(await newHookManager.executeHook('pre_add')).toBe(true)
      })
    })

    describe('with pwd configuration', () => {
      let testWorkDir: string

      beforeEach(() => {
        testWorkDir = join(tempDir, 'test_work_dir')
        mkdirSync(testWorkDir)
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: {
            pre_add: {
              commands: ['pwd > pwd.txt'],
              pwd: testWorkDir
            }
          }
        }))
      })

      it('executes commands in specified working directory', async () => {
        const newHookManager = new HookManager(tempDir)
        await newHookManager.executeHook('pre_add')
        
        const pwdFile = join(testWorkDir, 'pwd.txt')
        expect(existsSync(pwdFile)).toBe(true)
        const writtenPath = readFileSync(pwdFile, 'utf8').trim()
        expect(realpathSync(writtenPath)).toBe(realpathSync(testWorkDir))
      })
    })

    describe('with environment variable substitution in pwd', () => {
      let testWorktree: string

      beforeEach(() => {
        testWorktree = join(tempDir, 'test-worktree')
        mkdirSync(testWorktree)
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: {
            post_add: {
              commands: ['pwd > pwd.txt'],
              pwd: '$WORKTREE_ABSOLUTE_PATH'
            }
          }
        }))
      })

      it('substitutes environment variables in pwd', async () => {
        const newHookManager = new HookManager(tempDir)
        const context = { path: testWorktree }
        await newHookManager.executeHook('post_add', context)
        
        const pwdFile = join(testWorktree, 'pwd.txt')
        expect(existsSync(pwdFile)).toBe(true)
        const writtenPath = readFileSync(pwdFile, 'utf8').trim()
        expect(realpathSync(writtenPath)).toBe(realpathSync(testWorktree))
      })
    })
  })

  describe('hasHook', () => {
    beforeEach(() => {
      writeFileSync(join(tempDir, '.worktree.yml'), stringify({
        post_add: null,
        pre_add: "echo 'test'"
      }))
    })

    it('returns true for existing hooks', () => {
      const newHookManager = new HookManager(tempDir)
      expect(newHookManager.hasHook('pre_add')).toBe(true)
    })

    it('returns false for hooks with null value', () => {
      const newHookManager = new HookManager(tempDir)
      expect(newHookManager.hasHook('post_add')).toBe(false)
    })

    it('returns false for non-existent hooks', () => {
      const newHookManager = new HookManager(tempDir)
      expect(newHookManager.hasHook('pre_remove')).toBe(false)
    })

    it('returns false for invalid hook types', () => {
      const newHookManager = new HookManager(tempDir)
      expect(newHookManager.hasHook('invalid_hook')).toBe(false)
    })
  })

  describe('listHooks', () => {
    describe('when hook file exists', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          invalid_hook: "echo 'invalid'",
          post_add: "echo 'post-add'",
          pre_add: "echo 'pre-add'",
          pre_remove: null
        }))
      })

      it('returns only valid hooks with non-null values', () => {
        const newHookManager = new HookManager(tempDir)
        const hooks = newHookManager.listHooks()
        expect(Object.keys(hooks)).toHaveLength(2)
        expect(hooks.pre_add).toBe("echo 'pre-add'")
        expect(hooks.post_add).toBe("echo 'post-add'")
      })
    })

    describe('when no hook file exists', () => {
      it('returns empty object', () => {
        expect(hookManager.listHooks()).toEqual({})
      })
    })
  })

  describe('environment variable handling', () => {
    beforeEach(() => {
      writeFileSync(join(tempDir, '.worktree.yml'), stringify({
        pre_add: 'echo "PATH: $WORKTREE_PATH, BRANCH: $WORKTREE_BRANCH, ROOT: $WORKTREE_MANAGER_ROOT"'
      }))
    })

    it('passes context as environment variables', async () => {
      const newHookManager = new HookManager(tempDir)
      const context = { branch: 'feature', path: '/test/path' }
      expect(await newHookManager.executeHook('pre_add', context)).toBe(true)
    })
  })

  describe('hook file discovery', () => {
    describe('with .worktree.yml in root', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: { pre_add: { commands: ["echo 'root hook'"] } }
        }))
      })

      it('finds and uses the hook file', () => {
        const newHookManager = new HookManager(tempDir)
        expect(newHookManager.hasHook('pre_add')).toBe(true)
      })
    })

    describe('with .git/.worktree.yml', () => {
      beforeEach(() => {
        const gitDir = join(tempDir, '.git')
        mkdirSync(gitDir)
        writeFileSync(join(gitDir, '.worktree.yml'), stringify({
          hooks: { pre_add: { commands: ["echo 'git hook'"] } }
        }))
      })

      it('finds and uses the git hook file', () => {
        const newHookManager = new HookManager(tempDir)
        expect(newHookManager.hasHook('pre_add')).toBe(true)
      })
    })

    describe('with both hook files present', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: { pre_add: { commands: ["echo 'root hook'"] } }
        }))
        
        const gitDir = join(tempDir, '.git')
        mkdirSync(gitDir)
        writeFileSync(join(gitDir, '.worktree.yml'), stringify({
          hooks: { pre_remove: { commands: ["echo 'git hook'"] } }
        }))
      })

      it('prioritizes .worktree.yml over .git/.worktree.yml', () => {
        const newHookManager = new HookManager(tempDir)
        expect(newHookManager.hasHook('pre_add')).toBe(true)
        expect(newHookManager.hasHook('pre_remove')).toBe(false)
      })
    })
  })

  describe('stop_on_error configuration', () => {
    describe('when stop_on_error is false', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: {
            pre_add: {
              commands: [
                'exit 1',
                "echo 'This should still execute'"
              ],
              stop_on_error: false
            }
          }
        }))
      })

      it('continues executing commands even after failure', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const newHookManager = new HookManager(tempDir)
        expect(await newHookManager.executeHook('pre_add')).toBe(true)
        consoleErrorSpy.mockRestore()
      })
    })

    describe('when stop_on_error is true (default)', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: {
            pre_add: {
              commands: [
                'exit 1',
                "echo 'This should NOT execute'"
              ]
            }
          }
        }))
      })

      it('stops executing commands after failure', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const newHookManager = new HookManager(tempDir)
        expect(await newHookManager.executeHook('pre_add')).toBe(false)
        consoleErrorSpy.mockRestore()
      })
    })
  })

  describe('all environment variables', () => {
    let outputFile: string

    beforeEach(() => {
      outputFile = join(tempDir, 'env_vars.txt')
      writeFileSync(join(tempDir, '.worktree.yml'), stringify({
        hooks: {
          post_add: {
            command: `node -e "
              const fs = require('fs');
              const content = [
                'MAIN=' + process.env.WORKTREE_MAIN,
                'ROOT=' + process.env.WORKTREE_MANAGER_ROOT,
                'PATH=' + process.env.WORKTREE_PATH,
                'ABSOLUTE=' + process.env.WORKTREE_ABSOLUTE_PATH,
                'BRANCH=' + process.env.WORKTREE_BRANCH,
                'FORCE=' + process.env.WORKTREE_FORCE,
                'SUCCESS=' + process.env.WORKTREE_SUCCESS
              ].join('\\n');
              fs.writeFileSync('${outputFile}', content);
            "`,
            pwd: tempDir
          }
        }
      }))
    })

    it('provides all documented environment variables', async () => {
      const newHookManager = new HookManager(tempDir)
      const context = {
        branch: 'feature/test',
        force: true,
        path: '../test-worktree',
        success: true
      }

      await newHookManager.executeHook('post_add', context)

      const content = readFileSync(outputFile, 'utf8')
      expect(content).toContain(`MAIN=${tempDir}`)
      expect(content).toContain(`ROOT=${tempDir}`)
      expect(content).toContain('PATH=../test-worktree')
      expect(content).toContain(`ABSOLUTE=${resolve(tempDir, '../test-worktree')}`)
      expect(content).toContain('BRANCH=feature/test')
      expect(content).toContain('FORCE=true')
      expect(content).toContain('SUCCESS=true')
    })
  })

  describe('legacy configuration format', () => {
    describe('with single string command at top level', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          pre_add: "echo 'Legacy single command'"
        }))
      })

      it('executes legacy single command format', async () => {
        const newHookManager = new HookManager(tempDir)
        expect(await newHookManager.executeHook('pre_add')).toBe(true)
      })
    })

    describe('with array of commands at top level', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          post_add: [
            "echo 'Legacy command 1'",
            "echo 'Legacy command 2'"
          ]
        }))
      })

      it('executes legacy array format', async () => {
        const newHookManager = new HookManager(tempDir)
        expect(await newHookManager.executeHook('post_add')).toBe(true)
      })
    })

    describe('with hash configuration at top level', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          pre_remove: {
            command: "echo 'Legacy hash command'",
            stop_on_error: false
          }
        }))
      })

      it('executes legacy hash format', async () => {
        const newHookManager = new HookManager(tempDir)
        expect(await newHookManager.executeHook('pre_remove')).toBe(true)
      })
    })
  })

  describe('default working directories', () => {
    let worktreePath: string

    beforeEach(() => {
      worktreePath = join(tempDir, 'test-worktree')
      mkdirSync(worktreePath)
    })

    describe('post_add hook', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: {
            post_add: {
              commands: ['pwd > current_dir.txt']
            }
          }
        }))
      })

      it('executes in worktree directory by default', async () => {
        const newHookManager = new HookManager(tempDir)
        const context = { path: worktreePath }
        await newHookManager.executeHook('post_add', context)

        const pwdFile = join(worktreePath, 'current_dir.txt')
        expect(existsSync(pwdFile)).toBe(true)
        const writtenPath = readFileSync(pwdFile, 'utf8').trim()
        expect(realpathSync(writtenPath)).toBe(realpathSync(worktreePath))
      })
    })

    describe('pre_remove hook', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: {
            pre_remove: {
              commands: ['pwd > current_dir.txt']
            }
          }
        }))
      })

      it('executes in worktree directory by default', async () => {
        const newHookManager = new HookManager(tempDir)
        const context = { path: worktreePath }
        await newHookManager.executeHook('pre_remove', context)

        const pwdFile = join(worktreePath, 'current_dir.txt')
        expect(existsSync(pwdFile)).toBe(true)
        const writtenPath = readFileSync(pwdFile, 'utf8').trim()
        expect(realpathSync(writtenPath)).toBe(realpathSync(worktreePath))
      })
    })

    describe('pre_add hook', () => {
      beforeEach(() => {
        writeFileSync(join(tempDir, '.worktree.yml'), stringify({
          hooks: {
            pre_add: {
              commands: ['pwd > current_dir.txt']
            }
          }
        }))
      })

      it('executes in main repository by default', async () => {
        const newHookManager = new HookManager(tempDir)
        const context = { path: worktreePath }
        await newHookManager.executeHook('pre_add', context)

        const pwdFile = join(tempDir, 'current_dir.txt')
        expect(existsSync(pwdFile)).toBe(true)
        const writtenPath = readFileSync(pwdFile, 'utf8').trim()
        expect(realpathSync(writtenPath)).toBe(realpathSync(tempDir))
      })
    })
  })

  describe('verbose mode', () => {
    it('logs debug messages when verbose is true', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const verboseHookManager = new HookManager(tempDir, { verbose: true })
      
      writeFileSync(join(tempDir, '.worktree.yml'), stringify({
        pre_add: "echo 'test'"
      }))
      
      await verboseHookManager.executeHook('pre_add')
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'))
      consoleLogSpy.mockRestore()
    })

    it('does not log debug messages when verbose is false', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      writeFileSync(join(tempDir, '.worktree.yml'), stringify({
        pre_add: "echo 'test'"
      }))
      
      await hookManager.executeHook('pre_add')
      
      expect(consoleLogSpy).not.toHaveBeenCalled()
      consoleLogSpy.mockRestore()
    })
  })
})