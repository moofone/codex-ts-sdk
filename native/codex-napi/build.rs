fn main() {
    napi_build::setup();

    println!("cargo:rerun-if-env-changed=CODEX_RS_VERSION");
    println!("cargo:rerun-if-env-changed=CODEX_CLI_VERSION");

    if let Ok(version) = std::env::var("CODEX_RS_VERSION") {
        println!("cargo:rustc-env=CODEX_RS_VERSION={}", version);
    }
    if let Ok(version) = std::env::var("CODEX_CLI_VERSION") {
        println!("cargo:rustc-env=CODEX_CLI_VERSION={}", version);
    }
}
