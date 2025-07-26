import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Normalize path for cross-platform comparison
 * - Resolves relative segments
 * - Converts to forward slashes
 * - Handles case-insensitive drive letters on Windows
 */
export function normalizePath(p: string): string {
  const absolute = resolve(p)
  const real = existsSync(absolute)
    ? realpathSync.native(absolute)
    : absolute
  return real.replace(/\\/g, '/')
}

/**
 * Safe wrapper for realpathSync that falls back to resolve on ENOENT
 */
export function safeRealpath(p: string): string {
  try {
    return realpathSync.native(p)
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return resolve(p)
    }
    throw error
  }
}

/**
 * Compare paths in a cross-platform way
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePath(path1) === normalizePath(path2)
}