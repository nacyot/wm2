import { relative, resolve } from 'node:path'

export function toRelativePath(absolutePath: string, basePath?: string): string {
  const base = basePath || process.cwd()
  const resolvedPath = resolve(absolutePath)
  const relativePath = relative(base, resolvedPath)
  
  // If the relative path is empty (same directory), return '.'
  if (!relativePath) {
    return '.'
  }
  
  // If the relative path starts with '..', it means the path is outside
  // the current directory. In this case, we might want to show it differently
  // but for now, we'll just return the relative path
  return relativePath
}

export function formatPathForDisplay(absolutePath: string): string {
  return toRelativePath(absolutePath)
}