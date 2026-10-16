mod analysis;
mod backup;
mod codex;
mod commands;
mod handoff;
mod jobs;
mod libraries;
mod templates;
mod local_store;
mod model;
mod original;
mod organisations;
mod print;
mod remote;
mod runtime;
mod server_commands;
mod store;
use std::{collections::HashMap, fs, path::PathBuf, sync::Arc};
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

pub struct AppState {
    pub store: store::Store,
    pub jobs_dir: PathBuf,
    pub jobs: Mutex<HashMap<String, jobs::Job>>,
    codex: Mutex<Option<Arc<codex::Codex>>>,
}
impl AppState {
    pub async fn codex(&self) -> Result<Arc<codex::Codex>, String> {
        let mut slot = self.codex.lock().await;
        if let Some(c) = slot.as_ref() {
            return Ok(c.clone());
        }
        let service = codex::Codex::start(&self.jobs_dir).await?;
        *slot = Some(service.clone());
        Ok(service)
    }
}
pub fn run_mcp() {
    handoff::run_mcp();
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("launch-request", args);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            codex::set_resource_dir(app.path().resource_dir()?);
            let root = std::env::var_os("IMAGEGEN_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_local_data_dir()?);
            let jobs_dir = root.join("sessions");
            fs::create_dir_all(&jobs_dir)?;
            let store = store::Store::open(root).map_err(std::io::Error::other)?;
            let state = Arc::new(AppState {
                store,
                jobs_dir,
                jobs: Mutex::new(HashMap::new()),
                codex: Mutex::new(None),
            });
            app.manage(state.clone());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(handoff::serve(state, handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            analysis::describe_asset,
            print::convert_print_image,
            print::print_profile,
            original::original_asset_preview,
            original::extract_original_asset,
            commands::get_workspace,
            server_commands::server_status,
            server_commands::server_connect,
            server_commands::server_disconnect,
            server_commands::server_copy_local,
            server_commands::server_save_unsent,
            commands::image_data,
            commands::get_jobs,
            commands::connection,
            commands::reconnect,
            commands::start_login,
            commands::cancel_login,
            commands::submit_prompt,
            commands::preview_template,
            commands::cancel_job,
            commands::mutate,
            commands::import_asset_data,
            commands::capture_composition,
            commands::save_export,
            backup::backup,
            backup::restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("Unable to run Image Gen");
}
