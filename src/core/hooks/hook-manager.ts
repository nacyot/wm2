import { execa, Options as ExecaOptions } from 'execa'
import { load } from 'js-yaml'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type HookType = 'post_add' | 'post_remove' | 'pre_add' | 'pre_remove'

interface HookContext {
  [key: string]: unknown
  branch?: string
  force?: boolean
  path?: string
  success?: boolean
}

interface HookConfig {
  command?: string
  commands?: string[]
  pwd?: string
  stop_on_error?: boolean
}

export class HookManager {
  private static readonly DEFAULT_HOOK_FILES = [
    '.worktree.yml',
    '.git/.worktree.yml',
  ]
  private static readonly HOOK_TYPES: HookType[] = ['pre_add', 'post_add', 'pre_remove', 'post_remove']
private readonly hooks: Record<string, unknown>
  private readonly repositoryPath: string
  private readonly verbose: boolean

  constructor(repositoryPath = '.', options: { verbose?: boolean } = {}) {
    this.repositoryPath = resolve(repositoryPath)
    this.verbose = options.verbose || false
    this.hooks = this.loadHooks()
  }

  async executeHook(hookType: HookType, context: HookContext = {}): Promise<boolean> {
    this.logDebug(`🪝 Starting hook execution: ${hookType}`)

    if (!HookManager.HOOK_TYPES.includes(hookType)) {
      return true
    }

    const hookConfig = this.hooks[hookType]
    if (!hookConfig) {
      return true
    }

    this.logDebug(`📋 Hook configuration: ${JSON.stringify(hookConfig)}`)
    this.logDebug(`🔧 Context: ${JSON.stringify(context)}`)

    let result: boolean
    if (typeof hookConfig === 'string') {
      result = await this.executeCommand(hookConfig, context, hookType)
    } else if (Array.isArray(hookConfig)) {
      result = true
      // Sequential execution is required for hooks
      // eslint-disable-next-line no-await-in-loop
      for (const command of hookConfig) {
        const commandResult = await this.executeCommand(command, context, hookType)
        if (!commandResult) {
          result = false
          break
        }
      }
    } else if (typeof hookConfig === 'object' && hookConfig !== null) {
      result = await this.executeHookHash(hookConfig as HookConfig, context, hookType)
    } else {
      result = true
    }

    this.logDebug(`✅ Hook execution completed: ${hookType} (result: ${result})`)
    return result
  }

  hasHook(hookType: string): boolean {
    return HookManager.HOOK_TYPES.includes(hookType as HookType) &&
      Object.hasOwn(this.hooks, hookType) &&
      this.hooks[hookType] !== null &&
      this.hooks[hookType] !== undefined
  }

  listHooks(): Record<string, unknown> {
    const validHooks: Record<string, unknown> = {}
    for (const type of HookManager.HOOK_TYPES) {
      if (this.hasHook(type)) {
        validHooks[type] = this.hooks[type]
      }
    }

    return validHooks
  }

  private buildEnvVars(context: HookContext): Record<string, string> {
    const env: Record<string, string> = {}

    // Copy basic environment variables
    const basicEnvVars = ['PATH', 'HOME', 'USER', 'SHELL']
    for (const key of basicEnvVars) {
      const value = process.env[key]
      if (value) {
        env[key] = value
      }
    }

    // Default environment variables
    env.WORKTREE_MANAGER_ROOT = this.repositoryPath
    env.WORKTREE_MAIN = this.repositoryPath

    // Context-based environment variables
    for (const [key, value] of Object.entries(context)) {
      const envKey = `WORKTREE_${key.toUpperCase()}`
      env[envKey] = String(value)
    }

    // Add worktree absolute path
    if (context.path) {
      const {path} = context
      const absPath = path.startsWith('/') ? path : resolve(this.repositoryPath, path)
      env.WORKTREE_ABSOLUTE_PATH = absPath
    }

    return env
  }

  private defaultWorkingDirectory(hookType?: HookType, context?: HookContext): string {
    // post_add and pre_remove run in worktree directory by default
    if (hookType && ['post_add', 'pre_remove'].includes(hookType) && context?.path) {
      const {path} = context
      return path.startsWith('/') ? path : resolve(this.repositoryPath, path)
    }

    return this.repositoryPath
  }

  private async executeCommand(
    command: string,
    context: HookContext,
    hookType?: HookType,
    workingDir?: string
  ): Promise<boolean> {
    this.logDebug(`🚀 Executing command: ${command}`)

    const env = this.buildEnvVars(context)
    this.logDebug(`🌍 Environment variables: ${JSON.stringify(Object.entries(env).filter(([k]) => k.startsWith('WORKTREE_')))}`)

    // Determine working directory
    const cwd = workingDir || this.defaultWorkingDirectory(hookType, context)
    this.logDebug(`📂 Working directory: ${cwd}`)

    const startTime = Date.now()

    const options: ExecaOptions = {
      cwd,
      env: { ...process.env, ...env }, // Merge with process.env
      reject: false, // Don't throw on non-zero exit
      shell: true,
      stdio: 'pipe', // Capture output for proper display
    }

    const result = await execa(command, [], options)

    const duration = Date.now() - startTime
    this.logDebug(`⏱️ Execution time: ${duration}ms`)

    // Output stdout and stderr
    if (result.stdout) {
      console.log(result.stdout)
    }

    if (result.stderr) {
      console.error(result.stderr)
    }

    this.logDebug(`Exit code: ${result.exitCode}, Failed: ${result.failed}`)
    
    if (result.failed || result.exitCode !== 0) {
      console.error(`Hook failed: ${command}`)
      this.logDebug(`❌ Command execution failed: exit code ${result.exitCode}`)
      return false
    }

    this.logDebug('✅ Command executed successfully')
    return true
  }

  private async executeHookHash(
    hookConfig: HookConfig,
    context: HookContext,
    hookType: HookType
  ): Promise<boolean> {
    const {commands} = hookConfig
    const singleCommand = hookConfig.command
    let {pwd} = hookConfig
    const stopOnError = hookConfig.stop_on_error !== false // Default true

    // Substitute environment variables in pwd
    if (pwd) {
      pwd = pwd.replaceAll(/\$([A-Z_]+)/g, (match, varName) => {
        if (varName === 'WORKTREE_ABSOLUTE_PATH' && context.path) {
          const {path} = context
          return path.startsWith('/') ? path : resolve(this.repositoryPath, path)
        }

 if (['WORKTREE_MAIN', 'WORKTREE_MANAGER_ROOT'].includes(varName)) {
          return this.repositoryPath
        }

 if (varName.startsWith('WORKTREE_')) {
          const contextKey = varName.slice(9).toLowerCase()
          return String(context[contextKey] || match)
        }
 
          return process.env[varName] || match
        
      })
    }

    if (commands && Array.isArray(commands)) {
      let allSucceeded = true
      // Sequential execution is required for hooks with stop_on_error
      // eslint-disable-next-line no-await-in-loop
      for (const cmd of commands) {
        const result = await this.executeCommand(cmd, context, hookType, pwd)
        if (!result) {
          allSucceeded = false
          if (stopOnError) {
            return false
          }
        }
      }

      return stopOnError ? allSucceeded : true
    }

 if (singleCommand) {
      return this.executeCommand(singleCommand, context, hookType, pwd)
    }

    return true
  }

  private findHookFile(): null | string {
    for (const file of HookManager.DEFAULT_HOOK_FILES) {
      const path = join(this.repositoryPath, file)
      if (existsSync(path)) {
        return path
      }
    }

    return null
  }

  private loadHooks(): Record<string, unknown> {
    const hookFile = this.findHookFile()
    if (!hookFile) {
      return {}
    }

    try {
      const content = readFileSync(hookFile, 'utf8')
      const config = load(content) as Record<string, unknown> || {}
      
      // Support new structure: read configuration under hooks key
      if (config.hooks && typeof config.hooks === 'object') {
        return config.hooks as Record<string, unknown>
      }
      
      // Support top-level keys for backward compatibility
      return config
    } catch (error) {
      console.warn(`Warning: Failed to load hook file ${hookFile}: ${error instanceof Error ? error.message : String(error)}`)
      return {}
    }
  }

  private logDebug(message: string): void {
    if (!this.verbose) return
    
    const timestamp = new Date().toISOString().slice(11, 23)
    console.log(`[${timestamp}] [DEBUG] ${message}`)
  }
}