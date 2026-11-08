# KTH Video Controls

A tiny Chrome extension that fixes the Kaltura video player embedded in Canvas, built for lectures at KTH but not KTH-specific: **Space pauses**, **keyboard shortcuts control playback speed**, and the time label shows **how much time is really left at your current speed**.

> *Svenska:* Chrome-tillägg för Kaltura-spelaren i Canvas (byggt för KTH). Mellanslag pausar, kortkommandon styr hastigheten och tidsvisningen visar verklig återstående tid.

## What it does

- **Space / `k`** toggles play/pause, even when focus is on the Canvas page instead of the player.
- **Speed shortcuts** in 0.25× steps. The last speed is remembered.
- **Honest time left.** The elapsed time stays as is, and the total gets a suffix with the real remaining time at the current speed, e.g. `1:31:06 · 52:31 kvar`.
- Works with the player inside nested iframes (Canvas → Kaltura).

## Install

1. Download this repo (**Code → Download ZIP**) and unzip it, or `git clone` it.
2. Open `chrome://extensions` and enable **Developer mode** (top right).
3. Click **Load unpacked** and select the folder (the one containing `manifest.json`).
4. Reload your Canvas page.

Don't move or delete the folder afterwards, Chrome loads the files from there.

## Shortcuts

| Key | Action |
|---|---|
| `Space` / `k` | Play / pause |
| `+` / `>` / `d` | Faster (+0.25×) |
| `-` / `<` / `s` | Slower (−0.25×) |
| `r` | Reset to 1× |
| `←` / `→` | −5 s / +5 s |
| `j` / `l` | −10 s / +10 s |
| `↑` / `↓` | Volume |
| `m` | Mute |
| `t` | Toggle an extra time box in the top-right of the video (off by default) |

## Permissions and other universities

The extension only runs on `*.kth.se`, `*.kaltura.com` and `*.instructure.com` (including iframes embedded there) and uses `storage` to remember your last speed. Nothing is sent anywhere.

It was tested on KTH only. If your university uses Kaltura in Canvas under another domain, add that domain (e.g. `"https://*.youruni.edu/*"`) to `matches` in `manifest.json` and reload the extension. Other players that use a plain HTML `<video>` element may work too.

## Notes

- Built for the Kaltura player used in Canvas at KTH. Other players may or may not work.
- Pure content script, no build step, no dependencies. The code is in `content.js`.

## License

[MIT](LICENSE)
