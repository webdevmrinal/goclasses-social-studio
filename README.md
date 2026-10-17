# GO Classes Social Studio

Created by **Mrinal**. A responsive, Apple-inspired workspace for preparing and posting images and captions to Instagram, a LinkedIn company page, X, two YouTube communities, a WhatsApp Channel, and a new ManyChat comment-to-DM automation for each post.

## Start on Windows or macOS

Install [Node.js 22 LTS or newer](https://nodejs.org/) first, then open a terminal in this folder:

```sh
npm install
npm run setup
npm start
```

Open **http://localhost:3000**. After the first setup, just run `npm start`, or use `start-windows.cmd` / `bash start-macos.command`. To make the Mac launcher double-clickable, first run `chmod +x start-macos.command`. The server serves the interface directly: no separate build, frontend process, account tokens, or paid API is needed.

The interface works on desktop, tablet, and mobile browsers. Browser automation runs on the **Windows or Mac worker computer**, which needs to stay awake with its desktop available. A phone controls that worker; it does not install Node.js or run Chromium itself.

## First use

1. Open **Connections**. The supplied LinkedIn admin dashboard and ManyChat new-automation builder URLs are prefilled, along with both YouTube channel names and handles.
2. Add the expected Instagram handle. X detects and saves its active handle during the first check when the field is empty; an explicit expected handle is always enforced. Confirm the exact LinkedIn company name; “GO Classes” is the initial value.
3. Click **Check logins**. A separate, visible automation browser opens on the worker computer. Sign in there and complete any security checks. The app never asks for your social account passwords.
4. Use **Open & check** for both YouTube destinations. The app reads each configured public handle, checks its exact channel name, saves the `UC…` ID automatically, and verifies your signed-in channel. DA and CS can share one Google login. The worker selects the matching channel in YouTube's account switcher when needed and checks the name and handle again. Both destinations can show Verified even though only one channel is active at a time; identity is checked again for each post.
5. LinkedIn must open the configured company admin view. If it does not, ask a company page administrator for posting access. Merely having the admin URL does not establish permission. The adapter also requires the configured company identity inside the composer.
6. Click **Continue to Compose** to start with verified destinations. Connections is the landing page and the first navigation step; you can also open Compose to prepare a draft. Upload images and enter captions, or **Import captions** using the delimiter headers below. The WhatsApp section is optional for older six-section imports. A local image preview appears immediately while uploading, then switches to the preserved server copy. Drag the grip to reorder images, or use the arrow keys/buttons. Image removal, reordering and metadata cleaning can be undone. The draft saves on this device. **Export** saves a portable text copy.
7. Preview all selected destinations and click **Run test**. The test prepares real composers and takes screenshots, stopping before publication. ManyChat prepares an inactive draft on an existing post for rehearsal; it may cache draft settings and save draft link buttons, but never clicks Go live.
8. Review screenshots in **Activity**. Test one destination at a time before running the full queue.
9. When ready, enable **LIVE**, review again, and type `POST` to authorize that particular run. Mode returns to TEST after starting the run and on every page reload. An environment variable cannot enable LIVE.

### Google says “This browser or app may not be secure”

In Connections, use **Manual sign-in** for ManyChat or YouTube. This closes the tool's connected browser and opens installed Chrome (or Edge) with a separate saved profile and **no automation connection or debugging switches during sign-in**. Complete the login yourself, then **close that separate window completely** so the profile is saved and unlocked. Click **Open & check** in Connections to reconnect automation to that same profile.

The worker now prefers installed Chrome, then Edge, then bundled Chromium. Install/update Chrome if needed. Google can impose additional account, device, or organization restrictions; this feature does not guarantee authentication or bypass Google's checks. Keep normal account security and two-factor authentication enabled.

Account checks wait up to 60 seconds for X account controls and YouTube channel/menu data instead of treating a loading screen as a signed-out account. A loading timeout, missing setup, and a wrong account have separate statuses. Retry **Open & check** if a site remains slow. Browser focus emulation and background rendering settings keep the connected worker responsive when its window is behind the workspace. Manual sign-in still runs without an automation connection.

The automated suite uses local fixtures. Separate signed-in TEST runs have verified preparation on the original six destinations and WhatsApp, as recorded below. Platform adapters use English-language controls and stop when identity, selectors, or success confirmation cannot be verified. Rehearse new content before using LIVE. No content was published during development testing.

## WhatsApp Channel

Connections is prefilled with **GO Classes for GATE CSE/DA** and its verified public channel link. Use **Open & check** to link WhatsApp Web on the worker through your phone's **Linked devices** if required. The worker preserves its dedicated browser profile and reuses one WhatsApp tab. If multiple worker WhatsApp tabs exist, it stops for you to close the extras. It waits up to 90 seconds for initial loading, distinguishes a QR/logout screen from a loading timeout, and never clicks a session's **Use here** takeover prompt. Session expiration cannot be prevented; relink on the worker and select Continue when asked.

A run containing WhatsApp checks its linked session, exact channel name, unique public channel link, admin update composer and unsent drafts **before any destination runs**, and checks again at WhatsApp's turn. It searches only the Channels drawer. It never uses personal-chat search or a personal message composer. A missing or ambiguous channel, mismatched link, existing media selection or unsent text draft pauses for review. It preserves existing drafts.

Add `=====WHATSAPP=====` to imported captions. WhatsApp supports text-only updates or **one image with a caption** in this worker, based on the signed-in channel uploader inspected during development. The app rejects additional images instead of splitting a draft into several updates or dropping images. Its 1,024-character caption cap is a conservative workspace limit. Choose one image in the WhatsApp tab independently of the carousel for other platforms, or clear its selection for text only.

TEST prepares the native channel composer, verifies its caption and attachment, and captures only the channel header or prepared update. Send and Enter-to-send are blocked during preparation. TEST never clicks Send; it discards its own media selection and clears any caption WhatsApp copies back into the update box only if it exactly matches the rehearsal text. Changed or human-written drafts are preserved for review. Private chat lists, full WhatsApp page HTML and QR codes are not captured in Activity.

LIVE still requires that run's reviewed `POST` confirmation. Navigation, channel-title changes or human edits invalidate preparation. Only the verified Send control is armed for one final action. The worker then looks for one new matching channel update with stable metadata and view-count confirmation. An unconfirmed outcome requires manual verification before retrying. Native platform notices and disclosure requirements remain applicable.

## ManyChat

The worker opens **New Automation → Auto-DM links from comments** in your ManyChat workspace. Existing library URLs are upgraded to its new-automation builder. It selects a specific post, checks **any word**, enables public comment replies, keeps the default opening DM, and fills the final **DM with a link** field with your ManyChat caption. Follow and email requests and the follow-up DM stay off.

Paste links into the DM text, including plain URLs or Markdown links. The app detects unique links, suggests button names within 20 characters, and shows the names and URLs in Compose and Preview. The original DM text is preserved. Edit, remove, or add buttons before running; edits keep a custom set, and **Refresh from DM** regenerates buttons from the current text. More than three buttons blocks the run until you choose up to three. The worker verifies each saved label and URL. ManyChat documents the [three-button limit](https://help.manychat.com/hc/en-us/articles/16654065283100-Quick-Automation-Auto-DM-links-from-comments) and [button title limits](https://help.manychat.com/hc/en-us/articles/14281157003292-Buttons). The main DM can contain up to 1,000 characters.

Connections includes an editable pool of 20 comment replies, one per line. Compose previews the next three. ManyChat shuffles those three replies under the post; the worker advances to the next three only after a confirmed LIVE activation. Tests do not consume the rotation, and the position persists across worker restarts.

ManyChat runs after the publishing destinations. In LIVE, the worker finds the new Instagram permalink by comparing the account's posts before and after publication, then matches that permalink and its exact caption in ManyChat. It stops for intervention if the intended post is unavailable or ambiguous. An explicit **Instagram post URL** in Compose supports a ManyChat-only run. In TEST, with no explicit URL, it uses the latest existing post solely for rehearsal and records that choice in Activity. Test mode never clicks **Go live**. A confirmed LIVE run activates once and waits for both **Edit** and **Stop** controls; a lost confirmation requires outcome verification before retrying.

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

Upload up to ten originals to the shared library, then open each platform tab on the right. The tab shows exactly its own images, their numbered order, its caption and any blocking issues. Click thumbnails to choose images, use the order arrows to rearrange just that platform, and scroll the thumbnail strip or use the carousel arrows to inspect every image. **Clear** creates an empty selection; **Use all** restores the library order when it fits the platform limit. Selecting an image on WhatsApp replaces its prior image. X supports up to four. The image library scrolls independently when it is long. Metadata cleaning, restoring originals and Undo preserve destination assignments.

The appearance button in the top bar cycles **System → Dark → Light → System**. Its preference persists on the device; System follows the OS. Transitions respect reduced-motion settings. UI icons are a small, locally served Lucide set; see [third-party notices](THIRD_PARTY_NOTICES.md). Regenerate them with `npm run icons:build` after updating the icon package. Mrinal attribution remains in the interface and source.

## Queue behavior

- Destinations run sequentially. Only one run or login check can use the shared browser at a time.
- Activity shows compact expandable run cards with mode, time, caption summary, preparation/publication count and attention count. Expand a card for destination details, screenshots and retry controls. Expansion survives live status updates.
- **Pause** takes effect after the current destination; **Resume** continues the remaining queue.
- **Stop** lets the current destination finish and marks the remaining queue Skipped. It cannot undo a publication already in progress.
- **Restart failed** retries all failed destinations. Each failed row also has **Retry [destination]** for an individual rerun. Both preserve the saved caption and exact image selection/order, default to TEST, and require a new `POST` confirmation for LIVE. Successful items and unresolved outcomes cannot be selected for retry.
- Content errors, missing setup, a known bad connection or an unresolved matching failed attempt exclude a destination from a new reviewed run. Its tab stays editable and shows the reason. Preview lists included and excluded destinations; only included destinations enter the queue. Fix the content or connection, or rehearse the failed item from Activity after fixing the worker composer. A successful rehearsal clears that matching failure. Uncertain outcomes require explicit verification.
- Authentication checks, detected challenges, and exhausted navigation retries pause for intervention. The operator fixes the worker browser and selects Continue. Other preparation errors are recorded as failed, allowing the queue to continue.
- A missing selector fails with an error screenshot and HTML diagnostic when the page remains available. WhatsApp omits full-page diagnostics to protect personal chats and login codes. No “best guess” identity match is accepted.
- Navigation is retried up to three times, with increasing waits; all retries and preparation share a 120-second per-destination deadline after the browser opens (240 seconds for WhatsApp's slower loading and final confirmation). Upload actions have a 60-second limit. Failed file uploads are not automatically repeated inside a potentially populated composer; retry the failed destination after inspection.
- Final publication actions are **never automatically retried**. A lost confirmation is **Verify outcome**, not Failed. Check the actual platform and mark “Verified published” or “Verified not published” before proceeding. This protects against duplicate posts.
- A worker restart does not resume LIVE work. In-flight submission becomes Verify outcome; interrupted preparation becomes Failed; untouched destinations become Skipped. Starting a new reviewed run is explicit.
- Closing the workspace tab does not stop the queue. Reopen it from any authorized device to reconnect.

## Content and storage

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
npm run test:destinations
npm run dev
```

The test suite uses an isolated temporary data directory and injected offline adapters. It tests Unicode parsing, X weighting, configuration validation, the publish guard, queue boundaries, auth/network intervention, ambiguous outcomes, crash recovery, authentication, origin protection, uploads, retries and manual sign-in locks. The real-browser UI check covers phone/tablet/desktop layouts, Connections-first navigation, immediate upload previews, import, all seven post previews, LIVE confirmation, TEST reset and password sign-in/out. The accounts check uses intercepted local HTML fixtures to verify CS → DA → CS switching, the editor-access notice, exact channel matching, automatic ID/handle persistence, delayed X controls, and loading/auth distinctions. Editor fixtures verify exact Unicode and intentional blank lines in Quill and YouTube markup, incorrect-caption rejection, upload scoping, file choosers, and preview readiness. WhatsApp fixtures cover delayed loading, expired sessions, takeover refusal, duplicate names, unique link matching, admin access, existing drafts, Send/Enter blocking, discarded-caption cleanup, navigation and user edits, one confirmed send on a local fixture, pending outcomes and screenshot privacy. Queue tests verify that failed WhatsApp preflight stops every selected destination before publication. The browser connection check briefly opens installed Chrome/Edge with a temporary profile and tests CDP, Unicode paste, uploads, screenshots and cookie persistence against a local fixture. The destination suite uses five images to verify X/WhatsApp subsets, independent ordering, metadata replacement and undo, excluded uploads, frozen retry payloads, individual and bulk retry controls, persisted dark/light/system modes, mobile scrollers and reduced motion. Screenshots are written to `test-results/`. **These automated checks never log into or publish to social websites.**

`server/automation/platforms.js` contains the adapters; `utils.js` holds the single guarded final-publication function. The worker launches an installed browser directly with a separate profile and a random loopback-only debugging port, then connects through [Playwright's CDP support](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp). CDP supports the basic page, upload, clipboard and screenshot operations used here but has lower fidelity than Playwright's native protocol. Chromium is a fallback. Set BROWSER_CHANNEL=chrome/msedge/chromium or BROWSER_EXECUTABLE for a specific installation. Profiles are isolated by browser to avoid mixing incompatible versions. A legacy `data/chrome-profile/` from the initial version is left intact but is no longer used. [Chrome requires a non-default profile for remote debugging](https://developer.chrome.com/blog/remote-debugging-port). The project does not disable browser security or attempt to bypass CAPTCHAs.

Authenticated TEST verification on 17 October 2026: run `2e46e782-e19c-4cc4-a7ca-e665afa0ed2a` completed **6/6** destinations in Activity with two images for each publishing destination. This includes the exact multiline Unicode X caption from failed run `21e6dd08-3d07-43af-94db-0cf56b30ee58`. X's Draft.js caption is read as logical text blocks, and its DOM is never overwritten using a fill fallback. Captions are checked again immediately before final publication intent is recorded. LinkedIn intercepts its file chooser before Add media is clicked, selects all files through that chooser, and verifies both the editor thumbnails and the final multi-photo preview without a native Explorer window. YouTube switched between both editor-access channels. Instagram prepared its carousel. One test-only PNG exercised origin-metadata detection, lossless cleaning and pre-upload rescanning on the actual worker. ManyChat prepared an inactive draft on an existing post, with no Go live click. Earlier run `bbbf3379-6a70-403e-83d2-c72aa34a139d` also verified three automatically detected link buttons. The device's saved draft was not replaced. Actual public publication and Go live were not exercised.

WhatsApp authenticated TEST verification on the same date, after a worker restart: run `59f71fe3-2faf-40a4-980d-e09673c2766a` prepared one image and imported multiline Unicode text; run `3a925165-a80d-4a4e-8d92-edd6486e0b51` prepared text only. Both passed the queue's fresh session/channel preflight and adapter checks, recorded `dry_run` with no submission intent, and cleared their own rehearsal drafts. Screenshots in Activity contain only the target channel header and prepared update. No WhatsApp update was sent; actual public-send confirmation is covered by intercepted local fixtures and has not been exercised against the real channel.

## Attribution

**Designed and developed by Mrinal.** The interface, sign-in screen, page metadata, exported reports, package author, source notices and LICENSE retain this credit. Internal company use and modification are permitted subject to preserving attribution; see [LICENSE](LICENSE). Attribution records authorship; software cannot technically prevent someone from removing a credit or making a false claim. Keep the original source and dated version history as additional evidence of authorship.
