// devnote desktop shell (Tauri 2 + Rust).
// Web UI in apps/web loads in the WebView. Native modules below.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mirror;
mod git;
mod backup;

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            {
                use objc2::msg_send;
                use objc2_app_kit::{NSColor, NSWindow};
                use objc2_foundation::{NSNumber, NSObject, NSString};
                use tauri::Manager;

                let window = _app.get_webview_window("main").expect("no main window");

                // NSWindow: clear background + not opaque so rounded corners show through.
                let ns_window = window.ns_window().expect("no ns window") as *mut NSWindow;
                unsafe {
                    (*ns_window).setBackgroundColor(Some(&NSColor::clearColor()));
                    (*ns_window).setOpaque(false);
                }

                // WKWebView: stop painting its own opaque background (KVO, no public setter).
                window.with_webview(move |webview| {
                    let wk = webview.inner() as *mut NSObject;
                    let value = NSNumber::new_bool(false);
                    let key = NSString::from_str("drawsBackground");
                    unsafe {
                        let _: () = msg_send![wk, setValue:&*value, forKey:&*key];
                    }
                })?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mirror::mirror_root_path,
            mirror::mirror_write,
            mirror::mirror_read,
            mirror::mirror_delete,
            mirror::mirror_sync,
            git::git_available,
            git::git_status_raw,
            git::git_init,
            git::git_get_remote,
            git::git_set_remote,
            git::git_commit_all,
            git::git_pull,
            git::git_push,
            git::git_conflict_stages,
            git::git_add,
            git::git_finish_merge,
            git::git_abort_merge,
            git::git_device_name,
            backup::backup_zip,
            backup::restore_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running devnote");
}
