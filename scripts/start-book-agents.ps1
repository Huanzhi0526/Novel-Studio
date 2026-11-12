[CmdletBinding()]
param([int]$Count=3)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$base=Join-Path $projectRoot '拆书工作区'
$queuePath=Join-Path $base '派工队列.json'
$queue=Get-Content -LiteralPath $queuePath -Raw | ConvertFrom-Json
if($queue.stopRequested -or (Test-Path -LiteralPath (Join-Path $base '停止派工'))) { throw '用户已叫停' }
$alive=@($queue.jobs | Where-Object { $_.state -eq 'running' -and $_.workerPid -and (Get-Process -Id $_.workerPid -ErrorAction SilentlyContinue) })
$slots=[Math]::Min($Count,3-$alive.Count)
if($slots -le 0) { Write-Output '并发槽位已满'; exit 0 }
$selected=@($queue.jobs | Where-Object state -In @('queued','retry') | Select-Object -First $slots)
$node=(Get-Command node.exe).Source
$worker=Join-Path $projectRoot 'scripts\book-agent-worker.mjs'
foreach($job in $selected){
    $jobPath=Join-Path $job.workspace '派工任务.json'
    # 此时该任务无活跃worker；仅在安全启动前刷新规范输入，保留原文和施工文件。
    if($job.pendingBundleSha256){
        $bundle=Join-Path $projectRoot 'release\NovelStudio-拆书交接包-v1.0.zip'
        $actual=(Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant()
        if($actual -ne $job.pendingBundleSha256){ throw '待同步交接包摘要不一致' }
        Copy-Item -LiteralPath $bundle -Destination (Join-Path $job.workspace '输入\NovelStudio-拆书交接包-v1.0.zip') -Force
        Expand-Archive -LiteralPath $bundle -DestinationPath (Join-Path $job.workspace '工具') -Force
        $job.bundleSha256=$actual
        $job.PSObject.Properties.Remove('pendingBundleSha256')
    }
    if($job.state -eq 'retry') { $job | Add-Member -NotePropertyName resume -NotePropertyValue $true -Force }
    $job | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $jobPath -Encoding utf8NoBOM
    $log=Join-Path $job.workspace '运行记录'
    New-Item -ItemType Directory -Path $log -Force | Out-Null
    $attempt=Get-Date -Format yyyyMMdd-HHmmss
    $p=Start-Process -FilePath $node -ArgumentList @(('"'+$worker+'"'),('"'+$jobPath+'"')) -WorkingDirectory $job.workspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $log ($attempt+'-stdout.log')) -RedirectStandardError (Join-Path $log ($attempt+'-stderr.log')) -PassThru
    $job.state='running'
    $job | Add-Member -NotePropertyName workerPid -NotePropertyValue $p.Id -Force
    $job | Add-Member -NotePropertyName dispatchedAt -NotePropertyValue ([DateTimeOffset]::Now.ToString('o')) -Force
    $job | Add-Member -NotePropertyName firstCheckAt -NotePropertyValue ([DateTimeOffset]::Now.AddMinutes(30).ToString('o')) -Force
    $queue.checkIntervalMinutes=30
    $queue | Add-Member -NotePropertyName firstCheckIntervalMinutes -NotePropertyValue 30 -Force
    $queue | Add-Member -NotePropertyName nextCheckAt -NotePropertyValue $job.firstCheckAt -Force
    $queue | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $queuePath -Encoding utf8NoBOM
    [pscustomobject]@{Book=$job.title;PID=$p.Id;Model=$job.model;Effort=$job.effort;Workspace=$job.workspace}
}
