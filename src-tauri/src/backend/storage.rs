use super::ApiError;
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, HashSet}, fs::{self, OpenOptions}, io::{BufWriter,Write}, path::{Path, PathBuf}, sync::{Arc, Mutex, OnceLock, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use uuid::Uuid;

const KINDS: [&str; 3] = ["projectsDir", "diagramsDir", "dataDir"];
const LIBRARY_KEY: &str = "zhezhi.diagram-library.v1";
const DIAGRAM_KEY: &str = "zhezhi.diagram-project.v1";
const CREASE_LIBRARY_KEY: &str = "zhezhi.crease-library.v1";
const DESIGN_LIBRARY_KEY: &str = "zhezhi.base-design-library.v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoragePaths { pub projects_dir: PathBuf, pub diagrams_dir: PathBuf, pub data_dir: PathBuf }
impl StoragePaths {
    pub fn get(&self, kind: &str) -> Result<&PathBuf, ApiError> {
        match kind { "projectsDir" => Ok(&self.projects_dir), "diagramsDir" => Ok(&self.diagrams_dir), "dataDir" => Ok(&self.data_dir), _ => Err(ApiError::new(400, "保存目录类别无效。")) }
    }
    fn set(&mut self, kind: &str, path: PathBuf) -> Result<(), ApiError> {
        match kind { "projectsDir" => self.projects_dir = path, "diagramsDir" => self.diagrams_dir = path, "dataDir" => self.data_dir = path, _ => return Err(ApiError::new(400,"保存目录类别无效。")) }; Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
struct Config { version: u32, configured: bool, paths: StoragePaths }
struct Selection { kind: String, path: PathBuf, created: Instant }
struct StorageInner { root: PathBuf, defaults: StoragePaths, native_dialogs: bool, gate: Mutex<()>, selections: Mutex<HashMap<String, Selection>>, busy: AtomicBool }
#[derive(Clone)]
pub struct Storage(Arc<StorageInner>);

// These are disposable list/display caches, never authoritative document data.
// A changed file is decoded again, and opening a document always validates it.
#[derive(Clone,Debug,PartialEq,Eq,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FileStamp { bytes:u64, modified:String, created:Option<String> }
pub(crate) fn file_stamp(path:&Path)->Result<Option<FileStamp>,ApiError>{
    match fs::symlink_metadata(path){
        Err(error) if error.kind()==std::io::ErrorKind::NotFound=>Ok(None),
        Err(error)=>Err(error.into()),
        Ok(meta) if !meta.file_type().is_file()=>Err(ApiError::new(400,"缓存来源不是普通文件。")),
        Ok(meta)=>{
            let stamp=|time:std::io::Result<std::time::SystemTime>|time.ok().and_then(|time|time.duration_since(std::time::UNIX_EPOCH).ok()).map(|time|time.as_nanos().to_string());
            let modified=stamp(meta.modified()).ok_or_else(||ApiError::new(503,"无法读取文件修订时间。"))?;
            Ok(Some(FileStamp{bytes:meta.len(),modified,created:stamp(meta.created())}))
        }
    }
}
#[derive(Clone,PartialEq,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CachedSummary { pub stamp:FileStamp,pub value:Option<Value>,pub warning:Option<String> }
#[derive(PartialEq,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SummaryCache { version:u8,pub entries:HashMap<String,CachedSummary> }
impl Default for SummaryCache{fn default()->Self{Self{version:1,entries:HashMap::new()}}}
impl SummaryCache{
    pub fn read(path:&Path)->Self{regular_bytes(path,"列表缓存").ok().flatten().and_then(|bytes|serde_json::from_slice::<Self>(&bytes).ok()).filter(|cache|cache.version==1).unwrap_or_default()}
    pub fn write(&self,path:&Path){let _=atomic_json(path,self);}
}

pub(crate) fn regex(pattern: &str) -> Regex {
    static PATTERNS:OnceLock<Mutex<HashMap<String,Regex>>>=OnceLock::new();
    let mut patterns=PATTERNS.get_or_init(||Mutex::new(HashMap::new())).lock().expect("regex cache");
    patterns.entry(pattern.to_owned()).or_insert_with(||Regex::new(pattern).expect("constant regular expression")).clone()
}
pub(crate) fn digest(bytes: &[u8]) -> String { hex::encode(Sha256::digest(bytes)) }
pub(crate) fn canonical(path: &Path) -> String { let s=display_path(path).to_string_lossy().into_owned(); if cfg!(windows) {s.to_lowercase()} else {s} }
fn display_path(path:&Path)->PathBuf {
    #[cfg(windows)] {let value=path.to_string_lossy();if let Some(tail)=value.strip_prefix(r"\\?\UNC\"){return PathBuf::from(format!(r"\\{tail}"))}if let Some(tail)=value.strip_prefix(r"\\?\"){return PathBuf::from(tail)}}
    path.to_owned()
}
pub(crate) fn now() -> String { Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true) }
pub(crate) fn io_error(message: &str) -> ApiError { ApiError::new(503, message) }
pub(crate) fn json_write_error(error:serde_json::Error)->ApiError{
    if let Some(kind)=error.io_error_kind(){std::io::Error::new(kind,error).into()}else{error.into()}
}
pub(crate) fn read_json(path: &Path, label: &str) -> Result<Option<Value>, ApiError> {
    match fs::read(path) {
        Ok(bytes) => { let value: Value=serde_json::from_slice(&bytes).map_err(|_|ApiError::new(400,format!("{label}损坏或不可读取，原文件已保留。")))?; if value.is_null() {return Err(ApiError::new(400,format!("{label}损坏或不可读取，原文件已保留。")))} Ok(Some(value)) },
        Err(e) if e.kind()==std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(ApiError::new(400,format!("{label}损坏或不可读取，原文件已保留。")))
    }
}
pub(crate) fn atomic_bytes(path: &Path, bytes: &[u8]) -> Result<(), ApiError> {
    if let Some(parent)=path.parent() {fs::create_dir_all(parent)?;}
    let temporary=PathBuf::from(format!("{}.{}.tmp",path.to_string_lossy(),Uuid::new_v4()));
    let result=(|| {let mut f=OpenOptions::new().write(true).create_new(true).open(&temporary)?; f.write_all(bytes)?; f.sync_all()?; drop(f); fs::rename(&temporary,path)?; Ok::<_,ApiError>(())})();
    let _=fs::remove_file(&temporary);result
}
/// Serialize borrowed records directly to the temporary file. A complete JSON
/// byte vector would otherwise coexist with every large document tree.
pub(crate) fn atomic_json<T:Serialize+?Sized>(path: &Path, value: &T) -> Result<(), ApiError> {
    if let Some(parent)=path.parent(){fs::create_dir_all(parent)?;}
    let temporary=PathBuf::from(format!("{}.{}.tmp",path.to_string_lossy(),Uuid::new_v4()));
    let result=(||{let mut writer=BufWriter::new(OpenOptions::new().write(true).create_new(true).open(&temporary)?);
        serde_json::to_writer(&mut writer,value).map_err(json_write_error)?;writer.flush()?;writer.get_ref().sync_all()?;drop(writer);
        fs::rename(&temporary,path)?;Ok::<_,ApiError>(())})();
    let _=fs::remove_file(&temporary);result
}
pub(crate) fn regular_bytes(path: &Path, label: &str) -> Result<Option<Vec<u8>>, ApiError> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind()==std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
        Ok(m) if !m.file_type().is_file() => Err(ApiError::new(400,format!("{label}不是普通文件，原文件已保留。"))),
        Ok(_) => Ok(Some(fs::read(path)?))
    }
}
pub(crate) fn pid_alive(pid: u32) -> bool {
    if pid==0 {return false} if pid==std::process::id() {return true}
    #[cfg(windows)] unsafe {
        #[link(name="kernel32")] extern "system" {fn OpenProcess(access:u32,inherit:i32,pid:u32)->*mut std::ffi::c_void;fn GetExitCodeProcess(handle:*mut std::ffi::c_void,code:*mut u32)->i32;fn CloseHandle(handle:*mut std::ffi::c_void)->i32;fn GetLastError()->u32;}
        let handle=OpenProcess(0x1000,0,pid);if handle.is_null(){return GetLastError()!=87}
        let mut code=259; let ok=GetExitCodeProcess(handle,&mut code);CloseHandle(handle);ok==0||code==259
    }
    #[cfg(unix)] unsafe {extern "C" {fn kill(pid:i32,sig:i32)->i32;} kill(pid as i32,0)==0}
    #[cfg(not(any(windows,unix)))] {true}
}
pub(crate) struct IntentLock { path: PathBuf }
impl Drop for IntentLock {fn drop(&mut self){let _=fs::remove_file(&self.path);}}
pub(crate) fn intent_lock(directory: &Path, prefix: &str, message: &str) -> Result<IntentLock, ApiError> {
    fs::create_dir_all(directory)?;
    let name=format!("{prefix}{}.{}",std::process::id(),Uuid::new_v4());let path=directory.join(&name);
    OpenOptions::new().write(true).create_new(true).open(&path)?;
    let guard=IntentLock{path:path.clone()};
    for entry in fs::read_dir(directory)? {
        let entry=entry?;let other=entry.file_name().to_string_lossy().into_owned();
        if !other.to_lowercase().starts_with(&prefix.to_lowercase())||entry.path()==path {continue}
        let suffix=&other[prefix.len()..];let (pid,id)=suffix.split_once('.').ok_or_else(||ApiError::new(409,message))?;
        let pid=pid.parse::<u32>().ok().filter(|x|*x>0).ok_or_else(||ApiError::new(409,message))?;
        if !regex(r"^[a-f0-9-]{36}$").is_match(id)||pid_alive(pid) {return Err(ApiError::new(409,message))}
        if let Err(e)=fs::remove_file(entry.path()){if e.kind()!=std::io::ErrorKind::NotFound{return Err(e.into())}}
    }
    Ok(guard)
}
fn valid_key(key: &str) -> bool {key=="zhezhi-panel-layout-v1"||regex(r"^zhezhi\.[a-z-]+\.v1$").is_match(key)}
fn library_document_key(key:&str)->bool {regex(r"^zhezhi\.diagram-library-doc-[a-p]{1,64}\.v1$").is_match(key)}
fn document_diagram_key(key:&str)->bool {regex(r"^zhezhi\.document-[a-p]{32}-diagram-project\.v1$").is_match(key)}
fn diagram_key(key:&str)->bool {key==DIAGRAM_KEY||key==LIBRARY_KEY||library_document_key(key)||document_diagram_key(key)}
fn record_key(key:&str)->bool {key==DIAGRAM_KEY||key==DESIGN_LIBRARY_KEY||library_document_key(key)||document_diagram_key(key)}
fn diagram_record_name(name:&str)->bool {name.strip_suffix(".json").is_some_and(|key|record_key(key)&&diagram_key(key))}
fn validate_entries(value: Value)->Result<Map<String,Value>,ApiError> {
    let entries=value.as_object().ok_or_else(||ApiError::new(400,"桌面偏好设置格式无效或超过容量。"))?.clone();
    if entries.iter().any(|(k,v)|!valid_key(k)||!v.is_string()){return Err(ApiError::new(400,"桌面偏好设置格式无效或超过容量。"))}
    let ordinary:Map<String,Value>=entries.iter().filter(|(k,_)|!record_key(k)&&*k!=LIBRARY_KEY&&*k!=CREASE_LIBRARY_KEY).map(|(k,v)|(k.clone(),v.clone())).collect();
    if serde_json::to_vec(&ordinary).map_err(|e|ApiError::new(400,e.to_string()))?.len()>256*1024{return Err(ApiError::new(400,"桌面偏好设置格式无效或超过容量。"))}
    Ok(entries)
}
fn read_entries(file:&Path)->Result<Map<String,Value>,ApiError>{validate_entries(read_json(file,"桌面偏好设置")?.unwrap_or(json!({})))}
fn record_value(file:&Path,key:&str)->Result<Option<String>,ApiError>{
    match read_json(&file.parent().unwrap().join(format!("{key}.json")),"绘图记录")? {None=>Ok(None),Some(Value::String(s))=>Ok(Some(s)),_=>Err(ApiError::new(400,"绘图记录格式损坏，原文件已保留。"))}
}
fn current_value(file:&Path,key:&str,entries:&Map<String,Value>)->Result<Option<String>,ApiError>{
    if let Some(value)=entries.get(key){return Ok(value.as_str().map(str::to_owned))}
    if record_key(key){record_value(file,key)}else{Ok(None)}
}
fn preference_lock(file:&Path)->Result<IntentLock,ApiError>{
    let busy="保存设置正在由其他窗口更新，请稍后重试。";
    let guard=intent_lock(file.parent().unwrap(),&format!("{}.lock.",file.file_name().unwrap().to_string_lossy()),busy)?;
    let legacy=PathBuf::from(format!("{}.lock",file.to_string_lossy()));
    if legacy.exists(){let value=read_json(&legacy,"保存锁").map_err(|_|ApiError::new(409,busy))?.ok_or_else(||ApiError::new(409,busy))?;
        let pid=value["pid"].as_u64().filter(|p|*p>0&&*p<=u32::MAX as u64).ok_or_else(||ApiError::new(409,busy))?;
        if pid_alive(pid as u32){return Err(ApiError::new(409,busy))}
    }
    Ok(guard)
}
fn write_preference(file:&Path,key:&str,value:&str,entries:&Map<String,Value>)->Result<(),ApiError>{
    let mut next=entries.clone();if record_key(key)&&!value.is_empty(){next.remove(key);}else{next.insert(key.into(),Value::String(value.into()));}
    validate_entries(Value::Object(next.clone()))?;
    if record_key(key){let record=file.parent().unwrap().join(format!("{key}.json"));if value.is_empty(){atomic_json(file,&Value::Object(next))?;if let Err(e)=fs::remove_file(record){if e.kind()!=std::io::ErrorKind::NotFound{return Err(e.into())}}}else{atomic_json(&record,&Value::String(value.into()))?;if entries.contains_key(key){atomic_json(file,&Value::Object(next))?;}}}
    else{atomic_json(file,&Value::Object(next))?;}Ok(())
}
fn directory(path:&Path)->Result<PathBuf,ApiError>{
    if !path.is_absolute()||path.to_string_lossy().contains('\0'){return Err(ApiError::new(400,"请选择绝对路径的文件夹。"))}
    let real=fs::canonicalize(path).map_err(|_|ApiError::new(400,"选择的文件夹不存在或不可访问。"))?;
    if !real.is_dir(){return Err(ApiError::new(400,"选择的文件夹不存在或不可访问。"))}
    if real.parent().is_none(){return Err(ApiError::new(400,"不能使用磁盘根目录。"))}Ok(display_path(&real))
}
fn accessible(path:&Path)->Result<(),ApiError>{
    let real=directory(path)?;fs::read_dir(&real).map_err(|_|ApiError::new(503,"保存目录不可读取。"))?;
    #[cfg(windows)] {use std::os::windows::fs::OpenOptionsExt;OpenOptions::new().read(true).access_mode(3).custom_flags(0x02000000).open(&real).map_err(|_|ApiError::new(503,"保存目录不可读写。"))?;}
    #[cfg(not(windows))] if fs::metadata(&real)?.permissions().readonly(){return Err(ApiError::new(503,"保存目录不可写入。"))}
    Ok(())
}
fn managed_name(kind:&str,name:&str)->bool {
    match kind {
        "projectsDir"=>regex(r"^[a-f0-9-]{36}(?:\.draft)?\.json(?:\.bak)?$").is_match(name)||super::projects::is_workspace_draft_file(name),
        "diagramsDir"=>name=="preferences.json"||diagram_record_name(name),
        "dataDir"=>["preferences.json","recovery.json","recovery.json.bak","project-tombstones.json","project-tombstones.json.bak","desktop.log","app.log","activity.ndjson","activity.1.ndjson","activity.2.ndjson"].contains(&name)||name==format!("{DESIGN_LIBRARY_KEY}.json")||super::artwork::is_record_file(name),
        _=>false
    }
}
impl Storage {
    pub fn new(root:PathBuf,native_dialogs:bool)->Result<Self,ApiError>{
        let root=if root.is_absolute(){root}else{std::env::current_dir()?.join(root)};fs::create_dir_all(&root)?;
        let defaults=StoragePaths{projects_dir:root.join("projects"),diagrams_dir:root.join("diagrams"),data_dir:root.clone()};
        let this=Self(Arc::new(StorageInner{root,defaults,native_dialogs,gate:Mutex::new(()),selections:Mutex::new(HashMap::new()),busy:AtomicBool::new(false)}));
        let config=this.read_config()?;if !config.configured{for kind in KINDS{fs::create_dir_all(config.paths.get(kind)?)?;}}Ok(this)
    }
    fn config_file(&self)->PathBuf{self.0.root.join("storage-locations.json")}
    fn read_config(&self)->Result<Config,ApiError>{
        match read_json(&self.config_file(),"保存目录配置")? {
            None=>Ok(Config{version:1,configured:false,paths:self.0.defaults.clone()}),
            Some(value)=>{let config:Config=serde_json::from_value(value).map_err(|_|ApiError::new(400,"保存目录配置格式损坏，原文件已保留。"))?;
                if config.version!=1||KINDS.iter().any(|k|!config.paths.get(k).unwrap().is_absolute()){return Err(ApiError::new(400,"保存目录配置格式损坏，原文件已保留。"))}Ok(config)}
        }
    }
    pub fn paths(&self)->StoragePaths{self.read_config().map(|x|x.paths).unwrap_or_else(|_|self.0.defaults.clone())}
    fn unavailable(&self,paths:&StoragePaths)->Vec<Value>{KINDS.iter().filter_map(|kind|accessible(paths.get(kind).unwrap()).err().map(|e|json!({"kind":kind,"path":paths.get(kind).unwrap(),"message":e.message}))).collect()}
    fn active_lock(&self)->Result<bool,ApiError>{
        let file=self.0.root.join("storage-migration.lock");let Some(value)=read_json(&file,"存储迁移记录")? else{return Ok(false)};
        let pid=value["pid"].as_u64().filter(|x|*x>0&&*x<=u32::MAX as u64).ok_or_else(||ApiError::new(400,"存储迁移记录损坏。"))?;
        if !value["id"].is_string(){return Err(ApiError::new(400,"存储迁移记录损坏。"))}
        if pid_alive(pid as u32){Ok(true)}else{if read_json(&file,"存储迁移记录")?==Some(value){let _=fs::remove_file(file);}Ok(false)}
    }
    pub fn status(&self)->Value {
        match self.read_config(){Ok(c)=>json!({"configured":c.configured,"paths":c.paths,"defaults":self.0.defaults,"busy":self.0.busy.load(Ordering::SeqCst)||self.active_lock().unwrap_or(true),"platform":if cfg!(windows){"win32"}else{std::env::consts::OS},"pickerAvailable":self.0.native_dialogs,"unavailable":self.unavailable(&c.paths)}),Err(e)=>json!({"configured":false,"paths":self.0.defaults,"defaults":self.0.defaults,"busy":false,"platform":if cfg!(windows){"win32"}else{std::env::consts::OS},"pickerAvailable":self.0.native_dialogs,"unavailable":[{"kind":"dataDir","path":self.0.root,"message":e.message}]})}
    }
    pub fn assert_readable(&self,kind:&str)->Result<(),ApiError>{
        if !KINDS.contains(&kind){return Err(ApiError::new(400,"保存目录类别无效。"))}
        let paths=self.read_config()?.paths;if self.unavailable(&paths).iter().any(|x|x["kind"]==kind){return Err(ApiError::new(503,"原保存目录不可访问，请在保存位置设置中重新选择目录；原数据未改动。"))}Ok(())
    }
    pub fn assert_writable(&self,kind:&str)->Result<(),ApiError>{
        if !KINDS.contains(&kind){return Err(ApiError::new(400,"保存目录类别无效。"))}
        if self.active_lock()?{return Err(ApiError::new(409,"保存目录正在迁移，请完成后重试保存。"))}
        if !self.unavailable(&self.read_config()?.paths).is_empty(){return Err(ApiError::new(503,"原保存目录不可访问，请在保存位置设置中重新选择目录；原数据未改动。"))}Ok(())
    }
    pub fn with_write<T>(&self,work:impl FnOnce(&StoragePaths)->Result<T,ApiError>)->Result<T,ApiError>{let _guard=self.0.gate.lock().map_err(|_|io_error("保存队列不可用。"))?;self.assert_writable("dataDir")?;work(&self.read_config()?.paths)}
    pub fn with_read<T>(&self,kind:&str,work:impl FnOnce(&StoragePaths)->Result<T,ApiError>)->Result<T,ApiError>{let _guard=self.0.gate.lock().map_err(|_|io_error("保存队列不可用。"))?;self.assert_readable(kind)?;work(&self.read_config()?.paths)}
    /// Lists use an immutable directory selection. Source files are atomically
    /// replaced; scan work and cache building must not block unrelated prefs.
    pub(crate) fn snapshot_paths(&self,kind:&str)->Result<StoragePaths,ApiError>{self.with_read(kind,|paths|Ok(paths.clone()))}
    pub(crate) fn check_snapshot_paths(&self,kind:&str,paths:&StoragePaths)->Result<(),ApiError>{
        self.with_read(kind,|current|if canonical(current.get(kind)?)==canonical(paths.get(kind)?){Ok(())}else{Err(ApiError::new(409,"保存目录已切换，请刷新列表。"))})
    }
    pub fn preferences_snapshot(&self)->Result<Value,ApiError>{
        let _guard=self.0.gate.lock().map_err(|_|io_error("保存队列不可用。"))?;
        self.assert_readable("dataDir")?;self.assert_readable("diagramsDir")?;
        let paths=self.read_config()?.paths;let mut values=Map::new();
        for (directory,diagrams) in [(&paths.data_dir,false),(&paths.diagrams_dir,true)]{
            let entries=read_entries(&directory.join("preferences.json"))?;
            for (key,value) in entries{if !record_key(&key)&&diagram_key(&key)==diagrams{values.insert(key,value);}}
        }
        Ok(json!({"values":values}))
    }
    pub fn diagram_thumbnail(&self,key:&str)->Result<Value,ApiError>{
        if !library_document_key(key){return Err(ApiError::new(400,"绘图缩略图编号无效。"))}
        let paths=self.snapshot_paths("diagramsDir")?;
        let record=paths.diagrams_dir.join(format!("{key}.json"));
        let source=if file_stamp(&record)?.is_some(){record}else{paths.diagrams_dir.join("preferences.json")};
        let Some(stamp)=file_stamp(&source)?else{return Ok(json!({"thumbnail":null}))};
        let cache_file=paths.diagrams_dir.join(".zhezhi-diagram-thumbnail-cache.v1.json");let mut cache=SummaryCache::read(&cache_file);
        if let Some(hit)=cache.entries.get(key).filter(|entry|entry.stamp==stamp&&entry.warning.is_none()&&entry.value.as_ref().is_none_or(Value::is_string)){
            self.check_snapshot_paths("diagramsDir",&paths)?;return Ok(json!({"thumbnail":hit.value}));
        }
        // Decode only the outer stored JSON string and the thumbnail field.
        // Serde skips the entire project value without building its geometry.
        #[derive(Deserialize)]struct ThumbnailOnly{#[serde(default)]thumbnail:Option<String>}
        let text=self.get_item(key)?;
        let thumbnail=match text{None=>None,Some(text)=>serde_json::from_str::<ThumbnailOnly>(&text).map_err(|_|ApiError::new(400,"绘图缩略图记录损坏，原文件已保留。"))?.thumbnail};
        self.check_snapshot_paths("diagramsDir",&paths)?;
        if file_stamp(&source)?.as_ref()==Some(&stamp){cache.entries.insert(key.to_owned(),CachedSummary{stamp,value:thumbnail.clone().map(Value::String),warning:None});cache.write(&cache_file);}
        Ok(json!({"thumbnail":thumbnail}))
    }
    fn preference_file(&self,key:&str)->Result<PathBuf,ApiError>{let kind=if diagram_key(key){"diagramsDir"}else{"dataDir"};self.assert_readable(kind)?;Ok(self.read_config()?.paths.get(kind)?.join("preferences.json"))}
    fn migrate_preferences(&self,file:&Path)->Result<Map<String,Value>,ApiError>{
        let entries=read_entries(file)?;if !entries.iter().any(|(k,v)|record_key(k)&&v.as_str()!=Some("")){return Ok(entries)}
        self.assert_writable("dataDir")?;let _guard=preference_lock(file)?;let current=read_entries(file)?;let mut next=current.clone();
        for (key,value) in &current{if record_key(key)&&value.as_str()!=Some(""){let saved=record_value(file,key)?;let text=value.as_str().unwrap();if saved.as_deref().is_some_and(|s|s!=text){return Err(ApiError::new(400,"旧版与独立绘图记录不同，已保留两份内容，请先备份后恢复。"))}if saved.is_none(){atomic_json(&file.parent().unwrap().join(format!("{key}.json")),value)?;}next.remove(key);}}
        atomic_json(file,&Value::Object(next.clone()))?;Ok(next)
    }
    pub fn get_item(&self,key:&str)->Result<Option<String>,ApiError>{
        if !valid_key(key){return Err(ApiError::new(400,"不支持此偏好设置。"))}let _guard=self.0.gate.lock().map_err(|_|io_error("保存队列不可用。"))?;let file=self.preference_file(key)?;let entries=self.migrate_preferences(&file)?;current_value(&file,key,&entries)
    }
    pub fn set_item(&self,key:&str,value:&str)->Result<(),ApiError>{
        if !valid_key(key){return Err(ApiError::new(400,"不支持此偏好设置。"))}
        self.with_write(|_|{let file=self.preference_file(key)?;self.migrate_preferences(&file)?;let _guard=preference_lock(&file)?;let entries=read_entries(&file)?;if current_value(&file,key,&entries)?.as_deref()!=Some(value){write_preference(&file,key,value,&entries)?;}Ok(())})
    }
    pub fn compare_and_set(&self,key:&str,expected:Option<&str>,value:&str)->Result<bool,ApiError>{
        if !valid_key(key){return Err(ApiError::new(400,"条件保存设置格式无效。"))}
        let result=self.with_write(|_|{let file=self.preference_file(key)?;self.migrate_preferences(&file)?;let _guard=preference_lock(&file)?;let entries=read_entries(&file)?;let current=current_value(&file,key,&entries)?;if current.as_deref()!=expected{return Ok(false)}if !record_key(key)&&current.as_deref()==Some(value){return Ok(true)}write_preference(&file,key,value,&entries)?;Ok(true)});
        match result{Err(e) if e.status==409=>Ok(false),other=>other}
    }
    pub fn register_selection(&self,kind:&str,path:PathBuf)->Result<Value,ApiError>{
        if !KINDS.contains(&kind){return Err(ApiError::new(400,"保存目录类别无效。"))}let selected=directory(&path)?;let mut selections=self.0.selections.lock().map_err(|_|io_error("目录选择队列不可用。"))?;
        selections.retain(|_,s|s.created.elapsed()<Duration::from_secs(600));if selections.len()>=64{return Err(ApiError::new(400,"目录选择次数过多，请先应用设置。"))}let id=Uuid::new_v4().to_string();
        selections.insert(id.clone(),Selection{kind:kind.into(),path:selected.clone(),created:Instant::now()});Ok(json!({"cancelled":false,"selectionId":id,"path":selected}))
    }
    pub fn apply(&self,input:&Value)->Result<Value,ApiError>{
        let _guard=self.0.gate.lock().map_err(|_|io_error("保存队列不可用。"))?;
        let object=input.as_object().ok_or_else(||ApiError::new(400,"目录修改必须由选择窗口确认，并迁移后应用。"))?;
        if object.keys().any(|k|!["selections","migrate","recoverUnavailable"].contains(&k.as_str()))||input["migrate"]!=true||object.get("recoverUnavailable").is_some_and(|v|v!=true){return Err(ApiError::new(400,"目录修改必须由选择窗口确认，并迁移后应用。"))}
        let chosen=input["selections"].as_object().ok_or_else(||ApiError::new(400,"目录修改必须由选择窗口确认，并迁移后应用。"))?;
        if chosen.keys().any(|k|!KINDS.contains(&k.as_str())){return Err(ApiError::new(400,"保存目录类别无效。"))}
        let previous=self.read_config()?;let missing=self.unavailable(&previous.paths);let missing_kinds:HashSet<String>=missing.iter().filter_map(|x|x["kind"].as_str().map(str::to_owned)).collect();
        if !missing.is_empty()&&(input["recoverUnavailable"]!=true||missing_kinds.iter().any(|k|!chosen.contains_key(k))){return Err(ApiError::new(503,"原保存目录不可访问，请明确重新选择所有不可用目录后恢复。"))}
        let mut paths=previous.paths.clone();{
            let selections=self.0.selections.lock().map_err(|_|io_error("目录选择队列不可用。"))?;
            for(kind,id)in chosen{let selection=id.as_str().and_then(|id|selections.get(id)).filter(|s|s.kind==*kind&&s.created.elapsed()<Duration::from_secs(600)).ok_or_else(||ApiError::new(400,"目录选择已失效，请重新选择文件夹。"))?;paths.set(kind,directory(&selection.path)?)?;}
        }
        for kind in KINDS {let path=directory(paths.get(kind)?)?;paths.set(kind,path)?;}
        if KINDS.iter().map(|k|canonical(paths.get(k).unwrap())).collect::<HashSet<_>>().len()!=3{return Err(ApiError::new(400,"三类数据须使用不同文件夹，避免设置文件互相覆盖。"))}
        if self.active_lock()?{return Err(ApiError::new(409,"保存目录正在迁移，请完成后重试保存。"))}
        let lock_id=Uuid::new_v4().to_string();let lock_file=self.0.root.join("storage-migration.lock");let mut lock=OpenOptions::new().write(true).create_new(true).open(&lock_file).map_err(|e|if e.kind()==std::io::ErrorKind::AlreadyExists{ApiError::new(409,"保存目录正在迁移，请完成后重试保存。")}else{e.into()})?;lock.write_all(serde_json::to_string(&json!({"pid":std::process::id(),"id":lock_id}))?.as_bytes())?;drop(lock);self.0.busy.store(true,Ordering::SeqCst);
        let mut staged:Vec<(PathBuf,PathBuf,String)>=vec![];let mut verified:Vec<(PathBuf,PathBuf,String)>=vec![];
        let result=(||{
            for kind in KINDS{
                let source=previous.paths.get(kind)?;let target=paths.get(kind)?;let probe=target.join(format!(".zhezhi-write-test-{}",Uuid::new_v4()));OpenOptions::new().write(true).create_new(true).open(&probe).map_err(|_|ApiError::new(400,"目标文件夹无法写入，请选择其他文件夹。"))?;fs::remove_file(probe)?;
                if missing_kinds.contains(kind)||canonical(source)==canonical(target){continue}
                for entry in fs::read_dir(source)?{let entry=entry?;let name=entry.file_name().to_string_lossy().into_owned();if !managed_name(kind,&name){continue}if !entry.file_type()?.is_file(){return Err(ApiError::new(400,"原数据含有非普通文件，请先检查保存目录。"))}
                    let source_file=entry.path();let target_file=target.join(&name);let bytes=fs::read(&source_file)?;let hash=digest(&bytes);verified.push((source_file.clone(),target_file.clone(),hash.clone()));
                    if let Some(existing)=regular_bytes(&target_file,"目标文件")?{if digest(&existing)!=hash{return Err(ApiError::new(400,format!("目标已有不同的 {name}，请选择空文件夹；现有文件没有覆盖。")))}continue}
                    let temporary=PathBuf::from(format!("{}.zhezhi-migrate-{lock_id}.tmp",target_file.to_string_lossy()));let mut file=OpenOptions::new().write(true).create_new(true).open(&temporary)?;file.write_all(&bytes)?;file.sync_all()?;drop(file);staged.push((temporary.clone(),target_file,hash.clone()));
                    if digest(&fs::read(&temporary)?)!=hash||digest(&fs::read(&source_file)?)!=hash{return Err(ApiError::new(400,"迁移校验失败，原目录继续使用。"))}
                }
            }
            let mut copied=0;for(temporary,target,hash)in &staged{let mut dest=OpenOptions::new().write(true).create_new(true).open(target).map_err(|e|if e.kind()==std::io::ErrorKind::AlreadyExists{ApiError::new(400,"目标文件在迁移中发生变化，原目录继续使用。")}else{e.into()})?;dest.write_all(&fs::read(temporary)?)?;dest.sync_all()?;drop(dest);if digest(&fs::read(target)?)!=*hash{return Err(ApiError::new(400,"目标文件校验失败，原目录继续使用。"))}fs::remove_file(temporary)?;copied+=1;}
            for(source,target,hash)in &verified{if digest(&fs::read(source)?)!=*hash{return Err(ApiError::new(400,"原文件在迁移中发生变化，原目录继续使用。"))}if digest(&fs::read(target)?)!=*hash{return Err(ApiError::new(400,"目标文件在迁移中发生变化，原目录继续使用。"))}}
            if self.config_file().exists(){atomic_json(&self.0.root.join("storage-locations.json.bak"),&serde_json::to_value(&previous)?)?;}
            atomic_json(&self.config_file(),&serde_json::to_value(Config{version:1,configured:true,paths})?)?;self.0.selections.lock().map_err(|_|io_error("目录选择队列不可用。"))?.clear();
            let mut result=self.status();result["busy"]=json!(false);result["copiedFiles"]=json!(copied);result["retainedSource"]=json!(true);Ok(result)
        })();
        for(temporary,_,_)in &staged{let _=fs::remove_file(temporary);}if read_json(&lock_file,"存储迁移记录").ok().flatten().is_some_and(|x|x["id"]==lock_id){let _=fs::remove_file(lock_file);}self.0.busy.store(false,Ordering::SeqCst);result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn unchanged_small_preference_cas_preserves_file_and_still_rejects_conflicts(){
        let root=tempfile::tempdir().unwrap();let store=Storage::new(root.path().join("data"),false).unwrap();let key="zhezhi.theme.v1";
        store.set_item(key,"green").unwrap();let file=store.paths().data_dir.join("preferences.json");
        let old_time=std::time::UNIX_EPOCH+Duration::from_secs(1_600_000_000);
        fs::File::options().write(true).open(&file).unwrap().set_times(fs::FileTimes::new().set_modified(old_time)).unwrap();
        let original=fs::read(&file).unwrap();let stamp=file_stamp(&file).unwrap();
        assert!(store.compare_and_set(key,Some("green"),"green").unwrap());
        assert_eq!(fs::read(&file).unwrap(),original);assert_eq!(file_stamp(&file).unwrap(),stamp,"same-value CAS must not replace or sync the preferences file");
        assert!(!store.compare_and_set(key,Some("stale"),"green").unwrap());
        assert_eq!(fs::read(&file).unwrap(),original);assert_eq!(file_stamp(&file).unwrap(),stamp);
        assert!(store.compare_and_set(key,Some("green"),"blue").unwrap());assert_eq!(store.get_item(key).unwrap().as_deref(),Some("blue"));
        assert_ne!(file_stamp(&file).unwrap(),stamp,"changed values must still be persisted");
    }
    #[test]fn preference_snapshot_excludes_document_bodies_and_thumbnail_reads_skip_geometry(){
        let root=tempfile::tempdir().unwrap();let store=Storage::new(root.path().join("data"),false).unwrap();
        let paths=store.paths();let key="zhezhi.diagram-library-doc-abc.v1";
        atomic_json(&paths.data_dir.join("preferences.json"),&json!({"zhezhi.theme.v1":"green",(DESIGN_LIBRARY_KEY):"large design body"})).unwrap();
        atomic_json(&paths.diagrams_dir.join("preferences.json"),&json!({(LIBRARY_KEY):"small index",(DIAGRAM_KEY):"large drawing body"})).unwrap();
        assert_eq!(store.preferences_snapshot().unwrap(),json!({"values":{"zhezhi.theme.v1":"green",(LIBRARY_KEY):"small index"}}));
        let body=json!({"thumbnail":"data:image/svg+xml,<svg data-test=\"quoted\"/>","project":{"untrustedGeometry":"x".repeat(1024*1024)}}).to_string();
        store.set_item(key,&body).unwrap();assert_eq!(store.diagram_thumbnail(key).unwrap()["thumbnail"],"data:image/svg+xml,<svg data-test=\"quoted\"/>");
        store.set_item(key,&json!({"thumbnail":"replacement","project":null}).to_string()).unwrap();assert_eq!(store.diagram_thumbnail(key).unwrap()["thumbnail"],"replacement");
        assert_eq!(store.diagram_thumbnail("zhezhi.diagram-library-doc-missing.v1").unwrap_err().status,400);
        assert_eq!(store.diagram_thumbnail("../private").unwrap_err().status,400);
        assert!(store.preferences_snapshot().unwrap()["values"].get(key).is_none());
    }
    #[test] fn streaming_json_failure_keeps_previous_file_and_cleans_partial_temp(){
        struct Broken;
        impl Serialize for Broken{fn serialize<S:serde::Serializer>(&self,serializer:S)->Result<S::Ok,S::Error>{
            use serde::ser::{SerializeSeq,Error};let mut sequence=serializer.serialize_seq(Some(2))?;sequence.serialize_element(&"partial".repeat(4096))?;Err(S::Error::custom("intentional serialization failure"))
        }}
        let root=tempfile::tempdir().unwrap();let file=root.path().join("record.json");let original=json!({"preserve":"完整原文"});atomic_json(&file,&original).unwrap();
        assert!(atomic_json(&file,&Broken).is_err());assert_eq!(read_json(&file,"test").unwrap(),Some(original));
        assert_eq!(fs::read_dir(root.path()).unwrap().count(),1,"partial temporary files must not become recovery records");
    }
    #[test] fn streamed_disk_errors_keep_the_storage_failure_status(){
        struct Denied;
        impl Write for Denied{fn write(&mut self,_:&[u8])->std::io::Result<usize>{Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"denied"))}fn flush(&mut self)->std::io::Result<()>{Ok(())}}
        let error=serde_json::to_writer(Denied,&json!({"doc":"must remain on disk"})).unwrap_err();assert_eq!(json_write_error(error).status,503);
    }
    #[test] fn large_diagram_is_split_and_cas_is_atomic(){let root=tempfile::tempdir().unwrap();let s=Storage::new(root.path().join("data"),false).unwrap();let value="纸".repeat(3_000_001);s.set_item(DIAGRAM_KEY,&value).unwrap();assert_eq!(s.get_item(DIAGRAM_KEY).unwrap(),Some(value));assert!(!s.compare_and_set(DIAGRAM_KEY,None,"stale").unwrap());assert!(s.compare_and_set(DIAGRAM_KEY,s.get_item(DIAGRAM_KEY).unwrap().as_deref(),"").unwrap());assert_eq!(s.get_item(DIAGRAM_KEY).unwrap(),Some("".into()));assert!(!s.paths().diagrams_dir.join(format!("{DIAGRAM_KEY}.json")).exists());}
    #[test] fn large_base_design_is_a_managed_independent_record(){let root=tempfile::tempdir().unwrap();let s=Storage::new(root.path().join("data"),false).unwrap();let value="设计".repeat(150_000);assert!(s.compare_and_set(DESIGN_LIBRARY_KEY,None,&value).unwrap());assert_eq!(s.get_item(DESIGN_LIBRARY_KEY).unwrap().as_deref(),Some(value.as_str()));assert!(!s.compare_and_set(DESIGN_LIBRARY_KEY,None,"stale").unwrap());assert!(managed_name("dataDir",&format!("{DESIGN_LIBRARY_KEY}.json")));assert!(!read_entries(&s.paths().data_dir.join("preferences.json")).unwrap().contains_key(DESIGN_LIBRARY_KEY));}
    #[test] fn document_diagram_working_slots_are_private_large_records(){
        let root=tempfile::tempdir().unwrap();let s=Storage::new(root.path().join("data"),false).unwrap();
        let a="zhezhi.document-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-diagram-project.v1";let b="zhezhi.document-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-diagram-project.v1";
        let text="独立纸面".repeat(100_000);
        assert!(s.compare_and_set(a,None,&text).unwrap());assert!(s.compare_and_set(b,None,"other document").unwrap());
        assert_eq!(s.get_item(a).unwrap().as_deref(),Some(text.as_str()));assert_eq!(s.get_item(b).unwrap().as_deref(),Some("other document"));
        assert!(!s.compare_and_set(a,None,"stale owner").unwrap());assert_eq!(s.get_item(b).unwrap().as_deref(),Some("other document"));
        assert!(s.paths().diagrams_dir.join(format!("{a}.json")).is_file());assert!(!s.paths().data_dir.join(format!("{a}.json")).exists());
        assert!(s.preferences_snapshot().unwrap()["values"].get(a).is_none());assert!(managed_name("diagramsDir",&format!("{a}.json")));
        assert!(!managed_name("dataDir",&format!("{a}.json")));assert!(!document_diagram_key("zhezhi.document-not-an-id-diagram-project.v1"));
    }
    #[test] fn document_diagram_working_slot_follows_verified_directory_migration(){
        let root=tempfile::tempdir().unwrap();let s=Storage::new(root.path().join("data"),false).unwrap();let key="zhezhi.document-cccccccccccccccccccccccccccccccc-diagram-project.v1";
        assert!(s.compare_and_set(key,None,"private drawing").unwrap());let old=s.paths().diagrams_dir;let destination=root.path().join("new-diagrams");fs::create_dir(&destination).unwrap();
        let selection=s.register_selection("diagramsDir",destination.clone()).unwrap();s.apply(&json!({"migrate":true,"selections":{"diagramsDir":selection["selectionId"]}})).unwrap();
        assert_eq!(s.get_item(key).unwrap().as_deref(),Some("private drawing"));assert!(old.join(format!("{key}.json")).is_file());assert!(destination.join(format!("{key}.json")).is_file());
    }
    #[test] fn oversized_ordinary_preferences_do_not_replace_prior_value(){let root=tempfile::tempdir().unwrap();let s=Storage::new(root.path().join("data"),false).unwrap();s.set_item("zhezhi.theme.v1","light").unwrap();assert!(s.set_item("zhezhi.theme.v1",&"a".repeat(256*1024)).is_err());assert_eq!(s.get_item("zhezhi.theme.v1").unwrap(),Some("light".into()));}
    #[test] fn migration_conflict_keeps_source_and_old_configuration(){let root=tempfile::tempdir().unwrap();let s=Storage::new(root.path().join("data"),false).unwrap();let name="11111111-1111-4111-8111-111111111111.json";fs::write(s.paths().projects_dir.join(name),"original").unwrap();let target=root.path().join("selected");fs::create_dir(&target).unwrap();fs::write(target.join(name),"different").unwrap();let selection=s.register_selection("projectsDir",target.clone()).unwrap();assert!(s.apply(&json!({"migrate":true,"selections":{"projectsDir":selection["selectionId"]}})).is_err());assert_eq!(fs::read_to_string(s.paths().projects_dir.join(name)).unwrap(),"original");assert_eq!(fs::read_to_string(target.join(name)).unwrap(),"different");assert!(!s.status()["configured"].as_bool().unwrap());}
    #[test] fn independent_record_conflict_preserves_both_copies(){let root=tempfile::tempdir().unwrap();let s=Storage::new(root.path().join("data"),false).unwrap();let file=s.paths().diagrams_dir.join("preferences.json");atomic_json(&file,&json!({(DIAGRAM_KEY):"old"})).unwrap();atomic_json(&file.parent().unwrap().join(format!("{DIAGRAM_KEY}.json")),&json!("new")).unwrap();assert!(s.get_item(DIAGRAM_KEY).is_err());assert_eq!(read_json(&file,"test").unwrap().unwrap()[DIAGRAM_KEY],"old");}
}
