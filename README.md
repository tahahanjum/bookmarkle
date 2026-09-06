# BookMarkle | Bookmark Manager

A Chrome new-tab replacement that turns your bookmarks into boards on a full-screen
wallpaper.

Everything is stored locally in your own browser. There is no account, no sign-in and
no server — nothing you save ever leaves your machine.

---

## Install (2 minutes)

1. **Download this repository** — click the green **Code** button above, then
   **Download ZIP**, and unzip it somewhere you'll keep it (not your Downloads folder,
   since Chrome loads it from wherever it sits).
2. Open Chrome and go to **`chrome://extensions`**
3. Turn on **Developer mode** — the toggle in the top-right corner
4. Click **Load unpacked**
5. Select the **`bookmarkle`** folder (the one containing `manifest.json`)
6. Open a new tab

That's it. Your new tab is now BookMarkle.

> **Keep the folder where it is.** Chrome loads the extension from that path — if you
> move or delete the folder, the extension stops working.

### Updating later

Download the new version, replace the folder, then press **Reload** (↻) on the
BookMarkle card at `chrome://extensions`. Your boards and bookmarks are stored
separately, so they survive updates.

---

## Getting started

A fresh install is empty — one page called **Home** and nothing else.

1. **Hover the empty space in any column** → an **Add Board** button appears. Click it,
   type a name, press Enter.
2. **Hover the board** → click the 🔗 button. Paste a URL, click **Add Link**. The page
   title is fetched for you; adjust it, optionally add a description, click **Add Link**
   again.
3. **Bottom-left image button** → pick a wallpaper. **More Wallpapers** opens a gallery
   of about a thousand more.

Everything else is drag-and-drop: boards move between columns, bookmarks move between
boards, and dropping a board onto a page tab moves it to that page.

---

## Features

- **Pages** — separate workspaces of boards. Hover a page tab for Rename / Share / Delete.
- **Boards and bookmarks** — auto-fetched titles, optional descriptions, favicons,
  drag-and-drop everywhere.
- **Wallpapers** — 23 bundled (default: **Final Rest**), plus a built-in gallery of ~1000 more. The accent colour
  is derived from whatever wallpaper you pick. Dark and Light each remember their own.
- **Search** — press `/` or `Ctrl+K`.
- **Privacy blur** — blurs every board until you hover one; handy when sharing a screen.
- **Trash** — deleted bookmarks, boards and pages can be restored.
- **Quick save** — `Ctrl+Shift+Y` saves the page you're on. The toolbar icon can also
  save every tab in the window at once.
- **Export / import** — back everything up as a JSON file, or move it to another machine.

Full documentation is in [`bookmarkle/README.md`](bookmarkle/README.md).

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` or `Ctrl+K` | Open search |
| `Esc` | Close search, menus and dialogs |
| `Ctrl+Shift+Y` | Quick save the current page |
| Double-click a board title | Rename it inline |
| Right-click a bookmark or page tab | Context menu |

---

## Privacy

- Your pages, boards, bookmarks and settings live in `chrome.storage.local`, on your
  machine only.
- The extension makes exactly three kinds of outbound request, all of them triggered by
  something you did:
  - fetching the **title** of a URL you are adding;
  - loading **favicons** from `google.com/s2/favicons`;
  - loading **wallpaper images** when you open the gallery or apply one.
- No analytics, no accounts, no telemetry.

---

## Troubleshooting

**The new tab is blank or unstyled.** Reload the extension at `chrome://extensions`,
then open a fresh tab.

**A bookmark's title didn't fill in.** Some sites block automated requests or need a
login. Type the title yourself, or use *Fetch All Titles* from the board's ⋮ menu later.

**The wallpaper gallery is empty.** It needs an internet connection. The 23 bundled
wallpapers work offline regardless.

**Another extension already controls my new tab.** Chrome only allows one. Disable the
other one, or keep both and switch between them at `chrome://extensions`.

---

## Notes

The wallpaper gallery streams images from the public LumiList wallpaper catalog. Those
images are not redistributed in this repository — they load from their own host, only when
you ask for them. 22 of the bundled wallpapers are gradients created by the build script;
the default one, **Final Rest**, is a photograph from that catalog, included so the default
works offline.

No licence file is included. If you're publishing this publicly, add one (MIT is the
usual choice for something like this) so people know what they may do with it.
