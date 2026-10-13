import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, access, symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {buildReport, loadReport, validateManifest} from '../build.mjs';

const data = Buffer.from('<!doctype html><title>Synthetic report</title>');
const manifest = bytes => ({bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'private-report-test-'));
  t.after(() => rm(temp, {recursive:true, force:true}));
  const sourceRoot = path.join(temp, 'source'); const root = path.join(sourceRoot, 'production');
  await mkdir(path.join(root, 'public'), {recursive:true});
  const file = path.join(temp, 'approved.html'); await writeFile(file, data);
  await writeFile(path.join(root, 'report-manifest.json'), JSON.stringify(manifest(data)));
  const options = {root, sourceRoot, env:{REPORT_FILE:file}, fetchImpl:()=>{throw new Error('Local mode must not use network');}};
  const target = path.join(root, 'private/dashboard.html.gz');
  return {temp, root, file, options, target};
}
async function failsClean(f, pattern) {
  await mkdir(path.dirname(f.target), {recursive:true}); await writeFile(f.target, 'stale report');
  await assert.rejects(buildReport(f.options), pattern);
  await assert.rejects(access(f.target)); await assert.rejects(access(f.target+'.tmp'));
}
function remoteEnv() { return {REPORT_GITHUB_REPOSITORY:'example/private-reports', REPORT_GITHUB_COMMIT:'a'.repeat(40), REPORT_GITHUB_PATH:'approved/report.html', REPORT_GITHUB_TOKEN:'synthetic-test-token'}; }
function remoteFetch({privateRepo=true, payload=data, status=200}={}) {
  const calls=[];
  const fetchImpl = async (url, opts) => {
    calls.push({url,opts});
    return calls.length===1 ? Response.json({private:privateRepo}) : new Response(payload,{status});
  };
  return {fetchImpl,calls};
}

test('approved external file builds exact gzip bytes without any network, independent of cwd', async t => {
  const f=await fixture(t); const result=await buildReport(f.options);
  assert.equal(result.bytes,data.length); assert.deepEqual(gunzipSync(await readFile(f.target)),data);
});
test('missing file removes stale artifact', async t => { const f=await fixture(t); await rm(f.file); await failsClean(f,/missing or unreadable/); });
test('same-size tampered report fails SHA-256 and removes stale artifact', async t => { const f=await fixture(t); await writeFile(f.file,Buffer.alloc(data.length,120)); await failsClean(f,/checksum mismatch/); });
test('truncated, empty and oversized files fail before packaging', async t => {
  for(const bytes of [Buffer.alloc(0),data.subarray(1),Buffer.concat([data,data])]) { const f=await fixture(t); await writeFile(f.file,bytes); await failsClean(f,/byte length/); }
});
test('manifest missing, malformed or invalid fails closed', async t => {
  for(const value of [null,'{','{}',JSON.stringify({sha256:'x',bytes:1}),JSON.stringify({sha256:manifest(data).sha256,bytes:50_000_001})]) {
    const f=await fixture(t); const file=path.join(f.root,'report-manifest.json');
    if(value===null) await rm(file); else await writeFile(file,value);
    await failsClean(f,/manifest/);
  }
});
test('manifest cannot approve invalid lengths or hash formats',()=>{
  for(const bytes of [-1,0,1.5,'10',50_000_001]) assert.throws(()=>validateManifest({...manifest(data),bytes}));
});
test('absent, mixed and incomplete source configurations fail closed', async t => {
  for(const env of [{},{REPORT_GITHUB_TOKEN:'test'},{REPORT_FILE:'/tmp/test',...remoteEnv()}]) { const f=await fixture(t); f.options.env=env; await failsClean(f,/source|incomplete/); }
});
test('relative paths and report sources inside checkout, including symlink aliases, are rejected', async t => {
  const f=await fixture(t); f.options.env.REPORT_FILE='approved.html'; await failsClean(f,/absolute path/);
  const internal=path.join(f.root,'report.html'); await writeFile(internal,data); f.options.env.REPORT_FILE=internal; await failsClean(f,/outside/);
  const alias=path.join(f.temp,'alias.html'); await symlink(internal,alias); f.options.env.REPORT_FILE=alias; await failsClean(f,/outside/);
});
test('untracked public report or symlink stops build and removes stale artifact', async t => {
  const f=await fixture(t); const leak=path.join(f.root,'public/report.html'); await writeFile(leak,data); await failsClean(f,/unapproved/);
  await rm(leak); await symlink(f.file,leak); await failsClean(f,/symlinks/);
});
test('compressibility budget is still enforced',async t=>{
  const f=await fixture(t); const large=randomBytes(4_100_000); await writeFile(f.file,large); await writeFile(path.join(f.root,'report-manifest.json'),JSON.stringify(manifest(large))); await failsClean(f,/response budget/);
});
test('private GitHub uses authenticated API, full commit pin and raw media type; output round trips',async t=>{
  const f=await fixture(t); const mock=remoteFetch(); f.options.env=remoteEnv(); f.options.fetchImpl=mock.fetchImpl;
  await buildReport(f.options); assert.deepEqual(gunzipSync(await readFile(f.target)),data);
  assert.equal(mock.calls.length,2);
  assert.equal(mock.calls[1].url,`https://api.github.com/repos/example/private-reports/contents/approved/report.html?ref=${'a'.repeat(40)}`);
  for(const {opts} of mock.calls) { assert.equal(opts.headers.Authorization,'Bearer synthetic-test-token'); assert.equal(opts.redirect,'error'); assert(opts.signal); }
  assert.equal(mock.calls[1].opts.headers.Accept,'application/vnd.github.raw+json');
});
test('public repository rejected before fetching contents',async()=>{
  const mock=remoteFetch({privateRepo:false}); await assert.rejects(loadReport(remoteEnv(),manifest(data),mock),/must be private/); assert.equal(mock.calls.length,1);
});
test('mutable refs and malformed source paths rejected before network',async()=>{
  for(const overrides of [{REPORT_GITHUB_COMMIT:'main'},{REPORT_GITHUB_PATH:'../report.html'},{REPORT_GITHUB_PATH:'/report.html'},{REPORT_GITHUB_REPOSITORY:'../../evil'}]) {
    await assert.rejects(loadReport({...remoteEnv(),...overrides},manifest(data),{fetchImpl:()=>assert.fail('unexpected network')}),/requires|Invalid/);
  }
});
test('HTTP denial/not-found/rate-limit and network errors do not leak response body or token',async t=>{
  for(const status of [401,403,404,429,500]) {
    const f=await fixture(t); f.options.env=remoteEnv(); f.options.fetchImpl=remoteFetch({status,payload:'synthetic-test-token'}).fetchImpl; await failsClean(f,/request failed/);
  }
  await assert.rejects(loadReport(remoteEnv(),manifest(data),{fetchImpl:()=>{throw new Error('synthetic-test-token');}}),e=>!e.message.includes('synthetic-test-token'));
});
test('remote corrupt, truncated and oversized bytes cannot produce an artifact',async t=>{
  for(const payload of [Buffer.alloc(data.length,120),data.subarray(1),Buffer.concat([data,data])]) {
    const f=await fixture(t); f.options.env=remoteEnv(); f.options.fetchImpl=remoteFetch({payload}).fetchImpl; await failsClean(f,/checksum|byte length/);
  }
});

test('private output cannot be redirected into public via symlink',async t=>{
  const f=await fixture(t); await symlink(path.join(f.root,'public'),path.join(f.root,'private'));
  await assert.rejects(buildReport(f.options),/must not be a symlink/);
  await assert.rejects(access(path.join(f.root,'public/dashboard.html.gz')));
});
