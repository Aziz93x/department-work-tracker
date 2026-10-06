// Author: Abdulaziz Almalki
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {accountTransferSchema,planAccountTransfer} from '../lib/account-transfer.ts';
const actor=randomUUID(),trainer=randomUUID();
const account={targetId:trainer,username:'0031103',display_name:'مدرب اختبار',role:'trainer',active:1,password_hash:'scrypt$16384$8$5$'+'a'.repeat(32)+'$'+'b'.repeat(64),must_change_password:1,staff_number:'31103',office:'',specialty:'',office_hours:[]};
const existing=[{id:trainer,username:'trainer.site.test',role:'trainer',staff_number:'0031103'},{id:actor,username:'head.site.test',role:'head',staff_number:null}];
const request=accountTransferSchema.parse({dryRun:true,accounts:[account]});
assert.equal(planAccountTransfer(request,existing,actor)[0].targetId,trainer);
assert.throws(()=>planAccountTransfer({...request,accounts:[account,account]},existing,actor));
assert.throws(()=>planAccountTransfer({...request,accounts:[{...account,targetId:null}]},existing,actor));
assert.throws(()=>planAccountTransfer({...request,accounts:[{...account,staff_number:'31464'}]},existing,actor));
assert.equal(accountTransferSchema.safeParse({...request,accounts:[{...account,password_hash:account.password_hash.replace('16384','1048576')}]}).success,false);
assert.throws(()=>planAccountTransfer({...request,accounts:[{...account,role:'head',targetId:trainer,staff_number:null}]},existing,actor));
const head={...account,role:'head',targetId:actor,username:'30782',staff_number:null};
assert.equal(planAccountTransfer({...request,accounts:[head]},existing,actor)[0].action,'update');
assert.throws(()=>planAccountTransfer({...request,accounts:[head]},existing,randomUUID()));
console.log('Account migration validation: preserved identity, normalized staff conflicts, duplicates, role protection and bounded password hashes passed.');
