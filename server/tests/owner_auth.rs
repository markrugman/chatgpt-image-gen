use image_gen_server::{model, router_with_web, web::Options};
use reqwest::{Client, Response, StatusCode};
use serde_json::{Value, json};
use std::path::Path;
const KEY: &str = "existing-test-key-must-stay-unchanged-0123456789";
async fn start(root: &Path) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let options = Options {
        internal_url: url.clone(),
        worker_dir: root.join("worker"),
        worker_enabled: false,
        static_dir: root.join("static"),
    };
    let app = router_with_web(
        root.to_path_buf(),
        "Preserved workspace".into(),
        KEY.into(),
        options,
    )
    .unwrap();
    (
        url,
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() }),
    )
}
async fn post(
    client: &Client,
    url: &str,
    path: &str,
    cookie: Option<&str>,
    body: Value,
) -> Response {
    let mut request = client
        .post(format!("{url}/{path}"))
        .header("X-Imagegen-Request", "1")
        .json(&body);
    if let Some(cookie) = cookie {
        request = request.header("Cookie", cookie);
    }
    request.send().await.unwrap()
}
fn cookie(response: &Response) -> String {
    response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_string()
}
async fn snapshot(client: &Client, url: &str) -> Value {
    client
        .get(format!("{url}/v1/workspace"))
        .bearer_auth(KEY)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap()
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owner_setup_both_credentials_remember_restart_logout_and_preservation() {
    let root = std::env::temp_dir().join(format!("imagegen-owner-{}", model::id()));
    let (url, task) = start(&root).await;
    let c = Client::new();
    let initial = snapshot(&c, &url).await;
    let mut workspace = initial["workspace"].clone();
    workspace["organisations"] =
        json!([{"id":model::id(),"name":"Existing creations","color":"purple"}]);
    workspace["customSizes"] = json!([{"id":model::id(),"width":8.5,"height":11.0,"unit":"in"}]);
    assert_eq!(c.put(format!("{url}/v1/workspace")).bearer_auth(KEY).json(&json!({"serverId":initial["serverId"],"baseWorkspace":initial["workspace"],"workspace":workspace})).send().await.unwrap().status(),StatusCode::OK);
    let before = snapshot(&c, &url).await;
    assert_eq!(
        post(
            &c,
            &url,
            "web/owner",
            None,
            json!({"username":"owner","password":"a valid long password"})
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    let login = post(
        &c,
        &url,
        "web/login",
        None,
        json!({"accessKey":KEY,"rememberMe":true}),
    )
    .await;
    assert_eq!(login.status(), StatusCode::OK);
    let header = login.headers()["set-cookie"].to_str().unwrap();
    assert!(
        header.contains("HttpOnly")
            && header.contains("SameSite=Strict")
            && header.contains("Max-Age=7776000")
    );
    let remembered = cookie(&login);
    let state: Value = c
        .get(format!("{url}/web/session"))
        .header("Cookie", &remembered)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(state["setupNeeded"], true);
    assert_eq!(state["canSetup"], true);
    assert_eq!(
        post(
            &c,
            &url,
            "web/owner",
            Some(&remembered),
            json!({"username":"owner","password":"too short"})
        )
        .await
        .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        post(
            &c,
            &url,
            "web/owner",
            Some(&remembered),
            json!({"username":"owner","password":"a valid long password"})
        )
        .await
        .status(),
        StatusCode::OK
    );
    assert_eq!(
        post(
            &c,
            &url,
            "web/login",
            None,
            json!({"username":"owner","password":"wrong"})
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    let account = post(
        &c,
        &url,
        "web/login",
        None,
        json!({"username":"OWNER","password":"a valid long password"}),
    )
    .await;
    assert_eq!(account.status(), StatusCode::OK);
    assert!(
        !account.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .contains("Max-Age")
    );
    let account_cookie = cookie(&account);
    assert_eq!(
        post(
            &c,
            &url,
            "web/owner",
            Some(&account_cookie),
            json!({"keyOnly":true})
        )
        .await
        .status(),
        StatusCode::FORBIDDEN
    );
    let native = post(
        &c,
        &url,
        "auth/native",
        None,
        json!({"username":"owner","password":"a valid long password"}),
    )
    .await;
    assert_eq!(native.status(), StatusCode::OK);
    let native: Value = native.json().await.unwrap();
    let token = native["token"].as_str().unwrap();
    assert_ne!(token, KEY);
    assert_eq!(
        c.get(format!("{url}/v1/workspace"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        c.get(format!("{url}/web/session"))
            .header("Cookie", format!("imagegen_session={token}"))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        post(&c, &url, "web/logout", Some(&account_cookie), json!({}))
            .await
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        c.get(format!("{url}/web/session"))
            .header("Cookie", &account_cookie)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(snapshot(&c, &url).await, before);
    drop(c);
    task.abort();
    let _ = task.await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    let (url, task) = start(&root).await;
    let c = Client::new();
    assert_eq!(
        c.get(format!("{url}/web/session"))
            .header("Cookie", &remembered)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(snapshot(&c, &url).await, before);
    assert_eq!(
        post(&c, &url, "web/login", None, json!({"accessKey":KEY}))
            .await
            .status(),
        StatusCode::OK
    );
    drop(c);
    task.abort();
    let _ = task.await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    std::fs::remove_dir_all(root).unwrap();
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dismiss_owner_setup_keeps_key_only_and_data() {
    let root = std::env::temp_dir().join(format!("imagegen-key-only-{}", model::id()));
    let (url, task) = start(&root).await;
    let c = Client::new();
    let before = snapshot(&c, &url).await;
    let login = post(&c, &url, "web/login", None, json!({"accessKey":KEY})).await;
    let id = cookie(&login);
    assert_eq!(
        post(&c, &url, "web/owner", Some(&id), json!({"keyOnly":true}))
            .await
            .status(),
        StatusCode::OK
    );
    let state: Value = c
        .get(format!("{url}/web/session"))
        .header("Cookie", &id)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(state["hasOwner"], false);
    assert_eq!(state["setupNeeded"], false);
    assert_eq!(state["canSetup"], true);
    assert_eq!(snapshot(&c, &url).await, before);
    drop(c);
    task.abort();
    let _ = task.await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    std::fs::remove_dir_all(root).unwrap();
}
