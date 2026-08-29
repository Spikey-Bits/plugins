'use strict';
// Post one approved reply and confirm it landed by re-reading the thread.
//
//   node post-reply.js --parent-id <id> --text-file /tmp/reply.txt --output /tmp/result.json
//   node post-reply.js --parent-id <id> --text "short reply"
//
// --text-file is preferred: reply text contains quotes and newlines that shell
// argument quoting mangles. Confirmation re-reads the thread rather than
// trusting the insert response alone.
//
// Sources: developers.google.com/youtube/v3/docs/comments/insert
//          developers.google.com/youtube/v3/docs/comments/list

const fs = require('fs');
const { execFileSync } = require('child_process');
const yt = require('./yt.js');

const YT_MAX_REPLY_CHARS = 10000;
const VERIFY_ATTEMPTS = 5;
const VERIFY_WAIT_SECONDS = 2;

// A reply is not always readable back the instant insert returns. Poll rather
// than reporting a successful post as failed.
function sleep(seconds) { execFileSync('sleep', [String(seconds)]); }

const args = process.argv.slice(2);
function arg(name, dflt) { const i = args.indexOf(name); return i > -1 ? args[i + 1] : dflt; }

try {
  const parentId = arg('--parent-id');
  const textFile = arg('--text-file');
  const output = arg('--output');
  const text = textFile ? fs.readFileSync(textFile, 'utf8').replace(/\s+$/, '') : arg('--text');

  if (!parentId) throw new Error('--parent-id is required');
  if (!text) throw new Error('--text or --text-file is required and must not be empty');
  if (text.length > YT_MAX_REPLY_CHARS) throw new Error('Reply is ' + text.length + ' chars, over the ' + YT_MAX_REPLY_CHARS + ' limit');

  const owner = yt.ownerChannel();
  const posted = yt.insertReply(parentId, text);

  let replies = [], match, attempts = 0;
  while (attempts < VERIFY_ATTEMPTS) {
    attempts++;
    replies = yt.listReplies(parentId);
    match = replies.filter(function (r) { return r.id === posted.id; })[0];
    if (match) break;
    if (attempts < VERIFY_ATTEMPTS) sleep(VERIFY_WAIT_SECONDS);
  }
  const verified = !!match && match.snippet.authorChannelId && match.snippet.authorChannelId.value === owner.id;

  const result = { ok: verified, parent_id: parentId, reply_id: posted.id,
    published_at: posted.snippet && posted.snippet.publishedAt, chars: text.length,
    verified_by: 'comments.list re-read', verify_attempts: attempts,
    thread_reply_count: replies.length, quota_units: 50 + attempts + 1 };

  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(verified ? 0 : 1);
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.code || 'post_failed', message: e.message, detail: e.body || e.detail || null }));
  process.exit(1);
}
