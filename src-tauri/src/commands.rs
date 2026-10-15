use crate::runtime::{Emitter, State};
use crate::{AppState, jobs, model::*};
use serde_json::{Value, json};
#[cfg(not(feature = "headless"))]
use std::fs;
use std::sync::Arc;
#[cfg(not(feature = "headless"))]
use tauri_plugin_dialog::DialogExt;
fn text(v: &Value, key: &str) -> Result<String, String> {
    v[key]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .ok_or_else(|| format!("Enter {key}"))
}
fn optional(v: &Value, key: &str) -> Option<String> {
    v[key].as_str().filter(|s| !s.is_empty()).map(String::from)
}
fn target(v: &Value) -> Result<Target, String> {
    serde_json::from_value(v["target"].clone()).map_err(|_| "Choose a page".into())
}
fn changed(app: &crate::runtime::AppHandle) {
    let _ = app.emit("workspace-changed", ());
}

#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn get_workspace(state: State<'_, Arc<AppState>>) -> Result<Workspace, String> {
    state.store.refresh()
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn image_data(
    state: State<'_, Arc<AppState>>,
    image_id: String,
) -> Result<String, String> {
    state.store.image_data(&image_id)
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn get_jobs(state: State<'_, Arc<AppState>>) -> Result<Vec<jobs::Job>, String> {
    Ok(state.jobs.lock().await.values().cloned().collect())
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn connection(state: State<'_, Arc<AppState>>) -> Result<Value, String> {
    let codex = state.codex().await?;
    let account = codex
        .rpc("account/read", json!({"refreshToken":false}))
        .await?;
    let capabilities = codex
        .rpc("modelProvider/capabilities/read", json!({}))
        .await?;
    Ok(
        json!({"account":account["account"],"capabilities":capabilities,"executable":crate::codex::executable()?}),
    )
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn reconnect(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if state
        .jobs
        .lock()
        .await
        .values()
        .any(|j| ["starting", "running", "cancelling"].contains(&j.status.as_str()))
    {
        return Err("Wait for active requests to finish before reconnecting".into());
    }
    *state.codex.lock().await = None;
    Ok(())
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn start_login(
    app: crate::runtime::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<Value, String> {
    let codex = state.codex().await?;
    let mut events = codex.events.subscribe();
    let login = codex
        .rpc("account/login/start", json!({"type":"chatgptDeviceCode"}))
        .await?;
    crate::runtime::spawn(async move {
        while let Ok(event) = events.recv().await {
            if event["method"] == "account/login/completed" {
                let _ = app.emit("login-completed", event["params"].clone());
                break;
            }
        }
    });
    Ok(login)
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn cancel_login(state: State<'_, Arc<AppState>>, login_id: String) -> Result<(), String> {
    state
        .codex()
        .await?
        .rpc("account/login/cancel", json!({"loginId":login_id}))
        .await?;
    Ok(())
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn submit_prompt(
    app: crate::runtime::AppHandle,
    state: State<'_, Arc<AppState>>,
    request: jobs::Submit,
) -> Result<String, String> {
    jobs::submit(state.inner().clone(), app, request).await
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn cancel_job(
    app: crate::runtime::AppHandle,
    state: State<'_, Arc<AppState>>,
    job_id: String,
) -> Result<(), String> {
    let mut jobs = state.jobs.lock().await;
    let job = jobs.get_mut(&job_id).ok_or("Request not found")?;
    if ["starting", "running", "cancelling"].contains(&job.status.as_str()) {
        job.cancel_requested = true;
        job.status = "cancelling".into();
        job.message = "Stopping this request…".into();
    }
    drop(jobs);
    let _ = app.emit("jobs-changed", ());
    Ok(())
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn mutate(
    app: crate::runtime::AppHandle,
    state: State<'_, Arc<AppState>>,
    action: Value,
) -> Result<Value, String> {
    let operation = text(&action, "op")?;
    if ["history", "revision", "delete", "restore", "transfer", "classify", "save_as_asset"].contains(&operation.as_str()) {
        let workspace = state.store.read()?;
        let busy = state.jobs.lock().await.values().any(|j| {
            ["starting", "running", "cancelling"].contains(&j.status.as_str())
                && (action["id"] == j.target.id || action["target"]["id"] == j.target.id
                    || (action["kind"] == "organisation" && crate::organisations::owns(&workspace, action["id"].as_str().unwrap_or(""), &j.target.id)))
        });
        if busy {
            return Err("Stop this item's active request before changing its history, library, or organisation".into());
        }
    }
    let base: Option<Workspace> = action
        .get("_base")
        .map(|v| serde_json::from_value(v.clone()))
        .transpose()
        .map_err(|_| "Invalid original workspace")?;
    let result = state
        .store
        .change_from(base.as_ref(), |w| match operation.as_str() {
            "reorder_organisations" => crate::organisations::reorder(w, &action),
            "transfer" | "classify" | "save_as_asset" => crate::libraries::change(w, &action),
            "organisation" => {
                let o = Organisation {
                    position: Some(w.organisations.iter().enumerate().map(|(i, o)| o.position.unwrap_or(i as u64)).max().map_or(0, |p| p + 1)),
                    deleted_at: None,
                    trashed_items: vec![],
                    id: id(),
                    name: text(&action, "name")?,
                    color: optional(&action, "color").unwrap_or("#7654cf".into()),
                };
                let id = o.id.clone();
                w.organisations.push(o);
                Ok(json!(id))
            }
            "project" => {
                let org = text(&action, "organisationId")?;
                if !w.organisations.iter().any(|o| o.id == org && o.deleted_at.is_none()) {
                    return Err("Organisation not found".into());
                }
                let p = Project {
                    id: id(),
                    organisation_id: org,
                    name: text(&action, "name")?,
                    tags: vec![],
                    deleted_at: None,
                };
                let id = p.id.clone();
                w.projects.push(p);
                Ok(json!(id))
            }
            "document" => {
                let source = optional(&action, "sourceImageId");
                if let Some(ref img) = source {
                    if !w.images.iter().any(|i| &i.id == img) {
                        return Err("Source image not found".into());
                    }
                }
                let document_id = w.add_document(
                    text(&action, "projectId")?,
                    text(&action, "name")?,
                    action["width"].as_f64().unwrap_or(210.),
                    action["height"].as_f64().unwrap_or(297.),
                    optional(&action, "unit").unwrap_or("mm".into()),
                    optional(&action, "sourceDocumentId"),
                    source,
                )?;
                if action["saveCustomSize"] == true {
                    let d = w.documents.iter().find(|d| d.id == document_id).unwrap();
                    if !w
                        .custom_sizes
                        .iter()
                        .any(|s| s.width == d.width && s.height == d.height && s.unit == d.unit)
                    {
                        w.custom_sizes.push(CustomSize {
                            id: id(),
                            width: d.width,
                            height: d.height,
                            unit: d.unit.clone(),
                        });
                    }
                }
                Ok(json!(document_id))
            }
            "remove_custom_size" => {
                let size_id = text(&action, "id")?;
                w.custom_sizes.retain(|s| s.id != size_id);
                Ok(Value::Null)
            }
            "asset" => {
                crate::organisations::require_active(w, optional(&action, "organisationId").as_deref())?;
                let a = Asset {
                    library_kind: "asset".into(),
                    description_json: optional(&action, "descriptionJson")
                        .map(|s| crate::analysis::validate_description(&s))
                        .transpose()?,
                    source_references: serde_json::from_value(action["sourceReferences"].clone())
                        .unwrap_or_default(),
                    id: id(),
                    name: text(&action, "name")?,
                    organisation_id: optional(&action, "organisationId"),
                    tags: vec![],
                    versions: vec![],
                    current_version_id: None,
                    page: Page::new("Asset"),
                    deleted_at: None,
                };
                let id = a.id.clone();
                w.assets.push(a);
                Ok(json!(id))
            }
            "asset_description" => {
                let asset_id = text(&action, "id")?;
                let description =
                    crate::analysis::validate_description(&text(&action, "descriptionJson")?)?;
                let asset = w
                    .assets
                    .iter_mut()
                    .find(|a| a.id == asset_id)
                    .ok_or("Asset not found")?;
                asset.description_json = Some(description);
                Ok(Value::Null)
            }
            "page" => {
                let d = w
                    .documents
                    .iter_mut()
                    .find(|d| action["id"] == d.id)
                    .ok_or("Document not found")?;
                let p = Page::new(&format!("Page {}", d.pages.len() + 1));
                let id = p.id.clone();
                d.pages.push(p);
                d.updated_at = now();
                Ok(json!(id))
            }
            "rename" | "tags" => {
                let kind = text(&action, "kind")?;
                let id = text(&action, "id")?;
                let name = optional(&action, "name");
                let tags: Vec<String> = action["tags"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|t| t.as_str())
                            .map(|s| s.trim().to_lowercase())
                            .filter(|s| !s.is_empty())
                            .collect()
                    })
                    .unwrap_or_default();
                match kind.as_str() {
                    "document" => {
                        let d = w
                            .documents
                            .iter_mut()
                            .find(|d| d.id == id)
                            .ok_or("Document not found")?;
                        if let Some(n) = name {
                            d.name = n;
                        }
                        if operation == "tags" || action.get("tags").is_some() {
                            d.tags = tags;
                        }
                        d.updated_at = now();
                    }
                    "project" => {
                        let p = w
                            .projects
                            .iter_mut()
                            .find(|p| p.id == id)
                            .ok_or("Project not found")?;
                        if let Some(n) = name {
                            p.name = n;
                        }
                        if operation == "tags" || action.get("tags").is_some() {
                            p.tags = tags;
                        }
                    }
                    "asset" => {
                        let a = w
                            .assets
                            .iter_mut()
                            .find(|a| a.id == id)
                            .ok_or("Asset not found")?;
                        if let Some(n) = name {
                            a.name = n;
                        }
                        if operation == "tags" || action.get("tags").is_some() {
                            a.tags = tags;
                        }
                    }
                    "organisation" => {
                        w.organisations
                            .iter_mut()
                            .find(|o| o.id == id)
                            .ok_or("Organisation not found")?
                            .name = text(&action, "name")?;
                    }
                    _ => return Err("Unsupported item".into()),
                }
                Ok(Value::Null)
            }
            "overlays" => {
                let t = target(&action)?;
                let overlays: Vec<Overlay> = serde_json::from_value(action["overlays"].clone())
                    .map_err(|_| "Invalid overlay layout")?;
                for o in &overlays {
                    w.version_image(&o.asset_version_id)?;
                    if ![o.x, o.y, o.width, o.height, o.rotation]
                        .iter()
                        .all(|v| v.is_finite())
                        || o.width <= 0.
                        || o.height <= 0.
                    {
                        return Err("Invalid overlay dimensions".into());
                    }
                }
                let p = w.page_mut(&t)?;
                let mut c = p.composition().clone();
                c.overlays = overlays;
                p.push(c);
                Ok(Value::Null)
            }
            "framing" => {
                let t = target(&action)?;
                let p = w.page_mut(&t)?;
                let mut c = p.composition().clone();
                let framing = text(&action, "framing")?;
                if !["fit", "crop"].contains(&framing.as_str()) {
                    return Err("Choose fit or crop".into());
                }
                c.framing = Some(framing);
                p.push(c);
                Ok(Value::Null)
            }
            "history" => {
                let t = target(&action)?;
                let p = w.page_mut(&t)?;
                let old = p.composition().revision_id.clone();
                if action["direction"] == "undo" {
                    p.history_index = p.history_index.saturating_sub(1);
                } else {
                    p.history_index = (p.history_index + 1).min(p.history.len() - 1);
                }
                if p.composition().revision_id != old {
                    if let Some(r) = p
                        .revisions
                        .iter()
                        .find(|r| Some(&r.id) == p.composition().revision_id.as_ref())
                        .cloned()
                    {
                        p.thread_id = Some(r.thread_id);
                        p.branch_turn_id = Some(r.turn_id);
                        p.messages = r.messages;
                    } else {
                        p.thread_id = None;
                        p.branch_turn_id = None;
                        p.messages.clear();
                    }
                }
                w.sync_asset_version(&t);
                Ok(Value::Null)
            }
            "revision" => {
                w.restore_revision(&target(&action)?, &text(&action, "revisionId")?)?;
                Ok(Value::Null)
            }
            "delete" | "restore" => {
                let id = text(&action, "id")?;
                if action["kind"] == "organisation" {
                    return crate::organisations::trash(w, &id, operation == "delete");
                }
                if operation == "restore" {
                    crate::organisations::can_restore(w, &id)?;
                }
                let deleted = if operation == "delete" {
                    Some(now())
                } else {
                    None
                };
                match action["kind"].as_str() {
                    Some("document") => {
                        w.documents
                            .iter_mut()
                            .find(|d| d.id == id)
                            .ok_or("Document not found")?
                            .deleted_at = deleted
                    }
                    Some("project") => {
                        w.projects
                            .iter_mut()
                            .find(|p| p.id == id)
                            .ok_or("Project not found")?
                            .deleted_at = deleted
                    }
                    Some("asset") => {
                        w.assets
                            .iter_mut()
                            .find(|a| a.id == id)
                            .ok_or("Asset not found")?
                            .deleted_at = deleted
                    }
                    _ => return Err("Unsupported item".into()),
                }
                Ok(Value::Null)
            }
            _ => Err("Unknown workspace action".into()),
        })?;
    changed(&app);
    Ok(result)
}
#[cfg(not(feature = "headless"))]
#[tauri::command]
pub async fn save_export(
    app: crate::runtime::AppHandle,
    name: String,
    extension: String,
    data: String,
) -> Result<Option<String>, String> {
    use base64::Engine;
    if !["png", "jpg", "pdf"].contains(&extension.as_str()) {
        return Err("Unsupported export format".into());
    }
    let file = app
        .dialog()
        .file()
        .set_file_name(format!(
            "{}.{}",
            name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "-"),
            extension
        ))
        .add_filter("Export", &[&extension])
        .blocking_save_file();
    let Some(file) = file else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| e.to_string())?;
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into()))
}

#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn import_asset_data(
    app: crate::runtime::AppHandle,
    state: State<'_, Arc<AppState>>,
    name: String,
    data: String,
    organisation_id: Option<String>,
    replace_id: Option<String>,
) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|_| "Image file could not be read")?;
    save_imported_asset(
        &app,
        &state,
        &name,
        &bytes,
        organisation_id,
        replace_id,
        vec![],
    )
}

pub(crate) fn save_imported_asset(
    app: &crate::runtime::AppHandle,
    state: &AppState,
    name: &str,
    bytes: &[u8],
    organisation_id: Option<String>,
    replace_id: Option<String>,
    mut source_references: Vec<String>,
) -> Result<String, String> {
    if name.trim().is_empty() {
        return Err("Give the asset a name".into());
    }
    let image = state.store.import_bytes(bytes)?;
    if !source_references.is_empty() {
        // Analyse the saved crop first; the full source is identification context only.
        source_references.insert(0, format!("image:{}", image.id));
    }
    let asset_id = state.store.change(|w| {
        crate::organisations::require_active(w, organisation_id.as_deref())?;
        let version = AssetVersion {
            id: id(),
            image_id: image.id.clone(),
            created_at: now(),
        };
        w.images.push(image.clone());
        if let Some(ref id) = replace_id {
            let asset = w
                .assets
                .iter_mut()
                .find(|a| &a.id == id)
                .ok_or("Asset not found")?;
            asset.current_version_id = Some(version.id.clone());
            asset.versions.push(version);
            asset.page.push(Composition {
                image_id: Some(image.id.clone()),
                overlays: vec![],
                revision_id: None,
                framing: None,
            });
            return Ok(id.clone());
        }
        let mut page = Page::new("Asset");
        page.history[0].image_id = Some(image.id.clone());
        let asset = Asset {
            library_kind: if source_references.is_empty() { "upload" } else { "asset" }.into(),
            description_json: None,
            source_references,
            id: id(),
            name: name.trim().to_string(),
            organisation_id,
            tags: vec![],
            versions: vec![version.clone()],
            current_version_id: Some(version.id),
            page,
            deleted_at: None,
        };
        let id = asset.id.clone();
        w.assets.push(asset);
        Ok(id)
    })?;
    changed(&app);
    Ok(asset_id)
}

#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn capture_composition(
    state: State<'_, Arc<AppState>>,
    data: String,
) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|_| "Could not prepare the design image")?;
    let image = state.store.import_bytes(&bytes)?;
    let id = image.id.clone();
    state.store.change(|w| {
        w.images.push(image);
        Ok(())
    })?;
    Ok(id)
}
