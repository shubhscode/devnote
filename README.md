# devnote — open-source, local-first Inkdrop clone

No subscription. Your Markdown, on your disk, searchable offline.

> Status: Phase 3b done (see `PLAN.md`). CodeMirror 6 editor + sanitized GFM preview
> with edit/preview/split modes, `/` slash menu + selection bubble menu (block transforms),
> Telescope, templates, revisions, themes (Nord/Dracula/Solarized/Catppuccin),
> git sync (`~/devnote` file mirror + private repo, auto-commit/pull/push,
> conflict resolution by newer `updatedAt`, loser preserved as `.conflict-<device>.md`),
> web build green.
> 145 unit tests + 20 e2e passing; `pnpm lint`/`pnpm build`/`pnpm test`/`pnpm e2e` all green.

## Run

```bash
pnpm install
pnpm dev      # apps/web on :5173
pnpm test     # vitest (core)
pnpm build
```

Rust/Tauri desktop (`apps/desktop`) — requires rustup + stable toolchain:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
pnpm --filter @devnote/desktop dev     # Tauri dev window (loads apps/web)
pnpm build                             # web + desktop release (.app + .dmg in apps/desktop/src-tauri/target/release/bundle/)
```

## Layout

- `apps/web` — Vite React 18 + Tailwind v4 + reicon-react icons
- `packages/core` — pure TS: Notebook tree, Note types, search-query parser
- `PLAN.md` — what to build, in order. `AGENTS.md` — how to build.

## Search

Qualifiers `book:`, `tag:`, `status:`, `title:`, `body:`, `"quoted phrases"`, `-exclusions`
(combined with AND; exclusions-only matches nothing — Inkdrop parity).
Like Inkdrop, there is **no partial-match stemming**: searching `trin` won't find `string`.
Filter icon = current notebook, globe = all notebooks. `pnpm bench` gates 5k-note search (<50ms; currently ~1–3ms).

## Icons

[reicon.dev](https://reicon.dev) via `reicon-react` (MIT, 2674+ icons, Outline/Filled).
Usage: `import { Notebook, Tag, Magnifier } from 'reicon-react'` — named imports (tree-shakeable), `size/color/weight` props, `currentColor` by default so Tailwind `text-*` works.

## Sync (git)

Optional. Notes live in `~/devnote` as `.md` files with YAML frontmatter.
Sync via a private git repo (GitHub, GitLab, etc.).

**Setup:**
1. Create a private repo (e.g. `git@github.com:you/devnote.git`)
2. In Preferences → General → Git sync, paste the remote URL
3. Click **Sync now** — initializes repo, exports notes, commits, pushes

**How it works:**
- Sync now: export → commit → pull → resolve conflicts → push → import
- Conflicts: newer `updatedAt` wins; loser preserved as `<name>.conflict-<device>.md`
- Status dot in sidebar: green=synced, yellow=uncommitted, blue=unpushed, red=conflict
- Manual trigger only (no auto-commit) — you control when to sync

**Backup:**
- Preferences → General → Backup & restore → Export backup (.zip)
- Creates `~/devnote-backup-YYYY-MM-DD.zip` with all notes
- Restore overwrites `~/devnote` from a zip
