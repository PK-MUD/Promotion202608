# GD Promotion production access

Netlify hosts the password-only login at `/` and the separate password administration page at `/admin/`. Login does not link to administration.

`npm test` checks authentication, cross-browser sessions, logout, password rotation, rate limits, initial setup, expiration, and failure handling. `npm run build` requires an approved external `REPORT_FILE` or an authenticated, commit-pinned Private GitHub source. It checks exact byte length and SHA-256 before compressing into the function bundle; no public download fallback exists. Only `public/` is published as static assets; `/dashboard` is served by the authenticated function.

Netlify Blobs stores salted scrypt password records, versioned sessions, and rate-limit counters with strong consistency. Conditional writes protect against simultaneous setup/password changes. Cookies are Secure, HttpOnly, SameSite=Strict and expire after eight hours. Password changes invalidate all earlier sessions. No plaintext password or bearer token is committed.

For the first `/admin/` setup, the owner uses the one-time code saved locally outside this folder as `admin-first-setup.txt`. The deployment contains only its SHA-256 digest. Once configured, that code cannot set or reset the password. Subsequent changes require the current dashboard password, matching the reviewed shared-password workflow. Anyone given that shared password can also change it through `/admin/`.

This protects the Netlify website. The earlier report was intentionally published in the public GitHub repository; its previously published copies and commit history remain public. A site login cannot revoke those copies.

Never publish the project root or `private/` as the static directory. Never upload the local first-setup code. Do not use real production credentials in tests.

## Private report build and rollout

See [PRIVATE_REPORT_DEPLOY.md](PRIVATE_REPORT_DEPLOY.md) for source configuration, staging checks, Source ZIP/CLI/Git deploy differences, repository access changes and historical-publication limits. No report or token belongs in this source tree. Enable the local guard with `git config core.hooksPath .githooks` from the repository root. CI checks synthetic tests and the staged source policy without report credentials.
