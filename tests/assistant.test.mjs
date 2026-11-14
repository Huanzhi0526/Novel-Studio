import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../app/main/store.mjs';
import {WritingService} from '../app/main/writing.mjs';
import {AssistantService} from '../app/main/assistant.mjs';

test('book workspaces isolate memories and expose only current nondeleted materials; tool writes never change originals',async t=>{
 const root=mkdtempSync(join(tmpdir(),'novel-assistant-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store);
 const a=writing.createWork({title:'甲'}).id,b=writing.createWork({title:'乙'}).id;
 const doc=writing.createDoc({workId:a,kind:'outline',title:'大纲',text:'合成大纲'}).id;
 const other=writing.createDoc({workId:b,kind:'setting',title:'保密设定',text:'乙'}).id;
 const svc=new AssistantService(writing,{query:async()=>({hits:[{title:'合成参考'}]})},root);
 t.after(()=>{svc.close();store.close();rmSync(root,{recursive:true,force:true});});
 assert.throws(()=>svc.get({workId:'../../elsewhere'}));
 const e=svc.entry(a);assert.notEqual(e.cwd,svc.entry(b).cwd);
 assert.equal((await svc.tool(e,a,'book_materials',{})).length,1);
 assert.equal((await svc.tool(e,a,'book_materials',{docId:doc})).text,'合成大纲');
 await assert.rejects(svc.tool(e,a,'book_materials',{docId:other}));
 await svc.memory({workId:a,text:'# 任务\n已确定：合成主旨'});
 assert.match(svc.get({workId:a}).memory,/合成主旨/);assert.doesNotMatch(svc.get({workId:b}).memory,/合成主旨/);
 assert.equal(writing.preview({id:doc}).text,'合成大纲');
 await svc.tool(e,a,'reference_search',{query:'任务'});assert.equal(svc.get({workId:a}).sources.hits.length,1);
 await assert.rejects(svc.tool(e,a,'memory_write',{text:''}));
});

test('assistant send persists discussion, recovers with recent context, and closes failed sessions',async t=>{
 const root=mkdtempSync(join(tmpdir(),'novel-assistant-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store);
 const workId=writing.createWork({title:'合成书'}).id;let calls=0,closed=0;
 const svc=new AssistantService(writing,null,root,{clientFactory:()=>({promptText:async text=>{calls++;assert.match(text,/本轮消息/);if(calls===2)throw new Error('503');return {text:'合成建议'};},close:()=>closed++})});
 svc.models=async()=>[{id:'gemini-test-low'}];
 // No network or CLI in this test; exercise orchestration and persistence only.
 svc.start=async e=>{e.client??=svc.clientFactory();};
 t.after(()=>{svc.close();store.close();rmSync(root,{recursive:true,force:true});});
 await svc.send({workId,text:'合成问题',modelId:'gemini-test-low'});
 assert.equal(svc.get({workId}).messages.length,2);
 await assert.rejects(svc.send({workId,text:'再讨论',modelId:'gemini-test-low'}),/503/);
 assert.equal(svc.get({workId}).busy,false);assert.ok(closed);
 assert.equal(JSON.parse(readFileSync(svc.entry(workId).history)).length,3);
 const memory=svc.get({workId}).memory;svc.reset({workId});assert.equal(svc.get({workId}).memory,memory);
});

test('MCP endpoint rejects missing credentials and serves only scoped tools',async t=>{
 const root=mkdtempSync(join(tmpdir(),'novel-assistant-')),store=new Store(join(root,'library.sqlite')),writing=new WritingService(store);
 const workId=writing.createWork({title:'合成接口测试'}).id;
 const svc=new AssistantService(writing,null,root,{clientFactory:()=>({close(){}})});
 t.after(()=>{svc.close();store.close();rmSync(root,{recursive:true,force:true});});
 const e=svc.entry(workId);await svc.start(e,workId);
 const url=`http://127.0.0.1:${e.server.address().port}`;
 const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.equal((await fetch(url,{method:'POST',body})).status,401);
 const response=await fetch(url,{method:'POST',body,headers:{Authorization:'Bearer '+e.token}});
 const reply=await response.json();assert.ok(reply.result.tools.some(t=>t.name==='reference_search'));
 const bad=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+e.token},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'execute_shell',arguments:{command:'echo unsafe'}}})});
 assert.equal((await bad.json()).result.isError,true);
});
