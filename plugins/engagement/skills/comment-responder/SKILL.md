---
name: comment-responder
description: Fetches unanswered YouTube comments through the YouTube Data API, drafts a reply to each in the brand voice supplied by the engagement-profile skill, and presents them as a stacked .docx review document for edit and approval. Posts only approved replies and confirms each one landed. Requires a one-time YouTube connection. Zero auto-post.
---

# Comment responder

Fetch, classify, draft, review and post on a channel's unanswered YouTube comments. ONE approval gate, multi-row. Replies post only on confirmed rows; declined rows are never touched.

## Trigger

`/engagement:comment-responder`. Optional inputs: a duration phrase and/or a video id. Zero required args.

Every channel-specific value comes from the `engagement-profile` skill. Nothing about any channel is baked into this plugin.

Accepted user inputs:

- Nothing after the trigger → whole channel, the profile's default lookback
- Duration phrase (`4 days` / `24 hours` / `1 week`) → sets `max_age_days`
- A YouTube video URL or id → scans that video only
- Both together → both apply

## Steps

1. **Intake.** Parse the message for a duration phrase and a video id.

   Duration parsing, first match wins, case-insensitive:
   - `/(\d+)\s*hour(s)?/i` or `/(\d+)\s*h\b/i` → `max_age_days = hours / 24`
   - `/(\d+)\s*day(s)?/i` or `/(\d+)\s*d\b/i` → `max_age_days = days`
   - `/(\d+)\s*week(s)?/i` or `/(\d+)\s*w\b/i` → `max_age_days = weeks * 7`
   - No match → the profile's default lookback

   Video id: from a `youtube.com/watch?v=<id>`, `youtu.be/<id>` or `studio.youtube.com/video/<id>/...` URL, or a bare 11-character id.

   Any non-YouTube host → HALT and surface it. No preview, no confirm; proceed to Step 2.

2. **Load the profile.** Load the `engagement-profile` skill via the Skill tool. Read: channel id, handle, brand name, people, topic tags, default lookback, we-or-I, no-go list, business context, audience, clapback policy, and the four path fields: folder on the user's computer, credentials file name, token file name, review subfolder.

   If the skill is not installed, HALT with: `No engagement-profile skill found. Install the profile supplied with this plugin under Customize then Skills.`

   **Resolve the folder.** The profile names one folder on the user's computer by its full path, plus three names inside it. In a session that folder is reachable at `$HOME/mnt/<the last part of that path>`. Build all three paths from there. If no folder of that name is connected, ask the user to connect the exact folder the profile's full path names. Two folders can share a name, so never pick one by name alone.

   Export for every script call in this run:
   - `YT_CREDENTIALS_PATH` = the resolved credentials path
   - `YT_TOKEN_PATH` = the resolved token path, when the profile sets one

   **Copy the scripts onto the user's computer.** This plugin's files sit in Claude's own environment; the credentials sit on the user's machine. The scripts must run beside the credentials so that no credential is ever copied off the user's machine.
   - Read each `.js` file in `${CLAUDE_PLUGIN_ROOT}/scripts/`.
   - Write each one, unchanged, to `~/yt-engagement/scripts/` on the user's computer.
   - Run `node --check` on each copy. Any failure HALTs.

   Every later step runs the copies at `~/yt-engagement/scripts/`, never the plugin's own copy.

3. **Verify the connection.** Run `node ~/yt-engagement/scripts/auth-init.js --status`.

   Non-zero exit → HALT with: `Not connected to YouTube. See ${CLAUDE_PLUGIN_ROOT}/shared/oauth-setup-guide.md.` Include the script's `reason` field. Do not attempt any fetch.

   Exit 0 → confirm the returned `channel_id` matches the profile's channel id. A mismatch HALTs with both ids; it means the signed-in account is not the channel in the profile.

4. **Fetch unanswered comments.** Recipe = `${CLAUDE_PLUGIN_ROOT}/shared/data-api-recipe.md`. Run:

   ```bash
   node ~/yt-engagement/scripts/fetch-unresponded.js \
     --channel-id <profile channel id> --max-age-days <N> --output /tmp/comments-<ts>.json
   ```

   Add `--video-id <id>` when Step 1 found one. Read `rows[]` from the output file. Slice client-side into `Math.ceil(rows.length / 75)` batches of at most 75.

   Emit: `Scan complete: <count> unanswered in <max_age_days>d window, <quota_units> quota units → <N> batches.`

   Any `error` field → surface the JSON and HALT. Never treat an error as a count of zero.

5. **Load voice doctrine** (once per run, not per batch), in this order:
   - The profile's `reference/exemplars.md` — the operator's own replies, patterns and anti-patterns. Primary doctrine.
   - `${CLAUDE_PLUGIN_ROOT}/shared/comment-voice-rules.md` — universal NEVER items, clapback rule, no-invented-actions, no-em-dashes, length target, application order.

6. **Load receipt.** Emit exactly 3 lines:
   ```
   loaded: engagement-profile via Skill tool — <brand name>, channel <channel id>
   loaded: engagement-profile reference/exemplars.md — <count> exemplars
   loaded: shared/comment-voice-rules.md (in-plugin)
   ```
   Any skip or substitution = HALT.

7. **Classify each row.**
   - **`clapback_eligible`** (bool). True only when the comment personally attacks the brand, a person named in the profile, or another commenter: insults, bad-faith accusations, slurs, identity attacks. Disagreement, criticism of a company or product the brand covers, criticism of a post, or "I prefer X over Y" is NOT an attack. Apply the clapback rule in `${CLAUDE_PLUGIN_ROOT}/shared/comment-voice-rules.md` section 3 against the profile's clapback policy. If unsure, `false`.
   - **`substrate_needed`** (bool). True when the comment asks a factual question.
   - **`topical_tag`**. One of the profile's topic tags, or `off-topic`.

8. **Draft one reply per row.** Apply `${CLAUDE_PLUGIN_ROOT}/shared/comment-voice-rules.md` section 7 in order. Target 50-220 characters soft, 280 soft cap, 500 hard cap.
   - `clapback_eligible: false` → warm register, matched to the profile's exemplars.
   - `clapback_eligible: true` → clapback register, surgical. No profanity, no slurs, no name-calling, no matching the attacker's energy.
   - `substrate_needed: true` and the fact is not in the profile or the original comment → deflect with warmth. Never invent a fact.

9. **Build approval panels.** One `.docx` per batch at `<profile review folder>/comment-review-youtube-<ts>-b<n>.docx` using `${CLAUDE_PLUGIN_ROOT}/shared/approval-panel-template.md` Format A. Build all of them before Step 10.

## Approval and post loop

10. **Present every batch doc at once.** One call with every `-b<n>.docx` in the files array. Summarize total rows, per-batch counts and tone breakdown in chat. Emit: `<N> batches ready (b1-b<N>) — all docs open. Edit any doc and hand them back in any order.` A self-reported summary instead of the literal panels is a gate failure.

11. **Wait for a batch to come back — any batch, any order.** Identify the batch by its `-b<n>` filename or the doc's batch header. Track which batches are still outstanding; a handback applies only to its own batch and leaves the other docs open.
    - **Mode A** (pairs with Format A). The writer types `send` or pastes the edited doc body. Parse each `REPLY:` line: non-blank is approved and posted verbatim, blank is a skip.
    - **Mode B** (pairs with Format B). `Ny` / `Nn` / `Ne <text>` / `Nr` / `k` per `${CLAUDE_PLUGIN_ROOT}/shared/approval-panel-template.md`. Unspecified rows skip.
    - Matches neither cleanly → HALT and ask the writer to disambiguate. Never auto-disambiguate.
    - Anything else, or no reply → keep waiting. Do not proceed.

12. **Post the approved rows of the handed-back batch.** Per row, write the approved text to `/tmp/reply-<ts>-r<n>.txt`, then:

    ```bash
    node ~/yt-engagement/scripts/post-reply.js \
      --parent-id <row parentId> --text-file /tmp/reply-<ts>-r<n>.txt --output /tmp/result-<ts>-r<n>.json
    ```

    `ok: true` means posted and confirmed present on the thread. On `quotaExceeded`, stop the batch and report which rows have not posted. On any other per-row error, record it and continue the batch.

13. **Self-check the handed-back batch** before Step 14:
    - (a) Every approved row returned `ok: true`.
    - (b) No skipped row was posted to.
    - (c) Every posted reply is within 10,000 characters.
    - (d) Zero posted replies contain profanity, slurs or name-calling.
    - (e) Zero posted replies state a product, rule, price or date fact absent from the profile and from the original comment.
    - (f) Zero posted replies contain em dashes.
    - (g) Zero posted replies violate the profile's no-go list.
    - (h) Every posted reply's `parent_id` matches the row it was drafted for.

    Surface specifics on any failure. Do NOT declare done on a failure, and do NOT mark the batch done until the writer decides.

## Continue

14. **Mark the batch done; leave the rest open.** Remove it from the outstanding set. All docs were presented at Step 10 — do NOT re-present and do NOT re-scan. If any batch is outstanding, return to Step 11 and keep waiting. When the set is empty, emit the Output summary.

## Output

- Per row: `Batch <B> Row N: posted OK` / `Batch <B> Row N: skipped` / `Batch <B> Row N: FAILED — <reason>`.
- Per batch: `Batch <B>: <X> of <Y> approved replies posted. <Z> failed. <W> skipped.`
- Run footer: `Answered <total_posted> of <total_approved> in <max_age_days>d window across <N> batches.`
- Result files under `/tmp/` are preserved for the session.

## Forbidden

- Posting any reply without explicit per-row approval through Mode A or Mode B.
- Replying to comments outside the `max_age_days` window.
- Proceeding past a channel-id mismatch or a failed connection check.
- Calling a Google endpoint directly instead of through the bundled scripts.
- Reading, printing or echoing the contents of the credentials file or the token file.
- Writing the token anywhere other than the profile's token path.
- Copying the credentials file or the token off the user's computer for any reason.
- Profanity, slurs or name-calling, per `${CLAUDE_PLUGIN_ROOT}/shared/comment-voice-rules.md`.
- Stating any fact not present in the profile or in the comment being answered.
- Claiming that anyone fixed, updated or added anything.
- Em dashes in reply output.
