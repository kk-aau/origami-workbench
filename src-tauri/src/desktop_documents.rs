//! Stable document WebViews and their native hosts. Geometry never crosses this registry.
use super::*;
use std::collections::{BTreeMap,HashSet};
use serde::{Serialize,Deserialize};
use tauri::{Webview,WindowBuilder,webview::WebviewBuilder,LogicalPosition,LogicalSize};

#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct Document {
    pub home:bool,pub id:String,pub title:String,pub window_id:String,pub active:bool,pub dirty:bool,pub busy:bool,pub saving:bool,pub ready:bool,pub workspace:String,pub visible:bool,pub bounds:Option<Bounds>,
    #[serde(skip)]pub library_key:Option<String>,
    #[serde(skip)]pub return_to:Option<String>,
    #[serde(skip)]pub handler_ready:bool,
    #[serde(skip)]pub pending_command:Option<String>,
}
#[derive(Clone,Serialize,Deserialize,Debug,PartialEq)]
pub(super) struct Bounds {pub x:f64,pub y:f64,pub width:f64,pub height:f64}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct HostWindow {pub workspace:String,pub id:String,pub title:String,pub document_ids:Vec<String>,pub active_id:Option<String>,pub layout:String,#[serde(skip)]pub ready:bool}
#[derive(Default)]
pub(super) struct Registry {pub windows:BTreeMap<String,HostWindow>,pub documents:BTreeMap<String,Document>,pub revision:u64,pub closing_windows:HashSet<String>,pub closing_documents:HashSet<String>,pub closing_application:bool}
pub(super) struct CloseReply {pub owner:String,pub sender:oneshot::Sender<bool>}
pub(super) fn acknowledge_close(replies:&Mutex<HashMap<String,CloseReply>>,owner:&str,request_id:&str,dirty:bool)->bool{
    let mut replies=replies.lock().unwrap();if !replies.get(request_id).is_some_and(|reply|reply.owner==owner){return false;}if let Some(reply)=replies.remove(request_id){let _=reply.sender.send(dirty);}true
}
struct CloseReservation {app:AppHandle,ids:Vec<String>,windows:Vec<String>,all:bool}
impl Drop for CloseReservation{fn drop(&mut self){let host=self.app.state::<Host>();let mut r=host.documents.lock().unwrap();for id in &self.ids{r.closing_documents.remove(id);}for id in &self.windows{r.closing_windows.remove(id);}if self.all{r.closing_application=false;}}}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]struct Metadata {title:Option<String>,workspace:Option<String>,dirty:Option<bool>,busy:Option<bool>,saving:Option<bool>,ready:Option<bool>}
fn apply_metadata(document:&mut Document,input:Value)->Result<bool,String>{
    let data:Metadata=serde_json::from_value(input).map_err(|_|"作品状态字段或类型无效。")?;
    if data.title.as_ref().is_some_and(|v|v.is_empty()||v.len()>1000||v.chars().any(char::is_control)){return Err("作品名称无效。".into());}
    if data.workspace.as_ref().is_some_and(|v|v!=&document.workspace){return Err("工作区无效。".into());}
    let previous=serde_json::to_value(&*document).unwrap();if let Some(v)=data.title{document.title=v;}
    for (v,target) in [(data.dirty,&mut document.dirty),(data.busy,&mut document.busy),(data.saving,&mut document.saving),(data.ready,&mut document.ready)]{if let Some(value)=v{*target=value;}}
    Ok(serde_json::to_value(&*document).unwrap()!=previous)
}
#[derive(Clone,Copy,PartialEq)]pub(super) enum Role {Startup,Shell,Document}
pub(super) fn label(id:&str)->String{format!("doc-{id}")}
fn shell_label(id:&str)->String{format!("shell-{id}")}
fn document_id(view:&Webview)->Option<&str>{view.label().strip_prefix("doc-")}
fn valid_id(id:&str)->bool{Uuid::parse_str(id).is_ok_and(|v|v.to_string()==id)}
pub(super) fn role(view:&Webview,host:&Host)->Result<Role,String>{
    let url=view.url().map_err(|e|e.to_string())?;
    if url.origin().ascii_serialization()!=host.origin{return Err("不允许此桌面来源。".into());}
    if view.label()=="startup"&&url.path()=="/_desktop/startup.html"{return Ok(Role::Startup);}
    if url.path()!="/"{return Err("不允许此桌面页面。".into());}
    let window_id=view.window().label().to_string();let registry=host.documents.lock().unwrap();
    if !registry.windows.contains_key(&window_id){return Err("作品窗口已关闭。".into());}
    if view.label()==shell_label(&window_id)&&!url.query_pairs().any(|(k,_)|k=="workspace"){return Ok(Role::Shell);}
    if let Some(id)=document_id(view){
        if valid_id(id)&&registry.documents.get(id).is_some_and(|d|d.window_id==window_id)&&url.query_pairs().any(|(k,v)|k=="workspace"&&v==id){return Ok(Role::Document);}
    }
    Err("不允许此作品请求。".into())
}
fn snapshot(host:&Host,window_id:&str)->Value{let r=host.documents.lock().unwrap();json!({"windowId":window_id,"revision":r.revision,"windows":r.windows.values().collect::<Vec<_>>(),"documents":r.documents.values().collect::<Vec<_>>()})}
pub(super) fn publish(app:&AppHandle){
    let host=app.state::<Host>();
    let targets={let r=host.documents.lock().unwrap();let mut targets=r.windows.keys().map(|id|shell_label(id)).collect::<Vec<_>>();targets.extend(r.documents.keys().map(|id|label(id)));targets};
    for name in targets{if let Some(view)=app.get_webview(&name){let data=snapshot(&host,view.window().label());let _=view.eval(format!("window.__zhezhiDocumentsChanged?.({data});"));}}
}
fn context(view:&Webview,host:&Host)->Result<Value,String>{let kind=role(view,host)?;Ok(json!({"role":if kind==Role::Shell{"shell"}else{"document"},"documentId":document_id(view),"windowId":view.window().label()}))}
fn open_host(host:&Host,id:&str)->Result<(),String>{let r=host.documents.lock().unwrap();if r.closing_application||!r.windows.contains_key(id)||r.closing_windows.contains(id){return Err("窗口正在关闭或已关闭。".into());}Ok(())}
fn library_key(input:&Value)->Result<Option<&str>,String>{
    if input.is_null(){return Ok(None);}
    input.as_str().filter(|key|!key.is_empty()&&key.len()<=512&&!key.chars().any(char::is_control))
        .map(Some).ok_or_else(||"文档标识无效。".into())
}
fn focus_document(app:&AppHandle,doc:&Document)->Result<(),String>{
    let changed={let host=app.state::<Host>();let mut r=host.documents.lock().unwrap();mark_active(&mut r,&doc.id)?};
    if changed{publish(app);}
    let view=app.get_webview(&label(&doc.id)).ok_or("作品窗口已关闭。")?;
    let window=view.window();if window.is_minimized().map_err(|e|e.to_string())?{window.unminimize().map_err(|e|e.to_string())?;}
    window.set_focus().map_err(|e|e.to_string())?;
    if doc.visible{view.set_focus().map_err(|e|e.to_string())?;}Ok(())
}
fn mutable_document(host:&Host,id:&str)->Result<Document,String>{let r=host.documents.lock().unwrap();let d=r.documents.get(id).ok_or("作品已关闭。")?;if r.closing_application||r.closing_documents.contains(id)||r.closing_windows.contains(&d.window_id){return Err("作品窗口正在关闭。".into());}Ok(d.clone())}
fn shell_only(view:&Webview,host:&Host)->Result<(),String>{if role(view,host)?!=Role::Shell{return Err("此操作只能从作品窗口栏执行。".into());}Ok(())}
fn initialization(kind:&str,id:Option<&str>)->String{format!("Object.defineProperty(window,'__zhezhiHostContext',{{value:Object.freeze({}),writable:false,configurable:false}});\n{}",json!({"role":kind,"documentId":id}),include_str!("bridge.js"))}
fn native_phase(id:&str,phase:&str){
    #[cfg(debug_assertions)]if std::env::var("ZHEZHI_TAURI_DOCUMENT_TRACE").as_deref()==Ok("1"){eprintln!("[document-native] {} {:?} {id} {phase}",chrono::Utc::now().to_rfc3339(),std::thread::current().id());}
    #[cfg(not(debug_assertions))]let _=(id,phase);
}
fn builder(host:&Host,name:&str,url:&str,kind:&str,id:Option<&str>)->Result<WebviewBuilder<tauri::Wry>,String>{
    let origin=host.origin.clone();let expected=id.map(str::to_owned);
    let mut b=WebviewBuilder::new(name,WebviewUrl::External(url.parse().map_err(|_|"作品地址无效。")?))
        .data_directory(runtime_root().join("profile")).initialization_script(&initialization(kind,id)).disable_drag_drop_handler()
        .on_navigation(move|url|url.origin().ascii_serialization()==origin&&url.path()=="/"&&match &expected{Some(id)=>url.query_pairs().any(|(k,v)|k=="workspace"&&v==id.as_str()),None=>!url.query_pairs().any(|(k,_)|k=="workspace")})
        .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny).on_permission_request(|_,_|tauri::webview::PermissionResponse::Deny).on_download(|_,_|false);
    if let Some(args)=browser_args(){b=b.additional_browser_args(&args);}Ok(b)
}
pub(super) fn create_host(app:&AppHandle,id:&str,workspace:&str)->Result<(),String>{
    let host=app.state::<Host>();
    {let mut r=host.documents.lock().unwrap();if r.windows.contains_key(id){return Err("窗口标识重复。".into());}r.windows.insert(id.into(),HostWindow{workspace:workspace.into(),id:id.into(),title:if id=="main"{"主窗口"}else{"独立窗口"}.into(),document_ids:vec![],active_id:None,layout:"tabs".into(),ready:false});r.revision+=1;}
    let result=(||{
        native_phase(id,"host.window.build.begin");let window=WindowBuilder::new(app,id).title(MAIN_TITLE).inner_size(1440.,1000.).min_inner_size(600.,420.).decorations(false).shadow(true).visible(false).build().map_err(|e|e.to_string())?;native_phase(id,"host.window.build.end");
        let handle=app.clone();let window_id=id.to_string();window.on_window_event(move|event|match event{
            WindowEvent::CloseRequested{api,..}=>{api.prevent_close();request_host_close(handle.clone(),window_id.clone());},
            WindowEvent::Resized(_)|WindowEvent::ScaleFactorChanged{..}=>{
                // Wry holds the moving view's dispatcher mutex while SetParent
                // synchronously emits native events. Query/eval must run after
                // this UI callback returns, otherwise reparent cannot complete.
                native_phase(&window_id,"host.ui.state.schedule.begin");let app=handle.clone();let id=window_id.clone();
                tauri::async_runtime::spawn_blocking(move||{native_phase(&id,"host.state.publish.begin");if let Some(window)=app.get_window(&id){publish_window_state(&window);}native_phase(&id,"host.state.publish.end");});native_phase(&window_id,"host.ui.state.schedule.end");
            },
            _=>{}
        });
        native_phase(id,"host.shell.add_child.begin");let shell=window.add_child(builder(&host,&shell_label(id),&format!("{}/",host.origin),"shell",None)?,LogicalPosition::new(0.,0.),LogicalSize::new(1440.,1000.)).map_err(|e|e.to_string())?;native_phase(id,"host.shell.add_child.end");
        shell.set_auto_resize(true).map_err(|e|e.to_string())?;native_phase(id,"host.shell.auto_resize.end");
        Ok::<(),String>(())
    })();
    if result.is_err(){host.documents.lock().unwrap().windows.remove(id);if let Some(w)=app.get_window(id){let _=w.destroy();}}
    result
}
pub(super) fn create_document(app:&AppHandle,window_id:&str,workspace:&str,home:bool,initial_command:Option<String>,transfer:Option<&str>,library_key:Option<&str>,return_to:Option<&str>)->Result<String,String>{
    let host=app.state::<Host>();open_host(&host,window_id)?;let window=app.get_window(window_id).ok_or("窗口已关闭。")?;let id=Uuid::new_v4().to_string();
    let previous_active={
        let mut r=host.documents.lock().unwrap();
        let previous=r.windows[window_id].active_id.clone();
        if !home{
            if let Some(doc)=previous.as_ref().and_then(|id|r.documents.get_mut(id)){doc.active=false;}
            let w=r.windows.get_mut(window_id).unwrap();
            w.document_ids.push(id.clone());
            w.active_id=Some(id.clone());
        }
        let title=if home{"文档区"}else{"未命名作品"};
        r.documents.insert(id.clone(),Document{home,id:id.clone(),title:title.into(),window_id:window_id.into(),active:!home,dirty:false,busy:false,saving:false,ready:false,workspace:workspace.into(),visible:false,bounds:None,library_key:library_key.map(str::to_owned),return_to:return_to.map(str::to_owned),handler_ready:false,pending_command:initial_command});
        r.revision+=1;
        previous
    };
    let home_query=if home{"&home=1"}else{""};
    let transfer_query=transfer.map(|token|format!("&transfer={token}")).unwrap_or_default();
    let result=(||{let view=window.add_child(builder(&host,&label(&id),&format!("{}/?workspace={id}&mode={workspace}{home_query}{transfer_query}",host.origin),"document",Some(&id))?,LogicalPosition::new(0.,96.),LogicalSize::new(1440.,904.)).map_err(|e|e.to_string())?;view.hide().map_err(|e|e.to_string())?;Ok::<(),String>(())})();
    if let Err(error)=result{let mut r=host.documents.lock().unwrap();r.documents.remove(&id);if let Some(w)=r.windows.get_mut(window_id){w.document_ids.retain(|v|v!=&id);w.active_id=previous_active;if let Some(active)=w.active_id.clone(){if let Some(d)=r.documents.get_mut(&active){d.active=true;}}}return Err(error);}
    publish(app);Ok(id)
}
pub(super) fn ready(app:&AppHandle,view:&Webview)->Result<(),String>{
    let host=app.state::<Host>();let caller=role(view,&host)?;let parent=view.window();
    // Handler readiness shows onboarding/errors. Public command readiness is only
    // the App's report.ready and may remain false while onboarding is visible.
    let changed={let mut r=host.documents.lock().unwrap();let changed=if caller==Role::Shell{if let Some(w)=r.windows.get_mut(parent.label()){let changed=!w.ready;w.ready=true;changed}else{false}}else if let Some(id)=document_id(view){if let Some(d)=r.documents.get_mut(id){let changed=!d.handler_ready;d.handler_ready=true;changed}else{false}}else{false};if changed{r.revision+=1;}changed};
    if changed{
        let visible={let r=host.documents.lock().unwrap();r.windows.get(parent.label()).is_some_and(|w|w.ready&&r.documents.values().any(|d|d.window_id==w.id&&d.handler_ready))};
        if visible&&!test_hidden(){parent.show().map_err(|e|e.to_string())?;parent.set_focus().map_err(|e|e.to_string())?;}
        if visible&&!host.ready.swap(true,Ordering::SeqCst){if let Some(startup)=app.get_webview_window("startup"){let _=startup.destroy();}activity(&host,"desktop.startup.ready",json!({"runtime":"tauri-webview2","version":env!("CARGO_PKG_VERSION")}));}
        publish(app);
    }
    deliver_ready_commands(app);Ok(())
}

fn validate_bounds(b:&Bounds,visible:bool,size:(f64,f64))->Result<(),String>{
    if ![b.x,b.y,b.width,b.height].into_iter().all(f64::is_finite)||b.x<0.||b.y<0.||b.width<0.||b.height<0.||b.x+b.width>size.0+1.||b.y+b.height>size.1+1.||(visible&&(b.width<1.||b.height<1.)){return Err("作品视口范围无效。".into());}Ok(())
}
#[derive(Deserialize)]#[serde(deny_unknown_fields,rename_all="camelCase")]
struct CreateInput {initial_command:Option<String>}
fn initial_command(input:Value)->Result<Option<String>,String>{
    let input:CreateInput=serde_json::from_value(input).map_err(|_|"新作品初始操作无效。")?;
    if input.initial_command.as_deref().is_some_and(|c|!["open","new"].contains(&c)){return Err("新作品只能执行新建或打开。".into());}
    Ok(input.initial_command)
}
fn mark_active(registry:&mut Registry,id:&str)->Result<bool,String>{
    let document=registry.documents.get(id).ok_or("作品已关闭。")?;
    if document.home{return Ok(false);}
    let window_id=document.window_id.clone();let window=registry.windows.get(&window_id).ok_or("作品窗口已关闭。")?;
    if document.active&&window.active_id.as_deref()==Some(id){return Ok(false);}
    for document in registry.documents.values_mut().filter(|d|d.window_id==window_id){document.active=document.id==id;}
    registry.windows.get_mut(&window_id).unwrap().active_id=Some(id.into());registry.revision+=1;Ok(true)
}
fn take_ready_commands(registry:&mut Registry)->Vec<(String,String)>{
    if registry.closing_application{return vec![];}
    let windows=registry.windows.values().filter(|w|w.ready&&!registry.closing_windows.contains(&w.id)).map(|w|w.id.clone()).collect::<HashSet<_>>();
    let closing=&registry.closing_documents;
    registry.documents.values_mut().filter(|d|d.handler_ready&&d.ready&&windows.contains(&d.window_id)&&!closing.contains(&d.id)).filter_map(|d|d.pending_command.take().map(|command|(label(&d.id),command))).collect()
}
fn deliver_ready_commands(app:&AppHandle){
    let pending={let host=app.state::<Host>();let mut r=host.documents.lock().unwrap();take_ready_commands(&mut r)};
    for (label,command) in pending{if let Some(view)=app.get_webview(&label){let _=view.eval(format!("window.__zhezhiDocumentCommand?.({});",json!(command)));}}
}
fn command_valid(command:&str)->bool{matches!(command,"open"|"new"|"save"|"save-artwork"|"save-crease"|"undo"|"redo"|"library"|"artwork-overview"|"export"|"settings"|"print"|"workspace:edit"|"workspace:design"|"workspace:tess"|"workspace:sim"|"workspace:diagram")}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]struct RectInput{id:String,x:f64,y:f64,width:f64,height:f64,visible:bool}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]struct MenuInput{id:String,label:String,enabled:Option<bool>,checked:Option<bool>,separator:Option<bool>}
fn validate_menu(items:&[MenuInput])->Result<(),String>{let mut ids=HashSet::new();if items.is_empty()||items.len()>128{return Err("菜单项目数量无效。".into());}for item in items{if item.separator==Some(true){continue;}if item.id.is_empty()||item.id.len()>160||!item.id.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_:./".contains(&b))||!ids.insert(&item.id)||item.label.is_empty()||item.label.chars().count()>160||item.label.chars().any(|c|c.is_control()&&c!='\t'){return Err("菜单项目无效。".into());}}Ok(())}
async fn popup(view:&Webview,input:Value)->Result<Value,String>{
    let items:Vec<MenuInput>=serde_json::from_value(input["items"].clone()).map_err(|_|"菜单项目无效。")?;validate_menu(&items)?;
    let x=input["x"].as_f64().ok_or("菜单位置无效。")?;let y=input["y"].as_f64().ok_or("菜单位置无效。")?;if !x.is_finite()||!y.is_finite()||x<0.||y<0.{return Err("菜单位置无效。".into());}
    let window=view.window();let (tx,rx)=oneshot::channel();let native=window.clone();
    window.run_on_main_thread(move||{
        #[cfg(windows)]let result=(||{use windows_sys::Win32::UI::WindowsAndMessaging::*;
            let point=native.inner_position().map_err(|e|e.to_string())?;let scale=native.scale_factor().map_err(|e|e.to_string())?;let size=native.inner_size().map_err(|e|e.to_string())?;if x*scale>size.width as f64+1.||y*scale>size.height as f64+1.{return Err("菜单位置超出窗口。".into());}
            let hwnd=native.hwnd().map_err(|e|e.to_string())?.0 as _;
            unsafe{let menu=CreatePopupMenu();if menu.is_null(){return Err("无法创建系统菜单。".into());}
                for (i,item) in items.iter().enumerate(){let text:Vec<u16>=item.label.replace('&',"&&").encode_utf16().chain(Some(0)).collect();let flags=if item.separator==Some(true){MF_SEPARATOR}else{MF_STRING|if item.enabled==Some(false){MF_GRAYED}else{0}|if item.checked==Some(true){MF_CHECKED}else{0}};
                    if AppendMenuW(menu,flags,1000+i,text.as_ptr())==0{DestroyMenu(menu);return Err("无法创建系统菜单项目。".into());}}
                let selected=TrackPopupMenu(menu,TPM_RETURNCMD|TPM_NONOTIFY,point.x+(x*scale).round() as i32,point.y+(y*scale).round() as i32,0,hwnd,std::ptr::null());DestroyMenu(menu);
                Ok(items.get((selected as usize).wrapping_sub(1000)).filter(|v|v.enabled!=Some(false)&&v.separator!=Some(true)).map(|v|v.id.clone()))}
        })();
        #[cfg(not(windows))]let result:Result<Option<String>,String>=Err("此构建暂不支持原生菜单。".into());
        let _=tx.send(result);
    }).map_err(|e|e.to_string())?;
    rx.await.map_err(|_|"菜单窗口已关闭。")?.map(|id|json!(id))
}
#[tauri::command]
pub(super) async fn desktop_documents(app:AppHandle,view:Webview,host:State<'_,Host>,action:String,input:Value)->Result<Value,String>{
    let caller=role(&view,&host)?;if caller==Role::Startup{return Err("启动窗口不能操作作品。".into());}
    if action=="context"{return context(&view,&host);}
    if action=="list"{return Ok(snapshot(&host,view.window().label()));}
    if action=="report"{
        if caller!=Role::Document{return Err("只有作品可以上报自身状态。".into());}let id=document_id(&view).unwrap();let changed={let mut r=host.documents.lock().unwrap();let d=r.documents.get_mut(id).ok_or("作品已关闭。")?;let changed=apply_metadata(d,input)?;if changed{r.revision+=1;}changed};
        if changed{publish(&app);}deliver_ready_commands(&app);return Ok(Value::Null);
    }
    if action=="popup"{shell_only(&view,&host)?;return popup(&view,input).await;}
    if action=="close"{let id=input["id"].as_str().ok_or("缺少作品标识。")?;if caller==Role::Document&&document_id(&view)!=Some(id){return Err("不能关闭其它作品。".into());}let target=mutable_document(&host,id)?;if caller==Role::Shell&&target.window_id!=view.window().label(){return Err("只能关闭当前窗口的作品。".into());}if !target.home{close_documents(app.clone(),vec![id.into()],vec![],false).await?;}return Ok(Value::Null);}
    let _operation=host.document_gate.lock().await;
    if host.closing.load(Ordering::SeqCst){return Err("应用正在关闭。".into());}
    if action=="activate"{let id=input["id"].as_str().ok_or("缺少作品标识。")?;if caller==Role::Document&&document_id(&view)!=Some(id){return Err("不能激活其它作品。".into());}let d=mutable_document(&host,id)?;
        if caller==Role::Document&&!d.active{return Ok(Value::Null);}
        let changed={let mut r=host.documents.lock().unwrap();mark_active(&mut r,id)?};
        // A native focus event from the active child is an acknowledgement, not a
        // new activation: avoid focus -> invoke -> focus and global broadcasts.
        if !changed&&caller==Role::Document{return Ok(Value::Null);}
        if let Some(v)=app.get_webview(&label(id)){let _=v.window().set_focus();if d.visible{let _=v.set_focus();}}
        if changed{publish(&app);}return Ok(Value::Null);
    }
    let window_id=view.window().label().to_string();open_host(&host,&window_id)?;
    if action=="library-identity"{
        let id=document_id(&view).ok_or("文档窗口未就绪。")?;
        let key=library_key(&input["key"])?;
        let mut r=host.documents.lock().unwrap();
        if key.is_some()&&r.documents.values().any(|d|d.id!=id&&d.library_key.as_deref()==key){return Err("该文件已打开。".into());}
        r.documents.get_mut(id).ok_or("作品已关闭。")?.library_key=key.map(str::to_owned);
        return Ok(Value::Null);
    }
    if action=="focus-origin"{
        let doc=mutable_document(&host,document_id(&view).ok_or("需要 CP 编辑窗口。")?)?;
        let origin=mutable_document(&host,doc.return_to.as_deref().ok_or("未关联折序窗口。")?)?;
        focus_document(&app,&origin)?;return Ok(Value::Null);
    }
    if action=="open-workspace" {
        if caller==Role::Document {mutable_document(&host,document_id(&view).unwrap())?;}
        let workspace=input["workspace"].as_str().filter(|v|matches!(*v,"edit"|"design"|"tess"|"sim"|"diagram")).ok_or("工作区无效。")?;
        let transfer=input["transfer"].as_str();
        if transfer.is_some_and(|token|!valid_id(token)){return Err("工作区传递标识无效。".into());}
        let key=library_key(&input["libraryKey"])?;
        if let Some(key)=key{
            let existing={let r=host.documents.lock().unwrap();r.documents.values().find(|d|d.library_key.as_deref()==Some(key)).cloned()};
            if let Some(existing)=existing{
                mutable_document(&host,&existing.id)?;
                focus_document(&app,&existing)?;
                if let Some(child)=app.get_webview(&label(&existing.id)){let _=child.eval("window.dispatchEvent(new Event('zhezhi-file-already-open'))");}
                return Ok(json!({"id":existing.id,"windowId":existing.window_id,"alreadyOpen":true}));
            }
        }
        let origin=if input["returnToOrigin"]==true {
            let id=document_id(&view).ok_or("需要来源折序窗口。")?;
            if workspace!="edit"||mutable_document(&host,id)?.workspace!="diagram"{return Err("CP 返回目标无效。".into());}
            Some(id)
        }else{None};
        let initial=initial_command(json!({"initialCommand":input["initialCommand"]}))?;
        let target=if origin.is_some(){
            let id=format!("window-{}",Uuid::new_v4());
            create_host(&app,&id,workspace)?;
            id
        }else{window_id};
        match create_document(&app,&target,workspace,false,initial,transfer,key,origin) {
            Ok(id)=>return Ok(json!({"id":id,"windowId":target})),
            Err(error)=>{
                if origin.is_some(){
                    host.documents.lock().unwrap().windows.remove(&target);
                    if let Some(window)=app.get_window(&target){let _=window.destroy();}
                }
                publish(&app);return Err(error);
            }
        }
    }
    shell_only(&view,&host)?;
    match action.as_str(){
        "bounds"=>{let rects:Vec<RectInput>=serde_json::from_value(input["rects"].clone()).map_err(|_|"作品视口无效。")?;let parent=view.window();let physical=parent.inner_size().map_err(|e|e.to_string())?;let logical=physical.to_logical::<f64>(parent.scale_factor().map_err(|e|e.to_string())?);let mut seen=HashSet::new();
            for rect in &rects{let d=mutable_document(&host,&rect.id)?;if d.window_id!=window_id||!seen.insert(rect.id.clone()){return Err("作品不属于当前窗口或重复出现。".into());}validate_bounds(&Bounds{x:rect.x,y:rect.y,width:rect.width,height:rect.height},rect.visible,(logical.width,logical.height))?;}
            let mut changed=false;
            for rect in rects{let b=Bounds{x:rect.x,y:rect.y,width:rect.width,height:rect.height};let existing={host.documents.lock().unwrap().documents.get(&rect.id).cloned().unwrap()};if existing.bounds.as_ref()==Some(&b)&&existing.visible==rect.visible{continue;}
                let child=app.get_webview(&label(&rect.id)).ok_or("作品视图已关闭。")?;
                if !rect.visible{child.hide().map_err(|e|e.to_string())?;}if rect.width>=1.&&rect.height>=1.{child.set_bounds(tauri::Rect{position:LogicalPosition::new(rect.x,rect.y).into(),size:LogicalSize::new(rect.width,rect.height).into()}).map_err(|e|e.to_string())?;}if rect.visible{
                    child.show().map_err(|e|e.to_string())?;
                    if !existing.visible&&(existing.active||existing.home)&&parent.is_focused().unwrap_or(false){let _=child.set_focus();}
                }
                let mut r=host.documents.lock().unwrap();let d=r.documents.get_mut(&rect.id).unwrap();d.visible=rect.visible;d.bounds=Some(b);changed=true;}
            if changed{host.documents.lock().unwrap().revision+=1;publish(&app);}Ok(Value::Null)},
        "command"=>{let id=input["id"].as_str().ok_or("缺少作品标识。")?;let command=input["command"].as_str().filter(|v|command_valid(v)).ok_or("不支持此作品操作。")?;let d=mutable_document(&host,id)?;if d.window_id!=window_id{return Err("只能操作当前窗口的作品。".into());}if !d.ready||!d.handler_ready{return Err("作品仍在准备，请稍后操作。".into());}let child=app.get_webview(&label(id)).ok_or("作品已关闭。")?;child.eval(format!("window.__zhezhiDocumentCommand?.({});",json!(command))).map_err(|e|e.to_string())?;Ok(Value::Null)},
        _=>Err("不支持此作品窗口操作。".into())
    }
}
async fn probe(app:&AppHandle,ids:&[String])->bool{
    let host=app.state::<Host>();let mut tasks=tokio::task::JoinSet::new();let mut requests=Vec::new();
    for id in ids{let owner=label(id);let request=Uuid::new_v4().to_string();let (tx,rx)=oneshot::channel();host.close_replies.lock().unwrap().insert(request.clone(),CloseReply{owner:owner.clone(),sender:tx});requests.push(request.clone());
        if let Some(view)=app.get_webview(&owner){let _=view.eval(format!("window.__zhezhiBeforeClose?.({});",json!(request)));}
        tasks.spawn(async move{!matches!(tokio::time::timeout(Duration::from_secs(4),rx).await,Ok(Ok(false)))});}
    let mut dirty=ids.iter().any(|id|{let owner=label(id);host.exports.has_owner(&owner)||host.picker_owner.lock().unwrap().as_deref()==Some(owner.as_str())||host.documents.lock().unwrap().documents.get(id).is_some_and(|d|d.busy||d.saving)});while let Some(result)=tasks.join_next().await{dirty|=result.unwrap_or(true);}for request in requests{host.close_replies.lock().unwrap().remove(&request);}dirty
}
async fn close_documents(app:AppHandle,mut ids:Vec<String>,mut windows:Vec<String>,all:bool)->Result<(),String>{
    let host=app.state::<Host>();
    {let _gate=host.document_gate.lock().await;let mut r=host.documents.lock().unwrap();
        if r.closing_application{return Err("应用正在等待关闭确认。".into());}
        if all{windows=r.windows.keys().cloned().collect();}
        if !windows.is_empty(){if windows.iter().any(|id|!r.windows.contains_key(id)){return Err("窗口已关闭。".into());}ids=r.documents.values().filter(|d|windows.contains(&d.window_id)).map(|d|d.id.clone()).collect();}
        if ids.iter().any(|id|r.closing_documents.contains(id))||windows.iter().any(|id|r.closing_windows.contains(id)){return Err("窗口正在等待关闭确认。".into());}
        if all{r.closing_application=true;}for id in &ids{r.closing_documents.insert(id.clone());}for id in &windows{r.closing_windows.insert(id.clone());}}
    let _reservation=CloseReservation{app:app.clone(),ids:ids.clone(),windows:windows.clone(),all};
    let dirty=probe(&app,&ids).await;
    let accepted=if dirty{let parent={let r=host.documents.lock().unwrap();ids.iter().find_map(|id|r.documents.get(id).map(|d|d.window_id.clone())).or_else(||windows.first().cloned())}.and_then(|id|app.get_window(&id));
        tauri::async_runtime::spawn_blocking(move||{
            #[cfg(debug_assertions)]match std::env::var("ZHEZHI_TAURI_TEST_CLOSE_CHOICE").as_deref(){Ok("accept")=>return true,Ok("cancel")=>return false,_=>{}}
            let mut dialog=rfd::MessageDialog::new().set_title("关闭作品窗口").set_description("即将关闭的作品有未保存的修改、正在进行的操作，或尚未响应。关闭后，其中的计算将停止，未保存的修改可能丢失。\n\n是否不保存并关闭？").set_level(rfd::MessageLevel::Warning).set_buttons(rfd::MessageButtons::OkCancelCustom(CLOSE_CONFIRM_LABEL.into(),"继续编辑".into()));if let Some(parent)=&parent{dialog=dialog.set_parent(parent);}close_confirmation_accepted(&dialog.show())
        }).await.unwrap_or(false)
    }else{true};
    let _gate=host.document_gate.lock().await;
    if accepted{
        for id in &ids{let owner=label(id);let exports=host.exports.clone();let _=tauri::async_runtime::spawn_blocking(move||exports.cancel_owner(&owner)).await;if let Some(view)=app.get_webview(&label(id)){view.close().map_err(|e|e.to_string())?;}host.backend.release_document_workers(id);
            let mut r=host.documents.lock().unwrap();if let Some(d)=r.documents.remove(id){if let Some(w)=r.windows.get_mut(&d.window_id){w.document_ids.retain(|v|v!=id);if w.active_id.as_ref()==Some(id){w.active_id=w.document_ids.last().cloned();}}}}
        // Decide after removing the tabs under the operation lock. A second tab
        // may have opened or finished closing while the confirmation was pending.
        if windows.is_empty(){
            let r=host.documents.lock().unwrap();
            windows.extend(r.windows.values().filter(|w|w.id!="main"&&w.document_ids.is_empty()).map(|w|w.id.clone()));
        }
        for id in &windows{host.documents.lock().unwrap().windows.remove(id);if let Some(window)=app.get_window(id){window.destroy().map_err(|e|e.to_string())?;}}
    }else{activity(&host,"desktop.close.wait",json!({"reason":"unsaved-or-unresponsive","result":"cancelled"}));}
    {let mut r=host.documents.lock().unwrap();for id in &ids{r.closing_documents.remove(id);}for id in &windows{r.closing_windows.remove(id);}r.revision+=1;
        let active=r.windows.values().filter_map(|w|w.active_id.clone()).collect::<HashSet<_>>();for doc in r.documents.values_mut(){doc.active=active.contains(&doc.id);}}
    drop(_reservation);
    if host.documents.lock().unwrap().windows.is_empty(){request_exit(app.clone());}else{publish(&app);deliver_ready_commands(&app);}Ok(())
}
pub(super) fn request_host_close(app:AppHandle,id:String){tauri::async_runtime::spawn(async move{let _=close_documents(app,vec![],vec![id],false).await;});}
pub(super) fn request_app_close(app:AppHandle){tauri::async_runtime::spawn(async move{let _=close_documents(app,vec![],vec![],true).await;});}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn bounds_reject_nonfinite_outside_and_visible_empty_without_limiting_documents(){for b in [Bounds{x:f64::NAN,y:0.,width:1.,height:1.},Bounds{x:0.,y:0.,width:2000.,height:1.},Bounds{x:0.,y:0.,width:0.,height:0.}]{assert!(validate_bounds(&b,true,(1440.,1000.)).is_err());}assert!(validate_bounds(&Bounds{x:0.,y:96.,width:1440.,height:904.},true,(1440.,1000.)).is_ok());}
    #[test]fn document_commands_are_a_closed_vocabulary(){assert!(command_valid("workspace:diagram"));assert!(command_valid("save-artwork"));for c in ["eval","destroy","exit","workspace:other",""]{assert!(!command_valid(c));}}
    #[test]fn menu_rejects_duplicate_or_executable_payloads(){let item=|id:&str|MenuInput{id:id.into(),label:"项目".into(),enabled:None,checked:None,separator:None};assert!(validate_menu(&[item("save"),item("save")]).is_err());assert!(validate_menu(&[item("javascript:alert(1)")]).is_err());assert!(validate_menu(&[item("merge:11111111-1111-4111-8111-111111111111")]).is_ok());let mut shortcut=item("save");shortcut.label="保存\tCtrl+S".into();assert!(validate_menu(&[shortcut]).is_ok());let mut unsafe_label=item("save");unsafe_label.label="保存\n其它".into();assert!(validate_menu(&[unsafe_label]).is_err());}
    #[test]fn stable_document_id_and_label_are_not_native_parent_names(){let id=Uuid::new_v4().to_string();assert!(valid_id(&id));assert_eq!(label(&id),format!("doc-{id}"));assert!(!valid_id("main"));}
    #[tokio::test]async fn close_ack_cannot_consume_another_document_request(){let (tx,mut rx)=oneshot::channel();let replies=Mutex::new(HashMap::from([("request".into(),CloseReply{owner:"doc-owner".into(),sender:tx})]));assert!(!acknowledge_close(&replies,"doc-foreign","request",false));assert!(matches!(rx.try_recv(),Err(oneshot::error::TryRecvError::Empty)));assert!(acknowledge_close(&replies,"doc-owner","request",true));assert!(rx.await.unwrap());}
    #[test]fn invalid_metadata_is_atomic_and_cannot_change_document_identity(){let mut d=Document{home:false,id:"id".into(),title:"before".into(),window_id:"main".into(),active:true,dirty:false,busy:false,saving:false,ready:true,workspace:"edit".into(),visible:true,bounds:None,library_key:None,return_to:None,handler_ready:true,pending_command:None};assert!(apply_metadata(&mut d,json!({"title":"after","workspace":"invalid"})).is_err());assert_eq!(d.title,"before");assert!(apply_metadata(&mut d,json!({"workspace":"diagram","dirty":true})).is_err());assert_eq!(d.workspace,"edit");assert!(!d.dirty);assert!(apply_metadata(&mut d,json!({"id":"other"})).is_err());assert_eq!(d.id,"id");assert!(!apply_metadata(&mut d,json!({"title":"before","workspace":"edit"})).unwrap());}
    fn fixture_document(id:&str,active:bool)->Document{Document{home:false,id:id.into(),title:"作品".into(),window_id:"main".into(),active,dirty:false,busy:false,saving:false,ready:false,workspace:"edit".into(),visible:false,bounds:None,library_key:None,return_to:None,handler_ready:false,pending_command:None}}
    fn fixture_registry()->Registry{let mut r=Registry::default();r.windows.insert("main".into(),HostWindow{workspace:"edit".into(),id:"main".into(),title:"主窗口".into(),document_ids:vec!["one".into(),"two".into()],active_id:Some("one".into()),layout:"tabs".into(),ready:false});r.documents.insert("one".into(),fixture_document("one",true));r.documents.insert("two".into(),fixture_document("two",false));r}
    #[test]fn library_focus_does_not_create_or_select_a_file_tab(){
        let mut r=fixture_registry();
        let mut home=fixture_document("library",false);home.home=true;
        r.documents.insert("library".into(),home);
        assert!(!mark_active(&mut r,"library").unwrap());
        assert_eq!(r.windows["main"].active_id.as_deref(),Some("one"));
        let w=r.windows.get_mut("main").unwrap();
        w.document_ids.clear();w.active_id=None;
        assert!(!mark_active(&mut r,"library").unwrap());
        assert!(r.windows["main"].active_id.is_none());
        assert!(r.windows["main"].document_ids.is_empty());
    }
    #[test]fn unchanged_activation_is_idempotent_and_cannot_advance_global_revision(){let mut r=fixture_registry();assert!(!mark_active(&mut r,"one").unwrap());assert_eq!(r.revision,0);assert!(mark_active(&mut r,"two").unwrap());assert_eq!(r.revision,1);assert!(!r.documents["one"].active);assert!(r.documents["two"].active);for _ in 0..1000{assert!(!mark_active(&mut r,"two").unwrap());}assert_eq!(r.revision,1);}
    #[test]fn initial_commands_wait_for_listener_public_readiness_and_native_shell_then_deliver_once(){let mut r=fixture_registry();r.documents.get_mut("one").unwrap().pending_command=Some("open".into());assert!(take_ready_commands(&mut r).is_empty());r.documents.get_mut("one").unwrap().handler_ready=true;assert!(take_ready_commands(&mut r).is_empty());r.windows.get_mut("main").unwrap().ready=true;assert!(take_ready_commands(&mut r).is_empty());r.documents.get_mut("one").unwrap().ready=true;assert_eq!(take_ready_commands(&mut r),vec![("doc-one".into(),"open".into())]);assert!(take_ready_commands(&mut r).is_empty());let json=serde_json::to_value(&r.documents["one"]).unwrap();assert!(json.get("handler_ready").is_none()&&json.get("pending_command").is_none());}
    #[test]fn initial_command_input_is_closed_and_closing_documents_keep_their_pending_action(){assert_eq!(initial_command(json!({"initialCommand":"new"})).unwrap(),Some("new".into()));assert_eq!(initial_command(json!({})).unwrap(),None);for input in [json!({"initialCommand":"eval"}),json!({"initialCommand":"save"}),json!({"targetWindowId":"other"})]{assert!(initial_command(input).is_err());}let mut r=fixture_registry();r.windows.get_mut("main").unwrap().ready=true;let d=r.documents.get_mut("one").unwrap();d.ready=true;d.handler_ready=true;d.pending_command=Some("new".into());r.closing_documents.insert("one".into());assert!(take_ready_commands(&mut r).is_empty());r.closing_documents.clear();assert_eq!(take_ready_commands(&mut r).len(),1);}
}
