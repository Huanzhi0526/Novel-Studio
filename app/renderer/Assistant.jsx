import React,{useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import {api,ErrorMessage,Card,Icon} from './ui.jsx';
import './assistant.css';
export function useAssistantController(){
 const [works,setWorks]=useState([]),[workId,setWorkId]=useState(''),[state,setState]=useState(null),[models,setModels]=useState([]),[modelId,setModelId]=useState('gemini-3.8-flash-low');
 const [drafts,setDrafts]=useState({}),[memory,setMemory]=useState(''),[error,setError]=useState(null),[pending,setPending]=useState(false);
 const request=useRef(null),current=useRef(workId);current.current=workId;const busy=pending||Boolean(state?.busy);
 async function refreshWorks(){try{setWorks((await api('writing.list')).works);}catch(e){setError(e);}}
 useEffect(()=>{void refreshWorks();},[]);
 useEffect(()=>{setState(null);setError(null);if(!workId)return;let live=true;async function load(initial=false){try{const v=await api('assistant.get',{workId});if(live){setState(v);if(initial){setMemory(v.memory);if(v.modelId)setModelId(v.modelId);}}}catch(e){if(live)setError(e);}}void load(true);const timer=setInterval(()=>void load(),1000);return()=>{live=false;clearInterval(timer);};},[workId]);
 async function run(){if(busy||!drafts[workId]?.trim())return;setError(null);setPending(true);const book=workId,id=crypto.randomUUID();request.current=id;try{const v=await api('assistant.send',{workId:book,text:drafts[book],modelId,requestId:id});if(current.current===book){setState(v);setMemory(v.memory);}setDrafts(d=>({...d,[book]:''}));}catch(e){if(current.current===book)setError(e);}finally{setPending(false);request.current=null;}}
 return{works,workId,setWorkId,state,models,modelId,setModelId,memory,setMemory,error,setError,busy,run,refreshWorks,text:drafts[workId]??'',setText:text=>setDrafts(d=>({...d,[workId]:text})),refreshModels:()=>api('assistant.models').then(setModels).catch(setError),stop:()=>api('request.cancel',{id:request.current??state?.requestId}).catch(setError),saveMemory:()=>api('assistant.memory',{workId,text:memory}).catch(setError),reset:()=>{if(window.confirm('重新开始讨论？本书记忆保留，当前讨论记录清空。'))api('assistant.reset',{workId}).then(setState).catch(setError);}};
}
const Markdown=({children})=><ReactMarkdown components={{a:({children,href})=><span className="assistant-source-link">{children}<small>{href}</small></span>}}>{children}</ReactMarkdown>;
export function Assistant({active,controller:c,openCard,openEvidence,compact=false,boundWorkId,onClose}){
 const {works,workId,state,models,modelId,error,busy,text,memory}=c;const scroll=useRef(null),follow=useRef(true);
 useEffect(()=>{if(active)void c.refreshWorks();},[active]);
 useEffect(()=>{if(active&&boundWorkId&&!busy&&boundWorkId!==workId)c.setWorkId(boundWorkId);},[active,boundWorkId,busy,workId]);
 useEffect(()=>{if(follow.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[state?.messages?.length,state?.partial]);
 const title=works.find(w=>w.id===workId)?.title;
 const rawActivity=state?.activity??'';
 const activity=rawActivity.startsWith('Run ')?(rawActivity.includes('reference_result')?'正在等待并领取检索结果':rawActivity.includes('reference_search')?'正在提交参考检索':rawActivity.includes('book_materials')?'正在阅读本书大纲与设定':rawActivity.includes('memory')?'正在整理本书记忆':rawActivity.includes('web_search')?'正在查找网络资料':'正在处理工具请求'):rawActivity;
 return <section className={`assistant-workspace ${compact?'assistant-compact':''}`} aria-label="创作助手">
 <header className="assistant-header"><div><span className="assistant-eyebrow">构思 · 推敲 · 参考</span><h1>创作助手</h1></div>{onClose&&<button className="icon-button" aria-label="关闭助手侧栏" onClick={onClose}>×</button>}</header>
 <div className="assistant-context"><label>当前作品<select aria-label="助手作品" value={workId} disabled={busy||Boolean(boundWorkId)} onChange={e=>c.setWorkId(e.target.value)}><option value="">选择一本原创作品</option>{works.map(w=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
 <details className="assistant-options"><summary>模型与本书记忆</summary><div className="assistant-option-body"><label>反重力模型<select aria-label="助手模型" value={modelId} disabled={busy} onChange={e=>c.setModelId(e.target.value)}>{!models.length&&<option value={modelId}>{modelId}</option>}{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button className="quiet" disabled={busy} onClick={c.refreshModels}>刷新反重力模型</button>
 {state&&<><label>本书任务与记忆<textarea aria-label="本书助手记忆" value={memory} disabled={busy} onChange={e=>c.setMemory(e.target.value)}/></label><div className="assistant-actions"><button disabled={busy} onClick={c.saveMemory}>保存记忆</button><button disabled={busy} onClick={()=>c.setMemory(state.memory)}>载入最新记忆</button></div><details><summary>记忆文件位置</summary><code>{state.workspace}</code></details></>}</div></details></div>
 <ErrorMessage error={error}/>{boundWorkId&&workId&&boundWorkId!==workId&&<p className="assistant-notice">正在处理《{title}》的讨论。停止或完成后会切换到当前作品。</p>}
 <div className="assistant-scroll" ref={scroll} onScroll={e=>{follow.current=e.currentTarget.scrollHeight-e.currentTarget.scrollTop-e.currentTarget.clientHeight<100;}}>
 {!state?.messages?.length&&<div className="assistant-empty"><Icon name="book" size={28}/><h2>{workId?'从一个情节问题开始':'先选一本正在创作的书'}</h2><p>结合本书大纲与设定，先找参考，再一起推敲人物的选择和情节的因果。</p>{workId&&<button onClick={()=>c.setText('这里想给男主设置一个困境，同时推进他与女主的关系。请结合本书设定给我几个方案，并说明参考依据。')}>试试：设计一个推动关系的困境</button>}</div>}
 <div role="log" aria-label="助手讨论记录" className="assistant-messages">{state?.messages.map((m,i)=><article key={i} className={`assistant-message message-${m.role}`}><div className="assistant-message-label">{m.role==='user'?'你的构思':'创作助手'}</div><div className="assistant-prose"><Markdown>{m.text}</Markdown></div></article>)}</div>
 {busy&&<div className="assistant-progress" role="status"><span className="assistant-pulse"/>{activity||'正在连接与准备资料…'}{state?.retrievalJobs?.filter(j=>j.status==='running').map(j=><small key={j.id}>检索AI处理中 · {Math.round(j.elapsedMs/1000)}秒</small>)}</div>}
 {busy&&state?.partial&&<article className="assistant-message"><div className="assistant-message-label">正在整理 · 尚未完成</div><div className="assistant-prose"><Markdown>{state.partial}</Markdown></div></article>}
 {state?.retrievalJobs?.filter(j=>j.status==='failed').map(j=><p key={j.id} className="assistant-notice danger">检索任务未完成：{j.error?.message??'请稍后重试'}</p>)}
 {state?.lastError&&<p className="assistant-notice danger">本轮未完成：{state.lastError.message}</p>}{state?.failedPartial&&<details className="assistant-details"><summary>查看本轮未完成的输出</summary><div className="assistant-prose"><Markdown>{state.failedPartial}</Markdown></div></details>}
 {state?.permissions?.map(p=><aside key={p.id} className="assistant-notice"><strong>{p.title}</strong><pre>{JSON.stringify(p.input,null,2)}</pre>{p.options.filter(o=>o.kind!=='allow_always').map(o=><button key={o.optionId} onClick={()=>api('assistant.permission',{workId,id:p.id,optionId:o.optionId}).catch(c.setError)}>{o.name}</button>)}<button onClick={()=>api('assistant.permission',{workId,id:p.id}).catch(c.setError)}>拒绝</button></aside>)}
 {!!state?.sources&&<details className="assistant-references"><summary>本轮参考资料 <span>{state.sources.hits?.length??0} 条</span></summary>{state.sources.reason&&<p>{state.sources.reason}</p>}{state.sources.hits?.map((card,i)=><Card key={i} card={card} compact collapseEvidence openCard={openCard} openEvidence={openEvidence}/>)}</details>}
 </div><footer className="assistant-composer"><textarea aria-label="助手问题" disabled={busy||!workId} value={text} onChange={e=>c.setText(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();void c.run();}}} placeholder="描述想解决的情节，或接着推敲上一个方案…"/><div className="assistant-composer-actions"><span>Ctrl + Enter 发送</span><button className="quiet" disabled={busy||!workId} onClick={c.reset}>重新开始讨论</button>{busy?<button onClick={c.stop}>停止</button>:<button className="primary-button" disabled={!workId||!text.trim()} onClick={c.run}>发送 <Icon name="send" size={15}/></button>}</div><small className="assistant-privacy">主动发送后，相关创作资料交给所选模型；按需联网仅发送搜索词。</small></footer>
 </section>;
}
