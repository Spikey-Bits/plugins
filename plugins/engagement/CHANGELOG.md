# Changelog

## v1.0.0 — 2026-08-28 (first release — generic engine on the YouTube Data API)

### Title

First release. A brand-neutral YouTube comment responder that reads and posts through the YouTube Data API v3, with every channel-specific value supplied by a separate `engagement-profile` skill the operator installs in their own account. No brand string of any kind ships in this plugin.

### What changed

- (a) **New plugin `engagement` v1.0.0.** Manifest description measured at 358 characters against a 390 cap, no XML, version prefix present. `.mcp.json` ships an empty `mcpServers` block; the API path needs no MCP server.
- (b) **Four dependency-free Node scripts under `scripts/`** (measured 376 lines total). `yt.js` (169) is the API client, `fetch-unresponded.js` (91) scans, `post-reply.js` (63) posts and confirms, `auth-init.js` (53) runs the one-time connect and the `--status` check. All HTTP goes through `curl` via `child_process`: the runtime `fetch` cannot use the sandbox proxy and `npm install` is refused by the egress allowlist. Every file passes `node --check`.
- (c) **Unanswered predicate corrected in three ways.** Threads whose top-level comment was authored by the channel owner are excluded, because the API returns the owner's own pinned links while YouTube Studio hides them. Threads reporting more than five replies are re-read in full through `comments.list?parentId=` before the owner-reply test, because the replies array truncates at exactly five regardless of the true count. Threads with a `moderationStatus` other than `published` are skipped.
- (d) **`skills/comment-responder/SKILL.md`** (measured 157 lines against a 500 cap; description 339 characters against a 390 cap). Inherits the fourteen-step structure of the prior DOM-based sibling. Step 2 loads the profile, Step 3 fails fast when there is no working connection, Step 4 calls the fetch script instead of scraping, Step 12 calls the post script instead of driving a browser composer. Ten Forbidden items against a target of fifteen; eight self-check items against a target of ten.
- (e) **`shared/` reference set** (measured 304 lines). New `data-api-recipe.md` (117, carries a `## Contents` TOC) replaces the DOM selector recipe. New `oauth-setup-guide.md` (63) covers the connect flow, the token location and the domain-allowlist prerequisite. `comment-voice-rules.md` (60) and `approval-panel-template.md` (64) carry over from the prior sibling with every brand string and hard-coded path replaced by a profile lookup.
- (f) **Hearting removed.** The Data API exposes no endpoint to set a heart and no field to read one. Hearting is now a manual action in YouTube Studio. Because heart state is invisible, a comment hearted but not replied to reads as unanswered here; the default four-day window keeps that divergence near zero, and the error direction is offering a row already handled rather than hiding one.
- (g) **Token storage moved into the operator's connected folder.** The verification run stored it in the session sandbox home, which is destroyed when the session ends, so every run would have required a fresh consent. The token is now written beside the credentials file in the operator's own connected folder. Neither file is ever read into context.
- (h) **Post verification polls instead of reading once.** A reply is not always readable back the instant `comments.insert` returns; the first live post returned a valid reply id and then reported unverified because the immediate re-read showed an empty thread. `post-reply.js` now re-reads up to five times, two seconds apart, and reports the attempt count. Measured: a landed reply resolves on attempt 1 in 0.3 seconds; a genuinely absent reply exhausts all five in 9.4 seconds.
- (i) **Scripts run on the operator's own machine.** The plugin's files sit in Claude's environment while the credentials sit on the operator's computer. The skill now copies the four scripts down to the operator's machine at the profile-load step and runs them there, checking each with `node --check` first. A new Forbidden line bans copying the credentials file or the token off that machine for any reason. Nothing that identifies the channel or authorises posting ever leaves it.
- (j) **The working folder is discovered, not configured.** The profile previously named a folder, then a full path; both were machine-specific, and a name alone selected the wrong folder when two similarly named folders existed on one machine. The profile now carries no paths at all. At Step 3 the skill looks at the top level of each connected folder for a `client_secret*.json`, and that file identifies the working folder. Token and review folder resolve beside it. Exactly one match proceeds, none halts with a message, more than one halts and asks. Top level only, so an archived copy in a subfolder cannot create a false second match.
- (k) **`engagement-profile` skill defined and built** (not shipped in this plugin). Fixed skill name for every operator, so the plugin references one constant. `SKILL.md` carries the channel, topics, no-go list, clapback policy, business context and audience, and no file paths at all; `reference/exemplars.md` carries the operator's own replies and carries a `## Contents` TOC.

### Live verification (channel under test, 2026-08-28)

| Check | Result |
|---|---|
| Connect and channel resolve | correct channel id, title and handle returned |
| Four-day scan | 13 unanswered from 294 threads scanned, 3.2 seconds, 7 quota units of 10,000 |
| Owner-authored exclusion | 2 threads excluded |
| Truncation fallback | fired on 2 threads |
| Wrong channel id | halts, exit 2, both ids surfaced |
| Missing token | halts, exit 1, points at the setup guide |
| Token refresh | succeeds and rewrites the token file |
| Live post, one operator-approved reply | posted and confirmed present on the thread, correct text, owner-authored |

### Files touched

New tree. `.claude-plugin/plugin.json`, `.mcp.json`, `README.md`, `CHANGELOG.md`, `scripts/{yt,auth-init,fetch-unresponded,post-reply}.js`, `shared/{data-api-recipe,oauth-setup-guide,comment-voice-rules,approval-panel-template}.md`, `skills/comment-responder/SKILL.md`.

Outside the plugin: `.claude-plugin/marketplace.json` at the marketplace repo root, and the `engagement-profile` skill delivered per operator.

### Rollback

Nothing to roll back. Greenfield release; the prior DOM-based plugin is a separate install and is untouched.

### Sources cited

Approved design `docs/v1.0.0/v1.0.0-DESIGN.md` rows R1 to R8, all green 2026-08-28. Measured API behaviour in `PATH-D-VERIFICATION-REPORT.md`, verdict GO, sections V1, V2, V3, V5, N1, N3, N4, N5, N6, N7 and Required changes 1 to 6. Cap catalog `reference/HARD-CAPS-REFERENCE.md`. Google documentation for `channels.list`, `commentThreads.list`, `comments.list`, `comments.insert` and the OAuth 2.0 native-app flow. Marketplace layout per `guides/markdown/01-GITHUB-MARKETPLACE-SETUP.md`. Live verification this session on the channel under test.
