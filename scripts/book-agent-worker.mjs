import {isProviderQuotaError} from './book-quota-policy.mjs';
import {commandPathsInside} from './book-agent-permissions.mjs';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildBookAgentPrompt,completionDisposition,parseBookProgress} from './book-agent-prompt.mjs';
const jobPath=resolve(process.argv[2]);
const configureOnly=process.argv.includes('--configure-only');
const job=JSON.parse(readFileSync(jobPath,'utf8'));
const cwd=resolve(job.workspace);mkdirSync(join(cwd,'运行记录'),{recursive:true});
const statusPath=join(cwd,'运行记录','运行状态.json');
let prior;try{prior=JSON.parse(readFileSync(statusPath,'utf8'));}catch{}
const log=join(cwd,'运行记录',`events-${Date.now()}.jsonl`);
const status={engine:'codebuddy',state:'starting',model:job.model,effort:job.effort,contextPolicy:'highest-model-preset; no manual compaction',startedAt:new Date().toISOString(),workerPid:process.pid,workspace:cwd};
const save=()=>writeFileSync(statusPath,JSON.stringify(status,null,2));save();
const exe='C:/Users/78828/AppData/Roaming/npm/node_modules/@tencent-ai/codebuddy-code/bin/codebuddy';
const child=spawn(process.execPath,[exe,'--acp','--model',job.model,'--effort',job.effort,'--permission-mode','acceptEdits','--tools','Read,Write,Edit,Bash,Glob,Grep,WebSearch,WebFetch','--allowedTools','Read,Write,Edit,Bash,Glob,Grep,WebSearch,WebFetch','--strict-mcp-config','--mcp-config','{"mcpServers":{}}'],{cwd,windowsHide:true,env:{...process.env,CBC_SESSION_CONFIG_SYNC:'1'}});
status.cliPid=child.pid;save();
// JSON-RPC frames may split within a UTF-8 Chinese character.
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
let counter=0,buffer='',closing=false;
const pending=new Map();
function allowedTool(params){
 const call=params?.toolCall;const name=call?._meta?.['codebuddy.ai/toolName'];const input=call?.rawInput??{};
 if(!['Read','Write','Edit','Bash','Glob','Grep','WebSearch','WebFetch'].includes(name))return false;
 for(const key of ['path','file_path','filePath','cwd','workdir']){const p=input[key];if(typeof p==='string'){const target=resolve(cwd,p).toLowerCase();if(!target.startsWith(cwd.toLowerCase()+'\\')&&target!==cwd.toLowerCase())return false;}}
 if(name==='Bash'){
  const command=String(input.command??'');
  if(/(?:\.\.[\\/]|\b(?:APPDATA|LOCALAPPDATA|USERPROFILE|HOME)\b|\.codebuddy|\.workbuddy|\blibrary\.sqlite\b|\b(?:reg|schtasks|taskkill|shutdown)\b)/i.test(command))return false;
  if(!commandPathsInside(command,cwd))return false;
 }
 return true;
}
function request(method,params){const id=++counter;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
child.stderr.on('data',chunk=>appendFileSync(log,JSON.stringify({type:'stderr',at:new Date().toISOString(),text:chunk.toString()})+'\n'));
child.stdout.on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;let m;try{m=JSON.parse(line);}catch{appendFileSync(log,JSON.stringify({type:'stdout',text:line})+'\n');continue;}
 appendFileSync(log,JSON.stringify(m)+'\n');
 if(!m.method&&m.id!=null&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(new Error(JSON.stringify(m.error)));else p.resolve(m.result);}
 else if(m.id!=null&&m.method){const allow=m.method==='session/request_permission'&&allowedTool(m.params);const option=m.params?.options?.find(o=>o.kind==='allow_once');child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...(m.method==='session/request_permission'?{result:{outcome:allow&&option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}}:{error:{code:-32601,message:'Client method unavailable'}})})+'\n');}
 if(m.method==='session/update'){status.lastActivityAt=new Date().toISOString();save();}
}});
child.on('exit',code=>{status.cliExitCode=code;if(!closing){status.state='worker_error';status.error='CLI exited unexpectedly';save();}for(const p of pending.values())p.reject(new Error('CLI exit '+code));pending.clear();});
child.on('error',e=>{status.state='worker_error';status.error=String(e);save();});
try{
 await request('initialize',{protocolVersion:1,clientInfo:{name:'novel-studio-dispatch',version:'1.0'},clientCapabilities:{}});
 let session;
 if(job.resume&&prior?.sessionId&&(prior.engine==='codebuddy'||!prior.engine)){try{const loaded=await request('session/load',{sessionId:prior.sessionId,cwd,mcpServers:[]});session={...loaded,sessionId:prior.sessionId};status.resumed=true;}catch{}}
 session??=await request('session/new',{cwd,mcpServers:[]});status.sessionId=session.sessionId;save();
 for(const [configId,value] of [['model',job.model],['thought_level',job.effort]]){
  const result=await request('session/set_config_option',{sessionId:status.sessionId,configId,value});
  status.configOptions=result.configOptions;
 }
 const window=status.configOptions.find(o=>o.id==='context_window');
 if(window){const highest=window.options.map(o=>Number(o.value)).filter(Number.isFinite).sort((a,b)=>b-a)[0];const r=await request('session/set_config_option',{sessionId:status.sessionId,configId:'context_window',value:String(highest)});status.configOptions=r.configOptions;status.contextWindow=highest;}
 else status.contextWindow='model-default (CLI exposes no context preset option)';
 for(const [id,expected] of [['model',job.model],['thought_level',job.effort]]){
  const option=status.configOptions.find(o=>o.id===id);if(option?.currentValue!==expected)throw new Error('Config mismatch '+id+': '+JSON.stringify(option));
 }
 status.state='configured';save();
 if(!configureOnly){
  const prompt=buildBookAgentPrompt({model:job.model,task:readFileSync(job.prompt,'utf8')+'\n\n'+(job.recovery??''),resume:job.resume});status.promptSha256=createHash('sha256').update(prompt).digest('hex');status.state='running';save();
  let result=await request('session/prompt',{sessionId:status.sessionId,prompt:[{type:'text',text:prompt}]});
  // A producer's explicit partial handoff is a checkpoint, not the end of the book.
  for(let n=0;result?.stopReason==='end_turn'&&n<(job.maxContinuationTurns??20);n++){
   if(isProviderQuotaError(result))break;
   let progress;try{progress=parseBookProgress(readFileSync(join(cwd,'进度.json'),'utf8'));}catch{}
   if(completionDisposition(progress)!=='continue')break;
   status.continuationTurns=n+1;save();
   result=await request('session/prompt',{sessionId:status.sessionId,prompt:[{type:'text',text:buildBookAgentPrompt({model:job.model,continuation:true})}]});
  }
  status.promptResult=result;
  if(isProviderQuotaError(result)){status.state='rate_limited';}
  else {
   let progress;try{progress=parseBookProgress(readFileSync(join(cwd,'进度.json'),'utf8'));}catch{}
   status.state=result?.stopReason==='end_turn'&&completionDisposition(progress)==='complete'?'awaiting_review':'needs_attention';
  }
 }
}catch(e){status.error=String(e);status.state=/429|usage_limit_exceeded|使用量已超出频率限制/u.test(status.error)?'rate_limited':'worker_error';process.exitCode=1;}
finally{closing=true;status.finishedAt=new Date().toISOString();save();child.stdin.end();setTimeout(()=>child.kill(),1500).unref();console.log(JSON.stringify({state:status.state,sessionId:status.sessionId,model:status.model,contextWindow:status.contextWindow,error:status.error}));}
