'use strict';
// Scan a channel for comment threads the owner has not replied to.
//
//   node fetch-unresponded.js --channel-id <UC...> --max-age-days 4 --output /tmp/rows.json
//   node fetch-unresponded.js --video-id <id> --max-age-days 4 --output /tmp/rows.json
//
// Predicate: in the age window AND the owner has not replied AND the top-level
// comment was not written by the owner. Owner-authored threads are pinned links
// and self-promo; replying to them is always wrong.
// Replies truncate at 5 regardless of the real count, so any thread reporting
// more than 5 is re-read in full before the predicate runs.
//
// Sources: developers.google.com/youtube/v3/docs/commentThreads/list
//          developers.google.com/youtube/v3/docs/comments/list
//          PATH-D-VERIFICATION-REPORT.md N1 (owner exclusion), V2 (truncation at 5), V5 (moderationStatus)

const fs = require('fs');
const yt = require('./yt.js');

const REPLY_TRUNCATION_THRESHOLD = 5;
const MAX_PAGES = 25;

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i > -1 ? args[i + 1] : dflt; }

function ageText(days) {
  if (days < 1 / 24) return Math.max(1, Math.round(days * 1440)) + 'm';
  if (days < 1) return Math.round(days * 24) + 'h';
  return Math.round(days) + 'd';
}

try {
  const maxAgeDays = parseFloat(arg('--max-age-days', '4'));
  const output = arg('--output');
  const videoId = arg('--video-id');
  const expectedChannel = arg('--channel-id');

  const owner = yt.ownerChannel();
  if (expectedChannel && expectedChannel !== owner.id) {
    console.log(JSON.stringify({ error: 'channel_mismatch', profile_channel_id: expectedChannel,
      authenticated_channel_id: owner.id, authenticated_channel_title: owner.title }, null, 2));
    process.exit(2);
  }

  const cutoff = Date.now() - maxAgeDays * 86400000;
  const rows = [];
  let pageToken, pages = 0, scanned = 0, inWindow = 0, ownerAuthored = 0, moderated = 0, fallbackCalls = 0;

  do {
    const page = videoId ? yt.listVideoThreads(videoId, pageToken) : yt.listThreads(owner.id, pageToken);
    const items = page.items || [];
    pages++;
    let pageInWindow = 0;

    for (const t of items) {
      scanned++;
      const top = t.snippet.topLevelComment.snippet;
      const published = Date.parse(top.publishedAt);
      if (published < cutoff) continue;
      pageInWindow++; inWindow++;

      if (top.moderationStatus && top.moderationStatus !== 'published') { moderated++; continue; }
      if (top.authorChannelId && top.authorChannelId.value === owner.id) { ownerAuthored++; continue; }

      const parentId = t.snippet.topLevelComment.id;
      const total = t.snippet.totalReplyCount || 0;
      let replies = (t.replies && t.replies.comments) || [];
      if (total > REPLY_TRUNCATION_THRESHOLD) { replies = yt.listReplies(parentId); fallbackCalls++; }
      if (replies.some(function (r) { return r.snippet.authorChannelId && r.snippet.authorChannelId.value === owner.id; })) continue;

      const ageDays = (Date.now() - published) / 86400000;
      rows.push({ n: rows.length + 1, handle: top.authorDisplayName, body: top.textOriginal,
        ageDays: Math.round(ageDays * 100) / 100, ageText: ageText(ageDays), parentId: parentId,
        videoId: t.snippet.videoId, publishedAt: top.publishedAt, totalReplyCount: total });
    }

    pageToken = page.nextPageToken;
    if (pageInWindow === 0 && pages > 1) break;
  } while (pageToken && pages < MAX_PAGES);

  const result = { channel_id: owner.id, channel_title: owner.title, max_age_days: maxAgeDays,
    pages: pages, scanned: scanned, in_window: inWindow, owner_authored_excluded: ownerAuthored,
    moderated_excluded: moderated, truncation_fallback_calls: fallbackCalls,
    quota_units: pages + fallbackCalls + 1, count: rows.length, rows: rows };

  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(output ? Object.assign({}, result, { rows: '(written to ' + output + ')' }) : result, null, 2));
} catch (e) {
  console.error(JSON.stringify({ error: e.code || 'fetch_failed', message: e.message, detail: e.body || e.detail || null }));
  process.exit(1);
}
