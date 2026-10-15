use crate::{local_store, model::*, remote::Remote};
use base64::Engine;
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
pub struct Store {
    local: local_store::Store,
    remote: Mutex<Option<Remote>>,
    pub root: PathBuf,
}
impl Store {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        let local = local_store::Store::open(root.clone())?;
        let remote = Remote::load(&root)?;
        Ok(Self {
            local,
            remote: Mutex::new(remote),
            root,
        })
    }
    pub fn connected(&self) -> bool {
        self.remote.lock().map(|r| r.is_some()).unwrap_or(true)
    }
    pub fn read(&self) -> Result<Workspace, String> {
        let slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        match slot.as_ref() {
            Some(r) => Ok(r.snapshot.workspace.clone()),
            None => self.local.read(),
        }
    }
    pub fn refresh(&self) -> Result<Workspace, String> {
        let mut slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        match slot.as_mut() {
            Some(r) => {
                let _ = r.refresh();
                Ok(r.snapshot.workspace.clone())
            }
            None => self.local.read(),
        }
    }
    pub fn change<T>(
        &self,
        edit: impl FnOnce(&mut Workspace) -> Result<T, String>,
    ) -> Result<T, String> {
        self.change_from(None, edit)
    }
    pub fn change_from<T>(
        &self,
        base: Option<&Workspace>,
        edit: impl FnOnce(&mut Workspace) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        if let Some(r) = slot.as_mut() {
            let base = base.unwrap_or(&r.snapshot.workspace).clone();
            let mut next = base.clone();
            let result = edit(&mut next)?;
            r.commit(&base, &next, false)?;
            Ok(result)
        } else {
            self.local.change(edit)
        }
    }
    pub fn connect_account(&self, url: &str, username: String, password: String) -> Result<(), String> {
        self.connect(url, Remote::account_token(url, username, password)?)
    }
    pub fn connect(&self, url: &str, token: String) -> Result<(), String> {
        let remote = Remote::connect(&self.root, url, token)?;
        let mut slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        remote.activate(&self.root)?;
        *slot = Some(remote);
        Ok(())
    }
    #[cfg(feature = "headless")]
    pub fn connect_worker(&self, url: &str, token: String) -> Result<(), String> {
        let remote = Remote::connect(&self.root, url, token)?;
        *self.remote.lock().map_err(|_| "Workspace lock failed")? = Some(remote);
        Ok(())
    }
    pub fn disconnect(&self) -> Result<(), String> {
        let mut slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        let file = self.root.join("server.json");
        if file.exists() {
            fs::remove_file(file).map_err(|e| e.to_string())?;
        }
        *slot = None;
        Ok(())
    }
    pub fn status(&self) -> Result<Value, String> {
        let slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        Ok(match slot.as_ref() {
            None => json!({"nativeVersion":env!("CARGO_PKG_VERSION"),"connected":false,"name":"Local workspace","online":true,"pending":0}),
            Some(r) => {
                json!({"nativeVersion":env!("CARGO_PKG_VERSION"),"serverVersion":r.snapshot.server_version,"connected":true,"url":r.config.url,"name":r.snapshot.name,"serverId":r.config.server_id,"online":r.error.is_none(),"error":r.error,"pending":r.pending(),"empty":r.snapshot.workspace.organisations.is_empty()&&r.snapshot.workspace.documents.is_empty()&&r.snapshot.workspace.assets.is_empty()})
            }
        })
    }
    pub fn copy_local(&self) -> Result<(), String> {
        let mut slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        let r = slot.as_mut().ok_or("Connect to a server first")?;
        r.refresh()?;
        let base = r.snapshot.workspace.clone();
        if !base.organisations.is_empty()
            || !base.projects.is_empty()
            || !base.documents.is_empty()
            || !base.assets.is_empty()
            || !base.images.is_empty()
            || !base.custom_sizes.is_empty()
        {
            return Err("Copying requires an empty server. Existing work was not replaced.".into());
        }
        let local = self.local.read()?;
        for image in &local.images {
            let bytes = fs::read(self.local.image_path(&image.id)?).map_err(|e| e.to_string())?;
            fs::write(r.cache.join("media").join(&image.file), &bytes)
                .map_err(|e| e.to_string())?;
        }
        r.commit(&base, &local, true)?;
        let expected = serde_json::to_value(&local).map_err(|e| e.to_string())?;
        r.refresh()?;
        if serde_json::to_value(&r.snapshot.workspace).map_err(|e| e.to_string())? != expected {
            return Err(
                "Server copy differs after verification. Your local workspace is unchanged.".into(),
            );
        }
        Ok(())
    }
    pub fn import(&self, source: &Path) -> Result<ImageRecord, String> {
        self.import_bytes(&fs::read(source).map_err(|e| e.to_string())?)
    }
    pub fn import_bytes(&self, bytes: &[u8]) -> Result<ImageRecord, String> {
        let slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        let Some(r) = slot.as_ref() else {
            return self.local.import_bytes(bytes);
        };
        if bytes.len() > 50_000_000 {
            return Err("Choose an image smaller than 50 MB".into());
        }
        let format = image::guess_format(bytes).map_err(|_| "Choose a PNG, JPEG, or WebP image")?;
        let (ext, mime) = match format {
            image::ImageFormat::Png => ("png", "image/png"),
            image::ImageFormat::Jpeg => ("jpg", "image/jpeg"),
            image::ImageFormat::WebP => ("webp", "image/webp"),
            _ => return Err("Choose a PNG, JPEG, or WebP image".into()),
        };
        let decoded =
            image::load_from_memory_with_format(bytes, format).map_err(|e| e.to_string())?;
        let id = id();
        let file = format!("{id}.{ext}");
        fs::write(r.cache.join("media").join(&file), bytes).map_err(|e| e.to_string())?;
        Ok(ImageRecord {
            id,
            file,
            width: decoded.width(),
            height: decoded.height(),
            mime: mime.into(),
        })
    }
    pub fn image_path(&self, image_id: &str) -> Result<PathBuf, String> {
        let slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        match slot.as_ref() {
            None => self.local.image_path(image_id),
            Some(r) => {
                let image = r
                    .snapshot
                    .workspace
                    .images
                    .iter()
                    .find(|i| i.id == image_id)
                    .ok_or("Image not found")?;
                r.image(&image.file)
            }
        }
    }
    pub fn image_data(&self, image_id: &str) -> Result<String, String> {
        let w = self.read()?;
        let image = w
            .images
            .iter()
            .find(|i| i.id == image_id)
            .ok_or("Image not found")?;
        let bytes = fs::read(self.image_path(image_id)?).map_err(|e| e.to_string())?;
        Ok(format!(
            "data:{};base64,{}",
            image.mime,
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    }
    pub fn save_unsent(&self, destination: &Path) -> Result<usize, String> {
        use std::io::Write;
        let slot = self.remote.lock().map_err(|_| "Workspace lock failed")?;
        let r = slot
            .as_ref()
            .ok_or("Connect to the server whose unsent work you want to save")?;
        let directory = r.cache.join("unsent");
        let mut files: Vec<_> = fs::read_dir(directory)
            .map_err(|_| "No unsent work to save")?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|s| s == "json"))
            .collect();
        files.sort();
        let mut archive =
            zip::ZipWriter::new(fs::File::create(destination).map_err(|e| e.to_string())?);
        let options = zip::write::SimpleFileOptions::default();
        for (index, path) in files.iter().enumerate() {
            let value: Value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            let workspace: Workspace =
                serde_json::from_value(value["workspace"].clone()).map_err(|e| e.to_string())?;
            let mut nested = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
            nested
                .start_file("workspace.json", options)
                .map_err(|e| e.to_string())?;
            nested
                .write_all(&serde_json::to_vec(&workspace).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            for image in &workspace.images {
                nested
                    .start_file(format!("media/{}", image.file), options)
                    .map_err(|e| e.to_string())?;
                nested
                    .write_all(&fs::read(r.image(&image.file)?).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            }
            let bytes = nested.finish().map_err(|e| e.to_string())?.into_inner();
            archive
                .start_file(format!("Recovery {}.zip", index + 1), options)
                .map_err(|e| e.to_string())?;
            archive.write_all(&bytes).map_err(|e| e.to_string())?;
        }
        archive.finish().map_err(|e| e.to_string())?;
        Ok(files.len())
    }
}

#[cfg(all(test, not(feature = "headless")))]
mod tests {
    use super::*;
    use sha2::Digest;
    #[test]
    fn server_copy_reopen_conflict_offline_and_recovery_keep_originals() {
        let root = std::env::temp_dir().join(format!("imagegen-sync-test-{}", id()));
        let server_root = root.join("server");
        let token = format!("{}{}", id(), id());
        let server_token = token.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (stop_tx, stop_rx) = tokio::sync::oneshot::channel();
        let thread = std::thread::spawn(move || {
            tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(async move {
                    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                    let address = listener.local_addr().unwrap();
                    let app =
                        image_gen_server::router(server_root, "Test".into(), server_token).unwrap();
                    ready_tx.send(address).unwrap();
                    axum::serve(listener, app)
                        .with_graceful_shutdown(async {
                            let _ = stop_rx.await;
                        })
                        .await
                        .unwrap();
                });
        });
        let url = format!("http://{}", ready_rx.recv().unwrap());
        let first = Store::open(root.join("client1")).unwrap();
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::RgbaImage::from_pixel(2, 2, image::Rgba([12, 34, 56, 255]))
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        let bytes = bytes.into_inner();
        let image = first.import_bytes(&bytes).unwrap();
        let doc = first
            .change(|w| {
                w.organisations.push(Organisation {
                    id: "org".into(),
                    name: "Courtyard".into(),
                    color: "purple".into(),
                });
                w.projects.push(Project {
                    id: "project".into(),
                    organisation_id: "org".into(),
                    name: "Halloween".into(),
                    tags: vec![],
                    deleted_at: None,
                });
                w.images.push(image.clone());
                w.add_document(
                    "project".into(),
                    "Poster".into(),
                    210.,
                    297.,
                    "mm".into(),
                    None,
                    Some(image.id.clone()),
                )
            })
            .unwrap();
        let original = serde_json::to_value(first.read().unwrap()).unwrap();
        first.connect(&url, token.clone()).unwrap();
        assert!(first.read().unwrap().documents.is_empty());
        first.copy_local().unwrap();
        assert_eq!(
            serde_json::to_value(first.read().unwrap()).unwrap(),
            original
        );
        assert!(first.copy_local().is_err());
        assert_eq!(
            fs::read(first.image_path(&image.id).unwrap()).unwrap(),
            bytes
        );
        let config = fs::read_to_string(first.root.join("server.json")).unwrap();
        assert!(!config.contains(&token));
        let second = Store::open(root.join("client2")).unwrap();
        second.connect(&url, token).unwrap();
        assert_eq!(
            fs::read(second.image_path(&image.id).unwrap()).unwrap(),
            bytes
        );
        let stale = first.read().unwrap();
        second
            .change(|w| {
                w.documents[0].name = "Second PC".into();
                Ok(())
            })
            .unwrap();
        assert!(
            first
                .change_from(Some(&stale), |w| {
                    w.documents[0].name = "Conflicting edit".into();
                    Ok(())
                })
                .is_err()
        );
        assert_eq!(first.status().unwrap()["pending"], 1);
        first.refresh().unwrap();
        assert_eq!(first.read().unwrap().documents[0].name, "Second PC");
        // A generated image can be staged locally before the server becomes unavailable.
        let generated = first.import_bytes(&bytes).unwrap();
        stop_tx.send(()).unwrap();
        thread.join().unwrap();
        assert!(
            first
                .change(|w| {
                    w.images.push(generated.clone());
                    let page = &mut w.documents.iter_mut().find(|d| d.id == doc).unwrap().pages[0];
                    let mut composition = page.composition().clone();
                    composition.image_id = Some(generated.id.clone());
                    page.push(composition);
                    Ok(())
                })
                .is_err()
        );
        assert_eq!(first.status().unwrap()["pending"], 2);
        let recovery = root.join("recovery.zip");
        assert_eq!(first.save_unsent(&recovery).unwrap(), 2);
        let mut archive = zip::ZipArchive::new(fs::File::open(recovery).unwrap()).unwrap();
        let mut found_generated = false;
        for i in 0..archive.len() {
            use std::io::Read;
            let mut bytes = Vec::new();
            archive
                .by_index(i)
                .unwrap()
                .read_to_end(&mut bytes)
                .unwrap();
            let mut nested = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
            let workspace: Workspace =
                serde_json::from_reader(nested.by_name("workspace.json").unwrap()).unwrap();
            if workspace.images.iter().any(|i| i.id == generated.id) {
                let mut saved = Vec::new();
                nested
                    .by_name(&format!("media/{}", generated.file))
                    .unwrap()
                    .read_to_end(&mut saved)
                    .unwrap();
                assert_eq!(
                    saved,
                    fs::read(
                        first
                            .remote
                            .lock()
                            .unwrap()
                            .as_ref()
                            .unwrap()
                            .cache
                            .join("media")
                            .join(&generated.file)
                    )
                    .unwrap()
                );
                found_generated = true;
            }
        }
        assert!(found_generated);
        drop(archive);
        drop(first);
        let first = Store::open(root.join("client1")).unwrap();
        assert!(first.connected());
        assert_eq!(first.status().unwrap()["online"], false);
        assert_eq!(
            fs::read(first.image_path(&image.id).unwrap()).unwrap(),
            bytes
        );
        first.disconnect().unwrap();
        assert_eq!(
            serde_json::to_value(first.read().unwrap()).unwrap(),
            original
        );
        assert!(
            first
                .read()
                .unwrap()
                .images
                .iter()
                .all(|i| i.id != generated.id)
        );
        let credential = keyring::Entry::new(
            "com.mark.imagegenapp.server",
            &format!("{:x}", sha2::Sha256::digest(url.as_bytes())),
        )
        .unwrap();
        let _ = credential.delete_credential();
        drop(first);
        drop(second);
        fs::remove_dir_all(root).unwrap();
    }
}
