import { Command, Flags } from '@oclif/core'
import { execa } from 'execa'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export default class Init extends Command {
  static override description = `
    Creates a .worktree.yml configuration file in your repository.

    This command copies the example configuration file to your current directory,
    allowing you to customize worktree settings and hooks.
  `
static override examples = [
    '<%= config.bin %> <%= command.id %>         # Create .worktree.yml from example',
    '<%= config.bin %> <%= command.id %> --force # Overwrite existing .worktree.yml',
  ]
static override flags = {
    force: Flags.boolean({
      char: 'f',
      summary: 'Force overwrite existing .worktree.yml',
    }),
  }
static override summary = 'Initialize worktree configuration file'

  async run(): Promise<void> {
    const { flags } = await this.parse(Init)

    // Validate we're in a main repository
    await this.validateMainRepository()

    // Check if .worktree.yml already exists
    const configFile = '.worktree.yml'
    if (existsSync(configFile) && !flags.force) {
      this.error(`${configFile} already exists. Use --force to overwrite.`)
    }

    // Find example file
    const exampleFile = await this.findExampleFile()
    if (!exampleFile) {
      this.error('Could not find .worktree.yml.example file.')
    }

    // Copy example file
    try {
      copyFileSync(exampleFile, configFile)
      this.log(`Created ${configFile} from example.`)
      this.log('Edit this file to customize your worktree configuration.')
    } catch (error) {
      this.error(`Failed to create configuration file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async findExampleFile(): Promise<null | string> {
    // Get the directory of this file
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    // Check in the project root (correct path for both dev and production)
    const projectRoot = join(__dirname, '../..')
    const localExample = join(projectRoot, '.worktree.yml.example')
    if (existsSync(localExample)) {
      return localExample
    }

    // If not found, we'll need to create a default one
    // For now, return null and handle it later
    return null
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

  private async validateMainRepository(): Promise<void> {
    const isMain = await this.isMainRepository()
    if (!isMain) {
      const mainRepoPath = await this.findMainRepositoryPath()
      this.error(
        'This command can only be run from the main Git repository (not from a worktree).\n' +
        (mainRepoPath ? `To enter the main repository, run:\n  cd ${mainRepoPath}` : '')
      )
    }
  }
}