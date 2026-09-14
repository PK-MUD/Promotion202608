# GD Promotion Dashboard — August 2026

Production website: https://pk-mud-promotion202608.netlify.app/

Administration: https://pk-mud-promotion202608.netlify.app/admin/

The original GitHub Pages addresses now redirect to these pages, preserving query filters. Login uses a shared server-side password; `/admin/` is entered manually. The owner must complete the one-time initial password setup before anyone can log in.

Source, build configuration, and authentication tests are in `production/`. The deployed Netlify project ID is `7544ad6f-b390-4e31-a0a4-83bd3bbe5fcb`. This release was deployed using a source ZIP through Netlify Drop; this repository is a source backup and is not yet linked for automatic Netlify deployment.

## Report scope

1–31 August 2026, 420 shops, 134 promotion codes. Promotion activity only. Net sales THB 17,947,207; quantity is report units/sets rather than receipts or customers. The build checks the reviewed snapshot SHA-256 before packaging.

## Access

Netlify serves the report only after successful authentication. The earlier report and its GitHub commit history were already published publicly and remain public. A new website password cannot revoke old public copies. Do not commit passwords, session tokens, or the local first-setup code.
