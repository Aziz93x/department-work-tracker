import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';

const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/,'Verification only runs against the local test database');
const ready=await fetch(base+'/');
assert.equal(ready.status,200,'Start the local test server first');
const results=[];
for(const file of ['test-integration.mjs','test-trainer-workspace.mjs','test-evidence.mjs','test-rayat.mjs','test-department-actions.mjs','test-account-transfer.mjs']){
 const start=Date.now();
 const result=spawnSync(process.execPath,['scripts/'+file],{env:{...process.env,TEST_URL:base},encoding:'utf8'});
 process.stdout.write(result.stdout||'');
 process.stderr.write(result.stderr||'');
 results.push({suite:file,passed:result.status===0,milliseconds:Date.now()-start});
 mkdirSync('test-results',{recursive:true});
 writeFileSync('test-results/verification.json',JSON.stringify({at:new Date().toISOString(),base,results},null,2));
 if(result.status!==0)process.exit(result.status||1);
}
console.log('All six local verification suites passed.');
