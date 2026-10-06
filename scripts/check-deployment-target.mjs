// Author: Abdulaziz Almalki
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const expected='appgprj_6ac40d27f5b88191b2eeb848d3b1616e';
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
assert.equal(manifest.project_id,expected,'Refuse publishing to another Sites project');
assert.equal(manifest.d1,'DB');assert.equal(manifest.r2,'BUCKET');
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
for(const entry of journal.entries)assert.ok(readFileSync('drizzle/'+entry.tag+'.sql','utf8').trim());
console.log(JSON.stringify({project:expected,databaseBinding:manifest.d1,storageBinding:manifest.r2,migrations:journal.entries.length,passed:true}));
