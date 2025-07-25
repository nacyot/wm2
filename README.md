# wm2 - Worktree Manager for Node.js

wm2 is a Node.js port of the Ruby worktree_manager gem. It provides a powerful CLI for managing Git worktrees with ease.

## Installation

```bash
npm install -g wm2
```

## Features

- Create and manage Git worktrees with simple commands
- Configure worktree creation paths
- Pre/post hooks for automation
- Interactive mode for easy worktree selection
- Cross-platform compatibility

## Usage

### Initialize configuration

```bash
wm2 init
```

Creates a `.worktree.yml` configuration file in your repository.

### List worktrees

```bash
wm2 list
```

### Add a new worktree

```bash
# Create worktree with existing branch
wm2 add feature-name

# Create worktree with new branch
wm2 add feature-name -b new-branch

# Track remote branch
wm2 add feature-name -t origin/develop
```

### Navigate to a worktree

```bash
# Interactive selection
wm2 jump

# Jump to specific worktree
wm2 jump feature-name
```

### Remove a worktree

```bash
# Interactive selection
wm2 remove

# Remove specific worktree
wm2 remove feature-name

# Remove all worktrees
wm2 remove --all
```

### Reset worktree to main branch

```bash
# From within a worktree
wm2 reset

# Force reset (discard changes)
wm2 reset --force
```

## Configuration

The `.worktree.yml` file allows you to configure:

- `worktrees_dir`: Directory where worktrees will be created (default: "../")
- `main_branch_name`: Name of your main branch (default: "main")
- `hooks`: Commands to run during worktree operations

### Hook Examples

```yaml
# Simple format
hooks:
  pre_add: "echo 'Creating worktree for $WORKTREE_BRANCH'"
  post_add: "npm install"

# Advanced format with multiple commands
hooks:
  post_add:
    commands:
      - "npm install"
      - "cp .env.example .env"
    pwd: "$WORKTREE_ABSOLUTE_PATH"
    stop_on_error: false
```

## Environment Variables

Hooks have access to the following environment variables:
- `$WORKTREE_PATH` - Worktree path
- `$WORKTREE_BRANCH` - Branch name
- `$WORKTREE_MAIN` - Main repository path
- `$WORKTREE_ABSOLUTE_PATH` - Full path to worktree
- `$WORKTREE_FORCE` - "true" if --force was used

## Requirements

- Node.js 22.17.1 or higher
- Git

## Development Status

This is a port of the Ruby worktree_manager gem to Node.js. All core functionality has been ported and is working. Current test coverage: 77/80 tests passing.

## License

See LICENSE file for details.
