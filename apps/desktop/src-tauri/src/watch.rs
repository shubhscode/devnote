// File-mirror watcher (Phase 3a): emits `mirror-changed` when ~/devnote
// changes on disk (external edits, git pull by another tool, second device).
// The web UI debounces the event and re-imports — never auto-commits.
use std::sync::mpsc;
use std::sync::OnceLock;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// Quiet period before an event burst becomes one `mirror-changed` emit.
const QUIET_MS: u64 = 750;

/// Event name shared with `apps/web/src/lib/mirrorWatch.ts`.
pub(crate) const MIRROR_CHANGED_EVENT: &str = "mirror-changed";

/// The watcher thread owns the only `RecommendedWatcher`; this flag just
/// keeps the `mirror_watch_start` command idempotent per process.
static WATCH_STARTED: OnceLock<()> = OnceLock::new();

#[tauri::command]
pub(crate) fn mirror_watch_start(app: AppHandle) -> Result<bool, String> {
    if WATCH_STARTED.get().is_some() {
        return Ok(false);
    }
    // notify needs an existing path on some platforms — the mirror root is
    // cheap to ensure here (import/export tolerate an empty dir).
    let root = super::mirror::mirror_root()?;
    if !root.exists() {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    }
    // Claim first so a concurrent second call can't spawn a second thread.
    if WATCH_STARTED.set(()).is_err() {
        return Ok(false);
    }
    std::thread::spawn(move || watch_loop(app, root));
    Ok(true)
}

fn watch_loop(app: AppHandle, root: std::path::PathBuf) {
    let (tx, rx) = mpsc::channel();
    let mut watcher = match notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        let _ = tx.send(res);
    }) {
        Ok(w) => w,
        Err(_) => return,
    };
    if watcher.watch(&root, RecursiveMode::Recursive).is_err() {
        return;
    }
    // Keep the watcher alive for the process lifetime.
    let _watcher = watcher;
    loop {
        // Block for the first event, then coalesce until QUIET_MS of silence.
        if rx.recv().is_err() {
            break;
        }
        loop {
            match rx.recv_timeout(Duration::from_millis(QUIET_MS)) {
                Ok(_) => continue,
                Err(_) => break,
            }
        }
        let _ = app.emit(MIRROR_CHANGED_EVENT, serde_json::json!({}));
    }
}
