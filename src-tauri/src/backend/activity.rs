use super::{ApiError, storage::{Storage, now, regex}};
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{json, Map, Value};
use std::{fs::{self, OpenOptions}, io::{Read, Seek, SeekFrom, Write}, path::Path, sync::{Arc, Mutex, atomic::{AtomicUsize, Ordering}}};
use uuid::Uuid;

const FILE_BYTES: usize = 2 * 1024 * 1024;
const ENTRY_BYTES: usize = 8192;
const MAX_READ: usize = 1000;
const MAX_EXPORT: usize = 10000;
const MAX_PENDING: usize = 128;
const NAMES: [&str; 3] = ["activity.ndjson", "activity.1.ndjson", "activity.2.ndjson"];
const RETENTION: &str = "日志仅保留最近最多 3 份，每份最多 2 MiB；更早记录可能已轮转清理。";
const DETAIL_KEYS: &[&str] = &["fileName","reason","format","stage","result","segments","objects","bytes","durationMs","status","method","code","count","files","models","vertices","faces","operation","version","sessionId","workspace","previous","target","tool","source","line","column","attempt","mode"];

fn truncate_utf16(value: &str, limit: usize) -> String {
    let mut length=0; value.chars().take_while(|ch|{length+=ch.len_utf16();length<=limit}).collect()
}
fn clean_text(input:&str,key:&str,secrets:&[String])->String {
    let mut value=input.to_owned();
    for secret in secrets.iter().filter(|s|!s.is_empty()) {value=value.replace(secret,"[已过滤]");}
    let looks_like_payload=|text:&str|regex(r#"(?i)^\s*(?:data:|\{)|^\s*\[\s*(?:\[|\"|-?\d|true\b|false\b|null\b)"#).is_match(text);
    if looks_like_payload(&value) {return "[已过滤内容]".into()}
    if key=="fileName"||key=="source" {value=value.split(['?','#']).next().unwrap_or("").rsplit(['\\','/']).next().unwrap_or("").to_owned();}
    value=regex(r"[\x00-\x1f\x7f]+").replace_all(&value," ").trim().to_owned();
    if regex(r"[{}<>]").is_match(&value)||looks_like_payload(&value) {return "[已过滤内容]".into()}
    value=regex(r"(?i)(?:token|authorization|bearer|password|secret|cookie)\s*[:=]?\s*\S+").replace_all(&value,"[已过滤]").into_owned();
    value=regex(r"[a-fA-F0-9]{32,}").replace_all(&value,"[已过滤]").into_owned();
    value=regex(r"(?i)(?:https?|file|data):\S+").replace_all(&value,"[地址]").into_owned();
    value=regex(r#"[a-zA-Z]:[\\/][^\s，。；\"'<>]*"#).replace_all(&value,"[路径]").into_owned();
    value=regex(r#"\\\\[^\s，。；\"'<>]*"#).replace_all(&value,"[路径]").into_owned();
    value=regex(r#"(^|[\s(])/(?:[^\s，。；\"'<>]+)"#).replace_all(&value,"${1}[路径]").into_owned();
    truncate_utf16(&value,if key=="reason"{400}else if key=="fileName"||key=="source"{160}else{120})
}

pub fn sanitize_activity(input:&Value,secrets:&[String])->Result<Value,ApiError> {
    let object=input.as_object().filter(|o|o.keys().all(|k|["action","level","details"].contains(&k.as_str()))).ok_or_else(||ApiError::new(400,"操作日志仅接受 action、level 和 details 字段。"))?;
    let action=input["action"].as_str().filter(|s|regex(r"^[a-zA-Z][a-zA-Z0-9._-]{0,79}$").is_match(s)&&!regex(r"[a-fA-F0-9]{32,}").is_match(s)&&!secrets.iter().any(|secret|!secret.is_empty()&&s.contains(secret))).ok_or_else(||ApiError::new(400,"操作日志 action 须为 1 至 80 个字母、数字、点、下划线或连字符。"))?;
    let level=object.get("level").map(|v|v.as_str()).unwrap_or(Some("info")).filter(|s|["info","warning","error"].contains(s)).ok_or_else(||ApiError::new(400,"操作日志级别须为 info、warning 或 error。"))?;
    let mut details=Map::new();
    if let Some(value)=object.get("details") {
        let fields=value.as_object().ok_or_else(||ApiError::new(400,"操作日志 details 须为小型标量对象。"))?;
        for (key,value) in fields {
            if !DETAIL_KEYS.contains(&key.as_str()) {continue}
            let next=if value.is_null()||value.is_boolean(){Some(value.clone())}
                else if value.as_f64().is_some_and(|n|n.is_finite()&&n.abs()<=1e12){Some(value.clone())}
                else{value.as_str().map(|text|Value::String(clean_text(text,key,secrets)))};
            if let Some(value)=next {details.insert(key.clone(),value);}
        }
    }
    Ok(json!({"action":action,"level":level,"details":details}))
}

struct Inner { storage:Storage, version:String, secrets:Vec<String>, file_bytes:usize, gate:Mutex<()>, pending:AtomicUsize }
#[derive(Clone)]
pub struct ActivityLog(Arc<Inner>);
struct Pending<'a>(&'a AtomicUsize);
impl Drop for Pending<'_> {fn drop(&mut self){self.0.fetch_sub(1,Ordering::SeqCst);}}

impl ActivityLog {
    pub fn new(storage:Storage,version:String,secrets:Vec<String>)->Self {Self::with_budget(storage,version,secrets,FILE_BYTES)}
    fn with_budget(storage:Storage,version:String,secrets:Vec<String>,file_bytes:usize)->Self {
        assert!((256..=FILE_BYTES).contains(&file_bytes));
        Self(Arc::new(Inner{storage,version,secrets,file_bytes,gate:Mutex::new(()),pending:AtomicUsize::new(0)}))
    }
    fn scheduled<T>(&self,work:impl FnOnce(&Path)->Result<T,ApiError>)->Result<T,ApiError>{
        let previous=self.0.pending.fetch_add(1,Ordering::SeqCst);let _pending=Pending(&self.0.pending);
        if previous>=MAX_PENDING{return Err(ApiError::new(429,"操作日志正在处理较多记录，请稍后重试；工程编辑仍可继续。"))}
        let _guard=self.0.gate.lock().map_err(|_|ApiError::new(503,"操作日志暂不可用，请检查程序数据目录权限或剩余空间；工程编辑仍可继续。"))?;
        let result=self.0.storage.with_write(|paths|work(&paths.data_dir));
        result.map_err(|e|if e.status==500{ApiError::new(503,"操作日志暂不可用，请检查程序数据目录权限或剩余空间；工程编辑仍可继续。")}else{e})
    }
    pub fn append(&self,event:&Value)->Result<Value,ApiError>{
        let safe=sanitize_activity(event,&self.0.secrets)?;
        let entry=json!({"id":Uuid::new_v4().to_string(),"timestamp":now(),"appVersion":self.0.version,"action":safe["action"],"level":safe["level"],"details":safe["details"]});
        let mut line=serde_json::to_vec(&entry)?;line.push(b'\n');
        if line.len()>ENTRY_BYTES||line.len()>self.0.file_bytes{return Err(ApiError::new(413,"操作日志单条内容超过容量，请缩短诊断字段。"))}
        self.scheduled(|directory|{
            fs::create_dir_all(directory)?;let files=NAMES.map(|name|directory.join(name));
            let size=match fs::metadata(&files[0]){Ok(m)=>m.len(),Err(e)if e.kind()==std::io::ErrorKind::NotFound=>0,Err(e)=>return Err(e.into())};
            let mut separator=false;
            if size>0 {let mut file=fs::File::open(&files[0])?;file.seek(SeekFrom::End(-1))?;let mut last=[0];file.read_exact(&mut last)?;separator=last[0]!=b'\n';}
            if size+usize::from(separator)as u64+line.len()as u64>self.0.file_bytes as u64 {
                if let Err(e)=fs::remove_file(&files[2]){if e.kind()!=std::io::ErrorKind::NotFound{return Err(e.into())}}
                for i in (0..=1).rev(){if let Err(e)=fs::rename(&files[i],&files[i+1]){if e.kind()!=std::io::ErrorKind::NotFound{return Err(e.into())}}}
                separator=false;
            }
            let mut file=OpenOptions::new().create(true).append(true).open(&files[0])?;
            if separator{file.write_all(b"\n")?;}file.write_all(&line)?;file.sync_data()?;Ok(entry)
        })
    }
    fn snapshot(&self,limit:usize)->Result<Value,ApiError>{
        self.scheduled(|directory|{
            let mut entries:Vec<Value>=vec![];let mut notes=vec![RETENTION.to_owned()];let mut truncated=false;let mut skipped=0;let mut oldest_present=false;
            for name in NAMES.iter().rev(){
                let path=directory.join(name);let mut file=match fs::File::open(&path){Ok(f)=>f,Err(e)if e.kind()==std::io::ErrorKind::NotFound=>continue,Err(e)=>return Err(e.into())};
                let size=file.metadata()?.len();if size==0{continue}if *name==NAMES[2]{oldest_present=true}
                let length=size.min(self.0.file_bytes as u64);let start=size-length;file.seek(SeekFrom::Start(start))?;let mut bytes=vec![0;length as usize];file.read_exact(&mut bytes)?;
                let mut text=String::from_utf8_lossy(&bytes).into_owned();if start>0 {if let Some(index)=text.find('\n'){text=text[index+1..].to_owned();}truncated=true;}
                for line in text.lines().filter(|line|!line.trim().is_empty()) {
                    let parsed=(||{
                        if line.len()>ENTRY_BYTES{return None}let raw:Value=serde_json::from_str(line).ok()?;
                        let id=raw["id"].as_str().filter(|id|regex(r"(?i)^[a-f0-9-]{36}$").is_match(id))?;
                        let timestamp=DateTime::parse_from_rfc3339(raw["timestamp"].as_str()?).ok()?.with_timezone(&Utc).to_rfc3339_opts(SecondsFormat::Millis,true);
                        let mut input=Map::new();input.insert("action".into(),raw["action"].clone());for key in ["level","details"]{if let Some(value)=raw.get(key){input.insert(key.into(),value.clone());}}
                        let safe=sanitize_activity(&Value::Object(input),&self.0.secrets).ok()?;
                        let version=raw["appVersion"].as_str().filter(|s|regex(r"^[A-Za-z0-9_.+-]{1,40}$").is_match(s)).unwrap_or(&self.0.version);
                        Some(json!({"id":id,"timestamp":timestamp,"appVersion":version,"action":safe["action"],"level":safe["level"],"details":safe["details"]}))
                    })();
                    if let Some(entry)=parsed{entries.push(entry)}else{skipped+=1}
                }
                if entries.len()>limit {entries.drain(0..entries.len()-limit);truncated=true;}
            }
            if oldest_present{truncated=true;notes.push("已达到轮转文件数量上限，不能保证包含更早历史。".into());}
            if skipped>0{truncated=true;notes.push(format!("已跳过 {skipped} 条损坏、截断或不受支持的记录。"));}
            if truncated{notes.push("本次仅返回读取上限内的最近有效记录。".into());}
            Ok(json!({"appVersion":self.0.version,"entries":entries,"truncated":truncated,"notes":notes,"limits":{"fileBytes":self.0.file_bytes,"fileCount":3,"totalBytes":self.0.file_bytes*3,"maxReadEntries":MAX_READ,"maxExportEntries":MAX_EXPORT}}))
        })
    }
    pub fn read(&self,limit:usize)->Result<Value,ApiError>{
        if !(1..=MAX_READ).contains(&limit){return Err(ApiError::new(400,"日志条数须为 1 至 1000 的整数。"))}self.snapshot(limit)
    }
    pub fn export(&self)->Result<Value,ApiError>{let mut result=self.snapshot(MAX_EXPORT)?;result["format"]=json!("zhezhi-activity-log");result["version"]=json!(1);result["generatedAt"]=json!(now());Ok(result)}
    pub fn flush(&self)->Result<(),ApiError>{let _guard=self.0.gate.lock().map_err(|_|ApiError::new(503,"操作日志写入队列不可用。"))?;Ok(())}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn sanitizer_removes_payloads_paths_and_secrets(){
        let safe=sanitize_activity(&json!({"action":"import.failed","details":{"fileName":"C:/private/a.cp?token=123","source":"https://host/private/test.fold#secret","reason":"failed C:/private/a.cp token=abc abcdef0123456789abcdef0123456789","result":"{\"private\":1}","ignored":"private","count":4,"objects":{"private":1}}}),&[]).unwrap();
        assert_eq!(safe["details"]["fileName"],"a.cp");assert_eq!(safe["details"]["source"],"test.fold");assert_eq!(safe["details"]["result"],"[已过滤内容]");assert!(!safe["details"]["reason"].as_str().unwrap().contains("private"));assert!(safe["details"].get("ignored").is_none());assert!(safe["details"].get("objects").is_none());
        assert!(sanitize_activity(&json!({"action":"valid","text":"should reject"}),&[]).is_err());
    }
    #[test]fn rotation_recovers_truncated_records_and_reports_history_bounds(){
        let root=tempfile::tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let log=ActivityLog::with_budget(storage.clone(),"test".into(),vec![],1024);
        fs::write(storage.paths().data_dir.join(NAMES[0]),"{crash-truncated").unwrap();for i in 0..20{log.append(&json!({"action":"test.event","details":{"count":i}})).unwrap();}
        let result=log.read(100).unwrap();assert!(result["truncated"].as_bool().unwrap());assert!(!result["entries"].as_array().unwrap().is_empty());assert_eq!(result["entries"].as_array().unwrap().last().unwrap()["details"]["count"],19);
        for name in NAMES{assert!(fs::metadata(storage.paths().data_dir.join(name)).unwrap().len()<=1024);}
        assert_eq!(log.export().unwrap()["format"],"zhezhi-activity-log");assert!(log.read(0).is_err());
    }
    #[test]fn logs_follow_approved_data_directory_change(){
        let root=tempfile::tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let log=ActivityLog::new(storage.clone(),"test".into(),vec![]);log.append(&json!({"action":"before"})).unwrap();let dest=root.path().join("new-data");fs::create_dir(&dest).unwrap();let selection=storage.register_selection("dataDir",dest.clone()).unwrap();storage.apply(&json!({"migrate":true,"selections":{"dataDir":selection["selectionId"]}})).unwrap();log.append(&json!({"action":"after"})).unwrap();let lines=fs::read_to_string(dest.join(NAMES[0])).unwrap();assert!(lines.contains("before")&&lines.contains("after"));
    }
}
