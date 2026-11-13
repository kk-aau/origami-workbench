use crate::{backend::{self, RunningServer}, desktop_export::{ExportStore, CHUNK_BYTES, validate_name}, process_tree, runtime_root, server_config};
use serde_json::{json, Value};
use serde::Deserialize;
use std::{collections::HashMap, fs, io::Read, path::{Path, PathBuf}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::Duration};
use tauri::{AppHandle, Manager, State, WebviewUrl, Webview, Window, WebviewWindowBuilder, WindowEvent};
use tokio::sync::oneshot;
use uuid::Uuid;

#[path="desktop_documents.rs"]
mod documents;

type Error = Box<dyn std::error::Error + Send + Sync>;
const MAIN_TITLE: &str = "折纸工坊 · Tauri / Rust";
const CLOSE_CONFIRM_LABEL: &str = "不保存并关闭";

struct Host {
    origin: String,
    server: tokio::sync::Mutex<Option<RunningServer>>,
    backend: Arc<backend::AppState>,
    closing: AtomicBool,
    ready: AtomicBool,
    picker_busy: AtomicBool,
    picker_owner: Mutex<Option<String>>,
    close_replies: Mutex<HashMap<String, documents::CloseReply>>,
    documents: Mutex<documents::Registry>,
    document_gate: tokio::sync::Mutex<()>,
    exports: Arc<ExportStore>,
}

fn trusted(window: &Webview, host: &Host, labels: &[&str]) -> Result<(), String> {
    let role=documents::role(window,host)?;
    if (role==documents::Role::Startup && labels.contains(&"startup")) || (role!=documents::Role::Startup && labels.contains(&"main")) {Ok(())}else{Err("不允许此桌面请求。".into())}
}

struct NativePicker<'a> {host:&'a Host}
impl Drop for NativePicker<'_>{fn drop(&mut self){self.host.picker_owner.lock().unwrap().take();self.host.picker_busy.store(false,Ordering::SeqCst);}}
fn begin_picker<'a>(host:&'a Host,owner:&str)->Result<NativePicker<'a>,String>{
    {let registry=host.documents.lock().unwrap();if registry.closing_application||owner.strip_prefix("doc-").is_some_and(|id|registry.closing_documents.contains(id)||registry.documents.get(id).is_some_and(|d|registry.closing_windows.contains(&d.window_id))){return Err("作品正在等待关闭确认，未打开文件对话框。".into());}}
    if host.picker_busy.swap(true,Ordering::SeqCst){return Err("请先完成当前文件选择对话框。".into());}
    *host.picker_owner.lock().unwrap()=Some(owner.into());Ok(NativePicker{host})
}

fn queue_activity(log: backend::activity::ActivityLog, action: &str, details: Value) -> oneshot::Receiver<()> {
    let entry = json!({"action":action,"level":"info","details":details});
    let (finished, completion) = oneshot::channel();
    // Storage may be migrating or saving a large document. Neither a native UI
    // callback nor an async shutdown deadline may wait for that synchronous lock.
    // A detached native thread also avoids Tokio's blocking-pool teardown wait.
    let _ = std::thread::Builder::new().name("zhezhi-desktop-log".into()).spawn(move || {
        let _ = log.append(&entry);
        let _ = finished.send(());
    });
    completion
}

fn activity(host: &Host, action: &str, details: Value) {
    drop(queue_activity(host.backend.activity.clone(), action, details));
}

fn request_exit(app: AppHandle) {
    let host = app.state::<Host>();
    if host.closing.swap(true, Ordering::SeqCst) { return; }
    let close_log = queue_activity(host.backend.activity.clone(), "desktop.close.normal", json!({"status":"closing"}));
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let host = handle.state::<Host>();
        let finish = async {
            let exports=host.exports.clone();
            let _=tauri::async_runtime::spawn_blocking(move||exports.clear()).await;
            let _ = tokio::time::timeout(Duration::from_millis(500), close_log).await;
            let mut guard = host.server.lock().await;
            if let Some(server) = guard.as_mut() { server.shutdown().await; }
            *guard = None;
        };
        if tokio::time::timeout(Duration::from_secs(5), finish).await.is_err() {
            activity(&host, "desktop.close.timeout", json!({"status":"exiting"}));
            // No second unbounded stop/flush here. Exiting closes the Windows
            // Job Object, which terminates the engine and WebView2 descendants.
        }
        handle.exit(0);
    });
}

fn close_confirmation_accepted(answer: &rfd::MessageDialogResult) -> bool {
    // rfd's standard Windows MessageBox returns Ok even for OkCancelCustom.
    // Backends with custom-button support return the configured button label.
    match answer {
        rfd::MessageDialogResult::Ok => true,
        rfd::MessageDialogResult::Custom(label) => label == CLOSE_CONFIRM_LABEL,
        _ => false,
    }
}

#[tauri::command]
async fn desktop_close_ack(window: Webview, host: State<'_, Host>, request_id: String, dirty: bool) -> Result<(), String> {
    trusted(&window, &host, &["main"])?;
    documents::acknowledge_close(&host.close_replies,window.label(),&request_id,dirty);

    Ok(())
}

#[tauri::command]
async fn desktop_ready(app: AppHandle, window: Webview, host: State<'_, Host>) -> Result<(), String> {
    trusted(&window, &host, &["main"])?;
    documents::ready(&app,&window)

}

#[tauri::command]
async fn desktop_cancel_startup(app: AppHandle, window: Webview, host: State<'_, Host>) -> Result<(), String> {
    trusted(&window,&host,&["startup"])?;
    if !host.ready.load(Ordering::SeqCst) { request_exit(app); }
    Ok(())
}

#[tauri::command]
async fn desktop_open_logs(window: Webview, host: State<'_, Host>) -> Result<(), String> {
    trusted(&window,&host,&["startup","main"])?;
    open_directory(&host.backend.storage.paths().data_dir)
}

fn open_directory(path: &Path) -> Result<(), String> {
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe").arg(path).creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;
    }
    #[cfg(not(windows))] { std::process::Command::new("xdg-open").arg(path).spawn().map_err(|e|e.to_string())?; }
    Ok(())
}

fn read_snapshot(path: &Path) -> Result<Vec<u8>, String> {
    let mut file = fs::File::open(path).map_err(|_|"无法读取所选工程文件，请检查文件是否存在、读取权限及可用内存。")?;
    let before = file.metadata().map_err(|e|e.to_string())?;
    if !before.is_file() { return Err("所选项目不是普通文件，请选择工程文件。".into()); }
    let size: usize = before.len().try_into().map_err(|_|"所选文件无法放入可用内存。")?;
    let mut data = Vec::new();
    data.try_reserve_exact(size).map_err(|_|"可用内存不足，无法读取所选工程文件。")?;
    file.by_ref().take(before.len()).read_to_end(&mut data).map_err(|e|e.to_string())?;
    let after = file.metadata().map_err(|e|e.to_string())?;
    if data.len()!=size || before.len()!=after.len() || before.modified().ok()!=after.modified().ok() || before.created().ok()!=after.created().ok() {
        return Err("所选工程文件在读取期间发生变化，请等文件保存完成后重新打开。".into());
    }
    Ok(data)
}

fn test_selection(_name: &str) -> Result<Option<PathBuf>,String> {
    #[cfg(debug_assertions)]
    if let Some(value)=std::env::var_os(_name) {
        let path=PathBuf::from(value).canonicalize().map_err(|e|e.to_string())?;
        let root=crate::project_root().canonicalize().map_err(|e|e.to_string())?;
        if !path.starts_with(root) {return Err("验收用文件／目录必须位于独立迁移工程内。".into());}
        return Ok(Some(path));
    }
    Ok(None)
}

#[cfg(debug_assertions)]
fn verified_test_export_target(project:&Path,directory:&Path,name:&str)->Result<PathBuf,String>{
    validate_name(name)?;let project=project.canonicalize().map_err(|e|e.to_string())?;let directory=directory.canonicalize().map_err(|e|e.to_string())?;
    if !directory.is_dir()||![project.join(".runtime"),project.join("output")].iter().any(|allowed|directory.starts_with(allowed)){return Err("导出验收目录必须位于本迁移工程的 .runtime 或 output 内。".into());}
    let marker=directory.join(".zhezhi-native-export-test");let marker_resolved=marker.canonicalize().map_err(|_|"导出验收目录缺少自有标记。")?;
    if marker_resolved.parent()!=Some(directory.as_path())||fs::read_to_string(&marker_resolved).ok().as_deref()!=Some("zhezhi-native-export-test-v1"){return Err("导出验收目录标记无效。".into());}
    let file=Path::new(name);let stem=file.file_stem().and_then(|v|v.to_str()).ok_or("导出文件名称无效。")?;let extension=file.extension().and_then(|v|v.to_str()).map(|v|format!(".{v}")).unwrap_or_default();
    // Every debug selection is unique, including two simultaneous same-name exports.
    Ok(directory.join(format!("{stem}-{}{extension}",Uuid::new_v4())))
}
fn test_export_selection(_name:&str)->Result<Option<PathBuf>,String>{
    #[cfg(debug_assertions)]if let Some(directory)=std::env::var_os("ZHEZHI_TAURI_TEST_EXPORT_DIR"){return verified_test_export_target(&crate::project_root(),&PathBuf::from(directory),_name).map(Some);}
    Ok(None)
}

#[tauri::command]
async fn desktop_open_project(window: Webview, host: State<'_, Host>, kind: String) -> Result<tauri::ipc::Response, String> {
    trusted(&window,&host,&["main"])?;
    let (title, filter, extensions): (&str, &str, &[&str]) = match kind.as_str() {
        "crease" => ("打开工程或完整作品", "折纸工程与作品", &["oriw","json","fold","cp","opx","ori","orh"]),
        "diagram" => ("打开折序工程", "折序工程文件", &["json"]),
        "design" => ("打开基础形设计", "基础形设计 / TreeMaker / BPS", &["json","tmd","tmd4","tmd5","bps"]),
        "tool-layout" => ("导入工具排版", "工具排版文件", &["json"]),
        _ => return Err("不支持的文件类型。".into()),
    };
    let _picker=begin_picker(&host,window.label())?;
    let parent=window.window();
    let result=tauri::async_runtime::spawn_blocking(move || {
        let dialog=rfd::FileDialog::new().set_parent(&parent).set_title(title).add_filter(filter,extensions);
        let selected=match test_selection("ZHEZHI_TAURI_TEST_OPEN_FILE")? {Some(path)=>Some(path),None=>dialog.pick_file()};
        let _=parent.set_focus();
        let Some(path)=selected else{return Ok(Vec::new())};
        let name=path.file_name().unwrap_or_default().to_string_lossy().into_owned().into_bytes();
        let data=read_snapshot(&path)?;
        // A binary IPC envelope avoids JSON arrays and their huge per-byte cost.
        let mut frame=Vec::with_capacity(4+name.len()+data.len());
        frame.extend_from_slice(&(name.len() as u32).to_le_bytes()); frame.extend(name); frame.extend(data);
        Ok::<_,String>(frame)
    }).await.map_err(|e|e.to_string());
    trusted(&window,&host,&["main"])?;
    Ok(tauri::ipc::Response::new(result??))
}

#[tauri::command]
async fn desktop_pick_directory(window: Webview, host: State<'_, Host>, kind: String) -> Result<Value, String> {
    trusted(&window,&host,&["main"])?;
    if !["projectsDir","diagramsDir","dataDir"].contains(&kind.as_str()) {return Err("保存目录类别无效。".into());}
    let _picker=begin_picker(&host,window.label())?;
    let parent=window.window();
    let chosen=tauri::async_runtime::spawn_blocking(move || {let result=match test_selection("ZHEZHI_TAURI_TEST_PICK_DIRECTORY")? {Some(path)=>Some(path),None=>rfd::FileDialog::new().set_parent(&parent).set_title("选择保存目录").pick_folder()};let _=parent.set_focus();Ok::<_,String>(result)}).await.map_err(|e|e.to_string())??;
    trusted(&window,&host,&["main"])?;
    match chosen {None=>Ok(json!({"cancelled":true})),Some(path)=>host.backend.storage.register_selection(&kind,path).map_err(|e|e.to_string())}
}

#[tauri::command]
async fn desktop_prepare_export(window: Webview, host: State<'_, Host>, name: String, bytes: u64) -> Result<Value,String> {
    trusted(&window,&host,&["main"])?;
    if host.closing.load(Ordering::SeqCst){return Err("应用正在关闭，未保存导出文件。".into());}
    validate_name(&name)?;
    let _picker=begin_picker(&host,window.label())?;
    let parent=window.window();
    let selected=tauri::async_runtime::spawn_blocking(move || {
        let mut dialog=rfd::FileDialog::new().set_parent(&parent).set_title("导出作品 · 另存为").set_file_name(&name);
        if let Some(extension)=Path::new(&name).extension().and_then(|s|s.to_str()) {dialog=dialog.add_filter("导出文件",&[extension]);}
        let chosen=match test_export_selection(&name)?{Some(path)=>Some(path),None=>dialog.save_file()};let _=parent.set_focus();Ok::<_,String>(chosen)
    }).await.map_err(|e|e.to_string());
    trusted(&window,&host,&["main"])?;
    let Some(target)=selected?? else {return Ok(json!({"cancelled":true}));};
    if host.closing.load(Ordering::SeqCst){return Err("应用正在关闭，未保存导出文件。".into());}
    let exports=host.exports.clone();let owner=window.label().to_string();
    let ticket=tauri::async_runtime::spawn_blocking(move||exports.prepare(&owner,target,bytes)).await.map_err(|e|e.to_string())??;
    Ok(json!({"cancelled":false,"ticket":ticket,"chunkBytes":CHUNK_BYTES}))
}

#[tauri::command]
async fn desktop_write_export(window: Webview, host: State<'_, Host>, request: tauri::ipc::Request<'_>) -> Result<u64,String> {
    trusted(&window,&host,&["main"])?;
    if host.closing.load(Ordering::SeqCst){return Err("应用正在关闭，导出已停止。".into());}
    let ticket=request.headers().get("x-zhezhi-export-ticket").and_then(|v|v.to_str().ok()).ok_or("缺少导出请求标识。")?.to_string();
    let offset=request.headers().get("x-zhezhi-export-offset").and_then(|v|v.to_str().ok()).and_then(|v|v.parse::<u64>().ok()).ok_or("导出数据位置无效。")?;
    // WebView2 can route localhost IPC through Tauri's JSON fallback. Its
    // ArrayBuffer then arrives as a JSON byte array instead of a Raw body.
    let data=export_chunk_bytes(request.body())?;
    let exports=host.exports.clone();let owner=window.label().to_string();
    let result=tauri::async_runtime::spawn_blocking(move||exports.write(&owner,&ticket,offset,&data)).await.map_err(|e|e.to_string())?;
    if result.is_err(){activity(&host,"desktop.export.failed",json!({"stage":"write"}));}result
}

fn export_chunk_bytes(body:&tauri::ipc::InvokeBody)->Result<Vec<u8>,String>{
    use tauri::ipc::InvokeBody;
    let data=match body {
        InvokeBody::Raw(data)=>data.clone(),
        InvokeBody::Json(Value::Array(values))=>{
            if values.is_empty()||values.len()>CHUNK_BYTES{return Err("导出数据块大小无效。".into());}
            values.iter().map(|value|value.as_u64().and_then(|n|u8::try_from(n).ok()).ok_or_else(||"导出数据块包含无效字节。".to_string())).collect::<Result<Vec<_>,_>>()?
        },
        _=>return Err("导出必须使用二进制数据块。".into()),
    };
    if data.is_empty()||data.len()>CHUNK_BYTES{return Err("导出数据块大小无效。".into());}
    Ok(data)
}

#[tauri::command]
async fn desktop_finish_export(window: Webview, host: State<'_, Host>, ticket: String) -> Result<Value,String> {
    trusted(&window,&host,&["main"])?;
    if host.closing.load(Ordering::SeqCst){return Err("应用正在关闭，导出未提交。".into());}
    let exports=host.exports.clone();let owner=window.label().to_string();
    let result=tauri::async_runtime::spawn_blocking(move||exports.commit(&owner,&ticket)).await.map_err(|e|e.to_string())?;
    activity(&host,if result.is_ok(){"desktop.export.saved"}else{"desktop.export.failed"},json!({"stage":"commit","success":result.is_ok()}));
    result.map(|path|json!({"status":"saved","path":path}))
}

#[tauri::command]
async fn desktop_cancel_export(window: Webview, host: State<'_, Host>, ticket: String) -> Result<bool,String> {
    trusted(&window,&host,&["main"])?;
    let exports=host.exports.clone();let owner=window.label().to_string();
    let cancelled=tauri::async_runtime::spawn_blocking(move||exports.cancel(&owner,&ticket)).await.map_err(|e|e.to_string())??;
    if cancelled{activity(&host,"desktop.export.cancelled",json!({"stage":"write"}));}Ok(cancelled)
}

#[tauri::command]
async fn desktop_print(window: Webview, host: State<'_, Host>) -> Result<Value,String> {
    trusted(&window,&host,&["main"])?;
    window.print().map_err(|e|e.to_string())?;
    Ok(json!({"success":true}))
}

fn window_state(window: &Window) -> Result<Value, String> {
    Ok(json!({"maximized":window.is_maximized().map_err(|e|e.to_string())?,"fullscreen":window.is_fullscreen().map_err(|e|e.to_string())?}))
}

fn publish_window_state(window: &Window) {
    if let Ok(state)=window_state(window) {for view in window.webviews(){let _=view.eval(format!("window.__zhezhiWindowState?.({state});"));}}
}

#[tauri::command]
async fn desktop_window_state(window: Webview, host: State<'_, Host>) -> Result<Value, String> {
    trusted(&window,&host,&["main"])?;
    window_state(&window.window())
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all="camelCase")]
enum WindowAction { Minimize, ToggleMaximize, ToggleFullscreen, StartDragging, Close }

#[tauri::command]
async fn desktop_window_action(app: AppHandle, window: Webview, host: State<'_, Host>, action: WindowAction) -> Result<(), String> {
    trusted(&window,&host,&["main"])?;
    let window=window.window();
    match action {
        WindowAction::Minimize=>window.minimize().map_err(|e|e.to_string())?,
        WindowAction::ToggleMaximize=>{
            if window.is_fullscreen().map_err(|e|e.to_string())? {window.set_fullscreen(false).map_err(|e|e.to_string())?;}
            else if window.is_maximized().map_err(|e|e.to_string())? {window.unmaximize().map_err(|e|e.to_string())?;}
            else {window.maximize().map_err(|e|e.to_string())?;}
        },
        WindowAction::ToggleFullscreen=>window.set_fullscreen(!window.is_fullscreen().map_err(|e|e.to_string())?).map_err(|e|e.to_string())?,
        WindowAction::StartDragging=>{if !window.is_fullscreen().map_err(|e|e.to_string())? {window.start_dragging().map_err(|e|e.to_string())?;}},
        // Custom chrome must use exactly the same guard and bounded shutdown as
        // the OS close button, Alt+F4 and the native close request.
        WindowAction::Close=>documents::request_host_close(app,window.label().to_string()),
    }
    publish_window_state(&window);
    Ok(())
}

#[tauri::command]
async fn desktop_open_data_directory(window: Webview, host: State<'_, Host>) -> Result<(), String> {
    trusted(&window,&host,&["main"])?;
    open_directory(&host.backend.storage.paths().projects_dir)
}

#[cfg(windows)]
fn single_instance() -> Result<bool, Error> {
    use sha2::{Digest,Sha256};
    use windows_sys::Win32::{Foundation::{GetLastError,CloseHandle,ERROR_ALREADY_EXISTS},System::Threading::CreateMutexW,UI::WindowsAndMessaging::{FindWindowW,ShowWindow,SetForegroundWindow,SW_RESTORE}};
    let name=format!("Local\\ZhezhiWorkbenchTauri-{}",hex::encode(Sha256::digest(runtime_root().to_string_lossy().as_bytes())));
    let name:Vec<u16>=name.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let mutex=CreateMutexW(std::ptr::null(),0,name.as_ptr());
        if mutex.is_null(){return Err(std::io::Error::last_os_error().into());}
        if GetLastError()==ERROR_ALREADY_EXISTS {
            CloseHandle(mutex);
            for title in [MAIN_TITLE,"折纸工坊 · 正在启动"] {
                let title:Vec<u16>=title.encode_utf16().chain(Some(0)).collect();
                let window=FindWindowW(std::ptr::null(),title.as_ptr());
                if !window.is_null(){ShowWindow(window,SW_RESTORE);SetForegroundWindow(window);break;}
            }
            return Ok(false);
        }
        // Non-inheritable handle lives until OS process teardown, like Job Object.
        // Holding it throughout all webview/backend shutdown phases avoids overlap.
        std::mem::forget(Box::new(mutex as usize));
    }
    Ok(true)
}
#[cfg(not(windows))]
fn single_instance() -> Result<bool, Error> {Ok(true)}

fn browser_args() -> Option<String> {
    #[cfg(debug_assertions)]
    if let Some(port)=std::env::var("ZHEZHI_TAURI_DEBUG_PORT").ok().and_then(|p|p.parse::<u16>().ok()).filter(|p|*p>1024) {
        return Some(format!("--remote-debugging-port={port}"));
    }
    None
}

fn test_hidden() -> bool {
    #[cfg(debug_assertions)]
    { return std::env::var("ZHEZHI_TAURI_TEST_HIDDEN").as_deref()==Ok("1"); }
    #[cfg(not(debug_assertions))]
    { false }
}

pub fn run() -> Result<(), Error> {
    fs::create_dir_all(runtime_root())?;
    process_tree::constrain_process_tree().map_err(std::io::Error::other)?;
    if !single_instance()? {return Ok(());}
    let config=server_config(true);
    if !config.dist_dir.join("index.html").is_file() || !config.engine_executable.is_file() {
        return Err("应用资源不完整：请完整解压或重新安装折纸工坊 Tauri 版，保留 EXE 同级的 resources 目录。现有工程不会被删除。".into());
    }
    tauri::webview_version().map_err(|_| "未检测到可用的 Microsoft Edge WebView2 Runtime。本版复用系统 WebView2；请先修复系统运行环境，或使用保留的 Electron 版。程序未自动下载安装运行环境，现有工程不会被删除。")?;
    let server=tauri::async_runtime::block_on(backend::start(config))?;
    let origin=format!("http://{}",server.address);
    let host=Host{origin:origin.clone(),backend:server.state.clone(),server:tokio::sync::Mutex::new(Some(server)),closing:AtomicBool::new(false),ready:AtomicBool::new(false),picker_busy:AtomicBool::new(false),picker_owner:Mutex::new(None),close_replies:Mutex::new(HashMap::new()),documents:Mutex::new(documents::Registry::default()),document_gate:tokio::sync::Mutex::new(()),exports:Arc::new(ExportStore::default())};
    let app=tauri::Builder::default().manage(host)
        .invoke_handler(tauri::generate_handler![desktop_ready,desktop_close_ack,desktop_cancel_startup,desktop_open_logs,desktop_open_project,desktop_pick_directory,desktop_prepare_export,desktop_write_export,desktop_finish_export,desktop_cancel_export,desktop_print,desktop_window_state,desktop_window_action,desktop_open_data_directory,documents::desktop_documents])
        .setup(move |app| {
            let handle=app.handle();
            let profile=runtime_root().join("profile");fs::create_dir_all(&profile)?;
            let mut startup_builder=WebviewWindowBuilder::new(handle,"startup",WebviewUrl::External(format!("{origin}/_desktop/startup.html").parse()?))
                .title("折纸工坊 · 正在启动").inner_size(550.0,370.0).resizable(false).center().visible(!test_hidden()).data_directory(profile.clone())
                .initialization_script(include_str!("bridge.js")).on_navigation({let origin=origin.clone();move|url|url.origin().ascii_serialization()==origin})
                .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny)
                .on_permission_request(|_,_|tauri::webview::PermissionResponse::Deny);
            if let Some(args)=browser_args(){startup_builder=startup_builder.additional_browser_args(&args);}
            let startup=startup_builder.build()?;
            let cancel=handle.clone();startup.on_window_event(move|event|if let WindowEvent::CloseRequested{api,..}=event {api.prevent_close();if !cancel.state::<Host>().ready.load(Ordering::SeqCst){request_exit(cancel.clone());}else if let Some(startup)=cancel.get_webview_window("startup"){let _=startup.destroy();}});
            documents::create_host(handle,"main","edit").map_err(std::io::Error::other)?;
            documents::create_document(handle,"main","edit",true,None,None,None,None).map_err(std::io::Error::other)?;
            let timeout=handle.clone();tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(35)).await;
                let host=timeout.state::<Host>();
                if !host.ready.load(Ordering::SeqCst) && !host.closing.load(Ordering::SeqCst) {
                    if let Some(startup)=timeout.get_webview_window("startup") {let _=startup.eval("document.querySelector('#startup-title').textContent='工作台载入时间较长';document.querySelector('#startup-detail').textContent='您可以继续等待、查看日志，或退出后重试。工程数据不会被删除。';");}
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())?;
    app.run(|app,event|if let tauri::RunEvent::ExitRequested{api,..}=event {
        if !app.state::<Host>().closing.load(Ordering::SeqCst) {api.prevent_exit();documents::request_app_close(app.clone());}
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_export_accepts_webview2_json_byte_fallback_and_rejects_invalid_chunks(){
        use tauri::ipc::InvokeBody;
        assert_eq!(export_chunk_bytes(&InvokeBody::Raw(vec![0,127,255])).unwrap(),vec![0,127,255]);
        assert_eq!(export_chunk_bytes(&InvokeBody::Json(json!([0,127,255]))).unwrap(),vec![0,127,255]);
        for value in [json!([]),json!([256]),json!([-1]),json!([1.5]),json!([null]),json!({"bytes":[1]})]{
            assert!(export_chunk_bytes(&InvokeBody::Json(value)).is_err());
        }
        assert!(export_chunk_bytes(&InvokeBody::Json(json!(vec![0;CHUNK_BYTES+1]))).is_err());
    }
    #[test]
    fn custom_window_actions_only_accept_the_supported_control_vocabulary() {
        for (value,expected) in [("minimize",WindowAction::Minimize),("toggleMaximize",WindowAction::ToggleMaximize),("toggleFullscreen",WindowAction::ToggleFullscreen),("startDragging",WindowAction::StartDragging),("close",WindowAction::Close)] {
            assert_eq!(serde_json::from_value::<WindowAction>(json!(value)).unwrap(),expected);
        }
        for value in [json!("destroy"),json!("exit"),json!("execute"),json!(null),json!({"close":true})] {
            assert!(serde_json::from_value::<WindowAction>(value).is_err());
        }
    }
    #[test]
    fn native_close_accepts_windows_standard_ok() {
        assert!(close_confirmation_accepted(&rfd::MessageDialogResult::Ok));
    }
    #[test]
    fn native_close_accepts_explicit_custom_confirmation() {
        assert!(close_confirmation_accepted(&rfd::MessageDialogResult::Custom(CLOSE_CONFIRM_LABEL.into())));
    }
    #[test]
    fn native_close_preserves_cancel_and_unexpected_answers() {
        use rfd::MessageDialogResult::*;
        for answer in [Cancel, No, Yes, Custom("继续编辑".into()), Custom(String::new())] {
            assert!(!close_confirmation_accepted(&answer), "only the explicit close choice may discard edits: {answer:?}");
        }
    }
    #[tokio::test]
    async fn native_logging_does_not_block_ui_or_timeout_on_storage_contention() {
        let dir=tempfile::tempdir().unwrap();
        let storage=backend::storage::Storage::new(dir.path().join("data"),false).unwrap();
        let log=backend::activity::ActivityLog::new(storage.clone(),"test".into(),vec![]);
        let (held_tx,held_rx)=std::sync::mpsc::channel();
        let (release_tx,release_rx)=std::sync::mpsc::channel();
        let holder=std::thread::spawn(move||storage.with_write(|_|{
            held_tx.send(()).unwrap();release_rx.recv().unwrap();Ok(())
        }).unwrap());
        held_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let start=std::time::Instant::now();
        let mut completion=queue_activity(log,"desktop.close.normal",json!({"status":"closing"}));
        let returned_promptly=start.elapsed()<Duration::from_millis(250);
        let deadline_worked=tokio::time::timeout(Duration::from_millis(50),&mut completion).await.is_err();
        release_tx.send(()).unwrap();holder.join().unwrap();
        tokio::time::timeout(Duration::from_secs(2),completion).await.unwrap().unwrap();
        assert!(returned_promptly,"native callback must not wait on the storage lock");
        assert!(deadline_worked,"async deadline must run while storage remains locked");
        assert!(fs::read_to_string(dir.path().join("data/activity.ndjson")).unwrap().contains("desktop.close.normal"));
    }
    #[test] fn read_snapshot_preserves_all_bytes() {let dir=tempfile::tempdir().unwrap();let path=dir.path().join("中文.cp");let bytes=b"\xff\xfe\x00\r\n";fs::write(&path,bytes).unwrap();assert_eq!(read_snapshot(&path).unwrap(),bytes);}
    #[test] fn project_reads_reject_a_directory() {let dir=tempfile::tempdir().unwrap();assert!(read_snapshot(dir.path()).is_err());}
    #[cfg(debug_assertions)]
    #[test]fn debug_exports_require_owned_marked_directory_and_never_overwrite_names(){
        let dir=tempfile::tempdir_in(crate::project_root().join("output")).unwrap();let name="作品.oriw";
        assert!(verified_test_export_target(&crate::project_root(),dir.path(),name).is_err());
        fs::write(dir.path().join(".zhezhi-native-export-test"),"zhezhi-native-export-test-v1").unwrap();fs::write(dir.path().join(name),b"existing").unwrap();
        let first=verified_test_export_target(&crate::project_root(),dir.path(),name).unwrap();let second=verified_test_export_target(&crate::project_root(),dir.path(),name).unwrap();
        assert_ne!(first,second);assert_eq!(first.parent(),Some(dir.path().canonicalize().unwrap().as_path()));assert_eq!(first.extension().unwrap(),"oriw");assert_eq!(fs::read(dir.path().join(name)).unwrap(),b"existing");assert!(verified_test_export_target(&crate::project_root(),dir.path(),"../source.rs").is_err());
    }
}
