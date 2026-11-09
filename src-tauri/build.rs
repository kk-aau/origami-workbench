fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_ready", "desktop_close_ack", "desktop_cancel_startup",
            "desktop_open_logs", "desktop_open_project", "desktop_pick_directory", "desktop_print",
            "desktop_prepare_export", "desktop_write_export", "desktop_finish_export", "desktop_cancel_export",
            "desktop_window_state", "desktop_window_action", "desktop_open_data_directory",
        ]),
    )).expect("failed to generate the desktop permission manifest");
}
