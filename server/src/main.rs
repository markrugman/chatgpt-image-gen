use std::path::PathBuf;
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::var_os("IMAGEGEN_SERVER_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/data"));
    let configured = std::env::var("IMAGEGEN_SERVER_TOKEN").ok();
    let token = image_gen_server::auth::server_key(&root, configured.clone())?;
    if configured.as_deref().is_none_or(str::is_empty) {
        println!("Server access key: read {} on the Docker host (keep this file private).", root.join("server-access-key").display());
    }
    let name =
        std::env::var("IMAGEGEN_SERVER_NAME").unwrap_or_else(|_| "My Image Gen Server".into());
    let address = std::env::var("IMAGEGEN_SERVER_LISTEN").unwrap_or_else(|_| "0.0.0.0:8787".into());
    let listener = tokio::net::TcpListener::bind(&address).await?;
    let worker_dir = std::env::var_os("IMAGEGEN_WORKER_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.join("browser-worker"));
    let worker_enabled =
        std::env::var("IMAGEGEN_WORKER_ENABLED").is_ok_and(|v| v == "true" || v == "1");
    let static_dir = std::env::var_os("IMAGEGEN_WEB_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("web"));
    let internal_url = format!("http://127.0.0.1:{}", listener.local_addr()?.port());
    let router = image_gen_server::router_with_web(
        root,
        name,
        token,
        image_gen_server::web::Options {
            internal_url,
            worker_dir,
            worker_enabled,
            static_dir,
        },
    )?;
    println!(
        "Image Gen Server {} listening on {}",
        env!("CARGO_PKG_VERSION"),
        listener.local_addr()?
    );
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
