# Poknapham Editing Suite v0.12.16

## Windows desktop launcher

The supplied Poknapham logo appears as a circular badge in the app header and
as the browser favicon. The Windows build uses that PNG as the executable icon.
The old FrameCast project structure and saved projects remain compatible.

To create a customer Windows executable, install Python 3 and FFmpeg/FFprobe on PATH,
configure `license-server.json` with your deployed HTTPS licensing URL, then
double-click `BUILD-EXE.bat` in the project folder. The script installs
PyInstaller and Pillow if needed and creates
`dist\PoknaphamEditingSuite\PoknaphamEditingSuite.exe`.
Keep the complete `PoknaphamEditingSuite` folder together when copying it
to another Windows computer. The package includes the FFmpeg and FFprobe
executables found on the build computer, but a build with separate FFmpeg DLL
dependencies may need those DLLs as well. Test on a clean Windows machine.

Running the EXE starts the local Python service and opens the editor in the
default browser at `http://localhost:4173`. It does not replace the browser
interface with a native Windows window. Configure
`publish-settings.json` beside the EXE to enable account connections. Never
include your credential file in a distributed copy.

The Windows executable must be built on Windows; the source ZIP and scripts
alone are not an already built EXE.

## Device-bound desktop licenses (3 + 3 + 6 months)

The **customer EXE** opens an activation page before the editor and render APIs
can be used. One customer gets three separate serials for consecutive terms:
three months, three months, and six months. A serial activates on one Windows
installation. The app asks your private licensing service on every request;
the service uses UTC dates, rejects another PC, and denies access at expiry or
revocation. Internet access and a running service are required. Its local
serial is stored at `%LOCALAPPDATA%\PoknaphamEditingSuite\license.key`.
Builds refuse to create a customer EXE until `license-server.json` contains an
HTTPS URL. The example points to Supabase project `xaysudrojogqmfkwafis`.
Copy it only after applying the included migration and deploying the included
Edge Function. A URL alone does not deploy that service.

The separate **owner EXE** is built on your Windows PC with
`BUILD-OWNER-EXE.bat` and installed with `INSTALL-OWNER-WINDOWS.bat`.
It needs no serial on that Windows installation. Do not distribute it. A
separate private kit issues and revokes customer serials through Supabase. Do
not put that kit, serials or the service role key in the customer package or a
public repository.

`py server.py` remains an unlicensed development mode, so it must never be
distributed as a customer product. The PC code hashes Windows MachineGuid;
Windows reinstall or identity change may require a supervised transfer. An
EXE running on a customer computer cannot be made bulletproof against a
determined attacker who patches it. Use a hosted service, TLS, private source
distribution and a clear transfer policy to limit casual sharing.

A local-first video graphics editor with a multitrack timeline and local Live/Signage workspaces. Development checkpoint; read [BUILD-STATUS.md](BUILD-STATUS.md) for tested behaviour and remaining work.

![Running v0.10 editor](docs/editor-v010.jpg)

## Windows / your existing VS Code terminal

The source package contains the build script. In the existing VS Code terminal:

```powershell
Set-Location D:\Framecaststudio
.\BUILD-OWNER-EXE.bat
.\INSTALL-OWNER-WINDOWS.bat
```

The scripts check that `package.json`, the header, and the local service agree
on v0.12.15 and bundle the same web assets, FFmpeg and FFprobe. For a customer
build, first deploy the licensing service, set `license-server.json`, then run
`BUILD-EXE.bat`. It writes
`dist\PoknaphamEditingSuite\build-info.json` with source hashes.
If Inno Setup 6 is installed, it also creates
`installer\PoknaphamEditingSuite-Setup-v0.12.15.exe`. Otherwise run
`.\INSTALL-WINDOWS.bat` after the build to copy the app and create a desktop
shortcut. This source archive does **not** include a prebuilt Windows EXE;
building Windows binaries requires a Windows machine.

Close the old localhost server with Ctrl+C before launching the EXE, so port
4173 belongs to the packaged app. Keep your existing VS Code window. The EXE
opens the browser interface served by the packaged local service. Check the
header and `/api/health` after activation for v0.12.15. Keep local media and
`publish-settings.json` outside any overwritten source archive.

## Export reliability update

Export & share now includes **File size mode → Target size**. Enter an approximate decimal MB budget per exported file. Requires local H.264 export. This uses average bitrate with an audio/overhead allowance; it is not an exact hard size cap. Lower targets reduce quality. Quality preset remains the default and retains existing behaviour. A 10 MB target for a ten-minute programme is too small for the configured audio plus useful picture quality.

Native exports display Preparing, Rendering, Finalizing and Verifying wall-clock durations. YouTube transfers recover from transient failures in the same upload session, and processing checks distinguish upload acceptance from processing success. Meta uploads display bytes sent, while Facebook acceptance is not labelled confirmed publication. See PUBLISHING.md for the required developer/account setup and limitations.

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

In v0.12.10, the local fixed-frame path uploads video sources to the Python bridge and asks FFmpeg to decode each source frame. This avoids the repeated Chrome video seeking that caused the reported timeout. A large original file is temporarily copied to the local server before rendering; allow disk space and time for that preparation. The browser still composes the graphics and sends output frames to FFmpeg, so this is not yet a fully native desktop renderer.

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

## v0.12.2 fast export preview

Export & share now has a Fast export checkbox. For one full-frame video with static text/image layers and simple source audio, the local bridge composites a single transparent graphic overlay with FFmpeg and attempts AMD AMF H.264 encoding when the installed FFmpeg lists it. If AMF fails, it retries on the CPU. Animated tickers, chroma key, image motion, transitions, multiple video tracks, audio effects and timed graphics use the existing renderer. The checked box is not a guarantee that a project qualifies. This preview has a generated 1-second video/audio/overlay test but has not been benchmarked on the user's laptop. Compare a short export visually before using it for publication.


## v0.12.3 render repair

For one full-frame video with titles and horizontal/vertical tickers, leave **Fast local export when compatible** enabled and choose **MP4 / H.264**. The local server runs FFmpeg directly, tries AMD AMF, and automatically uses software encoding if AMF initialization fails. Unsupported compositions retain the full compositor and all their effects.

The export dialog shows **Elapsed** and **Estimated remaining** separately. Native export supports pause/resume and cancellation; completed output has its frame count verified. If an export fails, use **Download render error report** in the results area.

Run locally with `py server.py`, then open `http://localhost:4173` and press Ctrl+F5. A static Vercel deployment alone cannot run the local FFmpeg engine.

See [validation results](docs/v0.12.3-validation.md) for tested behavior and remaining limitations.


## v0.12.5 fractional-duration export repair

This fixes the reproduced "expected 602 frames, got 601" failure. Native export now uses the same integer frame count throughout the pipeline, with exact frame timestamps in the intermediate MP4. Audio mixing no longer imposes a second cutoff on the copied video. Strict final frame-count verification remains enabled.

Use the existing local server (`py server.py`) and MP4/H.264 with Fast local export for supported single-video/title/ticker projects. Existing editor features and the full compositor remain available. Save the project before updating, stop the server with Ctrl+C, update the code, restart, then Ctrl+F5. The header and `/api/health` both identify version 0.12.5.

See [v0.12.5 test results](docs/v0.12.5-validation.md). The user's Windows source and AMD driver still require on-device verification.
