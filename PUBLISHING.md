# FrameCast Studio 0.9.0 — Windows local publisher

Install Python 3.10 or newer (with the py launcher) and FFmpeg (with libx264, AAC and libvpx-vp9). Open a new terminal after installing. From D:\Framecaststudio run:
    
    py server.py

Open http://localhost:4173. Leave the terminal running. The browser records the timeline in real time, then the loopback service uses FFmpeg to encode it once per ratio. MP4 and MOV use H.264 plus AAC, WebM uses VP9 plus Opus. Small prioritizes smaller files at lower quality. Downloads work without any social credentials. The preview resolution selector sets output dimensions. Export temporary files and sign-in tokens last for this server session. Download the files you want before stopping it.

## Register FrameCast once as the developer

Copy publish-settings.example.json to publish-settings.json. Edit only the copy. Keep secrets on this computer. Do not commit that file.

* Google Cloud: enable YouTube Data API v3, configure OAuth consent and add your test Google account. Create a Web application OAuth client and register exactly http://localhost:4173/callback/google as an authorized redirect URI. Enter the client ID and secret in the google fields.
* Meta for Developers: configure Facebook Login for Business, add the exact redirect http://localhost:4173/callback/meta in the login settings for development, and configure the app's Graph API version. Use a test user with an app role and management access to the target Facebook Page. Link the Instagram Business/Creator account to that Page. Configure permissions pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic and instagram_content_publish. Enter the Meta app ID, app secret, and the Business Login configuration ID if your configuration uses one. If the dashboard requires an HTTPS callback, this loopback integration requires an HTTPS callback deployment before it can be used with that app configuration. Production access for customers requires the relevant platform permission reviews.
* Restart py server.py after changing settings. In Export & share > Publishing accounts, connect Google and Meta. Complete consent on the provider page, return to FrameCast, click Refresh and choose your Page. Reconnect after restarting the server.
* For one vertical file: uncheck YouTube (landscape), check YouTube Shorts, Instagram Reels and Facebook Page Reels, and set each to 9:16. Choose MP4, resolution and compression. Render, download for review, set YouTube visibility, then click Publish to the selected destinations. Meta posts to the selected Page and its linked professional account. Each service processes its own upload. The backend uses Meta's resumable local-video upload flow. YouTube classifies eligible uploads as Shorts. Platform duration, permission, quota and processing rules still apply.
* For failures: inspect the per-platform error. For uncertain network outcomes, check the destination before retrying. Jobs are deduplicated per render/account/destination during a server session. This release is for a single operator on localhost. It does not provide hosted multi-user login, persistent background jobs or token storage.

## v0.8.0 editor and publishing checks

Select a media clip to expand its audio lane. Drag vertically on the waveform to set its level. Double-click to insert automation points, drag a point vertically to change its level, and right-click a point to remove it. On clips with automation, entering a numeric level in the inspector sets a point at the playhead. Horizontal movement from the clip body adjusts timeline start. Vertical movement drops the layer above or below the highlighted track without shifting its start time. Drag either end to trim.

Open Transitions, choose the outgoing and incoming video, select a preset and duration, and preview or apply. Transition previews temporarily play the overlap. Applying at a cut asks before moving the incoming clip. Crossfade clip audio is optional.

Export now lists readiness and results beside each render. The publish button names the ready destinations. Missing credentials, account connections, Page selections and vertical-format requirements appear beside the affected destination. Open video appears after YouTube accepts the upload. Google sign-in authorizations and Meta Page permissions must be tested against the intended accounts. Check the account before retrying any upload with an uncertain network result.
