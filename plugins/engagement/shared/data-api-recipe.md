# YouTube Data API recipe

> Loaded by `skills/comment-responder/SKILL.md` at Steps 3, 4 and 12. Endpoint reference and script contract for fetch, post and verify. All API work runs through the bundled scripts; the skill never calls an endpoint directly.

## Contents

1. Environment contract
2. Scripts
3. Connection check
4. Fetch procedure
5. Row shape
6. Post reply step
7. Errors and quota
8. Known limits

---

## 1. Environment contract

Both variables come from the `engagement-profile` skill and must be exported before any script runs.

| Variable | Source | Required |
|---|---|---|
| `YT_CREDENTIALS_PATH` | profile field `credentials path` | yes |
| `YT_TOKEN_PATH` | profile field `token path` | no — defaults to `yt-token.json` beside the credentials file |

The token must live in a folder the user has connected. A path inside the session sandbox does not survive to the next run.

## 2. Scripts

Dependency-free Node. All HTTP goes through `curl`; the runtime `fetch` cannot use the sandbox proxy and no package can be installed.

| Script | Purpose |
|---|---|
| `${CLAUDE_PLUGIN_ROOT}/scripts/yt.js` | API client. Not invoked directly. |
| `${CLAUDE_PLUGIN_ROOT}/scripts/auth-init.js` | One-time connect, and `--status` connection check. |
| `${CLAUDE_PLUGIN_ROOT}/scripts/fetch-unresponded.js` | Scan for unanswered threads. |
| `${CLAUDE_PLUGIN_ROOT}/scripts/post-reply.js` | Post one approved reply and confirm it landed. |

Every script prints JSON on stdout and a JSON error object on stderr. Exit code 0 means success.

## 3. Connection check

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/auth-init.js" --status
```

Exit 0 returns `{connected: true, channel_id, channel_title, handle}`. Any non-zero exit means not connected; surface the guide at `${CLAUDE_PLUGIN_ROOT}/shared/oauth-setup-guide.md` and HALT.

## 4. Fetch procedure

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch-unresponded.js" \
  --channel-id <profile channel id> --max-age-days <N> --output /tmp/comments-<ts>.json
```

Add `--video-id <id>` to scan one video instead of the whole channel.

The script resolves the authenticated channel through `channels.list?mine=true` and compares it to `--channel-id`. A mismatch exits 2 with `{error: "channel_mismatch"}` and both IDs. Never proceed past a mismatch.

It then pages `commentThreads.list?part=snippet,replies&allThreadsRelatedToChannelId=<id>&order=time&maxResults=100`, stopping at the first page holding nothing inside the age window.

A thread is returned when all four hold:

- the top-level comment was published inside the age window
- the top-level comment author is not the channel owner
- no reply on the thread was authored by the channel owner
- `moderationStatus` is absent or `published`

Threads reporting `totalReplyCount > 5` are re-read in full through `comments.list?parentId=` before the owner-reply test. The replies array truncates at 5 regardless of the true count, so an answered thread looks unanswered without this step.

Result object: `channel_id`, `channel_title`, `max_age_days`, `pages`, `scanned`, `in_window`, `owner_authored_excluded`, `moderated_excluded`, `truncation_fallback_calls`, `quota_units`, `count`, `rows`.

## 5. Row shape

| Field | Meaning |
|---|---|
| `n` | 1-based row index |
| `handle` | commenter display name |
| `body` | original comment text, untruncated |
| `ageDays` | fractional days since publication |
| `ageText` | `12m` / `4h` / `3d` |
| `parentId` | top-level comment id — required to post |
| `videoId` | video the thread sits on |
| `publishedAt` | ISO 8601 |
| `totalReplyCount` | replies already on the thread |

## 6. Post reply step

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/post-reply.js" \
  --parent-id <row parentId> --text-file /tmp/reply-<n>.txt --output /tmp/result-<n>.json
```

Write the approved reply to a file and pass `--text-file`. Reply text contains quotes and line breaks that shell quoting mangles.

The script posts through `comments.insert`, then re-reads the thread through `comments.list?parentId=` and confirms the new comment id is present and owner-authored. `ok: true` means confirmed landed. Exit is non-zero on anything else.

## 7. Errors and quota

| Condition | Meaning | Action |
|---|---|---|
| `NO_TOKEN` | no token file at the resolved path | point at the setup guide, HALT |
| `TOKEN_EXPIRED` | refresh rejected — revoked, or the 7-day test-mode cap | re-run the connect flow, HALT |
| `channel_mismatch` | signed in as a different channel | HALT, surface both IDs |
| HTTP 403 `quotaExceeded` | daily quota spent | stop posting, report rows not yet posted |
| HTTP 403 `commentsDisabled` | comments off for that video | skip the row, continue |

Reads cost 1 unit per call; a full channel scan is single digits. Each posted reply costs 50. The default daily allowance is 10,000, so roughly 200 replies per day.

## 8. Known limits

- **No hearting.** The API has no endpoint to set a heart. Hearting stays a manual action in YouTube Studio.
- **Heart state is invisible.** A comment hearted but not replied to reads as unanswered here, while Studio treats it as handled. The gap widens past roughly 4 days, which is why the default window is 4. The error direction is offering a row already handled, never hiding one.
- **Age window is the only scope control.** There is no count cap; everything unanswered inside the window is returned.
