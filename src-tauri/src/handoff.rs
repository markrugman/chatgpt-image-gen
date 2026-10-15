use crate::{AppState, jobs, model::*};
use serde_json::{Value, json};
use std::{
    fs,
    io::{BufRead, Write},
    path::PathBuf,
    sync::Arc,
};
use tauri::{Emitter, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpListener,
};

fn discovery() -> PathBuf {
    std::env::var_os("IMAGEGEN_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            dirs::data_local_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("com.mark.imagegenapp")
        })
        .join("bridge.json")
}
pub async fn serve(state: Arc<AppState>, app: tauri::AppHandle) {
    let Ok(listener) = TcpListener::bind("127.0.0.1:0").await else {
        return;
    };
    let token = id();
    let address = match listener.local_addr() {
        Ok(a) => a,
        Err(_) => return,
    };
    let descriptor = json!({"address":address.to_string(),"token":token});
    if fs::write(state.store.root.join("bridge.json"), descriptor.to_string()).is_err() {
        return;
    }
    while let Ok((stream, _)) = listener.accept().await {
        let state = state.clone();
        let app = app.clone();
        let token = token.clone();
        tokio::spawn(async move {
            let (read, mut write) = stream.into_split();
            let mut reader = BufReader::new(read);
            let mut line = String::new();
            let result = match tokio::time::timeout(
                std::time::Duration::from_secs(10),
                reader.read_line(&mut line),
            )
            .await
            {
                Ok(Ok(_)) if line.len() < 1_000_000 => match serde_json::from_str::<Value>(&line) {
                    Ok(request) if request["token"] == token => {
                        handle(&state, &app, &request["tool"], &request["arguments"]).await
                    }
                    _ => Err("Invalid local bridge request".into()),
                },
                _ => Err("Local bridge request timed out".into()),
            };
            let response = match result {
                Ok(v) => json!({"result":v}),
                Err(e) => json!({"error":e}),
            };
            let _ = write.write_all(format!("{response}\n").as_bytes()).await;
        });
    }
}
async fn handle(
    state: &Arc<AppState>,
    app: &tauri::AppHandle,
    tool: &Value,
    args: &Value,
) -> Result<Value, String> {
    if tool == "list_workspace" {
        let w = state.store.read()?;
        return Ok(
            json!({"organisations":w.organisations.iter().filter(|o|o.deleted_at.is_none()).collect::<Vec<_>>(),"projects":w.projects.iter().filter(|p|p.deleted_at.is_none()).collect::<Vec<_>>()}),
        );
    }
    if tool != "start_design" {
        return Err("Unknown Image Gen tool".into());
    }
    let required = |key: &str| {
        args[key]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .ok_or_else(|| format!("Missing {key}"))
    };
    let request_id = required("requestId")?;
    let org_name = required("organisation")?;
    let project_name = required("project")?;
    let name = required("name")?;
    let prompt = required("brief")?;
    let mode = required("mode")?;
    if !["discuss", "generate"].contains(&mode.as_str()) {
        return Err("mode must be discuss or generate".into());
    }
    let (doc_id,fresh)=state.store.change(|w|{
        if let Some(id)=w.handoffs.get(&request_id){return Ok((id.clone(),false));}
        let matches:Vec<_>=w.organisations.iter().filter(|o|o.deleted_at.is_none() && o.name.eq_ignore_ascii_case(&org_name)).collect();if matches.len()!=1{return Err("Choose exactly one existing organisation using list_workspace; ambiguous or missing organisation".into());}let org_id=matches[0].id.clone();
        let projects:Vec<_>=w.projects.iter().filter(|p|p.organisation_id==org_id && p.name.eq_ignore_ascii_case(&project_name) && p.deleted_at.is_none()).collect();
        if projects.len()>1{return Err("Multiple matching projects. Rename or select the intended project in Image Gen first.".into());}
        let project_id=if let Some(p)=projects.first(){p.id.clone()}else{let p=Project{id:id(),organisation_id:org_id,name:project_name,tags:vec![],deleted_at:None};let id=p.id.clone();w.projects.push(p);id};
        let doc_id=w.add_document(project_id,name,args["width"].as_f64().unwrap_or(210.),args["height"].as_f64().unwrap_or(297.),args["unit"].as_str().unwrap_or("mm").into(),None,None)?;
        w.handoffs.insert(request_id,doc_id.clone());Ok((doc_id,true))
    })?;
    let w = state.store.read()?;
    let document = w
        .documents
        .iter()
        .find(|d| d.id == doc_id && d.deleted_at.is_none())
        .ok_or("The previously created document is in Trash. Restore it in the app.")?;
    let target = Target {
        kind: "document".into(),
        id: doc_id.clone(),
        page_id: document.pages[0].id.clone(),
    };
    if fresh {
        if mode == "generate" {
            jobs::submit(
                state.clone(),
                app.clone(),
                jobs::Submit {
                    target: target.clone(),
                    prompt: prompt.clone(),
                    mode,
                    references: vec![],
                    transparent: false,
                    fresh_context: false,
                },
            )
            .await?;
        } else {
            state.store.change(|w| {
                w.page_mut(&target)?.messages.push(Message {
                    id: id(),
                    role: "user".into(),
                    text: prompt,
                    mode: "discuss".into(),
                    created_at: now(),
                    references: vec![],
                });
                Ok(())
            })?;
        }
    }
    let _ = app.emit("workspace-changed", ());
    let _ = app.emit(
        "open-document",
        json!({"documentId":doc_id,"pageId":target.page_id}),
    );
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(
        json!({"documentId":doc_id,"pageId":target.page_id,"projectId":document.project_id,"created":fresh,"openedInApp":true,"mode":args["mode"]}),
    )
}
fn forward(tool: &Value, args: &Value) -> Result<Value, String> {
    let mut spawned = false;
    for _ in 0..60 {
        let descriptor = fs::read_to_string(discovery())
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok());
        if let Some(d) = descriptor {
            if let Some(address) = d["address"].as_str() {
                if let Ok(mut stream) = std::net::TcpStream::connect(address) {
                    stream
                        .set_read_timeout(Some(std::time::Duration::from_secs(60)))
                        .map_err(|e| e.to_string())?;
                    writeln!(
                        stream,
                        "{}",
                        json!({"token":d["token"],"tool":tool,"arguments":args})
                    )
                    .map_err(|e| e.to_string())?;
                    let mut line = String::new();
                    std::io::BufReader::new(stream)
                        .read_line(&mut line)
                        .map_err(|e| e.to_string())?;
                    let response: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
                    if let Some(error) = response["error"].as_str() {
                        return Err(error.into());
                    }
                    return Ok(response["result"].clone());
                }
            }
        }
        if !spawned {
            let mut command =
                std::process::Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
            command
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            command.spawn().map_err(|e| e.to_string())?;
            spawned = true;
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    Err("Image Gen did not open. Launch the app and retry.".into())
}
pub fn run_mcp() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let Ok(request) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let Some(id) = request.get("id") else {
            continue;
        };
        let result = match request["method"].as_str() {
            Some("initialize") => Ok(
                json!({"protocolVersion":request["params"]["protocolVersion"].as_str().unwrap_or("2024-11-05"),"capabilities":{"tools":{}},"serverInfo":{"name":"imagegenapp","version":env!("CARGO_PKG_VERSION")}}),
            ),
            Some("ping") => Ok(json!({})),
            Some("tools/list") => Ok(json!({"tools":[
                {"name":"list_workspace","description":"List existing Image Gen organisations and projects on this computer.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},
                {"name":"start_design","description":"Create a new poster document and open its page conversation in the local Image Gen app. Reuse an exact matching organisation/project, create missing project, never guess ambiguous destinations. mode generate starts an image; discuss seeds the brief only. Retry with the same requestId to avoid duplicates.","inputSchema":{"type":"object","properties":{"requestId":{"type":"string"},"organisation":{"type":"string"},"project":{"type":"string"},"name":{"type":"string"},"brief":{"type":"string"},"mode":{"type":"string","enum":["discuss","generate"]},"width":{"type":"number"},"height":{"type":"number"},"unit":{"type":"string","enum":["mm","px","in"]}},"required":["requestId","organisation","project","name","brief","mode"],"additionalProperties":false}}
            ]})),
            Some("tools/call") => {
                let response = forward(&request["params"]["name"], &request["params"]["arguments"]);
                Ok(match response {
                    Ok(v) => {
                        json!({"content":[{"type":"text","text":v.to_string()}],"structuredContent":v})
                    }
                    Err(e) => json!({"isError":true,"content":[{"type":"text","text":e}]}),
                })
            }
            _ => Err("Unsupported method"),
        };
        let response = match result {
            Ok(value) => json!({"jsonrpc":"2.0","id":id,"result":value}),
            Err(message) => {
                json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":message}})
            }
        };
        if writeln!(stdout, "{response}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
    }
}
