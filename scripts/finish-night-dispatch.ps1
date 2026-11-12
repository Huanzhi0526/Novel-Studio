[CmdletBinding()]
param([switch]$Shutdown)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$qp=Join-Path $root '拆书工作区/派工队列.json'
$q=Get-Content -LiteralPath $qp -Raw | ConvertFrom-Json
$p=$q.overnight
if(-not $Shutdown){[pscustomobject]@{Cutoff=$p.cutoffAt;Authorized=$p.shutdownAuthorized;Ready=$p.shutdownReady;Batch=$p.batchId;Action='检查模式，不关机'};exit 0}
if($q.stopRequested -or (Test-Path -LiteralPath (Join-Path $root '拆书工作区/停止派工'))){throw '用户已叫停，不执行自动关机'}
if($p.shutdownIssuedAt){throw '本轮已提交关机请求，不重复执行'}
if(-not $p.enabled -or -not $p.shutdownAuthorized -or -not $p.shutdownReady){throw '未达到本轮明确关机条件'}
if([DateTimeOffset]::Now -lt [DateTimeOffset]::Parse($p.cutoffAt)){throw '尚未达到北京时间截止点'}
if([DateTimeOffset]::Parse($p.lastBatchAcceptedAt) -lt [DateTimeOffset]::Parse($p.cutoffAt)){throw '需要截止后的整批验收收尾记录'}
if($q.jobs | Where-Object state -EQ running){throw '仍有在跑任务，不关闭电脑'}
foreach($id in $p.batchWorkIds){if(($q.jobs | Where-Object work_id -EQ $id).state -ne 'completed'){throw '当前批尚未全部正式接收'} }
if(@(Get-Process 'Novel Studio' -ErrorAction SilentlyContinue).Count){throw '正式应用仍开着；请先正常关闭并完成一致备份，不强退'}
if(-not $p.finalBackup -or -not $p.finalBackupSha256){throw '缺少最终一致备份'}
$backup=[IO.Path]::GetFullPath($p.finalBackup)
if(-not $backup.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw '备份必须留在已授权项目内'}
if((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p.finalBackupSha256){throw '最终备份摘要不一致'}
$manifest=Join-Path $root 'release/NovelStudio-0.1.19-SHA256.txt'
foreach($line in Get-Content -LiteralPath $manifest){$parts=$line -split '  ',2;if($parts.Count -ne 2){throw '发布摘要格式不对'};if((Get-FileHash -LiteralPath (Join-Path $root ('release/'+$parts[1])) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $parts[0]){throw '发布文件未保存或摘要不符'}}
$q.automationPaused=$true
$q.stopRequested=$true
$p | Add-Member shutdownIssuedAt ([DateTimeOffset]::Now.ToString('o')) -Force
$q | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $qp -Encoding utf8NoBOM
$receipt=Join-Path $root '.local/overnight-dispatch/shutdown-receipt.json'
$p | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $receipt -Encoding utf8NoBOM
# /t>0 implies /f on Windows. /t 0 without /f preserves application save prompts.
& "$env:WINDIR/System32/shutdown.exe" /s /t 0
if($LASTEXITCODE -ne 0){throw 'Windows关机请求失败；不得强制结束用户程序'}
