// Backup/restore: one-click zip of ~/devnote (Phase 3c).
// Paths are confined to the mirror root; no traversal.
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::mirror::mirror_root;

fn collect_all(dir: &Path, root: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') { continue; }
            }
            collect_all(&path, root, out)?;
        } else {
            out.push(path);
        }
    }
    Ok(())
}

#[derive(Serialize)]
pub(crate) struct BackupInfo {
    path: String,
    files: usize,
}

/// Create ~/devnote-backup-YYYY-MM-DD.zip with all mirror files.
#[tauri::command]
pub(crate) fn backup_zip() -> Result<BackupInfo, String> {
    let root = mirror_root()?;
    if !root.exists() {
        return Err("mirror not initialized".to_string());
    }
    let home = std::env::var("HOME").map_err(|e| format!("no HOME: {e}"))?;
    let now = chrono_free_filename();
    let zip_path = Path::new(&home).join(format!("devnote-backup-{now}.zip"));
    let file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(6));

    let mut paths = Vec::new();
    collect_all(&root, &root, &mut paths)?;
    let mut count = 0;
    for full in &paths {
        let rel = full.strip_prefix(&root).map_err(|e| e.to_string())?;
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        let data = fs::read(full).map_err(|e| e.to_string())?;
        zip.start_file(&rel_str, opts).map_err(|e| e.to_string())?;
        zip.write_all(&data).map_err(|e| e.to_string())?;
        count += 1;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(BackupInfo { path: zip_path.to_string_lossy().to_string(), files: count })
}

/// Restore ~/devnote from a zip file (overwrites existing files, skips hidden dirs).
#[tauri::command]
pub(crate) fn restore_zip(zip_path: String) -> Result<usize, String> {
    let root = mirror_root()?;
    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut count = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let entry_path = entry.mangled_name();
        let entry_str = entry_path.to_string_lossy().replace('\\', "/");
        // Skip hidden dirs (.git etc.)
        if entry_str.split('/').any(|s| s.starts_with('.') && s != ".") {
            continue;
        }
        let out_path = root.join(&entry_str);
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            fs::write(&out_path, buf).map_err(|e| e.to_string())?;
        }
        count += 1;
    }
    Ok(count)
}

fn chrono_free_filename() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let mut days: u64 = secs / 86400;
    let mut y = 1970u32;
    loop {
        let year_days: u64 = if is_leap(y) { 366 } else { 365 };
        if days < year_days { break; }
        days -= year_days;
        y += 1;
    }
    let mdays: [u64; 12] = if is_leap(y) { [31,29,31,30,31,30,31,31,30,31,30,31] } else { [31,28,31,30,31,30,31,31,30,31,30,31] };
    for (i, &d_in) in mdays.iter().enumerate() {
        if days < d_in {
            return format!("{:04}-{:02}-{:02}", y, i + 1, days + 1);
        }
        days -= d_in;
    }
    format!("{y:04}-01-01")
}

fn is_leap(y: u32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}
