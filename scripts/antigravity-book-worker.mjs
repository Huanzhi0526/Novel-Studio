import {isProviderQuotaError} from './book-quota-policy.mjs';
import {captureAntigravityUsage} from './capture-antigravity-usage.mjs';
import {permitBookTool} from './book-agent-permissions.mjs';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildBookAgentPrompt,parseBookProgress} from './book-agent-prompt.mjs';
const job=JSON.parse(readFileSync(process.argv[2],'utf8'));const cwd=resolve(job.workspace);
const dir=join(cwd,'运行记录');mkdirSync(dir,{recursive:true});const log=join(dir,`antigravity-${Date.now()}.jsonl`);
const statusPath=join(dir,'运行状态.json');const status={engine:'antigravity',state:'starting',model:'gemini-3.8-flash-low',effort:'low',workerPid:process.pid,startedAt:new Date().toISOString(),workspace:cwd,contextPolicy:'CLI highest/default; no manual compression',log};
const save=()=>writeFileSync(statusPath,JSON.stringify(status,null,2));save();
const c=spawn('C:/Users/78828/AppData/Local/agy/bin/agy.exe',['acp','--sandbox','--include-default-customizations=false'],{cwd,windowsHide:true});status.cliPid=c.pid;save();
c.stdout.setEncoding('utf8');c.stderr.setEncoding('utf8');let buf='',seq=0,closing=false,toolCalls=0;const pending=new Map();
const record=m=>appendFileSync(log,JSON.stringify(m)+'\n');
const permit=params=>permitBookTool(params,cwd);
function request(method,params){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});c.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
c.stderr.on('data',s=>record({type:'stderr',text:s}));
c.stdout.on('data',s=>{buf+=s;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);let m;try{m=JSON.parse(line);}catch{record({type:'stdout',text:line});continue;}record(m);
 if(!m.method&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
 else if(m.method&&m.id!=null){const allow=m.method==='session/request_permission'&&permit(m.params);const option=m.params?.options?.find(o=>o.kind==='allow_once');record({permission:allow?'allow_once':'deny',tool:m.params?.toolCall});c.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...(m.method==='session/request_permission'?{result:{outcome:allow&&option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}}:{error:{code:-32601,message:'Unsupported client method'}})})+'\n');}
 if(m.method==='session/update'){if(m.params?.update?.sessionUpdate==='tool_call')toolCalls++;status.lastActivityAt=new Date().toISOString();save();}
 }});
c.on('exit',code=>{if(!closing){status.state='worker_error';status.error='CLI exit '+code;save();}for(const p of pending.values())p.reject(Error('CLI exit '+code));pending.clear();});
try{
 await request('initialize',{protocolVersion:1,clientInfo:{name:'novel-studio-two-book-dispatch',version:'1'},clientCapabilities:{}});
 const session=await request('session/new',{cwd,mcpServers:[]});status.sessionId=session.sessionId;
 await request('session/set_model',{sessionId:status.sessionId,modelId:'gemini-3.8-flash-low'});
 const config=await request('session/set_config_option',{sessionId:status.sessionId,configId:'thought_level',value:'low'});status.configOptions=config.configOptions;
 if(config.configOptions.find(x=>x.id==='thought_level')?.currentValue!=='low')throw Error('Low thought level not confirmed');
 status.configuredModel=config.configOptions.find(x=>x.id==='model')?.currentValue;if(status.configuredModel!=='gemini-3.8-flash')throw Error('Unexpected model '+status.configuredModel);
 const prompt=buildBookAgentPrompt({model:status.model,task:readFileSync(job.prompt,'utf8')+'\n\n'+job.recovery,resume:job.resume===true});status.promptSha256=createHash('sha256').update(prompt).digest('hex');status.state='running';save();
 let result=await request('session/prompt',{sessionId:status.sessionId,prompt:[{type:'text',text:prompt}]});
 let emptyTurns=0,previousCalls=0;
 for(let n=0;n<20&&result?.stopReason==='end_turn';n++){
  let progress;try{progress=parseBookProgress(readFileSync(join(cwd,'进度.json'),'utf8'));}catch{}
  if(progress?.phase==='completed'||['blocked','cancelled','stopped'].includes(progress?.phase))break;
  if(isProviderQuotaError(result)){status.error='quota limit; preserve checkpoint and wait for scheduled recovery';break;}
  emptyTurns=toolCalls===previousCalls?emptyTurns+1:0;previousCalls=toolCalls;
  if(emptyTurns>=3){status.error='Three end_turn replies with no tool progress; bounded stop';break;}
  status.continuationTurns=n+1;save();
  result=await request('session/prompt',{sessionId:status.sessionId,prompt:[{type:'text',text:buildBookAgentPrompt({model:status.model,continuation:true,task:'继续本书原范围，不等接收方回复。优先完成进度中明确剩余工作，保留已有有效成果和已接收基线。若工具请求失败，检查当前本书路径/语法，用等价安全命令继续，勿跨目录或重复同一失败操作。真实阻碍写明原因、断点和剩余范围，不假报完成。'})}]});
 }
 status.promptResult=result;
 let progress;try{progress=parseBookProgress(readFileSync(join(cwd,'进度.json'),'utf8'));}catch{}
 status.state=result?.stopReason==='end_turn'&&progress?.phase==='completed'?'awaiting_review':'needs_attention';
}catch(e){status.state=isProviderQuotaError(String(e))?'rate_limited':'worker_error';status.error=String(e);process.exitCode=1;}
finally{closing=true;status.finishedAt=new Date().toISOString();save();c.stdin.end();setTimeout(()=>c.kill(),1000).unref();try{status.quotaAtEndFile=join(dir,'antigravity-quota-at-end-'+status.sessionId+'.json');await captureAntigravityUsage({executable:'C:/Users/78828/AppData/Local/agy/bin/agy.exe',filename:status.quotaAtEndFile,cwd});status.quotaCapturedAt=new Date().toISOString();}catch(e){status.quotaCaptureError=String(e);}save();console.log(JSON.stringify(status));}
