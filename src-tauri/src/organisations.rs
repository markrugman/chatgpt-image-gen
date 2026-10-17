use crate::model::*;
use serde_json::{Value, json};
use std::collections::HashSet;

pub fn owns(w: &Workspace, org: &str, item: &str) -> bool {
    w.projects
        .iter()
        .any(|p| p.id == item && p.organisation_id == org)
        || w.documents.iter().any(|d| {
            d.id == item
                && w.projects
                    .iter()
                    .any(|p| p.id == d.project_id && p.organisation_id == org)
        })
        || w.templates.iter().any(|t| t.id == item && t.organisation_id.as_deref() == Some(org))
        || w.assets
            .iter()
            .any(|a| a.id == item && a.organisation_id.as_deref() == Some(org))
}

pub fn can_restore(w: &Workspace, item: &str) -> Result<(), String> {
    if w.organisations
        .iter()
        .any(|o| o.deleted_at.is_some() && owns(w, &o.id, item))
    {
        return Err("Restore this item's organisation first".into());
    }
    Ok(())
}

pub fn reorder(w: &mut Workspace, action: &Value) -> Result<Value, String> {
    let ids: Vec<String> =
        serde_json::from_value(action["ids"].clone()).map_err(|_| "Invalid organisation order")?;
    let active: HashSet<_> = w
        .organisations
        .iter()
        .filter(|o| o.deleted_at.is_none())
        .map(|o| o.id.clone())
        .collect();
    if ids.len() != active.len()
        || ids.iter().collect::<HashSet<_>>().len() != ids.len()
        || ids.iter().any(|id| !active.contains(id))
    {
        return Err("Organisations changed. Refresh and retry.".into());
    }
    for (position, id) in ids.iter().enumerate() {
        w.organisations
            .iter_mut()
            .find(|o| &o.id == id)
            .unwrap()
            .position = Some(position as u64);
    }
    Ok(Value::Null)
}

pub fn trash(w: &mut Workspace, id: &str, deleting: bool) -> Result<Value, String> {
    let index = w
        .organisations
        .iter()
        .position(|o| o.id == id)
        .ok_or("Organisation not found")?;
    if deleting == w.organisations[index].deleted_at.is_some() {
        return Ok(Value::Null);
    }
    let project_ids: HashSet<_> = w
        .projects
        .iter()
        .filter(|p| p.organisation_id == id)
        .map(|p| p.id.clone())
        .collect();
    let mut items = w.organisations[index].trashed_items.clone();
    let deleted = if deleting { Some(now()) } else { None };
    // Record exact membership so restoring never revives previously trashed work.
    for (item, timestamp) in w
        .projects
        .iter_mut()
        .filter(|p| project_ids.contains(&p.id))
        .map(|p| (&p.id, &mut p.deleted_at))
        .chain(
            w.documents
                .iter_mut()
                .filter(|d| project_ids.contains(&d.project_id))
                .map(|d| (&d.id, &mut d.deleted_at)),
        )
        .chain(
            w.assets
                .iter_mut()
                .filter(|a| a.organisation_id.as_deref() == Some(id))
                .map(|a| (&a.id, &mut a.deleted_at)),
        )
        .chain(w.templates.iter_mut().filter(|t| t.organisation_id.as_deref() == Some(id)).map(|t| (&t.id, &mut t.deleted_at)))
    {
        if deleting && timestamp.is_none() {
            items.push(item.clone());
            *timestamp = deleted;
        } else if !deleting && items.contains(item) {
            *timestamp = None;
        }
    }
    w.organisations[index].deleted_at = deleted;
    w.organisations[index].trashed_items = if deleting { items } else { vec![] };
    Ok(json!(null))
}

// Shared libraries have no owning organisation.
pub fn require_active(w: &Workspace, id: Option<&str>) -> Result<(), String> {
    if id.is_some_and(|id| {
        !w.organisations
            .iter()
            .any(|o| o.id == id && o.deleted_at.is_none())
    }) {
        return Err("Organisation not found or in Trash".into());
    }
    Ok(())
}

pub fn validate(w: &Workspace) -> Result<(), String> {
    for org in w.organisations.iter().filter(|o| o.deleted_at.is_some()) {
        if w.projects
            .iter()
            .any(|p| p.organisation_id == org.id && p.deleted_at.is_none())
            || w.documents
                .iter()
                .any(|d| d.deleted_at.is_none() && owns(w, &org.id, &d.id))
            || w.templates.iter().any(|t| t.organisation_id.as_deref() == Some(org.id.as_str()) && t.deleted_at.is_none())
            || w.assets.iter().any(|a| {
                a.organisation_id.as_deref() == Some(org.id.as_str()) && a.deleted_at.is_none()
            })
        {
            return Err("Organisation contents changed. Refresh and retry.".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace() -> Workspace {
        let mut w: Workspace = serde_json::from_value(json!({
            "organisations": [{"id":"a","name":"A","color":"#7654cf"},{"id":"b","name":"B","color":"#7654cf"}],
            "projects": [{"id":"p","name":"Project","organisationId":"a","tags":[],"deletedAt":null}],
            "documents": [], "assets": [], "images": []
        })).unwrap();
        w.add_document(
            "p".into(),
            "Design".into(),
            210.,
            297.,
            "mm".into(),
            None,
            None,
        )
        .unwrap();
        for (id, owner, deleted_at, kind) in [
            ("asset", Some("a"), None, "asset"),
            ("upload", Some("a"), None, "upload"),
            ("old", Some("a"), Some(1), "asset"),
            ("shared", None, None, "asset"),
            ("other", Some("b"), None, "asset"),
        ] {
            w.assets.push(Asset {
                modified_at: 0,
                id: id.into(),
                name: id.into(),
                organisation_id: owner.map(String::from),
                library_kind: kind.into(),
                description_json: None,
                source_references: vec![],
                tags: vec![],
                versions: vec![],
                current_version_id: None,
                page: Page::new("Asset"),
                deleted_at,
            });
        }
        w
    }

    #[test]
    fn trash_roundtrip_preserves_old_trash_and_other_libraries() {
        let mut w = workspace();
        let original = serde_json::to_value(&w).unwrap();
        trash(&mut w, "a", true).unwrap();
        assert!(w.projects[0].deleted_at.is_some());
        assert!(w.documents[0].deleted_at.is_some());
        assert!(w.assets[0].deleted_at.is_some());
        assert!(w.assets[1].deleted_at.is_some());
        assert_eq!(w.assets[2].deleted_at, Some(1));
        assert!(w.assets[3].deleted_at.is_none());
        assert!(w.assets[4].deleted_at.is_none());
        assert!(can_restore(&w, "asset").is_err());
        assert!(require_active(&w, Some("a")).is_err());
        trash(&mut w, "a", true).unwrap();
        // Exact restore membership survives a saved-workspace round trip.
        let mut w: Workspace = serde_json::from_value(serde_json::to_value(w).unwrap()).unwrap();
        trash(&mut w, "a", false).unwrap();
        assert_eq!(serde_json::to_value(w).unwrap(), original);
    }

    #[test]
    fn reorder_persists_positions_and_rejects_stale_or_duplicate_lists() {
        let mut w = workspace();
        reorder(&mut w, &json!({"ids":["b","a"]})).unwrap();
        assert_eq!(w.organisations[0].position, Some(1));
        assert_eq!(w.organisations[1].position, Some(0));
        assert!(reorder(&mut w, &json!({"ids":["a","a"]})).is_err());
        assert!(reorder(&mut w, &json!({"ids":["a"]})).is_err());
        trash(&mut w, "a", true).unwrap();
        reorder(&mut w, &json!({"ids":["b"]})).unwrap();
        // Concurrent additions into a trashed organisation cannot merge silently.
        w.assets[0].deleted_at = None;
        assert!(validate(&w).is_err());
    }
}
