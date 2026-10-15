use crate::model::*;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub protocol: u32,
    #[serde(default)]
    pub server_version: Option<String>,
    pub server_id: String,
    pub name: String,
    pub revision: u64,
    pub workspace: Workspace,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub url: String,
    pub server_id: String,
}
pub struct Remote {
    pub config: Config,
    pub snapshot: Snapshot,
    pub cache: PathBuf,
    pub error: Option<String>,
    token: String,
    agent: ureq::Agent,
}
pub fn normalize_url(value: &str) -> Result<String, String> {
    let url = url::Url::parse(value.trim())
        .map_err(|_| "Enter a full server URL, such as http://192.168.1.10:8787")?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Use a server URL without credentials, query or fragment".into());
    }
    let host = url.host_str().ok_or("Enter a server hostname")?;
    let lan = host == "localhost"
        || host.ends_with(".local")
        || host.ends_with(".lan")
        || (!host.contains('.') && !host.contains(':'))
        || host
            .trim_matches(['[', ']'])
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| match ip {
                std::net::IpAddr::V4(ip) => ip.is_private() || ip.is_loopback(),
                std::net::IpAddr::V6(ip) => ip.is_loopback() || ip.is_unique_local(),
            });
    if url.scheme() != "https" && !(url.scheme() == "http" && lan) {
        return Err(
            "Use HTTPS for an internet server. HTTP is supported on your private home network."
                .into(),
        );
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}
fn entry(url: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(
        "com.mark.imagegenapp.server",
        &format!("{:x}", Sha256::digest(url.as_bytes())),
    )
    .map_err(|_| "Cannot open the system credential vault".into())
}
fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let tmp = path.with_extension("partial");
    fs::write(&tmp, serde_json::to_vec(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(tmp, path).map_err(|e| e.to_string())
}
impl Remote {
    fn agent() -> ureq::Agent {
        ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(20)))
            .http_status_as_error(false)
            .max_redirects(0)
            .build()
            .into()
    }
    fn server_version(url: &str) -> Option<String> {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(3)))
            .max_redirects(0)
            .build()
            .into();
        let mut response = agent.get(&format!("{url}/health")).call().ok()?;
        let health: Value = Self::json(&mut response).ok()?;
        if health["service"] != "image-gen-server" { return None; }
        health["version"].as_str().filter(|version| !version.is_empty()).map(String::from)
    }
    pub fn account_token(url: &str, username: String, password: String) -> Result<String, String> {
        let url = normalize_url(url)?;
        let mut response = Self::agent().post(&format!("{url}/auth/native"))
            .header("X-Imagegen-Request", "1")
            .send_json(json!({"username":username,"password":password}))
            .map_err(|_| "Cannot sign in to the server. Check the URL and network.".to_string())?;
        if response.status().as_u16() == 404 { return Err("This server needs an update for username/password login. Your access key still works.".into()); }
        let result: Value = Self::json(&mut response)?;
        result["token"].as_str().map(String::from).ok_or_else(|| "Server returned an invalid sign-in response".into())
    }
    pub fn connect(root: &Path, url: &str, token: String) -> Result<Self, String> {
        let url = normalize_url(url)?;
        if token.len() < 32 || token.chars().any(char::is_whitespace) {
            return Err("Enter the server's access key (at least 32 characters)".into());
        }
        let agent = Self::agent();
        let mut response = agent
            .get(&format!("{url}/v1/workspace"))
            .header("Authorization", &format!("Bearer {token}"))
            .call()
            .map_err(|_| "Cannot reach the server. Check the URL and network.")?;
        let mut snapshot: Snapshot = Self::json(&mut response)?;
        Self::check(&snapshot)?;
        snapshot.server_version = Self::server_version(&url);
        let cache = root.join("servers").join(&snapshot.server_id);
        fs::create_dir_all(cache.join("media")).map_err(|e| e.to_string())?;
        Ok(Self {
            config: Config {
                url,
                server_id: snapshot.server_id.clone(),
            },
            snapshot,
            cache,
            error: None,
            token,
            agent,
        })
    }
    fn check(s: &Snapshot) -> Result<(), String> {
        if s.protocol != 1
            || s.workspace.format_version > 3
            || uuid::Uuid::parse_str(&s.server_id).is_err()
        {
            Err("This server requires a newer or compatible Image Gen client".into())
        } else {
            Ok(())
        }
    }
    fn json<T: serde::de::DeserializeOwned>(
        response: &mut ureq::http::Response<ureq::Body>,
    ) -> Result<T, String> {
        if !response.status().is_success() {
            let code = response.status().as_u16();
            let body: Value = response
                .body_mut()
                .with_config()
                .limit(32_000)
                .read_json()
                .unwrap_or(json!({}));
            return Err(body["error"]
                .as_str()
                .map(String::from)
                .unwrap_or_else(|| format!("Server request failed ({code})")));
        }
        response
            .body_mut()
            .with_config()
            .limit(32_000_000)
            .read_json()
            .map_err(|_| "The server returned invalid data".into())
    }
    pub fn load(root: &Path) -> Result<Option<Self>, String> {
        let config_file = root.join("server.json");
        if !config_file.exists() {
            return Ok(None);
        }
        let config: Config = serde_json::from_slice(
            &fs::read(config_file).map_err(|e| e.to_string())?,
        )
        .map_err(|_| "Server connection settings are damaged; your local workspace is safe")?;
        if normalize_url(&config.url)? != config.url
            || uuid::Uuid::parse_str(&config.server_id).is_err()
        {
            return Err("Invalid saved server settings".into());
        }
        let cache = root.join("servers").join(&config.server_id);
        let snapshot: Snapshot = serde_json::from_slice(
            &fs::read(cache.join("workspace.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        Self::check(&snapshot)?;
        let token = entry(&config.url)?.get_password().unwrap_or_default();
        let mut remote = Self {
            config,
            snapshot,
            cache,
            error: None,
            token,
            agent: Self::agent(),
        };
        if let Err(e) = remote.refresh() {
            remote.error = Some(e);
        }
        Ok(Some(remote))
    }
    pub fn activate(&self, root: &Path) -> Result<(), String> {
        self.cache_snapshot()?;
        entry(&self.config.url)?
            .set_password(&self.token)
            .map_err(|_| "Cannot save the server access key in the system credential vault")?;
        write_json(&root.join("server.json"), &self.config)
    }
    fn cache_snapshot(&self) -> Result<(), String> {
        write_json(&self.cache.join("workspace.json"), &self.snapshot)
    }
    pub fn refresh(&mut self) -> Result<(), String> {
        let result = (|| {
            let mut response = self
                .agent
                .get(&format!("{}/v1/workspace", self.config.url))
                .header("Authorization", &format!("Bearer {}", self.token))
                .call()
                .map_err(|_| {
                    "Server unavailable. Cached designs remain viewable; reconnect to save changes."
                        .to_string()
                })?;
            let mut next: Snapshot = Self::json(&mut response)?;
            Self::check(&next)?;
            if next.server_id != self.config.server_id {
                return Err(
                    "A different server is using this address. Reconnect explicitly in Settings."
                        .into(),
                );
            }
            next.server_version = Self::server_version(&self.config.url);
            self.snapshot = next;
            self.cache_snapshot()
        })();
        self.error = result.as_ref().err().cloned();
        result
    }
    pub fn commit(
        &mut self,
        base: &Workspace,
        next: &Workspace,
        require_empty: bool,
    ) -> Result<(), String> {
        let result = (|| {
            for image in &next.images {
                if !base.images.iter().any(|i| i.id == image.id) {
                    let bytes = fs::read(self.cache.join("media").join(&image.file))
                        .map_err(|e| e.to_string())?;
                    self.upload(&image.file, &bytes)?;
                }
            }
            let mut response = self
                .agent
                .put(&format!("{}/v1/workspace", self.config.url))
                .header("Authorization", &format!("Bearer {}", self.token))
                .send_json(
                    json!({"serverId":self.config.server_id,"baseWorkspace":base,"workspace":next,"requireEmpty":require_empty}),
                )
                .map_err(|_| {
                    "Cannot save to the server. Unsent work is preserved on this computer."
                        .to_string()
                })?;
            let snapshot: Snapshot = Self::json(&mut response)?;
            Self::check(&snapshot)?;
            if snapshot.server_id != self.config.server_id {
                return Err("Server identity changed".into());
            }
            self.snapshot = snapshot;
            self.cache_snapshot()
        })();
        if let Err(error) = &result {
            self.error = Some(error.clone());
            let recovery = self.cache.join("unsent");
            fs::create_dir_all(&recovery).map_err(|e| e.to_string())?;
            write_json(
                &recovery.join(format!("{}-{}.json", now(), id())),
                &json!({"workspace":next,"baseWorkspace":base}),
            )?;
        } else {
            self.error = None;
        }
        result
    }
    pub fn upload(&self, file: &str, bytes: &[u8]) -> Result<(), String> {
        let mut response = self
            .agent
            .put(&format!("{}/v1/media/{file}", self.config.url))
            .header("Authorization", &format!("Bearer {}", self.token))
            .send(bytes)
            .map_err(|_| "Image upload failed. The original is kept in this computer's cache.")?;
        let result: Value = Self::json(&mut response)?;
        if result["sha256"] != format!("{:x}", Sha256::digest(bytes)) {
            return Err("The uploaded image could not be verified".into());
        }
        Ok(())
    }
    pub fn image(&self, file: &str) -> Result<PathBuf, String> {
        if file.contains(['/', '\\']) || file.contains("..") || file.is_empty() {
            return Err("Invalid server image filename".into());
        }
        let path = self.cache.join("media").join(file);
        if path.exists() {
            return Ok(path);
        }
        let mut response = self
            .agent
            .get(&format!("{}/v1/media/{file}", self.config.url))
            .header("Authorization", &format!("Bearer {}", self.token))
            .call()
            .map_err(|_| "This image is not cached yet. Reconnect to the server to view it.")?;
        if !response.status().is_success() {
            return Err("Image could not be downloaded".into());
        }
        let bytes = response
            .body_mut()
            .with_config()
            .limit(50_000_000)
            .read_to_vec()
            .map_err(|_| "Image download failed")?;
        image::load_from_memory(&bytes).map_err(|_| "Server image is invalid")?;
        fs::write(&path, bytes).map_err(|e| e.to_string())?;
        Ok(path)
    }
    pub fn pending(&self) -> usize {
        fs::read_dir(self.cache.join("unsent"))
            .map(|d| {
                d.filter_map(Result::ok)
                    .filter(|e| e.path().extension().is_some_and(|s| s == "json"))
                    .count()
            })
            .unwrap_or(0)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_http_public_https() {
        for url in [
            "http://localhost:8787",
            "http://192.168.178.96:8787",
            "http://[::1]:8787",
            "https://example.com/imagegen",
        ] {
            assert!(normalize_url(url).is_ok(), "{url}");
        }
        for url in [
            "http://example.com",
            "https://user:password@example.com",
            "https://example.com?key=abc",
            "file:///tmp/data",
        ] {
            assert!(normalize_url(url).is_err(), "{url}");
        }
    }
}
