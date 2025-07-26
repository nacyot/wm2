# wm2

A Node.js port of the Ruby worktree_manager gem. wm2 provides a simple and intuitive interface for creating, managing, and removing Git worktrees with built-in hook support.

## Features

- **Easy worktree management**: Create, list, and remove Git worktrees
- **Branch operations**: Create new branches or checkout existing ones
- **Hook system**: Execute custom scripts before/after worktree operations
- **Conflict detection**: Automatic validation to prevent path and branch conflicts
- **CLI interface**: Simple command-line tool for quick operations
- **Configuration initialization**: Easy setup with `wm2 init` command
- **Branch reset**: Reset worktree branches to origin/main with `wm2 reset`
- **Interactive mode**: Jump between worktrees and remove with interactive selection
- **Cross-platform**: Works on macOS, Linux, and Windows

## Installation

Install wm2 globally using npm:

```bash
npm install -g wm2
```

Or using yarn:

```bash
yarn global add wm2
```

## Usage

### Command Line Interface

wm2 provides a CLI tool for managing worktrees:

```bash
# Show version
wm2 version

# Initialize configuration file
wm2 init

# List all worktrees
wm2 list

# Create a new worktree using just a name (uses worktrees_dir)
wm2 add feature-branch

# Create a worktree with a relative path
wm2 add ../feature-branch

# Create a worktree with an absolute path
wm2 add /path/to/feature-branch

# Create a worktree with an existing branch
wm2 add feature-branch existing-branch

# Create a worktree with a new branch
wm2 add feature-branch -b new-feature-branch

# Remove a worktree using just a name
wm2 remove feature-branch

# Remove a worktree with a path
wm2 remove ../feature-branch

# Remove all worktrees (interactive confirmation)
wm2 remove --all

# Force operations (bypass safety checks)
wm2 add existing-dir -f
wm2 remove worktree-with-changes -f

# Track remote branches
wm2 add pr-154 -t origin/pr-154        # Create local pr-154 tracking origin/pr-154
wm2 add pr-154 origin/pr-154           # Auto-detect remote branch
wm2 add hotfix -t upstream/hotfix-123  # Track from different remote

# Reset worktree branch to origin/main (must be run from worktree)
wm2 reset                              # Reset current branch to origin/main
wm2 reset -f                           # Force reset (discard uncommitted changes)

# Jump between worktrees (interactive)
wm2 jump

# Remove worktrees interactively
wm2 remove

# Get help for any command
wm2 --help                             # Show all commands
wm2 add --help                         # Show help for add command
wm2 remove -h                          # Short help flag also works
```

#### Working with Remote Branches

wm2 makes it easy to work with remote branches:

```bash
# Method 1: Using --track (-t) option
wm2 add pr-154 -t origin/pr-154
# This will:
# 1. Fetch origin/pr-154
# 2. Create a new local branch 'pr-154' tracking 'origin/pr-154'
# 3. Create worktree at '../worktrees/pr-154' (or configured location)

# Method 2: Auto-detection
wm2 add pr-154 origin/pr-154
# If the second argument contains '/', it's treated as a remote branch
# Creates local 'pr-154' tracking 'origin/pr-154'

# Different remote names
wm2 add hotfix -t upstream/hotfix-123  # Track from 'upstream' remote
wm2 add feature -t fork/feature        # Track from 'fork' remote
```

#### Interactive Mode

wm2 provides interactive commands for better user experience:

```bash
# Jump between worktrees interactively
wm2 jump
# Shows a list of all worktrees with their branches
# Select one to jump to it

# Remove worktrees interactively
wm2 remove
# Shows a list of worktrees
# Select one or more to remove
# Confirms before removing

# Remove all worktrees with confirmation
wm2 remove --all
# Lists all worktrees that will be removed
# Asks for confirmation
# Option to force remove if some have uncommitted changes
```

### Configuration

After running `wm2 init`, a `.worktree.yml` file is created in your repository root:

```yaml
worktrees_dir: ../worktrees
```

This specifies the default directory where worktrees will be created when using just a name.

### Hook System

wm2 supports hooks for custom automation. Hooks are defined in `.worktree.yml`:

```yaml
worktrees_dir: ../worktrees

# Simple string command
pre_add: echo "Creating worktree..."
post_add: echo "Worktree created!"

# Array of commands
pre_remove:
  - echo "Removing worktree..."
  - ./scripts/cleanup.sh

# Advanced configuration with options
hooks:
  post_add:
    commands:
      - npm install
      - npm run build
    pwd: $WORKTREE_ABSOLUTE_PATH
    stop_on_error: true
```

Available hooks:
- `pre_add`: Run before creating a worktree
- `post_add`: Run after creating a worktree
- `pre_remove`: Run before removing a worktree
- `post_remove`: Run after removing a worktree

Environment variables available in hooks:
- `WORKTREE_BRANCH`: Branch name
- `WORKTREE_PATH`: Relative path to worktree
- `WORKTREE_ABSOLUTE_PATH`: Absolute path to worktree
- `WORKTREE_MAIN`: Path to main repository
- `WORKTREE_MANAGER_ROOT`: Repository root directory

### Programmatic Usage

You can also use wm2 programmatically in your Node.js applications:

```javascript
import { Manager, ConfigManager } from 'wm2';

// Initialize manager
const manager = new Manager('/path/to/repo');

// List worktrees
const worktrees = await manager.list();
console.log(worktrees);

// Add a worktree
await manager.add('/path/to/new-worktree', { branch: 'feature-branch' });

// Remove a worktree
await manager.remove('/path/to/worktree');

// Work with configuration
const config = new ConfigManager('/path/to/repo');
const worktreesDir = config.getWorktreesDir();
```

## Requirements

- Node.js 22.17.1 or higher
- Git 2.5.0 or higher (for worktree support)

## Development

```bash
# Clone the repository
git clone https://github.com/nacyot/wm2.git
cd wm2

# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint

# Build the project
npm run build
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Credits

wm2 is a Node.js port of the Ruby [worktree_manager](https://github.com/nacyot/worktree_manager) gem.
