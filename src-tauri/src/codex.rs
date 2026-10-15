use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{Mutex, broadcast, oneshot},
    time::{Duration, timeout},
};

pub struct Codex {
    input: Mutex<ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    pub events: broadcast::Sender<Value>,
    next: AtomicU64,
    _child: Mutex<Child>,
}
#[cfg(not(feature = "headless"))]
static RESOURCE_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
#[cfg(not(feature = "headless"))]
pub fn set_resource_dir(path: PathBuf) {
    let _ = RESOURCE_DIR.set(path);
}
pub fn executable() -> PathBuf {
    if let Some(p) = std::env::var_os("IMAGEGEN_CODEX_PATH") {
        return p.into();
    }
    #[cfg(not(feature = "headless"))]
    if let Some(root) = RESOURCE_DIR.get() {
        let candidate =
            root.join("runtime")
                .join(if cfg!(windows) { "codex.exe" } else { "codex" });
        if candidate.is_file() {
            return candidate;
        }
    }
    // Bundled resources let the app run without a separate Codex installation.
    if let Ok(app) = std::env::current_exe() {
        if let Some(dir) = app.parent() {
            let name = if cfg!(windows) { "codex.exe" } else { "codex" };
            for base in [
                dir.join("runtime"),
                dir.join("../Resources/runtime"),
                dir.join("../lib/Image Gen/runtime"),
            ] {
                let candidate = base.join(name);
                if candidate.is_file() {
                    return candidate;
                }
            }
        }
    }
    #[cfg(windows)]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let base = PathBuf::from(local).join("OpenAI/Codex/bin");
            if let Ok(entries) = std::fs::read_dir(base) {
                let mut candidates: Vec<_> = entries
                    .flatten()
                    .map(|e| e.path().join("codex.exe"))
                    .filter(|p| p.is_file())
                    .collect();
                candidates.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
                if let Some(path) = candidates.pop() {
                    return path;
                }
            }
        }
    }
    PathBuf::from("codex")
}
impl Codex {
    pub async fn start(cwd: &Path) -> Result<Arc<Self>, String> {
        if let Some(home) = std::env::var_os("CODEX_HOME") {
            std::fs::create_dir_all(home).map_err(|e| e.to_string())?;
        }
        let mut command = Command::new(executable());
        command
            .args(["app-server", "--stdio"])
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command.spawn().map_err(|e| {
            format!("Cannot start the generation runtime. Reinstall Image Gen or use the complete portable folder. {e}")
        })?;
        let input = child.stdin.take().ok_or("Codex stdin is unavailable")?;
        let output = child.stdout.take().ok_or("Codex stdout is unavailable")?;
        let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let (events, _) = broadcast::channel(256);
        let service = Arc::new(Self {
            input: Mutex::new(input),
            pending: pending.clone(),
            events: events.clone(),
            next: AtomicU64::new(1),
            _child: Mutex::new(child),
        });
        let weak = Arc::downgrade(&service);
        tokio::spawn(async move {
            let mut lines = BufReader::new(output).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if let Some(id) = message["id"].as_u64() {
                    if let Some(sender) = pending.lock().await.remove(&id) {
                        let result = if message.get("error").is_some() {
                            Err(message["error"]["message"]
                                .as_str()
                                .unwrap_or("Codex request failed")
                                .into())
                        } else {
                            Ok(message["result"].clone())
                        };
                        let _ = sender.send(result);
                        continue;
                    }
                }
                if message.get("id").is_some() && message.get("method").is_some() {
                    if let Some(service) = weak.upgrade() {
                        let _=service.send(json!({"id":message["id"],"error":{"code":-32601,"message":"This design workspace does not execute client tools"}})).await;
                    }
                } else {
                    let _ = events.send(message);
                }
            }
            for (_, sender) in pending.lock().await.drain() {
                let _ = sender.send(Err(
                    "Codex disconnected. Reconnect and retry your request.".into()
                ));
            }
            let _ = events.send(json!({"method":"connection/closed"}));
        });
        service.rpc("initialize",json!({"clientInfo":{"name":"image_gen_app","version":"0.1.0"},"capabilities":{"experimentalApi":true}})).await?;
        service.send(json!({"method":"initialized"})).await?;
        Ok(service)
    }
    async fn send(&self, message: Value) -> Result<(), String> {
        let mut input = self.input.lock().await;
        input
            .write_all(format!("{}\n", message).as_bytes())
            .await
            .map_err(|e| e.to_string())
    }
    pub async fn rpc(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id, sender);
        if let Err(error) = self
            .send(json!({"id":id,"method":method,"params":params}))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }
        match timeout(Duration::from_secs(45), receiver).await {
            Ok(Ok(result)) => result,
            _ => {
                self.pending.lock().await.remove(&id);
                Err(format!("{method} timed out. Reconnect and retry."))
            }
        }
    }
}
