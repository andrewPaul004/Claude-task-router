# Releasing

This project uses [Semantic Versioning](https://semver.org/). Releases are cut
from `main` and published to npm with provenance.

## Prerequisites (one-time)

- npm publish access to the `claude-task-router` package.
- Recommended: **npm Trusted Publishing** (OIDC) configured for this GitHub
  repository, so no long-lived npm token is stored. Alternatively, add an
  `NPM_TOKEN` repository secret with publish rights.
- Confirm `package.json` `repository`, `bugs`, `homepage`, and `author` are
  correct for your fork/organization.

## Release checklist

1. **Ensure the tree is green.**

   ```bash
   npm ci
   npm run check          # format:check + lint + typecheck + test
   npm run package:check  # build + npm pack --dry-run (verify contents)
   npm run eval           # routing quality gate
   ```

2. **Bump the version.** Choose patch/minor/major:

   ```bash
   npm version minor      # updates package.json and creates a git tag vX.Y.Z
   ```

   (Use `--no-git-tag-version` if you prefer to tag manually.)

3. **Update the changelog.** Move items from `Unreleased` into the new version
   section with today's date, and update the compare links at the bottom.

4. **Bump the config schema version if needed.** If the config shape changed,
   increment `CURRENT_CONFIG_SCHEMA_VERSION` in `src/config/schema.ts` and add a
   migration step in `src/migrations/index.ts` (with a test).

5. **Commit and push the tag.**

   ```bash
   git push origin main --follow-tags
   ```

6. **Publish.** Either:
   - **Automated:** push the `vX.Y.Z` tag; the release workflow
     (`.github/workflows/release.yml`) runs validation, builds, creates a
     GitHub release, and publishes to npm (only when secrets/OIDC are
     configured and the tag is pushed).
   - **Manual:**

     ```bash
     npm publish --provenance --access public
     ```

7. **Verify.**

   ```bash
   npm view claude-task-router version
   npm install -g claude-task-router@latest
   claude-task-router doctor
   ```

## Rollback

- If a bad version was published, deprecate it and publish a fixed patch:

  ```bash
  npm deprecate claude-task-router@X.Y.Z "Broken release; use X.Y.(Z+1)"
  ```

- Prefer publishing a fix over unpublishing. Unpublish is only possible within
  npm's narrow time window and is disruptive to consumers.

## Deprecation

- Deprecate a version or range with `npm deprecate` and a clear message that
  points users to the recommended version.

## Configuration migrations

- Every persisted config carries a `schemaVersion`. On load, older configs are
  migrated up step-by-step (see `src/migrations`). Always add a migration + test
  when the schema changes, and note it in the changelog and migration notes.
- `claude-task-router update` runs migrations on the user and project configs
  (backing up first) and prints the package upgrade command.
