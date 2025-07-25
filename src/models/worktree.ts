/**
 * Represents a Git worktree
 */
export interface WorktreeOptions {
  bare?: boolean
  detached?: boolean
}

export class Worktree {
  public readonly bare: boolean
  public readonly detached: boolean

  constructor(
    public readonly path: string,
    public readonly branch: null | string,
    public readonly head: string,
    options: WorktreeOptions = {},
  ) {
    this.detached = options.detached ?? false
    this.bare = options.bare ?? false
  }


  /**
   * Check if this is the main worktree
   * The main worktree has no branch (null) and is not detached
   */
  isMain(): boolean {
    return this.branch === null && !this.detached && !this.bare
  }

  /**
   * Convert to plain object
   */
  toObject(): Record<string, unknown> {
    return {
      bare: this.bare,
      branch: this.branch,
      detached: this.detached,
      head: this.head,
      path: this.path,
    }
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    if (this.bare) {
      return `${this.path} (bare)`
    }
    
    const branch = this.branch || 'HEAD (detached)'
    return `${this.path} ${this.head} [${branch}]`
  }
}
