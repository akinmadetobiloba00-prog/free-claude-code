fn main() {
    // Declare app commands so capabilities can grant them to the bridge origin (remote URL).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "server_status",
            "ensure_server",
            "list_harnesses",
            "launch_in_terminal",
            "run_capture",
        ]),
    ))
    .expect("failed to run tauri-build");
}
