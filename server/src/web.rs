use crate::{
    AppState, Failure, Service, analysis, backup, commands, fail, internal, jobs, model, original,
    print, runtime,
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;

#[derive(Clone)]
pub struct Options {
    pub internal_url: String,
    pub worker_dir: PathBuf,
    pub worker_enabled: bool,
    pub static_dir: PathBuf,
}
pub struct Browser {
    pub options: Options,
    pub auth: Mutex<crate::auth::Auth>,
    attempts: Mutex<(u32, Instant)>,
    pub state: tokio::sync::OnceCell<Arc<AppState>>,
    token: String,
}
impl Browser {
    pub fn new(options: Options, token: String, root: &std::path::Path) -> Result<Self, String> {
        Ok(Self {
            options,
            auth: Mutex::new(crate::auth::Auth::open(root)?),
            attempts: Mutex::new((0, Instant::now())),
            state: tokio::sync::OnceCell::new(),
            token,
        })
    }
    pub fn authenticated(&self, headers: &HeaderMap) -> bool {
        let Some(session) = cookie(headers) else {
            return false;
        };
        self.auth.lock().map(|auth| auth.valid(session, "browser")).unwrap_or(false)
    }
    pub fn native_authenticated(&self, token: &str) -> bool {
        self.auth.lock().map(|auth| auth.valid(token, "native")).unwrap_or(false)
    }
    fn allow_login(&self) -> bool {
        let Ok(mut attempts) = self.attempts.lock() else { return false; };
        if attempts.1.elapsed() >= Duration::from_secs(60) { *attempts = (0,Instant::now()); }
        attempts.0 += 1;
        attempts.0 <= 20
    }
    async fn state(&self) -> Result<Arc<AppState>, String> {
        let url = self.options.internal_url.clone();
        let root = self.options.worker_dir.clone();
        let token = self.token.clone();
        self.state.get_or_try_init(||async move{tokio::task::spawn_blocking(move||{
   let store=crate::store::Store::open(root.join("workspace"))?;store.connect_worker(&url,token)?;
   let jobs_dir=root.join("sessions");std::fs::create_dir_all(&jobs_dir).map_err(|e|e.to_string())?;
   let mut jobs:Vec<jobs::Job>=std::fs::read(jobs_dir.join("jobs.json")).ok().and_then(|bytes|serde_json::from_slice(&bytes).ok()).unwrap_or_default();
   for job in &mut jobs {if ["starting","running","cancelling"].contains(&job.status.as_str()){job.status="failed".into();job.message="The server restarted before this request finished. Your saved artwork is safe; retry when ready.".into();}}
   Ok::<_,String>(Arc::new(AppState{store,jobs_dir,jobs:tokio::sync::Mutex::new(jobs.into_iter().map(|j|(j.id.clone(),j)).collect()),codex:tokio::sync::Mutex::new(None)}))
  }).await.map_err(|e|e.to_string())?}).await.cloned()
    }
}
fn cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|item| item.trim().strip_prefix("imagegen_session="))
}
pub fn same_origin(headers: &HeaderMap) -> bool {
    if let Some(origin) = headers.get(header::ORIGIN) {
        let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) else {
            return false;
        };
        let Ok(origin) = origin
            .to_str()
            .ok()
            .and_then(|v| url::Url::parse(v).ok())
            .ok_or(())
        else {
            return false;
        };
        let authority = origin[url::Position::BeforeHost..url::Position::AfterPort].to_string();
        if authority != host {
            return false;
        }
    }
    true
}
fn browser_write(headers: &HeaderMap) -> bool {
    same_origin(headers) && headers.get("x-imagegen-request").is_some_and(|h| h == "1")
}
async fn issue_login(
    service: Service,
    body: Value,
    kind: &'static str,
) -> Result<(String, u64), Failure> {
    if !service.browser.allow_login() {
        return Err(fail(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many sign-in attempts. Try again in a minute.",
        ));
    }
    tokio::task::spawn_blocking(move || {
        let key = body["accessKey"].as_str().unwrap_or("");
        let proof = !key.is_empty()
            && bool::from(
                <[u8; 32]>::from(Sha256::digest(key.as_bytes())).ct_eq(&service.token_hash),
            );
        let auth = service.browser.auth.lock().map_err(internal)?;
        if !proof
            && (!key.is_empty()
                || !auth.verify(
                    body["username"].as_str().unwrap_or(""),
                    body["password"].as_str().unwrap_or(""),
                ))
        {
            return Err(fail(
                StatusCode::UNAUTHORIZED,
                "The access key or username and password was not recognised",
            ));
        }
        auth.issue(
            kind,
            kind == "native" || body["rememberMe"].as_bool().unwrap_or(false),
            proof,
        )
        .map_err(internal)
    })
    .await
    .map_err(internal)?
}
pub(crate) async fn native_login(
    State(service): State<Service>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, Failure> {
    // Native credentials are exchanged for a revocable token, never the server access key.
    if headers.contains_key(header::ORIGIN) || !browser_write(&headers) {
        return Err(fail(StatusCode::FORBIDDEN, "Invalid native request"));
    }
    let (token, lifetime) = issue_login(service, body, "native").await?;
    Ok(Json(json!({"token":token,"expiresIn":lifetime})))
}
pub(crate) async fn login(
    State(service): State<Service>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, Failure> {
    if !browser_write(&headers) {
        return Err(fail(
            StatusCode::FORBIDDEN,
            "Open Image Gen from its own server address",
        ));
    }
    let remember = body["rememberMe"].as_bool().unwrap_or(false);
    let (session, lifetime) = issue_login(service.clone(), body, "browser").await?;
    if let Some(old) = cookie(&headers) {
        service
            .browser
            .auth
            .lock()
            .map_err(internal)?
            .revoke(old)
            .map_err(internal)?;
    }
    let secure = headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("https://"));
    let persistent = if remember {
        format!("; Max-Age={lifetime}")
    } else {
        String::new()
    };
    Ok((
        [(
            header::SET_COOKIE,
            format!(
                "imagegen_session={session}; Path=/; HttpOnly; SameSite=Strict{persistent}{}",
                if secure { "; Secure" } else { "" }
            ),
        )],
        Json(json!({"ok":true})),
    )
        .into_response())
}
pub(crate) async fn session(
    State(service): State<Service>,
    headers: HeaderMap,
) -> Result<Json<Value>, Failure> {
    let name = service.db.lock().map_err(internal)?.name.clone();
    let auth = service.browser.auth.lock().map_err(internal)?;
    let has_owner = auth.has_owner().map_err(internal)?;
    let can_setup = cookie(&headers).is_some_and(|id| auth.owner_proof(id)) && !has_owner;
    Ok(Json(
        json!({"name":name,"workerEnabled":service.browser.options.worker_enabled,"version":env!("CARGO_PKG_VERSION"),"hasOwner":has_owner,"canSetup":can_setup,"setupNeeded":can_setup&&!auth.key_only().map_err(internal)?}),
    ))
}
pub(crate) async fn owner_setup(
    State(service): State<Service>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, Failure> {
    if !browser_write(&headers) {
        return Err(fail(StatusCode::FORBIDDEN, "Invalid browser request"));
    }
    let id = cookie(&headers).unwrap_or("").to_string();
    tokio::task::spawn_blocking(move || {
        let auth = service.browser.auth.lock().map_err(internal)?;
        if !auth.owner_proof(&id) {
            return Err(fail(
                StatusCode::FORBIDDEN,
                "Sign in with your server access key again to verify ownership",
            ));
        }
        if auth.has_owner().map_err(internal)? {
            return Err(fail(
                StatusCode::CONFLICT,
                "An owner account already exists",
            ));
        }
        if body["keyOnly"].as_bool().unwrap_or(false) {
            auth.dismiss().map_err(internal)?;
        } else {
            auth.create_owner(
                body["username"].as_str().unwrap_or(""),
                body["password"].as_str().unwrap_or(""),
            )
            .map_err(|e| fail(StatusCode::BAD_REQUEST, e))?;
        }
        Ok(Json(json!({"ok":true})))
    })
    .await
    .map_err(internal)?
}
pub(crate) async fn logout(
    State(service): State<Service>,
    headers: HeaderMap,
) -> Result<Response, Failure> {
    if !browser_write(&headers) {
        return Err(fail(StatusCode::FORBIDDEN, "Invalid browser request"));
    }
    if let Some(id) = cookie(&headers) {
        service
            .browser
            .auth
            .lock()
            .map_err(internal)?
            .revoke(id)
            .map_err(internal)?;
    }
    Ok((
        [(
            header::SET_COOKIE,
            "imagegen_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
        )],
        Json(json!({"ok":true})),
    )
        .into_response())
}

fn argument<T: serde::de::DeserializeOwned>(args: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(args[key].clone()).map_err(|_| format!("Invalid {key}"))
}
fn value<T: serde::Serialize>(v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|e| e.to_string())
}
async fn dispatch(
    state: Arc<AppState>,
    command: String,
    args: Value,
    worker_enabled: bool,
) -> Result<Value, String> {
    let app = runtime::AppHandle::new(&state);
    let s = || runtime::State(&state);
    if !worker_enabled
        && [
            "start_login",
            "cancel_login",
            "submit_prompt",
            "describe_asset",
            "reconnect",
        ]
        .contains(&command.as_str())
    {
        return Err("Server generation is disabled. Enable IMAGEGEN_WORKER_ENABLED on the Docker host to use ChatGPT in the browser.".into());
    }
    match command.as_str() {
        "get_workspace" => value(commands::get_workspace(s()).await?),
        "image_data" => value(commands::image_data(s(), argument(&args, "imageId")?).await?),
        "get_jobs" => value(commands::get_jobs(s()).await?),
        "mutate" => commands::mutate(app, s(), argument(&args, "action")?).await,
        "connection" => {
            if worker_enabled {
                commands::connection(s()).await
            } else {
                Ok(
                    json!({"account":null,"capabilities":{"imageGeneration":false},"workerEnabled":false}),
                )
            }
        }
        "reconnect" => {
            commands::reconnect(s()).await?;
            Ok(Value::Null)
        }
        "start_login" => commands::start_login(app, s()).await,
        "cancel_login" => {
            commands::cancel_login(s(), argument(&args, "loginId")?).await?;
            Ok(Value::Null)
        }
        "preview_template" => value(commands::preview_template(s(), argument(&args, "request")?).await?),
        "submit_prompt" => {
            value(commands::submit_prompt(app, s(), argument(&args, "request")?).await?)
        }
        "cancel_job" => {
            commands::cancel_job(app, s(), argument(&args, "jobId")?).await?;
            Ok(Value::Null)
        }
        "import_asset_data" => value(
            commands::import_asset_data(
                app,
                s(),
                argument(&args, "name")?,
                argument(&args, "data")?,
                argument(&args, "organisationId")?,
                argument(&args, "replaceId")?,
            )
            .await?,
        ),
        "capture_composition" => {
            value(commands::capture_composition(s(), argument(&args, "data")?).await?)
        }
        "original_asset_preview" => {
            value(original::original_asset_preview(s(), argument(&args, "selection")?).await?)
        }
        "extract_original_asset" => value(
            original::extract_original_asset(
                app,
                s(),
                argument(&args, "selection")?,
                argument(&args, "name")?,
                argument(&args, "organisationId")?,
            )
            .await?,
        ),
        "describe_asset" => value(
            analysis::describe_asset(
                s(),
                argument(&args, "references")?,
                argument(&args, "description")?,
                argument(&args, "objectType")?,
            )
            .await?,
        ),
        "convert_print_image" => value(
            print::convert_print_image(argument(&args, "data")?, argument(&args, "proof")?).await?,
        ),
        "print_profile" => value(print::print_profile()),
        "server_status" => state.store.status(),
        _ => Err("This operation is not available in the browser".into()),
    }
}
pub(crate) async fn command(
    State(service): State<Service>,
    Path(command): Path<String>,
    Json(args): Json<Value>,
) -> Result<Json<Value>, Failure> {
    let state = service.browser.state().await.map_err(internal)?;
    let enabled = service.browser.options.worker_enabled;
    let handle = tokio::runtime::Handle::current();
    let result = tokio::task::spawn_blocking(move || {
        handle.block_on(dispatch(state, command, args, enabled))
    })
    .await
    .map_err(internal)?;
    result
        .map(Json)
        .map_err(|e| fail(StatusCode::BAD_REQUEST, e))
}
pub(crate) async fn download(
    State(service): State<Service>,
    Path(kind): Path<String>,
) -> Result<Response, Failure> {
    if !["backup", "unsent"].contains(&kind.as_str()) {
        return Err(fail(StatusCode::NOT_FOUND, "Download not found"));
    }
    let state = service.browser.state().await.map_err(internal)?;
    let bytes = tokio::task::spawn_blocking(move || {
        let path = state.jobs_dir.join(format!("download-{}.zip", model::id()));
        let result = (|| {
            if kind == "backup" {
                state.store.refresh()?;
                backup::backup_to(&state, &path)?;
            } else {
                state.store.save_unsent(&path)?;
            }
            std::fs::read(&path).map_err(|e| e.to_string())
        })();
        let _ = std::fs::remove_file(path);
        result
    })
    .await
    .map_err(internal)?
    .map_err(|e: String| fail(StatusCode::BAD_REQUEST, e))?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/zip"),
            (
                header::CONTENT_DISPOSITION,
                r#"attachment; filename="Image Gen Backup.zip""#,
            ),
        ],
        bytes,
    )
        .into_response())
}
pub async fn headers(
    request: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> Response {
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert("x-content-type-options", "nosniff".parse().unwrap());
    response
        .headers_mut()
        .insert("referrer-policy", "same-origin".parse().unwrap());
    response.headers_mut().insert("content-security-policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'".parse().unwrap());
    response
}
