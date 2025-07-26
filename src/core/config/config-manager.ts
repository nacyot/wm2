import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

export class ConfigManager {
  private static readonly DEFAULT_CONFIG_FILES = [
    '.worktree.yml',
    '.git/.worktree.yml',
  ]
private static readonly DEFAULT_MAIN_BRANCH_NAME = 'main'
  private static readonly DEFAULT_WORKTREES_DIR = '../'
private readonly config: Record<string, unknown>
  private readonly repositoryPath: string

  constructor(repositoryPath = '.') {
    this.repositoryPath = resolve(repositoryPath)
    this.config = this.loadConfig()
  }

  get hooks(): Record<string, unknown> {
    return (this.config.hooks as Record<string, unknown>) || {}
  }

  get mainBranchName(): string {
    return (this.config.main_branch_name as string) || ConfigManager.DEFAULT_MAIN_BRANCH_NAME
  }

  get worktreesDir(): string {
    return (this.config.worktrees_dir as string) || ConfigManager.DEFAULT_WORKTREES_DIR
  }

  resolveWorktreePath(nameOrPath: string): string {
    // If it's an absolute path, return as is
    if (nameOrPath.startsWith('/') || (process.platform === 'win32' && /^[A-Za-z]:/.test(nameOrPath))) {
      return nameOrPath
    }

    // If it contains a path separator, treat it as a relative path
    if (nameOrPath.includes('/') || (process.platform === 'win32' && nameOrPath.includes('\\'))) {
      return resolve(this.repositoryPath, nameOrPath)
    }

    // Otherwise, use worktrees_dir as the base
    const baseDir = resolve(this.repositoryPath, this.worktreesDir)
    return join(baseDir, nameOrPath)
  }

  private findConfigFile(): null | string {
    for (const file of ConfigManager.DEFAULT_CONFIG_FILES) {
      const path = join(this.repositoryPath, file)
      if (existsSync(path)) {
        return path
      }
    }

    return null
  }

  private loadConfig(): Record<string, unknown> {
    const configFile = this.findConfigFile()
    if (!configFile) {
      return {}
    }

    try {
      const content = readFileSync(configFile, 'utf8')
      return (parse(content) as Record<string, unknown>) || {}
    } catch (error) {
      console.warn(`Warning: Failed to load config file ${configFile}: ${error instanceof Error ? error.message : String(error)}`)
      return {}
    }
  }
}
