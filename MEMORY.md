# MEMORY.md — devnote session memory (caveman)

> Read this + `AGENTS.md` + `PLAN.md` to resume. Replaces `PROGRESS.md`. Verified green 2026-09-13 (2.9).

## What

devnote — open-source local-first Markdown notebook, no subscription. Replaces ~$5/mo hosted sync. Thesis: Markdown files you own (`~/devnote`), SQLite index, optional git sync via private repo. No account, no telemetry, Wi-Fi-off usable.

## Stack

- Monorepo `pnpm` workspaces. `apps/web` Vite + React 18 + TS strict + Tailwind v4 + CodeMirror 6 + reicon-react. Loads in browser AND Tauri WebView.
- `apps/desktop` Tauri 2 Rust shell (fs, mirror, git CLI, backup zip, opener).
- `packages/core` pure TS, no UI imports, fully unit-tested. `packages/editor` CM6 logic. `packages/preview` remark-gfm → rehype-highlight → sanitize → React. `packages/sync` pure git-status parse + conflict resolve. `packages/importers` NOT exist yet.
- IDs `crypto.randomUUID`, dates ISO-8601 UTC, validation `zod` (core), tests `vitest`, e2e `playwright`.
- Data now: localStorage (SQLite index later, gated — see Track 1.6). Sync git-first (CouchDB dropped to optional).

## Commands

```bash
pnpm dev                                   # web :5173 (browser; Chrome steals some Cmd keys)
pnpm --filter @devnote/desktop dev         # desktop app (real Cmd keys). Restart after tauri.conf/Rust changes (no HMR there)
pnpm test | pnpm bench | pnpm e2e | pnpm lint | pnpm build
pnpm desktop:install                       # release build → /Applications + smoke test
pnpm release <v>                           # bump versions, commit, tag. Push + changelog manual
```

Background procs may run: `pnpm --filter @devnote/desktop dev` (owns :5173), `target/debug/devnote-desktop`. Kill: `pkill -f "devnote-desktop"; pkill -f vite`.

## Phase status

- [x] Phase 0 skeleton, CI commands (`dev/lint/test/build/e2e/bench`)
- [x] Phase 1a notebooks tree + notes CRUD/trash/restore + 3-pane UI + shortcuts
- [x] Phase 1b CodeMirror + GFM preview (highlight, alerts, sanitize). Images deferred to Phase 3 file mirror
- [x] Phase 1c search grammar (`book/tag/status/title/body`, phrases, `-exclude`), rank title3/tag2/body1, `pnpm bench` 5k notes ~1–3ms (gate 50ms)
- [x] Phase 2 templates, revisions, Telescope (`mod+K`: `>` 13 `core:*` cmds, `b` notebooks, `t` tags, `#` TOC, `h` themes), workspace view (`mod+Enter` toggle), preferences, desktop chrome (frameless + traffic lights)
- [x] Editor extras: `/` slash menu, bubble menu (bold/italic/code/link/fence/lists/quote/task/alert), table assist, fence-lang + word complete
- [x] Phase 3a mirror core engine + Tauri `mirror_*` + Export/Import in Preferences. Watch + attachments pending
- [x] Phase 3b git sync: export→commit→pull→resolve→push→import, sidebar dot (green/yellow/blue/red), conflict banner, newer-`updatedAt` wins, loser `*.conflict-<device>.md`, tombstones via `trashed:true`
- [x] Phase 3c backup zip export (partial — restore UX stub, see 3.4)
- [x] Phase 6a silent-exit fixed (`NSNumber::new_bool` KVO bug), smoke test in install script. Update-available notice + release script done
- [x] **Batch A safety hardening (2026-09-13)** — see below
- [x] **2.8 tag rename/merge/delete (2026-09-13)**: `packages/core/tags.ts` (`renameTag`/`mergeTags`/`untagNotes`, case-insensitive, trashed incl, dedupe, blank-throws), `normalizeTags` + `allTags` case-folded (first-seen casing wins; search already case-insensitive), `App.tagCounts` folded, store `renameTag`/`mergeTags`/`deleteTag` (rename also rewrites live `tag:` query), Sidebar hover Rename (inline input) / Merge (inline + datalist) / Delete (App `ConfirmDialog` via `tagDelete` state). Unused tags vanish free (tags derived, never stored). 10 core tests + 2 e2e (`tags.spec.ts`)
- [x] **2.9 bulk organization (2026-09-13)**: core `reorderNotebook` (sibling swap, edge-throws) + `NoteSortKey` (`updated`/`created`/`title`, pinned-first kept) + `moveNotes`/`tagNotes`/`setNotesStatus`/`setNotesPinned`; store `noteSort` in Settings (persisted, default updated; search stays rank-ordered) + `moveNotesTo`/`bulkTag`/`bulkStatus`/`bulkPin`/`exportNotes` (individual `.md` blob downloads via `noteFilename`/`noteToMarkdown`) + `selectRange` (anchor = last selected else active, union over visible order) + exposed `setSelectedIds`; Sidebar hover up/down reorder (edge-disabled); NoteList sort select + Select-all/Clear + scoped `mod+A` + shift-click range + bulk bar (Move… dialog reuse, #Tag inline, Status select, Pin/Unpin, Duplicate, Export, Trash). 7 core tests + 4 e2e (`bulk.spec.ts`)
- [ ] Next: 2.6 (table row/col cmds) + 2.1 (attachments), then Track 3 → Track 4 → 1.6 SQLite gate
- [x] **1.1 store split (2026-09-14)**: zustand 5.0.15 MIT; `lib/store/{types,persist,select,state}.ts` + thin `store.ts` (re-exports + `useDevnote` + `DevnoteStore` alias). All state + 60 actions in `createDevnoteStore` (get/set, no stale-closure refs; `editClock`/`externalWriteSeq`/`snapDedupe` module-level). Panes self-subscribe (Sidebar/NoteList/Editor/Telescope/History); App shell cold-only (theme/notice/selection/notebooks/workspace/activeNoteId/sync + dialog slices) — typing never re-renders shell. Persistence via `wirePersistence` subscribe (debounced db, immediate slices, quarantine, quota, pagehide, cross-tab). `pickQuery` + `patch()` store actions. 182 unit + 28 e2e green. `useDevnoteStore` hook deleted.
- [x] **2.3/2.4/2.7 content batch (2026-09-14)**: `core/wordstats.ts` (fence-aware words/chars/reading-min, 5 tests); `preview/tasks.ts` (`setTaskChecked` via mdast positions, byte-preserving; `countTasks`; hast indexer `data-task-index`; 8 tests), `preview/export.ts` (`exportHtmlDoc` themed standalone doc, 1 test), `indexHeadings` + `rehype-slug` anchors (MIT dep) + `required:{}` schema override (upstream forces `disabled` on inputs); Editor status bar + Outline panel + export MD/HTML/PDF menu; PreviewView delegated task/heading clicks; store `commitBodyExternal` (outside edits via external-write channel); `content.spec.ts` 6 e2e. Gotchas: loose `li>p>input` needs ancestor tracking; hooks must stay above the null-note early return (trash crash); CM Enter auto-continues `- [ ]` (tests type text only). 196 unit + 34 e2e green.
- [x] **UI polish: find panel + preferences (2026-09-14)**: themed CM search panel (card, sunken fields, accent buttons, match wash/fill); prefs section cards, theme swatch grid (radio semantics kept), full sync status labels, note-list sort default setting, shortcut filter with counts.
- [x] **UI batches 1–5 (2026-09-14, critique 24/40)**: RowMenu + useFocusTrap on all 6 dialogs, toolbar/copy/toast a11y, labeled Edit/Split/Preview radiogroup, bubble 5+overflow, list collapse (mod+\), sidebar/list drag-resize persisted, @tanstack/react-virtual replaces 200-cap, EmptyState + distinct no-results/trash empties, Sync prefs tab, isValidGitRemote, conflict loser link in banner, Tauri dialog-plugin restore picker with confirm. Gotchas: pagehide flush clobbers localStorage seeds (use __devnoteStore dev hook); import.meta.env needs cast form (root lint lacks vite/client); e2e key names Backslash/Slash. 226 unit + 62 e2e green.

## Verified green (2026-09-13 sweep)

`pnpm lint` ✅ · `pnpm test` 182 unit ✅ (22 files, incl `tags.test.ts` 10 + reorder/sort/bulk 7) · `pnpm e2e` 28 specs ✅ (incl `tags.spec.ts` 2 + `bulk.spec.ts` 4) · `pnpm build` ✅ (web + `DevNote.app` + `.dmg`; first dmg bundle flaked `bundle_dmg.sh`, green on retry — transient, not code).

## Architecture — must not regress

- Single source of truth: title/body render from store, commit per keystroke. No drafts.
- CodeEditor mounts once; note switch = `setState` in layout effect; same-note external writes (template/restore) via `externalBodyWrite` seq channel (store → Editor → CodeEditor).
- App key handler: `e.defaultPrevented` guard first (CM-consumed keys never double-fire); mount-once + `ref`/`uiRef` mirrors (never stale closures). Sidebar row Enter scoped to plain Enter only.
- Revisions: snapshot on switch/idle(30s, poll 10s)/pre-restore/pre-template; `lastSnap` dedupes same-tick doubles; caps 50/note + 500 global.
- Search: exclusions-only matches nothing (hint shown); no stemming (documented README + tooltip).
- Mirror: `slug-id8.md`, orphan prune only id-bearing files, adoption write-back keeps timestamps, newer-`updatedAt` wins, never deletes on import. Rust rejects `..`/absolute paths.
- Persistence: notes debounced 400ms + `pagehide` flush; settings/templates/revisions immediate.
- Preview: unified pipeline lazy-chunked; HTML always via `rehype-sanitize` (extended schema); never mutate siblings inside `unist-util-visit` (infinite loop — two-pass).
- `applyEdits` contract: single edits carry final cursor coords (no drift); multi-edits omit selection (CM maps it).
- CM Enter quirk: `interactionDelay` 75ms ignores Enter right after typing — e2e waits 300ms.
- e2e: `apps/web/e2e/*.spec.ts`, localStorage cleared per test, seed notes Welcome/Roadmap. Vitest excludes `e2e/**`.
- Batch A additions: all persisted slices load via single `loadPersisted(adapter)`; saves via injected `StorageAdapter` (default `localStorageAdapter`); corrupt payloads quarantine to `devnote:corrupt:<key>:<stamp>`, never silently overwritten; cross-tab `storage` events reload slice + toast; quota errors toast loudly; render crashes caught per-pane + root; async errors (`error`/`unhandledrejection`) toast + persist `devnote:last-error`.

## Gotchas fixed (don't reintroduce)

1. `frontendDist` must be `../../web/dist` (was `../web/dist` → build red).
2. `pnpm --filter @devnote/web add` once didn't persist highlight.js — verify `package.json` after adds.
3. `@lezer/highlight` has no `HighlightStyle` (lives `@codemirror/language`).
4. Updater side-effects + StrictMode double-invoke → compute ids outside `setState` updaters.
5. `mod+T`/`mod+N` can't override in browsers — desktop app real target.
6. Test ids with `crypto.randomUUID` — never assert across `seed()` calls.
7. TS: filter-predicate type must fit param union — use explicit push pattern, not `filter((k): k is string => ...)`.
8. `packages/core` stays window-free — `localStorageAdapter` lives in `apps/web/src/lib/storage.ts`, not core.

## Batch A — done 2026-09-13 (files)

- `packages/core/src/storage.ts` (new): `STORAGE_KEYS`, `StorageAdapter`, `MemoryStorage`, `quarantineKey`, `isQuotaError`, `CORRUPT_PREFIX`. Exported from `core/index.ts`.
- `packages/core/src/storage.test.ts` (new, 6 tests): key stability, round-trip, quarantine move/no-op/hostile, quota detect.
- `apps/web/src/lib/storage.ts` (new): `localStorageAdapter`.
- `apps/web/src/lib/store.ts`: `useDevnoteStore(adapter = localStorageAdapter)`, `loadPersisted` single load path, quarantine on corrupt shape/parse, quota toasts, corruption toast on mount, cross-tab `storage` listener (skip corrupt).
- `apps/web/src/components/ErrorBoundary.tsx` (new): class boundary, per-pane + root fallback, Retry + Reload, logs `devnote:last-error`.
- `main.tsx`: root `<ErrorBoundary name="app">`.
- `App.tsx`: per-pane boundaries (sidebar/note list/editor) + global `error`/`unhandledrejection` → toast + persist.
- `TemplatePicker.tsx`: `window.confirm` gone; in-app `ConfirmDialog` via `pendingDelete` state. Last `TODO(Phase 2.5)` closed.

## Backlog plan (user-locked decisions)

Decisions: lead Tracks 1+2, spec 3+4 fully, features ship on localStorage BEFORE SQLite, mobile deferred. All new features: core pure-TS + thin store/UI slice behind `StorageAdapter` (done in Batch A) → SQLite swap later = zero rework.

### Track 1 — data safety + perf

- 1.1 (M) store split ✅ DONE 2026-09-14 (see Phase status). Kills per-keystroke full-App re-render.
- 1.2 (M) list virtualization past 200-row `RENDER_CAP` + `pnpm bench` CI gate (fail >50ms).
- 1.3 (S) quota UX polish (banner + export/prune action). Partial done Batch A (toast); needs action buttons.
- 1.4 (M) revision diff view + content-hash dedup + restore-to-note op (`hash`, `deviceId` fields).
- 1.5 (S) trash expiry 30d (default on) + trash count + restore-conflict prompt.
- 1.6 (L, GATED after features) SQLite migration: `wa-sqlite`+OPFS web / Tauri SQL plugin desktop, FTS5 ranker parity (title3/tag2/body1), `localStorage → SQLite` migration + rollback doc.

### Track 2 — editor power (order)

1. 2.8 (S) tag rename/merge + delete-unused + case-normalize. ✅ DONE 2026-09-13 (see above).
2. 2.9 (M) notebook reorder (`sortOrder` API + UI) + note-list sort (updated/created/title) + bulk move/tag/status/pin/duplicate/export + shift-range + select-all. ✅ DONE 2026-09-13.
3. 2.3 (S) word count + reading time status bar; TOC outline sidebar (reuse `editor/toc.ts`) + preview anchors (`rehype-slug`). ✅ DONE 2026-09-14 (outline = header panel, not sidebar; anchors = data-heading-index + slug ids).
4. 2.4 (S) preview checkbox click → round-trip to editor body. ✅ DONE 2026-09-14 (`setTaskChecked` + `commitBodyExternal`).
5. 2.7 (S) single-note export MD/styled-HTML/PDF (`window.print` CSS). ✅ DONE 2026-09-14 (export lives in `preview/export.ts`, not `core/export.ts` — owns the pipeline).
6. 2.2 (M) `[[wikilink]]` parse/resolve (`core/links.ts`), `[[` autocomplete, backlinks panel, broken-link flag. ✅ DONE 2026-09-14 (see batch log above).
7. 2.5 (M) find/replace (`@codemirror/search`) + lint (`@codemirror/lint`) + URL-paste-to-link + HTML-paste-as-markdown. `view.ts` 461 lines untested → add tests. ✅ DONE 2026-09-14 (view.test.ts + paste.test.ts + lint.ts; 223 unit + 42 e2e green).
8. 2.6 (S) table row/col add/remove/sort commands.
9. 2.1 (L, split a/b) attachments model + paste/drop/picker → `.attachments/` (desktop) / OPFS (web) + orphan GC + preview allowlist.
10. 2.11 (M) search `created:/updated:/pinned:/trashed:` + OR. No stemming (documented limit stays).
11. 2.12 (M, last) mermaid + KaTeX preview, lazy, settings toggle, bundle-diet guarded.

### Track 3 — sync + portability (spec'd, after 1+2)

- 3.1 `notify` watch → debounced index refresh + toast.
- 3.2 attachments sync (track `.attachments/`, LFS note >50MB, path rewrite).
- 3.3 `packages/importers/<md|enex|notion|bear|inkdrop|obsidian>`: reuse `mirror.ts`, dry-run count + tests + UI entry. Order MD → enex → Notion → Bear → Kindle.
- 3.4 backup UX: native save-picker (needs 4.4 dialog plugin), backup-before-restore, fix same-day zip overwrite + `.git` handling doc. `onRestoreZip` still stub (notice only).
- 3.5 sync docs: SSH/HTTPS + credential-helper, key-backup runbook, error table, merge-abort recovery.
- 3.6 E2EE spike optional (passphrase → AES-GCM pre-commit). Defer if >1wk.
- 3.7 CouchDB stays deferred, git-only default.
- Exit: 2 machines × 1wk zero loss + conflict-drill `.conflict-` file + banner.

### Track 4 — desktop/security/release (spec'd, parallelizable)

- 4.1 path-guard fixes: `guarded_path` on `git_add`/`conflict_stages`, canonicalize+`starts_with` symlink check, `restore_zip` Zip-Slip reject, `file://` remote confirm.
- 4.2 restrictive CSP (`default-src 'self' customprotocol: asset:`, `connect-src ipc:`, `img-src 'self' asset: blob: data:`) + `src-tauri/permissions/*.toml` scoping to `~/devnote`. Current `csp: null`, caps unscoped.
- 4.3 non-blocking I/O (git `Command::output`, full `mirror_read`, zip off main thread) + timeouts + size caps + symlink-loop guard; `$HOME`-only `mirror_root` → `%USERPROFILE%` fallback.
- 4.4 plugins: `log` (replace `console.*`), `dialog` (file picker), `single-instance`, `window-state`. Decide `autostart` keep/drop.
- 4.5 CI on push/PR (lint+test+build+cargo+doctor+license+size+bench gate) + release: Linux target, aarch64+x86_64, signing/notarization, `createUpdaterArtifacts` + updater plugin (replaces manual-download `updates.ts`).
- 4.6 `[profile.release] strip+lto+panic=abort`; hljs used-only langs + lazy dialogs.
- 4.7 docs: per-OS data dirs, salvage/quota runbook, rollback (prior bundle + manifest swap), Homebrew late.

### Deferred

Mobile Capacitor deferred. Git sync on mobile needs NO app support: Working Copy clones private repo, edits `.md`, commits/pushes; desktop pulls. No SSL server, SSH/HTTPS direct. Limits: manual commits, no background sync, clock-skew `updatedAt` trust, attachment bloat. Future Capacitor path: `apps/web` + `isomorphic-git` + Filesystem API, same repo format. Also deferred: plugins/SDK, AI/MCP, CouchDB.

## Execution batches

Batch A ✅ → 2.8 ✅ → 2.9 ✅ → 1.1 store split → 2.3 + 2.4 + 2.7 → 2.2 + 2.5 → 2.1 → Track 3 → Track 4 → 1.6 SQLite gate. One vertical slice per diff (<400 lines): core + UI + vitest. `lint+test+e2e` green each batch. PLAN checkbox update each batch.

## Key files

- Store: `apps/web/src/lib/store.ts` (thin: re-exports + `useDevnote` + `getDevnoteStore`), slices `apps/web/src/lib/store/{types,persist,select,state}.ts`, adapter `apps/web/src/lib/storage.ts`, core boundary `packages/core/src/storage.ts`
- App shell: `apps/web/src/App.tsx` (698+), `main.tsx`, `components/ErrorBoundary.tsx`, `TemplatePicker.tsx`, `ConfirmDialog.tsx`
- Editor: `apps/web/src/components/{Editor,CodeEditor,EditorBubbleMenu}.tsx`, `packages/editor/src/{text,view,slash,table,toc,complete,codeblock}.ts`
- Search: `packages/core/src/{search,fuzzy}.ts`; mirror `packages/core/src/mirror.ts`; templates/revisions/themes/sync same dir
- Rust: `apps/desktop/src-tauri/src/{main,mirror,git,backup}.rs`, `tauri.conf.json` (`csp: null`, `macOSPrivateApi: true`, frameless), `capabilities/default.json`
- Docs site: `docs/*.html` (GitHub Pages). `PLAN.md` roadmap source of truth. This file replaces `PROGRESS.md`.

## Open inputs / assets needed

- Real logo 1024px PNG → replace `apps/desktop/src-tauri/icons/` placeholders + gen `icon.icns/.ico`.
- Decide `autostart` keep/drop (6d) when reaching Track 4.
- `onRestoreZip` stub still notice-only — needs dialog plugin (4.4) + 3.4.

## 2026-09-15 PLAN compaction + v6 analysis

- PLAN.md compacted: all DONE detail moved here; PLAN now future-work-only. Phases 0/1/2, 3a (engine+Tauri+watch), 3b (git+conflicts+tombstones), 3c backup-export, 6a fix + update notice + release script, Batch A, 2.8, 2.9, 1.1, 2.3/2.4/2.7, 2.2/2.5, 1.2 virtualization (@tanstack/react-virtual), tooltip audit, header consolidation, table assist, desktop chrome, theme part 1 (themes.ts + h picker) — all DONE, verified green 2026-09-14 (226 unit + 62 e2e).
- Inkdrop v6 forum post (`forum-inkdrop-app-t-whats-new-in-v6-5570.md`) analyzed. Verdict filed in PLAN §5/§6. Adopted: 2.13 polish batch, `=WIDTH`+viewer post-2.1, notebook icons late, import wizard spec (3.3), 3-way merge spike (3.8), stdio MCP + `x-agent:` frontmatter (Phase 5). Rejected: GitHub embed+OAuth, signed URLs, registry previews, usage-stats, streaks, Marp resize, blockquote agent hack.
- **2.12 mermaid DONE (2026-09-15)**: preview `mermaid.ts` re-tags fence → sanitized div (text-child source, NOT data-attr — stringify leaves `<` unescaped in quoted attrs; `&#x3C;` numeric entities used); schema `div:className`; web `lib/mermaid.ts` lazy-chunk load (mermaid ^12, per-diagram chunks auto-split), base theme from CSS vars, strict securityLevel, error → raw source; `settings.renderDiagrams` default true + persist merge + prefs Editing toggle; CSS `.mermaid-block` (busy/error = source view, svg max-width). aggregate/28 e2e green: lint ✅ 243 unit ✅ 67 e2e ✅, build per-diagram chunks lazy. KaTeX left in 2.14.
- **2.14 Excalidraw preview slice DONE (2026-09-15)**: `packages/preview/excalidraw.ts` `excalidrawPlaceholder()` (mirrors mermaid pattern: fence → `div.excalidraw-block`, JSON as escaped text child, pre-sanitize); `renderMarkdown` opts `excalidraw?: boolean`, wired to same `renderDiagrams` toggle; schema `div.className` already allowed; web `lib/excalidraw.ts` lazy `exportToSvg` (exportBackground:false, transparent bg), JSON validation, error → raw source; CSS `.excalidraw-block`; dep @excalidraw/excalidraw ^0.18.1 (MIT) in @devnote/web only. 4 unit tests. lint ✅ 247 unit ✅ 67 e2e ✅; bundle-diet verified: 1.15MB excalidraw chunk + deps load only on first block, eager entry unchanged. Remaining 2.14: editor bubble button + `.attachments/<slug>.excalidraw` + dialog canvas; KaTeX into 2.12 pipeline.
- **v0.4.0 released (2026-09-15)**: 3 commits (diagrams feat, docs, ci ubuntu) + release: v0.4.0 tag pushed; CI all 3 jobs (mac/windows/ubuntu-22.04) green. Assets: dmg aarch64 / exe+msi x64 / amd64 .deb + .AppImage / x86_64 .rpm. .impeccable/ gitignored. Gaps for 4.2: no x64 dmg (mac intel users — add macos-latest dual target or x86_64-apple-darwin job), no arm64 .deb/.rpm. Homebrew tap skipped (user choice); cask template ready when wanted (needs shubhscode/homebrew-tap + arch-keyed urls/sha256; aarch64 dmg sha256 d9b8e27e22e46402650aece27c08b26086bbe2e52f510ab16c7a63940937a932).
