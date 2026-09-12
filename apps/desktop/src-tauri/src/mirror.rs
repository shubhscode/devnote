// Markdown file mirror (Phase 3a): ~/devnote read/write for the web UI.
// Git watch/sync lands in 3b. Paths are confined to the mirror root:
// absolute paths and `..` segments are rejected.
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub(crate) fn mirror_root() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|e| format!("no HOME: {e}"))?;
    Ok(Path::new(&home).join("devnote"))
}

fn guarded_path(relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.is_absolute() || relative.split('/').any(|s| s == ".." || s.is_empty()) {
        return Err(format!("invalid mirror path: {relative}"));
    }
    Ok(mirror_root()?.join(rel))
}

#[derive(Serialize)]
pub(crate) struct MirrorFile {
    path: String,
    content: String,
}

#[tauri::command]
pub(crate) fn mirror_root_path() -> Result<String, String> {
    Ok(mirror_root()?.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn mirror_write(relative_path: String, content: String) -> Result<(), String> {
    let full = guarded_path(&relative_path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full, content).map_err(|e| e.to_string())
}

fn collect_md(dir: &Path, root: &Path, out: &mut Vec<MirrorFile>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            // Skip hidden dirs (.git lands here in 3b — files still readable via git).
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') {
                    continue;
                }
            }
            collect_md(&path, root, out)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let rel = path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            out.push(MirrorFile { path: rel, content });
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn mirror_read() -> Result<Vec<MirrorFile>, String> {
    let root = mirror_root()?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    collect_md(&root, &root, &mut out)?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

#[tauri::command]
pub(crate) fn mirror_delete(relative_path: String) -> Result<(), String> {
    let full = guarded_path(&relative_path)?;
    if full.is_file() {
        fs::remove_file(&full).map_err(|e| e.to_string())?;
    }
    // Prune newly-empty parent dirs up to (not incl.) the root.
    let root = mirror_root()?;
    let mut dir = full.parent().map(Path::to_path_buf);
    while let Some(d) = dir {
        if d == root || !d.starts_with(&root) {
            break;
        }
        match fs::remove_dir(&d) {
            Ok(()) => {}
            Err(_) => break, // not empty (or raced) — stop
        }
        dir = d.parent().map(Path::to_path_buf);
    }
    Ok(())
}

#[derive(Deserialize)]
pub(crate) struct SyncWrite {
    pub(crate) path: String,
    pub(crate) content: String,
}

/// Batch writes + deletes in one IPC call (replaces N sequential invokes).
#[tauri::command]
pub(crate) fn mirror_sync(writes: Vec<SyncWrite>, deletes: Vec<String>) -> Result<(), String> {
    for w in &writes {
        let full = guarded_path(&w.path)?;
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&full, &w.content).map_err(|e| e.to_string())?;
    }
    let root = mirror_root()?;
    for d in &deletes {
        let full = guarded_path(d)?;
        if full.is_file() {
            fs::remove_file(&full).map_err(|e| e.to_string())?;
        }
        let mut dir = full.parent().map(Path::to_path_buf);
        while let Some(p) = dir {
            if p == root || !p.starts_with(&root) { break; }
            match fs::remove_dir(&p) {
                Ok(()) => {}
                Err(_) => break,
            }
            dir = p.parent().map(Path::to_path_buf);
        }
    }
    Ok(())
}