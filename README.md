# GO Classes Social Studio

Created by **Mrinal**. A responsive workspace for preparing images, videos/Reels, PDFs and captions for Instagram, a LinkedIn company page, X, two YouTube channels, WhatsApp and Telegram Channels, and ManyChat comment-to-DM automations. Each destination accepts only its supported attachment types.

## Start on Windows or macOS

Install [Node.js 22 or newer](https://nodejs.org/) and [Git](https://git-scm.com/downloads) once. On each teammate's Windows PC or Mac, clone this public repository:

```sh
git clone https://github.com/webdevmrinal/goclasses-social-studio.git
cd goclasses-social-studio
npm start
```

After cloning, **`npm start` is the only launch command**. It installs locked dependencies and the automation browser when needed, then opens the worker at **http://localhost:3000**. Keep the terminal open. `start-windows.cmd` and `bash start-macos.command` use the same launcher. Each copy has its own social logins, connections and local drafts; teammates sign in on their own computer.

The interface works on desktop, tablet and mobile browsers. Browser automation runs on the computer hosting that copy, which must stay awake. **Instagram music and shared-post Stories use your selected physical Android phone over USB or paired Wi-Fi on Windows.** Mac copies use browser publishing with music and Story disabled; a Mac phone driver has not been configured or tested.

### Updates from Mrinal

The launcher checks this copy's `origin` branch at startup and every ten minutes. You can also click **Updates / Check for updates**. When a newer revision is available, click **Update now**. Finish or stop current runs and close the music picker first.

The new code is checked out separately, dependencies are installed, and JavaScript/import checks run before the current app closes. The launcher restarts into the new version only when preparation succeeds, and restores the previous version if the new server fails to start. Social profiles, uploads, run history and `.env` stay in the original copy; browser drafts stay in local storage. Shared-workspace users may need to sign in again after the server restarts. Your original Git checkout is not reset or overwritten, and local code changes block installation. Saved versions live in the ignored `.studio` directory.

To publish a fix from Mrinal's development checkout, commit it and push `main` to **https://github.com/webdevmrinal/goclasses-social-studio**. Teammates do not need to run `git pull`. The app never installs updates automatically. If you launch with `npm run dev`, restart once with `npm start` to use the updater.

This checkout uses `origin` and its current branch by default. `UPDATE_BRANCH=main` in `.env` can pin the update branch. A ZIP download without Git history cannot check for updates; clone the repository for this workflow. Mrinal's visible authorship and LICENSE remain in every version. Because the repository is public, its source can be viewed and copied.

## First use

1. Open **Connections**. The supplied LinkedIn admin dashboard and ManyChat new-automation builder URLs are prefilled, along with both YouTube channel names and handles.
2. Add the expected Instagram handle. X detects and saves its active handle during the first check when the field is empty; an explicit expected handle is always enforced. Confirm the exact LinkedIn company name; “GO Classes” is the initial value.
3. Click **Check logins** to check all eight services, including WhatsApp and Telegram, regardless of the destinations selected for posting. Each card’s **Open & check** checks just that service. Browser destinations use a separate automation browser. Instagram checks use Android when that feed transport is selected; Android posting and receipt checks never create a desktop Instagram page. Sign in there and complete any security checks. The app never asks for your social account passwords.
4. Use **Open & check** for both YouTube destinations. The app reads each configured public handle, checks its exact channel name, saves the `UC…` ID automatically, and verifies your signed-in channel. DA and CS can share one Google login. The worker selects the matching channel in YouTube's account switcher when needed and checks the name and handle again. Both destinations can show Verified even though only one channel is active at a time; identity is checked again for each post.
5. LinkedIn must open the configured company admin view. If it does not, ask a company page administrator for posting access. Merely having the admin URL does not establish permission. The adapter also requires the configured company identity inside the composer.
6. Click **Continue to Compose** to start with verified destinations. Connections is the landing page and the first navigation step; you can also open Compose to prepare a draft. Upload images and enter captions, or **Import captions** using the delimiter headers below. Include only the caption sections you need. Missing or empty captions leave those destinations off. Enabling an empty destination opens a caption dialog. A local image preview appears immediately while uploading, then switches to the preserved server copy. Drag the grip to reorder images, or use the arrow keys/buttons. Image removal, reordering and metadata cleaning can be undone. The draft saves on this device. **Export** saves a portable text copy.
7. Preview all selected destinations and click **Run test**. The test prepares real composers and takes screenshots, stopping before publication. ManyChat prepares an inactive draft on an existing post for rehearsal; it may cache draft settings and save draft link buttons, but never clicks Go live.
8. Review screenshots in **Activity**. Test one destination at a time before running the full queue.

To recreate a deleted post or rebuild a job, stop any active run, expand the job in **Activity**, and choose **Start fresh**. Select the destinations to include (previously published destinations start unchecked), then choose **Open in Compose**. Captions, photos, platform image choices, song details and Story layout are copied; old Instagram/ManyChat post links and live authorization are cleared. The new draft starts in TEST mode and requires a fresh preview and LIVE confirmation. Uncertain outcomes must be verified in Activity first.
9. When ready, enable **LIVE**, review again, and type `POST` to authorize that particular run. Mode returns to TEST after starting the run and on every page reload. An environment variable cannot enable LIVE.

### Google says “This browser or app may not be secure”

In Connections, expand the account’s **Settings** and use **Manual sign-in** for ManyChat or YouTube. This closes the tool's connected browser and opens installed Chrome (or Edge) with a separate saved profile and **no automation connection or debugging switches during sign-in**. Complete the login yourself, then click **Finish sign-in & check** in Studio’s sign-in notice. It gracefully closes only the dedicated sign-in browser and checks that saved Web session, without requiring an offline phone. **Cancel sign-in** closes that window and unlocks the workspace without starting a check. Closing the window yourself also unlocks the controls immediately; the notice stays available to check the saved session. Instagram transport, music and Story controls update without reloading or losing your draft.

The worker now prefers installed Chrome, then Edge, then bundled Chromium. Install/update Chrome if needed. Google can impose additional account, device, or organization restrictions; this feature does not guarantee authentication or bypass Google's checks. Keep normal account security and two-factor authentication enabled.

Account checks wait up to 60 seconds for X account controls and YouTube channel/menu data instead of treating a loading screen as a signed-out account. A loading timeout, missing setup, and a wrong account have separate statuses. Retry **Open & check** if a site remains slow. Browser focus emulation and background rendering settings keep the connected worker responsive when its window is behind the workspace. Manual sign-in still runs without an automation connection.

The automated suite uses local fixtures. Separate signed-in TEST runs have verified preparation on the original six destinations, WhatsApp and Telegram, as recorded below. Platform adapters use English-language controls and stop when identity, selectors, or success confirmation cannot be verified. Rehearse new content before using LIVE. Offline fixtures and signed-in TEST rehearsals do not publish. On 21 October 2026, Mrinal separately authorized one actual LIVE post across the configured destinations to validate native submission acknowledgements.

## WhatsApp Channel

Connections is prefilled with **GO Classes for GATE CSE/DA** and its verified public channel link. Use **Open & check** to link WhatsApp Web on the worker through your phone's **Linked devices** if required. The worker preserves its dedicated browser profile and reuses one WhatsApp tab. If multiple worker WhatsApp tabs exist, it stops for you to close the extras. It waits up to 90 seconds for initial loading, distinguishes a QR/logout screen from a loading timeout, and never clicks a session's **Use here** takeover prompt. Session expiration cannot be prevented; relink on the worker and select Continue when asked.

A run containing WhatsApp checks its linked session, exact channel name, unique public channel link, admin update composer and unsent drafts **before any destination runs**, and checks again at WhatsApp's turn. It searches only the Channels drawer. It never uses personal-chat search or a personal message composer. A missing or ambiguous channel, mismatched link, existing media selection or unsent text draft pauses for review. It preserves existing drafts.

Add `=====WHATSAPP=====` to imported captions. This worker supports text-only channel updates, **one image**, or **one video up to 64 MiB**, with a caption of up to 1,024 characters. Choose the file independently in the WhatsApp tab. Additional or mixed attachments are blocked. PDF upload is unavailable in this WhatsApp Channel worker; use LinkedIn or Telegram for a PDF. This restriction describes the implemented worker route, rather than all WhatsApp clients or account features.

TEST prepares the native channel composer, verifies its caption and attachment, and captures only the channel header or prepared update. Send and Enter-to-send are blocked during preparation. TEST never clicks Send; it discards its own media selection and clears any caption WhatsApp copies back into the update box only if it exactly matches the rehearsal text. Changed or human-written drafts are preserved for review. Private chat lists, full WhatsApp page HTML and QR codes are not captured in Activity.

LIVE still requires that run's reviewed `POST` confirmation. Navigation, channel-title changes or human edits invalidate preparation. Only the verified Send control is armed for one final action. The worker then looks for one new matching channel update with a native Sent/delivered acknowledgement, independently of audience view counts. An unconfirmed outcome requires manual verification before retrying. Native platform notices and disclosure requirements remain applicable.

YouTube confirmation opens one fresh, owned channel-feed tab when the original feed stays stale after Post. It preserves the original composer and baseline, checks the exact author, complete caption, media and new permalink, then closes only that observation tab. It never repeats Post.

## Telegram Channel

Connections is prefilled with **GO Classes · @goclasses_cse**, [t.me/goclasses_cse](https://t.me/goclasses_cse). This is the broadcast channel; the discussion group in its description is a different destination. Sign in yourself at **Telegram Web K** on the worker using Telegram’s QR/phone flow, then use **Open & check**. The app reuses one Telegram tab and refuses multiple worker Telegram tabs or an unsupported Web client.

Add **=====TELEGRAM=====** to the caption import. Both channel sections are optional; a missing section clears its previous imported caption. A selected Telegram destination needs its own caption. Choose text only, an ordered album of up to **10 photos**, **one MP4 video**, or **one PDF**, independently of the other destinations. Text-only updates allow 4,096 UTF-16 units; attachment captions allow 1,024. Telegram's MOV conversion changes the preview bytes, so this worker requires MP4 to verify the reviewed video unchanged. The worker uses the upload limits below and does not assume Premium allowances. See [Telegram's file-sharing FAQ](https://telegram.org/faq) and [photo albums](https://telegram.org/blog/albums-saved-messages).

Before any destination in a run containing Telegram prepares or publishes, the worker freshly checks its session, exact channel name, the public **Link** row in **Channel Info**, and an editable **Broadcast** composer. A personal conversation, discussion group, read-only channel, existing draft, reply/edit/forward helper or media dialog pauses the run. The same channel and composer are checked again at Telegram’s turn.

TEST pastes the Unicode caption through the native editor, verifies the decoded photo content against the reviewed files (Telegram recompresses PNGs as JPEGs), then pins the generated preview hashes to detect any later change in count, content or order, blocks Send and Enter, and removes only its own unchanged draft. If a person changes the text or photos or navigates away, that draft is preserved. Activity captures only the verified channel header and owned composer—not private chats, QR codes or full Telegram HTML.

LIVE requires the existing per-run **POST** confirmation. The adapter persists submission intent, arms one exact Send control, and never retries that side effect. Confirmation requires a new native channel record with a positive, safe integer server message ID, the matching caption/photo count, no pending/error marker, and its own **Copy Message Link** permalink for the configured public username. Fractional optimistic message IDs are not server acknowledgement. An ambiguous or missing confirmation remains **Verify outcome**, preventing accidental duplicate retries.

The interface uses locally served [Web Awesome](https://webawesome.com/docs/) components for the segmented mode group, contextual tooltips and run progress. TEST and LIVE have distinct accessible colors in light and dark themes. No UI assets require an external CDN. Motion honors reduced-motion settings. Library licenses remain in THIRD_PARTY_NOTICES.md; Social Studio’s Mrinal attribution is retained.

## USB Android phone (Windows)

The dashboard includes **Scan for phone** and **Show screen**. Enable Wireless debugging on the phone and use the same trusted Wi-Fi as the Windows PC. Scan reconnects paired ADB TLS devices and lists USB and Wi-Fi separately. Choose **Use Wi-Fi** for the intended phone; its hardware serial is pinned, so a changed network port can reconnect to that same phone before a new native session. An unrelated phone, virtual device or reused address is rejected. The app never replays an interrupted Share/Save after a connection loss.

For a new pairing, expand **Connect a new Wi-Fi phone**, open **Pair device with pairing code** on Android, and enter the pairing IP:port plus the six-digit code locally in Studio. The pairing port differs from the connection port. Codes are sent to ADB through stdin and are not saved. Corporate Wi-Fi can block discovery; USB remains available.

**Show screen** opens a separate scrcpy window using the selected phone, capped at 1024 pixels, 30 fps and 2 Mbps H.264, with audio for song previews. The first use downloads the pinned official Windows release and verifies its SHA-256 before extracting it. Progress is visible in Studio, consoles are hidden, clipboard autosync is disabled, and **Hide screen** releases the viewer without closing Instagram. The phone must be unlocked and available; interact with it during the manual music handoff, then return to Studio to check/approve the song and continue. Scan, pairing and device changes cannot interrupt an automated step. `npm run test:wifi-phone-ui` uses isolated mocked hardware to check the dashboard and API; unit tests cover identity, changed ports, pairing, cancellation and viewer startup.

An unrooted USB phone handles music and Stories. Enable USB debugging, connect/unlock the phone and authorize this PC. In Connections or Instagram Compose, use **Change device → Use phone** to bind its exact USB serial. Choosing a phone does not change its display. Disconnecting it never selects another device. Appium installs its automation helpers on the selected phone without resetting Instagram or its login.

In the Feed header, **Publishing method** has separate **Web** and **Phone** choices. Native choices bind the configured target; choosing Phone opens USB selection if none is bound. Keep **Web** for fast feed uploads. With music enabled, **Choose on device** pauses at the native Instagram music library every run, with no automatic song search and no required title or artist. Readiness and final validation both ignore stale picker IDs in this mode. Preview your song on the phone, click **Check selected song**, then **Use this song & continue** in Studio. Leave the phone’s arrow, Done and Share controls to the worker. The timer pauses during this handoff. TEST discards the owned local edit without saving the published post. LIVE verifies the actual native track and unchanged post before one music Save. The following Story reuses the confirmed feed music. Story publishing uses the editor’s **Your story** shortcut once in LIVE, without pressing the blue audience arrow. TEST leaves that shortcut untouched. Stories target Instagram. The Facebook control and requirement have been removed. Native Instagram account settings are not changed.

Web feed checks use the Web account. Android feed checks use only the selected native device. Web plus music/Story checks both required locations, with a separate device-bound native status. Prepare captions, images and Story layout before borrowing the phone; connect it only for the native steps, then use Stop now before disconnecting unfinished work. Phone calibration must be tested against its current Instagram layout; hardware speed does not remove UI-change or network risks. On 23 October 2026, an unrooted Samsung SM-A166P (Android 16, Instagram 452.1) completed real-device TEST rehearsals: manual song preview/check/approval in Edit info, and the exact existing feed post shared into the native Story editor with reviewed card placement and Instagram-only selected. Both stopped before online Save/Share, discarded only their owned drafts and returned to the verified profile. The LIVE rehearsal on 23 October confirmed the Web carousel, manual phone music Save, linked shared-post Story, LinkedIn, X, both YouTube channels, WhatsApp, Telegram and ManyChat. The direct Story shortcut returned to the original feed sharing sheet without the older success sheet. The new confirmation closes only known empty navigation, opens the account’s own published Story viewer, and compares its recent card/link image region with the reviewed preview. It never retries Share to verify a result. This read-only fallback was tested against that published Story and returned the phone to its profile.

## Instagram music and Stories (physical phone)

Use **Web** for a fast Feed upload, then let the selected USB or Wi-Fi phone add music to that exact published post and share it to Story. **Phone** is also available for a native Feed upload. There is no virtual-device launcher or fallback. Copies with an old virtual-device setting open with no phone selected; use **Connections ? Scan for phone** to choose the intended physical device.

**Add music** and the Story link have separate switches. Choose music manually on the phone during the run, enter song details, or browse real Instagram recommendations from the current upload. Studio pauses for ambiguous native controls and resumes only after checking the expected screen. A music failure leaves a confirmed Feed marked published; retry just music. Story reuses verified inherited music and never uploads the Feed again.

The existing Windows phone tools live under `%LOCALAPPDATA%\GoClassesSocialStudio\android-worker`: Android platform-tools in `sdk`, Appium with its UiAutomator2 driver in `automation`, and the Java JDK path in `installation.json`. This path is retained so the existing physical-phone installation and debugging authorization continue to work. No virtual-device tools, images or display tuning are needed.

- `npm run phone:status` reports installed phone tools and the local driver.
- `npm run phone:driver` starts only the verified loopback Appium service on `127.0.0.1:4731`.
- `npm run phone:doctor` checks the UiAutomator2 prerequisites.

Driver startup never starts a device or changes its display settings. Scanning, mirroring, touch guard and native publishing remain bound to your selected phone identity. Never disconnect during a pending Save or Share. TEST does not publish or save edits to an online post. LIVE retains account, caption, media, dependency and once-only submission checks.

## Compose defaults

Photo uploads automatically remove removable embedded origin metadata before selection. The original is retained separately, and the cleaned image is rescanned and checked for identical decoded pixels, dimensions and compressed image data. This is a container-metadata check, not a prediction of platform AI labels. Videos and PDFs stay unchanged. Idle older drafts with embedded origin markers are cleaned when opened or reviewed.

New drafts default LinkedIn, WhatsApp and Telegram to Instagram photo 2 (or its only photo). The selection follows Instagram's order and cleaned-file replacements. Pick another thumbnail to override one channel; use its Instagram #2 button to follow again. The default switch preserves custom channel selections. X and both YouTube accounts keep their normal media selection.

Story stays off after caption import, even when an Instagram Story section supplies a link suggestion. Enable it explicitly. New Story/link placements align automatically; dragging or sizing makes placement custom. Auto-align sits below the mockup. ManyChat imports reset to automatic link detection; manual button titles remain available alongside Re-detect buttons. Automatic recovery starts collapsed in Activity, with its current state badge visible.

## Interface

The supplied Social Studio redesign is implemented with local fonts and assets: one platform rail, separate Feed/Story editors, a compact media library, one native-style preview, a destination checklist in Review, and searchable Activity rows with delivery details. YouTube groups its two accounts while keeping captions and selections independent. ManyChat is separate reply automation. Operational controls live in the connection-status panel and Connections. The action row occupies its own layout space on desktop, tablet and mobile; it never covers the editor.

## Caption fact review

Preview flags likely letter-for-number mistakes (including styled `𝐐` / `𝐐𝟔`), invalid written-month calendar dates, and conflicting vacancy counts, deadline dates/years/times, monthly pay and minimum marks across selected captions. Unicode styling is normalized for comparison; missing facts and different detail levels are allowed. A flagged LIVE run or retry requires an explicit source-review acknowledgement before POST. Any caption or selection change expires that acknowledgement. The API enforces the same check. Values are never silently corrected.

This compares the captions you supplied; it does not independently validate an official notice or read the image text. Matching captions can still repeat the same factual error.

## ManyChat

The worker opens **New Automation → Auto-DM links from comments** in your ManyChat workspace. Existing library URLs are upgraded to its new-automation builder. It selects a specific post, checks **any word**, enables public comment replies, keeps the default opening DM, and fills the final **DM with a link** field with your ManyChat caption. Follow and email requests and the follow-up DM stay off.

Paste links into the DM text, including plain URLs or Markdown links. The app detects unique links, suggests button names within 20 characters, and shows the names and URLs in Compose and Preview. The original DM text is preserved. Edit, remove, or add buttons before running; edits keep a custom set, and **Refresh from DM** regenerates buttons from the current text. More than three buttons blocks the run until you choose up to three. The worker verifies each saved label and URL. ManyChat documents the [three-button limit](https://help.manychat.com/hc/en-us/articles/16654065283100-Quick-Automation-Auto-DM-links-from-comments) and [button title limits](https://help.manychat.com/hc/en-us/articles/14281157003292-Buttons). The main DM can contain up to 1,000 characters.

Connections includes an editable pool of 20 comment replies, one per line. Compose previews the next three. ManyChat shuffles those three replies under the post; the worker advances to the next three only after a confirmed LIVE activation. Tests do not consume the rotation, and the position persists across worker restarts.

ManyChat runs after the publishing destinations in browser-only runs. In a browser/phone pipeline, it can start as soon as the Instagram feed is confirmed, alongside phone music and Story work. In LIVE, the worker finds the new Instagram permalink by comparing the account's posts before and after publication, then matches that permalink and its exact caption in ManyChat. It stops for intervention if the intended post is unavailable or ambiguous. An explicit **Instagram post URL** in Compose supports a ManyChat-only run. In TEST, with no explicit URL, it uses the latest existing post solely for rehearsal and records that choice in Activity. Test mode never clicks **Go live**. A confirmed LIVE run activates once and waits for both **Edit** and **Stop** controls; a lost confirmation requires outcome verification before retrying.

The builder can resume an inactive draft. The worker replaces its managed text, replies, selected post, and link buttons. It never edits an already active automation. Arbitrary flow-builder blocks and image DMs are outside this specific automation workflow.

## Shared access and free hosting

A static host or a typical serverless function cannot provide the persistent, visible browser and on-disk profile used here. The practical low-cost arrangement is **one existing company computer running this app, accessible through your network or a Cloudflare Tunnel**. The worker still needs power, connectivity, and someone available for occasional logins or CAPTCHAs.

### Same office network

Copy `.env.example` to `.env`, then set:

```dotenv
HOST=0.0.0.0
PORT=3000
APP_PASSWORD=use-a-long-private-password-of-at-least-16-characters
```

Restart with `npm start`. Allow Node.js through the OS firewall on your trusted private network, and open `http://WORKER_LAN_IP:3000` on a phone or another computer. All team members use the workspace password. Use HTTPS through a tunnel/reverse proxy for access beyond a trusted local network.

### Shared HTTPS URL through Cloudflare

[Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/) describes connecting an existing local service. Use a managed tunnel with a public hostname mapped to `http://localhost:3000`; it does not require inbound port forwarding. A stable public hostname requires a domain you control and the applicable Cloudflare account setup; domain registration can cost money.

Configure `.env` before exposing the app:

```dotenv
HOST=127.0.0.1
PORT=3000
APP_PASSWORD=use-a-long-private-password-of-at-least-16-characters
APP_ORIGIN=https://social.your-company.example
COOKIE_SECURE=true
TRUST_PROXY=1
```

Replace APP_ORIGIN with the exact external URL, with no trailing slash. Team members should use that external URL; local mutations are rejected when their origin differs. Configure an identity-based company access policy in Cloudflare if your company uses it. This app provides one shared workspace password, not individual employee roles. Everyone with access can publish with the worker's logged-in accounts.

[Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) are an option for a temporary trial:

```sh
cloudflared tunnel --url http://localhost:3000
```

Set APP_ORIGIN to the generated HTTPS URL, set the password and secure-cookie options above, then restart the app. Cloudflare documents Quick Tunnels as development/testing services, with limits and no SSE support. The UI includes a polling fallback. Use a managed tunnel for ongoing company access. Free-tier availability and limits are controlled by Cloudflare; this project does not provision hosting or promise a permanently free cloud worker.

The app refuses shared binding or a configured public origin without a password of at least 16 characters. Without a password, it also rejects non-loopback hostnames, including a tunnel hostname.

## Editing each destination

The workspace keeps secondary controls collapsed: account fields and manual sign-in are under **Settings**, the full per-platform photo picker and order controls are under **Choose photos**, and per-file restore and download are under **File actions**. Images show a visible **AI metadata / Origin metadata / Clean** chip, and detected origin metadata gets a direct **Clean metadata** action. **View report** opens the full metadata report. Compact image tiles have labeled **Move earlier**, **Move later** and **Remove** buttons. Run screenshots and full diagnostics are under **Details**. Posting errors, excluded destinations, retry actions and LIVE confirmation remain visible. Mrinal’s attribution stays in the sidebar and mobile header.

Upload up to ten originals to the shared library, then open each platform tab on the right. Each tab shows its selected media, order, caption and blocking issues. Video previews have playback controls; PDFs have document previews and filenames. Use **×** on a thumbnail to remove that file only from this destination, or **Remove all** for an empty selection. The picker lets you restore files and reorder photo galleries; unavailable formats show their reason. A video or PDF replaces that destination's photo gallery. LinkedIn, X, YouTube Community, WhatsApp and Telegram also support explicitly chosen caption-only posts; Instagram needs a photo or Reel video. Empty selections survive reloads and library changes. The shared library expands without an internal scrollbar, and long filenames fit compact tiles. Metadata cleaning, restoring originals and Undo preserve destination assignments.

The appearance button in the top bar cycles **System → Dark → Light → System**. Its preference persists on the device; System follows the OS. Transitions respect reduced-motion settings. UI icons are a small, locally served Lucide set; see [third-party notices](THIRD_PARTY_NOTICES.md). Regenerate them with `npm run icons:build` after updating the icon package. Mrinal attribution remains in the interface and source.

## Queue behavior

- Runs containing both browser and Android work automatically use two resource lanes: one browser destination and one phone task at a time. After the Instagram feed and its link are confirmed, phone music/Story can overlap ManyChat and the other browser destinations. Browser tasks stay sequential to limit resource use and protect shared account sessions. Browser-only and phone-only runs stay sequential. Only one run or login check can use the workspace at a time.
- ManyChat waits for the selected feed to succeed; Story waits for that feed and its music step. A phone song handoff or preparation error holds dependent work while independent browser posts continue. Completed posts are never dispatched again. A lost publication response still requires explicit outcome verification before dependent work can continue.
- Story keeps the confirmed music inherited from the same feed post without reopening the music picker. Standalone Stories without matching feed-audio proof use the existing checked music flow. Story-only retries preserve the confirmed feed song and never resend the feed or music save.
- Activity shows compact expandable run cards with mode, time, caption summary, preparation/publication count and attention count. Expand a card for destination details, screenshots and retry controls. Expansion and the visible scroll position survive live status updates; starting a run opens Activity at the top.
- **Pause** lets current tasks finish and holds new work in both lanes; **Resume** continues the remaining queue. A pending phone song choice is preserved. Activity shows separate Browser/Phone progress and destination-specific Continue buttons. Total time ends only when both lanes finish.
- **Stop now** on Activity or the Android progress dialog revokes the remaining live authorization, signals the active worker and skips pending destinations. A second abort check between persisted intent and final submission prevents another send. A request already sent may still finish; uncertain outcomes must be checked before retrying. A stale button cannot stop a different activity.
- **Fresh start** in Compose clears this draft, selected images, song and Story setup and returns to TEST mode. It keeps connections, Activity and the saved image library. It is unavailable during an active operation.
- **Restart failed** retries all failed destinations. Each failed row also has **Retry [destination]** for an individual rerun. Both preserve the saved caption and exact image selection/order, default to TEST, and require a new `POST` confirmation for LIVE. Successful items and unresolved outcomes cannot be selected for retry.
- Content errors, missing setup, a known bad connection or an unresolved matching failed attempt exclude a destination from a new reviewed run. Its tab stays editable and shows the reason. Preview lists included and excluded destinations; only included destinations enter the queue. Fix the content or connection, or rehearse the failed item from Activity after fixing the worker composer. A successful rehearsal clears that matching failure. Uncertain outcomes require explicit verification.
- Authentication checks, detected challenges, and exhausted navigation retries pause the affected destination for intervention. The operator fixes the worker browser and selects Continue. In a pipeline, unrelated work can continue; required initial account/channel checks still happen before publishing. Other preparation errors are recorded as failed, allowing the queue to continue.
- A missing selector fails with an error screenshot and HTML diagnostic when the page remains available. WhatsApp omits full-page diagnostics to protect personal chats and login codes. No “best guess” identity match is accepted.
- Navigation is retried up to three times, with increasing waits; all retries and preparation share a 120-second per-destination deadline after the browser opens (240 seconds for WhatsApp's slower loading and final confirmation). Upload actions have a 60-second limit. Failed file uploads are not automatically repeated inside a potentially populated composer; retry the failed destination after inspection.
- Confirmation uses LinkedIn’s visible company-specific View post receipt or a new matching company-feed record, YouTube’s new post permalink with the exact channel/caption (expanding shortened link labels), and WhatsApp’s new update ID plus native Sent/delivered marker. Existing post IDs are captured before submission so an older matching post cannot confirm a new publication. Published permalinks appear in Activity. A failed diagnostic screenshot or tab cleanup after positive confirmation does not downgrade the publication. Resolving all uncertain items also clears the run’s error summary.
- Final publication actions are **never automatically retried**. A lost confirmation is **Verify outcome**, not Failed. Check the actual platform and mark “Verified published” or “Verified not published” before proceeding. This protects against duplicate posts.
- A worker restart does not resume LIVE work. In-flight submission becomes Verify outcome; interrupted preparation becomes Failed; untouched destinations become Skipped. Starting a new reviewed run is explicit.
- Closing the workspace tab does not stop the queue. Reopen it from any authorized device to reconnect.

## Content and storage

### Videos, Reels and PDFs

Upload JPG/PNG/WEBP images, H.264 **MP4/MOV** videos with optional AAC audio, or **PDF** documents. The worker checks actual file contents, codecs, dimensions, duration and size; renaming an unsupported file does not make it supported. FFprobe is bundled for Windows and macOS. Original uploads are retained without automatic video transcoding or PDF-to-image conversion. Image metadata cleaning applies only to still images.

| Destination | Photos | Video route | PDF route |
| --- | --- | --- | --- |
| Instagram | Up to 10 | One Reel through Instagram Web, using the video's audio | Unavailable |
| LinkedIn company page | Up to 10 | One native video | One document post |
| X | Up to 4 | One native video | Unavailable |
| YouTube DA / CS | Up to 10 in Community | One YouTube Studio upload; eligible videos become Shorts | Unavailable |
| WhatsApp Channel | One | One native channel video | Unavailable in this worker |
| Telegram Channel | Up to 10 | One MP4 video | One downloadable document |

ManyChat references the verified Instagram post; it does not directly upload the video or PDF. Separate Android music and shared-post Story steps currently apply to photo posts. For a Reel, use the audio already in the video.

The shared upload limits are **20 MiB per image, 512 MiB per video and 100 MiB per PDF**, with at most ten files in a draft. A destination can use a photo gallery, one video, or one PDF; mixed attachment types cannot be combined in one post. Unsupported selections are blocked before publication and show the reason in Compose/Preview. Supported files can be selected separately for each destination.

Video limits in this worker are **3 seconds–15 minutes for Instagram and LinkedIn**, **0.5–140 seconds for X**, and no more than **15 minutes** for the other video routes. WhatsApp Channel videos are additionally capped at **64 MiB**. LinkedIn also checks its supported dimensions/aspect ratio and the **300-page** document limit. These worker limits do not assume paid account upgrades or every platform's largest possible upload.

For YouTube video uploads, the first nonempty caption line supplies the title (up to 100 characters), and the complete caption supplies the description. A square or vertical video up to **180 seconds** is shown as a Short; other accepted videos use the regular video route. Images continue through Community. TEST never clicks Publish, but YouTube can retain the uploaded file as a private draft in Studio; review it there before another rehearsal or LIVE upload. A new native receipt/permalink must confirm the exact LIVE upload; final publication actions are never repeated automatically.

Platform references: [Instagram Reels](https://help.instagram.com/225190788256708), [LinkedIn video](https://www.linkedin.com/help/linkedin/answer/a7174587) and [documents](https://www.linkedin.com/help/linkedin/answer/a519831), [X video](https://help.x.com/en/using-x/x-videos), [YouTube uploads](https://support.google.com/youtube/answer/57407) and [three-minute Shorts](https://support.google.com/youtube/answer/15424877), [Telegram files](https://telegram.org/faq), and [WhatsApp Channel updates](https://faq.whatsapp.com/265055289421317/). New video/PDF adapter coverage uses intercepted offline browser fixtures; it does not claim an authenticated LIVE publication rehearsal for those formats.

### Existing photo galleries

Still JPG, PNG, and WEBP files up to 20 MB are accepted, with at most 10 images per draft. New uploads are stored byte for byte in their original format: no resize, brightness change, contrast change, flattening, or JPEG conversion. Each platform tab has its own image selection and publishing order. New drafts initially inherit the shared library; an explicit selection stays independent when new files are uploaded. X accepts up to four images; the workspace supports up to ten for Instagram, LinkedIn and each YouTube community, and one for WhatsApp. A destination over its image-count limit is excluded until fixed; the others can still be reviewed and run. The app never silently truncates a selection. LinkedIn uses a photo gallery; Instagram and YouTube support multi-image posts. Native platform cropping/layout, file size limits and format support still apply. See [X's photo guide](https://help.x.com/en/using-x/posting-gifs-and-pictures), [LinkedIn's gallery guide](https://www.linkedin.com/help/linkedin/answer/a527229/?lang=en), and [YouTube's post guide](https://support.google.com/youtube/answer/7124474?hl=en).

Use **Check metadata / Metadata report** on an image to inspect embedded Content Credentials and known AI-origin strings. **Remove metadata** creates a separate cleaned copy and keeps the source. PNG ancillary chunks, JPEG application/comment segments and WEBP metadata chunks are edited directly; compressed image data is not re-encoded. Colour profiles, colour-rendering information, transparency and minimal required orientation are preserved. The worker compares decoded pixels, encoded dimensions and compressed image payloads, then rescans the output. It rejects a failed verification. **Use original**, **Undo image change**, and **Download** let you review or restore the source. File hashes are checked during review, on queue start and before each destination; cleaned copies are also rescanned before upload.

This is an embedded-metadata check, not an AI-image detector or a C2PA signature validator. A clean metadata report cannot predict or guarantee a platform's AI label: pixel watermarks, remote provenance, disclosures and platform systems can remain relevant. [Meta describes metadata and invisible markers](https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/); [LinkedIn describes its Content Credentials icon](https://www.linkedin.com/help/linkedin/answer/a6282984/). [YouTube's automatic AI-label guidance](https://support.google.com/youtube/answer/14328491?hl=en) covers videos; it does not establish a per-image prediction for community posts. X outcomes are also reported as unknown. The app never presents “guaranteed not AI.”

The two supplied metadata reports both list 1254 × 1254 pixels. The original lists C2PA/JUMBF, ChatGPT/gpt-image, `trainedAlgorithmicMedia`, and `c2pa.watermarked.unbound`; the manually edited copy no longer lists those fields. Its colour type changed from RGB to RGBA and its size grew from 1,806,233 to 2,247,955 bytes. The supplied JSON cannot prove pixel equality; actual image bytes are needed for that check.

Images uploaded with the older version were already resized/converted to JPG. Those earlier copies remain available and are marked accordingly; **reupload their originals to use the new lossless workflow**. Missing source pixels cannot be recovered from an optimized copy.

Caption limits are conservative defaults in `shared/platforms.js`. X length is validated on the server using `twitter-text` weighted counting, including shortened URLs and Unicode weighting. The editor's live X counter is only an estimate.

```text
=====INSTAGRAM=====
Instagram caption

=====LINKEDIN=====
Company page caption

=====X=====
X caption

=====YOUTUBE_DA=====
DA community caption

=====YOUTUBE_CS=====
CS community caption

=====MANYCHAT=====
Auto-DM message

=====WHATSAPP=====
WhatsApp channel update
```

Internal newlines and Unicode are preserved. Missing or empty required sections, duplicates, and unknown sections are reported before import. WhatsApp is optional in an import, so existing six-section text still works; a missing WhatsApp section clears that caption rather than retaining stale text. Select WhatsApp only after adding its caption.

Runtime files live in `data/` (gitignored):

```text
data/
  config.json       Account destinations, without social passwords
  media.json        Uploaded image manifest
  runs.json         Persisted run snapshots and recovery state
  manychat-rotation.json  Next comment-reply rotation position
  instagram-music.json  Account-scoped native song selections
  uploads/          Normalized images
  logs/<run-id>/    Step screenshots, JSONL actions, and error HTML
  browser-profiles/ Separate persistent Chrome/Edge/Chromium profiles
```

Treat `data/` as private: it includes captions, screenshots, and authenticated browser sessions. It is not served wholesale. Only image and screenshot routes are exposed, behind the workspace login when enabled. Browser sessions persist; workspace login sessions expire after 12 hours and on server restart. Keep data out of source control and back it up through your company's normal private backup process. Logs and uploads are retained on disk until the operator removes them; the app shows recent run history and retains unresolved outcomes. Stop the worker before changing data files.

## Development and validation

```sh
npm run check
npm test
npm run test:ui
npm run test:browser
npm run test:accounts
npm run test:editors
npm run test:manychat
npm run test:whatsapp
npm run test:telegram
npm run test:connections
npm run test:destinations
npm run test:publications
npm run test:x-submit
npm run test:instagram-ui
npm run test:instagram-publications
npm run dev
```

The test suite uses an isolated temporary data directory and injected offline adapters. It tests Unicode parsing, X weighting, configuration validation, the publish guard, queue boundaries, auth/network intervention, ambiguous outcomes, crash recovery, authentication, origin protection, uploads, retries and manual sign-in locks. The real-browser UI check covers phone/tablet/desktop layouts, Connections-first navigation, immediate upload previews, import, all eight post previews, LIVE confirmation, TEST reset and password sign-in/out. The accounts check uses intercepted local HTML fixtures to verify CS → DA → CS switching, the editor-access notice, exact channel matching, automatic ID/handle persistence, delayed X controls, and loading/auth distinctions. Editor fixtures verify exact Unicode and intentional blank lines in Quill and YouTube markup, incorrect-caption rejection, upload scoping, file choosers, and preview readiness. WhatsApp fixtures cover delayed loading, expired sessions, takeover refusal, duplicate names, unique link matching, admin access, existing drafts, Send/Enter blocking, discarded-caption cleanup, navigation and user edits, one confirmed send on a local fixture, pending outcomes and screenshot privacy. Telegram fixtures cover the inspected Web K Tiptap composer, QR expiry, exact channel link, Broadcast permissions, text/photo albums, changed draft preservation, image order, TEST Send/Enter blocking and cleanup, single-submit LIVE fixtures, native permalinks and uncertain outcomes. Connection/UI checks confirm all eight login checks despite a saved X-only posting selection, per-service checks, locally loaded components, actual TEST/LIVE palettes, text contrast above 4.5:1, keyboard consent and mobile layouts. Queue tests verify that either channel’s failed preflight stops every selected destination before publication. The browser connection check briefly opens installed Chrome/Edge with a temporary profile and tests CDP, Unicode paste, uploads, screenshots and cookie persistence against a local fixture. The destination suite uses five images to verify X/WhatsApp subsets, independent ordering, metadata replacement and undo, excluded uploads, frozen retry payloads, individual and bulk retry controls, persisted dark/light/system modes, mobile scrollers and reduced motion. Screenshots are written to `test-results/`. **These automated checks never log into or publish to social websites.**

`server/automation/platforms.js` contains the adapters; `utils.js` holds the single guarded final-publication function. The worker launches an installed browser directly with a separate profile and a random loopback-only debugging port, then connects through [Playwright's CDP support](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp). CDP supports the basic page, upload, clipboard and screenshot operations used here but has lower fidelity than Playwright's native protocol. Chromium is a fallback. Set BROWSER_CHANNEL=chrome/msedge/chromium or BROWSER_EXECUTABLE for a specific installation. Profiles are isolated by browser to avoid mixing incompatible versions. A legacy `data/chrome-profile/` from the initial version is left intact but is no longer used. [Chrome requires a non-default profile for remote debugging](https://developer.chrome.com/blog/remote-debugging-port). The project does not disable browser security or attempt to bypass CAPTCHAs.

Authenticated TEST verification on 17 October 2026: run `2e46e782-e19c-4cc4-a7ca-e665afa0ed2a` completed **6/6** destinations in Activity with two images for each publishing destination. This includes the exact multiline Unicode X caption from failed run `21e6dd08-3d07-43af-94db-0cf56b30ee58`. X's Draft.js caption is read as logical text blocks, and its DOM is never overwritten using a fill fallback. Captions are checked again immediately before final publication intent is recorded. LinkedIn intercepts its file chooser before Add media is clicked, selects all files through that chooser, and verifies both the editor thumbnails and the final multi-photo preview without a native Explorer window. YouTube switched between both editor-access channels. Instagram prepared its carousel. One test-only PNG exercised origin-metadata detection, lossless cleaning and pre-upload rescanning on the actual worker. ManyChat prepared an inactive draft on an existing post, with no Go live click. Earlier run `bbbf3379-6a70-403e-83d2-c72aa34a139d` also verified three automatically detected link buttons. The device's saved draft was not replaced. Actual public publication and Go live were not exercised.

WhatsApp authenticated TEST verification on the same date, after a worker restart: run `59f71fe3-2faf-40a4-980d-e09673c2766a` prepared one image and imported multiline Unicode text; run `3a925165-a80d-4a4e-8d92-edd6486e0b51` prepared text only. Both passed the queue's fresh session/channel preflight and adapter checks, recorded `dry_run` with no submission intent, and cleared their own rehearsal drafts. Screenshots in Activity contain only the target channel header and prepared update. No WhatsApp update was sent; actual public-send confirmation is covered by intercepted local fixtures and has not been exercised against the real channel.

Read-only verification of user LIVE run `99b484e9-6a54-437f-90d7-1b8c4aedd435` on 17 October 2026 confirmed its LinkedIn receipt, both YouTube post permalinks with matching captions, and the matching WhatsApp channel update with native Sent acknowledgement. No new post, Send or Go live action was invoked during this repair. The confirmation regression suite reproduces hidden LinkedIn success headings, shortened links, native delivery markers, optimistic draft IDs, delayed view counts, wrong authors, old IDs, ambiguous posts and unavailable diagnostic screenshots.

Authenticated Telegram verification on 18 October 2026: all eight services, including WhatsApp and Telegram, passed a single all-service login check. Telegram-only app run **53dfb095-a502-4bb5-b5b9-e1a085a79a9d** completed TEST with two existing preserved images in a deliberately reversed destination order, a multiline Unicode caption and a URL. Its status is **dry_run**, **submitting: false**, with channel-header, album and ready checkpoints in Activity. Separate authenticated adapter rehearsals verified text-only and two-photo cleanup. Existing public message 5017 confirmed the native **Copy Message Link** format through a read-only action. No Telegram Send, public post or ManyChat Go live was invoked against a real service. Public Telegram send acknowledgement remains covered by intercepted local fixtures.

Authenticated integration verification on **19 October 2026**: the actual Android music picker searched the signed-in account library and issued the selected track. A complete native feed TEST transferred and hash-verified two owned DO NOT PUBLISH images, granted limited access through Android's picker, preserved carousel order, set the exact song/caption, verified final previews, and discarded the rehearsal. A separate complete shared-post Story TEST verified the exact owned-profile post URL, applied the framed repost layout and selected song, placed the Application Form sticker below it, verified Instagram-only audience and unchanged native preview, and discarded the Story. Both returned **dry_run** with a test guard that rejects any submission intent. No feed Share, Story Share, public post or DM Send was executed. Instagram places newly added link stickers behind a repost card on this build; the worker temporarily parks the card, moves the link into free space, restores the reviewed card position, then verifies spacing. Actual LIVE receipts remain untested against Instagram.

## Instagram shared-post Stories

Enable **Share feed post to Story** inside Instagram's Story tab. The Story shares the actual feed post through Instagram's Share > Add to story flow. It does not render and upload a standalone replacement image. Story runs immediately after its feed destination, before unrelated platforms. A confirmed Android feed post hands its verified session directly to Story; the confirmed new permalink stays bound to that run and account before native Share > Add to story. Standalone Story retries independently verify ownership. Pause, stop or preparation failure releases the held session. Feed and Story have separate Activity outcomes; retrying a failed Story does not repost a successful feed upload.

Choose or enter the link URL and its button text (1-20 characters). Imported captions suggest application links. An optional section is supported:

```text
=====INSTAGRAM_STORY=====
Application Form
https://example.com/apply
```

Importing a file without that section disables the optional Story and clears its previous URL. To share an already-published post, deselect the feed destination and enter its exact Instagram post URL under Placement & existing post. New-feed runs wait for a confirmed new permalink; they never guess the latest post in LIVE. TEST can rehearse on an existing owned post because it never creates a public feed post.

Drag the framed card and link in the mobile mockup: nearby centers and aligned item edges snap with visible guides. **Auto-align** centers the visible items and reserves a gap below the card when the optional link is enabled. It preserves native item widths. Arrow keys (Shift for larger steps) allow precise adjustments without magnets; reset placement if needed. These are layout instructions, not an exact rendering of Instagram's editor. Native GPU gestures and layouts vary: the worker measures the result and stops before sharing if it cannot reproduce the reviewed bounds, size, or spacing. A missed card pinch gets a bounded preparation retry; the worker still requires the reviewed size and position before sharing. Continuous-touch movement is checked on the selected phone. Inspect the actual native TEST screenshots, available in Activity and linked from matching Story drafts. The Story applies or reuses the chosen music, adds the verified link label/URL, and targets Instagram. LIVE taps the verified **Your story** shortcut once after checking the unchanged preview. The worker does not press the blue arrow or require Facebook. Account-wide sharing settings are not changed.

Story layout choices include Signature plus seven presets: Gallery, Spotlight, Left bank, Right bank, High note, Grounded and Pocket. Selecting one animates the existing card/link positions and saves the selection. Dragging, resizing, arrow-key edits or Auto-align selects **Custom**; reset returns to Signature. Presets adapt to artwork proportions and optional links within the native placement limits. They do not add unsupported rotations or backgrounds.

Review posts shows platform-shaped previews: Instagram/YouTube carousels, LinkedIn/X photo grids, WhatsApp/Telegram channel posts and ManyChat DM buttons. These previews use each destination's actual image selection and caption; platform rendering and cropping can still differ. `npm run test:ui` checks preset/custom selection, mobile/dark/reduced-motion behavior and platform previews against isolated local fixtures, without a phone or social posting.

The worker uses only its selected physical phone and checks the account each time. Uploaded copies are hash-verified in isolated albums and use Android's limited photo permission flow. Unknown screens, user drafts, changed previews and cancelled/timed-out work stop before publication. Failed native preparation may leave its unsent draft open for inspection; close it before continuing. Do not edit or navigate the phone while the worker is preparing a run or choosing music.

`npm run test:ui`, `npm run test:phone-ui` and `npm run test:native-handoff-ui` exercise the current Story editor, keyboard positioning, device selection, native-song handoff, separate review and mobile layouts against local fixtures. Unit/HTTP tests cover exact-post dependencies, account-scoped music, frozen options and Story-only retry. These automated fixtures never open social websites.

## Attribution

**Designed and developed by Mrinal.** The interface, sign-in screen, page metadata, exported reports, package author, source notices and LICENSE retain this credit. Internal company use and modification are permitted subject to preserving attribution; see [LICENSE](LICENSE). Attribution records authorship; software cannot technically prevent someone from removing a credit or making a false claim. Keep the original source and dated version history as additional evidence of authorship.



## Navigation recovery and ManyChat checks (24 October 2026)

Android preparation rechecks the expected screen once after a failed wait, without replaying the action. When an old selector is definitely absent, a local accessibility fallback can open only a uniquely identified Music or Edit control within its verified Instagram screen. It stops scrolling when the viewport no longer changes. Unknown layouts, duplicate controls, foreign overlays and protected screens pause for manual help on the selected phone. Continue checks the expected screen without tapping anything; normal account, caption, media and one-shot Save/Share checks still apply. This is bounded local recovery, not a guarantee against every future Instagram layout.

ManyChat login and manual sign-in now open the configured workspace library instead of a new automation draft. Verification accepts collapsed icon navigation and a loaded builder, checks the exact HTTPS origin and workspace, and rejects a mismatched Instagram preview when present. A slow workspace is reported as still loading rather than signed out. The builder independently verifies the connected Instagram handle before preparing an automation. No draft, Go Live, Continue or Start fresh control is clicked during the account check.

Gemini navigation suggestions are optional and off by default. In **Connections ? Navigation help**, enter an API key from an eligible free-tier Google project without billing, enable **Use Gemini suggestions**, and save. The key stays in the ignored local `data/navigation-ai.json` file, never in API responses, run history, drafts or Git. Alternatively set `GEMINI_API_KEY` in `.env` and restart; an environment key takes precedence. Each teammate configures their own key.

Only a small allowlist of control names and screen anchors is sent when a known navigation stage pauses. Captions, usernames, messages, search queries, song details, pictures, coordinates and protected screens are excluded. In advisory mode, hints appear in the paused dialog and Studio waits for manual continuation. A manual song choice does not call Gemini. Normal account/content verification and one-shot submission controls still run after Continue.

The helper starts with Gemini 3.5 Flash-Lite, then can use 2.5 Flash-Lite or 2.5 Flash. It makes at most two calls per navigation screen/day, two calls per minute and ten calls per UTC day, keeps a 30-second gap between new requests, caches identical guidance for 30 minutes, and caps responses at 256 tokens with an eight-second timeout per call. Counters and cooldowns survive restart. A busy/unavailable model may switch once; a shared quota limit does not trigger a model loop. Google daily exhaustion pauses suggestions until midnight Pacific; Studio's separate daily budget resets at midnight UTC. If AI is unavailable, the run stays paused and the usual manual controls remain available. No posting action is retried to obtain guidance.

As checked on 24 October 2026, these models have a [Gemini API free tier](https://ai.google.dev/gemini-api/docs/pricing), with [project/model quotas](https://ai.google.dev/gemini-api/docs/rate-limits). Free-tier content may be used to improve Google products. A billed project can incur charges even for a free-tier-eligible model; the app cannot determine a key's billing tier and never upgrades it or switches to a paid-only model. [OpenAI API inference is priced](https://developers.openai.com/api/docs/pricing), so it is not the dependable zero-cost option for this requirement. Local recovery still works with AI disabled. Provider busy/quota/error behavior is tested with mocks; no live Gemini request was made without a configured key.


### Optional automatic Gemini navigation recovery

In **Connections ? Navigation help**, enable **Let Gemini recover navigation automatically** to let the model choose from verified navigation controls. It is separate from advisory hints and defaults off. A known failed navigation step can inspect the current screen, request one structured action, execute only that locally verified control, then check the expected screen again. The cycle has at most three actions and a 60-second budget. A short quota window can be waited once within that budget; shared/daily quota exhaustion, an unknown layout or unchanged screen returns to manual help. Settings, daily counters and cooldowns survive restart.

The browser layer wraps existing navigation operations; it does not rewrite platform adapters. Android supports known music/Edit navigation and scoped menu/editor scrolling. The model receives only bounded safe labels/control IDs and cannot supply selectors, coordinates, scripts, captions or file paths. Final posting, saving published edits, content/account verification, login/security checks and duplicate-publication decisions remain outside model control. File permission errors, lost submission outcomes and content mismatches are not navigation failures and cannot be repaired by clicking. Existing per-run LIVE confirmation and one-shot submission remain mandatory.

The 24 October LinkedIn rehearsal completed in TEST with the existing adapter unchanged and zero AI calls because the earlier missing-control failure did not recur. A separate real Gemini-only navigation rehearsal made one API call and returned Stop with zero actions; this did not fix the separate Windows run-history EPERM failure. No live publication was attempted in either rehearsal. Offline tests cover model actions, stale controls, protected screens, cancellation and the request budget.


### Watch and test a Gemini fix

Activity now shows **Problem ? Gemini API request ? Suggested fix ? Currently trying ? Verification**. Actual API calls, cached guidance and quota waits are distinguished; recovery results stay available after restart. A Stop recovery button cancels standalone recovery before another action.

For a repeatable harmless error, open **Connections ? Navigation help ? Try Gemini recovery**. It deliberately creates a disposable draft with nested Discard dialogs on an isolated practice page. Gemini proposes a typed action, the app verifies that exact control, tries it, and checks that the blocker and practice text are gone. The page also has **Introduce blocker** so you can recreate it; use **Retry practice test** in Activity to run the checked test again. Practice consumes the normal AI request budget and never publishes to a social account.

WhatsApp TEST cleanup now sends an ambiguous Discard confirmation to Gemini only after proving the draft belongs to that rehearsal. It checks the exact channel, caption, original image pixels and live DOM ownership again immediately before Discard and before clearing copied-back text. Prior failed TEST drafts can be recovered during preflight while that ownership proof remains valid. Reloaded, foreign or edited drafts are preserved. The current legacy screenshot can be adopted only through an explicit repair request tied to its failed TEST and original source image; this is not permission to discard arbitrary drafts.

Signed-in checks on **24 October 2026** made two real Gemini 3.5 Flash-Lite calls: the isolated practice blocker and an app-owned WhatsApp TEST Discard confirmation both recovered successfully. The WhatsApp fix clicked the exact Discard control, confirmed the channel stayed unchanged, and cleared only the matching rehearsal text. A complete WhatsApp-only TEST then repeated preparation and recovered automatically using the cached Gemini fix, finishing with a blank channel composer and no submission. WhatsApp's nonmodal channel information banner is excluded from this particular confirmation check; other unknown dialogs still stop recovery. No live post or message was sent by these checks.

### Phone connection recovery

A phone going offline is handled separately from Instagram navigation. Before reusing a held phone session, Studio checks its connection and physical identity. If a phone disconnects during preparation, automatic Gemini recovery can choose only the app's **Reconnect selected phone** action. The local handler reconnects the previously paired address or discovers its changed Wi-Fi port, verifies the same hardware, and rebuilds the inspection session without restarting Instagram or opening a different account. Gemini receives no IP address, serial number, screenshot, caption or command.

Only pending read-only checks are retried after reconnection. An interrupted click or gesture is never replayed: Story link preparation checks the exact URL/text, sticker pixels and position, and asks for manual help when the outcome is unclear. If Wireless debugging is off or the phone cannot be reached, the app pauses and asks for it to be unlocked/reconnected; Continue checks the same phone before resuming. No phone recovery is allowed once submission may have begun, and completed feed/music steps are not repeated. Driver teardown errors are recorded as cleanup warnings and do not replace the original error or a verified publication receipt.

A connection-only check on **24 October 2026** exercised this path against the selected Samsung phone after its debugging port changed. One real Gemini 3.5 Flash-Lite request selected the bounded reconnect action; Studio verified the same hardware, resolved the new port, rebuilt its inspection session, then closed that session. Instagram was not opened, edited or shared. Offline regressions cover mid-Story link checkpoints, uncertain mutations, manual connection waits, nested timer pauses and lost submission responses. A live Story was not reposted to test this change.

### Request fresh Gemini help anywhere

Use **Ask Gemini** in the top bar, a popup or an Android handoff. Error cards also offer **Get Gemini help** for that specific destination. Choose the app, the latest issue or a destination, then **Request fresh steps**. Manual advice works when automatic recovery is off, as long as Gemini suggestions and a key are configured. A fresh request bypasses cached advice, while keeping the daily quota, request spacing, cooldown and model fallback. It never clicks, retries, continues or publishes anything; ongoing automatic recovery and its log stay separate.

The model receives only locally classified platform/view/error/submission/phone-connection status and a safe recovery-step catalog. Raw errors, device addresses, identifiers, captions, images, credentials and file paths are excluded. Replies for an activity that changed while Gemini answered are marked stale.

### Physical phone touch guard

Once the selected physical phone is connected, use **Phone guard off/on** beside Show screen or in Phone connection. The guard keeps only the phone's physical display off; the PC mirror stays interactive for choosing music, and Android automation remains connected. A hidden verified scrcpy control-only helper provides the shield without rooting or installing an input-blocking app. Its [screen-power and keep-active controls](https://github.com/Genymobile/scrcpy/blob/v5.0.1/doc/device.md) preserve the active device session.

This is a screen shield rather than a hardware input lock: the phone's Power button can wake the display. Turn the guard off before handing the office phone back; the toggle remains usable even if its connection is lost. Hiding the mirror keeps the guard active. The shield is session-only, defaults off, and is released when changing phones or closing Studio. If a disconnect prevents restoration, use the phone's Power button.

### Current Android UI, interruptions and Activity timing

Story confirmation supports both Instagram's legacy header and its current Compose header. After the one final share, Studio can read back your own recent Story and compare its pixels with the reviewed card/link. A changed username, old timestamp or mismatched image never proves publication. The same account recognition returns Android to your profile after confirmation.

Preparation resolves exact resource IDs with or without the Compose package prefix. Safe navigation can use visible labels and bounded button wrappers; Story link confirmation recognizes the current icon wrapper and its actual clickable child, while rechecking the reviewed URL and sticker text. Sticker and link navigation can use bounded Gemini recovery. Repeated screens, ambiguous controls and lost action responses do not trigger blind retries. Save/Share authorization and publication receipts remain local checks, outside AI control.

Calls, lock screens and unexpected app switches pause the phone workflow with instructions. Finish the call or unlock the device yourself, return to Instagram, then Continue. The app rechecks its current stage; it does not answer calls, read unlock credentials or act in unrelated apps. If an interruption occurs after submission, only read-only verification may resume, never another send. Changed content or an unknown layout can still require manual help. Phone guard can reduce accidental physical touches while leaving the PC mirror usable.

Each Activity card shows **Total time**, including login checks, preparation and time waiting for operator input. Completed runs stop counting; older records use their last saved completion timestamp. Browser background throttling stays enabled. Verified completed app-owned tabs are released; review/error tabs and adopted sessions remain open. A completely empty idle worker browser closes after 30 seconds. Stable phone polling no longer broadcasts the full Activity history on every check.
