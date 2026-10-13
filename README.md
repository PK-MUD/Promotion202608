# GD Promotion Dashboard — August 2026

Production website: https://pk-mud-promotion202608.netlify.app/

Administration: https://pk-mud-promotion202608.netlify.app/admin/

The original GitHub Pages addresses now redirect to these pages, preserving query filters. Login uses a shared server-side password; `/admin/` is entered manually. The owner must complete the one-time initial password setup before anyone can log in.

Source, build configuration, and authentication tests are in `production/`. The deployed Netlify project ID is `7544ad6f-b390-4e31-a0a4-83bd3bbe5fcb`. This release was deployed using a source ZIP through Netlify Drop; this repository is a source backup and is not yet linked for automatic Netlify deployment.

## Report scope

August 2026 promotion report. The approved manifest pins the exact SHA-256 and byte count; report contents and business totals are intentionally not repeated in source documentation. See [private build and safe rollout instructions](production/PRIVATE_REPORT_DEPLOY.md).

## Access

Netlify serves the report only after successful authentication. The earlier report and its GitHub commit history were already published publicly and remain public. A new website password cannot revoke old public copies. Do not commit passwords, session tokens, or the local first-setup code.

## Development safeguards

Run `npm test --prefix production` and `node production/scripts/check-source.mjs`. Enable the local staged-file check with `git config core.hooksPath .githooks`. New source paths require review in `security/source-files.json`. These checks do not erase Git history or replace repository access controls.
