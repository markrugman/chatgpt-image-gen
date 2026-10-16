use image_gen_server::{merge, model, router};
use reqwest::{Client, StatusCode};
use serde_json::{Value, json};
const KEY: &str = "test-only-key-012345678901234567890123456789";

#[test]
fn template_entities_merge_additively_and_stale_edits_cannot_erase_them() {
    let base = empty();
    assert!(base.get("templates").is_none());
    let mut next = base.clone();
    next["templates"] = json!([{"id":"t","name":"Vector","recipe":"Portrait","version":1}]);
    next["templateFolders"] = json!([{"id":"f","name":"Avatars","organisationId":null}]);
    let current = merge(&base, &base, &next).unwrap();
    let mut older_client = base.clone();
    older_client["organisations"] = json!([{"id":"o","name":"Studio","color":"purple"}]);
    let combined = merge(&current, &base, &older_client).unwrap();
    assert_eq!(combined["templates"], next["templates"]);
    assert_eq!(combined["templateFolders"], next["templateFolders"]);
    let mut first = current.clone(); first["templates"][0]["recipe"] = json!("New recipe");
    let mut second = current.clone(); second["templates"][0]["name"] = json!("Rename");
    assert!(merge(&first, &current, &second).is_err());
}
fn empty() -> Value {
    serde_json::to_value(model::Workspace {
        format_version: 3,
        ..Default::default()
    })
    .unwrap()
}
#[test]
fn independent_changes_merge_and_same_record_conflicts() {
    let base = empty();
    let mut first = base.clone();
    first["organisations"] = json!([{"id":"o1","name":"One","color":"red"}]);
    let mut second = base.clone();
    second["organisations"] = json!([{"id":"o2","name":"Two","color":"blue"}]);
    let combined = merge(&first, &base, &second).unwrap();
    assert_eq!(combined["organisations"].as_array().unwrap().len(), 2);
    let mut a = first.clone();
    a["organisations"][0]["name"] = json!("A");
    let mut b = first.clone();
    b["organisations"][0]["name"] = json!("B");
    assert!(merge(&a, &first, &b).is_err());
    let mut h = first.clone();
    h["handoffs"] = json!({"request":"doc"});
    assert_eq!(
        merge(&first, &first, &h).unwrap()["handoffs"],
        h["handoffs"]
    );
}
#[tokio::test]
async fn authenticated_sync_media_conflicts_and_restart() {
    let root = std::env::temp_dir().join(format!("imagegen-server-test-{}", model::id()));
    let listen = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("http://{}", listen.local_addr().unwrap());
    let app = router(root.clone(), "Test server".into(), KEY.into()).unwrap();
    let task = tokio::spawn(async move { axum::serve(listen, app).await.unwrap() });
    let c = Client::new();
    assert_eq!(
        c.get(format!("{address}/v1/workspace"))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let initial: Value = c
        .get(format!("{address}/v1/workspace"))
        .bearer_auth(KEY)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let base = initial["workspace"].clone();
    let image = image::RgbaImage::from_pixel(2, 2, image::Rgba([23, 80, 100, 255]));
    let mut png = std::io::Cursor::new(Vec::new());
    image.write_to(&mut png, image::ImageFormat::Png).unwrap();
    let bytes = png.into_inner();
    assert_eq!(
        c.put(format!("{address}/v1/media/original.png"))
            .bearer_auth(KEY)
            .body(bytes.clone())
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    let bad = c
        .put(format!("{address}/v1/media/original.png"))
        .bearer_auth(KEY)
        .body(b"bad image".to_vec())
        .send()
        .await
        .unwrap();
    assert_eq!(bad.status(), StatusCode::BAD_REQUEST);
    let mut next = base.clone();
    next["organisations"] = json!([{"id":"o","name":"Courtyard","color":"purple"}]);
    next["images"] =
        json!([{"id":"i","file":"original.png","width":2,"height":2,"mime":"image/png"}]);
    let saved: Value = c
        .put(format!("{address}/v1/workspace"))
        .bearer_auth(KEY)
        .json(&json!({"serverId":initial["serverId"],"baseWorkspace":base,"workspace":next,"requireEmpty":true}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(saved["revision"], 1);
    assert_eq!(saved["workspace"], next);
    assert_eq!(
        c.put(format!("{address}/v1/workspace"))
            .bearer_auth(KEY)
            .json(&json!({"serverId":initial["serverId"],"baseWorkspace":base,"workspace":next,"requireEmpty":true}))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );
    let mut browser_base;
    // An actual JS client sends whole-number f64 fields as integer JSON numbers.
    let mut browser_doc = empty();
    browser_doc["organisations"] = next["organisations"].clone();
    let mut typed: model::Workspace = serde_json::from_value(browser_doc).unwrap();
    typed.projects.push(model::Project {
        id: "p".into(),
        organisation_id: "o".into(),
        name: "Project".into(),
        tags: vec![],
        deleted_at: None,
    });
    typed
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
    let mut with_doc = next.clone();
    with_doc["projects"] = serde_json::to_value(&typed.projects).unwrap();
    with_doc["documents"] = serde_json::to_value(&typed.documents).unwrap();
    assert_eq!(
        c.put(format!("{address}/v1/workspace"))
            .bearer_auth(KEY)
            .json(
                &json!({"serverId":initial["serverId"],"baseWorkspace":next,"workspace":with_doc})
            )
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    browser_base = with_doc.clone();
    browser_base["documents"][0]["width"] = json!(210);
    browser_base["documents"][0]["height"] = json!(297);
    let mut browser_next = browser_base.clone();
    browser_next["documents"][0]["name"] = json!("Browser renamed");
    assert_eq!(c.put(format!("{address}/v1/workspace")).bearer_auth(KEY).json(&json!({"serverId":initial["serverId"],"baseWorkspace":browser_base,"workspace":browser_next})).send().await.unwrap().status(),StatusCode::OK);
    // Remove this fixture using its latest state, then resume the conflict checks.
    let latest: Value = c
        .get(format!("{address}/v1/workspace"))
        .bearer_auth(KEY)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(c.put(format!("{address}/v1/workspace")).bearer_auth(KEY).json(&json!({"serverId":initial["serverId"],"baseWorkspace":latest["workspace"],"workspace":next})).send().await.unwrap().status(),StatusCode::OK);
    let mut newer = next.clone();
    newer["organisations"][0]["name"] = json!("New name");
    assert_eq!(
        c.put(format!("{address}/v1/workspace"))
            .bearer_auth(KEY)
            .json(&json!({"serverId":initial["serverId"],"baseWorkspace":next,"workspace":newer}))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    let mut stale = next.clone();
    stale["organisations"][0]["name"] = json!("Stale name");
    assert_eq!(
        c.put(format!("{address}/v1/workspace"))
            .bearer_auth(KEY)
            .json(&json!({"serverId":initial["serverId"],"baseWorkspace":next,"workspace":stale}))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );
    assert_eq!(
        c.get(format!("{address}/v1/media/original.png"))
            .bearer_auth(KEY)
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap()
            .as_ref(),
        bytes.as_slice()
    );
    assert!(!image_gen_server::valid_file("../workspace.sqlite3"));
    assert!(!image_gen_server::valid_file("x\\evil.png"));
    task.abort();
    let _ = task.await;
    let listen = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("http://{}", listen.local_addr().unwrap());
    let app = router(root.clone(), "Restarted".into(), KEY.into()).unwrap();
    let task = tokio::spawn(async move { axum::serve(listen, app).await.unwrap() });
    let restarted: Value = c
        .get(format!("{address}/v1/workspace"))
        .bearer_auth(KEY)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(restarted["serverId"], initial["serverId"]);
    assert_eq!(restarted["workspace"], newer);
    task.abort();
    let _ = task.await;
    std::fs::remove_dir_all(root).unwrap();
}
