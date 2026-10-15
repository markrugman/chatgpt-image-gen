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
pub fn executable() -> Result<PathBuf, String> {
    #[cfg(feature = "headless")]
    {
        if let Some(p) = std::env::var_os("IMAGEGEN_CODEX_PATH") {
            return Ok(p.into());
        }
        return Ok(PathBuf::from("codex"));
    }
    #[cfg(not(feature = "headless"))]
    {
        let mut roots = Vec::new();
        if let Some(root) = RESOURCE_DIR.get() {
            roots.push(root.join("runtime"));
        }
        if let Ok(app) = std::env::current_exe() {
            if let Some(dir) = app.parent() {
                roots.extend([
                    dir.join("runtime"),
                    dir.join("../Resources/runtime"),
                    dir.join("../lib/Image Gen/runtime"),
                ]);
            }
        }
        bundled_executable(&roots)
    }
}
#[cfg(not(feature = "headless"))]
fn bundled_executable(roots: &[PathBuf]) -> Result<PathBuf, String> {
    let name = if cfg!(windows) { "codex.exe" } else { "codex" };
    roots.iter().map(|root| root.join(name)).find(|p| p.is_file())
        .ok_or_else(|| "Image Gen's bundled generation runtime is missing. Reinstall Image Gen or use the complete portable folder.".into())
}
#[cfg(not(feature = "headless"))]
fn isolate_desktop(command: &mut Command, cwd: &Path) -> Result<(), String> {
    let home = std::path::absolute(cwd.join("codex")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    command
        .env("CODEX_HOME", home)
        .env_remove("OPENAI_API_KEY")
        .env_remove("CODEX_API_KEY")
        .env_remove("CODEX_ACCESS_TOKEN")
        .args([
            "-c",
            "cli_auth_credentials_store=\"file\"",
            "-c",
            "forced_login_method=\"chatgpt\"",
        ]);
    Ok(())
}
impl Codex {
    pub async fn start(cwd: &Path) -> Result<Arc<Self>, String> {
        #[cfg(feature = "headless")]
        if let Some(home) = std::env::var_os("CODEX_HOME") {
            std::fs::create_dir_all(home).map_err(|e| e.to_string())?;
        }
        let mut command = Command::new(executable()?);
        #[cfg(not(feature = "headless"))]
        isolate_desktop(&mut command, cwd)?;
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

#[cfg(all(test, not(feature = "headless")))]
mod tests {
    use super::*;

    #[test]
    fn desktop_overrides_shared_home_and_credentials() {
        let root =
            std::env::temp_dir().join(format!("imagegen-isolation-{}", uuid::Uuid::new_v4()));
        let jobs = root.join("sessions");
        let mut command = Command::new("unused-test-program");
        command
            .env("CODEX_HOME", root.join("shared-codex"))
            .env("OPENAI_API_KEY", "test-sentinel")
            .env("CODEX_API_KEY", "test-sentinel")
            .env("CODEX_ACCESS_TOKEN", "test-sentinel");
        isolate_desktop(&mut command, &jobs).unwrap();
        let env: HashMap<_, _> = command.as_std().get_envs().collect();
        assert_eq!(
            env[std::ffi::OsStr::new("CODEX_HOME")],
            Some(jobs.join("codex").as_os_str())
        );
        for key in ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN"] {
            assert_eq!(env[std::ffi::OsStr::new(key)], None);
        }
        assert!(jobs.join("codex").is_dir());
        assert!(!root.join("shared-codex").exists());
        let args: Vec<_> = command.as_std().get_args().collect();
        assert!(args.contains(&std::ffi::OsStr::new("forced_login_method=\"chatgpt\"")));
        assert!(args.contains(&std::ffi::OsStr::new("cli_auth_credentials_store=\"file\"")));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn desktop_requires_bundled_runtime() {
        assert!(
            bundled_executable(&[])
                .unwrap_err()
                .contains("bundled generation runtime is missing")
        );
        let root = std::env::temp_dir().join(format!("imagegen-runtime-{}", uuid::Uuid::new_v4()));
        let runtime = root.join("runtime");
        std::fs::create_dir_all(&runtime).unwrap();
        assert!(bundled_executable(&[runtime.clone()]).is_err());
        let bundled = runtime.join(if cfg!(windows) { "codex.exe" } else { "codex" });
        std::fs::write(&bundled, "fixture").unwrap();
        assert_eq!(bundled_executable(&[runtime]).unwrap(), bundled);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    #[ignore = "Requires IMAGEGEN_TEST_RESOURCE_DIR and network access for device login"]
    async fn private_runtime_starts_signed_out_and_owns_device_login() {
        set_resource_dir(
            std::env::var_os("IMAGEGEN_TEST_RESOURCE_DIR")
                .expect("test resources")
                .into(),
        );
        let root = std::env::temp_dir().join(format!("imagegen-oauth-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let codex = Codex::start(&root).await.unwrap();
        let account = codex
            .rpc("account/read", json!({"refreshToken":false}))
            .await
            .unwrap();
        assert!(
            account["account"].is_null(),
            "A fresh desktop must not reuse an existing login"
        );
        let login = codex
            .rpc("account/login/start", json!({"type":"chatgptDeviceCode"}))
            .await
            .unwrap();
        let login_id = login["loginId"].as_str().expect("device login ID");
        assert!(login["userCode"].as_str().is_some());
        codex
            .rpc("account/login/cancel", json!({"loginId":login_id}))
            .await
            .unwrap();
        drop(codex);
        // The child is killed on drop; Windows can briefly retain file handles.
        for _ in 0..20 {
            if std::fs::remove_dir_all(&root).is_ok() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
