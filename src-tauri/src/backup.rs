use crate::{AppState, model::*};
#[cfg(any(test, not(feature = "headless")))]
use std::sync::Arc;
use std::{
    fs,
    io::{Read, Write},
};
#[cfg(not(feature = "headless"))]
use tauri::{Emitter, State};
#[cfg(not(feature = "headless"))]
use tauri_plugin_dialog::DialogExt;
pub fn backup_to(state: &AppState, path: &std::path::Path) -> Result<(), String> {
    let w = state.store.read()?;
    let file = fs::File::create(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("workspace.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&serde_json::to_vec(&w).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    for image in &w.images {
        zip.start_file(format!("media/{}", image.file), options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&fs::read(state.store.image_path(&image.id)?).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(not(feature = "headless"))]
#[tauri::command]
pub async fn backup(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .set_file_name("Image Gen Backup.zip")
        .add_filter("Workspace backup", &["zip"])
        .blocking_save_file();
    let Some(file) = file else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    backup_to(&state, &path)?;
    Ok(Some(path.to_string_lossy().into()))
}
#[cfg(not(feature = "headless"))]
#[tauri::command]
pub async fn restore_backup(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    if state
        .jobs
        .lock()
        .await
        .values()
        .any(|j| ["starting", "running", "cancelling"].contains(&j.status.as_str()))
    {
        return Err("Finish or stop active requests before restoring a backup".into());
    }
    let picked = app
        .dialog()
        .file()
        .add_filter("Workspace backup", &["zip"])
        .blocking_pick_file();
    let Some(picked) = picked else {
        return Ok(false);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    restore_from(&state, &path)?;
    let _ = app.emit("workspace-changed", ());
    Ok(true)
}
pub fn restore_from(state: &AppState, path: &std::path::Path) -> Result<(), String> {
    if state.store.connected() {
        return Err("Switch to your local workspace before restoring a backup. The server workspace is protected.".into());
    }
    let mut zip = zip::ZipArchive::new(fs::File::open(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    zip.by_name("workspace.json")
        .map_err(|_| "This is not an Image Gen backup")?
        .take(20_000_000)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let mut workspace: Workspace =
        serde_json::from_slice(&bytes).map_err(|_| "Backup workspace is invalid")?;
    for page in workspace
        .documents
        .iter()
        .flat_map(|d| &d.pages)
        .chain(workspace.assets.iter().map(|a| &a.page))
    {
        if page.history.is_empty() || page.history_index >= page.history.len() {
            return Err("Backup contains invalid page history".into());
        }
    }
    let mut staged = Vec::new();
    let mut total = 0u64;
    for image in &mut workspace.images {
        if image.file.contains(['/', '\\']) {
            return Err("Backup contains an invalid image path".into());
        }
        let mut file = zip
            .by_name(&format!("media/{}", image.file))
            .map_err(|_| "An image is missing from the backup")?;
        total += file.size();
        if total > 1_000_000_000 || file.size() > 100_000_000 {
            return Err("Backup images exceed the restore size limit".into());
        }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        image::load_from_memory(&bytes).map_err(|_| "Backup contains a damaged image")?;
        let extension = std::path::Path::new(&image.file)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        let name = format!("{}.{}", id(), extension);
        image.file = name.clone();
        staged.push((name, bytes));
    }
    backup_to(state, &state.store.root.join("before-last-restore.zip"))?;
    for (file, bytes) in staged {
        fs::write(state.store.root.join("media").join(file), bytes).map_err(|e| e.to_string())?;
    }
    state.store.change(|w| {
        *w = workspace;
        Ok(())
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::Mutex;
    #[test]
    fn backup_restores_images_and_history_without_credentials() {
        let root = std::env::temp_dir().join(format!("imagegen-backup-{}", id()));
        let store = crate::store::Store::open(root.clone()).unwrap();
        let source = root.join("logo.png");
        image::RgbaImage::from_pixel(16, 16, image::Rgba([12, 34, 56, 255]))
            .save(&source)
            .unwrap();
        let image = store.import(&source).unwrap();
        let original_bytes = fs::read(root.join("media").join(&image.file)).unwrap();
        store
            .change(|w| {
                w.images.push(image.clone());
                let version = AssetVersion {
                    id: "v1".into(),
                    image_id: image.id.clone(),
                    created_at: 1,
                };
                w.assets.push(Asset {
                    library_kind: "asset".into(),
                    description_json: None,
                    source_references: vec![],
                    id: "a".into(),
                    name: "Exact logo".into(),
                    organisation_id: None,
                    tags: vec!["logo".into()],
                    versions: vec![version],
                    current_version_id: Some("v1".into()),
                    page: Page::new("Asset"),
                    deleted_at: None,
                });
                Ok(())
            })
            .unwrap();
        fs::write(root.join("auth.json"), "dummy credential sentinel").unwrap();
        fs::write(root.join("bridge.json"), "dummy bridge sentinel").unwrap();
        let state = AppState {
            store,
            jobs_dir: root.join("sessions"),
            jobs: Mutex::new(std::collections::HashMap::new()),
            codex: Mutex::new(None),
        };
        let backup = root.join("backup.zip");
        backup_to(&state, &backup).unwrap();
        let zip = zip::ZipArchive::new(fs::File::open(&backup).unwrap()).unwrap();
        assert_eq!(zip.len(), 2);
        assert!(
            zip.file_names()
                .all(|name| name == "workspace.json" || name.starts_with("media/"))
        );
        drop(zip);
        state
            .store
            .change(|w| {
                w.assets.clear();
                w.images.clear();
                Ok(())
            })
            .unwrap();
        restore_from(&state, &backup).unwrap();
        let w = state.store.read().unwrap();
        assert_eq!(w.assets[0].name, "Exact logo");
        assert_eq!(w.version_image("v1").unwrap(), image.id);
        assert_eq!(
            fs::read(state.store.image_path(&image.id).unwrap()).unwrap(),
            original_bytes
        );
        assert!(root.join("before-last-restore.zip").exists());
        drop(state);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn malformed_backup_does_not_replace_workspace() {
        let root = std::env::temp_dir().join(format!("imagegen-backup-{}", id()));
        let store = crate::store::Store::open(root.clone()).unwrap();
        store
            .change(|w| {
                w.organisations.push(Organisation {
                    position: None,
                    deleted_at: None,
                    trashed_items: vec![],
                    id: "o".into(),
                    name: "Original".into(),
                    color: "purple".into(),
                });
                Ok(())
            })
            .unwrap();
        let state = AppState {
            store,
            jobs_dir: root.join("sessions"),
            jobs: Mutex::new(std::collections::HashMap::new()),
            codex: Mutex::new(None),
        };
        let bad = root.join("bad.zip");
        fs::write(&bad, "not a zip").unwrap();
        assert!(restore_from(&state, &bad).is_err());
        assert_eq!(
            state.store.read().unwrap().organisations[0].name,
            "Original"
        );
        drop(state);
        fs::remove_dir_all(root).unwrap();
    }
}
