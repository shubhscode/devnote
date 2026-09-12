// Git sync adapter (Phase 3b): shells out to the git CLI in ~/devnote.
// We never reimplement git — the Rust side only runs commands and returns raw
// output; parsing + conflict policy live in packages/sync (pure, tested).
// See PLAN.md Phase 3b.
use std::path::Path;
use std::process::{Command, Output};

use serde::Serialize;

use crate::mirror::mirror_root;

fn ensure_root() -> Result<std::path::PathBuf, String> {
    let root = mirror_root()?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

/// Run git in the mirror root. `git-not-found` is a distinct error for the UI.
fn git(root: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "git-not-found".to_string()
            } else {
                e.to_string()
            }
        })
}

fn git_ok(root: &Path, args: &[&str]) -> Option<String> {
    let out = git(root, args).ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn git_available_inner() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn has_repo(root: &Path) -> bool {
    root.join(".git").exists()
}

/// Whether a tracking branch is configured for HEAD.
fn has_upstream(root: &Path) -> bool {
    git_ok(root, &["rev-parse", "--abbrev-ref", "@{u}"]).is_some()
}

fn combined(out: &Output) -> String {
    let mut s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if !err.is_empty() {
        if !s.is_empty() {
            s.push('\n');
        }
        s.push_str(&err);
    }
    s
}

#[derive(Serialize)]
pub(crate) struct GitStatusDto {
    has_git: bool,
    has_repo: bool,
    /// Raw `git status --porcelain=v1 --branch` output (parsed in TS).
    raw: String,
}

#[derive(Serialize)]
pub(crate) struct GitOpResult {
    ok: bool,
    conflict: bool,
    message: String,
}

#[derive(Serialize)]
pub(crate) struct ConflictStages {
    base: String,
    ours: String,
    theirs: String,
}

#[tauri::command]
pub(crate) fn git_available() -> bool {
    git_available_inner()
}

#[tauri::command]
pub(crate) fn git_status_raw() -> Result<GitStatusDto, String> {
    let has_git = git_available_inner();
    if !has_git {
        return Ok(GitStatusDto { has_git: false, has_repo: false, raw: String::new() });
    }
    let root = mirror_root()?;
    if !has_repo(&root) {
        return Ok(GitStatusDto { has_git: true, has_repo: false, raw: String::new() });
    }
    let out = git(&root, &["status", "--porcelain=v1", "--branch"])?;
    let raw = String::from_utf8_lossy(&out.stdout).to_string();
    Ok(GitStatusDto { has_git: true, has_repo: true, raw })
}

#[tauri::command]
pub(crate) fn git_init() -> Result<(), String> {
    let root = ensure_root()?;
    if has_repo(&root) {
        return Ok(());
    }
    // `-b main` needs git >= 2.28; fall back to plain init on older versions.
    if git(&root, &["init", "-b", "main"])?.status.success() {
        // ok
    } else {
        let out = git(&root, &["init"])?;
        if !out.status.success() {
            return Err(combined(&out));
        }
    }
    // Repo-local identity fallback so commits work without global config.
    if git_ok(&root, &["config", "user.email"]).unwrap_or_default().is_empty() {
        let _ = git(&root, &["config", "user.email", "devnote@localhost"]);
    }
    if git_ok(&root, &["config", "user.name"]).unwrap_or_default().is_empty() {
        let _ = git(&root, &["config", "user.name", "devnote"]);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn git_get_remote() -> Result<Option<String>, String> {
    let root = mirror_root()?;
    if !has_repo(&root) {
        return Ok(None);
    }
    Ok(git_ok(&root, &["remote", "get-url", "origin"]).filter(|s| !s.is_empty()))
}

#[tauri::command]
pub(crate) fn git_set_remote(url: String) -> Result<(), String> {
    let root = ensure_root()?;
    if !has_repo(&root) {
        return Err("not-a-repo".to_string());
    }
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("empty-remote".to_string());
    }
    let args: Vec<&str> = if git_ok(&root, &["remote"]).map(|r| r.lines().any(|l| l == "origin")).unwrap_or(false) {
        vec!["remote", "set-url", "origin", trimmed]
    } else {
        vec!["remote", "add", "origin", trimmed]
    };
    let out = git(&root, &args)?;
    if !out.status.success() {
        return Err(combined(&out));
    }
    Ok(())
}

/// Stage everything and commit when there is something staged. False = no-op.
#[tauri::command]
pub(crate) fn git_commit_all(message: String) -> Result<bool, String> {
    let root = mirror_root()?;
    if !has_repo(&root) {
        return Err("not-a-repo".to_string());
    }
    let add = git(&root, &["add", "-A"])?;
    if !add.status.success() {
        return Err(combined(&add));
    }
    let quiet = git(&root, &["diff", "--cached", "--quiet"])?;
    if quiet.status.success() {
        return Ok(false); // nothing staged
    }
    let msg = if message.trim().is_empty() { "devnote: sync" } else { message.trim() };
    let commit = git(&root, &["commit", "-m", msg])?;
    if !commit.status.success() {
        return Err(combined(&commit));
    }
    Ok(true)
}

#[tauri::command]
pub(crate) fn git_pull() -> Result<GitOpResult, String> {
    let root = mirror_root()?;
    if !has_repo(&root) {
        return Err("not-a-repo".to_string());
    }
    if !has_upstream(&root) {
        return Ok(GitOpResult { ok: true, conflict: false, message: "no upstream".into() });
    }
    let out = git(&root, &["pull", "--no-rebase", "--no-edit"])?;
    let conflict = if out.status.success() {
        false
    } else {
        git_ok(&root, &["diff", "--name-only", "--diff-filter=U"])
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    };
    Ok(GitOpResult { ok: out.status.success(), conflict, message: combined(&out) })
}

#[tauri::command]
pub(crate) fn git_push() -> Result<GitOpResult, String> {
    let root = mirror_root()?;
    if !has_repo(&root) {
        return Err("not-a-repo".to_string());
    }
    let args: Vec<&str> = if has_upstream(&root) { vec!["push"] } else { vec!["push", "-u", "origin", "HEAD"] };
    let out = git(&root, &args)?;
    Ok(GitOpResult { ok: out.status.success(), conflict: false, message: combined(&out) })
}

/// Stage 1/2/3 blobs for one unmerged path (`git show :N:path`).
#[tauri::command]
pub(crate) fn git_conflict_stages(path: String) -> Result<ConflictStages, String> {
    let root = mirror_root()?;
    if !has_repo(&root) {
        return Err("not-a-repo".to_string());
    }
    let show = |stage: &str| -> String {
        let spec = format!(":{stage}:{path}");
        git_ok(&root, &["show", &spec]).unwrap_or_default()
    };
    Ok(ConflictStages { base: show("1"), ours: show("2"), theirs: show("3") })
}

#[tauri::command]
pub(crate) fn git_add(paths: Vec<String>) -> Result<(), String> {
    let root = mirror_root()?;
    if !has_repo(&root) {
        return Err("not-a-repo".to_string());
    }
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["add", "--"];
    args.extend(paths.iter().map(String::as_str));
    let out = git(&root, &args)?;
    if !out.status.success() {
        return Err(combined(&out));
    }
    Ok(())
}

/// Finish an in-progress merge with a resolution commit.
#[tauri::command]
pub(crate) fn git_finish_merge(message: String) -> Result<bool, String> {
    let root = mirror_root()?;
    if !has_repo(&root) {
        return Err("not-a-repo".to_string());
    }
    let msg = if message.trim().is_empty() { "devnote: resolve conflicts" } else { message.trim() };
    let out = git(&root, &["commit", "-m", msg])?;
    if !out.status.success() {
        return Err(combined(&out));
    }
    Ok(true)
}

#[tauri::command]
pub(crate) fn git_abort_merge() -> Result<(), String> {
    let root = mirror_root()?;
    if !has_repo(&root) {
        return Err("not-a-repo".to_string());
    }
    let out = git(&root, &["merge", "--abort"])?;
    if !out.status.success() {
        return Err(combined(&out));
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn git_device_name() -> String {
    if let Ok(name) = std::env::var("DEVNOTE_DEVICE") {
        if !name.trim().is_empty() {
            return name;
        }
    }
    if let Ok(host) = std::env::var("HOSTNAME") {
        if !host.trim().is_empty() {
            return host;
        }
    }
    if let Ok(out) = Command::new("hostname").output() {
        if out.status.success() {
            let host = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !host.is_empty() {
                return host;
            }
        }
    }
    "device".to_string()
}
