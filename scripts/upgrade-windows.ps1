param(
  [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string] $Version,
  [Parameter(Mandatory)][string] $IsolatedInstall,
  [string] $RecordFile,
  [switch] $GracefulClose
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$programDirectory = Join-Path $env:LOCALAPPDATA 'Programs\Novel Studio'
$program = Join-Path $programDirectory 'Novel Studio.exe'
$data = Join-Path $env:LOCALAPPDATA 'Novel Studio'
$installer = (Resolve-Path -LiteralPath (Join-Path $project "release/NovelStudio-$Version-x64-Setup.exe")).Path
$isolated = (Resolve-Path -LiteralPath $IsolatedInstall).Path
if ($isolated -eq $programDirectory) { throw 'Supply the separately tested installation, outside the formal program directory.' }
if (!$RecordFile) { $RecordFile = Join-Path $project ".local/formal-upgrade-$Version.json" }
$RecordFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($RecordFile)

function Get-InstalledVersion($Directory) {
  (Get-Content -LiteralPath (Join-Path $Directory 'resources/app/package.json') -Raw | ConvertFrom-Json).version
}
function Get-FormalProcess {
  Get-Process -Name 'Novel Studio' -ErrorAction SilentlyContinue | Where-Object Path -eq $program
}
function Get-DataFingerprint {
  foreach ($name in @('library.sqlite', 'library.sqlite-wal', 'reference-v2.sqlite', 'reference-v2.sqlite-wal', 'expansion.json', 'embedding.json', 'retrieval-api.json', 'retrieval-provider.json', 'expansion-provider.json')) {
    $file = Join-Path $data $name
    if (Test-Path -LiteralPath $file) {
      [pscustomobject]@{ file = $name; sha256 = (Get-FileHash -LiteralPath $file).Hash }
    }
  }
}

$previous = Get-InstalledVersion $programDirectory
if ((Get-InstalledVersion $isolated) -ne $Version) { throw 'The isolated installation has a different version.' }
$files = @('Novel Studio.exe', 'resources/app/app/main/index.mjs', 'resources/app/dist/app.js', 'resources/app/dist/app.css')
$iconRelative = 'resources/app/app/assets/app-icon.ico'
if (Test-Path -LiteralPath (Join-Path $isolated $iconRelative) -PathType Leaf) {
  $files += @($iconRelative, 'resources/app/app/assets/app-icon.png')
}
foreach ($file in $files) {
  if (!(Test-Path -LiteralPath (Join-Path $isolated $file) -PathType Leaf)) { throw "Missing isolated app file: $file" }
}
if (!(Test-Path -LiteralPath (Join-Path $data 'library.sqlite') -PathType Leaf)) { throw 'The formal library was not found.' }

$running = @(Get-FormalProcess)
if ($running.Count) {
  if (!$GracefulClose) { throw 'The workbench is open. Exit normally or pass -GracefulClose.' }
  $windows = @($running | Where-Object MainWindowHandle -ne ([IntPtr]::Zero))
  if (!$windows.Count) { throw 'The workbench has no window that can be closed gracefully.' }
  foreach ($window in $windows) {
    if (!$window.CloseMainWindow()) { throw 'The workbench declined the graceful close request.' }
  }
  $deadline = (Get-Date).AddSeconds(20)
  do { Start-Sleep -Milliseconds 300; $running = @(Get-FormalProcess) }
  while ($running.Count -and (Get-Date) -lt $deadline)
  if ($running.Count) { throw 'The workbench did not close after requesting normal save and exit.' }
}

$before = @(Get-DataFingerprint)
$process = Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode) { throw "Installer exited $($process.ExitCode)." }
if ((Get-InstalledVersion $programDirectory) -ne $Version) { throw 'The installed version differs from the tested version.' }
foreach ($file in $files) {
  if ((Get-FileHash -LiteralPath (Join-Path $programDirectory $file)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $isolated $file)).Hash) {
    throw "The installed file differs from the tested file: $file"
  }
}
$after = @(Get-DataFingerprint)
if (($before | ConvertTo-Json -Compress) -ne ($after | ConvertTo-Json -Compress)) { throw 'The formal data fingerprint changed during installation.' }

$shortcutFile = Join-Path ([Environment]::GetFolderPath('Desktop')) '小说工作台.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutFile)
$installedIcon = Join-Path $programDirectory $iconRelative
$iconLocation = if (Test-Path -LiteralPath $installedIcon -PathType Leaf) { "$installedIcon,0" } else { "$program,0" }
if ($shortcut.TargetPath -ne $program -or $shortcut.IconLocation -ne $iconLocation) {
  $shortcut.TargetPath = $program
  $shortcut.WorkingDirectory = $programDirectory
  $shortcut.Description = '个人小说写作工作台'
  $shortcut.IconLocation = $iconLocation
  $shortcut.Save()
}
Add-Type -Namespace NovelStudio -Name ShortcutRefresh -MemberDefinition @'
  [System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
  public static extern void SHChangeNotify(uint eventId, uint flags, string path, System.IntPtr unused);
'@
[NovelStudio.ShortcutRefresh]::SHChangeNotify(0x00002000, 0x0005, $shortcutFile, [IntPtr]::Zero)
node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'qa-installed-smoke.mjs') $program $Version
if ($LASTEXITCODE) { throw 'Shortcut target smoke failed.' }
$record = [pscustomobject]@{
  priorVersion = $previous
  version = $Version
  dataUnchanged = $true
  installerSha256 = (Get-FileHash -LiteralPath $installer).Hash
  shortcut = $shortcutFile
  target = $program
  iconLocation = $iconLocation
  shortcutTargetSmoke = 'passed'
}
New-Item -ItemType Directory -Path (Split-Path -Parent $RecordFile) -Force | Out-Null
$record | ConvertTo-Json | Set-Content -LiteralPath $RecordFile -Encoding utf8
$record | ConvertTo-Json
