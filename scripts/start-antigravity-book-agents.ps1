[CmdletBinding()]
param([ValidateRange(1,3)][int]$Count=3)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$qp=Join-Path $projectRoot '拆书工作区/派工队列.json'
$planText=& node (Join-Path $PSScriptRoot 'prepare-antigravity-dispatch.mjs') $Count
if($LASTEXITCODE -ne 0){throw '派工准备失败'}
$plan=$planText | ConvertFrom-Json
if(-not $plan.jobs.Count){$plan;exit 0}
$q=Get-Content -LiteralPath $qp -Raw | ConvertFrom-Json
$node=(Get-Command node.exe).Source
$quotaBefore=Join-Path $plan.audit 'quota-before.json'
if(-not(Test-Path -LiteralPath $quotaBefore)){
 try{
  & $node (Join-Path $PSScriptRoot 'capture-antigravity-usage.mjs') $quotaBefore
  if($LASTEXITCODE -ne 0){throw '额度快照未成功'}
 }catch{ '额度基线查询失败；任务仍可按授权派发，后续不得伪造额度差值。' | Set-Content -LiteralPath (Join-Path $plan.audit 'quota-before-error.txt') -Encoding utf8NoBOM }
}
foreach($item in $plan.jobs){
 $j=$q.jobs | Where-Object work_id -EQ $item.workId
 $worker=Join-Path $PSScriptRoot $(if($j.engine -eq 'codebuddy'){'book-agent-worker.mjs'}else{'antigravity-book-worker.mjs'})
 if($j.state -eq 'running'){throw '同书已在运行'}
 $target=(Resolve-Path -LiteralPath $j.workspace).Path
 if(-not $target.StartsWith($projectRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw '工作区越界'}
 # 旧目录保留；扫描入口只链接同书当前目录。
 $entry=Join-Path $projectRoot ('拆书工作区/本地知识库拆书/反重力-'+$j.order+'-当前工作区')
 if(-not(Test-Path -LiteralPath $entry)){New-Item -ItemType Junction -Path $entry -Target $target | Out-Null}
 $attempt=Get-Date -Format yyyyMMdd-HHmmss
 $p=Start-Process -FilePath $node -ArgumentList @(('"'+$worker+'"'),('"'+$item.jobPath+'"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $item.audit ($j.work_id+'-'+$attempt+'-stdout.log')) -RedirectStandardError (Join-Path $item.audit ($j.work_id+'-'+$attempt+'-stderr.log')) -PassThru
 $j.state='running'
 $j | Add-Member workerPid $p.Id -Force
 $j | Add-Member dispatchedAt ([DateTimeOffset]::Now.ToString('o')) -Force
 $j | Add-Member dispatchAudit $item.audit -Force
 $j | Add-Member lastIssue $null -Force
 $q.checkIntervalMinutes=90
 $q | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $qp -Encoding utf8NoBOM
 [pscustomobject]@{Book=$j.title;PID=$p.Id;Model=$j.model;Effort=$j.effort;Batch=$plan.batchId}
}
