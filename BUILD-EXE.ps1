param([switch]$Owner)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$html = Get-Content -LiteralPath 'index.html' -Raw
$service = Get-Content -LiteralPath 'server.py' -Raw
if ($html -notmatch [regex]::Escape("v$version") -or $service -notmatch [regex]::Escape("APP_VERSION = '$version'")) {
    throw "Version mismatch: package.json, editor header and local server must all say $version. Build stopped."
}
Write-Host "Building Poknapham Editing Suite v$version from $PSScriptRoot" -ForegroundColor Cyan
if (-not $Owner) {
    if (-not (Test-Path -LiteralPath 'license-server.json')) {
        throw 'Customer build blocked: configure the deployed HTTPS license URL in license-server.json first.'
    }
    $licenseUrl = (Get-Content -LiteralPath 'license-server.json' -Raw | ConvertFrom-Json).url
    if ($licenseUrl -notmatch '^https://[^/]+') { throw 'Customer build requires an HTTPS licensing URL.' }
}

$python = Get-Command py -ErrorAction Stop
# Chocolatey exposes shim launchers in bin; those are not redistributable FFmpeg binaries.
function Resolve-MediaBinary([string]$name) {
    $command = (Get-Command $name -CommandType Application -ErrorAction Stop).Source
    $choco = if ($env:ChocolateyInstall) { $env:ChocolateyInstall } else { 'C:\ProgramData\chocolatey' }
    $candidates = @()
    if ($command.StartsWith((Join-Path $choco 'bin'), [StringComparison]::OrdinalIgnoreCase)) {
        $candidates += Get-ChildItem (Join-Path $choco 'lib/ffmpeg*') -Directory -ErrorAction SilentlyContinue |
            Get-ChildItem -Recurse -File -Filter "$name.exe" | Select-Object -ExpandProperty FullName
    }
    $candidates += $command
    foreach ($candidate in $candidates) {
        $item = Get-Item -LiteralPath $candidate
        # The supported Windows distribution includes full standalone binaries.
        if ($item.Length -lt 1MB) { continue }
        $versionText = & $candidate -version 2>&1
        if ($LASTEXITCODE -eq 0 -and ($versionText -join "`n") -match "^$name version") { return $candidate }
    }
    throw "Cannot locate a full $name.exe. A Chocolatey shim cannot be bundled. Install the full FFmpeg package."
}
$ffmpegBinary = Resolve-MediaBinary 'ffmpeg'
$ffprobeBinary = Resolve-MediaBinary 'ffprobe'
$encoderList = (& $ffmpegBinary -hide_banner -encoders 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0 -or $encoderList -notmatch '\blibx264\b' -or $encoderList -notmatch '\baac\b') {
    throw 'The bundled FFmpeg must include H.264 (libx264) and AAC for portable customer exports.'
}
Write-Host "Bundling $ffmpegBinary and $ffprobeBinary"

& $python.Source -3 -m pip show pyinstaller *> $null
if ($LASTEXITCODE -ne 0) {
    & $python.Source -3 -m pip install pyinstaller
    if ($LASTEXITCODE -ne 0) { throw 'Could not install PyInstaller.' }
}
& $python.Source -3 -m pip show pywebview *> $null
if ($LASTEXITCODE -ne 0) {
    & $python.Source -3 -m pip install pywebview
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the desktop window dependency.' }
}
& $python.Source -3 -m pip show pillow *> $null
if ($LASTEXITCODE -ne 0) {
    & $python.Source -3 -m pip install pillow
    if ($LASTEXITCODE -ne 0) { throw 'Could not install Pillow for the app icon.' }
}
$webAssets = @(
    'index.html', 'studio.css', 'editor-workspace.css', 'poknapham-logo.png',
    'sample.js', 'studio.js', 'layers.js', 'timeline.js', 'editing.js',
    'workspace.js', 'image-editing.js', 'editor-core.js', 'editor-workspace.js',
    'tracks.js', 'publish.js', 'ticker-inspector.js', 'render-ranges.js',
    'frame-seek.js', 'render-progress.js', 'deterministic-export.js', 'fast-export.js'
)
$appName = if ($Owner) { 'PoknaphamOwnerSuite' } else { 'PoknaphamEditingSuite' }
$arguments = @('-3', '-m', 'PyInstaller', '--noconfirm', '--clean',
    '--onedir', '--windowed', '--name', $appName,
    '--icon', (Join-Path $PSScriptRoot 'poknapham-logo.png'),
    '--add-binary', "$ffmpegBinary;.",
    '--add-binary', "$ffprobeBinary;."
)
foreach ($file in $webAssets) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Missing web asset: $file" }
    $arguments += @('--add-data', "$(Join-Path $PSScriptRoot $file);.")
}
if (-not $Owner) { $arguments += @('--add-data', "$(Join-Path $PSScriptRoot 'license-server.json');.") }
foreach ($file in @('server.py', 'desktop_shell.py', 'licensing.py', 'online_license.py', 'native_render.py', 'offline_render.py', 'export_budget.py', 'upload_transport.py', 'publish-settings.example.json')) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Missing build source: $file" }
}
$referenced = [regex]::Matches($html, '(?:src|href)="([^"]+\.(?:js|css|png))"')
foreach ($match in $referenced) {
    if ($webAssets -notcontains $match.Groups[1].Value) { throw "Editor references an unbundled asset: $($match.Groups[1].Value)" }
}
$entry = 'server.py'
if ($Owner) {
    $code = (& $python.Source -3 -c 'from licensing import machine_code; print(machine_code())').Trim()
    if ($LASTEXITCODE -ne 0 -or $code -notmatch '^[0-9A-F]{32}$') { throw 'Could not identify the owner Windows PC.' }
    $entry = 'server-owner-build.py'
    $ownerSource = $service.Replace('OWNER_DEVICE = None', "OWNER_DEVICE = '$code'")
    if ($ownerSource -eq $service) { throw 'Owner build marker missing in server.py.' }
    Set-Content -LiteralPath $entry -Value $ownerSource -Encoding UTF8
}
try {
    $arguments += $entry
    & $python.Source @arguments
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed.' }
} finally {
    if ($Owner -and (Test-Path -LiteralPath $entry)) { Remove-Item -LiteralPath $entry -Force }
}

$result = Join-Path $PSScriptRoot "dist\$appName"
if (-not (Test-Path -LiteralPath (Join-Path $result "$appName.exe"))) {
    throw 'The executable was not created.'
}
& (Join-Path $PSScriptRoot 'tests/check-bundled-media.ps1') -AppDirectory $result
Copy-Item -LiteralPath 'publish-settings.example.json' -Destination (Join-Path $result 'publish-settings.example.json') -Force
$checksums = [ordered]@{}
foreach ($file in (@($webAssets) + @('server.py','desktop_shell.py','licensing.py','online_license.py','native_render.py','offline_render.py','export_budget.py','upload_transport.py'))) {
    $checksums[$file] = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
}
([ordered]@{ version=$version; variant=$(if ($Owner) {'owner-pc-bound'} else {'customer-online-serial'}); builtUtc=(Get-Date).ToUniversalTime().ToString('o'); sourceSha256=$checksums } | ConvertTo-Json -Depth 4) |
    Set-Content -LiteralPath (Join-Path $result 'build-info.json') -Encoding UTF8
Write-Host "Built: $result" -ForegroundColor Green
Write-Host 'The EXE opens its own desktop window; it runs the local editor service without a console.'
if ($Owner) {
    Write-Host 'Owner build: no serial entry on this PC; a copied build is locked to the original Windows installation.'
} else {
    Write-Host 'Customer build: online activation and an active serial are required on every launch.'
}
Write-Host 'For social publishing, configure publish-settings.json beside the EXE.'
Write-Host 'Build identity is in build-info.json. No customer serial is in the EXE.'

if ($Owner) { Write-Host 'Run INSTALL-OWNER-WINDOWS.bat to install your private owner build.'; exit 0 }

# Optional conventional Setup.exe when Inno Setup is already installed.
$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
$isccPath = if ($iscc) { $iscc.Source } else { $null }
if (-not $iscc) {
    foreach ($candidate in @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe")) {
        if (Test-Path -LiteralPath $candidate) { $isccPath = $candidate; break }
    }
}
if ($isccPath) {
    & $isccPath "/DAppVersion=$version" (Join-Path $PSScriptRoot 'PoknaphamEditingSuite.iss')
    if ($LASTEXITCODE -ne 0) { throw 'The EXE built, but the Inno Setup installer failed.' }
    Write-Host "Installer: $(Join-Path $PSScriptRoot "installer\PoknaphamEditingSuite-Setup-v$version.exe")" -ForegroundColor Green
} else {
    Write-Host 'Inno Setup 6 is not installed; use INSTALL-WINDOWS.bat to install the built folder for this user.'
}
