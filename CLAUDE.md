# strudel

GitHub mirror of <https://codeberg.org/uzu/strudel>.

## Upstream Sync

`.github/workflows/sync-upstream.yml` runs daily (06:00 UTC) and on manual dispatch.

- Fetches `main` and tags from Codeberg
- Opens a PR (`upstream-sync` -> `main`) if there are new commits
- Auto-merges the PR if there are no conflicts; otherwise leaves it open for manual resolution
