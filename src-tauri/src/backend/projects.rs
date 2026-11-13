use super::{ApiError,storage::{Storage,StoragePaths,SummaryCache,CachedSummary,file_stamp,json_write_error,regular_bytes,digest},validation::validate_doc};
use chrono::{DateTime,Utc};
use serde::Serialize;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::HashMap,fs::{self,OpenOptions},io::{BufWriter,Read,Write},path::{Path,PathBuf}};
use uuid::Uuid;

#[cfg(test)]
#[path="project_workspace_tests.rs"]
mod workspace_tests;

pub fn valid_id(s:&str)->bool{s.len()==36&&s.bytes().enumerate().all(|(i,b)|if [8,13,18,23].contains(&i){b==b'-'}else{b.is_ascii_digit()||(b'a'..=b'f').contains(&b)})}
fn timestamp()->String{Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true)}
fn parsed_time(v:&Value)->Option<i64>{DateTime::parse_from_rfc3339(v.as_str()?).ok().map(|d|d.timestamp_millis())}
fn decode(bytes:&[u8])->Result<Value,ApiError>{serde_json::from_slice(bytes).map_err(|_|ApiError::new(400,"工程文件格式损坏，原文件已保留。"))}
fn path(root:&Path,id:&str,draft:bool)->PathBuf{root.join(format!("{id}{}.json",if draft{".draft"}else{""}))}
fn workspace_draft_path(root:&Path,id:&str,owner:&str)->PathBuf{root.join(format!("{id}.workspace-{owner}.draft.json"))}
pub fn is_workspace_draft_file(name:&str)->bool{
    let name=name.strip_suffix(".bak").unwrap_or(name);
    let Some(stem)=name.strip_suffix(".draft.json")else{return false};
    let Some((id,owner))=stem.split_once(".workspace-")else{return false};valid_id(id)&&valid_id(owner)
}
fn assert_owner(owner:&str)->Result<(),ApiError>{if !valid_id(owner){Err(ApiError::new(400,"作品草稿标识无效。"))}else{Ok(())}}
fn atomic<T:Serialize+?Sized>(file:&Path,value:&T)->Result<(),ApiError>{
    let temporary=PathBuf::from(format!("{}.{}.tmp",file.to_string_lossy(),Uuid::new_v4()));
    let work=(||{let mut writer=BufWriter::new(OpenOptions::new().create_new(true).write(true).open(&temporary)?);
        serde_json::to_writer(&mut writer,value).map_err(json_write_error)?;writer.flush()?;writer.get_ref().sync_all()?;drop(writer);
        if file.exists(){fs::copy(file,PathBuf::from(format!("{}.bak",file.to_string_lossy())))?;}
        fs::rename(&temporary,file)?;Ok::<_,ApiError>(())})();let _=fs::remove_file(&temporary);work
}

// Publishing the recovery copy is atomic and must not replace a file created
// by another program after deletion started. Windows MoveFileW fails when the
// destination exists; the temporary copy is on the same filesystem.
fn publish_restored(temporary:&Path,original:&Path)->std::io::Result<()> {
    #[cfg(windows)] {
        use std::os::windows::ffi::OsStrExt;
        #[link(name="kernel32")] extern "system" {fn MoveFileW(existing:*const u16,new:*const u16)->i32;}
        let from:Vec<u16>=temporary.as_os_str().encode_wide().chain(Some(0)).collect();
        let to:Vec<u16>=original.as_os_str().encode_wide().chain(Some(0)).collect();
        if unsafe{MoveFileW(from.as_ptr(),to.as_ptr())}==0 {return Err(std::io::Error::last_os_error())}
        Ok(())
    }
    #[cfg(not(windows))] {
        // A hard link creates a complete destination exclusively on the same
        // filesystem, unlike rename(), which may replace an existing target.
        fs::hard_link(temporary,original)?;
        let _=fs::remove_file(temporary);
        Ok(())
    }
}

fn rollback_staged(staged:&[(PathBuf,PathBuf)])->Result<(),ApiError>{
    rollback_staged_with(staged,|path|fs::File::open(path),|source,target|std::io::copy(source,target))
}

// The callbacks make filesystem failure cases deterministic in unit tests.
// Production always supplies ordinary File::open and std::io::copy above.
fn rollback_staged_with<Open,Copy>(staged:&[(PathBuf,PathBuf)],mut open_source:Open,mut copy:Copy)->Result<(),ApiError>
where Open:FnMut(&Path)->std::io::Result<fs::File>,Copy:FnMut(&mut fs::File,&mut fs::File)->std::io::Result<u64> {
    let mut failed=false;
    for (original,isolated) in staged.iter().rev() {
        let mut restore_path=None;
        let result=(||->std::io::Result<()> {
            // Do not create a public filename until every byte has copied.
            let mut source=open_source(isolated)?;
            let temporary=PathBuf::from(format!("{}.zhezhi-restore-{}.tmp",original.to_string_lossy(),Uuid::new_v4()));
            let mut destination=OpenOptions::new().write(true).create_new(true).open(&temporary)?;
            restore_path=Some(temporary.clone());
            copy(&mut source,&mut destination)?;
            destination.sync_all()?;
            drop(destination);
            publish_restored(&temporary,original)?;
            restore_path=None;
            // A retained duplicate is safe if final quarantine cleanup fails.
            let _=fs::remove_file(isolated);
            Ok(())
        })();
        if result.is_err(){failed=true;}
        if let Some(temporary)=restore_path {let _=fs::remove_file(temporary);}
        // Always attempt the remaining records even if this one cannot recover.
    }
    if failed{Err(ApiError::new(503,"删除未完成，恢复副本已保留在原保存目录。请检查目录权限后重试。"))}else{Ok(())}
}
pub fn revision(root:&Path,id:&str)->Result<Option<String>,ApiError>{
    let mut hash=Sha256::new();let mut found=false;let mut buffer=[0u8;64*1024];
    for suffix in [".json",".draft.json"]{match fs::File::open(root.join(format!("{id}{suffix}"))){Ok(mut file)=>{hash.update(suffix.as_bytes());loop{let count=file.read(&mut buffer)?;if count==0{break}hash.update(&buffer[..count]);}found=true},Err(e)if e.kind()==std::io::ErrorKind::NotFound=>{},Err(e)=>return Err(e.into())}}
    Ok(found.then(||hex::encode(hash.finalize())))
}
fn tombstones(p:&StoragePaths)->Result<Value,ApiError>{
    match fs::read(p.data_dir.join("project-tombstones.json")){
        Err(e)if e.kind()==std::io::ErrorKind::NotFound=>Ok(json!({"version":1,"ids":[]})),Err(e)=>Err(e.into()),
        Ok(bytes)=>{let value:Value=serde_json::from_slice(&bytes).map_err(|_|ApiError::new(400,"工程删除记录损坏，保存已停止，请检查数据目录。"))?;
            if value["version"].as_f64()!=Some(1.0)||!value["ids"].as_array().is_some_and(|a|a.iter().all(|s|s.as_str().is_some_and(valid_id))){return Err(ApiError::new(400,"工程删除记录损坏，保存已停止，请检查数据目录。"))}Ok(value)}
    }
}
fn deleted(p:&StoragePaths,id:&str)->Result<bool,ApiError>{Ok(tombstones(p)?["ids"].as_array().unwrap().iter().any(|v|v==id))}
fn conflict(code:&str,message:&str)->ApiError{ApiError::new(409,message).with_data(json!({"code":code}))}
fn assert_revision(p:&StoragePaths,id:&str,expected:&Value)->Result<(),ApiError>{
    if deleted(p,id)?{return Err(conflict("project_deleted","此工程已在其他窗口删除。当前内容仍保留，请另存为副本。"))}
    let current=revision(&p.projects_dir,id)?;
    if current.as_deref()!=expected.as_str(){return Err(conflict("project_conflict","工程已在其他窗口修改。当前内容仍保留，请另存为副本或重新打开最新工程。"))}Ok(())
}
fn stored(root:&Path,id:&str,draft:bool)->Result<Value,ApiError>{
    decode_stored(&fs::read(path(root,id,draft))?,id)
}
fn decode_stored(bytes:&[u8],id:&str)->Result<Value,ApiError>{
    let value=decode(bytes)?;
    if value["format"]!="zhezhi-project"||value["version"].as_f64()!=Some(1.0)||value["id"]!=id||!valid_id(id)||parsed_time(&value["updated"]).is_none(){return Err(ApiError::new(400,"工程文件格式损坏，原文件已保留。"))}validate_doc(&value["doc"])?;Ok(value)
}
fn project_snapshot(root:&Path,id:&str)->Result<Vec<(Vec<u8>,bool)>,ApiError>{
    let mut files=Vec::new();
    for draft in [false,true]{match fs::read(path(root,id,draft)){
        Ok(bytes)=>files.push((bytes,draft)),
        Err(error)if error.kind()==std::io::ErrorKind::NotFound=>{},Err(error)=>return Err(error.into()),
    }}
    Ok(files)
}
fn recovery_changed()->ApiError{conflict("recovery_changed","折痕恢复副本已在其他窗口更新或删除，请刷新恢复选项后重试。")}
fn recovery_revision(file:&Path)->Result<Option<String>,ApiError>{
    let Some(before)=file_stamp(file)?else{return Ok(None)};
    let mut source=fs::File::open(file)?;let mut hash=Sha256::new();let mut buffer=[0u8;64*1024];
    loop{let count=source.read(&mut buffer)?;if count==0{break}hash.update(&buffer[..count]);}
    if file_stamp(file)?.as_ref()!=Some(&before){return Err(recovery_changed())}
    Ok(Some(hex::encode(hash.finalize())))
}
fn variants(root:&Path,id:&str,tolerant:bool)->Result<Vec<(Value,bool)>,ApiError>{
    let mut values=Vec::new();for draft in [false,true]{match stored(root,id,draft){Ok(v)=>values.push((v,draft)),Err(e)if tolerant||e.status==404=>{},Err(e)=>return Err(e)}}Ok(values)
}
fn newest(mut values:Vec<(Value,bool)>)->Option<(Value,bool)>{values.sort_by(|(a,ad),(b,bd)|parsed_time(&b["updated"]).cmp(&parsed_time(&a["updated"])).then(ad.cmp(bd)));values.into_iter().next()}
fn list_summary(id:&str,doc:&Value,updated:&Value,draft:bool,with_thumbnail:bool)->Value{
    let mut item=json!({"id":id,"name":doc["name"],"updated":updated,"segments":doc["segments"].as_array().unwrap().len(),"draft":draft});
    let curve=&doc["metadata"]["curveDesign"];if curve["format"]=="zhezhi-curve-design"{item["kind"]=json!("curve-design");if let Some(rows)=curve["result"]["sample"]["rows"].as_array(){item["samples"]=json!(rows.len());}}
    if with_thumbnail{item["thumbnail"]=json!(thumbnail(doc));}item
}
fn valid_list_summary(id:&str,value:&Value,draft:bool,with_thumbnail:bool)->bool{
    value["id"]==id&&value["name"].is_string()&&parsed_time(&value["updated"]).is_some()&&value["segments"].as_u64().is_some()
        &&value["draft"]==draft&&(!with_thumbnail||value["thumbnail"].is_string())
}
fn cache_saved_summary(root:&Path,id:&str,draft:bool,doc:&Value,updated:&str){
    if let Ok(Some(stamp))=file_stamp(&path(root,id,draft)){
        let file=root.join(".zhezhi-project-list-cache.v1.json");let mut cache=SummaryCache::read(&file);
        let name=format!("{id}{}.json",if draft{".draft"}else{""});
        cache.entries.insert(name,CachedSummary{stamp,value:Some(list_summary(id,doc,&json!(updated),draft,true)),warning:None});cache.write(&file);
    }
}

#[derive(Clone)]pub struct ProjectStore{storage:Storage}
#[derive(Serialize)]
struct ProjectRecord<'a>{format:&'static str,version:u8,id:&'a str,doc:&'a Value,updated:&'a str,#[serde(skip_serializing_if="std::ops::Not::not")]draft:bool}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct WorkspaceDraftRecord<'a>{#[serde(flatten)]project:ProjectRecord<'a>,workspace_owner:&'a str,base_revision:&'a Value}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct RecoveryRecord<'a>{doc:&'a Value,project_id:Option<&'a str>,base_revision:Option<&'a str>,updated:String}
impl ProjectStore{
    pub fn new(storage:Storage)->Self{Self{storage}}
    pub fn list(&self,library:bool)->Result<Value,ApiError>{
        let p=self.storage.snapshot_paths("projectsDir")?;let cache_file=p.projects_dir.join(".zhezhi-project-list-cache.v1.json");let old=SummaryCache::read(&cache_file);let mut next=SummaryCache::default();
        let mut records:HashMap<String,(Value,bool)>=HashMap::new();
        for e in fs::read_dir(&p.projects_dir)?{let e=e?;let name=e.file_name().to_string_lossy().into_owned();let draft=name.ends_with(".draft.json");
            let suffix=if draft{".draft.json"}else{".json"};let Some(id)=name.strip_suffix(suffix)else{continue};if !valid_id(id){continue}
            let Some(stamp)=file_stamp(&e.path()).ok().flatten()else{continue};
            if draft&&!library{if let Some(hit)=old.entries.get(&name).filter(|entry|entry.stamp==stamp){next.entries.insert(name,hit.clone());}continue;}
            let cached=old.entries.get(&name).filter(|entry|entry.stamp==stamp&&entry.warning.is_none()&&entry.value.as_ref().is_none_or(|value|valid_list_summary(id,value,draft,library)));
            let cached=match cached{Some(entry)=>entry.clone(),None=>{
                let value=stored(&p.projects_dir,id,draft).ok().map(|record|list_summary(id,&record["doc"],&record["updated"],draft,library));
                if file_stamp(&e.path())?.as_ref()!=Some(&stamp){continue;}
                CachedSummary{stamp,value,warning:None}
            }};
            if let Some(mut item)=cached.value.clone(){let replace=records.get(id).is_none_or(|(old,od)|parsed_time(&item["updated"])>parsed_time(&old["updated"])||parsed_time(&item["updated"])==parsed_time(&old["updated"])&&*od&&!draft);
                if replace{if !library{let fields=item.as_object_mut().unwrap();fields.remove("draft");fields.remove("thumbnail");}records.insert(id.to_owned(),(item,draft));}}
            next.entries.insert(name,cached);
        }
        // Keep only small list summaries, releasing each document before the
        // next file is parsed, even when the library contains many large CPs.
        let mut projects:Vec<_>=records.into_values().map(|(item,_)|item).collect();
        projects.sort_by(|a,b|parsed_time(&b["updated"]).cmp(&parsed_time(&a["updated"])));self.storage.check_snapshot_paths("projectsDir",&p)?;if next!=old{next.write(&cache_file);}Ok(json!({"projects":projects}))
    }
    pub fn save(&self,input:&Value,draft:bool)->Result<Value,ApiError>{
        validate_doc(&input["doc"])?;let id=if input["id"].is_null(){Uuid::new_v4().to_string()}else{input["id"].as_str().filter(|s|valid_id(s)).ok_or_else(||ApiError::new(400,"工程编号无效。"))?.to_owned()};
        self.storage.with_write(|p|{assert_revision(p,&id,&input["baseRevision"])?;let updated=timestamp();let value=ProjectRecord{format:"zhezhi-project",version:1,id:&id,doc:&input["doc"],updated:&updated,draft};
            atomic(&path(&p.projects_dir,&id,draft),&value)?;cache_saved_summary(&p.projects_dir,&id,draft,&input["doc"],&updated);Ok(json!({"id":id,"updated":updated,"revision":revision(&p.projects_dir,&id)?}))})
    }
    /// Private drafts never advance another document's shared project revision.
    /// Official writes retain the original CAS contract and library identity.
    pub fn save_workspace(&self,input:&Value,draft:bool,owner:&str)->Result<Value,ApiError>{
        assert_owner(owner)?;
        if !draft{
            let mut result=self.save(input,false)?;let id=result["id"].as_str().unwrap().to_owned();
            let cleanup=self.storage.with_write(|p|{
                let file=workspace_draft_path(&p.projects_dir,&id,owner);
                for file in [file.clone(),PathBuf::from(format!("{}.bak",file.to_string_lossy()))]{
                    if let Err(error)=fs::remove_file(&file){if error.kind()!=std::io::ErrorKind::NotFound{return Err(ApiError::from(error))}}
                }Ok(())
            });
            if cleanup.is_err(){result["warning"]=json!("正式工程已保存；此作品的旧草稿暂未清理，仍保留在原目录。");}
            return Ok(result);
        }
        validate_doc(&input["doc"])?;
        let id=if input["id"].is_null(){Uuid::new_v4().to_string()}else{input["id"].as_str().filter(|id|valid_id(id)).ok_or_else(||ApiError::new(400,"工程编号无效。"))?.to_owned()};
        self.storage.with_write(|p|{
            assert_revision(p,&id,&input["baseRevision"])?;let updated=timestamp();
            let record=WorkspaceDraftRecord{project:ProjectRecord{format:"zhezhi-project",version:1,id:&id,doc:&input["doc"],updated:&updated,draft:true},workspace_owner:owner,base_revision:&input["baseRevision"]};
            let file=workspace_draft_path(&p.projects_dir,&id,owner);atomic(&file,&record)?;
            if let Ok(Some(stamp))=file_stamp(&file){let cache_file=p.projects_dir.join(format!(".zhezhi-workspace-{owner}-list-cache.v1.json"));let mut cache=SummaryCache::read(&cache_file);cache.entries.insert(file.file_name().unwrap().to_string_lossy().into_owned(),CachedSummary{stamp,value:Some(list_summary(&id,&input["doc"],&json!(updated),true,true)),warning:None});cache.write(&cache_file);}
            Ok(json!({"id":id,"updated":updated,"revision":revision(&p.projects_dir,&id)?,"workspaceDraft":true}))
        })
    }
    pub fn get_workspace(&self,id:&str,include_draft:bool,owner:&str)->Result<Value,ApiError>{
        assert_owner(owner)?;if !valid_id(id){return Err(ApiError::new(400,"工程编号无效。"))}
        if !include_draft{return self.get(id,false)}
        let (paths,files,private)=self.storage.with_read("projectsDir",|p|{
            if deleted(p,id)?{return Err(ApiError::new(404,"此工程已删除，原作品内容仍可从恢复副本另存。"))}
            let mut files=Vec::new();for(suffix,draft)in[(".json",false),(".draft.json",true)]{match fs::File::open(path(&p.projects_dir,id,draft)){Ok(file)=>files.push((suffix,file)),Err(error)if error.kind()==std::io::ErrorKind::NotFound=>{},Err(error)=>return Err(error.into())}}
            Ok((p.clone(),files,regular_bytes(&workspace_draft_path(&p.projects_dir,id,owner),"作品折痕草稿")?))
        })?;
        let Some(bytes)=private else{return self.get(id,true)};
        let mut hash=Sha256::new();let mut buffer=[0u8;64*1024];for(suffix,mut file)in files.iter().map(|(suffix,file)|(*suffix,file)){
            let before=file.metadata()?;hash.update(suffix.as_bytes());let mut length=0;
            loop{let count=file.read(&mut buffer)?;if count==0{break}length+=count as u64;hash.update(&buffer[..count]);}
            let after=file.metadata()?;if length!=before.len()||before.len()!=after.len()||before.modified().ok()!=after.modified().ok(){return Err(conflict("project_conflict","工程在读取期间更新，请重新打开。"))}
        }
        let rev=(!files.is_empty()).then(||hex::encode(hash.finalize()));
        let mut value=decode_stored(&bytes,id)?;
        if value["workspaceOwner"]!=owner{return Err(ApiError::new(400,"作品草稿归属不符，未载入。"))}
        self.storage.check_snapshot_paths("projectsDir",&paths)?;
        if value["baseRevision"]!=json!(rev){
            // Never rebase old private edits onto a new shared head implicitly.
            // The caller can warn and the independent draft remains intact.
            let mut shared=self.get(id,true)?;shared["workspaceDraftConflict"]=json!(true);return Ok(shared);
        }
        value["revision"]=json!(rev);value["draft"]=json!(true);value["workspaceDraft"]=json!(true);Ok(value)
    }
    pub fn list_workspace(&self,library:bool,owner:&str)->Result<Value,ApiError>{
        assert_owner(owner)?;let mut value=self.list(library)?;
        let paths=self.storage.snapshot_paths("projectsDir")?;let suffix=format!(".workspace-{owner}.draft.json");
        let cache_file=paths.projects_dir.join(format!(".zhezhi-workspace-{owner}-list-cache.v1.json"));let old=SummaryCache::read(&cache_file);let mut next=SummaryCache::default();
        let mut records:HashMap<String,Value>=value["projects"].as_array_mut().unwrap().drain(..).map(|v|(v["id"].as_str().unwrap().to_owned(),v)).collect();
        for entry in fs::read_dir(&paths.projects_dir)?{
            let entry=entry?;let name=entry.file_name().to_string_lossy().into_owned();let Some(id)=name.strip_suffix(&suffix).filter(|id|valid_id(id))else{continue};
            if deleted(&paths,id)?{continue;}
            let Some(stamp)=file_stamp(&entry.path())?else{continue};
            let cached=old.entries.get(&name).filter(|hit|hit.stamp==stamp&&hit.warning.is_none()&&hit.value.as_ref().is_some_and(|v|valid_list_summary(id,v,true,true)));
            let cached=match cached{Some(hit)=>hit.clone(),None=>{let bytes=regular_bytes(&entry.path(),"作品折痕草稿")?.ok_or_else(||ApiError::new(404,"作品草稿已不存在。"))?;let record=decode_stored(&bytes,id)?;if record["workspaceOwner"]!=owner{return Err(ApiError::new(400,"作品草稿归属不符。"))}CachedSummary{stamp:stamp.clone(),value:Some(list_summary(id,&record["doc"],&record["updated"],true,true)),warning:None}}};
            if file_stamp(&entry.path())?.as_ref()!=Some(&stamp){continue;}
            if let Some(mut item)=cached.value.clone(){if !library{item.as_object_mut().unwrap().remove("draft");item.as_object_mut().unwrap().remove("thumbnail");}records.insert(id.to_owned(),item);}
            next.entries.insert(name,cached);
        }
        let mut projects:Vec<Value>=records.into_values().collect();projects.sort_by(|a,b|parsed_time(&b["updated"]).cmp(&parsed_time(&a["updated"])));
        self.storage.check_snapshot_paths("projectsDir",&paths)?;if next!=old{next.write(&cache_file);}value["projects"]=json!(projects);Ok(value)
    }
    pub fn rename_workspace(&self,id:&str,input:&Value,owner:&str)->Result<Value,ApiError>{
        assert_owner(owner)?;if !valid_id(id){return Err(ApiError::new(400,"工程编号无效。"))}
        let name=input["name"].as_str().unwrap_or("").trim();if name.is_empty()||name.encode_utf16().count()>160{return Err(ApiError::new(400,"文档名称须为 1 至 160 个字符。"))}
        self.storage.with_write(|p|{
            assert_revision(p,id,&input["baseRevision"])?;
            let mut shared=variants(&p.projects_dir,id,false)?;let file=workspace_draft_path(&p.projects_dir,id,owner);
            let mut private=regular_bytes(&file,"作品折痕草稿")?.map(|bytes|decode_stored(&bytes,id)).transpose()?;
            if shared.is_empty()&&private.is_none(){return Err(ApiError::new(404,"文件不存在。"))}
            if private.as_ref().is_some_and(|v|v["workspaceOwner"]!=owner){return Err(ApiError::new(400,"作品草稿归属不符。"))}
            for(value,_)in &mut shared{value["doc"]["name"]=json!(name);validate_doc(&value["doc"])?;}
            for(value,draft)in shared{atomic(&path(&p.projects_dir,id,draft),&value)?;}
            let rev=revision(&p.projects_dir,id)?;
            if let Some(value)=private.as_mut(){
                // A name change may follow our own official write, but may not
                // silently rebase already-conflicting geometry from a peer.
                if value["baseRevision"]==input["baseRevision"]{value["doc"]["name"]=json!(name);value["baseRevision"]=json!(rev);value["updated"]=json!(timestamp());validate_doc(&value["doc"])?;atomic(&file,value)?;}
            }
            Ok(json!({"id":id,"name":name,"revision":rev}))
        })
    }
    pub fn get(&self,id:&str,include_draft:bool)->Result<Value,ApiError>{
        if !valid_id(id){return Err(ApiError::new(400,"工程编号无效。"))}
        // Capture authoritative bytes and their exact revision together. Parsing
        // large metadata and validating geometry must not hold the prefs mutex.
        let (paths,files)=self.storage.with_read("projectsDir",|p|Ok((p.clone(),project_snapshot(&p.projects_dir,id)?)))?;
        let mut hash=Sha256::new();for(bytes,draft)in &files{hash.update(if *draft{".draft.json"}else{".json"}.as_bytes());hash.update(bytes);}let rev=(!files.is_empty()).then(||hex::encode(hash.finalize()));
        let mut value=if include_draft{
            let values=files.into_iter().filter_map(|(bytes,draft)|decode_stored(&bytes,id).ok().map(|value|(value,draft))).collect();
            let (mut value,draft)=newest(values).ok_or_else(||ApiError::new(404,"文件不存在。请从工程库选择其他工程。"))?;value["draft"]=json!(draft);value
        }else{let (bytes,_)=files.into_iter().find(|(_,draft)|!*draft).ok_or_else(||ApiError::new(404,"文件不存在。请从工程库选择其他工程。"))?;decode_stored(&bytes,id)?};
        value["revision"]=json!(rev);self.storage.check_snapshot_paths("projectsDir",&paths)?;Ok(value)
    }
    /// Conflict polling needs the exact revision, never the document payload.
    /// Capture handles together under the storage lock, then hash their actual
    /// bytes without holding the global prefs queue or allocating a JSON tree.
    pub fn get_revision(&self,id:&str)->Result<Value,ApiError>{
        if !valid_id(id){return Err(ApiError::new(400,"工程编号无效。"))}
        let (paths,mut files)=self.storage.with_read("projectsDir",|p|{
            if deleted(p,id)?{return Err(ApiError::new(404,"文件不存在。请从工程库选择其他工程。"))}
            let mut files=Vec::new();for (suffix,draft) in [(".json",false),(".draft.json",true)]{match fs::File::open(path(&p.projects_dir,id,draft)){Ok(file)=>files.push((suffix,file)),Err(error)if error.kind()==std::io::ErrorKind::NotFound=>{},Err(error)=>return Err(error.into())}}
            if files.is_empty(){return Err(ApiError::new(404,"文件不存在。请从工程库选择其他工程。"))}Ok((p.clone(),files))
        })?;
        let mut hash=Sha256::new();let mut buffer=[0u8;64*1024];for(suffix,file)in &mut files{
            let before=file.metadata()?;hash.update(suffix.as_bytes());let mut bytes=0;
            loop{let count=file.read(&mut buffer)?;if count==0{break}bytes+=count as u64;hash.update(&buffer[..count]);}
            let after=file.metadata()?;if bytes!=before.len()||before.len()!=after.len()||before.modified().ok()!=after.modified().ok(){return Err(conflict("project_conflict","工程在读取修订期间更新，请重试。"))}
        }
        self.storage.check_snapshot_paths("projectsDir",&paths)?;Ok(json!({"id":id,"revision":hex::encode(hash.finalize())}))
    }
    pub fn rename(&self,id:&str,input:&Value)->Result<Value,ApiError>{
        if !valid_id(id){return Err(ApiError::new(400,"工程编号无效。"))}let name=input["name"].as_str().unwrap_or("").trim();if name.is_empty()||name.encode_utf16().count()>160{return Err(ApiError::new(400,"文档名称须为 1 至 160 个字符。"))}
        self.storage.with_write(|p|{assert_revision(p,id,&input["baseRevision"])?;let mut all=variants(&p.projects_dir,id,false)?;if all.is_empty(){return Err(ApiError::new(404,"文件不存在。"))}
            for (v,_)in &mut all{v["doc"]["name"]=json!(name);validate_doc(&v["doc"])?;}for(v,draft)in all{atomic(&path(&p.projects_dir,id,draft),&v)?;}Ok(json!({"id":id,"name":name,"revision":revision(&p.projects_dir,id)?}))})
    }
    pub fn delete(&self,id:&str)->Result<Value,ApiError>{
        if !valid_id(id){return Err(ApiError::new(400,"工程编号无效。"))}
        self.storage.with_write(|p|{
            let mut files=Vec::new();let inspect=|file:&Path|->Result<bool,ApiError>{match fs::symlink_metadata(file){Ok(m)if m.is_file()&&!m.file_type().is_symlink()=>Ok(true),Ok(_)=>Err(ApiError::new(409,"文档保存位置含有非普通文件，未删除任何文档。")),Err(e)if e.kind()==std::io::ErrorKind::NotFound=>Ok(false),Err(_)=>Err(ApiError::new(503,"无法读取文档保存位置，未删除任何文档。请检查目录权限后重试。"))}};
            for suffix in [".json",".draft.json",".json.bak",".draft.json.bak"]{let file=p.projects_dir.join(format!("{id}{suffix}"));if inspect(&file)?{files.push(file)}}
            for name in ["recovery.json","recovery.json.bak"]{let file=p.data_dir.join(name);if inspect(&file)?{let bytes=fs::read(&file)?;if serde_json::from_slice::<Value>(&bytes).is_ok_and(|v|v["projectId"]==id){files.push(file)}}}
            let transaction=Uuid::new_v4();let mut staged=Vec::<(PathBuf,PathBuf)>::new();
            let operation=(||{for file in &files{let temporary=PathBuf::from(format!("{}.zhezhi-delete-{transaction}.tmp",file.to_string_lossy()));fs::rename(file,&temporary)?;staged.push((file.clone(),temporary));}
                let mut value=tombstones(p)?;if !value["ids"].as_array().unwrap().iter().any(|v|v==id){value["ids"].as_array_mut().unwrap().push(json!(id));atomic(&p.data_dir.join("project-tombstones.json"),&value)?;}Ok::<_,ApiError>(())})();
            if operation.is_err(){rollback_staged(&staged)?;return Err(ApiError::new(503,"删除未完成，原文档已恢复。请检查目录权限后重试。"))}
            let cleanup=staged.iter().filter(|(_,tmp)|fs::remove_file(tmp).is_err()).count();let mut result=json!({"id":id,"deleted":!files.is_empty(),"files":files.len()});if cleanup>0{result["warning"]=json!("文档已删除，但部分临时副本暂时无法清理，请检查保存目录权限。");}Ok(result)
        })
    }
    pub fn recovery_summary(&self)->Result<Value,ApiError>{
        let paths=self.storage.snapshot_paths("dataDir")?;let revision=recovery_revision(&paths.data_dir.join("recovery.json"))?;
        self.storage.check_snapshot_paths("dataDir",&paths)?;Ok(json!({"exists":revision.is_some(),"revision":revision}))
    }
    pub fn read_recovery(&self)->Result<Value,ApiError>{self.read_recovery_at(None)}
    pub fn read_recovery_at(&self,expected:Option<&str>)->Result<Value,ApiError>{
        let (paths,bytes)=self.storage.with_read("dataDir",|p|Ok((p.clone(),regular_bytes(&p.data_dir.join("recovery.json"),"折痕恢复副本")?)))?;
        if let Some(expected)=expected{if bytes.as_ref().map(|bytes|digest(bytes)).as_deref()!=Some(expected){return Err(recovery_changed())}}
        let value=match bytes{Some(bytes)=>serde_json::from_slice(&bytes)?,None=>json!({"doc":null})};
        self.storage.check_snapshot_paths("dataDir",&paths)?;Ok(value)
    }
    pub fn save_recovery(&self,input:&Value)->Result<Value,ApiError>{validate_doc(&input["doc"])?;let id=input["projectId"].as_str().filter(|s|valid_id(s));
        self.storage.with_write(|p|{if let Some(id)=id{if deleted(p,id)?{return Err(conflict("project_deleted","原工程已删除，请将当前内容另存为副本。"))}}
            atomic(&p.data_dir.join("recovery.json"),&RecoveryRecord{doc:&input["doc"],project_id:id,base_revision:input["baseRevision"].as_str(),updated:timestamp()})?;Ok(json!({"ok":true}))})}
}

fn sample<T>(items:Vec<T>,count:usize)->Vec<T> where T:Clone{if items.len()<=count{items}else{(0..count).map(|i|items[i*items.len()/count].clone()).collect()}}
struct CurvePreview{crease:Vec<[f64;2]>,boundaries:Vec<Vec<[f64;2]>>,rulings:Vec<Vec<[f64;2]>>,points:Vec<[f64;2]>}
fn curve_geometry(design:&Value)->Option<CurvePreview>{
    if design["format"]!="zhezhi-curve-design"||design["version"].as_f64()!=Some(1.0)||design["result"]["flattening"]["status"]!="computed"{return None}
    let scale=design["millimetersPerUnit"].as_f64().filter(|n|n.is_finite()&&*n>0.0&&*n<=1e6)?;let flat=&design["result"]["flattening"]["result"];
    let rows=flat["sample"]["rows"].as_array().filter(|a|(2..=129).contains(&a.len()))?;let grid=flat["grid"].as_array().filter(|a|a.len()==rows.len())?;
    let point=|p:&Value|->Option<[f64;2]>{let a=p.as_array().filter(|a|a.len()==2)?;let x=a[0].as_f64().filter(|x|x.is_finite()&&x.abs()<1e8)?;let y=a[1].as_f64().filter(|x|x.is_finite()&&x.abs()<1e8)?;Some([x*scale,-y*scale])};
    let crease=rows.iter().map(|r|point(&r["targetBase"])).collect::<Option<Vec<_>>>()?;let mut columns=None;let mut bands=Vec::new();
    for side in ["targetLeft","targetRight"]{let mut band=Vec::new();for row in grid{let points=row[side].as_array().filter(|a|(2..=65).contains(&a.len()))?;if columns.is_some_and(|n|n!=points.len()){return None}columns=Some(points.len());band.push(points.iter().map(point).collect::<Option<Vec<_>>>()?);}bands.push(band);}
    let mut boundaries=Vec::new();let mut rulings=Vec::new();let mut points=crease.clone();for band in bands{let mut boundary:Vec<_>=band.iter().map(|r|r[0]).collect();boundary.extend(band.iter().rev().map(|r|r[r.len()-1]));boundaries.push(boundary);for row in &band{points.extend(row.iter().copied())}for row in sample(band,32){rulings.push(vec![row[0],row[row.len()-1]])}}
    Some(CurvePreview{crease,boundaries,rulings,points})
}
fn thumbnail(doc:&Value)->String{
    let valid_point=|v:&Value|v.as_array().is_some_and(|a|a.len()==2&&a.iter().all(|n|n.as_f64().is_some_and(|x|x.is_finite()&&x.abs()<1e8)));
    let Some(all)=doc["segments"].as_array()else{return String::new()};let curve=if all.is_empty(){curve_geometry(&doc["metadata"]["curveDesign"])}else{None};let segments:Vec<_>=all.iter().filter(|s|valid_point(&s["a"])&&valid_point(&s["b"])&&["B","M","V","U","A","F"].contains(&s["assignment"].as_str().unwrap_or(""))).collect();
    let boundaries:Vec<_>=segments.iter().copied().filter(|s|s["assignment"]=="B").collect();let circles:Vec<_>=doc["objects"].as_array().into_iter().flatten().filter(|o|o["kind"]=="circle"&&valid_point(&o["center"])&&o["radius"].as_f64().is_some_and(|r|r>0.0&&r<=1e6)).take(48).collect();
    let(mut minx,mut miny,mut maxx,mut maxy)=(f64::INFINITY,f64::INFINITY,f64::NEG_INFINITY,f64::NEG_INFINITY);
    let mut extend=|x:f64,y:f64|{minx=minx.min(x);maxx=maxx.max(x);miny=miny.min(y);maxy=maxy.max(y)};
    for s in &segments{for key in ["a","b"]{extend(s[key][0].as_f64().unwrap(),s[key][1].as_f64().unwrap())}}
    for o in &circles{let x=o["center"][0].as_f64().unwrap();let y=o["center"][1].as_f64().unwrap();let r=o["radius"].as_f64().unwrap();extend(x-r,y-r);extend(x+r,y+r);}
    if let Some(curve)=&curve{for p in &curve.points{extend(p[0],p[1])}}
    let dim=|v:&Value|v.as_f64().filter(|n|n.is_finite()&&*n>0.0).unwrap_or(200.0).min(1e8);let pw=dim(&doc["paper"]["width"]);let ph=dim(&doc["paper"]["height"]);
    if boundaries.is_empty()&&curve.is_none(){extend(0.0,0.0);extend(pw,ph)}drop(extend);
    let width=(maxx-minx).max(1e-6);let height=(maxy-miny).max(1e-6);let scale=(292.0/width).min(192.0/height);let ox=(320.0-width*scale)/2.0;let oy=(220.0-height*scale)/2.0;
    let number=|v:f64|format!("{}",(v*100.0).round()/100.0);let x=|v:f64|number(ox+(v-minx)*scale);let y=|v:f64|number(oy+(v-miny)*scale);
    let colors=|s:&str|match s{"B"=>"#58615e","M"=>"#bd5147","V"=>"#477caa","A"=>"#a3a9a5","F"=>"#9b7943",_=>"#8c9290"};
    let safe=|v:&Value|v.as_str().filter(|s|s.len()==7&&s.starts_with('#')&&s[1..].bytes().all(|b|b.is_ascii_hexdigit())).map(str::to_owned);
    let mut svg=String::from("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 320 220\" width=\"320\" height=\"220\"><rect width=\"320\" height=\"220\" fill=\"#fff\"/>");
    if boundaries.is_empty()&&curve.is_none(){svg+=&format!("<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"#fff\" stroke=\"#87918b\" stroke-width=\"1.15\"/>",x(0.0),y(0.0),number(pw*scale),number(ph*scale));}
    if let Some(curve)=&curve{let path=|points:&[[f64;2]]|points.iter().enumerate().map(|(i,p)|format!("{}{} {}",if i==0{"M"}else{"L"},x(p[0]),y(p[1]))).collect::<Vec<_>>().join(" ");
        for boundary in &curve.boundaries{svg+=&format!("<path d=\"{} Z\" fill=\"#f7f5ec\" stroke=\"{}\" stroke-width=\"1.15\"/>",path(boundary),colors("B"))}for ruling in &curve.rulings{svg+=&format!("<path d=\"{}\" fill=\"none\" stroke=\"{}\" stroke-width=\"0.65\"/>",path(ruling),colors("A"))}svg+=&format!("<path d=\"{}\" fill=\"none\" stroke=\"#008b9a\" stroke-width=\"1.5\"/>",path(&curve.crease));}
    let mut chosen=sample(boundaries.clone(),boundaries.len().min(550));let count=550-chosen.len();chosen.extend(sample(segments.iter().copied().filter(|s|s["assignment"]!="B").collect(),count));
    for s in chosen{let assignment=s["assignment"].as_str().unwrap();let color=safe(&s["displayColor"]).unwrap_or_else(||colors(assignment).into());svg+=&format!("<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{}\" stroke-width=\"{}\"{}/>",x(s["a"][0].as_f64().unwrap()),y(s["a"][1].as_f64().unwrap()),x(s["b"][0].as_f64().unwrap()),y(s["b"][1].as_f64().unwrap()),color,if assignment=="B"{"1.35"}else{"1.1"},match assignment{"V"=>" stroke-dasharray=\"5 3\"","A"=>" stroke-dasharray=\"2 3\"",_=>""});}
    for o in circles{svg+=&format!("<circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"none\" stroke=\"{}\" stroke-width=\"1\"/>",x(o["center"][0].as_f64().unwrap()),y(o["center"][1].as_f64().unwrap()),number(o["radius"].as_f64().unwrap()*scale),safe(&o["color"]).unwrap_or_else(||colors("U").into()));}svg+="</svg>";svg
}

#[cfg(test)]mod tests{use super::*;use tempfile::tempdir;
 fn doc(name:&str)->Value{json!({"name":name,"paper":{"width":200,"height":160},"segments":[{"id":"m","a":[0,0],"b":[200,160],"assignment":"M","angle":-180}]})}
 #[test]fn recovery_heads_are_small_and_restore_checks_the_actual_selected_revision(){
    let root=tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let store=ProjectStore::new(storage.clone());
    assert_eq!(store.recovery_summary().unwrap(),json!({"exists":false,"revision":null}));assert_eq!(store.read_recovery().unwrap(),json!({"doc":null}));
    assert_eq!(store.read_recovery_at(Some(&"a".repeat(64))).unwrap_err().data["code"],"recovery_changed");
    let mut source=doc("恢复原稿");source["metadata"]=json!({"unknown":{"kept":"中文"},"padding":"a".repeat(131_073)});
    store.save_recovery(&json!({"doc":source,"projectId":null})).unwrap();let head=store.recovery_summary().unwrap();let file=storage.paths().data_dir.join("recovery.json");
    assert_eq!(head.as_object().unwrap().len(),2);assert!(head.to_string().len()<120);assert_eq!(head["revision"],digest(&fs::read(&file).unwrap()));
    assert_eq!(store.read_recovery_at(head["revision"].as_str()).unwrap()["doc"],source);
    source["name"]=json!("另一窗口的新稿");store.save_recovery(&json!({"doc":source})).unwrap();assert_eq!(store.read_recovery_at(head["revision"].as_str()).unwrap_err().status,409);
    fs::write(&file,"corrupt recovery retained").unwrap();assert_eq!(store.recovery_summary().unwrap()["exists"],true,"startup must not mistake a corrupt recovery for an empty slot and overwrite it");assert!(store.read_recovery().is_err());assert_eq!(fs::read_to_string(&file).unwrap(),"corrupt recovery retained");
 }
 #[test]fn captured_project_revision_matches_the_same_bytes_and_tolerant_draft_selection(){
    let root=tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let store=ProjectStore::new(storage.clone());let id="11111111-1111-4111-8111-111111111111";
    let saved=store.save(&json!({"id":id,"doc":doc("正式原稿")}),false).unwrap();let draft=store.save(&json!({"id":id,"baseRevision":saved["revision"],"doc":doc("较新草稿")}),true).unwrap();
    let captured=store.get(id,true).unwrap();assert_eq!(captured["doc"]["name"],"较新草稿");assert_eq!(captured["revision"],draft["revision"]);
    fs::write(path(&storage.paths().projects_dir,id,false),"broken formal record").unwrap();let captured=store.get(id,true).unwrap();assert_eq!(captured["doc"]["name"],"较新草稿");assert_eq!(captured["revision"],revision(&storage.paths().projects_dir,id).unwrap().unwrap());assert_eq!(store.get(id,false).unwrap_err().status,400);
 }
 #[test]fn cached_project_lists_keep_draft_precedence_and_validate_actual_opens(){
    let dir=tempdir().unwrap();let storage=Storage::new(dir.path().to_path_buf(),false).unwrap();let store=ProjectStore::new(storage.clone());
    let saved=store.save(&json!({"doc":doc("原稿")}),false).unwrap();let id=saved["id"].as_str().unwrap();
    store.save(&json!({"id":id,"baseRevision":saved["revision"],"doc":doc("草稿")}),true).unwrap();
    let library=store.list(true).unwrap();assert_eq!(library["projects"][0]["name"],"草稿");assert_eq!(library["projects"][0]["draft"],true);
    assert_eq!(ProjectStore::new(storage.clone()).list(true).unwrap(),library);
    let plain=store.list(false).unwrap();assert_eq!(plain["projects"][0]["name"],"原稿");assert!(plain["projects"][0].get("draft").is_none());assert!(plain["projects"][0].get("thumbnail").is_none());
    fs::write(path(&storage.paths().projects_dir,id,false),"broken source").unwrap();assert!(store.get(id,false).is_err());
    assert!(store.list(false).unwrap()["projects"].as_array().unwrap().is_empty());
    fs::remove_file(path(&storage.paths().projects_dir,id,true)).unwrap();assert!(store.list(true).unwrap()["projects"].as_array().unwrap().is_empty());
 }
 #[test]fn revision_and_tombstones_prevent_lost_updates(){let dir=tempdir().unwrap();let store=ProjectStore::new(Storage::new(dir.path().to_path_buf(),false).unwrap());let seed=store.save(&json!({"doc":doc("原稿")}),false).unwrap();let id=seed["id"].as_str().unwrap();let first=store.save(&json!({"id":id,"baseRevision":seed["revision"],"doc":doc("新版")}),false).unwrap();assert_ne!(first["revision"],seed["revision"]);assert_eq!(store.save(&json!({"id":id,"baseRevision":seed["revision"],"doc":doc("旧稿")}),true).unwrap_err().status,409);store.delete(id).unwrap();assert_eq!(store.save(&json!({"id":id,"doc":doc("复活")}),false).unwrap_err().data["code"],"project_deleted");}
 #[test]fn streamed_revisions_match_the_existing_byte_contract_across_buffer_boundaries(){
    let root=tempdir().unwrap();let id="11111111-1111-4111-8111-111111111111";let mut expected=Sha256::new();
    for(suffix,count)in [(".json",131_073),(".draft.json",65_537)]{let bytes=vec![b'x';count];fs::write(root.path().join(format!("{id}{suffix}")),&bytes).unwrap();expected.update(suffix.as_bytes());expected.update(bytes);}
    assert_eq!(revision(root.path(),id).unwrap(),Some(hex::encode(expected.finalize())));
 }
 #[test]fn borrowed_records_keep_complete_documents_recovery_and_draft_flags(){
    let root=tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let store=ProjectStore::new(storage.clone());let mut source=doc("保留所有字段");source["metadata"]=json!({"future":{"text":"中文与\\引号\"","values":[null,true,1.25]}});
    let first=store.save(&json!({"doc":source}),false).unwrap();let id=first["id"].as_str().unwrap();let stored=store.get(id,false).unwrap();assert_eq!(stored["doc"],source);assert!(stored.get("draft").is_none());
    let draft=store.save(&json!({"id":id,"baseRevision":first["revision"],"doc":source}),true).unwrap();let draft_bytes=fs::read(path(&storage.paths().projects_dir,id,true)).unwrap();let saved:Value=serde_json::from_slice(&draft_bytes).unwrap();assert_eq!(saved["doc"],source);assert_eq!(saved["draft"],true);
    store.save_recovery(&json!({"doc":source,"projectId":id,"baseRevision":draft["revision"]})).unwrap();let recovery=store.read_recovery().unwrap();assert_eq!(recovery["doc"],source);assert_eq!(recovery["projectId"],id);assert_eq!(recovery["baseRevision"],draft["revision"]);
    assert_eq!(store.list(true).unwrap()["projects"].as_array().unwrap().len(),1);
 }
 #[test]fn revision_polling_is_small_complete_and_rejects_missing_deleted_or_invalid_ids(){
    let root=tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let store=ProjectStore::new(storage.clone());let id="11111111-1111-4111-8111-111111111111";
    assert_eq!(store.get_revision("not-an-id").unwrap_err().status,400);assert_eq!(store.get_revision(id).unwrap_err().status,404);
    let mut source=doc("正式稿");source["metadata"]=json!({"padding":"a".repeat(131_073)});let saved=store.save(&json!({"id":id,"doc":source}),false).unwrap();let first=store.get_revision(id).unwrap();
    assert_eq!(first.as_object().unwrap().len(),2);assert_eq!(first["id"],id);assert_eq!(first["revision"],saved["revision"]);assert!(first.get("doc").is_none());assert!(first.to_string().len()<160);
    source["name"]=json!("草稿");let draft=store.save(&json!({"id":id,"baseRevision":first["revision"],"doc":source}),true).unwrap();assert_eq!(store.get_revision(id).unwrap()["revision"],draft["revision"]);assert_eq!(store.get_revision(id).unwrap()["revision"],store.get(id,true).unwrap()["revision"]);
    let file=path(&storage.paths().projects_dir,id,false);let mut bytes=fs::read(&file).unwrap();let position=bytes.windows(32).rposition(|part|part==[b'a';32]).unwrap();bytes[position]=b'b';fs::write(&file,&bytes).unwrap();
    let changed=store.get_revision(id).unwrap();assert_ne!(changed["revision"],draft["revision"]);assert_eq!(changed["revision"],store.get(id,true).unwrap()["revision"]);
    store.delete(id).unwrap();assert_eq!(store.get_revision(id).unwrap_err().status,404);fs::write(file,bytes).unwrap();assert_eq!(store.get_revision(id).unwrap_err().status,404,"a tombstoned project must stay deleted even if an old file reappears");
 }

 fn staged_fixture(root:&Path)->Vec<(PathBuf,PathBuf)>{
    let entries:Vec<_>=["healthy.json","blocked.json"].iter().map(|name|(root.join(name),root.join(format!("{name}.zhezhi-delete-unit.tmp")))).collect();
    for(_,isolated)in &entries{fs::write(isolated,b"complete original document bytes").unwrap();}entries
 }
 #[test]fn rollback_unreadable_source_keeps_original_and_continues_other_records(){
    let dir=tempdir().unwrap();let staged=staged_fixture(dir.path());let blocked=staged[1].1.clone();
    let result=rollback_staged_with(&staged,|path|if path==blocked{Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"private test source denied"))}else{fs::File::open(path)},|source,target|std::io::copy(source,target));
    assert_eq!(result.unwrap_err().status,503);
    assert!(!staged[1].0.exists(),"unreadable source must not create an empty public document");
    assert_eq!(fs::read(&staged[1].1).unwrap(),b"complete original document bytes");
    assert_eq!(fs::read(&staged[0].0).unwrap(),b"complete original document bytes");assert!(!staged[0].1.exists());
 }
 #[test]fn rollback_partial_copy_never_publishes_partial_document_and_continues(){
    let dir=tempdir().unwrap();let staged=staged_fixture(dir.path());let mut copies=0;
    let result=rollback_staged_with(&staged,|path|fs::File::open(path),|source,target|{copies+=1;if copies==1{target.write_all(b"partial")?;Err(std::io::Error::new(std::io::ErrorKind::Other,"private test copy denied"))}else{std::io::copy(source,target)}});
    assert_eq!(result.unwrap_err().status,503);assert_eq!(copies,2,"remaining records must still be recovered");
    assert!(!staged[1].0.exists());assert_eq!(fs::read(&staged[1].1).unwrap(),b"complete original document bytes");
    assert_eq!(fs::read(&staged[0].0).unwrap(),b"complete original document bytes");assert!(!staged[0].1.exists());
    assert!(!fs::read_dir(dir.path()).unwrap().any(|entry|entry.unwrap().file_name().to_string_lossy().contains(".zhezhi-restore-")),"private partial restore copies are cleaned without changing isolated originals");
 }
 #[test]fn rollback_does_not_replace_new_external_document(){
    let dir=tempdir().unwrap();let staged=staged_fixture(dir.path());fs::write(&staged[1].0,b"external document created meanwhile").unwrap();
    assert_eq!(rollback_staged(&staged).unwrap_err().status,503);
    assert_eq!(fs::read(&staged[1].0).unwrap(),b"external document created meanwhile");assert_eq!(fs::read(&staged[1].1).unwrap(),b"complete original document bytes");
    assert_eq!(fs::read(&staged[0].0).unwrap(),b"complete original document bytes");
 }
}
