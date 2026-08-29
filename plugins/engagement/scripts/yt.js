'use strict';
// YouTube Data API v3 client. Dependency-free: Node built-ins + curl only.
// Node's fetch cannot use the sandbox HTTP proxy and npm is not reachable.
// Sources: developers.google.com/youtube/v3/docs/channels/list
//          developers.google.com/youtube/v3/docs/commentThreads/list
//          developers.google.com/youtube/v3/docs/comments/list
//          developers.google.com/youtube/v3/docs/comments/insert
//          developers.google.com/identity/protocols/oauth2/native-app

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
const API = 'https://www.googleapis.com/youtube/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const FALLBACK_REDIRECT = 'http://127.0.0.1:3000/';

const enc = encodeURIComponent;

function credentialsPath() {
  const p = process.env.YT_CREDENTIALS_PATH;
  if (!p) throw new Error('YT_CREDENTIALS_PATH is not set. It comes from the profile skill field "credentials path".');
  if (!fs.existsSync(p)) throw new Error('Credentials file not found at ' + p);
  return p;
}

// Token lives beside the credentials file so it survives the session.
function tokenPath() {
  return process.env.YT_TOKEN_PATH || path.join(path.dirname(credentialsPath()), 'yt-token.json');
}

function clientKeys() {
  const raw = JSON.parse(fs.readFileSync(credentialsPath(), 'utf8'));
  const k = raw.installed || raw.web;
  if (!k || !k.client_id || !k.client_secret) throw new Error('Credentials file has no "installed" or "web" client block.');
  return k;
}

// Secrets go in a 0600 curl config file, never in argv (argv is world-readable via ps).
function curlCfg(lines) {
  const cfg = path.join(os.tmpdir(), 'ytc-' + process.pid + '-' + Date.now() + '.cfg');
  fs.writeFileSync(cfg, lines.join('\n') + '\n', { mode: 0o600 });
  try {
    const out = execFileSync('curl', ['-sS', '--max-time', '60', '-w', '\\n%{http_code}', '--config', cfg],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const i = out.lastIndexOf('\n');
    return { status: parseInt(out.slice(i + 1), 10), body: out.slice(0, i) };
  } finally { try { fs.unlinkSync(cfg); } catch (e) { /* scratch file */ } }
}

function postForm(url, body) {
  const bf = path.join(os.tmpdir(), 'ytb-' + process.pid + '-' + Date.now() + '.txt');
  fs.writeFileSync(bf, body, { mode: 0o600 });
  try {
    return curlCfg(['url = "' + url + '"', 'request = "POST"',
      'header = "Content-Type: application/x-www-form-urlencoded"', 'data-binary = "@' + bf + '"']);
  } finally { try { fs.unlinkSync(bf); } catch (e) { /* scratch file */ } }
}

function loadToken() {
  const p = tokenPath();
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function saveToken(tok) {
  const p = tokenPath();
  fs.writeFileSync(p, JSON.stringify(tok, null, 2), { mode: 0o600 });
  return p;
}

// Desktop clients register a loopback redirect. Use the one in the credentials
// file so the request matches what Google has on record for this client.
function redirectUri() {
  const k = clientKeys();
  return (k.redirect_uris && k.redirect_uris[0]) || FALLBACK_REDIRECT;
}

function consentUrl() {
  const k = clientKeys();
  return AUTH_URL + '?client_id=' + enc(k.client_id) + '&redirect_uri=' + enc(redirectUri()) +
    '&response_type=code&scope=' + enc(SCOPE) + '&access_type=offline&prompt=consent';
}

function exchangeCode(code) {
  const k = clientKeys();
  const r = postForm(TOKEN_URL, 'code=' + enc(code) + '&client_id=' + enc(k.client_id) +
    '&client_secret=' + enc(k.client_secret) + '&redirect_uri=' + enc(redirectUri()) + '&grant_type=authorization_code');
  if (r.status !== 200) throw new Error('Code exchange failed (HTTP ' + r.status + '): ' + r.body);
  const j = JSON.parse(r.body);
  if (!j.refresh_token) throw new Error('No refresh_token returned. Re-run consent with prompt=consent.');
  return saveToken(Object.assign(j, { expiry: Date.now() + (j.expires_in - 60) * 1000 }));
}

function refreshToken(tok) {
  const k = clientKeys();
  const r = postForm(TOKEN_URL, 'client_id=' + enc(k.client_id) + '&client_secret=' + enc(k.client_secret) +
    '&refresh_token=' + enc(tok.refresh_token) + '&grant_type=refresh_token');
  if (r.status !== 200) { const e = new Error('TOKEN_EXPIRED'); e.code = 'TOKEN_EXPIRED'; e.detail = r.body; throw e; }
  const j = JSON.parse(r.body);
  const merged = Object.assign({}, tok, j, { expiry: Date.now() + (j.expires_in - 60) * 1000 });
  saveToken(merged);
  return merged;
}

function accessToken() {
  let t = loadToken();
  if (!t) { const e = new Error('NO_TOKEN'); e.code = 'NO_TOKEN'; throw e; }
  if (!t.expiry || Date.now() >= t.expiry) t = refreshToken(t);
  return t.access_token;
}

function apiGet(endpoint, params) {
  const qs = Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== null; })
    .map(function (k) { return enc(k) + '=' + enc(params[k]); }).join('&');
  const r = curlCfg(['url = "' + API + '/' + endpoint + '?' + qs + '"',
    'header = "Authorization: Bearer ' + accessToken() + '"']);
  if (r.status !== 200) { const e = new Error('API ' + endpoint + ' HTTP ' + r.status); e.status = r.status; e.body = r.body; throw e; }
  return JSON.parse(r.body);
}

function apiPost(endpoint, params, payload) {
  const qs = Object.keys(params).map(function (k) { return enc(k) + '=' + enc(params[k]); }).join('&');
  const bf = path.join(os.tmpdir(), 'ytp-' + process.pid + '-' + Date.now() + '.json');
  fs.writeFileSync(bf, JSON.stringify(payload), { mode: 0o600 });
  try {
    const r = curlCfg(['url = "' + API + '/' + endpoint + '?' + qs + '"', 'request = "POST"',
      'header = "Authorization: Bearer ' + accessToken() + '"', 'header = "Content-Type: application/json"',
      'data-binary = "@' + bf + '"']);
    if (r.status !== 200) { const e = new Error('API ' + endpoint + ' HTTP ' + r.status); e.status = r.status; e.body = r.body; throw e; }
    return JSON.parse(r.body);
  } finally { try { fs.unlinkSync(bf); } catch (e) { /* scratch file */ } }
}

function ownerChannel() {
  const j = apiGet('channels', { part: 'id,snippet', mine: 'true' });
  const it = j.items && j.items[0];
  if (!it) throw new Error('channels.list?mine=true returned no channel for this account.');
  return { id: it.id, title: it.snippet && it.snippet.title, handle: it.snippet && it.snippet.customUrl };
}

function listThreads(channelId, pageToken) {
  return apiGet('commentThreads', { part: 'snippet,replies', allThreadsRelatedToChannelId: channelId,
    maxResults: 100, order: 'time', pageToken: pageToken });
}

function listVideoThreads(videoId, pageToken) {
  return apiGet('commentThreads', { part: 'snippet,replies', videoId: videoId,
    maxResults: 100, order: 'time', pageToken: pageToken });
}

function listReplies(parentId) {
  const out = []; let pageToken;
  do {
    const j = apiGet('comments', { part: 'snippet', parentId: parentId, maxResults: 100, pageToken: pageToken });
    out.push.apply(out, j.items || []);
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

function insertReply(parentId, text) {
  return apiPost('comments', { part: 'snippet' }, { snippet: { parentId: parentId, textOriginal: text } });
}

module.exports = { SCOPE, redirectUri, credentialsPath, tokenPath, consentUrl, exchangeCode,
  loadToken, saveToken, accessToken, ownerChannel, listThreads, listVideoThreads, listReplies, insertReply };
