import {randomBytes,scryptSync,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd();
const file=path.join(root,'.local','test-accounts.json');
if(existsSync(file)){console.log('Local test accounts already initialized; preserving passwords and database.');process.exit(0)}
mkdirSync('.local',{recursive:true});
const definitions=[['head.demo','head','رئيس قسم تجريبي'],['trainer.demo','trainer','مدرب تجريبي'],['trainer2.demo','trainer','مدرب تجريبي ثانٍ'],['deputy.demo','deputy','وكيل تجريبي'],['dean.demo','dean','عميد تجريبي']];
const accounts=definitions.map(([username,role,name])=>({id:randomUUID(),username,role,name,password:randomBytes(15).toString('base64url')}));
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const statements=accounts.flatMap(a=>{const salt=randomBytes(16).toString('hex');const hash='scrypt$16384$8$5$'+salt+'$'+scryptSync(a.password,salt,32,{N:16384,r:8,p:5,maxmem:32*1024*1024}).toString('hex');return ['INSERT INTO users(id,username,display_name,password_hash,role,active,is_test,created_at,updated_at) VALUES('+[a.id,a.username,a.name,hash,a.role,1,1,Date.now(),Date.now()].map(quote).join(',')+');','INSERT INTO profiles(user_id) VALUES('+quote(a.id)+');']});
writeFileSync('.local/seed.sql',statements.join('\n'));
const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','wrangler.local.json','--persist-to','.wrangler/state','--file','.local/seed.sql'],{cwd:root,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
writeFileSync(file,JSON.stringify(accounts,null,2));
writeFileSync('.local/حسابات-الاختبار.md','# حسابات الاختبار المحلية\n\nهذه حسابات اختبار فقط، وليست بيانات موظفين حقيقية.\n\nافتح http://127.0.0.1:5173 ثم استخدم أحد الحسابات التالية.\n\n| الدور | اسم المستخدم | كلمة المرور |\n|---|---|---|\n'+accounts.map(a=>'| '+a.name+' | `'+a.username+'` | `'+a.password+'` |').join('\n')+'\n\nكلمات المرور في هذا الملف مخصصة للتجربة المحلية فقط. قاعدة البيانات تحفظ بصمات مشفرة وليست كلمات المرور نفسها.\n');
console.log('Initialized five local test accounts. Access details: .local/حسابات-الاختبار.md');
