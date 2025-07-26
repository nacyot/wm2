import { platform } from 'node:os'

/**
 * Cross-platform shell commands for testing
 */

/**
 * Get the command to print current working directory
 */
export function getPwdCommand(): string {
  return platform() === 'win32' ? 'cd' : 'pwd'
}

/**
 * Get the command to write current working directory to a file
 */
export function getWritePwdCommand(filename: string): string {
  const pwdCmd = getPwdCommand()
  return `${pwdCmd} > ${filename}`
}

/**
 * Get the command to echo text
 */
export function getEchoCommand(text: string): string {
  // On Windows, echo behavior with quotes can differ
  // Using double quotes for consistency
  return `echo "${text}"`
}

/**
 * Get the command to exit with a specific code
 */
export function getExitCommand(code: number): string {
  return `exit ${code}`
}

/**
 * Get shell-specific file write command
 */
export function getWriteFileCommand(filename: string, content: string): string {
  if (platform() === 'win32') {
    // Windows: Use echo with output redirection
    return `echo ${content} > ${filename}`
  }
  // Unix: Use echo with output redirection
  return `echo "${content}" > ${filename}`
}