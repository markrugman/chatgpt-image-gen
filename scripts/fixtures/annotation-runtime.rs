// Test-only launcher: production always uses its bundled managed runtime.
fn main() {
    let result = std::process::Command::new("node")
        .arg(std::env::var("ANNOTATION_RUNTIME_SCRIPT").unwrap())
        .status().unwrap();
    std::process::exit(result.code().unwrap_or(1));
}
