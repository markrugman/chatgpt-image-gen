use crate::model::*;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

// Remap local record identities, preserving immutable media and provider history.
fn remap(value: &mut Value, ids: &HashMap<String, String>) {
    match value {
        Value::String(s) => {
            if let Some(new) = ids.get(s) {
                *s = new.clone();
            }
        }
        Value::Array(items) => items.iter_mut().for_each(|v| remap(v, ids)),
        Value::Object(fields) => {
            for (key, v) in fields {
                if ![
                    "text",
                    "prompt",
                    "name",
                    "tags",
                    "descriptionJson",
                    "threadId",
                    "turnId",
                    "branchTurnId",
                ]
                .contains(&key.as_str())
                {
                    remap(v, ids);
                }
            }
        }
        _ => {}
    }
}
fn identities(value: &Value, ids: &mut HashMap<String, String>) {
    match value {
        Value::Array(items) => items.iter().for_each(|v| identities(v, ids)),
        Value::Object(fields) => {
            if let Some(s) = fields.get("id").and_then(Value::as_str) {
                ids.entry(s.into()).or_insert_with(id);
            }
            fields.values().for_each(|v| identities(v, ids));
        }
        _ => {}
    }
}
fn references(value: &Value, refs: &mut HashSet<String>) {
    match value {
        Value::Array(items) => items.iter().for_each(|v| references(v, refs)),
        Value::Object(fields) => {
            for (key, v) in fields {
                if key == "assetVersionId" {
                    if let Some(s) = v.as_str() {
                        refs.insert(s.into());
                    }
                }
                if key == "references" || key == "sourceReferences" {
                    if let Some(items) = v.as_array() {
                        for item in items {
                            if let Some(s) = item.as_str() {
                                refs.insert(s.into());
                            }
                        }
                    }
                }
                references(v, refs);
            }
        }
        _ => {}
    }
}
fn detach(page: &mut Page) {
    page.thread_id = None;
    page.branch_turn_id = None;
}

pub fn change(w: &mut Workspace, action: &Value) -> Result<Value, String> {
    let item_id = action["id"].as_str().ok_or("Choose an item")?;
    let op = action["op"].as_str().unwrap_or("");
    if op == "classify" || op == "save_as_asset" {
        let index = w
            .assets
            .iter()
            .position(|a| a.id == item_id && a.deleted_at.is_none())
            .ok_or("Image not found")?;
        if op == "classify" {
            let kind = action["libraryKind"].as_str().ok_or("Choose a library")?;
            if !["asset", "upload"].contains(&kind) {
                return Err("Unknown library".into());
            }
            w.assets[index].library_kind = kind.into();
            return Ok(json!(item_id));
        }
        let mut copy = serde_json::to_value(&w.assets[index]).map_err(|e| e.to_string())?;
        let mut ids = HashMap::new();
        identities(&copy, &mut ids);
        remap(&mut copy, &ids);
        let mut copy: Asset = serde_json::from_value(copy).map_err(|e| e.to_string())?;
        detach(&mut copy.page);
        copy.library_kind = "asset".into();
        let result = copy.id.clone();
        w.assets.push(copy);
        return Ok(json!(result));
    }
    let org = action["organisationId"]
        .as_str()
        .ok_or("Choose a destination organisation")?;
    if !w.organisations.iter().any(|o| o.id == org && o.deleted_at.is_none()) {
        return Err("Organisation not found".into());
    }
    let moving = action["mode"] == "move";
    if !moving && action["mode"] != "copy" {
        return Err("Choose copy or move".into());
    }
    if action["kind"] == "asset" {
        let index = w
            .assets
            .iter()
            .position(|a| a.id == item_id && a.deleted_at.is_none())
            .ok_or("Image not found")?;
        if w.assets[index].organisation_id.as_deref() == Some(org) {
            return Err("Choose a different organisation".into());
        }
        if moving {
            w.assets[index].organisation_id = Some(org.into());
            return Ok(json!(item_id));
        }
        let mut value = serde_json::to_value(&w.assets[index]).map_err(|e| e.to_string())?;
        let mut ids = HashMap::new();
        identities(&value, &mut ids);
        remap(&mut value, &ids);
        let mut copy: Asset = serde_json::from_value(value).map_err(|e| e.to_string())?;
        copy.organisation_id = Some(org.into());
        detach(&mut copy.page);
        let result = copy.id.clone();
        w.assets.push(copy);
        return Ok(json!(result));
    }
    if action["kind"] != "document" {
        return Err("Unsupported item".into());
    }
    let index = w
        .documents
        .iter()
        .position(|d| d.id == item_id && d.deleted_at.is_none())
        .ok_or("Design not found")?;
    let mut doc = w.documents[index].clone();
    if w.projects
        .iter()
        .any(|p| p.id == doc.project_id && p.organisation_id == org)
    {
        return Err("Choose a different organisation".into());
    }
    let project_id = if let Some(project) = action["projectId"].as_str().filter(|s| !s.is_empty()) {
        if !w
            .projects
            .iter()
            .any(|p| p.id == project && p.organisation_id == org && p.deleted_at.is_none())
        {
            return Err("Destination project not found".into());
        }
        project.to_string()
    } else {
        let name = action["projectName"].as_str().unwrap_or("").trim();
        if name.is_empty() {
            return Err("Enter a destination project name".into());
        }
        let project = Project {
            id: id(),
            organisation_id: org.into(),
            name: name.into(),
            tags: vec![],
            deleted_at: None,
        };
        let result = project.id.clone();
        w.projects.push(project);
        result
    };
    let mut refs = HashSet::new();
    references(&serde_json::to_value(&doc).unwrap(), &mut refs);
    // Include transitive library references so copied artwork can still be refined.
    let mut copies = Vec::new();
    loop {
        let next: Vec<_> = w
            .assets
            .iter()
            .filter(|a| {
                !copies.iter().any(|c: &Asset| c.id == a.id)
                    && a.versions.iter().any(|v| refs.contains(&v.id))
            })
            .cloned()
            .collect();
        if next.is_empty() {
            break;
        }
        for asset in next {
            refs.extend(asset.source_references.iter().cloned());
            copies.push(asset);
        }
    }
    let mut ids = HashMap::new();
    for asset in &copies {
        identities(&serde_json::to_value(asset).unwrap(), &mut ids);
    }
    if !moving {
        identities(&serde_json::to_value(&doc).unwrap(), &mut ids);
    }
    for mut asset in copies {
        asset.versions.retain(|v| refs.contains(&v.id));
        if !asset
            .versions
            .iter()
            .any(|v| Some(&v.id) == asset.current_version_id.as_ref())
        {
            asset.current_version_id = asset.versions.last().map(|v| v.id.clone());
        }
        asset.page = Page::new("Asset");
        asset.page.history[0].image_id = asset
            .versions
            .iter()
            .find(|v| Some(&v.id) == asset.current_version_id.as_ref())
            .map(|v| v.image_id.clone());
        let mut value = serde_json::to_value(asset).unwrap();
        remap(&mut value, &ids);
        let mut copy: Asset = serde_json::from_value(value).map_err(|e| e.to_string())?;
        copy.organisation_id = Some(org.into());
        copy.deleted_at = None;
        detach(&mut copy.page);
        w.assets.push(copy);
    }
    let mut value = serde_json::to_value(&doc).unwrap();
    remap(&mut value, &ids);
    doc = serde_json::from_value(value).map_err(|e| e.to_string())?;
    doc.project_id = project_id;
    doc.updated_at = now();
    // Force transcript recovery rather than continuing a source provider session
    // whose context may still contain the old library version identities.
    for page in &mut doc.pages {
        detach(page);
    }
    let result = doc.id.clone();
    if moving {
        w.documents[index] = doc;
    } else {
        w.documents.push(doc);
    }
    Ok(json!(result))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Workspace {
        let mut w = Workspace::default();
        for org in ["source", "destination"] {
            w.organisations.push(Organisation {
                position: None,
                deleted_at: None,
                trashed_items: vec![],
                id: org.into(),
                name: org.into(),
                color: "#7654cf".into(),
            });
            w.projects.push(Project {
                id: format!("{org}-project"),
                organisation_id: org.into(),
                name: org.into(),
                tags: vec![],
                deleted_at: None,
            });
        }
        let asset: Asset = serde_json::from_value(json!({
            "id":"logo", "name":"Logo", "organisationId":"source", "tags":["brand","logo","v1"],
            "versions":[{"id":"v1","imageId":"original","createdAt":1},{"id":"v2","imageId":"newer","createdAt":2}],
            "currentVersionId":"v2", "page":Page::new("Logo"), "deletedAt":null
        })).unwrap();
        w.assets.push(asset);
        let mut unused = w.assets[0].clone();
        unused.id = "unused".into();
        unused.versions.clear();
        w.assets.push(unused);
        let document = w
            .add_document(
                "source-project".into(),
                "Poster".into(),
                1080.,
                1080.,
                "px".into(),
                None,
                Some("original".into()),
            )
            .unwrap();
        let doc = w.documents.iter_mut().find(|d| d.id == document).unwrap();
        let page = &mut doc.pages[0];
        page.messages.push(Message {
            template_request: None, reference_purposes: vec![],
            id: "message".into(),
            role: "user".into(),
            text: "Logo".into(),
            mode: "generate".into(),
            created_at: 1,
            references: vec!["v1".into()],
        });
        page.thread_id = Some("source-thread".into());
        page.history[0].overlays.push(Overlay {
            id: "overlay".into(),
            asset_version_id: "v1".into(),
            x: 1.,
            y: 2.,
            width: 10.,
            height: 20.,
            rotation: 0.,
        });
        page.revisions.push(Revision {
            id: "revision".into(),
            image_id: "original".into(),
            prompt: "keep logo".into(),
            created_at: 1,
            thread_id: "thread".into(),
            turn_id: "turn".into(),
            messages: page.messages.clone(),
            overlays: page.history[0].overlays.clone(),
            parent_revision_id: None,
        });
        page.history[0].revision_id = Some("revision".into());
        doc.pages.push(Page::new("Page 2"));
        w
    }
    fn transfer(w: &Workspace, mode: &str) -> Value {
        json!({"op":"transfer","kind":"document","id":w.documents[0].id,"mode":mode,"organisationId":"destination","projectId":"destination-project"})
    }
    #[test]
    fn copies_history_and_only_used_library_versions_with_independent_identities() {
        let mut w = fixture();
        let before = serde_json::to_value(&w).unwrap();
        let request = transfer(&w, "copy");
        change(&mut w, &request).unwrap();
        assert_eq!(
            serde_json::to_value(&w.documents[0]).unwrap(),
            before["documents"][0]
        );
        assert_eq!(
            serde_json::to_value(&w.assets[..2]).unwrap(),
            before["assets"]
        );
        assert_eq!(w.assets.len(), 3);
        let copy = &w.assets[2];
        assert_eq!(copy.versions.len(), 1);
        assert_eq!(copy.versions[0].image_id, "original");
        assert_ne!(copy.id, "logo");
        assert_ne!(copy.versions[0].id, "v1");
        assert_eq!(copy.organisation_id.as_deref(), Some("destination"));
        assert_eq!(copy.tags, w.assets[0].tags);
        let doc = &w.documents[1];
        assert_ne!(doc.id, w.documents[0].id);
        assert_eq!(doc.pages.len(), 2);
        let page = &doc.pages[0];
        assert_ne!(page.id, w.documents[0].pages[0].id);
        assert_eq!(
            page.messages[0].references,
            vec![copy.versions[0].id.clone()]
        );
        assert_eq!(
            page.history[0].overlays[0].asset_version_id,
            copy.versions[0].id
        );
        assert_eq!(
            page.revisions[0].messages[0].references,
            page.messages[0].references
        );
        assert_eq!(
            page.history[0].revision_id.as_ref(),
            Some(&page.revisions[0].id)
        );
        assert!(page.thread_id.is_none());
        assert_eq!(page.messages[0].text, "Logo");
    }
    #[test]
    fn moves_design_without_removing_source_library_or_changing_other_designs() {
        let mut w = fixture();
        let original_id = w.documents[0].id.clone();
        let mut other = w.documents[0].clone();
        other.id = "other".into();
        w.documents.push(other);
        let request = transfer(&w, "move");
        change(&mut w, &request).unwrap();
        assert_eq!(w.documents.len(), 2);
        assert_eq!(w.documents[0].id, original_id);
        assert_eq!(w.documents[0].project_id, "destination-project");
        assert_eq!(w.documents[1].pages[0].messages[0].references[0], "v1");
        assert_eq!(w.assets[0].organisation_id.as_deref(), Some("source"));
        assert_eq!(w.version_image("v1").unwrap(), "original");
    }
    #[test]
    fn upload_copy_save_as_asset_and_move_preserve_original_versions() {
        let mut w = fixture();
        w.assets[0].library_kind = "upload".into();
        change(&mut w, &json!({"op":"save_as_asset","id":"logo"})).unwrap();
        assert_eq!(w.assets[0].library_kind, "upload");
        assert_eq!(w.assets[2].library_kind, "asset");
        assert_ne!(w.assets[0].versions[0].id, w.assets[2].versions[0].id);
        change(&mut w, &json!({"op":"transfer","id":"logo","kind":"asset","mode":"move","organisationId":"destination"})).unwrap();
        assert_eq!(w.assets[0].organisation_id.as_deref(), Some("destination"));
        assert_eq!(w.assets[0].library_kind, "upload");
        assert_eq!(w.version_image("v1").unwrap(), "original");
    }
    #[test]
    fn legacy_assets_default_without_reclassifying_and_roundtrip_uploads() {
        let mut w = fixture();
        assert_eq!(w.assets[0].library_kind, "asset");
        assert!(
            serde_json::to_value(&w.assets[0])
                .unwrap()
                .get("libraryKind")
                .is_none()
        );
        change(
            &mut w,
            &json!({"op":"classify","id":"logo","libraryKind":"upload"}),
        )
        .unwrap();
        let reopened: Workspace =
            serde_json::from_value(serde_json::to_value(&w).unwrap()).unwrap();
        assert_eq!(reopened.assets[0].library_kind, "upload");
        assert_eq!(reopened.version_image("v1").unwrap(), "original");
    }
    #[test]
    fn rejects_invalid_destinations_and_can_create_destination_project() {
        let mut w = fixture();
        let mut request = transfer(&w, "copy");
        request["projectId"] = json!("source-project");
        assert!(change(&mut w, &request).is_err());
        request["projectId"] = Value::Null;
        request["projectName"] = json!("New campaign");
        change(&mut w, &request).unwrap();
        assert_eq!(w.projects.last().unwrap().name, "New campaign");
        assert_eq!(
            w.documents.last().unwrap().project_id,
            w.projects.last().unwrap().id
        );
    }
}
