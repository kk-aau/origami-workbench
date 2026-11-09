pub mod backend;
pub mod process_tree;

#[cfg(feature = "desktop")]
pub mod desktop;
#[cfg(feature = "desktop")]
mod desktop_export;

use std::path::PathBuf;

/// The migration has its own data tree, never the existing Electron profile.
pub fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

fn packaged_resources(executable: &std::path::Path, development_root: &std::path::Path) -> Option<PathBuf> {
    let resources = executable.parent()?.join("resources");
    if resources.join("runtime-layout.json").is_file() || !executable.starts_with(development_root.join("src-tauri/target")) {
        Some(resources)
    } else {
        None
    }
}

fn resources_root() -> Option<PathBuf> {
    std::env::current_exe().ok().and_then(|exe| packaged_resources(&exe, &project_root()))
}

pub fn runtime_root() -> PathBuf {
    std::env::var_os("ZHEZHI_TAURI_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| resources_root().map(|resources| resources.parent().unwrap().join("user-data")).unwrap_or_else(|| project_root().join(".runtime")))
}

pub fn server_config(native_dialogs: bool) -> backend::ServerConfig {
    let root = project_root();
    let resources = resources_root();
    backend::ServerConfig {
        data_root: std::env::var_os("ZHEZHI_DATA_DIR").map(PathBuf::from).unwrap_or_else(|| runtime_root().join("data")),
        dist_dir: std::env::var_os("ZHEZHI_DIST_DIR").map(PathBuf::from).unwrap_or_else(|| resources.as_ref().map(|p|p.join("dist")).unwrap_or_else(|| root.join("dist"))),
        engine_executable: std::env::var_os("ZHEZHI_TESS_EXECUTABLE").map(PathBuf::from).unwrap_or_else(|| resources.as_ref().map(|p|p.join("engine/zhezhi-tess.exe")).unwrap_or_else(|| root.join("build/tessellation/zhezhi-tess/zhezhi-tess.exe"))),
        engine_args: vec!["--worker".into()],
        version: env!("CARGO_PKG_VERSION").into(),
        native_dialogs,
        port: std::env::var("ZHEZHI_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(0),
    }
}

#[cfg(test)]
mod layout_tests {
    use super::*;
    #[test]
    fn relocated_package_never_falls_back_to_build_machine_sources() {
        let base=tempfile::tempdir().unwrap();let development=base.path().join("development");
        let installed=base.path().join("中文 安装/app.exe");
        assert_eq!(packaged_resources(&installed,&development),Some(base.path().join("中文 安装/resources")));
        assert_eq!(packaged_resources(&development.join("src-tauri/target/release/app.exe"),&development),None);
    }
    #[test]
    fn bundle_marker_takes_precedence_even_below_development_target() {
        let base=tempfile::tempdir().unwrap();let folder=base.path().join("src-tauri/target/test-package");
        std::fs::create_dir_all(folder.join("resources")).unwrap();
        std::fs::write(folder.join("resources/runtime-layout.json"),b"{}").unwrap();
        assert_eq!(packaged_resources(&folder.join("app.exe"),base.path()),Some(folder.join("resources")));
    }
}
