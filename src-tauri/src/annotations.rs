use crate::{AppState, jobs, model::*, runtime::{AppHandle, Emitter, State}};
use serde_json::json;
use std::sync::Arc;

#[derive(Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationExtras {
    #[serde(default)]
    pub instructions: String,
    #[serde(default)]
    pub references: Vec<String>,
    #[serde(default)]
    pub reference_purposes: Vec<ReferencePurpose>,
}

pub fn source<'a>(w: &'a Workspace, p: &Page, key: &str) -> Result<(&'a ImageRecord, String), String> {
    let (image_id, name) = if key == "background" {
        (p.composition().image_id.as_deref().ok_or("Generate or import a background first")?, "Background".into())
    } else {
        let o = p.composition().overlays.iter().find(|o| o.id == key).ok_or("Layer no longer exists; review its notes")?;
        if o.locked { return Err("Unlock this layer before annotating its content".into()); }
        let a = w.assets.iter().find(|a| a.versions.iter().any(|v| v.id == o.asset_version_id)).ok_or("Layer source is missing")?;
        (w.version_image(&o.asset_version_id)?, a.name.clone())
    };
    Ok((w.images.iter().find(|i| i.id == image_id).ok_or("Source image is missing")?, name))
}

pub fn validate_notes(w: &Workspace, target: &Target, notes: &[RegionNote]) -> Result<(), String> {
    if notes.len() > 50 { return Err("Use at most 50 region instructions per page".into()); }
    w.page(target)?;
    let mut ids = std::collections::HashSet::new();
    if notes.iter().any(|n| notes.first().is_some_and(|first| n.target_key != first.target_key)) {
        return Err("Pending region edits can target only one item. Remove the current edits before choosing another item.".into());
    }
    for n in notes {
        if n.id.is_empty() || !ids.insert(&n.id) || n.text.len() > 6000 || n.text.trim().is_empty()
            || ![n.x,n.y,n.width,n.height].iter().all(|v| v.is_finite())
            || n.x < 0. || n.y < 0. || n.width <= 0. || n.height <= 0.
            || n.x + n.width > 1.000001 || n.y + n.height > 1.000001 {
            return Err("Enter a valid region and instruction".into());
        }
        // Stale or locked notes may remain saved; generation requires explicit source review.
        if !w.images.iter().any(|i| i.id == n.source_image_id) { return Err("Annotation source is missing".into()); }
    }
    Ok(())
}

pub fn prepare(w: &Workspace, target: &Target) -> Result<EditBatch, String> {
    if target.kind != "document" { return Err("Annotate the background or placed layers of a design".into()); }
    let p = w.page(target)?;
    validate_notes(w, target, &p.region_notes)?;
    let mut items: Vec<EditItem> = vec![];
    for n in p.region_notes.iter().filter(|n| n.enabled) {
        let (image, name) = source(w, p, &n.target_key)?;
        if image.id != n.source_image_id { return Err("A source image changed. Review and confirm its notes before generating.".into()); }
        if let Some(item) = items.iter_mut().find(|i| i.key == n.target_key) { item.notes.push(n.clone()); }
        else { items.push(EditItem { key: n.target_key.clone(), name, source_image_id: image.id.clone(), notes: vec![n.clone()], candidate: None, error: None, thread_id: None, turn_id: None }); }
    }
    if items.is_empty() { return Err("Add or enable an instruction first".into()); }
    Ok(EditBatch { instructions: String::new(), references: vec![], reference_purposes: vec![], id: id(), source: p.composition().clone(), history_index: p.history_index, items, created_at: now() })
}

pub fn same_source(p: &Page, batch: &EditBatch) -> bool {
    p.history_index == batch.history_index && json!(p.composition()) == json!(batch.source)
}

pub fn prompt(item: &EditItem) -> String {
    let notes: Vec<_> = item.notes.iter().enumerate().map(|(i,n)| json!({"number":i+1,"area":{"left":n.x,"top":n.y,"width":n.width,"height":n.height},"instruction":n.text})).collect();
    format!("Edit the attached ORIGINAL image using all the region instructions below. Return exactly one full edited image, preserving its original aspect ratio, framing, subject alignment and transparency (including a transparent background if present). Coordinates are fractions of the original image from its top-left. Rectangles identify intended objects/areas, NOT hard masks: if most of a phone screen is selected and the instruction says change its background, change the WHOLE intended screen background. Interpret the user's intent intelligently. Preserve unrelated content. Do not include annotation boxes, numbers or notes in the output. Never crop to a selection or flatten other layers into this image. Instructions are applied together; overlapping regions do not imply last-instruction-wins.\n{}", json!(notes))
}

pub fn apply(w: &mut Workspace, target: &Target, batch_id: &str) -> Result<(), String> {
    let p = w.page(target)?;
    let b = p.edit_batch.clone().filter(|b| b.id == batch_id).ok_or("Edit batch changed; refresh before applying")?;
    if !same_source(p, &b) { return Err("The source design changed. Discard these results and review the latest design.".into()); }
    if b.items.iter().any(|i| i.candidate.is_none() || i.error.is_some()) { return Err("Generate successful results for every target before applying".into()); }
    let organisation = w.documents.iter().find(|d| d.id == target.id).and_then(|d| w.projects.iter().find(|p| p.id == d.project_id)).map(|p| p.organisation_id.clone()).ok_or("Design organisation is missing")?;
    let mut next = b.source.clone();
    let mut references = b.references.clone();
    for item in &b.items {
        let result = item.candidate.as_ref().unwrap();
        let original = w.images.iter().find(|i| i.id == item.source_image_id).ok_or("Source image missing")?;
        let image = w.images.iter().find(|i| &i.id == result).ok_or("Candidate image missing")?;
        if (image.width as f64 / image.height as f64 / (original.width as f64 / original.height as f64) - 1.).abs() > 0.02 {
            return Err(format!("{} changed aspect ratio. Retry it to preserve the original framing.", item.name));
        }
        references.push(format!("image:{}", item.source_image_id));
        if item.key == "background" { next.image_id = Some(result.clone()); }
        else {
            let overlay = next.overlays.iter_mut().find(|o| o.id == item.key).ok_or("Layer missing")?;
            if overlay.locked { return Err("Unlock the layer before applying changes".into()); }
            let version_id = id();
            let mut page = Page::new("Asset");
            page.history[0].image_id = Some(result.clone());
            w.assets.push(Asset { modified_at: 0, library_kind: "asset".into(), description_json: None, source_references: vec![format!("image:{}", item.source_image_id)], id: id(), name: format!("{} — edited", item.name), organisation_id: Some(organisation.clone()), tags: vec![], versions: vec![AssetVersion { id: version_id.clone(), image_id: result.clone(), created_at: now() }], current_version_id: Some(version_id.clone()), page, deleted_at: None });
            overlay.asset_version_id = version_id;
        }
    }
    let p = w.page_mut(target)?;
    let notes: Vec<_> = b.items.iter().flat_map(|i| i.notes.clone()).collect();
    let text = notes.iter().enumerate().map(|(i,n)| format!("{}. {}", i+1,n.text)).collect::<Vec<_>>().join("\n");
    p.messages.push(Message { template_request: None, reference_purposes: b.reference_purposes.clone(), id: id(), role: "user".into(), text: format!("Edit {}\n{text}\n\n{}", b.items.iter().map(|i| i.name.clone()).collect::<Vec<_>>().join(", "), b.instructions).trim().into(), mode: "generate".into(), created_at: now(), references });
    let revision_id = id();
    // A new page revision also captures layer-only edits, preserving their conversation on undo.
    let image_id = next.image_id.clone().or_else(|| b.items.first().and_then(|i| i.candidate.clone())).ok_or("Design image missing")?;
    let background = b.items.iter().find(|i| i.key == "background");
    let thread_id = background.and_then(|i| i.thread_id.clone()).unwrap_or_default();
    let turn_id = background.and_then(|i| i.turn_id.clone()).unwrap_or_default();
    next.revision_id = Some(revision_id.clone());
    p.revisions.push(Revision { region_notes: notes, composition: Some(next.clone()), id: revision_id.clone(), image_id, prompt: "Region edit".into(), created_at: now(), thread_id: thread_id.clone(), turn_id: turn_id.clone(), messages: p.messages.clone(), overlays: next.overlays.clone(), parent_revision_id: b.source.revision_id });
    p.push(next);
    p.thread_id = if thread_id.is_empty() { None } else { Some(thread_id) };
    p.branch_turn_id = if turn_id.is_empty() { None } else { Some(turn_id) };
    p.region_notes.clear();
    p.edit_batch = None;
    if let Some(d) = w.documents.iter_mut().find(|d| d.id == target.id) { d.updated_at = now(); }
    Ok(())
}

#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn generate_annotations(app: AppHandle, state: State<'_, Arc<AppState>>, target: Target, retry_key: Option<String>, request: Option<AnnotationExtras>) -> Result<String, String> {
    let mut jobs = state.jobs.lock().await;
    if jobs.values().any(|j| j.target == target && ["starting","running","cancelling"].contains(&j.status.as_str())) { return Err("A request is already running on this page".into()); }
    let base = state.store.refresh()?;
    let existing = base.page(&target)?.edit_batch.clone();
    let mut batch = match existing {
        Some(b) => { if !same_source(base.page(&target)?, &b) { return Err("Source changed; discard the results and review notes".into()); } b },
        None => prepare(&base, &target)?,
    };
    if batch.items.len() != 1 { return Err("Region edits can target only one item. Discard this older request and keep notes for one item.".into()); }
    if let Some(extras) = request {
        if base.page(&target)?.edit_batch.is_some() { return Err("Discard the current result before changing its instructions or references".into()); }
        if extras.instructions.len() > 20000 || extras.references.len() > 20 { return Err("Use shorter instructions or fewer references".into()); }
        for reference in &extras.references { base.reference_image(reference)?; }
        if extras.reference_purposes.iter().any(|p| !extras.references.contains(&p.reference) || !["Subject","Style","Logo","Other"].contains(&p.purpose.as_str())) { return Err("Invalid edit reference purpose".into()); }
        batch.instructions = extras.instructions;
        batch.references = extras.references;
        batch.reference_purposes = extras.reference_purposes;
    }
    let keys: Vec<_> = batch.items.iter().filter(|i| retry_key.as_ref().map_or(i.candidate.is_none() || i.error.is_some(), |key| key == &i.key)).map(|i| i.key.clone()).collect();
    if keys.is_empty() { return Err("Choose a target to retry".into()); }
    state.store.change_from(Some(&base), |w| { w.page_mut(&target)?.edit_batch = Some(batch.clone()); Ok(()) })?;
    let job = jobs::Job { id: id(), target: target.clone(), status: "starting".into(), message: "Preparing annotated edits…".into(), thread_id: None, turn_id: None, cancel_requested: false, created_at: now() };
    let job_id = job.id.clone(); jobs.insert(job_id.clone(), job.clone()); drop(jobs);
    let state = state.inner().clone();
    let _ = app.emit("workspace-changed", ()); let _ = app.emit("jobs-changed", ());
    crate::runtime::spawn(async move {
        let mut failed = false; let mut cancelled = false;
        for key in keys {
            if state.jobs.lock().await.get(&job.id).is_some_and(|j| j.cancel_requested) { cancelled = true; break; }
            let item = batch.items.iter().find(|i| i.key == key).unwrap();
            let transparent = state.store.image_path(&item.source_image_id).ok().and_then(|p| image::open(p).ok()).is_some_and(|i| i.to_rgba8().pixels().any(|p| p[3] < 255));
            let mut references = vec![format!("image:{}",item.source_image_id)];
            references.extend(batch.references.iter().filter(|r| *r != &references[0]).cloned().collect::<Vec<_>>());
            let request = jobs::Submit { target: target.clone(), template: None, template_answers: Default::default(), reference_purposes: batch.reference_purposes.clone(), template_request: None, expected_instructions: None, prompt: format!("{}\n\nAdditional instructions for this same image:\n{}\nAny other attached images are references only, not additional edit targets.", prompt(item), batch.instructions), mode: "generate".into(), references, transparent, fresh_context: true, annotation: Some((batch.id.clone(),key.clone())) };
            let result = jobs::run(state.clone(), &app, &job.id, &request).await;
            match result { Ok(false) => (), Ok(true) => { cancelled = true; break; }, Err(error) => {
                failed = true;
                let _ = state.store.change(|w| { let b = w.page_mut(&target)?.edit_batch.as_mut().filter(|b| b.id == batch.id).ok_or("Batch missing")?; let item = b.items.iter_mut().find(|i| i.key == key).ok_or("Target missing")?; item.error = Some(error); Ok(()) });
            } }
            let _ = app.emit("workspace-changed", ());
        }
        if let Some(j) = state.jobs.lock().await.get_mut(&job.id) { j.status = if cancelled { "cancelled" } else if failed { "failed" } else { "completed" }.into(); j.message = if cancelled { "Stopped. Your region instructions are saved." } else if failed { "The edit failed. Retry it from the chat." } else { "Ready to compare and apply in the chat." }.into(); }
        let _ = app.emit("jobs-changed", ()); let _ = app.emit("workspace-changed", ());
    });
    Ok(job_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Workspace, Target) {
        let mut w = Workspace::default();
        w.organisations.push(Organisation { id: "org".into(), name: "Organisation".into(), color: "purple".into(), position: None, deleted_at: None, trashed_items: vec![] });
        w.projects.push(Project { created_at: now(), updated_at: now(), id: "project".into(), organisation_id: "org".into(), name: "Project".into(), tags: vec![], deleted_at: None });
        let d = w.add_document("project".into(), "Design".into(), 100., 80., "px".into(), None, Some("base".into())).unwrap();
        let target = Target { kind: "document".into(), id: d, page_id: w.documents[0].pages[0].id.clone() };
        for name in ["base","original","candidate","new-base","wrong-ratio"] {
            w.images.push(ImageRecord { id: name.into(), file: format!("{name}.png"), width: if name == "wrong-ratio" { 200 } else { 100 }, height: 100, mime: "image/png".into() });
        }
        w.assets.push(Asset { modified_at: 0, library_kind: "upload".into(), description_json: None, source_references: vec![], id: "source".into(), name: "Shared upload".into(), organisation_id: None, tags: vec![], versions: vec![AssetVersion { id: "version".into(), image_id: "original".into(), created_at: 0 }], current_version_id: Some("version".into()), page: Page::new("Upload"), deleted_at: None });
        let o = Overlay { id: "one".into(), asset_version_id: "version".into(), x: 10., y: 20., width: 30., height: 40., rotation: 45., locked: false };
        w.page_mut(&target).unwrap().history[0].overlays = vec![o.clone(), Overlay { id: "two".into(), ..o }];
        w.page_mut(&target).unwrap().region_notes = vec![RegionNote { id: "n".into(), target_key: "one".into(), source_image_id: "original".into(), x: 0.05, y: 0.02, width: 0.95, height: 0.95, text: "Change the whole phone background to red".into(), enabled: true }];
        (w,target)
    }
    #[test]
    fn replacement_is_an_independent_asset_and_one_undoable_state() {
        let (mut w,t) = fixture();
        let original = json!(w.assets[0]);
        let before = json!(w.page(&t).unwrap().composition());
        let mut batch = prepare(&w,&t).unwrap(); batch.items[0].candidate = Some("candidate".into());
        let id = batch.id.clone(); w.page_mut(&t).unwrap().edit_batch = Some(batch);
        apply(&mut w,&t,&id).unwrap();
        assert_eq!(json!(w.assets[0]),original);
        assert_eq!(w.assets.len(),2);
        assert_eq!(w.assets[1].library_kind,"asset"); assert_eq!(w.assets[1].organisation_id.as_deref(),Some("org"));
        let p = w.page(&t).unwrap(); assert_eq!(p.history_index,1); assert!(p.edit_batch.is_none());
        let c = p.composition(); assert_eq!(c.image_id.as_deref(),Some("base"));
        assert_eq!(w.version_image(&c.overlays[0].asset_version_id).unwrap(),"candidate");
        assert_eq!(w.version_image(&c.overlays[1].asset_version_id).unwrap(),"original");
        assert_eq!(c.overlays[0].rotation,45.); assert_eq!(c.overlays[0].x,10.);
        assert!(p.messages.last().unwrap().text.contains("Change the whole phone background to red"));
        assert!(!p.messages.last().unwrap().text.contains("NOT hard masks"));
        assert_eq!(p.revisions.last().unwrap().region_notes[0].width,0.95);
        assert_eq!(json!(p.history[0]),before);
        let revision = c.revision_id.clone().unwrap();
        w.restore_revision(&t,&revision).unwrap();
        assert_eq!(w.page(&t).unwrap().composition().overlays[0].asset_version_id,w.assets[1].versions[0].id);
    }
    #[test]
    fn validates_sources_locks_and_semantic_instruction_grouping() {
        let (mut w,t) = fixture();
        let note = w.page(&t).unwrap().region_notes[0].clone();
        w.page_mut(&t).unwrap().region_notes.push(RegionNote { id: "second".into(), text: "Keep the white lettering".into(), ..note.clone() });
        let b = prepare(&w,&t).unwrap(); assert_eq!(b.items.len(),1); assert_eq!(b.items[0].notes.len(),2);
        let prompt = prompt(&b.items[0]); assert!(prompt.contains("WHOLE intended screen")); assert!(prompt.contains("Keep the white lettering"));
        w.page_mut(&t).unwrap().history[0].overlays[0].locked = true; assert!(prepare(&w,&t).err().unwrap().contains("Unlock"));
        w.page_mut(&t).unwrap().history[0].overlays[0].locked = false;
        w.page_mut(&t).unwrap().region_notes[0].source_image_id = "base".into(); assert!(prepare(&w,&t).err().unwrap().contains("source image changed"));
    }
    #[test]
    fn rejects_multiple_edit_targets_even_when_the_second_note_is_disabled() {
        let (mut w,t) = fixture();
        let mut other=w.page(&t).unwrap().region_notes[0].clone();other.id="other".into();other.target_key="background".into();other.source_image_id="base".into();other.enabled=false;
        w.page_mut(&t).unwrap().region_notes.push(other);
        assert!(prepare(&w,&t).err().unwrap().contains("only one item"));
    }
    #[test]
    fn failures_and_source_changes_cannot_apply_or_create_assets() {
        let (mut w,t) = fixture(); let mut b = prepare(&w,&t).unwrap(); let id = b.id.clone();
        w.page_mut(&t).unwrap().edit_batch = Some(b.clone()); assert!(apply(&mut w,&t,&id).is_err()); assert_eq!(w.assets.len(),1);
        b.items[0].candidate = Some("wrong-ratio".into()); w.page_mut(&t).unwrap().edit_batch = Some(b.clone());
        assert!(apply(&mut w,&t,&id).unwrap_err().contains("aspect ratio")); assert_eq!(w.assets.len(),1);
        b.items[0].candidate = Some("candidate".into()); b.items[0].error = Some("Provider failed".into()); w.page_mut(&t).unwrap().edit_batch = Some(b.clone());
        assert!(apply(&mut w,&t,&id).is_err()); b.items[0].error = None;
        w.page_mut(&t).unwrap().edit_batch = Some(b); w.page_mut(&t).unwrap().history[0].image_id = Some("new-base".into());
        assert!(apply(&mut w,&t,&id).unwrap_err().contains("source design changed")); assert_eq!(w.assets.len(),1);
    }
    #[test]
    fn drafts_and_candidates_round_trip_with_legacy_defaults() {
        let (mut w,t) = fixture(); w.page_mut(&t).unwrap().edit_batch = Some(prepare(&w,&t).unwrap());
        let restored: Workspace = serde_json::from_value(json!(w)).unwrap(); assert!(restored.page(&t).unwrap().edit_batch.is_some());
        let mut legacy = json!(Page::new("Legacy")); legacy.as_object_mut().unwrap().remove("regionNotes"); legacy.as_object_mut().unwrap().remove("editBatch");
        let p: Page = serde_json::from_value(legacy).unwrap(); assert!(p.region_notes.is_empty()); assert!(p.edit_batch.is_none());
    }
    #[test]
    fn backup_restores_a_reviewable_batch_and_its_original_and_candidate_media() {
        use base64::Engine;
        let root = std::env::temp_dir().join(format!("imagegen-annotation-backup-{}",id()));
        let state = AppState { store: crate::store::Store::open(root.clone()).unwrap(), jobs_dir: root.join("sessions"), jobs: tokio::sync::Mutex::new(std::collections::HashMap::new()), codex: tokio::sync::Mutex::new(None) };
        let bytes = base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOIqjjxHx9mGBkKAHcjpkGplMQ6AAAAAElFTkSuQmCC").unwrap();
        let (mut w,t) = fixture();
        for image in &mut w.images { image.file = state.store.import_bytes(&bytes).unwrap().file; }
        let mut batch = prepare(&w,&t).unwrap(); let batch_id = batch.id.clone(); batch.items[0].candidate = Some("candidate".into());
        w.page_mut(&t).unwrap().edit_batch = Some(batch);
        state.store.change(|saved| { *saved = w.clone(); Ok(()) }).unwrap();
        let backup = root.join("test.zip"); crate::backup::backup_to(&state,&backup).unwrap();
        state.store.change(|saved| { saved.page_mut(&t)?.edit_batch = None; Ok(()) }).unwrap();
        crate::backup::restore_from(&state,&backup).unwrap();
        let restored = state.store.read().unwrap(); assert_eq!(restored.page(&t).unwrap().edit_batch.as_ref().unwrap().id,batch_id);
        for image in &restored.images { assert_eq!(std::fs::read(state.store.image_path(&image.id).unwrap()).unwrap(),bytes); }
        state.store.change(|saved| apply(saved,&t,&batch_id)).unwrap(); assert_eq!(state.store.read().unwrap().assets.len(),2);
        drop(state); std::fs::remove_dir_all(root).unwrap();
    }
}
