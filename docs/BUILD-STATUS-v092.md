# FrameCast Studio v0.9.1

This is a local development release. The complete approved cloud/live product is still in progress.

## Implemented in this release
- Timeline zoom, second/frame ruler at 30 fps, edge snapping across tracks, Alt bypass, visible overlap duration and clip timing labels.
- Drop a transition onto the incoming video to infer its outgoing clip. A drop creates the requested overlap by moving the incoming clip when needed. The inspector remains available for manual choices.
- Per-layer exposure, brightness, contrast, highlights, shadows, white balance, saturation, hue, lift/gamma/gain and RGB controls. Preview and canvas export share processing.
- Copy/paste grade, three presets, before toggle and reset.
- Self-contained project JSON saving/opening with embedded local media, layer order, clip timing, grades, transitions and orientation framing.
- Transparent PNG export of the selected graphic, 4:5, 21:9 and custom project sizes.
- Six visual template buttons connected to the existing named template storage.
- Local Live workspace with camera/mic, screen share, video files, source gain, scene snapshots, preview/program, Take/fade, solo/split/PIP layouts, teleprompter and program recording.
- Local Signage workspace with video/image playlists, editable names and durations, ordering, fullscreen playback and a start/end schedule.

## Verification
JavaScript syntax and Python compilation passed. Targeted calculations passed for neutral color, exposure, temperature, frame time, snapping and snap bypass.
The browser could not launch in this execution environment because its local socket was denied. Camera capture, visual layout, the full browser render and live audio routing require Windows browser validation.
Live social publishing with authorized accounts remains unverified.

## Remaining approved work
- Hosted accounts, cloud storage/sync, billing and deployment.
- Remote guests, invitation links, backstage, producer roles and private communications.
- Live RTMP/multistream service, dual live outputs, live destination connections and reconnect monitoring.
- Guest ISO recordings and reliable resumable recording upload.
- Live platform comments and moderation, highlight markers and caption tools.
- Prerecorded cloud broadcasts and remote signage players.
- Background removal and a licensed premium media catalogue.
- Windows EXE, Mac/mobile packaging and subscription activation.
- UI refinement to the approved mockup and full browser/hardware regression testing.

## Known limits
- Live program currently records locally as WebM or browser-supported MP4. The editor still supports FFmpeg conversion through the local server.
- Live sources and scenes are session-only. Embedded project files save editor media and settings, not live devices, signage playlists, external browser assets or mixer settings.
- The project JSON format embeds media and may become very large for long productions.
- CPU color processing may reduce preview/render performance on high resolution clips.
- Local signage schedules run only while this page is open. Display timestamps use the computer's local timezone.
- The timeline uses 30 fps editing increments. Media can still contain other source frame rates.

## v0.9.1 correction
Larger readable controls and timeline rows, contextual audio/video inspectors, no transform handles for audio, and readable paused vertical ticker text. Full cloud and live feature backlog above remains pending.

## v0.9.2 image editing and assessment
Added a dedicated Images import button, 5-second default image duration, Split at playhead (S), image/graphic fades, slides and zoom, rotation and horizontal flip, Fit/Fill/Center controls, sticky timeline ruler, and Live source/scene thumbnails.
Image animations share preview and recorded output. Source media remains intact when splitting. Image audio is added on a separate Audio layer.
Long files skip automatic whole-file audio waveform decoding above 120 seconds. This prevents that specific large allocation; long-video editing/export is still not validated.
Recorded canvas export is real time. MediaRecorder chunks and embedded project JSON remain memory-heavy for long files. A proxy/media-reference workflow and streamed encoding are still required before claiming reliable one-hour or two-hour editing.
Image animation math and JavaScript syntax passed. Visual/capture integration remains unverified. Product is not ready for paid launch.
