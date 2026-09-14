<div align="center">
  <a href="https://shubhscode.github.io/devnote/">
    <img src="docs/icon.svg" alt="devnote logo" width="96" height="96">
  </a>

  <h1>devnote</h1>

  <p><b>Open-source, local-first Markdown notebook for developers. No subscription.</b></p>
  <p>Your Markdown, on your disk, searchable offline — with optional git sync.</p>

  <p>
    <a href="https://github.com/shubhscode/devnote"><img alt="GitHub stars" src="https://img.shields.io/github/stars/shubhscode/devnote?style=social"></a>
    <a href="https://github.com/shubhscode/devnote"><img alt="GitHub forks" src="https://img.shields.io/github/forks/shubhscode/devnote?style=social"></a>
    <a href="https://github.com/shubhscode/devnote/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/shubhscode/devnote"></a>
    <a href="https://github.com/shubhscode/devnote/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/shubhscode/devnote"></a>
  </p>

  <p>
    <a href="https://shubhscode.github.io/devnote/"><b>📖 Documentation &amp; live tour</b></a> ·
    <a href="https://github.com/shubhscode/devnote/releases">⬇ Download for macOS</a>
  </p>
</div>

---

## Why devnote?

Good Markdown notebooks for developers exist — but the polished ones charge ~$5/mo for hosted sync and keep your notes in a database. devnote is the subscription-free alternative:

|                         | devnote | Inkdrop | Notion | Obsidian |
|-------------------------|---------|---------|--------|----------|
| Price                   | **$0 · MIT** | ~$5/mo | freemium | freemium |
| Works fully offline     | ✅ | ✅ | limited | ✅ |
| Notes as plain Markdown | ✅ `~/devnote` | DB + export | blocks | ✅ |
| Git sync, no vendor cloud | ✅ | hosted only | — | paid / add-on |
| Qualifier search        | ✅ | ✅ | filters | plugins |
| Open source             | ✅ | — | — | — |

**Principles:** local-first files you own · keyboard-first, mouse-optional · GFM + code beautiful · fast search over fancy features · no cloud required.

## ✨ Features

- **3-pane workspace** — Sidebar (notebooks / statuses / tags / trash) · note list + search · editor + preview
- **Code-first GFM editor** — CodeMirror 6, syntax highlighting, copy-code buttons, `/` slash menu, selection bubble menu, table assist, edit / preview / side-by-side / distraction-free modes
- **Instant offline search** — `book:`, `tag:`, `status:`, `title:`, `body:`, `"quoted phrases"`, `-exclusions` over 5k notes in ~1–3ms ([search reference](https://shubhscode.github.io/devnote/search.html))
- **Telescope fuzzy finder** (`mod+K`) — `>` commands · `b` notebooks · `t` tags · `#` headings · `h` themes
- **Organization** — nested notebooks (reorderable), tags, statuses, pin-to-top, workspace view, templates (`mod+T`), automatic revision history with undoable restore, multi-select bulk move/tag/status/pin/duplicate/export, note-list sort (updated/created/title)
- **Optional git sync** — share `~/devnote` through a private repo; newer `updatedAt` wins, losers preserved as `.conflict-<device>.md`, never silent data loss ([setup](https://shubhscode.github.io/devnote/sync.html))
- **7 themes** — Light / Dark / System + Nord, Dracula, Solarized, Catppuccin; code colors follow in editor and preview
- **Private by default** — no account, no telemetry, zero required network calls. SQLite is an index; Markdown files are the truth

## 🚀 Quickstart

**macOS app** — download the `.dmg` from [Releases](https://github.com/shubhscode/devnote/releases), drag DevNote into `/Applications`.
> Unsigned build: on first launch, right-click DevNote → Open (once), or run `xattr -cr /Applications/DevNote.app`.

**From source** (Node 20+, pnpm 9; stable Rust toolchain for the desktop shell):

```bash
git clone https://github.com/shubhscode/devnote.git
cd devnote
pnpm install

pnpm dev                                   # web app on :5173
pnpm --filter @devnote/desktop dev         # desktop app (real Cmd keys)
pnpm desktop:install                       # release build → /Applications + smoke test
```

**Verify:**

```bash
pnpm lint && pnpm test && pnpm e2e && pnpm build
```

## ⌨️ Keyboard-first

`mod` = `⌘` on macOS, `Ctrl` elsewhere. Every action is also a `core:*` palette command.

| Action | Shortcut |
|---|---|
| Telescope (fuzzy finder) | `mod+K` |
| New note / Duplicate | `mod+N` / `mod+D` |
| Templates | `mod+T` |
| Edit / Preview / Side-by-side | `mod+E` / `mod+P` |
| Distraction-free / Sidebar | `mod+Shift+D` / `mod+/` |
| Focus search | `mod+Shift+F` |
| Note history back / forward | `mod+←` / `mod+→` |
| Preferences | `mod+,` |

Full map: [shortcuts](https://shubhscode.github.io/devnote/shortcuts.html).

## 🔍 Search

```
typescript tag:Work status:Completed
book:Engineering "conflict drill" -draft
title:deploy body:TODO tag:rust
```

Terms combine with AND; ranking is title ×3, tags ×2, body ×1 (pinned first, then recent). One honest limitation: **no partial-match stemming** — `trin` won't find `string`.

## 🌿 Sync (optional, git-based)

1. Create a **private** repo (e.g. `git@github.com:you/devnote.git`)
2. In devnote: Preferences → General → Git sync, paste the remote URL
3. Click **Sync now** — init, export, commit, pull, resolve, push

Sidebar dot: 🟢 synced · 🟡 uncommitted · 🔵 unpushed · 🔴 conflict. Backup anytime via Preferences → Export backup (`.zip`).

## 🧱 Project structure

```
apps/
  web/                 # Vite + React 18 + Tailwind v4 (also loaded by Tauri)
  desktop/             # Tauri 2 wrapper (fs, sqlite, git, backup)
packages/
  core/                # pure TS domain logic — no UI imports, fully unit-tested
  editor/              # CodeMirror 6 setup, slash menu, table assist
  preview/             # remark-gfm → rehype-highlight → sanitize → React
  sync/                # git sync engine (pure TS)
  importers/           # Markdown/Evernote/Notion/Bear importers
docs/                  # this documentation site (GitHub Pages)
PLAN.md                # what to build, in order
AGENTS.md              # how to build (agent instructions)
```

**Status:** Phase 3b done — 145 unit tests + 20 e2e passing; `lint` / `test` / `e2e` / `build` all green. See [`PLAN.md`](PLAN.md) for the roadmap.

## 🤝 Contributing

Issues and PRs welcome. Quick rules: TypeScript strict, `packages/core` stays framework-agnostic with unit tests, Conventional Commits (`feat:`, `fix:`, `docs:`…), keep diffs small, run `pnpm lint && pnpm test` before pushing. Details in [`AGENTS.md`](AGENTS.md).

## 📄 License

MIT — see [LICENSE](LICENSE). No telemetry, no lock-in, no subscription.
