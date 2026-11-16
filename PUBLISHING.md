# FrameCast Studio 0.12.7 — Windows local publisher

Install Python 3.10 or newer (with the py launcher) and FFmpeg (with libx264, AAC and libvpx-vp9). Open a new terminal after installing. From D:\Framecaststudio run:
    
    py server.py

Open http://localhost:4173 and leave the terminal running. Local fixed-frame export uses FFmpeg; compatible one-video/title/ticker projects use the faster native route. H.264 MP4 with AAC is the publishing format. Other supported codecs are download options. Export files, upload jobs and account tokens last for this server session: download completed files before stopping the server. A desktop EXE wrapper alone does not add persistence.

Target size is an approximate per-file budget with 128 kbps audio and 3% reserved overhead. It uses single-pass average video bitrate to preserve export speed. Content and hardware rate control affect the actual size; this is not an exact cap. Quality preset retains CRF/CQP quality control and can produce much larger files.

YouTube uploads now use authenticated chunks and query the existing session after transient failures, with bounded retries. An uncertain outcome never automatically starts another upload. After acceptance, the server polls processing status; unavailable/slow processing is reported as pending, not falsely marked published. Shorts are preflighted for square/portrait orientation and a maximum three-minute duration.

Meta uses the existing local video upload endpoints and now exposes bytes sent. It does not yet resume a partially transferred upload. Instagram polls its processing container before publishing. Facebook's finish response is labelled Accepted by Facebook; publication must be confirmed on the Page. Failed/ambiguous uploads are blocked from blind retries during the session to reduce duplicate posts.

No real social account has been connected or posted to in the automated tests. Google/Meta developer registration, OAuth consent, account eligibility, permissions and provider-side processing still require an end-to-end test before commercial release. Restart recovery, encrypted token persistence and durable upload queues remain future work.

## Register FrameCast once as the developer

Copy publish-settings.example.json to publish-settings.json. Edit only the copy. Keep secrets on this computer. Do not commit that file.

* Google Cloud: enable YouTube Data API v3, configure OAuth consent and add your test Google account. Create a Web application OAuth client and register exactly http://localhost:4173/callback/google as an authorized redirect URI. Enter the client ID and secret in the google fields.
* Meta for Developers: configure Facebook Login for Business, add the exact redirect http://localhost:4173/callback/meta in the login settings for development, and configure the app's Graph API version. Use a test user with an app role and management access to the target Facebook Page. Link the Instagram Business/Creator account to that Page. Configure permissions pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic and instagram_content_publish. Enter the Meta app ID, app secret, and the Business Login configuration ID if your configuration uses one. If the dashboard requires an HTTPS callback, this loopback integration requires an HTTPS callback deployment before it can be used with that app configuration. Production access for customers requires the relevant platform permission reviews.
* Restart py server.py after changing settings. In Export & share > Connected publishing, connect Google and Meta. Complete consent on the provider page, return to FrameCast, click Check connection and choose your Page. Reconnect after restarting the server.
* For one vertical file: uncheck YouTube (landscape), check YouTube Shorts, Instagram Reels and Facebook Page Reels, and set each to 9:16. Choose MP4, resolution and compression. Render, download for review, set YouTube visibility, then click Publish to the selected destinations. Meta posts to the selected Page and its linked professional account. Each service processes its own upload. The backend uses Meta's resumable local-video upload flow. YouTube classifies eligible uploads as Shorts. Platform duration, permission, quota and processing rules still apply.
* For failures: inspect the per-platform error. For uncertain network outcomes, check the destination before retrying. Jobs are deduplicated per render/account/destination during a server session. This release is for a single operator on localhost. It does not provide hosted multi-user login, persistent background jobs or token storage.

## v0.10.0 editor and publishing checks

Select a media clip to expand its audio lane. Drag vertically on the waveform to set its level. Double-click to insert automation points, drag a point vertically to change its level, and right-click a point to remove it. On clips with automation, entering a numeric level in the inspector sets a point at the playhead. Horizontal movement from the clip body adjusts timeline start. A diagonal body drag changes both time and layer position. Use the header grip to reorder without changing time. Drag either end to trim.

Open Transitions, select the incoming clip and a preset, then Apply to selected; FrameCast infers the preceding clip and moves the incoming clip if needed to create an overlap. Explicit From/To choices and temporary previews remain available. Crossfade clip audio is optional.

Export now lists readiness and results beside each render. The publish button names the ready destinations. Missing credentials, account connections, Page selections and vertical-format requirements appear beside the affected destination. Open video appears after YouTube accepts the upload. Google sign-in authorizations and Meta Page permissions must be tested against the intended accounts. Check the account before retrying any upload with an uncertain network result.

## Verification boundary

Provider sign-in and real account uploads have not been verified for this release. The local service, encoder paths, and actionable errors for missing configuration have been tested. A Vercel static deployment runs the browser editor only and must not be represented as a configured publishing backend. Provider dashboard settings and account eligibility must be checked during integration.
