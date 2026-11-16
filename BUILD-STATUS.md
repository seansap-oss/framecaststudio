# v0.12.8 — export panel startup fix

The target-size change in v0.12.7 accessed its select before the new panel entered the DOM. This raised a null error at publish.js:11, prevented publishing initialization and left the render action failing because bridgeReady was undefined. Attach the panel before binding its controls. The export controls and render preparation are now verified in a DOM startup regression test and JavaScript unit tests; Chromium could not launch in this restricted test environment. No editing layout changes.

# v0.12.7 — predictable size controls and safer publishing

New target-size control for local H.264 export: decimal MB budget, 128 kbps audio, overhead allowance, average bitrate for libx264 or AMD AMF. Quality presets remain available. Impossible budgets are rejected before encoding; single-pass size is approximate, not guaranteed.

YouTube now sends authentication on upload PUTs, uses chunked resumable transfer, reconciles provider offsets after transient failures and avoids starting another session when a final response is lost. Processing status is checked separately. A pending status check never erases an accepted video ID. Shorts duration/orientation and title are validated. Meta transfers expose bytes sent, but interrupted Meta transfers do not yet resume.

Native stage timings (preparation/render/finalization/verification), finalization pause support and upload elapsed/progress reporting are added. Session-level duplicate prevention remains conservative on uncertain failures.

Validation: 25 JavaScript tests and 38 Python tests passed across the full suite and focused follow-ups. Includes an actual target-size FFmpeg video/audio export and full output decode; mocked upload interruption, lost final response, processing rejection, no-progress limits and file-budget validation. Build passed. Windows AMD target-bitrate behaviour and real Google/Meta sign-in/uploads are NOT verified here. No performance or size parity claim against Adobe/DaVinci, no 100% reliability guarantee. This is a local single-user development release, not a verified commercial publishing service.

# v0.12.6 — bounded finalization and faster structural verification

Validation: 25 JavaScript tests, 22 existing Python tests and two new finalization tests passed. Build passed. No new long-video or Windows benchmark was performed.

Finalization now checks MP4 sample-table frame count, falling back to a bounded packet scan for containers without that metadata. It no longer decodes every output picture a second time in the normal export path. This is structural validation, not a full corruption scan; regression tests still fully decode generated outputs and check exact timestamps.

Audio inputs are limited to the required source end. Finalization exposes audio/file writing progress and stops with an actionable error after 120 seconds without output/progress changes. Metadata probes have 30-second limits and packet scans 120 seconds. Original Windows media and AMD driver remain unavailable; the exact source of the user's 14-minute wait is not proven. No promised laptop completion time.

# v0.12.5 — fractional-duration export repair

Reproduced the v0.12.4 failure: a 10.020-second export at 60 fps requested 602 frames but produced 601. The native encoder used both a rounded-up frame count and a shorter time cutoff. The repair uses one integer frame plan for filtering and encoding; audio is trimmed/padded to that frame plan without cutting the copied video stream.

The intermediate video now preserves exact frame timestamps in MP4 instead of millisecond-rounded MKV timestamps. Final MP4/MOV output is checked for exact frame count and timestamp spacing in regression tests. Verification remains strict; the repair does not accept a missing frame as success.

25 JavaScript tests and 22 Python tests passed, including 11 fractional-duration/range cases, a 602-frame HTTP download, all seven supported container/codec combinations on this test host, and pause/resume/cancel. No editor controls or project features were removed. A generated 10-minute 720p export with audio and two moving ticker textures completed in 156.54 seconds on the test host; all 36,005 frames and the full output decode passed.

See docs/v0.12.5-validation.md for reproduction details, the long export result and the Windows verification boundary. The original user media and Windows AMD driver are not available in this environment; this is a verified repair of the reproduced timing bug, not a claim that every source file or hardware configuration is proven.

---

# v0.12.4 — explicit export preflight and native audio mixing

Native H.264 export now accepts additional audio tracks, mute, fixed clip/master volume, EQ, hum/hiss filters and compression through the existing FFmpeg audio mixer. Audio keyframes and complex visual effects still require the full compositor.

When Fast local export is checked, incompatible projects stop BEFORE rendering with a blocking reason. The user can explicitly uncheck fast export to choose the full compositor. No effects are silently removed.

25 JavaScript tests and 19 Python tests passed. Native tests include audio mixing, output frame verification, cancellation, pause/resume and API polling. The original Windows project remains unavailable: its exact blocker and performance are not yet verified. The earlier 136-second benchmark applies to v0.12.3 and was not rerun for this change. No claim of commercial editor parity.

---

# v0.12.3 — long-export boundary repair and native ticker export

Implemented:
- Clean decoder EOF is distinguished from a truncated PNG or a decoding error. Only a verified final picture within 250 ms of the video stream end may be repeated for a small audio/container tail. Midstream failures still stop with an error.
- Sequential decoding no longer restarts every 20 seconds; low-compression PNG transport reduces CPU work. The live preview stops redrawing over the fixed-frame compositor.
- One full-frame video with supported static overlays and horizontal/vertical tickers now uses a single native FFmpeg export. Text, fonts, icons and emojis are rasterized once; FFmpeg animates their textures. Eligible H.264 MP4 exports try AMD AMF and fall back to software if initialization fails.
- Native jobs run independently of long HTTP responses, with status polling, pause/resume and cancel. Output is verified against the expected frame count before a download appears.
- Elapsed time and estimated remaining time appear separately. Remaining time uses recent throughput, excludes pauses, and labels finalization honestly rather than promising an exact completion time.
- Error reports include settings, frame progress and FFmpeg log output before temporary resources are cleaned up.

Preserved: the editor, timeline, images, animation controls, audio controls, transitions, other codecs, export ranges, existing publishing integrations and project format. Complex projects continue through the full compositor rather than silently dropping effects.

Limits: native fast export currently requires one full-frame program video, H.264 MP4, unchanged source volume, and no transitions, chroma key, grading, animated images or additional audio mix. These projects retain the full compositor. No promise of Premiere/Resolve parity, universal GPU support, or a fixed five-minute export on every laptop. The user's original failing source is not available here. Windows AMF and Windows pause need device verification.

Validation and benchmark results: see docs/v0.12.3-validation.md. Do not treat this repair as a completed commercial launch audit.

---

# v0.12.2 render transport repair

Added fast-export.js to the Python public-file allowlist (it was incorrectly returning 404). Bodyless command handlers now drain the submitted JSON before reusing HTTP/1.1 connections. TCP_NODELAY avoids per-request delayed-ACK stalls. Video-frame GET requests retry transient connection failures up to three times; render mutations are not automatically retried. Python logs errors with a traceback for diagnosis. The user's exact 124.478-second failure is not reproduced without the original media/terminal logs. AV1 still uses the standard software path; AMD fast export requires H.264 and a compatible static project.

# v0.12.1 image uploader visibility

The Inspector always shows Add image / logo and animate directly under the layer selector. Upload creates a new image layer or replaces a selected image/Logo layer. Motion settings remain disabled until an eligible image is selected. The separate older generic graphic motion section is labelled accordingly.

# FrameCast Studio v0.12.1 — fast export preview

Fast export adds direct FFmpeg compositing for one full-screen source video, static graphics and source audio. AMD h264_amf is attempted when listed by FFmpeg, with CPU fallback if unavailable at runtime. More complex projects continue through the existing fixed-frame path. An integration test verifies frame count, overlay pixels and audio using a generated source. Actual five-minute target for ten minutes of media remains unverified on the user's hardware. Dynamic tickers are not eligible yet.

# FrameCast Studio v0.11.5

Local rendering now uses HTTP/1.1 persistent connections. Earlier builds used HTTP/1.0 and opened a new TCP connection for every frame request and batch upload, risking Windows ephemeral port exhaustion. A 1,200-request test verifies one connection is reused. FFmpeg pipe reads now have a 30-second deadline and report the source timestamp if stalled. Network failures identify the layer and source time. The user's Windows source export remains unverified; these changes address a concrete transport defect, not a guaranteed diagnosis from a screenshot.

# FrameCast Studio v0.11.4

The local source-frame transport now uses RGB24 PNG with explicit PNG chunk boundaries instead of an MJPEG stream. This addresses the image decode failure reported in v0.11.3. The regression test fully decodes the HTTP image payload using FFmpeg; the previous test only checked JPEG marker bytes. Nine Python service/export tests pass. Actual Windows Chrome and the user media remain unverified. This release does not claim all export issues are resolved.

# FrameCast Studio v0.11.3 — working development checkpoint

## Local export seek failure repair (v0.11.3)

The v0.11.1/v0.11.2 fixed-frame exporter still called `video.currentTime` for every output frame. Chrome could hang while seeking an active source, as the user's screenshot shows at 16.73 seconds. The local FFmpeg bridge now accepts the original video source and keeps a sequential decoder alive. The browser receives individual decoded frames for the compositor; it no longer seeks Chrome video elements while rendering. Backward timeline jumps restart the decoder. The existing timeline compositor, titles, overlays, and audio mix remain in use.

**Verified here:** 17 Node tests, 9 Python tests, local FFmpeg source-frame HTTP requests (repeat, forward, backward) and final video/audio frame-count export. A full interactive export in Chrome on the user's Windows hardware is still unverified; the sandbox browser could not launch. This is a specific repair for the reported seek timeout, not a claim that long 4K exports or all formats are production ready. Local FFmpeg and FFprobe are required for this path.

## Logo animation discovery fix (v0.11.2)

The v0.11.1 image animation panel appeared only when the selected layer had `kind: image`. The built-in Logo/Watermark/Ad layers have no `kind`, so uploading a logo through the existing asset control left the animation panel hidden. The panel now appears immediately below the layer selector for Logo, Watermark, Ad image assets and imported image clips. It includes a direct Upload / replace control. Both that control and the original Logo / ad asset control select the image and refresh the inspector. The motion renderer and timed GIF selection now apply to those built-in image assets too. Media has a clearer `+ Image / logo animation` button for creating new image layers.

**Verification:** unit test covers the previously hidden built-in Logo and imported images; JavaScript syntax, server tests and static build pass. Actual interaction on the user's Windows Chrome remains unverified until the updated branch is installed and tested there.

## Export repair and reusable image motion (v0.11.1)

The supplied Chrome screenshot showed two distinct errors in v0.11.0: Export section displayed literal HTML and `render-ranges.js` threw because the range selector did not exist; the fixed-frame export then failed with “Source video seek timed out.” The selector is now a real DOM element. The local export seeks only video sources visible at a given frame, preserves the main clip's source trim, skips redundant seeks, and gives the failing source time when an active video still cannot decode. This resolves the inactive-source wait path; an unsupported or corrupted active source can still fail.

Uploaded images now have per-layer shape masks (original/circle/square/rounded/shield), timed spin/flips/sway/float/pulse, direction, repeat, entrance and exit, and a duration or Until video ends. Their settings are stored on the layer and used by the existing canvas renderer, including fixed-frame export. Chrome ImageDecoder selects animated GIF frames by timeline time; browser support and large GIF performance still require on-device checks. Fast/Balanced/Quality encoder speed presets affect software encoding, not the per-frame browser decode cost.

**Verification:** JavaScript syntax and static build; 16 Node tests including active/inactive seek behavior; 8 Python service/encoding tests. **Not yet verified:** interactive image/GIF effects in the user's Chrome, the user's failed media seek, long 1080p/4K exports, or actual elapsed-time improvement on their Ryzen laptop. Browser launch in this workspace is blocked. Licensing and desktop packaging are planned, not implemented in v0.11.1.

## Fixed-frame local export (v0.11.0)

The local Python/FFmpeg server now accepts lossless PNG frames at explicit timeline timestamps. It encodes exactly the requested 30/60 fps frame count, mixes the uploaded original source audio on the same time range, then verifies the encoded count with FFprobe. Export ranges, resolution, format/codec, progress, pause between frames and cancel are retained. The previous browser-only real-time recorder remains as a fallback when the local server or FFmpeg is unavailable. The desktop/local workflow no longer relies on real-time canvas capture for final output.

**Verified:** 13 Node tests and 8 Python tests passed, including generated video/audio fixed-frame export and an HTTP API render session. Syntax and static build passed. A short generated FFmpeg export had the correct video frame count and audio stream.

**Not verified:** interactive editor end-to-end export (Chromium could not launch in this workspace); visual/source frame accuracy on real input; one-hour 1080p, 2K or 4K export; per-clip audio automation points and transitions in the server-side audio mix; colour/HDR fidelity and speed on the target Windows/Mac hardware. These require testing before jitter-free or commercial-quality claims. Video-frame seeking for every output frame is deliberately slow, especially at 4K. No proxy/cache or native decoder has been added.

This release updates the existing editor. It is not a completed commercial SaaS or an OBS replacement. No existing editing, Live or Signage module has been removed. The original v0.9.2 assessment is retained in `docs/BUILD-STATUS-v092.md`.

## Changed in v0.10.4

- Navy/gold workspace with tabbed tools, pinned panels, floating/docking controls, resizable sidebars/timeline and a compact project bar. Expanded timeline retains room for the monitor.
- Compact lower-third sample graphics keep the presenter's face visible. All previous graphic layers remain editable.
- Clip-body dragging changes timing and layer position in the same gesture. End handles trim independently. Track grips reorder without changing timing. Source boundaries and minimum one-frame duration are preserved.
- Visible timing labels, overlap regions, snapping guides, zoom, Fit, frame stepping, Duplicate and Delete.
- Transition preset selection plus **Apply to selected**: choose the incoming video/image and a preset; the preceding clip is inferred and an overlap is created. Explicit From/To controls remain available. Fifteen effects retained.
- Session undo/redo for layer state, timing, order, transitions, clip volume, grades, project title and mixer settings. Media references are retained for restoration. History has 40 entries; it is not a disk backup.
- Per-clip volume/mute/envelopes retained with clearer audio lanes. Program EQ, hum filtering, low-pass hiss reduction and compressor retained.
- Project v10 JSON adds title, mixer/key settings and embedded background to layers/media/grades/animations/transitions/framing. Loader accepts v9 files.
- Fixed colour-processed video scaling, paused ticker readability and removed-layer rendering.
- Local Live accepts project video sources directly; visible source meters/mute. Solo scenes mute unused sources. Removing a project-derived Live source no longer revokes its editor media URL.
- Export checks the actual local service and encoder, defaults to MP4, and reports unavailable encoders/accounts. Static website no longer throws while attaching publishing controls.
- Static deployment has an explicit public-file allowlist in `build.mjs`. Local credentials and Python are not copied into `dist`.

## Verification performed

| Check | Result |
|---|---|
| JavaScript syntax, Python compilation, patch whitespace | Passed |
| 13 Node tests: trim bounds, minimum frame, snapping/bypass, stacking, transition overlap | Passed |
| 5 Python service tests: health, credential isolation, origin checks, missing credentials, three-container encode | Passed |
| Browser duplicate, change start, diagonal drag across tracks, trim 8 to 5 seconds | Passed |
| Browser Fade through black, Undo and Redo | Passed |
| Browser numeric gain 20%, drag audio envelope to 20% / −14 dB | Passed |
| Browser MP4 render to 100%, download, inspect streams and exported frame | Passed: 854×480, about 8.36 seconds, native MP4 (VP9/Opus on test browser) |
| Local FFmpeg MP4/MOV H.264 + AAC; WebM VP9 + Opus | Passed with generated one-second media |
| Browser project sources → Take → local Live recording → download | Passed: VP8/Opus at 960×540 |
| Browser project rename/save; inspect title, two embedded assets and 16 settings | Passed |
| Image import/reopen round trip, physical camera/mic, touch devices | Not fully verified in this environment |
| Google/Meta sign-in and actual social upload | Not verified: no configured provider apps/accounts available |
| One/two-hour 1080p and 4K projects | Not validated; do not advertise support guarantees |

`docs/editor-v010.jpg` shows the running application, not an image-generated mockup.

## Existing features retained

Multiple video/audio/image/text layers; track naming/deletion/reordering; context-menu insertion; source trim; PIP/split layouts; eight resize handles; headline/speaker/tickers; horizontal/vertical ticker motion; speed/hold/repeat; emoji picker; movable logo/watermark; opacity; six named templates; brand colours; grade adjustments/presets; image fades/slides/zoom/rotation/flip; chroma key; monitor volume; local Take/fade; screen/camera/file sources; teleprompter; local signage playlist/schedule; 16:9, 9:16, 1:1, 4:5, 21:9/custom; 480/720/1080/2160 export options; captions and destination metadata.

Existing controls have not all been regression tested in every combination. Large projects remain hardware/browser dependent.

## Publishing and deployment

The local `server.py` contains Google and Meta OAuth/upload adapters. Run `py server.py` and provide valid provider app configuration for local publishing; see `PUBLISHING.md`. Selecting destinations does not connect accounts. No video was posted to a real account during these tests.

A Vercel static build serves the editor only. It does not run the persistent local Python/FFmpeg service. Hosted publishing, secure token storage, account authentication and provider approvals are still required for a public SaaS. The connected Vercel account did not return a FrameCast project during discovery; deployment there is not verified.

## Remaining approved work — retained in scope

- Hosted login, secure multi-user projects/storage/sync, billing and administration.
- Production publishing service, provider configuration/review and real upload validation.
- Proxy media, referenced projects and long-video/4K endurance tests. The local FFmpeg renderer now streams fixed frames; browser-only export still records in real time. Project JSON embeds media. No artificial clip-count limit is imposed, but hardware capacity is finite.
- Remote guests, invitations/backstage, producer roles, private communication and ISO recording.
- RTMP/multistream, destination health/reconnection, dual-orientation broadcasts, platform comments/moderation and prerecorded cloud broadcasts.
- Captions, highlight markers, background removal, licensed premium assets and standalone icon creator.
- Remote signage players/management. Current schedules require the page to stay open.
- Windows EXE, Mac/mobile packaging, signed subscription licences and renewal administration.
- Full visual parity with the approved broadcast mockup, accessibility/touch/responsive tests and comprehensive regression coverage.

**Release verdict:** suitable for local development testing; not ready to sell as the complete promised platform.

## v0.10.1 ticker inspector

Both ticker layers now use separate message rows with per-message emoji/icon and horizontal separator controls. Their direction, speed, hold and repeat controls appear in the same selected-layer inspector. Duplicates keep their own message list. Existing newline-separated text migrates into rows on selection. The local Python allowlist and static build include the new script. Syntax, 13 Node tests and 5 Python service tests passed. The browser security gate prevented an interactive browser check in this update, so inspect the local UI before relying on an export.

## v0.10.2 render workflow

Added separate named export ranges, range persistence, selected-range progress, render pause/resume and cancellation. Adjusted editor panel constraints at browser zoom breakpoints. Browser capture remains real time and the hosted SaaS/live roadmap remains pending.

## v0.10.3 verification boundary

Range alignment, visible In marker, edge dragging, duration labels and direct range selection were implemented. Export offers 60/30 fps with High compression quality by default; local encoder checks include average frame rate. This does not complete a deterministic offline renderer or prove jitter-free output on the user’s source media. Browser UI verification is outstanding.

## v0.10.4 codec support

Local FFmpeg detects H.264, HEVC, AV1 and VP9 encoders at startup. MP4 supports H.264/HEVC/AV1; MOV H.264/HEVC; WebM VP9/AV1. H.264 MP4 remains the social publishing path. Availability depends on the user’s installed FFmpeg build. Generated audio/video files were inspected with FFprobe for codecs and 60 fps. Playback compatibility and long-video export need validation on target Windows devices. Compression does not resolve browser capture jitter.
