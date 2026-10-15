use crate::AppState;
use std::sync::Arc;
use tauri::{Emitter, State};
use tauri_plugin_dialog::DialogExt;
async fn idle(state: &AppState) -> Result<(), String> {
    if state
        .jobs
        .lock()
        .await
        .values()
        .any(|j| ["starting", "running", "cancelling"].contains(&j.status.as_str()))
    {
        Err("Finish or stop active requests before switching workspaces".into())
    } else {
        Ok(())
    }
}
#[tauri::command]
pub async fn server_status(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    state.store.status()
}
#[tauri::command]
pub async fn server_connect(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    url: String,
    access_key: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<(), String> {
    idle(&state).await?;
    if let Some(username) = username {
        state.store.connect_account(&url, username, password.unwrap_or_default())?;
    } else {
        state.store.connect(&url, access_key)?;
    }
    let _ = app.emit("workspace-changed", ());
    Ok(())
}
#[tauri::command]
pub async fn server_disconnect(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    idle(&state).await?;
    state.store.disconnect()?;
    let _ = app.emit("workspace-changed", ());
    Ok(())
}
#[tauri::command]
pub async fn server_copy_local(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    idle(&state).await?;
    state.store.copy_local()?;
    let _ = app.emit("workspace-changed", ());
    Ok(())
}
#[tauri::command]
pub async fn server_save_unsent(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<String>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .set_file_name("Image Gen Unsent Work.zip")
        .add_filter("Recovery backups", &["zip"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    state.store.save_unsent(&path)?;
    Ok(Some(path.to_string_lossy().into()))
}
