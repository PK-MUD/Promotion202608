import {mkdir, readFile, writeFile, rm, rename, realpath, stat, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkPublicFiles} from './scripts/check-source.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const githubKeys = ['REPORT_GITHUB_REPOSITORY', 'REPORT_GITHUB_COMMIT', 'REPORT_GITHUB_PATH', 'REPORT_GITHUB_TOKEN'];
const maxBytes = 50_000_000;
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };

export function validateManifest(manifest) {
  if (!manifest || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.bytes > maxBytes) {
    throw new Error('Invalid approved report manifest');
  }
  return manifest;
}

export async function loadReport(env, manifest, {fetchImpl = fetch, sourceRoot = path.resolve(here, '..')} = {}) {
  const local = Boolean(env.REPORT_FILE);
  const remote = githubKeys.some(key => Boolean(env[key]));
  if (local === remote) throw new Error('Configure exactly one report source: REPORT_FILE or private GitHub settings');
  if (local) {
    if (!path.isAbsolute(env.REPORT_FILE)) throw new Error('REPORT_FILE must be an absolute path outside the source repository');
    let file, root, info;
    try { file = await realpath(env.REPORT_FILE); root = await realpath(sourceRoot); info = await stat(file); }
    catch { throw new Error('Approved report file is missing or unreadable'); }
    if (inside(root, file)) throw new Error('Approved report must be outside the source repository');
    if (!info.isFile() || info.size !== manifest.bytes) throw new Error('Approved report byte length mismatch or not a regular file');
    try { return await readFile(file); } catch { throw new Error('Approved report file is unreadable'); }
  }
  if (githubKeys.some(key => !env[key])) throw new Error('Private GitHub report settings are incomplete');
  const repo = env.REPORT_GITHUB_REPOSITORY;
  const commit = env.REPORT_GITHUB_COMMIT;
  const file = env.REPORT_GITHUB_PATH;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || repo.split('/').some(p => p === '.' || p === '..') || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Private GitHub source requires owner/repository and a full commit SHA');
  if (file.split('/').some(p => !p || p === '.' || p === '..') || /[\\\x00-\x1f]/.test(file)) throw new Error('Invalid private report path');
  const headers = {Authorization: `Bearer ${env.REPORT_GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28'};
  async function request(url, accept) {
    try {
      const response = await fetchImpl(url, {headers: {...headers, Accept: accept}, redirect: 'error', signal: AbortSignal.timeout(60_000)});
      if (!response.ok) throw new Error();
      return response;
    } catch { throw new Error('Private GitHub report request failed; check access, pinned commit and file'); }
  }
  const base = `https://api.github.com/repos/${repo}`;
  let metadata;
  try { metadata = await (await request(base, 'application/vnd.github+json')).json(); }
  catch { throw new Error('Cannot verify private report repository'); }
  if (metadata.private !== true) throw new Error('Report repository must be private');
  const response = await request(`${base}/contents/${file.split('/').map(encodeURIComponent).join('/')}?ref=${commit}`, 'application/vnd.github.raw+json');
  const chunks = []; let length = 0;
  try {
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > manifest.bytes) throw new Error();
      chunks.push(chunk);
    }
  } catch { throw new Error('Private report download incomplete or exceeds approved byte length'); }
  return Buffer.concat(chunks);
}

export async function buildReport({env = process.env, root = here, sourceRoot = path.resolve(root, '..'), fetchImpl = fetch} = {}) {
  // Remove stale output before any validation; failures cannot reuse an old report.
  const output = path.join(root, 'private');
  await mkdir(output, {recursive: true, mode: 0o700});
  if ((await lstat(output)).isSymbolicLink()) throw new Error('Private output directory must not be a symlink');
  const target = path.join(output, 'dashboard.html.gz');
  const temporary = `${target}.tmp`;
  await rm(target, {force: true});
  await rm(temporary, {force: true});
  try {
    await checkPublicFiles(root);
    let manifest;
    try { manifest = validateManifest(JSON.parse(await readFile(path.join(root, 'report-manifest.json'), 'utf8'))); }
    catch { throw new Error('Invalid or missing approved report manifest'); }
    const data = await loadReport(env, manifest, {fetchImpl, sourceRoot});
    if (data.length !== manifest.bytes) throw new Error('Approved report byte length mismatch');
    if (createHash('sha256').update(data).digest('hex') !== manifest.sha256) throw new Error('Dashboard snapshot checksum mismatch');
    const compressed = gzipSync(data, {level: 9});
    if (compressed.length > 4_000_000) throw new Error('Dashboard exceeds function response budget');
    await writeFile(temporary, compressed, {mode: 0o600});
    await rename(temporary, target);
    return {bytes: data.length, compressedBytes: compressed.length};
  } finally { await rm(temporary, {force: true}); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildReport(); console.log('Approved dashboard verified and packaged into the private function bundle'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
