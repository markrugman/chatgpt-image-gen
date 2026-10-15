use image_gen_server::{router_with_web,web::Options,model};
use serde_json::{Value,json};use reqwest::{Client,StatusCode};
#[tokio::test(flavor="multi_thread",worker_threads=2)]async fn browser_sessions_csrf_shared_edits_downloads_and_logout(){
 let root=std::env::temp_dir().join(format!("imagegen-browser-{}",model::id()));let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let address=format!("http://{}",listener.local_addr().unwrap());let key="browser-test-key-01234567890123456789";
 let options=Options{internal_url:address.clone(),worker_dir:root.join("worker"),worker_enabled:false,static_dir:root.join("static")};std::fs::create_dir_all(&options.static_dir).unwrap();std::fs::write(options.static_dir.join("index.html"),"<!doctype html><title>Image Gen</title>").unwrap();
 let app=router_with_web(root.join("data"),"Private".into(),key.into(),options).unwrap();let task=tokio::spawn(async move{axum::serve(listener,app).await.unwrap()});let c=Client::new();
 let home=c.get(&address).send().await.unwrap();assert_eq!(home.status(),StatusCode::OK);assert!(home.headers().contains_key("content-security-policy"));
 assert_eq!(c.post(format!("{address}/api/get_workspace")).json(&json!({})).send().await.unwrap().status(),StatusCode::UNAUTHORIZED);
 assert_eq!(c.post(format!("{address}/web/login")).header("Origin","https://elsewhere.example").header("X-Imagegen-Request","1").json(&json!({"accessKey":key})).send().await.unwrap().status(),StatusCode::FORBIDDEN);
 let login=c.post(format!("{address}/web/login")).header("Origin",&address).header("X-Imagegen-Request","1").json(&json!({"accessKey":key})).send().await.unwrap();assert_eq!(login.status(),StatusCode::OK);let header=login.headers()["set-cookie"].to_str().unwrap();assert!(header.contains("HttpOnly")&&header.contains("SameSite=Strict"));assert!(!header.contains(key));let cookie=header.split(';').next().unwrap().to_string();
 assert_eq!(c.post(format!("{address}/api/get_workspace")).header("Cookie",&cookie).json(&json!({})).send().await.unwrap().status(),StatusCode::FORBIDDEN);
 let base:Value=c.post(format!("{address}/api/get_workspace")).header("Cookie",&cookie).header("X-Imagegen-Request","1").json(&json!({})).send().await.unwrap().json().await.unwrap();assert!(base["documents"].as_array().unwrap().is_empty());
 let id:Value=c.post(format!("{address}/api/mutate")).header("Cookie",&cookie).header("X-Imagegen-Request","1").json(&json!({"action":{"op":"organisation","name":"Browser organisation","_base":base}})).send().await.unwrap().json().await.unwrap();assert!(id.as_str().is_some());
 let snapshot:Value=c.get(format!("{address}/v1/workspace")).bearer_auth(key).send().await.unwrap().json().await.unwrap();assert_eq!(snapshot["workspace"]["organisations"][0]["id"],id);
 let connection:Value=c.post(format!("{address}/api/connection")).header("Cookie",&cookie).header("X-Imagegen-Request","1").json(&json!({})).send().await.unwrap().json().await.unwrap();assert_eq!(connection["workerEnabled"],false);
 let backup=c.get(format!("{address}/download/backup")).header("Cookie",&cookie).send().await.unwrap();assert_eq!(backup.status(),StatusCode::OK);let bytes=backup.bytes().await.unwrap();let mut zip=zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();let workspace:Value=serde_json::from_reader(zip.by_name("workspace.json").unwrap()).unwrap();assert_eq!(workspace["organisations"][0]["id"],id);assert!(!workspace.to_string().contains(key));
 assert_eq!(c.post(format!("{address}/web/logout")).header("Cookie",&cookie).header("X-Imagegen-Request","1").json(&json!({})).send().await.unwrap().status(),StatusCode::OK);
 assert_eq!(c.get(format!("{address}/web/session")).header("Cookie",&cookie).send().await.unwrap().status(),StatusCode::UNAUTHORIZED);
 task.abort();let _=task.await;drop(zip);drop(c);tokio::time::sleep(std::time::Duration::from_millis(100)).await;std::fs::remove_dir_all(root).unwrap();
}
