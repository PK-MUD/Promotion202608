# Private report migration and deployment runbook

## Scope and current state

This change replaces the public raw download with an explicit private input. It does not deploy, change Netlify credentials/Blobs, rotate passwords, connect continuous deployment, change GitHub visibility, or rewrite history. The reviewed `report-manifest.json` remains unchanged. Both SHA-256 and exact byte length must match; no automatic hash update or public fallback exists.

Verified in the source at baseline `86199ea`: only login/admin assets are in `public/`; the report is bundled at `private/dashboard.html.gz` and read by the authenticated `/dashboard` function. Root `netlify.toml` has base `production`; the config inside `production/` supports building that directory as a standalone source package. Both retain the same command, publish directory, function path and included file. Netlify account configuration and the live deploy were not inspected or modified during this change. README records a previous Source ZIP deployment and no Git connection; confirm these account settings before rollout.

## 1. Prepare the approved private source

Use one of the following modes. Do not set both. Never put report bytes or tokens in this source repository, its issues, PR attachments, logs, workflow artifacts or source ZIPs.

### Local/manual build

Place the approved HTML on an access-controlled local disk or private volume **outside the entire source checkout**. Set `REPORT_FILE` to its absolute path in the build process environment. Symlinks back into the checkout are rejected. The private filesystem's ACL/encryption controls access; the build cannot verify those ACLs. Obtain the approved file through the organization's private channel. Retain a controlled backup.

From `production/`:

```sh
npm install
npm test
REPORT_FILE=/absolute/private-volume/approved-dashboard.html npm run build
```

PowerShell equivalent for the source setting: `$env:REPORT_FILE = 'D:\PrivateReports\approved-dashboard.html'` before `npm run build`. Do not put it under the source checkout. Environment values are not loaded automatically from `.env` by this script.

### Netlify/cloud build from a separate Private GitHub repository

Create/select a separate report repository that is already **Private before upload**. Do not use this dashboard source repository as the data store. Upload only through an approved channel and pin the immutable commit containing the reviewed bytes. Configure these values in Netlify UI/API environment settings (not `netlify.toml`):

| Variable | Value |
| --- | --- |
| `REPORT_GITHUB_REPOSITORY` | Private data repository in `owner/name` form |
| `REPORT_GITHUB_COMMIT` | Full 40-character lowercase commit SHA |
| `REPORT_GITHUB_PATH` | Relative HTML path at that commit |
| `REPORT_GITHUB_TOKEN` | Secret, read-only token restricted to that data repository |

Prefer a short-lived GitHub App installation token if the runner can provision it; otherwise use an expiring fine-grained PAT with **Contents: read-only** and required metadata access. Scope Netlify secrets to **Builds** and the intended deployment context. Never make this token available to arbitrary PR builds or public forks. Keep the token out of function/runtime scope. The build checks repository privacy via GitHub API, then downloads using authenticated `application/vnd.github.raw+json`; it rejects redirects, HTTP failures, mutable branch refs and mismatched bytes/hash. Fetch errors are sanitized and never print URLs, response bodies or tokens.

Provision/renew an App token immediately before each build; storing an expiring installation token as a long-term Netlify variable is not sufficient. Failed/expired credentials stop the build. A private repository protects new access, but does not make the legacy report confidential again.

Approval is still the reviewed manifest in source control. Updating the report requires independent owner review of the file and a PR changing the manifest hash and byte count; do not compute and accept a new manifest automatically from downloaded bytes.

## 2. Validate before any Production change

1. Run `npm test --prefix production` and `node production/scripts/check-source.mjs` from the Git checkout. Tests use synthetic data, mocked HTTP and temporary directories; they need no credentials or private report.
2. Build with the actual approved private file/token and verify the gzip can be decompressed to the manifest's exact SHA-256 and length. Missing inputs intentionally fail; never replace the hash merely to make a build pass.
3. Install the required function dependencies, then use a **separate staging Netlify project**, separate Netlify Blobs data and separate setup credentials for the integration test. Do not initialize or rotate `/admin/` against Production. Draft/preview URLs are not private just because they are unlisted. Apply access protection before using real report data.
4. Using the reviewed Netlify CLI version, explicitly run `netlify build` with the correct source environment and config, then a draft `netlify deploy --dir=public --functions=netlify/functions` from `production/`, targeting the staging project. Confirm CLI version/help and linked site ID before executing; do not use `--prod` for this test. If the CLI rebuilds during deploy, keep the same private source environment available.
5. Verify anonymous `/dashboard` redirects to login; `/private/dashboard.html.gz` and direct static report paths do not serve report bytes; login serves the correct report; logout/expired sessions/password rotation deny access. Confirm only the five allowlisted login/admin assets are static and the report is included only in the function bundle. Exercise the function in Netlify, not just local tests, to confirm runtime file resolution and packaging.
6. Record staging deploy ID, code commit, manifest hash and verification results. No report contents or token values in the record. Only after these checks should the owner schedule a Production publish.

Netlify functions still bundle the report; anyone with access to deployment artifacts/admin APIs may be able to retrieve it. Build logs, function bundles, build caches and downloaded deploy ZIPs must have restricted access. Authorized dashboard viewers can still save the report.

## 3. Effect on each deployment path

| Path | Effect |
| --- | --- |
| Already published Production snapshot | No change from committing or merging this code while Git CD remains disconnected. The existing function bundle already contains the report. Confirm no other deploy automation exists. |
| Local Netlify CLI build/deploy | `REPORT_FILE` works because the private file is on that runner; also supports Private GitHub mode. Publish only `public`, bundle `netlify/functions` and its included private file. |
| Source ZIP / Netlify Drop with server-side build | A local `REPORT_FILE` on your PC is inaccessible to Netlify. Configure Private GitHub variables in the target site **before** its server-side build; verify that this upload path actually executes the build and bundles Functions. Do not add the report/token to the ZIP to work around missing inputs. |
| Static drag-and-drop/API ZIP of built assets | Do not use static-only upload for this authenticated application: `public/` alone does not provide the access Function. Use the tested function-aware CLI workflow. |
| Future Git-linked builds | Existing root config applies `base = production`. Configure private input first and keep Production publishing disabled until staging is verified. Restrict GitHub App access, review build author permissions, and disable untrusted previews/branch builds or withhold all report secrets. |
| Build missing file/token or wrong hash | Exits nonzero and removes old local report output. Netlify's failed build does not replace the currently published site. |

Manual deployment modes differ: ordinary prebuilt uploads do not run build commands, while logged-in source uploads can trigger a build. Do not assume the historical Drop process is reproducible without testing on staging. The code must never be deployed by uploading the source root or `private/` as static files.

## 4. Prevent report commits

- Root and production ignore rules cover private input/output, credentials, archives and common report formats.
- Enable the versioned local pre-commit check once per clone: `git config core.hooksPath .githooks`.
- `security/source-files.json` is a closed list of permitted source paths. The check reads the **Git index**, rejects new paths, symlinks, submodules, binary files and files over 256 KB. This blocks the historical 15.5 MB report even if renamed to an allowed file. Any new source path requires explicit policy review.
- Build also checks the actual `public/` tree (including untracked files), rejecting extra files, symlinks or oversized files. It writes only the verified gzip outside `public/`.
- The `Validate source and tests / validate` GitHub Actions job needs no report secrets and uploads no artifacts. Make this a required check, require PR review, restrict direct/force pushes, and protect changes to `.githooks/`, `.github/`, `security/`, `production/build.mjs`, the manifest and both Netlify configs with an assigned owner/reviewer.
- CI runs **after push**, so it cannot prevent data from first reaching a public branch. Gitignore/hooks can also be bypassed. These are accidental-leak guardrails, not DLP: small data pasted into an allowed text file, encoded fragments or a malicious policy change still require review. A Private source repository and access controls are the primary containment measures.

## 5. Restrict the source repository safely

1. Prepare and back up the approved report privately; prove a build no longer needs any public URL using both synthetic tests and a private-source staging build.
2. Review users/teams/apps, deploy keys, Actions permissions/secrets, Pages, releases, artifacts, forks and any other consumer of the repository. Check plan-dependent GitHub Pages behavior (a public-to-private change on GitHub Free can unpublish Pages); if a custom domain exists, review DNS before changing visibility. Record the current live Netlify deployment and confirm Git auto-deployment is still disconnected. Neither code publication nor this runbook authorizes deleting those resources.
3. After staging passes, have the owner change `PK-MUD/Promotion202608` visibility to Private and reduce collaborator access to the minimum needed. Do not simultaneously enable auto-deployment. Existing published Netlify output is a separate snapshot; future **old** builds that still use public Raw URLs can fail, so retain the tested new private build path.
4. If continuous deployment is later wanted, connect the Private source repository with narrowly scoped Netlify GitHub App access, set private report build variables, restrict build contexts and test with publishing controlled before enabling it.
5. Audit and explicitly decide which legacy GitHub Pages/releases/artifacts/old Netlify deploy URLs should be disabled or removed. If rewriting Git history is needed, coordinate backup and all clones/forks first; do not force-push or rewrite as part of this build change.

## 6. Historical exposure — not reversible by this change

The old report and Git history were public. Making the repository Private restricts future access through that repository; removing paths on the new branch does not erase old commits. Public forks, clones, caches, screenshots and downloads may remain outside the owner's control. Netlify login, SHA-256 verification and private builds cannot revoke those copies. Do not claim the previously published data is now confidential or deleted. Assess the historic exposure separately with the data owner, and rotate any actual credentials found to have been exposed (no evidence of such credentials is asserted here).

## References

- https://docs.github.com/en/rest/repos/contents#get-repository-content
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
- https://docs.netlify.com/build/configure-builds/environment-variables/
- https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/
- https://docs.netlify.com/manage/projects/add-new-project/
- https://docs.netlify.com/deploy/create-deploys/

## Validation record for this change

Local validation: 25/25 Node test cases passed on Node 24.19.0, including the existing authentication suite; source policy and `git diff --cached --check` passed. The exact snapshot from the existing local Git history was temporarily extracted outside the checkout, built with `REPORT_FILE` without network access, and gunzipped back to the unchanged manifest hash and byte count. Compressed size was 1,458,627 bytes, below the unchanged 4,000,000-byte function budget. Temporary input and generated output were removed after verification. CI targets Node 22 to match Netlify. Remote Private GitHub tests use mocked HTTP; no private store credentials were provided. Netlify account configuration, cloud bundling and live access checks remain staging gates, not claimed as completed.
