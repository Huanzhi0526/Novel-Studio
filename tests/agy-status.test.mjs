import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AgyFlashClient,separateAgyStatus} from '../app/kb-v2/agy-client.mjs';
const capacity='\n⚠ API error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-low on the server\n';
function client(t,respond,modelId='gemini-3.8-flash-low',extra={}){
 const dir=mkdtempSync(join(tmpdir(),'agy-status-'));
 let proc; const requests=[];
 const spawnImpl=()=>{
  proc=new EventEmitter();proc.stdout=new PassThrough();proc.stderr=new PassThrough();proc.stdin=new PassThrough();proc.killed=false;proc.kill=()=>{proc.killed=true;};
  let buf='';const send=msg=>proc.stdout.write(JSON.stringify(msg)+'\n');
  proc.stdin.on('data',chunk=>{buf+=chunk;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);const req=JSON.parse(line);requests.push(req);
   const reply=result=>send({jsonrpc:'2.0',id:req.id,result});
   if(req.method==='initialize')reply({});
   else if(req.method==='session/new')reply({sessionId:'s'});
   else if(req.method==='session/set_model')reply({});
   else if(req.method==='session/set_config_option')reply({configOptions:[{id:'thought_level',currentValue:'low'}]});
   else if(req.method==='session/prompt')respond({text:text=>send({method:'session/update',params:{sessionId:'s',update:{sessionUpdate:'agent_message_chunk',content:{text}}}}),reply});
  }});return proc;
 };
 const c=new AgyFlashClient({cwd:dir,executable:'fake',spawnImpl,capacityGraceMs:15,modelId,...extra});c.testRequests=requests;
 t.after(()=>{c.close();rmSync(dir,{recursive:true,force:true});});return c;
}
test('status separation removes only CLI notices, preserving JSON and ordinary warning prose',()=>{
 assert.equal(separateAgyStatus(capacity+'{"ok":true}').text,'{"ok":true}');
 assert.equal(separateAgyStatus('角色提醒：⚠ 前方有危险。').text,'角色提醒：⚠ 前方有危险。');
 assert.equal(separateAgyStatus(capacity).capacity,true);
 assert.equal(separateAgyStatus(capacity+capacity.trimStart()+'正文').text,'正文');
});
test('recovery from capacity returns clean result without retrying or changing chosen model',async t=>{
 const c=client(t,({text,reply})=>{text(capacity);text('{"ok":true}');reply({stopReason:'end_turn'});});
 assert.equal((await c.promptText('synthetic')).text,'{"ok":true}');
 assert.equal(c.modelId,'gemini-3.8-flash-low');
});
test('persistent server capacity fails early with 503 details, not generic network timeout',async t=>{
 const c=client(t,({text})=>text(capacity));
 await assert.rejects(c.promptText('synthetic',{timeoutMs:500}),error=>error.code==='AGY_CAPACITY'&&error.details.upstreamStatus===503);
});
test('quota errors fail promptly and explicit incomplete output is never returned as prose',async t=>{
 const quota=client(t,({text})=>text('⚠ API error (attempt 1): RESOURCE_EXHAUSTED (code 429)\n'));
 await assert.rejects(quota.promptText('synthetic'),{code:'AGY_RATE_LIMIT'});
 const incomplete=client(t,({text,reply})=>{text('half');reply({stopReason:'max_tokens'});});
 await assert.rejects(incomplete.promptText('synthetic'),{code:'AGY_INCOMPLETE'});
});
test('non-capacity timeout identifies actual selected model',async t=>{
 const c=client(t,()=>{},'gemini-4-carbon-low');
 await assert.rejects(c.promptText('synthetic',{timeoutMs:15}),error=>error.code==='AGY_TIMEOUT'&&error.message.includes('gemini-4-carbon-low'));
});

 test('assistant reuses one ACP session while ordinary text requests remain isolated',async t=>{
 const reply=({text,reply})=>{text('合成回答');reply({stopReason:'end_turn'});};
 const assistant=client(t,reply,undefined,{assistant:{mcpServers:[]}});
 await assistant.promptText('第一轮');await assistant.promptText('第二轮');
 assert.equal(assistant.testRequests.filter(r=>r.method==='session/new').length,1);
 const ordinary=client(t,reply);await ordinary.promptText('一');await ordinary.promptText('二');
 assert.equal(ordinary.testRequests.filter(r=>r.method==='session/new').length,2);
 });
