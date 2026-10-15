use crate::model::*;
use rusqlite::{Connection, params};
use std::{fs, io::Write, path::PathBuf, sync::Mutex};

pub struct Store {
    connection: Mutex<Connection>,
    pub root: PathBuf,
}
impl Store {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        let existed = root.join("workspace.sqlite3").exists();
        fs::create_dir_all(root.join("media")).map_err(|e| e.to_string())?;
        let conn = Connection::open(root.join("workspace.sqlite3")).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);").map_err(|e|e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO workspace(id,data) VALUES (1,?1)",
            params![serde_json::to_string(&Workspace::default()).unwrap()],
        )
        .map_err(|e| e.to_string())?;
        let data: String = conn
            .query_row("SELECT data FROM workspace WHERE id=1", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let mut raw: serde_json::Value =
            serde_json::from_str(&data).map_err(|e| format!("Cannot read workspace: {e}"))?;
        if existed {
            // Preserve the original saved JSON and immutable media before the first new-version write.
            let workspace: Workspace = serde_json::from_str(&data).map_err(|e| e.to_string())?;
            let backup = root.join(format!("before-v{}.zip", env!("CARGO_PKG_VERSION")));
            if !backup.exists() {
                let staging =
                    root.join(format!("before-v{}.zip.partial", env!("CARGO_PKG_VERSION")));
                let mut archive =
                    zip::ZipWriter::new(fs::File::create(&staging).map_err(|e| e.to_string())?);
                let options = zip::write::SimpleFileOptions::default();
                archive
                    .start_file("workspace.json", options)
                    .map_err(|e| e.to_string())?;
                archive
                    .write_all(data.as_bytes())
                    .map_err(|e| e.to_string())?;
                for image in workspace.images {
                    archive
                        .start_file(format!("media/{}", image.file), options)
                        .map_err(|e| e.to_string())?;
                    archive
                        .write_all(
                            &fs::read(root.join("media").join(image.file))
                                .map_err(|e| e.to_string())?,
                        )
                        .map_err(|e| e.to_string())?;
                }
                archive.finish().map_err(|e| e.to_string())?;
                fs::rename(staging, backup).map_err(|e| e.to_string())?;
            }
        }
        if raw["formatVersion"].as_u64().unwrap_or(0) < 3 {
            raw["formatVersion"] = serde_json::json!(3);
            conn.execute("UPDATE workspace SET data=?1 WHERE id=1", [raw.to_string()])
                .map_err(|e| e.to_string())?;
        }
        Ok(Self {
            connection: Mutex::new(conn),
            root,
        })
    }
    pub fn read(&self) -> Result<Workspace, String> {
        let conn = self
            .connection
            .lock()
            .map_err(|_| "Workspace lock failed")?;
        let data: String = conn
            .query_row("SELECT data FROM workspace WHERE id=1", [], |row| {
                row.get(0)
            })
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| format!("Cannot read workspace: {e}"))
    }
    pub fn change<T>(
        &self,
        edit: impl FnOnce(&mut Workspace) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut conn = self
            .connection
            .lock()
            .map_err(|_| "Workspace lock failed")?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let data: String = tx
            .query_row("SELECT data FROM workspace WHERE id=1", [], |row| {
                row.get(0)
            })
            .map_err(|e| e.to_string())?;
        let mut workspace: Workspace = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        let result = edit(&mut workspace)?;
        crate::organisations::validate(&workspace)?;
        tx.execute(
            "UPDATE workspace SET data=?1 WHERE id=1",
            params![serde_json::to_string(&workspace).map_err(|e| e.to_string())?],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(result)
    }
    pub fn import_bytes(&self, bytes: &[u8]) -> Result<ImageRecord, String> {
        if bytes.len() > 50_000_000 {
            return Err("Choose an image smaller than 50 MB".into());
        }
        let format =
            image::guess_format(&bytes).map_err(|_| "Choose a PNG, JPEG, or WebP image")?;
        let (extension, mime) = match format {
            image::ImageFormat::Png => ("png", "image/png"),
            image::ImageFormat::Jpeg => ("jpg", "image/jpeg"),
            image::ImageFormat::WebP => ("webp", "image/webp"),
            _ => return Err("Choose a PNG, JPEG, or WebP image".into()),
        };
        let decoded =
            image::load_from_memory_with_format(&bytes, format).map_err(|e| e.to_string())?;
        let image_id = id();
        let file = format!("{image_id}.{extension}");
        fs::write(self.root.join("media").join(&file), bytes).map_err(|e| e.to_string())?;
        Ok(ImageRecord {
            id: image_id,
            file,
            width: decoded.width(),
            height: decoded.height(),
            mime: mime.into(),
        })
    }
    pub fn image_path(&self, image_id: &str) -> Result<PathBuf, String> {
        let workspace = self.read()?;
        let img = workspace
            .images
            .iter()
            .find(|i| i.id == image_id)
            .ok_or("Image not found")?;
        Ok(self.root.join("media").join(&img.file))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn upgrade_keeps_old_workspace_and_original_media_with_recoverable_backup() {
        use std::io::Read;
        let root = std::env::temp_dir().join(format!("imagegen-upgrade-{}", id()));
        fs::create_dir_all(root.join("media")).unwrap();
        let old = serde_json::json!({"organisations":[{"id":"o","name":"Courtyard","color":"purple"}],"projects":[],"documents":[],"assets":[],"images":[{"id":"original","file":"original.png","width":1,"height":1,"mime":"image/png"}],"handoffs":{"request":"document"}}).to_string();
        let bytes = b"immutable original image bytes";
        fs::write(root.join("media/original.png"), bytes).unwrap();
        let db = Connection::open(root.join("workspace.sqlite3")).unwrap();
        db.execute_batch("CREATE TABLE workspace (id INTEGER PRIMARY KEY, data TEXT NOT NULL)")
            .unwrap();
        db.execute("INSERT INTO workspace VALUES (1, ?1)", [&old])
            .unwrap();
        drop(db);
        let store = Store::open(root.clone()).unwrap();
        assert!(store.read().unwrap().custom_sizes.is_empty());
        store
            .change(|w| {
                w.custom_sizes.push(CustomSize {
                    id: "size".into(),
                    width: 8.5,
                    height: 11.,
                    unit: "in".into(),
                });
                Ok(())
            })
            .unwrap();
        let mut archive = zip::ZipArchive::new(
            fs::File::open(root.join(format!("before-v{}.zip", env!("CARGO_PKG_VERSION"))))
                .unwrap(),
        )
        .unwrap();
        let mut saved = String::new();
        archive
            .by_name("workspace.json")
            .unwrap()
            .read_to_string(&mut saved)
            .unwrap();
        assert_eq!(saved, old);
        let mut saved_image = Vec::new();
        archive
            .by_name("media/original.png")
            .unwrap()
            .read_to_end(&mut saved_image)
            .unwrap();
        assert_eq!(saved_image, bytes);
        drop(archive);
        drop(store);
        let reopened = Store::open(root.clone()).unwrap();
        let w = reopened.read().unwrap();
        assert_eq!(w.organisations[0].name, "Courtyard");
        assert_eq!(w.handoffs["request"], "document");
        assert_eq!(w.custom_sizes[0].width, 8.5);
        assert_eq!(fs::read(root.join("media/original.png")).unwrap(), bytes);
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_update_is_atomic_and_reopen_preserves_work() {
        let root = std::env::temp_dir().join(format!("imagegen-test-{}", id()));
        {
            let s = Store::open(root.clone()).unwrap();
            s.change(|w| {
                w.organisations.push(Organisation {
                    position: None,
                    deleted_at: None,
                    trashed_items: vec![],
                    id: "o".into(),
                    name: "Courtyard".into(),
                    color: "amber".into(),
                });
                Ok(())
            })
            .unwrap();
            let failed: Result<(), String> = s.change(|w| {
                w.organisations.clear();
                Err("abort".into())
            });
            assert!(failed.is_err());
            assert_eq!(s.read().unwrap().organisations.len(), 1);
        }
        let s = Store::open(root.clone()).unwrap();
        assert_eq!(s.read().unwrap().organisations[0].name, "Courtyard");
        drop(s);
        std::fs::remove_dir_all(root).unwrap();
    }
}
