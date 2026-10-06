// Author: Abdulaziz Almalki
import {assertLocalBase} from './test-helpers.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=assertLocalBase(process.env.TEST_URL||'http://127.0.0.1:5173');
const proof=JSON.parse(readFileSync('.local/restart-proof.json','utf8'));
async function call(path,method='GET',body){const r=await fetch(base+'/api/'+path,{method,headers:{Cookie:proof.client.cookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':proof.client.csrf},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200);return r.json()}
assert.equal((await call('auth/me')).user.id,proof.userId);
assert.equal((await call('profiles/'+proof.userId)).profile.office,proof.office);
const d=await call('dashboard');assert.deepEqual(d.layout,proof.layout);assert.deepEqual(d.metrics,proof.metrics);
await call('profiles/'+proof.userId,'PATCH',{office:'',specialty:''});
await call('dashboard/preferences','PUT',{density:'comfortable',hidden:[]});
writeFileSync('test-results/restart.json',JSON.stringify({at:new Date().toISOString(),passed:['Session survives process restart','Profile survives process restart','Dashboard display preferences survive process restart','Authorized dashboard metrics survive restart'],restoredTrainerDefaults:true},null,2));
console.log('PASS session, profile, and display preferences persisted across restart; test values restored.');
