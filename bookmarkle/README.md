# Bookmarkle

Listed in Chrome as **BookMarkle | Bookmark Manager**.

A Chrome new-tab replacement that turns your bookmarks into boards on a full-screen
wallpaper.

Everything is stored locally in `chrome.storage.local`. There is no account, no server
and no telemetry.

The browser tab itself stays neutral — it reads **New Tab** with no favicon, so the
extension does not announce itself in the tab strip.

## First run

A new install starts empty: one page called **Home** and nothing else. Hover any
column to reveal **Add Board**, name it, then use the 🔗 button on the board to add
bookmarks.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this `bookmarkle` folder
4. Open a new tab

## What it does

**Pages** — the pills at the top left. Each page is its own workspace of boards. Hover a
pill for a caret button whose menu holds **Rename**, **Share Page** and **Delete**;
`+` adds a page and drag reorders them. Deleting asks for confirmation first.

**Boards** — cards laid out in four columns. **Add Board** appears only while the pointer
is in the empty space *under* the last board of a column; hovering a board never shows it.
On an empty column that space is the whole column. Hover a board for the 🔗 (add link) and ⋮ buttons.
Double-click a title to rename inline. Drag a board between columns, or drop it on a
page pill to move it to that page.

The ⋮ menu carries **Open All Links**, **Fetch All Titles**, **Edit Board**,
**Share Board** and **Delete Board**.

**Bookmarks** — the 🔗 button opens a card inside the board. Step one is the URL alone
(**Add Link** / **Cancel**); pressing Add Link fetches the page title and expands the card
to URL + title + an optional description with a remaining-character counter (2000). The
second Add Link saves the bookmark and closes the card. Favicons come from
Chrome's favicon service with a coloured letter fallback. Drag bookmarks between boards.
Right-click one for open / copy / re-fetch title / edit / remove.

**Wallpapers** — the button at the bottom left. Dark and Light each remember their own
wallpaper; the default is **Final Rest**. The panel has three sections: your own
wallpapers, 23 bundled ones (12 light, 11 dark) that work with no network, and a live
slice of the gallery. Upload any image up to **100 MB**
and the accent colour and light/dark mode are read from the pixels.

**More Wallpapers** opens `gallery.html`, a full gallery page inside the extension backed
by the public LumiList catalog — roughly a thousand wallpapers with category chips,
Both/Dark/Light, search, sort, infinite scroll and a lightbox. Hovering a wallpaper offers
**Add to BookMarkle** and a preview; the lightbox adds **Download** and ← / → navigation.
Adding one copies it into your wallpaper list and re-themes the new tab from it.

The pencil on a wallpaper card opens **Adjust Wallpaper Style**: Primary Color and Board
Color as swatches with their hex values, then Board Opacity and Board Blur sliders, with
Cancel / Reset / Save. Edits preview live and Cancel puts them back.

Accent colours are always pushed into a readable band — a black wallpaper never produces
a black accent, a white one never produces a white accent, and a greyscale wallpaper gets
a neutral accent (near-white on dark, charcoal on light) rather than an invented hue.
Text on accent surfaces flips between white and near-black for contrast.

**Right rail** — Search, Export/Import, privacy blur (blurs whole boards until you hover
one), multi-select, Trash, hide-interface, Settings. With *Group right-side tools* on, the middle five collapse behind one button.

**Settings** — General (appearance and behaviour toggles, quick-save destination, shortcut),
Account (local storage summary, export, import, reset), Language, Support. The whole
panel and the toolbar popup are translated into 17 languages; Language picks one, or leave
it on Automatic to follow the browser. Arabic lays the panel out right-to-left.

**Trash** — deleted bookmarks, boards and pages are recoverable until you empty it.

**Popup and shortcuts** — the toolbar icon saves the current page or every tab in the
window. `Ctrl+Shift+Y` quick-saves; change it at `chrome://extensions/shortcuts`.

### Keyboard

| Key | Action |
| --- | --- |
| `/` or `Ctrl+K` | Open search |
| `Esc` | Close search, menus, dialogs, zen mode |
| `Ctrl+Shift+Y` | Quick save the current page |
| Double-click board title | Rename inline |
| Right-click bookmark / page tab | Context menu |

## Layout of the code

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest, new-tab override, commands |
| `newtab.html` | Page shell |
| `css/style.css` | All styling, themed through CSS custom properties |
| `js/catalog.js` | Bundled manifest + the live LumiList gallery, cached 12h |
| `js/color.js` | Accent derivation and the light/dark guards |
| `js/gallery.js` | The More Wallpapers page |
| `js/store.js` | Data model, persistence, all mutations |
| `js/icons.js` | Inline SVG icon set |
| `js/i18n.js` | Translation tables for the settings and popup, 17 languages |
| `js/app.js` | Rendering, drag and drop, dialogs, settings |
| `background.js` | Title fetching, quick save, save all tabs |
| `popup.html` / `popup.js` | Toolbar popup |
| `tools/` | Development only — see below |

## Development

`tools/` is not needed at runtime and can be deleted before packaging:

- `tools/make-icons.js` regenerates `icons/*.png` from `../logo/logo (2).png`
  (`node tools/make-icons.js`) — it keys the white background out, crops to the mark
  and downsamples to 16/32/48/128
- `tools/make-wallpapers.js` regenerates `wallpapers/*.png` and the manifest
- `tools/verify-package.js` checks a packaged copy is complete and ships no dev tooling
- `tools/dev-server.js` serves the extension over http with `tools/dev-chrome-shim.js`
  injected, so `newtab.html` and `gallery.html` both run in a normal tab:
  `node tools/dev-server.js` then open <http://localhost:5177>

In the dev preview, storage uses `localStorage` and title lookups are proxied through the
dev server (`/__title`), so titles match what the packaged extension fetches.

## Notes and limits

- The gallery streams images from the LumiList/Supabase catalog at runtime. Nothing is
  copied into the extension package, and images are only downloaded when you open the
  gallery or add one. If that host goes away the gallery empties; the 23 bundled
  wallpapers keep working.
- 22 of the bundled wallpapers are gradients generated by `tools/make-wallpapers.js`. The
  23rd, **Final Rest** (the dark one), is a photograph copied from the LumiList catalog
  because it is the default wallpaper and has to work offline — it is the only third-party image in the
  package. Everything else in the gallery is streamed, never copied.
- The catalog only publishes 11 light wallpapers, so most of the light count comes from
  the bundled ones.
- Language settings list the locales but this build ships English only; selecting another
  keeps English until translation files are added.
- **Fetch All Titles** requests each page directly. Sites that block cross-origin requests
  or need a login will keep their existing title.
- Favicons come from Chrome's own `t1.gstatic.com/faviconV2` service, resolved per origin
  so product sites keep their real icon (Drive stays Drive, Gmail stays Gmail). Unknown
  hosts 404 and fall back to a coloured letter tile. Remove `faviconUrl()` in `js/app.js`
  if you want the extension fully offline.
