use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use rusqlite::{Connection, OptionalExtension, params};
use sha2::{Digest, Sha256};
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub struct Auth {
    db: Connection,
}
pub const REMEMBER_SECONDS: u64 = 90 * 24 * 60 * 60;
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
fn digest(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}
impl Auth {
    pub fn open(root: &Path) -> Result<Self, String> {
        let path = root.join("auth.sqlite3");
        let db = Connection::open(&path).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
                .map_err(|e| e.to_string())?;
        }
        db.execute_batch("PRAGMA journal_mode=WAL;
          CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL, password_hash TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS login_preferences (id INTEGER PRIMARY KEY CHECK(id=1), key_only INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS login_sessions (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, expires INTEGER NOT NULL, owner_proof_until INTEGER NOT NULL);")
          .map_err(|e| e.to_string())?;
        Ok(Self { db })
    }
    pub fn has_owner(&self) -> Result<bool, String> {
        self.db
            .query_row("SELECT EXISTS(SELECT 1 FROM owner)", [], |r| r.get(0))
            .map_err(|e| e.to_string())
    }
    pub fn key_only(&self) -> Result<bool, String> {
        self.db
            .query_row(
                "SELECT key_only FROM login_preferences WHERE id=1",
                [],
                |r| r.get(0),
            )
            .optional()
            .map(|v| v.unwrap_or(false))
            .map_err(|e| e.to_string())
    }
    pub fn create_owner(&self, username: &str, password: &str) -> Result<(), String> {
        let username = username.trim();
        if !(3..=64).contains(&username.len())
            || !username
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
        {
            return Err(
                "Use 3–64 letters, numbers, dots, underscores or hyphens for your username".into(),
            );
        }
        if !(12..=256).contains(&password.chars().count()) {
            return Err("Use a password between 12 and 256 characters long".into());
        }
        if self.has_owner()? {
            return Err("An owner account already exists. Your access key still works.".into());
        }
        let salt =
            SaltString::encode_b64(uuid::Uuid::new_v4().as_bytes()).map_err(|e| e.to_string())?;
        let hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| e.to_string())?
            .to_string();
        self.db
            .execute(
                "INSERT INTO owner VALUES(1,?1,?2)",
                params![username.to_ascii_lowercase(), hash],
            )
            .map_err(|_| "An owner account already exists".to_string())?;
        Ok(())
    }
    pub fn verify(&self, username: &str, password: &str) -> bool {
        if username.len() > 64 || password.len() > 1024 {
            return false;
        }
        let owner: Option<(String, String)> = self
            .db
            .query_row(
                "SELECT username,password_hash FROM owner WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .ok()
            .flatten();
        let Some((name, hash)) = owner else {
            return false;
        };
        let Ok(hash) = PasswordHash::new(&hash) else {
            return false;
        };
        // Verify even for a wrong username, keeping the account's hash work constant.
        let valid = Argon2::default()
            .verify_password(password.as_bytes(), &hash)
            .is_ok();
        valid && name == username.trim().to_ascii_lowercase()
    }
    pub fn dismiss(&self) -> Result<(), String> {
        self.db.execute("INSERT INTO login_preferences VALUES(1,1) ON CONFLICT(id) DO UPDATE SET key_only=1", []).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn issue(
        &self,
        kind: &str,
        remember: bool,
        owner_proof: bool,
    ) -> Result<(String, u64), String> {
        let lifetime = if remember {
            REMEMBER_SECONDS
        } else {
            12 * 60 * 60
        };
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        self.db
            .execute(
                "DELETE FROM login_sessions WHERE expires <= ?1",
                params![now()],
            )
            .map_err(|e| e.to_string())?;
        self.db
            .execute(
                "INSERT INTO login_sessions VALUES(?1,?2,?3,?4)",
                params![
                    digest(&token),
                    kind,
                    now() + lifetime as i64,
                    if owner_proof { now() + 600 } else { 0 }
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok((token, lifetime))
    }
    pub fn valid(&self, token: &str, kind: &str) -> bool {
        if token.len() != 64 {
            return false;
        }
        self.db.query_row("SELECT EXISTS(SELECT 1 FROM login_sessions WHERE token_hash=?1 AND kind=?2 AND expires>?3)", params![digest(token),kind,now()], |r| r.get(0)).unwrap_or(false)
    }
    pub fn owner_proof(&self, token: &str) -> bool {
        self.db.query_row("SELECT EXISTS(SELECT 1 FROM login_sessions WHERE token_hash=?1 AND kind='browser' AND expires>?2 AND owner_proof_until>?2)", params![digest(token),now()], |r| r.get(0)).unwrap_or(false)
    }
    pub fn revoke(&self, token: &str) -> Result<(), String> {
        self.db
            .execute(
                "DELETE FROM login_sessions WHERE token_hash=?1",
                params![digest(token)],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn server_key(root: &Path, configured: Option<String>) -> Result<String, String> {
    if let Some(key) = configured.filter(|key| !key.is_empty()) {
        return Ok(key);
    }
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let path = root.join("server-access-key");
    if path.exists() {
        return std::fs::read_to_string(path)
            .map(|key| key.trim().to_string())
            .map_err(|e| e.to_string());
    }
    let key = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(key.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(key)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn password_and_session_storage_and_expiry() {
        let root = std::env::temp_dir().join(format!("imagegen-auth-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let auth = Auth::open(&root).unwrap();
        auth.create_owner("Owner", "long original password")
            .unwrap();
        assert!(auth.verify("owner", "long original password"));
        assert!(!auth.verify("different", "long original password"));
        let stored: String = auth
            .db
            .query_row("SELECT password_hash FROM owner", [], |r| r.get(0))
            .unwrap();
        assert!(stored.starts_with("$argon2id$"));
        assert!(!stored.contains("long original password"));
        let (token, _) = auth.issue("browser", true, true).unwrap();
        assert!(auth.valid(&token, "browser"));
        assert!(!auth.valid(&token, "native"));
        let stored: String = auth
            .db
            .query_row("SELECT token_hash FROM login_sessions", [], |r| r.get(0))
            .unwrap();
        assert_ne!(stored, token);
        auth.db
            .execute("UPDATE login_sessions SET expires=0", [])
            .unwrap();
        assert!(!auth.valid(&token, "browser"));
        assert!(!auth.owner_proof(&token));
        drop(auth);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn configured_key_is_preserved_and_generated_key_is_stable() {
        let root = std::env::temp_dir().join(format!("imagegen-key-{}", uuid::Uuid::new_v4()));
        let existing = "existing-server-access-key-do-not-change-0123456789";
        assert_eq!(server_key(&root, Some(existing.into())).unwrap(), existing);
        assert!(!root.exists());
        let generated = server_key(&root, None).unwrap();
        assert_eq!(generated.len(), 64);
        assert_eq!(server_key(&root, None).unwrap(), generated);
        assert_eq!(server_key(&root, Some(existing.into())).unwrap(), existing);
        assert_eq!(server_key(&root, None).unwrap(), generated);
        std::fs::remove_dir_all(root).unwrap();
    }
}
