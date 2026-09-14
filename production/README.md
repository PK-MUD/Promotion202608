# GD Promotion production access

Netlify hosts the password-only login at `/` and the separate password administration page at `/admin/`. Login does not link to administration.

`npm test` checks authentication, cross-browser sessions, logout, password rotation, rate limits, initial setup, expiration, and failure handling. `npm run build` downloads the pinned, checksum-verified August report and compresses it into the function bundle. Only `public/` is published as static assets; `/dashboard` is served by the authenticated function.

Netlify Blobs stores salted scrypt password records, versioned sessions, and rate-limit counters with strong consistency. Conditional writes protect against simultaneous setup/password changes. Cookies are Secure, HttpOnly, SameSite=Strict and expire after eight hours. Password changes invalidate all earlier sessions. No plaintext password or bearer token is committed.

For the first `/admin/` setup, the owner uses the one-time code saved locally outside this folder as `admin-first-setup.txt`. The deployment contains only its SHA-256 digest. Once configured, that code cannot set or reset the password. Subsequent changes require the current dashboard password, matching the reviewed shared-password workflow. Anyone given that shared password can also change it through `/admin/`.

This protects the Netlify website. The earlier report was intentionally published in the public GitHub repository; its previously published copies and commit history remain public. A site login cannot revoke those copies.

Never publish the project root or `private/` as the static directory. Never upload the local first-setup code. Do not use real production credentials in tests.
