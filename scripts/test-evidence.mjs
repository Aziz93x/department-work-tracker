// Author: Abdulaziz Almalki
import {collectPages} from './test-helpers.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/,'Tests must target loopback only');
const accounts=JSON.parse(readFileSync('.local/test-accounts.json','utf8'));
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Z1ioAAAAASUVORK5CYII=','base64'));
const proof={evidenceId:'',versionIds:[],avatarKey:'',avatarPrevious:null,avatarPreviousAt:null,trainerId:accounts[2].id,headId:accounts[0].id};
async function call(path,{client,method='GET',body,multipart=false}={}){const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(client?{Cookie:client.cookie,'X-CSRF-Token':client.csrf}:{}),...(multipart?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)})});const type=r.headers.get('content-type')||'';return {status:r.status,data:type.includes('application/json')?await r.json():new Uint8Array(await r.arrayBuffer()),headers:r.headers}}
async function login(a){const r=await call('auth/login',{method:'POST',body:{username:a.username,password:a.password}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf}}
function form(fields,bytes=png,name='test.png'){const f=new FormData();for(const [k,v] of Object.entries(fields))f.set(k,v);f.set('file',new File([bytes],name,{type:'image/png'}));return f}
function sql(query){writeFileSync('.local/evidence-check.sql',query);const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','wrangler.local.json','--persist-to','.wrangler/state','--file','.local/evidence-check.sql','--json'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)[0].results}
async function items(client,path='evidence',key='evidence'){return collectPages(async p=>{const r=await call(p,{client});assert.equal(r.status,200);return r.data},path,key)}
const head=await login(accounts[0]),owner=await login(accounts[2]),other=await login(accounts[1]),deputy=await login(accounts[3]);
try{
 assert.equal((await call('evidence',{client:deputy})).status,403);
 assert.equal((await call('evidence/trainers',{client:other})).status,403);
 const bad=await call('evidence',{client:head,method:'POST',multipart:true,body:form({trainer_id:accounts[2].id,title:'اختبار ملف غير صحيح'},new TextEncoder().encode('<script>alert(1)</script>'),'fake.png')});assert.equal(bad.status,400);
 const invalidOwner=await call('evidence',{client:head,method:'POST',multipart:true,body:form({trainer_id:accounts[0].id,title:'اختبار مالك غير صحيح'})});assert.equal(invalidOwner.status,400);
 const created=await call('evidence',{client:head,method:'POST',multipart:true,body:form({trainer_id:accounts[2].id,title:'شاهد اختبار مؤقت — رفع الرئيس'})});assert.equal(created.status,201,JSON.stringify(created.data));proof.evidenceId=created.data.id;
 let list=await items(head);let item=list.find(x=>x.id===proof.evidenceId);assert.equal(item.trainer_id,accounts[2].id);assert.equal(item.uploader_name,accounts[0].name);assert.equal(item.review_status,'pending');proof.versionIds.push(item.latest_version_id);
 assert.ok((await items(owner)).some(x=>x.id===item.id));assert.ok(!(await items(other)).some(x=>x.id===item.id));
 assert.equal((await call('evidence/files/'+item.latest_version_id,{client:other})).status,403);
 assert.equal((await call('evidence/files/'+item.latest_version_id,{client:deputy})).status,403);
 const download=await call('evidence/files/'+item.latest_version_id,{client:owner});assert.equal(download.status,200);assert.deepEqual(download.data,png);assert.match(download.headers.get('content-disposition'),/attachment/);
 const reviewed=await call('evidence/'+item.id+'/review',{client:head,method:'POST',body:{status:'passed',note:'مراجعة اختبار مؤقتة',versionId:item.latest_version_id}});assert.equal(reviewed.status,200);
 const replaced=await call('evidence/'+item.id+'/versions',{client:owner,method:'POST',multipart:true,body:form({})});assert.equal(replaced.status,201);assert.equal(replaced.data.version,2);
 item=(await items(head)).find(x=>x.id===item.id);proof.versionIds.push(item.latest_version_id);assert.equal(item.review_status,'pending');const history=await items(head,'evidence/'+item.id+'/history','history');assert.ok(history.some(x=>x.review_status==='passed'&&x.version_number===1));assert.equal((await call('evidence/'+item.id+'/history',{client:other})).status,403);assert.equal((await call('evidence/'+item.id+'/history',{client:deputy})).status,403);assert.equal(item.uploader_name,accounts[2].name);
 assert.equal((await call('evidence/'+item.id+'/review',{client:head,method:'POST',body:{status:'failed',note:'stale',versionId:proof.versionIds[0]}})).status,409);
 assert.equal((await call('evidence/'+item.id+'/review',{client:other,method:'POST',body:{status:'passed',note:'',versionId:item.latest_version_id}})).status,403);
 proof.avatarPrevious=sql("SELECT avatar_key,avatar_updated_at FROM users WHERE id='"+accounts[0].id+"';")[0].avatar_key;
 proof.avatarPreviousAt=sql("SELECT avatar_updated_at FROM users WHERE id='"+accounts[0].id+"';")[0].avatar_updated_at;
 const avatar=await call('profile/avatar',{client:head,method:'POST',multipart:true,body:form({})});assert.equal(avatar.status,200);proof.avatarKey=sql("SELECT avatar_key FROM users WHERE id='"+accounts[0].id+"';")[0].avatar_key;
 assert.equal((await call('users/'+accounts[0].id+'/avatar',{client:head})).status,200);
 assert.equal((await call('users/'+accounts[0].id+'/avatar',{client:owner})).status,403);
 assert.equal((await call('profile/avatar',{client:deputy,method:'POST',multipart:true,body:form({})})).status,403);
 assert.equal((await call('profile/avatar',{client:head,method:'POST',multipart:true,body:form({},new TextEncoder().encode('<svg onload=alert(1)>'),'bad.png')})).status,400);
 writeFileSync('.local/evidence-proof.json',JSON.stringify(proof,null,2));
 console.log('PASS head uploads for trainer, owner isolation, private download, version history, review, file validation, personal photo access.');
}catch(error){writeFileSync('.local/evidence-proof.json',JSON.stringify(proof,null,2));throw error}
