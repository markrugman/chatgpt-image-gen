use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path, State},
    http::{Request, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use subtle::ConstantTimeEq;
#[allow(dead_code)]
#[path = "../../src-tauri/src/local_store.rs"]
mod local_store;
#[path = "../../src-tauri/src/model.rs"]
pub mod model;
#[path = "../../src-tauri/src/templates.rs"]
pub mod templates;

#[derive(Clone)]
struct Service {
    db: Arc<Mutex<Database>>,
    token_hash: [u8; 32],
    browser: Arc<web::Browser>,
}
struct Database {
    conn: Connection,
    root: PathBuf,
    name: String,
    id: String,
}
type Failure = (StatusCode, Json<Value>);
fn fail(status: StatusCode, message: impl ToString) -> Failure {
    (status, Json(json!({"error":message.to_string()})))
}
fn internal(e: impl ToString) -> Failure {
    eprintln!("Workspace operation failed: {}", e.to_string());
    fail(
        StatusCode::INTERNAL_SERVER_ERROR,
        "The server could not complete this operation. Check its logs.",
    )
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub protocol: u32,
    pub server_id: String,
    pub name: String,
    pub revision: u64,
    pub workspace: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Update {
    server_id: String,
    base_workspace: Value,
    workspace: Value,
    #[serde(default)]
    require_empty: bool,
}
fn workspace_empty(w: &Value) -> bool {
    [
        "organisations",
        "projects",
        "documents",
        "assets",
        "images",
        "customSizes",
        "templates",
        "templateFolders",
    ]
    .iter()
    .all(|key| w[key].as_array().is_none_or(Vec::is_empty))
}
pub fn valid_file(file: &str) -> bool {
    file.len() < 160
        && !file.contains("..")
        && file
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        && ["png", "jpg", "webp"]
            .iter()
            .any(|ext| file.ends_with(&format!(".{ext}")))
}
pub fn validate(workspace: &Value) -> Result<(), String> {
    let w: model::Workspace =
        serde_json::from_value(workspace.clone()).map_err(|_| "Workspace data is invalid")?;
    organisations::validate(&w)?;
    templates::validate(&w)?;
    if w.format_version > 3 {
        return Err("This workspace needs a newer server".into());
    }
    let mut ids = std::collections::HashSet::new();
    for (kind, list) in [
        ("organisation", &workspace["organisations"]),
        ("project", &workspace["projects"]),
        ("document", &workspace["documents"]),
        ("asset", &workspace["assets"]),
        ("image", &workspace["images"]),
        ("custom size", &workspace["customSizes"]),
    ] {
        if let Some(list) = list.as_array() {
            for item in list {
                let id = item["id"].as_str().ok_or("An item has no identifier")?;
                if id.is_empty() || id.len() > 160 || !ids.insert((kind, id.to_string())) {
                    return Err("Workspace contains duplicate or invalid identifiers".into());
                }
            }
        }
    }
    let images: std::collections::HashSet<_> = w.images.iter().map(|i| i.id.as_str()).collect();
    let versions: std::collections::HashSet<_> = w
        .assets
        .iter()
        .flat_map(|a| a.versions.iter().map(|v| v.id.as_str()))
        .collect();
    for i in &w.images {
        if !valid_file(&i.file) || i.width == 0 || i.height == 0 {
            return Err("An image record is invalid".into());
        }
    }
    for p in &w.projects {
        if !w.organisations.iter().any(|o| o.id == p.organisation_id) {
            return Err("A project's organisation is missing".into());
        }
    }
    for d in &w.documents {
        if !w.projects.iter().any(|p| p.id == d.project_id)
            || d.pages.is_empty()
            || !d.width.is_finite()
            || !d.height.is_finite()
            || d.width <= 0.
            || d.height <= 0.
        {
            return Err("A document is invalid".into());
        }
    }
    for a in &w.assets {
        if a.versions
            .iter()
            .any(|v| !images.contains(v.image_id.as_str()))
            || a.current_version_id
                .as_ref()
                .is_some_and(|id| !a.versions.iter().any(|v| &v.id == id))
        {
            return Err("An asset version is invalid".into());
        }
    }
    for page in w
        .documents
        .iter()
        .flat_map(|d| &d.pages)
        .chain(w.assets.iter().map(|a| &a.page))
    {
        if page.history.is_empty() || page.history_index >= page.history.len() {
            return Err("A page has invalid history".into());
        }
        for c in &page.history {
            if c.image_id
                .as_ref()
                .is_some_and(|id| !images.contains(id.as_str()))
                || c.overlays.iter().any(|o| {
                    !versions.contains(o.asset_version_id.as_str())
                        || ![o.x, o.y, o.width, o.height, o.rotation]
                            .iter()
                            .all(|n| n.is_finite())
                })
            {
                return Err("A page references missing artwork".into());
            }
        }
        for r in &page.revisions {
            if !images.contains(r.image_id.as_str()) {
                return Err("A revision image is missing".into());
            }
        }
    }
    Ok(())
}
// Compare each changed entity against the caller's original view. Independent edits can merge;
// an outdated edit to the same document/asset is rejected atomically.
pub fn merge(current: &Value, base: &Value, next: &Value) -> Result<Value, String> {
    let mut result = current.clone();
    for key in [
        "organisations",
        "projects",
        "documents",
        "assets",
        "images",
        "customSizes",
        "templates",
        "templateFolders",
    ] {
        let optional = ["templates", "templateFolders"].contains(&key);
        if optional && base.get(key).is_none() && next.get(key).is_none() { continue; }
        let empty = vec![];
        let old = if optional && base.get(key).is_none() { &empty } else { base[key].as_array().ok_or("Invalid base workspace")? };
        let new = if optional && next.get(key).is_none() { &empty } else { next[key].as_array().ok_or("Invalid workspace")? };
        if optional && result.get(key).is_none() { result[key] = json!([]); }
        let items = result[key]
            .as_array_mut()
            .ok_or("Invalid stored workspace")?;
        let mut seen = std::collections::HashSet::new();
        let ids: Vec<_> = old
            .iter()
            .chain(new)
            .map(|v| v["id"].as_str().ok_or("Missing identifier"))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter(|id| seen.insert(*id))
            .collect();
        for id in ids {
            let before = old.iter().find(|v| v["id"] == id);
            let after = new.iter().find(|v| v["id"] == id);
            if before == after {
                continue;
            }
            let index = items.iter().position(|v| v["id"] == id);
            if index.map(|i| &items[i]) != before {
                return Err(format!(
                    "The {key} item changed on another device. Refresh and retry. An unsent recovery copy is kept on this computer."
                ));
            }
            if let Some(i) = index {
                if let Some(after) = after {
                    items[i] = after.clone();
                } else {
                    items.remove(i);
                }
            } else if let Some(after) = after {
                items.push(after.clone());
            }
        }
    }
    let empty = serde_json::Map::new();
    let old = base["handoffs"].as_object().unwrap_or(&empty);
    let new = next["handoffs"].as_object().unwrap_or(&empty);
    let items = result["handoffs"]
        .as_object_mut()
        .ok_or("Invalid handoff data")?;
    for key in old
        .keys()
        .chain(new.keys())
        .collect::<std::collections::BTreeSet<_>>()
    {
        if old.get(key) == new.get(key) {
            continue;
        }
        if items.get(key) != old.get(key) {
            return Err("This handoff changed on another device".into());
        }
        if let Some(value) = new.get(key) {
            items.insert(key.clone(), value.clone());
        } else {
            items.remove(key);
        }
    }
    result["formatVersion"] = json!(3);
    Ok(result)
}
impl Database {
    fn snapshot(&self) -> Result<Snapshot, Failure> {
        let raw: String = self
            .conn
            .query_row("SELECT data FROM workspace WHERE id=1", [], |r| r.get(0))
            .map_err(internal)?;
        let revision = self
            .conn
            .query_row(
                "SELECT revision FROM server_meta WHERE singleton=1",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map_err(internal)? as u64;
        Ok(Snapshot {
            protocol: 1,
            server_id: self.id.clone(),
            name: self.name.clone(),
            revision,
            workspace: serde_json::from_str(&raw).map_err(internal)?,
        })
    }
    fn update(&mut self, change: Update) -> Result<Snapshot, Failure> {
        if change.server_id != self.id {
            return Err(fail(
                StatusCode::CONFLICT,
                "Server identity changed. Reconnect explicitly in Settings.",
            ));
        }
        let current = self.snapshot()?;
        if change.require_empty && !workspace_empty(&current.workspace) {
            return Err(fail(
                StatusCode::CONFLICT,
                "Copying requires an empty server workspace. Existing server work was not replaced.",
            ));
        }
        validate(&change.base_workspace).map_err(|e| fail(StatusCode::BAD_REQUEST, e))?;
        validate(&change.workspace).map_err(|e| fail(StatusCode::BAD_REQUEST, e))?;
        let mut change = change;
        // Browser JSON represents 210.0 as 210. Compare typed model records so
        // equivalent dimensions do not look like concurrent edits.
        change.base_workspace = serde_json::to_value(
            serde_json::from_value::<model::Workspace>(change.base_workspace).map_err(internal)?,
        )
        .map_err(internal)?;
        change.workspace = serde_json::to_value(
            serde_json::from_value::<model::Workspace>(change.workspace).map_err(internal)?,
        )
        .map_err(internal)?;
        change.workspace = merge(
            &current.workspace,
            &change.base_workspace,
            &change.workspace,
        )
        .map_err(|e| fail(StatusCode::CONFLICT, e))?;
        validate(&change.workspace).map_err(|e| fail(StatusCode::BAD_REQUEST, e))?;
        let parsed: model::Workspace =
            serde_json::from_value(change.workspace.clone()).map_err(internal)?;
        for image in parsed.images {
            if !self.root.join("media").join(image.file).is_file() {
                return Err(fail(
                    StatusCode::BAD_REQUEST,
                    "Upload every image before committing the workspace",
                ));
            }
        }
        let tx = self.conn.transaction().map_err(internal)?;
        tx.execute(
            "UPDATE workspace SET data=?1 WHERE id=1",
            [change.workspace.to_string()],
        )
        .map_err(internal)?;
        tx.execute(
            "UPDATE server_meta SET revision=revision+1 WHERE singleton=1",
            [],
        )
        .map_err(internal)?;
        tx.commit().map_err(internal)?;
        self.snapshot()
    }
}
async fn authorize(State(service): State<Service>, request: Request<Body>, next: Next) -> Response {
    let token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .unwrap_or("");
    let hash: [u8; 32] = Sha256::digest(token.as_bytes()).into();
    let bearer = bool::from(hash.ct_eq(&service.token_hash)) || service.browser.native_authenticated(token);
    if !bearer
        && !service.browser.authenticated(request.headers())
    {
        return fail(StatusCode::UNAUTHORIZED, "Server sign-in expired or credentials were not recognised. Reconnect to the server.").into_response();
    }
    if !bearer
        && request.method() != axum::http::Method::GET
        && (!web::same_origin(request.headers())
            || request
                .headers()
                .get("x-imagegen-request")
                .is_none_or(|h| h != "1"))
    {
        return fail(StatusCode::FORBIDDEN, "Invalid browser request").into_response();
    }
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
        .headers_mut()
        .insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());
    response
}
async fn snapshot(State(service): State<Service>) -> Result<Json<Snapshot>, Failure> {
    Ok(Json(service.db.lock().map_err(internal)?.snapshot()?))
}
async fn update(
    State(service): State<Service>,
    Json(change): Json<Update>,
) -> Result<Json<Snapshot>, Failure> {
    Ok(Json(service.db.lock().map_err(internal)?.update(change)?))
}
async fn media(
    State(service): State<Service>,
    Path(file): Path<String>,
) -> Result<Response, Failure> {
    if !valid_file(&file) {
        return Err(fail(StatusCode::BAD_REQUEST, "Invalid image filename"));
    }
    let path = service
        .db
        .lock()
        .map_err(internal)?
        .root
        .join("media")
        .join(&file);
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|_| fail(StatusCode::NOT_FOUND, "Image not found"))?;
    let mime = if file.ends_with(".png") {
        "image/png"
    } else if file.ends_with(".jpg") {
        "image/jpeg"
    } else {
        "image/webp"
    };
    Ok(([(header::CONTENT_TYPE, mime)], bytes).into_response())
}
async fn upload(
    State(service): State<Service>,
    Path(file): Path<String>,
    bytes: Bytes,
) -> Result<Json<Value>, Failure> {
    if !valid_file(&file) {
        return Err(fail(StatusCode::BAD_REQUEST, "Invalid image filename"));
    }
    if bytes.len() > 50_000_000 {
        return Err(fail(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Choose an image smaller than 50 MB",
        ));
    }
    let image = image::load_from_memory(&bytes)
        .map_err(|_| fail(StatusCode::BAD_REQUEST, "Image is damaged or unsupported"))?;
    let db = service.db.lock().map_err(internal)?;
    let path = db.root.join("media").join(&file);
    if path.exists() {
        if fs::read(&path).map_err(internal)? != bytes {
            return Err(fail(
                StatusCode::CONFLICT,
                "Original image files are immutable",
            ));
        }
    } else {
        let staged = db
            .root
            .join("media")
            .join(format!("{}.partial", model::id()));
        fs::write(&staged, &bytes).map_err(internal)?;
        fs::rename(staged, path).map_err(internal)?;
    }
    Ok(Json(
        json!({"sha256":format!("{:x}",Sha256::digest(&bytes)),"width":image.width(),"height":image.height()}),
    ))
}
pub fn router(root: PathBuf, name: String, token: String) -> Result<Router, String> {
    let options = web::Options {
        internal_url: "http://127.0.0.1:8787".into(),
        worker_dir: root.join("browser-worker"),
        worker_enabled: false,
        static_dir: PathBuf::from("web"),
    };
    router_with_web(root, name, token, options)
}
pub fn router_with_web(
    root: PathBuf,
    name: String,
    token: String,
    options: web::Options,
) -> Result<Router, String> {
    if token.len() < 32 || token.chars().any(char::is_whitespace) {
        return Err(
            "Set IMAGEGEN_SERVER_TOKEN to a random access key of at least 32 characters".into(),
        );
    }
    let store = local_store::Store::open(root.clone())?;
    drop(store);
    let conn = Connection::open(root.join("workspace.sqlite3")).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS server_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL, revision INTEGER NOT NULL);").map_err(|e|e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO server_meta VALUES(1,?1,0)",
        params![model::id()],
    )
    .map_err(|e| e.to_string())?;
    let id = conn
        .query_row("SELECT id FROM server_meta WHERE singleton=1", [], |r| {
            r.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    let static_dir = options.static_dir.clone();
    let browser = Arc::new(web::Browser::new(options, token.clone(), &root)?);
    let service = Service {
        browser,
        db: Arc::new(Mutex::new(Database {
            conn,
            root,
            name,
            id,
        })),
        token_hash: Sha256::digest(token.as_bytes()).into(),
    };
    Ok(Router::new().route("/health",get(||async{Json(json!({"service":"image-gen-server","version":env!("CARGO_PKG_VERSION"),"protocol":1}))}))
        .nest("/v1",Router::new().route("/workspace",get(snapshot).put(update)).route("/media/{file}",get(media).put(upload)).layer(middleware::from_fn_with_state(service.clone(),authorize)))
        .route("/web/login",axum::routing::post(web::login).layer(DefaultBodyLimit::max(4096)))
        .route("/auth/native",axum::routing::post(web::native_login).layer(DefaultBodyLimit::max(4096)))
        .merge(Router::new().route("/web/session",get(web::session)).route("/web/logout",axum::routing::post(web::logout)).route("/web/owner",axum::routing::post(web::owner_setup).layer(DefaultBodyLimit::max(4096))).route("/api/{command}",axum::routing::post(web::command)).route("/download/{kind}",get(web::download)).layer(middleware::from_fn_with_state(service.clone(),authorize)))
        .fallback_service(tower_http::services::ServeDir::new(&static_dir).not_found_service(tower_http::services::ServeFile::new(static_dir.join("index.html"))))
        .layer(DefaultBodyLimit::max(72_000_000)).layer(middleware::from_fn(web::headers)).with_state(service))
}

#[path = "../../src-tauri/src/analysis.rs"]
pub mod analysis;
#[path = "../../src-tauri/src/backup.rs"]
pub mod backup;
#[path = "../../src-tauri/src/codex.rs"]
pub mod codex;
#[path = "../../src-tauri/src/commands.rs"]
pub mod commands;
#[path = "../../src-tauri/src/libraries.rs"]
pub mod libraries;
#[path = "../../src-tauri/src/organisations.rs"]
pub mod organisations;
#[path = "../../src-tauri/src/jobs.rs"]
pub mod jobs;
#[path = "../../src-tauri/src/original.rs"]
pub mod original;
#[path = "../../src-tauri/src/print.rs"]
pub mod print;
#[path = "../../src-tauri/src/remote.rs"]
pub mod remote;
pub mod runtime;
#[path = "../../src-tauri/src/store.rs"]
pub mod store;
pub mod web;
pub mod auth;
pub struct AppState {
    pub store: store::Store,
    pub jobs_dir: PathBuf,
    pub jobs: tokio::sync::Mutex<std::collections::HashMap<String, jobs::Job>>,
    codex: tokio::sync::Mutex<Option<Arc<codex::Codex>>>,
}
impl AppState {
    pub async fn codex(&self) -> Result<Arc<codex::Codex>, String> {
        let mut slot = self.codex.lock().await;
        if let Some(c) = slot.as_ref() {
            return Ok(c.clone());
        }
        let c = codex::Codex::start(&self.jobs_dir).await?;
        *slot = Some(c.clone());
        Ok(c)
    }
}
