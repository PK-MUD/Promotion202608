import {execFileSync} from 'node:child_process';
import {readdir, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const publicFiles = new Set(['index.html', 'admin/index.html', 'password-login.mjs', 'password-admin.mjs', 'password.css']);
const maxSourceBytes = 256_000;

// Deliberately closed list: new source paths require an explicit review of the policy.
export async function checkSource(root) {
  const git = args => execFileSync('git', args, {cwd: root, maxBuffer: 2_000_000});
  const approved = new Set(JSON.parse(git(['show', ':security/source-files.json']).toString()));
  const entries = git(['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean);
  for (const entry of entries) {
    const [, mode, , stage, name] = entry.match(/^(\d+) ([a-f0-9]+) (\d+)\t(.*)$/s) || [];
    if (!approved.has(name) || !['100644', '100755'].includes(mode) || stage !== '0') throw new Error('Source policy rejects an unapproved path, symlink, submodule or unresolved merge');
    // Read the index, not the worktree: this also protects staged-only content.
    let content;
    try { content = git(['show', `:${name}`]); } catch { throw new Error('Source policy rejects an oversized or unreadable file'); }
    if (content.length > maxSourceBytes || content.includes(0)) throw new Error('Source policy rejects oversized or binary content');
  }
}

export async function checkPublicFiles(root) {
  async function walk(dir, prefix = '') {
    for (const name of await readdir(dir)) {
      const rel = prefix + name;
      const full = path.join(dir, name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error('Publish directory must not contain symlinks');
      if (info.isDirectory()) { await walk(full, rel + '/'); continue; }
      if (!info.isFile() || !publicFiles.has(rel) || info.size > maxSourceBytes) throw new Error('Publish directory contains unapproved or oversized content');
    }
  }
  const publicRoot = path.join(root, 'public');
  if ((await lstat(publicRoot)).isSymbolicLink()) throw new Error('Publish directory must not be a symlink');
  await walk(publicRoot);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await checkSource(path.resolve(here, '../..')); await checkPublicFiles(path.resolve(here, '..')); console.log('Source policy passed'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
