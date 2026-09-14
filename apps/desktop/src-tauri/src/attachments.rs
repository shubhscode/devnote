// Attachment bytes (Phase 3a): `.attachments/` read/write for pasted and
// dropped images. Filenames are computed in @devnote/core (`attachments.ts`);
// this side only confines the path and moves bytes (base64 over IPC).
use std::fs;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

/// Mirror-relative `.attachments/<file>` only — no subdirs, no escapes.
fn guarded_attachment(relative: &str) -> Result<std::path::PathBuf, String> {
    if !relative.starts_with(".attachments/") {
        return Err(format!("not an attachment path: {relative}"));
    }
    let rest = &relative[".attachments/".len()..];
    if rest.is_empty() || rest.contains('/') || rest.contains('\\') || rest == ".." || relative.contains("..") {
        return Err(format!("invalid attachment path: {relative}"));
    }
    let ext = Path::new(rest)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "svg" => {}
        _ => return Err(format!("rejected attachment type: {relative}")),
    }
    Ok(super::mirror::mirror_root()?.join(".attachments").join(rest))
}

#[tauri::command]
pub(crate) fn attachment_write(relative_path: String, base64_content: String) -> Result<String, String> {
    let full = guarded_attachment(&relative_path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = B64.decode(base64_content.as_bytes()).map_err(|e| e.to_string())?;
    fs::write(&full, bytes).map_err(|e| e.to_string())?;
    Ok(relative_path)
}

#[tauri::command]
pub(crate) fn attachment_read(relative_path: String) -> Result<String, String> {
    let full = guarded_attachment(&relative_path)?;
    let bytes = fs::read(&full).map_err(|e| e.to_string())?;
    Ok(B64.encode(bytes))
}
