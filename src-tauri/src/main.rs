#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg|arg=="--design-worker") {
        if let Err(error)=zhezhi_runtime::backend::design::run_stdio(){eprintln!("{error}");std::process::exit(1);}
        return;
    }
    if let Err(error) = zhezhi_runtime::desktop::run() {
        eprintln!("折纸工坊迁移版启动失败：{error}");
        let _ = rfd::MessageDialog::new().set_title("折纸工坊无法启动")
            .set_description(error.to_string()).set_level(rfd::MessageLevel::Error).show();
        std::process::exit(1);
    }
}
