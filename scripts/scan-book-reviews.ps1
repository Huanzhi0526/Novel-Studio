[CmdletBinding()]
param(
    [string] $Root = (Join-Path $PSScriptRoot '../拆书工作区/本地知识库拆书')
)

$ErrorActionPreference = 'Stop'
foreach ($book in Get-ChildItem -LiteralPath $Root -Directory) {
    $marker = Join-Path $book.FullName '验收状态.json'
    $reviews = @()
    if (Test-Path -LiteralPath $marker -PathType Leaf) {
        try {
            $reviews = @((Get-Content -LiteralPath $marker -Encoding utf8 -Raw | ConvertFrom-Json).packages |
                Where-Object { $_.sha256 -match '^[a-f0-9]{64}$' })
        } catch {
            Write-Warning "无法读取「$($book.Name)」的验收标记，将重新列入待验收。"
        }
    }

    $packages = @()
    foreach ($relative in @('施工输出/交付', '施工输出', '交付', '.')) {
        $folder = Join-Path $book.FullName $relative
        if (Test-Path -LiteralPath $folder -PathType Container) {
            $packages = @(Get-ChildItem -LiteralPath $folder -File |
                Where-Object Name -Match '^result(?:-.+)?\.zip$' | Sort-Object Name)
            if ($packages.Count) { break }
        }
    }

    if (!$packages.Count) {
        [pscustomobject]@{ 作品目录 = $book.Name; 状态 = '未发现标准交付'; 待打开 = $false }
        continue
    }

    foreach ($package in $packages) {
        $hash = (Get-FileHash -LiteralPath $package.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $record = $reviews | Where-Object sha256 -EQ $hash | Select-Object -Last 1
        $status = '待验收'
        if ($record.status -in @('已验收', '待返工')) {
            $status = $record.status
        } elseif ($reviews.Count) {
            $status = '待复验'
        }
        [pscustomobject]@{
            作品目录 = $book.Name
            状态 = $status
            待打开 = $status -in @('待验收', '待复验')
            结果包 = $package.FullName
            SHA256 = $hash
            包ID = $record.packageId
        }
    }
}
