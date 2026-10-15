use crate::AppState;
use std::{
    future::Future,
    ops::Deref,
    sync::{Arc, Weak},
};
#[derive(Clone)]
pub struct AppHandle {
    state: Weak<AppState>,
}
impl AppHandle {
    pub fn new(state: &Arc<AppState>) -> Self {
        Self {
            state: Arc::downgrade(state),
        }
    }
}
pub trait Emitter {
    fn emit<T: serde::Serialize>(&self, event: &str, payload: T) -> Result<(), String>;
}
impl Emitter for AppHandle {
    fn emit<T: serde::Serialize>(&self, event: &str, _payload: T) -> Result<(), String> {
        if event == "jobs-changed" {
            let weak = self.state.clone();
            tokio::spawn(async move {
                if let Some(state) = weak.upgrade() {
                    let jobs = state.jobs.lock().await;
                    let path = state.jobs_dir.join("jobs.json");
                    if let Ok(bytes) = serde_json::to_vec(&jobs.values().collect::<Vec<_>>()) {
                        let staging = path.with_extension("partial");
                        if tokio::fs::write(&staging, bytes).await.is_ok() {
                            let _ = tokio::fs::rename(staging, path).await;
                        }
                    }
                }
            });
        }
        Ok(())
    }
}
pub struct State<'a, T>(pub &'a T);
impl<'a, T> State<'a, T> {
    pub fn inner(&self) -> &'a T {
        self.0
    }
}
impl<T> Deref for State<'_, T> {
    type Target = T;
    fn deref(&self) -> &T {
        self.0
    }
}
// Native persistence uses blocking I/O. Keep it away from Axum's networking threads.
pub fn spawn<F: Future + Send + 'static>(future: F) -> tokio::task::JoinHandle<F::Output>
where
    F::Output: Send + 'static,
{
    let handle = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || handle.block_on(future))
}
