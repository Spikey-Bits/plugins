# Connecting YouTube

> Loaded when the skill halts because there is no working connection. One-time setup, about five minutes.

## Before you start

Two things must already be true.

**1. You have the credentials file.** A `.json` file supplied with your profile. Save it inside a folder you have connected to this session, and put its path in your profile's `credentials path` field. Do not rename it to anything you will not recognise later, and do not put it in a folder you share.

**2. Google's domains are allowlisted.** This tool talks to Google directly, so the sandbox has to be allowed to reach it. In **Settings → Capabilities → Domain allowlist**, add all three:

```
googleapis.com
www.googleapis.com
oauth2.googleapis.com
```

Without these, every call fails with a network error rather than a useful message. Allow changes a moment to take effect.

## Connect

Run this and it prints a long URL:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/auth-init.js"
```

Open the URL in a browser signed in to the Google account that can reply on the channel. Owner or Editor access — Viewer is not enough.

Approve the request. If a warning says the app is not verified, open **Advanced** and continue; that warning appears while the app is still in test mode.

The browser will then fail to load a page at `localhost` and show something like "this site can't be reached." **That is the expected result.** Nothing is broken and nothing is listening on that address by design.

Look at the address bar. It contains `code=` followed by a long value. Copy that value, stopping at the next `&`, and run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/auth-init.js" --code <the code>
```

It prints the channel it connected to. Check that the channel name is yours.

## Where the connection is stored

A file named `yt-token.json`, saved beside the credentials file unless the profile sets `token path`. It refreshes itself, so this is a one-time step.

Both files belong in a connected folder on your own machine. Anything written elsewhere is discarded when the session ends, and the connect flow will run again every time.

## Checking and reconnecting

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/auth-init.js" --status
```

Reports the connected channel, or the reason it cannot connect.

Repeat the connect steps whenever the status reports the token expired or was revoked. While the app is in test mode Google expires the connection after seven days; once the app is verified, it stops expiring.

To disconnect, remove access at **myaccount.google.com/permissions** and delete `yt-token.json`.

## What this permission allows

One scope, `youtube.force-ssl`, which is what YouTube requires to read comments and post replies as you. This tool only ever reads comments and posts replies you have approved one at a time.
