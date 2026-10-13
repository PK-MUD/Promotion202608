import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {checkSource} from '../scripts/check-source.mjs';
async function fixture(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'source-policy-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
  git('init');await mkdir(path.join(root,'security'));await writeFile(path.join(root,'security/source-files.json'),JSON.stringify(['security/source-files.json','app.mjs']));await writeFile(path.join(root,'app.mjs'),'// synthetic source');git('add','.');return {root,git};
}
test('source allowlist accepts code, rejects new report paths even after force-add',async t=>{
  const f=await fixture(t);await checkSource(f.root);await writeFile(path.join(f.root,'report.html'),'synthetic data');f.git('add','-f','report.html');await assert.rejects(checkSource(f.root),/unapproved/);
});
test('renamed oversized or binary report in allowed source path rejected from index',async t=>{
  for(const data of [Buffer.alloc(256_001,120),Buffer.from([0,1,2])]) {
    const f=await fixture(t);await writeFile(path.join(f.root,'app.mjs'),data);f.git('add','app.mjs');await writeFile(path.join(f.root,'app.mjs'),'// clean worktree cannot hide staged content');await assert.rejects(checkSource(f.root),/oversized|binary/);
  }
});
