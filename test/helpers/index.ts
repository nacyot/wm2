import { execa } from 'execa'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface TestRepository {
  cleanup: () => Promise<void>
  path: string
}

/**
 * Creates a temporary directory for testing
 */
export async function createTempDir(): Promise<string> {
  const tempPath = join(tmpdir(), `wm2-test-${randomBytes(8).toString('hex')}`)
  await mkdir(tempPath, { recursive: true })
  return tempPath
}

/**
 * Creates a test Git repository with initial commit
 */
export async function createTestRepository(): Promise<TestRepository> {
  const repoPath = await createTempDir()
  
  // Initialize git repository
  await execa('git', ['init'], { cwd: repoPath })
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath })
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: repoPath })
  
  // Create initial commit
  await writeFile(join(repoPath, 'README.md'), '# Test Repository')
  await execa('git', ['add', '.'], { cwd: repoPath })
  await execa('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath })
  
  return {
    async cleanup() {
      if (existsSync(repoPath)) {
        await rm(repoPath, { force: true, recursive: true })
      }
    },
    path: repoPath
  }
}

/**
 * Creates a test repository with a worktree
 */
export async function createTestRepositoryWithWorktree(worktreeName: string): Promise<TestRepository> {
  const repo = await createTestRepository()
  
  // Create a new branch and worktree
  const worktreePath = join(repo.path, '..', worktreeName)
  await execa('git', ['worktree', 'add', worktreePath, '-b', worktreeName], { cwd: repo.path })
  
  return {
    async cleanup() {
      // Remove worktree first
      await execa('git', ['worktree', 'remove', worktreePath, '--force'], { cwd: repo.path }).catch(() => {})
      await repo.cleanup()
    },
    path: repo.path
  }
}

/**
 * Creates a configuration file in the repository
 */
export async function createConfigFile(repoPath: string, config: Record<string, unknown>): Promise<void> {
  const yaml = await import('yaml')
  const configPath = join(repoPath, '.worktree.yml')
  const configContent = yaml.stringify(config)
  await writeFile(configPath, configContent)
}

/**
 * Runs a wm2 command for testing
 */
export async function runWm2Command(args: string[], options: { cwd?: string } = {}): Promise<{
  exitCode: number | undefined
  stderr: string
  stdout: string
}> {
  try {
    const result = await execa('node', [join(process.cwd(), 'bin/dev.js'), ...args], {
      cwd: options.cwd || process.cwd(),
      reject: false,
    })
    return {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    }
  } catch (error) {
    const execaError = error as { exitCode?: number; stderr?: string; stdout?: string }
    return {
      exitCode: execaError.exitCode,
      stderr: execaError.stderr || '',
      stdout: execaError.stdout || '',
    }
  }
}

/**
 * Mocks Git command execution for unit tests
 */
export function mockGitCommand(_command: string, _args: string[], _output: string): void {
  // This will be implemented when we set up mocking
  // For now, it's a placeholder
}