use super::{ApiError,activity::ActivityLog,artwork::ArtworkRecovery,projects::ProjectStore,storage::Storage,tess::TessWorker};
use axum::{body::{Body,to_bytes},extract::{DefaultBodyLimit,Request,State},http::{header,HeaderMap,HeaderValue,Method,StatusCode},response::{IntoResponse,Response},routing::any,Json,Router};
use serde_json::{json,Value};
use std::{collections::HashMap,net::SocketAddr,path::{Component,PathBuf},sync::Arc};
use tokio::{net::TcpListener,sync::{oneshot,Mutex},task::JoinHandle};
use uuid::Uuid;

#[derive(Clone,Debug)]
pub struct ServerConfig{pub data_root:PathBuf,pub dist_dir:PathBuf,pub engine_executable:PathBuf,pub engine_args:Vec<String>,pub version:String,pub native_dialogs:bool,pub port:u16}
pub struct AppState{
    pub storage:Storage,pub activity:ActivityLog,pub tess:TessWorker,pub design:TessWorker,pub token:String,
    pub version:String,pub native_dialogs:bool,pub port:u16,pub dist_dir:PathBuf,
    projects:ProjectStore,artwork:ArtworkRecovery,document_gate:Mutex<()>,
}
pub struct RunningServer{pub address:SocketAddr,pub state:Arc<AppState>,shutdown:Option<oneshot::Sender<()>>,task:Option<JoinHandle<()>>}
impl RunningServer{
    pub async fn shutdown(&mut self){
        if self.shutdown.is_none()&&self.task.is_none(){return;}
        // Stop accepting work before draining existing requests or closing logs.
        if let Some(tx)=self.shutdown.take(){let _=tx.send(());}
        self.state.tess.stop().await;
        self.state.design.stop().await;
        if let Some(mut task)=self.task.take(){if tokio::time::timeout(std::time::Duration::from_secs(3),&mut task).await.is_err(){task.abort();let _=task.await;}}
        finish_shutdown_log(self.state.activity.clone()).await;
    }
}

async fn finish_shutdown_log(activity:ActivityLog){
    let (finished,completion)=oneshot::channel();
    // A native thread is intentional: Tokio waits for started spawn_blocking
    // tasks when its runtime drops. A mutex or disk stall in such a task could
    // otherwise make the headless CLI hang after shutdown() had timed out.
    // This worker is detached only after its bounded wait; process teardown
    // never waits for it, while the ordinary path still writes and flushes.
    let worker=std::thread::Builder::new().name("zhezhi-shutdown-log".into()).spawn(move||{
        let append_error=activity.append(&json!({"action":"service.stop","level":"info","details":{"status":"stopped"}})).err();
        let flush_error=activity.flush().err();
        let _=finished.send(append_error.or(flush_error));
    });
    match worker{
        Ok(_worker)=>match tokio::time::timeout(std::time::Duration::from_millis(750),completion).await{
            Ok(Ok(Some(error)))=>eprintln!("关闭日志暂不可用：{error}"),
            Ok(Ok(None))=>{},
            Ok(Err(_))=>eprintln!("关闭日志任务意外结束，程序继续退出。"),
            Err(_)=>eprintln!("关闭日志等待已超时，程序继续退出；已提交的工程与日志仍保留。"),
        },
        Err(error)=>eprintln!("无法启动关闭日志任务，程序继续退出：{error}"),
    }
}
pub async fn start(config:ServerConfig)->Result<RunningServer,Box<dyn std::error::Error+Send+Sync>>{
    let storage=Storage::new(config.data_root,config.native_dialogs)?;
    let token=format!("{}{}",Uuid::new_v4().simple(),Uuid::new_v4().simple());
    let activity=ActivityLog::new(storage.clone(),config.version.clone(),vec![token.clone()]);
    let listener=TcpListener::bind(("127.0.0.1",config.port)).await?;let address=listener.local_addr()?;
    let state=Arc::new(AppState{projects:ProjectStore::new(storage.clone()),artwork:ArtworkRecovery::new(storage.clone()),document_gate:Mutex::new(()),storage,activity,
        tess:TessWorker::new(config.engine_executable,config.engine_args),design:TessWorker::design(std::env::current_exe()?),token,version:config.version,native_dialogs:config.native_dialogs,port:address.port(),dist_dir:config.dist_dir});
    let app=Router::new().fallback(any(handle)).layer(DefaultBodyLimit::disable()).with_state(state.clone());
    let (stop,stopped)=oneshot::channel();
    let task=tokio::spawn(async move{let _=axum::serve(listener,app).with_graceful_shutdown(async{let _=stopped.await;}).await;});
    let _=state.activity.append(&json!({"action":"service.start","level":"info","details":{"version":state.version,"runtime":"rust"}}));
    println!("折纸工坊已启动：http://127.0.0.1:{}",address.port());
    Ok(RunningServer{address,state,shutdown:Some(stop),task:Some(task)})
}

fn json_response(v:Value)->Response{let mut r=Json(v).into_response();r.headers_mut().insert(header::CACHE_CONTROL,HeaderValue::from_static("no-store"));r}
fn token(headers:&HeaderMap)->Option<&str>{headers.get("x-zhezhi-token").and_then(|v|v.to_str().ok())}
async fn body(request:Request,limit:Option<usize>,activity:bool)->Result<Value,ApiError>{
    let bytes=to_bytes(request.into_body(),limit.unwrap_or(usize::MAX)).await.map_err(|_|ApiError::new(413,if activity{"操作日志请求超过 16 KiB，请缩短诊断字段。"}else{"请求超过容量。"}))?;
    serde_json::from_slice(&bytes).map_err(|_|ApiError::new(400,"请求不是有效的 JSON 数据。"))
}
async fn blocking<F>(work:F)->Result<Value,ApiError>where F:FnOnce()->Result<Value,ApiError>+Send+'static{
    tokio::task::spawn_blocking(work).await.map_err(|_|ApiError::new(500,"本地操作任务意外结束，当前工程未改变。"))?
}
async fn handle(State(state):State<Arc<AppState>>,request:Request)->Response{
    let method=request.method().clone();let uri=request.uri().clone();let route=uri.path().to_owned();
    let response=dispatch(state.clone(),request).await;
    let mut response=match response{Ok(response)=>response,Err(error)=>{
        if route.starts_with("/api/")&&!route.starts_with("/api/activity"){
            let _=state.activity.append(&json!({"action":"api.failure","level":if error.status>=500{"error"}else{"warning"},"details":{"method":method.as_str(),"status":error.status,"operation":route.split('/').nth(2).unwrap_or("unknown"),"reason":error.message}}));
        }error.into_response()
    }};
    let headers=response.headers_mut();headers.insert("X-Content-Type-Options",HeaderValue::from_static("nosniff"));headers.insert("Referrer-Policy",HeaderValue::from_static("no-referrer"));headers.insert("Cross-Origin-Resource-Policy",HeaderValue::from_static("same-origin"));
    // The app, simulator iframe and computation workers all use this origin.
    // Isolation enables shared read-only calculation buffers without relaxing
    // the existing CSP, origin checks or native command permissions.
    headers.insert("Cross-Origin-Opener-Policy",HeaderValue::from_static("same-origin"));
    headers.insert("Cross-Origin-Embedder-Policy",HeaderValue::from_static("require-corp"));
    headers.insert("Content-Security-Policy",HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-src 'self'"));response
}

async fn dispatch(state:Arc<AppState>,request:Request)->Result<Response,ApiError>{
    let method=request.method().clone();let route=request.uri().path().to_owned();
    let query:HashMap<String,String>=url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes()).into_owned().collect();
    let host=request.headers().get(header::HOST).and_then(|v|v.to_str().ok()).unwrap_or("");
    if host!=format!("127.0.0.1:{}",state.port)&&host!=format!("localhost:{}",state.port){return Err(ApiError::new(403,"只允许本机访问。"))}
    if let Some(origin)=request.headers().get(header::ORIGIN){let origin=origin.to_str().unwrap_or("");if origin!=format!("http://127.0.0.1:{}",state.port)&&origin!=format!("http://localhost:{}",state.port)&&origin!="http://127.0.0.1:5173"{return Err(ApiError::new(403,"已拒绝外部网页访问本地工作台。"))}}
    if route=="/api/health"&&method==Method::GET{return Ok(json_response(json!({"ok":true,"app":"zhezhi-workbench","version":state.version,"runtime":"rust","token":state.token,"tessAvailable":state.tess.available()})))}
    if route.starts_with("/api/"){
        let activity_route=route.starts_with("/api/activity");
        if activity_route&&token(request.headers())!=Some(state.token.as_str()){return Err(ApiError::new(403,"操作日志需要当前本机会话，请刷新页面后重试。"))}
        if method!=Method::GET&&token(request.headers())!=Some(state.token.as_str()){return Err(ApiError::new(403,"会话已更新，请刷新页面后重试。"))}
        if route.starts_with("/api/storage")&&token(request.headers())!=Some(state.token.as_str()){return Err(ApiError::new(403,"保存设置需要当前本机会话，请刷新页面后重试。"))}
        // Backpressure starts before reading/decoding the HTTP body. The disk
        // mutex alone cannot prevent concurrent million-segment Value trees.
        // Waiting requests retain their streaming bodies and are never dropped.
        let document_route=route=="/api/recovery"||route=="/api/projects"||route.starts_with("/api/projects/")||route=="/api/artwork-recovery"||route.starts_with("/api/artwork-recovery/")||route=="/api/storage/preferences";
        let _document_guard=if document_route{Some(state.document_gate.lock().await)}else{None};
        if route=="/api/export/pdf-page"&&method==Method::POST{
            // Hold the permit through rendering, including after the client
            // cancels. Repeated cancellations cannot accumulate parallel pages.
            static PDF_GATE:std::sync::OnceLock<Arc<tokio::sync::Semaphore>>=std::sync::OnceLock::new();
            let permit=PDF_GATE.get_or_init(||Arc::new(tokio::sync::Semaphore::new(1))).clone().acquire_owned().await.map_err(|_|ApiError::new(503,"PDF 导出服务不可用。"))?;
            let input=body(request,None,false).await?;
            if !input.as_object().is_some_and(|o|o.len()==1&&o.contains_key("svg")){return Err(ApiError::new(400,"PDF 页面请求无效。"))}
            let svg=input["svg"].as_str().ok_or_else(||ApiError::new(400,"PDF 页面缺少 SVG。"))?.to_owned();drop(input);
            let bytes=tokio::task::spawn_blocking(move||{let _permit=permit;super::pdf::convert(&svg)}).await.map_err(|_|ApiError::new(500,"PDF 转换任务意外结束，未保存文件。"))??;
            return Ok(([(header::CONTENT_TYPE,"application/pdf"),(header::CACHE_CONTROL,"no-store")],bytes).into_response());
        }
        if route=="/api/activity"&&method==Method::GET{let log=state.activity.clone();let limit=query.get("limit").and_then(|s|s.parse::<f64>().ok()).filter(|n|n.is_finite()).map(|n|n.max(0.0)as usize).unwrap_or(100);return Ok(json_response(blocking(move||log.read(limit)).await?))}
        if route=="/api/activity"&&method==Method::POST{let input=body(request,Some(16384),true).await?;let log=state.activity.clone();let entry=blocking(move||log.append(&input)).await?;return Ok(json_response(json!({"ok":true,"entry":entry})))}
        if route=="/api/activity/export"&&method==Method::GET{let log=state.activity.clone();let mut response=json_response(blocking(move||log.export()).await?);response.headers_mut().insert(header::CONTENT_DISPOSITION,HeaderValue::from_static("attachment; filename=\"zhezhi-activity-log.json\""));return Ok(response)}
        if route=="/api/storage"&&method==Method::GET{return Ok(json_response(state.storage.status()))}
        if route=="/api/storage/pick"&&method==Method::POST{
            let input=body(request,Some(16384),false).await?;
            if !input.as_object().is_some_and(|o|o.keys().all(|k|k=="kind")){return Err(ApiError::new(400,"目录选择请求无效。"))}
            let kind=input["kind"].as_str().filter(|k|["projectsDir","diagramsDir","dataDir"].contains(k)).ok_or_else(||ApiError::new(400,"保存目录类别无效。"))?.to_owned();
            if !state.native_dialogs{return Err(ApiError::new(501,"浏览器模式不能直接选择系统目录，请使用桌面版。"))}
            #[cfg(feature="desktop")]{let storage=state.storage.clone();return Ok(json_response(blocking(move||match rfd::FileDialog::new().set_title("选择折纸工坊保存目录").pick_folder(){Some(path)=>storage.register_selection(&kind,path),None=>Ok(json!({"cancelled":true}))}).await?))}
            #[cfg(not(feature="desktop"))]{let _=kind;return Err(ApiError::new(501,"当前构建不能打开系统目录选择器。"))}
        }
        if route=="/api/storage/apply"&&method==Method::POST{let input=body(request,Some(16384),false).await?;let storage=state.storage.clone();let log=state.activity.clone();log.flush()?;return Ok(json_response(blocking(move||storage.apply(&input)).await?))}
        if route=="/api/storage/preferences"&&method==Method::GET{let key=query.get("key").cloned().unwrap_or_default();let storage=state.storage.clone();return Ok(json_response(blocking(move||Ok(json!({"value":storage.get_item(&key)?}))).await?))}
        if route=="/api/storage/preferences"&&method==Method::POST{
            let input=body(request,None,false).await?;
            if !input.as_object().is_some_and(|o|o.keys().all(|k|["key","value","expectedValue"].contains(&k.as_str())))||input.get("expectedValue").is_some_and(|v|!v.is_null()&&!v.is_string()){return Err(ApiError::new(400,"设置写入请求无效。"))}
            let key=input["key"].as_str().ok_or_else(||ApiError::new(400,"设置写入请求无效。"))?.to_owned();let value=input["value"].as_str().ok_or_else(||ApiError::new(400,"设置写入请求无效。"))?.to_owned();let storage=state.storage.clone();
            let changed=blocking(move||{let changed=if input.get("expectedValue").is_some(){storage.compare_and_set(&key,input["expectedValue"].as_str(),&value)?}else if key=="zhezhi.diagram-library.v1"{storage.compare_and_set(&key,None,&value)?}else{storage.set_item(&key,&value)?;true};Ok(json!(changed))}).await?;
            if changed!=true{return Err(ApiError::new(409,"绘图库已在其他窗口修改，请重新打开或另存当前绘图。"))}return Ok(json_response(json!({"ok":true})))
        }
        if route=="/api/artwork-recovery"&&method==Method::GET{let s=state.clone();return Ok(json_response(blocking(move||s.artwork.list()).await?))}
        if route=="/api/artwork-recovery"&&method==Method::POST{let input=body(request,None,false).await?;let s=state.clone();return Ok(json_response(blocking(move||s.artwork.put(&input)).await?))}
        if let Some(path)=route.strip_prefix("/api/artwork-recovery/"){
            if method==Method::GET&&!path.contains('/') {let id=path.to_owned();let s=state.clone();return Ok(json_response(blocking(move||s.artwork.get(&id)).await?))}
            if method==Method::POST&&path.ends_with("/delete")&&!path[..path.len()-7].contains('/') {let mut input=body(request,Some(16384),false).await?;if !input.as_object().is_some_and(|o|o.len()==1&&o.contains_key("expectedRevision")){return Err(ApiError::new(400,"完整作品恢复删除请求无效。"))}input["id"]=json!(&path[..path.len()-7]);let s=state.clone();return Ok(json_response(blocking(move||s.artwork.delete(&input)).await?))}
        }
        if route=="/api/projects"&&method==Method::GET{let s=state.clone();let library=query.get("library").is_some_and(|v|v=="1");return Ok(json_response(blocking(move||s.projects.list(library)).await?))}
        if (route=="/api/projects"||route=="/api/projects/draft")&&method==Method::POST{let input=body(request,None,false).await?;let draft=route.ends_with("/draft");let s=state.clone();return Ok(json_response(blocking(move||s.projects.save(&input,draft)).await?))}
        if let Some(path)=route.strip_prefix("/api/projects/"){
            if method==Method::GET{if let Some(id)=path.strip_suffix("/revision").filter(|id|!id.contains('/')){let id=id.to_owned();let s=state.clone();return Ok(json_response(blocking(move||s.projects.get_revision(&id)).await?))}}
            if let Some(id)=path.strip_suffix("/rename").filter(|id|!id.contains('/')){if method==Method::POST{let id=id.to_owned();let input=body(request,Some(16384),false).await?;let s=state.clone();return Ok(json_response(blocking(move||s.projects.rename(&id,&input)).await?))}}
            if !path.contains('/'){
                let id=path.to_owned();if method==Method::GET{let s=state.clone();let draft=query.get("draft").is_some_and(|v|v=="1");return Ok(json_response(blocking(move||s.projects.get(&id,draft)).await?))}
                if method==Method::DELETE{let s=state.clone();let value=blocking(move||s.projects.delete(&id)).await?;let _=state.activity.append(&json!({"action":"project.delete","level":if value.get("warning").is_some(){"warning"}else{"info"},"details":{"target":value["id"],"files":value["files"],"result":if value.get("warning").is_some(){"deleted-with-cleanup-warning"}else if value["deleted"]==true{"deleted"}else{"already-absent"}}}));let mut result=value;result.as_object_mut().unwrap().remove("files");return Ok(json_response(result))}
            }
        }
        if route=="/api/recovery"&&method==Method::GET{let s=state.clone();return Ok(json_response(blocking(move||s.projects.read_recovery()).await?))}
        if route=="/api/recovery"&&method==Method::POST{let input=body(request,None,false).await?;let s=state.clone();return Ok(json_response(blocking(move||s.projects.save_recovery(&input)).await?))}
        if route=="/api/design/cancel"&&method==Method::POST{state.design.stop().await;return Ok(json_response(json!({"cancelled":true})));}
        if route=="/api/design/compute"&&method==Method::POST{
            let input=body(request,Some(128*1024*1024),false).await?;
            return Ok(json_response(state.design.run(input).await?));
        }
        if method==Method::POST{if let Some(operation)=super::operations::operation(&route){
            let mut input=body(request,None,false).await?;
            if operation.is_none()&&input.get("operation").is_some(){return Err(ApiError::new(400,"折痕构造接口不接受分析操作。"))}
            if let Some(operation)=operation{if operation=="curved-canonical-generic"{input=json!({"operation":operation,"canonicalInput":input});}else{if !input.is_object(){input=json!({});}input["operation"]=json!(operation);}}
            if !state.tess.available(){return Err(ApiError::new(503,"镶嵌计算环境尚未就绪。请运行安装脚本后重试；其他工作区仍可使用。"))}
            return Ok(json_response(state.tess.run(input).await?))
        }}
        return Err(ApiError::new(404,"未找到请求的本地接口。"))
    }
    if method!=Method::GET&&method!=Method::HEAD{return Err(ApiError::new(405,"不支持此操作。"))}
    if route=="/_desktop/startup.html"{let content=include_str!("../startup.html");return Ok(([(header::CONTENT_TYPE,"text/html; charset=utf-8")],if method==Method::HEAD{""}else{content}).into_response())}
    let decoded=percent_encoding::percent_decode_str(&route).decode_utf8().map_err(|_|ApiError::new(400,"无效文件路径。"))?;
    if decoded.contains('\\')||decoded.contains('\0'){return Err(ApiError::new(403,"无效文件路径。"))}
    let relative=if decoded=="/"{"index.html"}else{decoded.trim_start_matches('/')};let path=std::path::Path::new(relative);
    if path.components().any(|c|!matches!(c,Component::Normal(_))){return Err(ApiError::new(403,"无效文件路径。"))}
    let root=std::fs::canonicalize(&state.dist_dir)?;let file=tokio::fs::canonicalize(root.join(path)).await?;if !file.starts_with(&root){return Err(ApiError::new(403,"无效文件路径。"))}
    let info=tokio::fs::metadata(&file).await?;if !info.is_file(){return Err(ApiError::new(404,"页面不存在。"))}
    let bytes=if method==Method::HEAD{Vec::new()}else{tokio::fs::read(&file).await?};let mime=match file.extension().and_then(|s|s.to_str()).unwrap_or(""){"html"=>"text/html; charset=utf-8","js"=>"text/javascript; charset=utf-8","css"=>"text/css; charset=utf-8","json"=>"application/json; charset=utf-8","svg"=>"image/svg+xml","png"=>"image/png","wasm"=>"application/wasm","md"=>"text/plain; charset=utf-8",_=>"application/octet-stream"};
    let mut response=Response::new(Body::from(bytes));*response.status_mut()=StatusCode::OK;response.headers_mut().insert(header::CONTENT_TYPE,HeaderValue::from_str(mime).unwrap());response.headers_mut().insert(header::CACHE_CONTROL,HeaderValue::from_static("no-cache"));response.headers_mut().insert(header::CONTENT_LENGTH,HeaderValue::from_str(&info.len().to_string()).unwrap());Ok(response)
}

#[cfg(test)]
mod shutdown_tests{
    use super::*;
    use std::{fs,sync::{atomic::{AtomicBool,Ordering},mpsc},time::{Duration,Instant}};
    use tempfile::tempdir;

    async fn service(root:&std::path::Path)->RunningServer{
        start(ServerConfig{data_root:root.join("data"),dist_dir:root.join("dist"),engine_executable:root.join("absent-engine.exe"),engine_args:vec![],version:"shutdown-tests".into(),native_dialogs:false,port:0}).await.unwrap()
    }

    #[tokio::test(flavor="multi_thread",worker_threads=2)]
    async fn document_queue_waits_before_polling_bodies_and_keeps_every_save(){
        use http_body_util::BodyExt;
        let dir=tempdir().unwrap();let mut server=service(dir.path()).await;let guard=server.state.document_gate.lock().await;
        let mut pending=Vec::new();let mut reads=Vec::new();
        for route in ["/api/recovery","/api/projects/draft"]{
            let read=Arc::new(AtomicBool::new(false));reads.push(read.clone());let payload=json!({"doc":{"name":route,"paper":{"width":200,"height":200},"segments":[]}}).to_string();
            let body=Body::new(Body::from(payload).map_frame(move|frame|{read.store(true,Ordering::SeqCst);frame}));
            let request=Request::builder().method(Method::POST).uri(route).header(header::HOST,format!("127.0.0.1:{}",server.state.port)).header("x-zhezhi-token",&server.state.token).body(body).unwrap();
            pending.push(tokio::spawn(dispatch(server.state.clone(),request)));
        }
        tokio::time::sleep(Duration::from_millis(20)).await;assert!(reads.iter().all(|read|!read.load(Ordering::SeqCst)),"waiting saves must not collect or parse their complete bodies");
        let health=Request::builder().uri("/api/health").header(header::HOST,format!("127.0.0.1:{}",server.state.port)).body(Body::empty()).unwrap();assert!(tokio::time::timeout(Duration::from_millis(500),dispatch(server.state.clone(),health)).await.unwrap().is_ok());
        drop(guard);for task in pending{assert_eq!(tokio::time::timeout(Duration::from_secs(2),task).await.unwrap().unwrap().unwrap().status(),StatusCode::OK);}
        assert!(reads.iter().all(|read|read.load(Ordering::SeqCst)));assert_eq!(server.state.projects.read_recovery().unwrap()["doc"]["name"],"/api/recovery");assert_eq!(server.state.projects.list(true).unwrap()["projects"].as_array().unwrap().len(),1);server.shutdown().await;
    }

    #[tokio::test(flavor="multi_thread",worker_threads=2)]
    async fn vector_pdf_endpoint_requires_session_and_returns_pdf_bytes(){
        let dir=tempdir().unwrap();let mut server=service(dir.path()).await;
        let svg=r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M10 10L90 90" stroke="black"/></svg>"#;
        let make=|authorised:bool,svg:&str|{
            let mut request=Request::builder().method(Method::POST).uri("/api/export/pdf-page").header(header::HOST,format!("127.0.0.1:{}",server.state.port));
            if authorised{request=request.header("x-zhezhi-token",&server.state.token);}
            request.body(Body::from(json!({"svg":svg}).to_string())).unwrap()
        };
        assert_eq!(dispatch(server.state.clone(),make(false,svg)).await.unwrap_err().status,403);
        let response=dispatch(server.state.clone(),make(true,svg)).await.unwrap();
        assert_eq!(response.headers()[header::CONTENT_TYPE],"application/pdf");
        let bytes=to_bytes(response.into_body(),usize::MAX).await.unwrap();assert!(bytes.starts_with(b"%PDF-"));
        let external=r#"<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///private.png"/></svg>"#;
        assert_eq!(dispatch(server.state.clone(),make(true,external)).await.unwrap_err().status,400);
        server.shutdown().await;
    }

    #[tokio::test(flavor="multi_thread",worker_threads=2)]
    async fn normal_shutdown_writes_stop_log_and_closes_listener_once(){
        let dir=tempdir().unwrap();let mut server=service(dir.path()).await;let file=server.state.storage.paths().data_dir.join("activity.ndjson");
        server.shutdown().await;server.shutdown().await;
        let text=fs::read_to_string(file).unwrap();let stops=text.lines().map(|line|serde_json::from_str::<Value>(line).unwrap()).filter(|entry|entry["action"]=="service.stop").count();
        assert_eq!(stops,1,"ordinary shutdown must persist exactly one stop record");
        assert!(TcpListener::bind(server.address).await.is_ok(),"the service port must be released");
    }

    #[tokio::test(flavor="multi_thread",worker_threads=2)]
    async fn actual_storage_mutex_contention_cannot_block_shutdown_timeout(){
        let dir=tempdir().unwrap();let mut server=service(dir.path()).await;let storage=server.state.storage.clone();
        let held=Arc::new(AtomicBool::new(false));let held_by_worker=held.clone();let (locked,entered)=mpsc::sync_channel(0);let (release,released)=mpsc::channel();
        let locker=std::thread::spawn(move||storage.with_write(|_|{
            held_by_worker.store(true,Ordering::SeqCst);locked.send(()).unwrap();
            // A fail-safe releases the real filesystem-write mutex even if the
            // assertion fails, so a regression cannot hang the test process.
            let _=released.recv_timeout(Duration::from_secs(6));
            held_by_worker.store(false,Ordering::SeqCst);Ok(())
        }));
        entered.recv_timeout(Duration::from_secs(2)).unwrap();let started=Instant::now();
        let completed=tokio::time::timeout(Duration::from_secs(2),server.shutdown()).await;
        let elapsed=started.elapsed();let held_after_shutdown=held.load(Ordering::SeqCst);
        let _=release.send(());locker.join().unwrap().unwrap();
        assert!(completed.is_ok(),"real storage-lock contention must not prevent the outer timeout");
        assert!(elapsed<Duration::from_secs(2),"shutdown waited {elapsed:?}");
        assert!(held_after_shutdown,"shutdown must return while the real storage-write mutex is still held");
        assert!(TcpListener::bind(server.address).await.is_ok(),"stop accepting requests before waiting for logging");
        // Let the detached normal writer finish after the test releases the
        // contention; its only work is the original append/flush sequence.
        let file=server.state.storage.paths().data_dir.join("activity.ndjson");
        tokio::time::timeout(Duration::from_secs(2),async{
            loop{if fs::read_to_string(&file).is_ok_and(|text|text.lines().filter_map(|line|serde_json::from_str::<Value>(line).ok()).any(|entry|entry["action"]=="service.stop")){break}tokio::time::sleep(Duration::from_millis(10)).await;}
        }).await.expect("released disk work should retain the ordinary stop log");
        let activity=server.state.activity.clone();tokio::task::spawn_blocking(move||activity.flush()).await.unwrap().unwrap();
    }
}
