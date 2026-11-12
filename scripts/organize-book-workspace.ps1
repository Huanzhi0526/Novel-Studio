$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$targetRoot = Join-Path $projectRoot '拆书工作区'
$desktop = 'C:\Users\78828\Desktop'
$auditRoot = Join-Path $projectRoot '.local\dispatch-20261111'
New-Item -ItemType Directory -Path $targetRoot,$auditRoot -Force | Out-Null
$moves = @(
    @{ Name='Novel Studio 拆书派工'; Target='Novel Studio 拆书派工' },
    @{ Name='本地知识库拆书'; Target='本地知识库拆书' },
    @{ Name='_ns_handover_unzip'; Target='历史辅助\_ns_handover_unzip' },
    @{ Name='_review_scripts'; Target='历史辅助\_review_scripts' }
)
$recordPath = Join-Path $auditRoot 'directory-migration.json'
$records = @(if (Test-Path -LiteralPath $recordPath) { Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json })
foreach ($move in $moves) {
    $source = [IO.Path]::GetFullPath((Join-Path $desktop $move.Name))
    $target = [IO.Path]::GetFullPath((Join-Path $targetRoot $move.Target))
    if ((Split-Path -Parent $source) -ne $desktop -or !$target.StartsWith($targetRoot + '\')) { throw '路径越界' }
    if (!(Test-Path -LiteralPath $source -PathType Container) -and (Test-Path -LiteralPath $target)) { continue }
    if (!(Test-Path -LiteralPath $source -PathType Container)) { throw "原目录不存在：$source" }
    $files = @(Get-ChildItem -LiteralPath $source -Recurse -File -Force | ForEach-Object {
        [pscustomobject]@{ Relative=[IO.Path]::GetRelativePath($source,$_.FullName); SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    })
    if ((Test-Path -LiteralPath $target) -and $files.Count -gt 0) { throw "两处仍有文件，先人工核对：$source" }
    if ((Test-Path -LiteralPath $target) -and $files.Count -eq 0) {
        $records += [pscustomobject]@{Source=$source;Target=$target;Files=@(Get-ChildItem -LiteralPath $target -Recurse -File -Force).Count;Note='目录内容已迁移；原路径为空但被其他进程占用，未强制结束进程'}
        try { Remove-Item -LiteralPath $source -ErrorAction Stop } catch { Write-Output "仅剩被占用的空目录：$source" }
        $records | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $recordPath -Encoding utf8
        continue
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    $files | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $auditRoot ($move.Name + '-before.json')) -Encoding utf8
    try { Move-Item -LiteralPath $source -Destination $target } catch {
        if (@(Get-ChildItem -LiteralPath $source -Recurse -File -Force).Count -gt 0) { throw }
        Write-Output "内容已迁移，仅原空目录仍被占用：$source"
    }
    foreach ($file in $files) {
        if ((Get-FileHash -LiteralPath (Join-Path $target $file.Relative) -Algorithm SHA256).Hash -ne $file.SHA256) { throw "迁移摘要不符：$($file.Relative)" }
    }
    $records += [pscustomobject]@{Source=$source;Target=$target;Files=$files.Count;Hashes=$files}
    $records | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $auditRoot 'directory-migration.json') -Encoding utf8
    Write-Output "已迁移并核对 $($files.Count) 个文件：$($move.Name)"
}
