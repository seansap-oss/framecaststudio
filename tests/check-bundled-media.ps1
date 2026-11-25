param([Parameter(Mandatory=$true)][string]$AppDirectory)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $AppDirectory '_internal')).Path
$ffmpeg = Join-Path $root 'ffmpeg.exe'
$ffprobe = Join-Path $root 'ffprobe.exe'
foreach ($file in @($ffmpeg,$ffprobe)) {
    if ((Get-Item -LiteralPath $file).Length -lt 1MB) { throw "Packaged media tool is a shim or incomplete binary: $file" }
}
$originalPath = $env:PATH
$output = Join-Path ([IO.Path]::GetTempPath()) ('poknapham-codec-' + [guid]::NewGuid() + '.mp4')
try {
    # Prevent an installed FFmpeg from hiding defects in the delivered application.
    $env:PATH = "$root;$env:SystemRoot\System32;$env:SystemRoot"
    & $ffmpeg -nostdin -hide_banner -loglevel error -y -f lavfi -i 'color=c=blue:s=160x96:r=30' -f lavfi -i 'sine=frequency=440:sample_rate=48000' -t 1 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest $output
    if ($LASTEXITCODE -ne 0) { throw 'Packaged FFmpeg failed to encode H.264/AAC.' }
    $probe = & $ffprobe -v error -count_frames -show_entries 'stream=codec_name,codec_type,nb_read_frames' -of json $output
    if ($LASTEXITCODE -ne 0) { throw 'Packaged FFprobe failed.' }
    $streams = ($probe -join "`n" | ConvertFrom-Json).streams
    $video = $streams | Where-Object codec_type -eq video
    $audio = $streams | Where-Object codec_type -eq audio
    if ($video.codec_name -ne 'h264' -or [int]$video.nb_read_frames -ne 30 -or $audio.codec_name -ne 'aac') { throw 'Packaged export failed codec/frame/audio verification.' }
    Write-Host 'Packaged H.264/AAC export verified: 30 video frames and AAC audio.' -ForegroundColor Green
} finally {
    $env:PATH = $originalPath
    Remove-Item -LiteralPath $output -Force -ErrorAction SilentlyContinue
}
