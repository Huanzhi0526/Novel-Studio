export function isProviderQuotaError(result){
 const text=typeof result==='string'?result:[result?.error?.message,result?.error,result?._meta?.['codebuddy.ai/errorMessage'],result?._meta?.errorMessage,result?.stopReason==='rate_limited'?'rate_limited':''].filter(Boolean).join(' ');
 return /RESOURCE_EXHAUSTED|quota_exceeded|usage_limit_exceeded|rate.?limit|额度(?:已)?(?:耗尽|用尽)|使用量已超出频率限制|(?:HTTP|status|code)[\s":]+429/iu.test(text);
}
export function quotaRecovery({engine,model,resetAt,now=new Date(),shortWaitMinutes=30}){
 const reset=Date.parse(resetAt),delay=reset-+now;
 if(engine==='antigravity'){
  if(Number.isFinite(delay)&&delay>=0&&delay<=shortWaitMinutes*60000)return {engine,model:'gemini-3.8-flash-low',action:'wait',retryNotBefore:new Date(reset+60000).toISOString()};
  return {engine:'codebuddy',model:'hy4free',action:'switch'};
 }
 if(model==='hy4free'||model==='hy4std')return {engine:'codebuddy',model:'deepseek-v4.1-flash',action:'switch'};
 return {engine:'codebuddy',model:'deepseek-v4.1-flash',action:'wait',retryNotBefore:new Date(Number.isFinite(reset)&&reset>+now?reset+60000:+now+120*60000).toISOString()};
}
