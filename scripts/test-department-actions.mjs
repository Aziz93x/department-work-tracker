import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/,'Tests must target loopback only');
const accounts=JSON.parse(readFileSync('.local/test-accounts.json','utf8'));
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Z1ioAAAAASUVORK5CYII=','base64'));
async function login(account){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:account.username,password:account.password})});assert.equal(r.status,200);const data=await r.json();return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:data.csrf}}
async function call(path,client,method='GET',body){const multipart=body instanceof FormData;const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,Cookie:client.cookie,'X-CSRF-Token':client.csrf,...(multipart?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)})});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():new Uint8Array(await r.arrayBuffer())}}
function cleanup(ids,evidenceId){const sql=`DELETE FROM department_action_evidence WHERE action_id IN (${ids.map(id=>`'${id}'`).join(',')}); DELETE FROM audit_log WHERE target_id IN (${ids.map(id=>`'${id}'`).join(',')}); DELETE FROM department_actions WHERE id IN (${ids.map(id=>`'${id}'`).join(',')});`;const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','wrangler.local.json','--persist-to','.wrangler/state','--command',sql],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);if(evidenceId){const file=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','r2','object','delete',`site-creator-r2/department-actions/${ids[1]}/${evidenceId}`,'--local','--config','wrangler.local.json','--persist-to','.wrangler/state','--force'],{encoding:'utf8'});assert.equal(file.status,0,file.stderr)}}
const head=await login(accounts.find(a=>a.role==='head')),trainer=await login(accounts.find(a=>a.role==='trainer')),deputy=await login(accounts.find(a=>a.role==='deputy'));
const ids=[];let evidenceId='';
try{
 assert.equal((await call('department/actions',trainer)).status,403);
 assert.equal((await call('department/actions',deputy)).status,403);
 const initiative={kind:'initiative',category:null,title:'مبادرة اختبار مؤقتة',description:'وصف اختبار',expectedResult:'نتيجة اختبار',status:'planned',targetDate:''};
 const denied=await call('department/actions',trainer,'POST',initiative);assert.equal(denied.status,403);
 const first=await call('department/actions',head,'POST',initiative);assert.equal(first.status,201,JSON.stringify(first.data));ids.push(first.data.id);
 const plan={kind:'improvement',category:'withdrawn',title:'خطة اختبار مؤقتة',description:'إجراء اختبار',expectedResult:'تحسين متابعة الحالات',status:'planned',targetDate:'2026-12-01'};
 const second=await call('department/actions',head,'POST',plan);assert.equal(second.status,201,JSON.stringify(second.data));ids.push(second.data.id);
 const updated=await call('department/actions/'+ids[1],head,'PATCH',{...plan,status:'in_progress'});assert.equal(updated.status,200);
 const list=await call('department/actions',head);assert.equal(list.status,200);assert.equal(list.data.actions.find(x=>x.id===ids[1]).status,'in_progress');assert.equal(list.data.actions.find(x=>x.id===ids[0]).kind,'initiative');
 const invalid=await call('department/actions',head,'POST',{...plan,kind:'initiative'});assert.equal(invalid.status,400);
 const form=new FormData();form.set('file',new File([png],'proof.png',{type:'image/png'}));
 const uploaded=await call('department/actions/'+ids[1]+'/evidence',head,'POST',form);assert.equal(uploaded.status,201,JSON.stringify(uploaded.data));evidenceId=uploaded.data.id;
 const file=await call('department/actions/evidence/'+evidenceId,head);assert.equal(file.status,200);assert.deepEqual(file.data,png);
 assert.equal((await call('department/actions/evidence/'+evidenceId,trainer)).status,403);
 assert.equal((await call('department/actions/evidence/'+evidenceId,deputy)).status,403);
 const visible=await call('department/actions',head);assert.ok(visible.data.actions.find(x=>x.id===ids[1]).evidence.some(x=>x.id===evidenceId));
 const departmentDashboard=await call('dashboard',deputy);assert.equal(departmentDashboard.status,200);assert.ok('rayat'in departmentDashboard.data);const trainerLink=(await call('dashboard',trainer)).data.rayat;assert.deepEqual(Object.keys(trainerLink),['linked']);assert.equal(typeof trainerLink.linked,'boolean');
 console.log('Department initiatives, improvement plans, evidence and permissions passed.');
}finally{if(ids.length)cleanup(ids,evidenceId)}
