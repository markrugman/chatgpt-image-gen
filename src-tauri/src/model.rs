use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    #[serde(default)]
    pub format_version: u32,
    pub organisations: Vec<Organisation>,
    pub projects: Vec<Project>,
    pub documents: Vec<Document>,
    pub assets: Vec<Asset>,
    pub images: Vec<ImageRecord>,
    #[serde(default)]
    pub custom_sizes: Vec<CustomSize>,
    #[serde(default)]
    pub handoffs: std::collections::HashMap<String, String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomSize {
    pub id: String,
    pub width: f64,
    pub height: f64,
    pub unit: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Organisation {
    pub id: String,
    pub name: String,
    pub color: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub organisation_id: String,
    pub name: String,
    pub tags: Vec<String>,
    pub deleted_at: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub unit: String,
    pub pages: Vec<Page>,
    pub tags: Vec<String>,
    pub updated_at: u64,
    pub deleted_at: Option<u64>,
    pub source_document_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: String,
    pub name: String,
    pub messages: Vec<Message>,
    pub revisions: Vec<Revision>,
    pub history: Vec<Composition>,
    pub history_index: usize,
    pub thread_id: Option<String>,
    pub branch_turn_id: Option<String>,
}
impl Page {
    pub fn new(name: &str) -> Self {
        Self {
            id: id(),
            name: name.into(),
            messages: vec![],
            revisions: vec![],
            history: vec![Composition {
                image_id: None,
                overlays: vec![],
                revision_id: None,
                framing: None,
            }],
            history_index: 0,
            thread_id: None,
            branch_turn_id: None,
        }
    }
    pub fn composition(&self) -> &Composition {
        &self.history[self.history_index]
    }
    pub fn push(&mut self, state: Composition) {
        self.history.truncate(self.history_index + 1);
        self.history.push(state);
        self.history_index = self.history.len() - 1;
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub role: String,
    pub text: String,
    pub mode: String,
    pub created_at: u64,
    pub references: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub id: String,
    pub image_id: String,
    pub prompt: String,
    pub created_at: u64,
    pub thread_id: String,
    pub turn_id: String,
    pub messages: Vec<Message>,
    pub overlays: Vec<Overlay>,
    pub parent_revision_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Composition {
    pub image_id: Option<String>,
    pub overlays: Vec<Overlay>,
    pub revision_id: Option<String>,
    #[serde(default)]
    pub framing: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Overlay {
    pub id: String,
    pub asset_version_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
}
pub fn default_library_kind() -> String { "asset".into() }
fn is_asset_kind(kind: &String) -> bool { kind == "asset" }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    #[serde(default = "default_library_kind", skip_serializing_if = "is_asset_kind")]
    pub library_kind: String,
    #[serde(default)]
    pub description_json: Option<String>,
    #[serde(default)]
    pub source_references: Vec<String>,
    pub id: String,
    pub name: String,
    pub organisation_id: Option<String>,
    pub tags: Vec<String>,
    pub versions: Vec<AssetVersion>,
    pub current_version_id: Option<String>,
    pub page: Page,
    pub deleted_at: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetVersion {
    pub id: String,
    pub image_id: String,
    pub created_at: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRecord {
    pub id: String,
    pub file: String,
    pub width: u32,
    pub height: u32,
    pub mime: String,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub kind: String,
    pub id: String,
    pub page_id: String,
}
impl Workspace {
    pub fn reference_image(&self, reference: &str) -> Result<&str, String> {
        if let Some(image_id) = reference.strip_prefix("image:") {
            return self
                .images
                .iter()
                .find(|i| i.id == image_id)
                .map(|i| i.id.as_str())
                .ok_or("Reference image not found".into());
        }
        self.version_image(reference)
    }
    pub fn page(&self, target: &Target) -> Result<&Page, String> {
        if target.kind == "asset" {
            return self
                .assets
                .iter()
                .find(|a| a.id == target.id && a.deleted_at.is_none())
                .map(|a| &a.page)
                .ok_or("Asset not found".into());
        }
        self.documents
            .iter()
            .find(|d| d.id == target.id && d.deleted_at.is_none())
            .and_then(|d| d.pages.iter().find(|p| p.id == target.page_id))
            .ok_or("Page not found".into())
    }
    pub fn page_mut(&mut self, target: &Target) -> Result<&mut Page, String> {
        if target.kind == "asset" {
            return self
                .assets
                .iter_mut()
                .find(|a| a.id == target.id && a.deleted_at.is_none())
                .map(|a| &mut a.page)
                .ok_or("Asset not found".into());
        }
        self.documents
            .iter_mut()
            .find(|d| d.id == target.id && d.deleted_at.is_none())
            .and_then(|d| d.pages.iter_mut().find(|p| p.id == target.page_id))
            .ok_or("Page not found".into())
    }
    pub fn version_image(&self, version: &str) -> Result<&str, String> {
        self.assets
            .iter()
            .flat_map(|a| &a.versions)
            .find(|v| v.id == version)
            .map(|v| v.image_id.as_str())
            .ok_or("Asset version not found".into())
    }
    pub fn add_document(
        &mut self,
        project_id: String,
        name: String,
        width: f64,
        height: f64,
        unit: String,
        source_document_id: Option<String>,
        source_image_id: Option<String>,
    ) -> Result<String, String> {
        if !self
            .projects
            .iter()
            .any(|p| p.id == project_id && p.deleted_at.is_none())
        {
            return Err("Choose a project first".into());
        }
        if name.trim().is_empty()
            || !width.is_finite()
            || !height.is_finite()
            || width <= 0.0
            || height <= 0.0
            || width > 20000.0
            || height > 20000.0
            || !["mm", "px", "in"].contains(&unit.as_str())
        {
            return Err("Enter a name and valid dimensions".into());
        }
        let doc_id = id();
        let mut page = Page::new("Page 1");
        page.history[0].image_id = source_image_id;
        self.documents.push(Document {
            id: doc_id.clone(),
            project_id,
            name: name.trim().into(),
            width,
            height,
            unit,
            pages: vec![page],
            tags: vec![],
            updated_at: now(),
            deleted_at: None,
            source_document_id,
        });
        Ok(doc_id)
    }
    pub fn restore_revision(&mut self, target: &Target, revision_id: &str) -> Result<(), String> {
        let page = self.page_mut(target)?;
        let rev = page
            .revisions
            .iter()
            .find(|r| r.id == revision_id)
            .ok_or("Revision not found")?
            .clone();
        page.push(Composition {
            image_id: Some(rev.image_id),
            overlays: rev.overlays,
            revision_id: Some(rev.id),
            framing: None,
        });
        page.thread_id = Some(rev.thread_id);
        page.branch_turn_id = Some(rev.turn_id);
        page.messages = rev.messages;
        self.sync_asset_version(target);
        Ok(())
    }
    pub fn sync_asset_version(&mut self, target: &Target) {
        if target.kind == "asset" {
            if let Some(asset) = self.assets.iter_mut().find(|a| a.id == target.id) {
                let image = asset.page.composition().image_id.as_ref();
                asset.current_version_id = asset
                    .versions
                    .iter()
                    .find(|v| Some(&v.image_id) == image)
                    .map(|v| v.id.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> (Workspace, Target) {
        let mut w = Workspace::default();
        w.projects.push(Project {
            id: "p".into(),
            organisation_id: "o".into(),
            name: "Halloween".into(),
            tags: vec![],
            deleted_at: None,
        });
        let d = w
            .add_document(
                "p".into(),
                "Poster".into(),
                210.,
                297.,
                "mm".into(),
                None,
                None,
            )
            .unwrap();
        let p = w.documents[0].pages[0].id.clone();
        (
            w,
            Target {
                kind: "document".into(),
                id: d,
                page_id: p,
            },
        )
    }
    #[test]
    fn restore_preserves_future_revisions_and_context() {
        let (mut w, t) = sample();
        for n in 1..=3 {
            w.page_mut(&t).unwrap().revisions.push(Revision {
                id: format!("r{n}"),
                image_id: format!("i{n}"),
                prompt: "".into(),
                created_at: 0,
                thread_id: "thread".into(),
                turn_id: format!("turn{n}"),
                messages: vec![],
                overlays: vec![],
                parent_revision_id: None,
            });
        }
        w.restore_revision(&t, "r1").unwrap();
        let p = w.page(&t).unwrap();
        assert_eq!(p.revisions.len(), 3);
        assert_eq!(p.branch_turn_id.as_deref(), Some("turn1"));
        assert_eq!(p.composition().image_id.as_deref(), Some("i1"));
    }
    #[test]
    fn deleted_asset_keeps_exact_version_reachable() {
        let mut w = Workspace::default();
        w.assets.push(Asset {
            library_kind: "asset".into(),
            description_json: None,
            source_references: vec![],
            id: id(),
            name: "Logo".into(),
            organisation_id: None,
            tags: vec![],
            versions: vec![AssetVersion {
                id: "old".into(),
                image_id: "original".into(),
                created_at: 0,
            }],
            current_version_id: None,
            page: Page::new("Asset"),
            deleted_at: Some(now()),
        });
        assert_eq!(w.version_image("old").unwrap(), "original");
    }
    #[test]
    fn rejects_invalid_document_and_separates_page_chats() {
        let (mut w, t) = sample();
        assert!(
            w.add_document(
                "p".into(),
                "Bad".into(),
                f64::NAN,
                1.,
                "px".into(),
                None,
                None
            )
            .is_err()
        );
        w.documents[0].pages.push(Page::new("Page 2"));
        w.page_mut(&t).unwrap().messages.push(Message {
            id: id(),
            role: "user".into(),
            text: "Private page context".into(),
            mode: "discuss".into(),
            created_at: 0,
            references: vec![],
        });
        assert!(w.documents[0].pages[1].messages.is_empty());
    }
}
