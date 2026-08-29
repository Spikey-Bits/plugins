# Engagement

A Cowork plugin that answers YouTube comments in a brand's own voice, with a human approving every single reply.

It reads unanswered comments through the YouTube Data API, drafts a reply to each one, writes them into a Word document for review, and posts only what survives that review. There is no auto-post mode and no setting that enables one.

## How the two pieces fit

| Layer | Where it lives | Who owns it |
|---|---|---|
| The engine: steps, API scripts, review format | This plugin | The vendor. Replaced on every update. |
| The brand: channel, voice, topics, credentials path | The `engagement-profile` skill in your own account | You. Never touched by an update. |

This plugin contains nothing about any particular channel. Everything channel-specific comes from the profile skill you upload once. That is what lets the same plugin serve every customer and lets updates ship without disturbing anyone's setup.

## Prerequisites

1. **The `engagement-profile` skill**, supplied as a `.zip`. Upload it under Customize then Skills. Do not unzip it first.
2. **A credentials file**, supplied alongside it. Save it in a folder you have connected, and record its path in the profile.
3. **Google's domains allowlisted.** Under Settings then Capabilities then Domain allowlist, add `googleapis.com`, `www.googleapis.com` and `oauth2.googleapis.com`. Without these the plugin cannot reach YouTube.
4. **A one-time YouTube connection.** See `shared/oauth-setup-guide.md`. About five minutes, once.

## Trigger

```
/engagement:comment-responder              whole channel, the profile's default lookback
/engagement:comment-responder 7 days       wider window
/engagement:comment-responder 24 hours     just today
/engagement:comment-responder <video URL>  one video only
```

## What you will see

A count, then one Word document per batch of up to 75 comments, written to the review folder named in your profile. All batch documents open at once and can be handled in any order. Each card shows:

- Header: `#N · @handle · Nd · [TONE]`, blue on WARM, red on CLAPBACK
- `ORIGINAL:` the commenter's full text, read-only
- `REPLY:` the drafted reply, editable in place

## How to approve

- Leave a REPLY as drafted to post it as written.
- Type over a REPLY to post your version instead, verbatim.
- Delete a REPLY entirely to skip that comment.
- Save, then type `send` in chat, or paste the edited document body back into chat.

Only replies still present in the document get posted. Each one is confirmed by re-reading the thread afterwards.

A chat-only fallback exists for anyone who would rather not use the document: pick-syntax such as `1y 2n 3e Thanks for catching that 4y`. See `shared/approval-panel-template.md`.

## What it will never do

- Post anything you have not approved, row by row.
- Reply to comments outside the age window you asked for.
- State a product, rule, price or date fact that is not in your profile or in the comment being answered. When it does not know, it deflects warmly.
- Touch a comment you skipped.
- Claim that anyone fixed, updated or changed something.

## Known limits

- **No hearting.** The API has no endpoint for it. Hearting remains a manual action in YouTube Studio.
- **Heart state is invisible to the API.** A comment you hearted without replying still looks unanswered here, so it may be offered again. The gap widens beyond roughly four days, which is why the default window is short. The tool over-offers rather than hiding anything.
- **Owner-authored threads are excluded.** Pinned links posted by the channel itself are never drafted against.
- **Quota.** Scanning is effectively free. Each posted reply costs 50 of a 10,000 daily allowance, so roughly 200 replies a day.
- **Connection expiry.** While the vendor's Google app is in test mode, the connection expires after seven days and the connect step repeats. Once the app is verified, it stops expiring.

## Updates

Click Update on the Plugins page, or let it refresh on its own. Your profile skill is a separate object in your own account and is never affected.

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| `Not connected to YouTube` | no token, or it expired | run the connect steps in `shared/oauth-setup-guide.md` |
| Channel id mismatch HALT | signed in as the wrong Google account | reconnect as the account that owns the channel |
| Network errors on every call | Google domains not allowlisted | add all three domains, then start a new session |
| `No engagement-profile skill found` | profile not installed | upload the `.zip` under Customize then Skills |
| Nothing found but you have comments | window too narrow, or already answered | try a wider duration |
| Replies do not sound like you | the exemplar corpus is thin or mixed-author | send more of your own real replies for a profile rebuild |

## Rollback

Uninstall from the Plugins page. Nothing posts without per-row approval, so there is nothing to undo.
