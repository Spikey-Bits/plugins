'use strict';
// One-time YouTube connect. Two steps, because a loopback listener started in
// this sandbox is not the same machine as the browser: nothing can receive the
// redirect. The browser lands on a "site can't be reached" page and the code is
// in that page's address bar.
//
//   node auth-init.js                 -> prints the consent URL
//   node auth-init.js --code <code>   -> exchanges it and saves the token
//   node auth-init.js --status        -> checks an existing token
//
// Source: developers.google.com/identity/protocols/oauth2/native-app

const yt = require('./yt.js');

const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i > -1 ? args[i + 1] : undefined; }

function status() {
  if (!yt.loadToken()) return { connected: false, reason: 'no token file', token_path: yt.tokenPath() };
  try {
    const ch = yt.ownerChannel();
    return { connected: true, token_path: yt.tokenPath(), channel_id: ch.id, channel_title: ch.title, handle: ch.handle };
  } catch (e) {
    return { connected: false, reason: e.code === 'TOKEN_EXPIRED' ? 'token expired or revoked' : e.message, token_path: yt.tokenPath() };
  }
}

try {
  if (args.indexOf('--status') > -1) {
    const s = status();
    console.log(JSON.stringify(s, null, 2));
    process.exit(s.connected ? 0 : 1);
  }

  const code = arg('--code');
  if (!code) {
    console.log('Open this URL in a browser signed in as the channel owner:\n');
    console.log(yt.consentUrl());
    console.log('\nApprove access. The browser will then fail to load a 127.0.0.1 page. That is expected.');
    console.log('Copy the value of "code=" from that page\'s address bar and run:\n');
    console.log('  node auth-init.js --code <the code>\n');
    process.exit(0);
  }

  const saved = yt.exchangeCode(decodeURIComponent(code));
  const ch = yt.ownerChannel();
  console.log(JSON.stringify({ connected: true, token_path: saved, channel_id: ch.id,
    channel_title: ch.title, handle: ch.handle }, null, 2));
} catch (e) {
  console.error('FAILED: ' + e.message);
  if (e.detail) console.error(e.detail);
  process.exit(1);
}
