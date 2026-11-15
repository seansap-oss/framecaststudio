# FrameCast Studio v0.11.2

A local-first video graphics editor with a multitrack timeline and local Live/Signage workspaces. Development checkpoint; read [BUILD-STATUS.md](BUILD-STATUS.md) for tested behaviour and remaining work.

![Running v0.10 editor](docs/editor-v010.jpg)

## Windows / your existing VS Code terminal

Stop the old server with **Ctrl+C** in the existing VS Code terminal. Download the v0.11.2 ZIP, then run:

```powershell
Set-Location D:\Framecaststudio
$archive = Get-ChildItem "$env:USERPROFILE\Downloads" -Filter "framecaststudio-workbench-v0.11.2*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $archive) { throw "Download the GitHub v0.11.2 ZIP first" }
$backup = "D:\Framecaststudio-backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item -LiteralPath D:\Framecaststudio -Destination $backup -Recurse
$unpack = Join-Path $env:TEMP "FrameCast-v0112-$(Get-Date -Format yyyyMMddHHmmss)"
Expand-Archive -LiteralPath $archive.FullName -DestinationPath $unpack -Force
$source = Get-ChildItem -LiteralPath $unpack -Directory | Select-Object -First 1
Copy-Item -Path (Join-Path $source.FullName '*') -Destination D:\Framecaststudio -Recurse -Force
Select-String -Path D:\Framecaststudio\index.html -Pattern 'v0.11.2'
py server.py
```

Open **http://localhost:4173**, press **Ctrl+F5**, and confirm **v0.11.2** in the header. Keep the existing VS Code window. The ZIP leaves local media and `publish-settings.json` untouched. Python 3.10+ and FFmpeg/FFprobe on PATH are required for fixed-frame local export; without them, the old browser real-time export remains as a fallback.

## Ticker inspector update

Select either Top ticker or Bottom ticker in the timeline. Each update is now an editable message row in Inspector: add, reorder, copy or remove rows, and choose a per-message emoji and horizontal separator beside its text. Direction, speed, hold and repeat appear below in the same inspector. Existing line-separated ticker text becomes rows when selected; saved projects retain rows and copied ticker layers. The Duplicate layer button is in every layer inspector.

## Editing controls

- Drop media onto a timeline lane. Drag a clip body left/right for timing and up/down for layering. Top visible tracks render in front.
- Drag either end to trim; use the header grip to reorder without changing timing. Double-click the track name to rename. Right-click for insert/delete/layer actions.
- Select a video/audio layer to reveal its audio lane. Drag the volume line; double-click to add automation points. Right-click a point to remove it.
- Select the incoming clip, open **Transitions**, choose a preset and **Apply to selected**. Or drag the preset onto the clip. Adjust duration in seconds.
- Click a monitor object for resize handles. Images support Fit/Fill/Center, opacity, rotation, flip, fades, slides and zoom.
- **Ctrl+Z / Ctrl+Shift+Z** undo/redo; **S** splits; **Delete** removes a layer; **Space** toggles playback outside text inputs; **Ctrl+S** saves a project.
- Tools dock left/right, float by dragging their header, collapse, pin and resize. **Reset layout** restores workspace proportions.

Save a project before closing or refreshing. Session undo and a saved panel layout are not an automatic media/project backup.

## Export and publishing

Use **Export & share**, choose destinations, framing, format and resolution, then render. With the local FFmpeg server, rendering advances frame by frame and can take longer than playback. Keep the tab visible while the browser supplies frames. Without the local server, browser rendering still records in real time. A shared aspect ratio is rendered once for selected destinations. Browser MP4 codecs vary; use local FFmpeg for H.264/AAC.

Connected publishing needs your configured Google/Meta developer apps and eligible accounts. See [PUBLISHING.md](PUBLISHING.md). Keep secrets in local configuration, never public `dist` files or browser JavaScript. Live streaming and rendered-video publishing are separate workflows.

## Build and verify

```powershell
npm test
py -m unittest discover -s tests -p "test_*.py" -v
npm run build
```

There are no npm dependencies to install. `dist/` includes only public assets. `vercel.json` builds this directory. Static Vercel hosting does not supply the local FFmpeg/OAuth backend; hosted backend work remains in the status report.

## Marked exports and render controls (v0.10.2)

Drag across the Export ranges strip above the timeline or set In and Out at the playhead. Name, adjust, and remove as many ranges as needed. Choose a range in Export & share to render only that section; choose Whole video for the original behavior. Ranges are saved in project JSON. During capture use Pause render / Resume render or Cancel render. Render remains real time; the controls do not speed up encoding.

## v0.10.3 range and quality update

The export-range lane now shares the timeline ruler and scroll/zoom. Set In shows a persistent marker; Set Out creates the range. Drag either edge to adjust, or edit numeric times. Render this range opens export with that range selected. Add range begins at the playhead and stops at the project end without shifting backwards. Export defaults to 60 fps and High quality. Local FFmpeg produces constant-frame-rate output (60 or 30), with H.264 CRF18 and AAC192k for High MP4/MOV. Browser capture still runs in real time and cannot guarantee every requested frame. Higher bitrate or constant frame rate cannot recreate missed source frames; a dedicated offline compositor remains outstanding. The editor timecode grid remains 30 fps; export rate is separately selectable.

## AV1 and HEVC export (v0.10.4)

In Export & share, choose MP4/MOV/WebM and a Video codec. Local FFmpeg offers H.264 MP4/MOV by default, H.265/HEVC MP4/MOV, AV1 MP4/WebM, and VP9 WebM when those encoders are installed. Unavailable options are disabled. High/Balanced/Small control codec-specific quality. HEVC/AV1 downloads can be slower to encode and may not play everywhere. Social publishing controls currently require H.264 MP4. Advanced codecs do not repair frames missed during real-time capture.

In your existing Windows PowerShell terminal, check codecs with `ffmpeg -hide_banner -encoders | Select-String "libx264|libx265|libsvtav1|libaom-av1"`. If FFmpeg is absent, install an official build that includes the desired encoders, restart the terminal and FrameCast. The ZIP does not contain an FFmpeg binary.

## v0.11.2 export engine

The local FFmpeg path requests each output frame at a fixed timeline timestamp, sends lossless PNGs in small batches, encodes once, then mixes source audio and checks the output frame count. Use MP4/H.264 High for broad playback and publishing compatibility. Pause stops between frame batches; Cancel stops the local encoder. Browser-only and static Vercel exports still use real-time recording. One-hour and 4K projects have not passed hardware endurance testing; per-clip keyframed volume is not yet reproduced in the new server mix. See BUILD-STATUS.md.

## v0.11.2 image motion and export correction

Upload an image as a timeline layer. The selected Image animation section includes masks, motion, cycle duration, direction, repeat, entrance/exit and layer duration or Until video ends. Animated GIF frames use Chrome ImageDecoder and timeline timestamps. Other browsers show a clear unsupported message on GIF import. Export ranges now use an actual select element. Fixed-frame export seeks only active video sources and reports the time if a current source fails to seek. Encoding speed offers Fast, Balanced and Quality; Fast changes only the encoding preset and cannot eliminate slow browser decoding of each frame. See BUILD-STATUS.md for verification limits.
