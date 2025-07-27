# Release Process

This document describes how to release new versions of wm2.

## Automated Release (Recommended)

We use [changesets](https://github.com/changesets/changesets) for automated releases. This ensures consistent versioning and changelog generation.

### Creating a Release

1. **Make your changes** and commit them to a feature branch
2. **Create a changeset** to describe your changes:
   ```bash
   npm run changeset
   ```
   - Select the type of change (major, minor, patch)
   - Write a summary of your changes (this will appear in the changelog)

3. **Commit the changeset** along with your changes:
   ```bash
   git add .changeset/
   git commit -m "Add changeset"
   ```

4. **Push your branch** and create a pull request

5. **Merge to main** - Once your PR is merged, the release workflow will:
   - Create or update a "Version Packages" PR
   - This PR will accumulate all changesets since the last release
   - When you're ready to release, merge this PR

6. **Automatic publish** - After merging the Version Packages PR:
   - Package version is updated
   - CHANGELOG.md is generated/updated
   - Git tag is created
   - Package is published to npm
   - GitHub release is created

### Release Workflow

The automated release process is handled by `.github/workflows/release.yml`:
- Runs on every push to main
- Uses changesets to manage versions
- Publishes to npm with provenance
- Creates GitHub releases automatically

### NPM Token Setup

For the automated release to work, you need to:
1. Generate an npm token with publish permissions
2. Add it as `NPM_TOKEN` in your GitHub repository secrets

## Manual Release (Legacy)

If you need to do a manual release for any reason:

```bash
# Manual release with the old script
./mise/release.sh --manual [major|minor|patch]
```

This will:
1. Run tests
2. Build the package
3. Update version numbers
4. Create git tag
5. Push to GitHub
6. Optionally publish to npm

## Best Practices

1. **Use changesets for all releases** - This ensures consistent changelog and version management
2. **Write clear changeset summaries** - These become your changelog entries
3. **Batch related changes** - Multiple changesets can be included in one release
4. **Test before releasing** - The CI will run tests, but always verify locally first
5. **Semantic versioning**:
   - `patch`: Bug fixes and minor updates
   - `minor`: New features (backwards compatible)
   - `major`: Breaking changes

## Troubleshooting

### Release PR not created
- Check that changesets were added (`.changeset/*.md` files)
- Verify GitHub Actions are enabled
- Check workflow permissions in repository settings

### NPM publish fails
- Verify NPM_TOKEN is set in GitHub secrets
- Check npm account has publish permissions
- Ensure package name is available

### Manual release needed
- Use `./mise/release.sh --manual` as a fallback
- Consider why automation failed and fix for next time