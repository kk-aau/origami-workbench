use super::{ApiError, storage::{Storage,SummaryCache,CachedSummary,file_stamp,atomic_bytes,atomic_json,digest,intent_lock,now,regex,regular_bytes},validation::validate_doc};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde::de::{Deserialize,Deserializer,MapAccess,SeqAccess,Visitor};
use serde_json::{json, value::RawValue, Value};
use std::{collections::{HashMap,HashSet}, fs, io::Write, path::Path};

const CONFLICT_MESSAGE:&str="此完整作品恢复副本已在其他窗口更新或删除，当前作品仍保留，请另存完整作品后重试。";
fn error(status:u16,message:impl Into<String>,code:&str)->ApiError{let mut e=ApiError::new(status,message);e.data=json!({"code":code});e}
fn invalid(message:impl Into<String>)->ApiError{error(400,message,"artwork_recovery_invalid")}
fn conflict()->ApiError{error(409,CONFLICT_MESSAGE,"artwork_recovery_conflict")}
fn exact(value:&Value,keys:&[&str])->bool{value.as_object().is_some_and(|map|map.len()==keys.len()&&keys.iter().all(|k|map.contains_key(*k)))}
fn validate_id(id:&str)->Result<(),ApiError>{if regex(r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$").is_match(id){Ok(())}else{Err(invalid("完整作品恢复编号无效。"))}}
pub fn is_record_file(name:&str)->bool{regex(r"^artwork-recovery-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$").is_match(name)}
fn filename(id:&str)->String{format!("artwork-recovery-{id}.json")}

/// Match the original local-service envelope boundary. Detailed model and pose
/// geometry validation remains in the unchanged renderer restore codecs.
pub fn validate_artwork(text:&str)->Result<Value,ApiError>{
    let value:Value=serde_json::from_str(text).map_err(|_|invalid("完整作品恢复副本不是有效 JSON。"))?;
    validate_artwork_value(&value)?;Ok(value)
}
/// Keep the optional drawing settings aligned with the renderer's validator.
/// Older drawings omit these settings; geometry is still checked independently.
fn validate_diagram_basic_settings(settings:&Value)->Result<(),ApiError>{
    let bad=||invalid("完整作品折序基本设置无效。");let paper=&settings["paper"];
    let shape=paper["shape"].as_str().filter(|shape|["square","rectangle","triangle","regular","custom"].contains(shape)).ok_or_else(bad)?;
    let limit=if shape=="custom"{1_000_000.0}else{100_000.0};
    if !settings.is_object()||!["width","height"].iter().all(|key|paper[*key].as_f64().is_some_and(|n|n.is_finite()&&n>0.0&&n<=limit))
        ||!paper["sides"].as_f64().is_some_and(|n|n.fract()==0.0&&(3.0..=64.0).contains(&n))||!settings["adaptiveLines"].is_boolean(){return Err(bad())}
    let color=|value:&Value,short:bool|value.as_str().is_some_and(|s|regex(if short{r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"}else{r"^#[0-9a-fA-F]{6}$"}).is_match(s));
    let colors=&settings["colors"];if !exact(colors,&["front","back","line"])||!["front","back","line"].iter().all(|key|color(&colors[*key],false)){return Err(bad())}
    let defaults=&settings["lineDefaults"];let styles=["valley","mountain","crease","auxiliary","boundary"];
    if !exact(defaults,&styles){return Err(bad())}
    for style in styles{
        let line=&defaults[style];let fields=if line.get("globalFields").is_some(){&["color","width","strokePattern","globalFields"][..]}else{&["color","width","strokePattern"][..]};
        if !exact(line,fields)||!color(&line["color"],true)||!line["width"].as_f64().is_some_and(|n|n.is_finite()&&(1e-6..=1000.0).contains(&n))
            ||!line["strokePattern"].as_str().is_some_and(|s|["solid","dashed","dash-dot","dotted"].contains(&s)){return Err(bad())}
        if let Some(fields)=line.get("globalFields"){
            let fields=fields.as_array().filter(|fields|fields.len()<=3).ok_or_else(bad)?;let mut seen=HashSet::new();
            for field in fields{let field=field.as_str().filter(|s|["color","width","strokePattern"].contains(s)).ok_or_else(bad)?;if !seen.insert(field){return Err(bad())}}
        }
    }
    Ok(())
}
fn validate_artwork_value(value:&Value)->Result<(),ApiError>{
    let v2=value["version"]==2;
    let fields=if v2{&["format","version","editor","models","diagram","simulation","construction","design"][..]}else{&["format","version","editor","models","diagram","simulation","construction"][..]};
    if !exact(value,fields)||value["format"]!="zhezhi-artwork"||(!v2&&value["version"]!=1){return Err(invalid("完整作品恢复副本的格式或版本不支持。"))}
    let design=&value["design"];
    if v2&&!design.is_null(){
        if !exact(design,&["format","version","name","kind","model"])||design["format"]!="zhezhi-base-design"||design["version"]!=1||!design["name"].as_str().is_some_and(|s|!s.trim().is_empty()){return Err(invalid("完整作品基础形设计格式无效。"))}
        // Envelope/type validation only; restoring the renderer performs the
        // full editable-source checks. Autosave must not run an optimizer.
        let valid=match design["kind"].as_str(){
            Some("tree")=>serde_json::from_value::<treemaker_core::TreeDesign>(design["model"].clone()).is_ok(),
            Some("box")=>serde_json::from_value::<oristudio_bp::Project>(design["model"].clone()).is_ok(),
            _=>false,
        };
        if !valid{return Err(invalid("完整作品基础形模型不完整。"))}
    }
    validate_doc(&value["editor"])?;
    if !exact(&value["construction"],&["tessellation","curve"])||!value["construction"]["tessellation"].is_object(){return Err(invalid("完整作品构造参数无效。"))}
    let curve=&value["construction"]["curve"];
    if !curve.is_null()&&(!exact(curve,&["format","version","name","millimetersPerUnit","query","result"])||curve["format"]!="zhezhi-curve-design"||curve["version"]!=1){return Err(invalid("曲面设计恢复格式无效。"))}
    let models=&value["models"];
    if !models.is_null(){
        let entries=models["entries"].as_array().filter(|x|!x.is_empty()).ok_or_else(||invalid("完整作品模型集合无效。"))?;
        if !exact(models,&["activeId","entries"]){return Err(invalid("完整作品模型集合无效。"))}
        let mut ids=HashSet::new();
        for entry in entries{
            let id=entry["id"].as_str().filter(|s|!s.is_empty()).ok_or_else(||invalid("完整作品模型记录无效。"))?;
            let name=entry["name"].as_str().filter(|s|!s.trim().is_empty()&&s.encode_utf16().count()<=200).ok_or_else(||invalid("完整作品模型记录无效。"))?;
            let _=name;let snapshot=&entry["snapshot"];
            let fields=if entry.get("cpKey").is_some(){&["id","name","snapshot","view","cpKey"][..]}else{&["id","name","snapshot","view"][..]};
            if let Some(key)=entry.get("cpKey"){if !key.as_str().is_some_and(|s|!s.trim().is_empty()&&!s.chars().any(|c|c<='\u{001f}')){return Err(invalid("完整作品 CP 来源标识无效。"))}}
            if !exact(entry,fields)||!ids.insert(id.to_owned())||!exact(snapshot,&["format","version","source","model"])||snapshot["format"]!="zhezhi-folded-model"||!snapshot["version"].as_u64().is_some_and(|x|(1..=4).contains(&x))||!snapshot["model"]["vertices"].is_array()||(!entry["view"].is_object()&&!entry["view"].is_array()){return Err(invalid("完整作品模型记录无效。"))}
            validate_doc(&snapshot["source"])?;
        }
        if !models["activeId"].is_null()&&!models["activeId"].as_str().is_some_and(|id|ids.contains(id)){return Err(invalid("完整作品活动模型不存在。"))}
    }
    let diagram=&value["diagram"];
    if !diagram.is_null(){
        let fields=if diagram.get("basicSettings").is_some(){&["format","version","name","states","steps","activeStepId","basicSettings"][..]}else{&["format","version","name","states","steps","activeStepId"][..]};
        if !exact(diagram,fields)||diagram["format"]!="zhezhi-diagram"||diagram["version"]!=1||!diagram["states"].is_array()||!diagram["steps"].as_array().is_some_and(|x|!x.is_empty())||diagram["states"].as_array().unwrap().len()!=diagram["steps"].as_array().unwrap().len()+1{return Err(invalid("完整作品折序记录无效。"))}
        if let Some(settings)=diagram.get("basicSettings"){validate_diagram_basic_settings(settings)?;}
        for state in diagram["states"].as_array().unwrap(){if !exact(state,&["id","doc","revision"])||!state["id"].is_string()||!state["revision"].as_u64().is_some_and(|n|n<=9_007_199_254_740_991){return Err(invalid("完整作品折序源记录无效。"))}validate_doc(&state["doc"])?;}
    }
    let simulation=&value["simulation"];
    if !simulation.is_null()&&(!exact(simulation,&["version","source","solver","progress","settings","view"])||simulation["version"]!=1||simulation["source"].is_null()||simulation["solver"]["version"]!=1||!simulation["progress"].as_f64().is_some_and(|x|x.is_finite()&&x.abs()<=1.)){return Err(invalid("完整作品三维姿态记录无效。"))}
    Ok(())
}

struct Saved { text:String, revision:String, bytes:usize, updated:String }
fn read(root:&Path,id:&str)->Result<Option<Saved>,ApiError>{
    Ok(read_snapshot(root,id)?.map(|(bytes,updated)|saved_snapshot(bytes,updated)))
}
fn read_snapshot(root:&Path,id:&str)->Result<Option<(Vec<u8>,String)>,ApiError>{
    validate_id(id)?;let path=root.join(filename(id));
    let Some(bytes)=regular_bytes(&path,"完整作品恢复文件")? else{return Ok(None)};
    let updated:DateTime<Utc>=fs::metadata(path)?.modified()?.into();
    Ok(Some((bytes,updated.to_rfc3339_opts(chrono::SecondsFormat::Millis,true))))
}
fn saved_snapshot(bytes:Vec<u8>,updated:String)->Saved{
    let revision=digest(&bytes);let length=bytes.len();let text=String::from_utf8(bytes).unwrap_or_else(|e|String::from_utf8_lossy(e.as_bytes()).into_owned());Saved{text,revision,bytes:length,updated}
}
/// Saving needs only the existing envelope/tombstone, not another parsed copy
/// of its complete artwork geometry. Raw fields borrow the existing file text.
/// RawValue alone skips numeric conversion and nesting checks. Traverse without
/// retaining values first, so corrupt old files keep Value's rejection rules,
/// including overflow in a duplicate field that would later be overwritten.
struct CheckedJson;
impl<'de> Deserialize<'de> for CheckedJson{
    fn deserialize<D:Deserializer<'de>>(deserializer:D)->Result<Self,D::Error>{
        struct Check;
        impl<'de> Visitor<'de> for Check{
            type Value=CheckedJson;
            fn expecting(&self,formatter:&mut std::fmt::Formatter)->std::fmt::Result{formatter.write_str("valid JSON")}
            fn visit_bool<E:serde::de::Error>(self,_:bool)->Result<CheckedJson,E>{Ok(CheckedJson)}
            fn visit_i64<E:serde::de::Error>(self,_:i64)->Result<CheckedJson,E>{Ok(CheckedJson)}
            fn visit_u64<E:serde::de::Error>(self,_:u64)->Result<CheckedJson,E>{Ok(CheckedJson)}
            fn visit_f64<E:serde::de::Error>(self,_:f64)->Result<CheckedJson,E>{Ok(CheckedJson)}
            fn visit_str<E:serde::de::Error>(self,_:&str)->Result<CheckedJson,E>{Ok(CheckedJson)}
            fn visit_unit<E:serde::de::Error>(self)->Result<CheckedJson,E>{Ok(CheckedJson)}
            fn visit_seq<A:SeqAccess<'de>>(self,mut sequence:A)->Result<CheckedJson,A::Error>{while sequence.next_element::<CheckedJson>()?.is_some(){}Ok(CheckedJson)}
            fn visit_map<A:MapAccess<'de>>(self,mut map:A)->Result<CheckedJson,A::Error>{while map.next_key::<CheckedJson>()?.is_some(){map.next_value::<CheckedJson>()?;}Ok(CheckedJson)}
        }
        deserializer.deserialize_any(Check)
    }
}
fn existing_deleted(saved:&Saved,id:&str)->Result<bool,ApiError>{
    let _:CheckedJson=serde_json::from_str(&saved.text).map_err(|_|invalid("完整作品恢复文件损坏，原文件已保留。"))?;
    let fields:HashMap<String,&RawValue>=serde_json::from_str(&saved.text).map_err(|_|invalid("完整作品恢复文件损坏，原文件已保留。"))?;
    let matches=|key:&str,wanted:Value|fields.get(key).is_some_and(|raw|serde_json::from_str::<Value>(raw.get()).is_ok_and(|v|v==wanted));
    let common=matches("format",json!("zhezhi-artwork-recovery"))&&matches("version",json!(1))&&matches("id",json!(id));
    if common&&fields.len()==4&&matches("deleted",json!(true)){return Ok(true)}
    let updated=fields.get("updated").and_then(|raw|serde_json::from_str::<String>(raw.get()).ok());
    if !common||fields.len()!=5||!fields.contains_key("artwork")||!updated.as_deref().is_some_and(|text|DateTime::parse_from_rfc3339(text).is_ok()){return Err(invalid("完整作品恢复文件格式无效，原文件已保留。"))}Ok(false)
}
fn decode(saved:&Saved,id:&str)->Result<Option<Value>,ApiError>{
    let value:Value=serde_json::from_str(&saved.text).map_err(|_|invalid("完整作品恢复文件损坏，原文件已保留。"))?;
    if exact(&value,&["format","version","id","deleted"])&&value["format"]=="zhezhi-artwork-recovery"&&value["version"]==1&&value["id"]==id&&value["deleted"]==true{return Ok(None)}
    if !exact(&value,&["format","version","id","updated","artwork"])||value["format"]!="zhezhi-artwork-recovery"||value["version"]!=1||value["id"]!=id||!value["updated"].as_str().is_some_and(|s|DateTime::parse_from_rfc3339(s).is_ok()){return Err(invalid("完整作品恢复文件格式无效，原文件已保留。"))}Ok(Some(value))
}
#[derive(Default)]
struct ByteCount(usize);
impl Write for ByteCount{fn write(&mut self,bytes:&[u8])->std::io::Result<usize>{self.0+=bytes.len();Ok(bytes.len())}fn flush(&mut self)->std::io::Result<()>{Ok(())}}
fn serialized_size(value:&Value)->usize{let mut count=ByteCount::default();serde_json::to_writer(&mut count,value).map(|_|count.0).unwrap_or(0)}
fn artwork_summary(id:&str,revision:&str,updated:&str,artwork:&Value)->Value{
    artwork_summary_bytes(id,revision,updated,artwork,serialized_size(artwork))
}
fn artwork_summary_bytes(id:&str,revision:&str,updated:&str,artwork:&Value,bytes:usize)->Value{
    let name=artwork["editor"]["name"].as_str().unwrap_or("");
    let mut used=0;let name:String=name.chars().take_while(|ch|{used+=ch.len_utf16();used<=160}).collect();
    json!({"id":id,"name":name,"updated":updated,"revision":revision,"bytes":bytes,"models":artwork["models"]["entries"].as_array().map_or(0,Vec::len),"steps":artwork["diagram"]["steps"].as_array().map_or(0,Vec::len),"simulation":!artwork["simulation"].is_null()})
}
fn summary(id:&str,saved:&Saved,record:&Value)->Value{artwork_summary(id,&saved.revision,record["updated"].as_str().unwrap_or(""),&record["artwork"])}
fn cached_summary_valid(id:&str,value:&Value)->bool{
    value["id"]==id&&value["name"].is_string()&&value["updated"].as_str().is_some_and(|s|DateTime::parse_from_rfc3339(s).is_ok())
        &&value["revision"].as_str().is_some_and(|s|regex(r"^[a-f0-9]{64}$").is_match(s))
        &&["bytes","models","steps"].iter().all(|key|value[*key].as_u64().is_some())&&value["simulation"].is_boolean()
        &&(exact(value,&["id","name","updated","revision","bytes","models","steps","simulation"])||exact(value,&["id","name","updated","revision","bytes","models","steps","simulation","damaged"])&&value["damaged"]==true)
}
#[derive(Serialize)]
struct ArtworkRecord<'a>{format:&'static str,version:u8,id:&'a str,updated:&'a str,artwork:&'a Value}

#[derive(Clone)]
pub struct ArtworkRecovery { storage:Storage }
impl ArtworkRecovery {
    pub fn new(storage:Storage)->Self{Self{storage}}
    pub fn list(&self)->Result<Value,ApiError>{self.list_mode(false)}
    pub fn list_cached(&self)->Result<Value,ApiError>{self.list_mode(true)}
    fn list_mode(&self,cached_only:bool)->Result<Value,ApiError>{
        let paths=self.storage.snapshot_paths("dataDir")?;
        let cache_file=paths.data_dir.join(".zhezhi-artwork-list-cache.v1.json");let old=SummaryCache::read(&cache_file);let mut next=SummaryCache::default();
            let mut entries=vec![];let mut warnings=vec![];
            let names=match fs::read_dir(&paths.data_dir){Ok(names)=>names,Err(e)if e.kind()==std::io::ErrorKind::NotFound=>return Ok(json!({"entries":entries,"warnings":warnings})),Err(e)=>return Err(e.into())};
            for entry in names{
                let name=entry?.file_name().to_string_lossy().into_owned();if !is_record_file(&name){continue}let id=&name["artwork-recovery-".len()..name.len()-5];let mut saved=None;
                let stamp=match file_stamp(&paths.data_dir.join(&name)){Ok(Some(stamp))=>stamp,Ok(None)=>continue,Err(error)=>{warnings.push(format!("{name}：{}",error.message));continue}};
                if let Some(hit)=old.entries.get(&name).filter(|entry|entry.stamp==stamp&&entry.value.as_ref().is_none_or(|value|cached_summary_valid(id,value))){
                    if let Some(value)=&hit.value{entries.push(value.clone());}if let Some(warning)=&hit.warning{warnings.push(warning.clone());}next.entries.insert(name,hit.clone());continue;
                }
                if cached_only{continue;}
                let result=(||{saved=read(&paths.data_dir,id)?;let Some(saved)=saved.as_ref()else{return Ok(None)};let Some(record)=decode(saved,id)?else{return Ok(None)};validate_artwork_value(&record["artwork"])?;Ok::<_,ApiError>(Some(summary(id,saved,&record)))})();
                let (value,warning)=match result{Ok(value)=>(value,None),Err(error)=>{let value=saved.map(|saved|json!({"id":id,"name":"损坏的完整作品恢复副本","updated":saved.updated,"revision":saved.revision,"bytes":saved.bytes,"models":0,"steps":0,"simulation":false,"damaged":true}));(value,Some(format!("{name}：{}",error.message)))}};
                if file_stamp(&paths.data_dir.join(&name))?.as_ref()!=Some(&stamp){warnings.push(format!("{name}：恢复副本在读取期间更新，请刷新列表。"));continue;}
                if let Some(value)=&value{entries.push(value.clone());}if let Some(warning)=&warning{warnings.push(warning.clone());}
                next.entries.insert(name,CachedSummary{stamp,value,warning});
            }
            entries.sort_by(|a,b|b["updated"].as_str().unwrap_or("").cmp(a["updated"].as_str().unwrap_or("")).then_with(||a["id"].as_str().cmp(&b["id"].as_str())));
            self.storage.check_snapshot_paths("dataDir",&paths)?;if !cached_only&&next!=old{next.write(&cache_file);}
            Ok(json!({"entries":entries,"warnings":warnings}))
    }
    pub fn get(&self,id:&str)->Result<Value,ApiError>{
        let (paths,(bytes,updated))=self.storage.with_read("dataDir",|paths|Ok((paths.clone(),read_snapshot(&paths.data_dir,id)?.ok_or_else(||error(404,"找不到完整作品恢复副本。","artwork_recovery_invalid"))?)))?;
        let saved=saved_snapshot(bytes,updated);
            let record=decode(&saved,id)?.ok_or_else(||error(404,"完整作品恢复副本已删除。","artwork_recovery_invalid"))?;
            validate_artwork_value(&record["artwork"])?;let text=serde_json::to_string(&record["artwork"])?;
            let mut result=json!({"summary":artwork_summary_bytes(id,&saved.revision,record["updated"].as_str().unwrap_or(""),&record["artwork"],text.len())});result["text"]=Value::String(text);
            self.storage.check_snapshot_paths("dataDir",&paths)?;Ok(result)
    }
    pub fn put(&self,input:&Value)->Result<Value,ApiError>{
        if !exact(input,&["id","expectedRevision","text"]){return Err(invalid("完整作品恢复保存请求无效。"))}
        let id=input["id"].as_str().ok_or_else(||invalid("完整作品恢复编号无效。"))?;validate_id(id)?;
        let expected=if input["expectedRevision"].is_null(){None}else{Some(input["expectedRevision"].as_str().filter(|s|regex(r"^[a-f0-9]{64}$").is_match(s)).ok_or_else(||invalid("完整作品恢复修订无效。"))?)};
        let text=input["text"].as_str().ok_or_else(||invalid("完整作品恢复副本必须是 JSON 文本。"))?;let artwork=validate_artwork(text)?;
        self.storage.with_write(|paths|{
            let _guard=intent_lock(&paths.data_dir,"artwork-recovery.lock.",CONFLICT_MESSAGE).map_err(|e|if e.status==409{conflict()}else{e})?;
            let saved=read(&paths.data_dir,id)?;
            if saved.as_ref().map(|s|s.revision.as_str())!=expected{return Err(conflict())}
            if let Some(saved)=saved.as_ref(){if existing_deleted(saved,id)?{return Err(conflict())}}
            drop(saved);
            let updated=now();let record=ArtworkRecord{format:"zhezhi-artwork-recovery",version:1,id,updated:&updated,artwork:&artwork};
            let file=paths.data_dir.join(filename(id));atomic_json(&file,&record)?;
            let mut hash=sha2::Sha256::new();let mut source=fs::File::open(&file)?;let mut buffer=[0u8;64*1024];
            use sha2::Digest;use std::io::Read;
            loop{let count=source.read(&mut buffer)?;if count==0{break}hash.update(&buffer[..count]);}
            let value=artwork_summary(id,&hex::encode(hash.finalize()),&updated,&artwork);
            if let Ok(Some(stamp))=file_stamp(&file){let cache_file=paths.data_dir.join(".zhezhi-artwork-list-cache.v1.json");let mut cache=SummaryCache::read(&cache_file);cache.entries.insert(filename(id),CachedSummary{stamp,value:Some(value.clone()),warning:None});cache.write(&cache_file);}
            Ok(value)
        })
    }
    pub fn delete(&self,input:&Value)->Result<Value,ApiError>{
        if !exact(input,&["id","expectedRevision"]){return Err(invalid("完整作品恢复删除请求无效。"))}
        let id=input["id"].as_str().ok_or_else(||invalid("完整作品恢复编号无效。"))?;validate_id(id)?;
        let expected=input["expectedRevision"].as_str().filter(|s|regex(r"^[a-f0-9]{64}$").is_match(s)).ok_or_else(||invalid("完整作品恢复删除请求无效。"))?;
        self.storage.with_write(|paths|{
            let _guard=intent_lock(&paths.data_dir,"artwork-recovery.lock.",CONFLICT_MESSAGE).map_err(|e|if e.status==409{conflict()}else{e})?;
            let saved=read(&paths.data_dir,id)?.ok_or_else(conflict)?;if saved.revision!=expected{return Err(conflict())}
            atomic_bytes(&paths.data_dir.join(filename(id)),serde_json::to_string(&json!({"format":"zhezhi-artwork-recovery","version":1,"id":id,"deleted":true}))?.as_bytes())?;Ok(json!({"id":id,"deleted":true}))
        })
    }
    pub fn save(&self,input:&Value)->Result<Value,ApiError>{self.put(input)}
    pub fn load(&self,id:&str)->Result<Value,ApiError>{self.get(id)}
    pub fn remove(&self,input:&Value)->Result<Value,ApiError>{self.delete(input)}
}

#[cfg(test)]
mod tests{
    use super::*;
    fn artwork()->Value{json!({"format":"zhezhi-artwork","version":1,"editor":{"name":"恢复作品","paper":{"width":200,"height":200},"segments":[]},"models":null,"diagram":null,"simulation":null,"construction":{"tessellation":{},"curve":null}})}
    #[test]fn drawings_with_optional_basic_settings_roundtrip_and_invalid_updates_preserve_prior(){
        let mut value=artwork();let source=value["editor"].clone();
        let states:Vec<Value>=(0..3).map(|i|json!({"id":format!("state-{i}"),"doc":source,"revision":0})).collect();
        let steps:Vec<Value>=(0..2).map(|i|json!({"id":format!("step-{i}"),"title":"折序","description":"保留说明","beforeId":format!("state-{i}"),"afterId":format!("state-{}",i+1),"pose":null})).collect();
        value["diagram"]=json!({"format":"zhezhi-diagram","version":1,"name":"旧版两步绘图","states":states,"steps":steps,"activeStepId":"step-0"});
        assert!(validate_artwork(&value.to_string()).is_ok(),"old drawings without basic settings remain supported");
        let mut lines=serde_json::Map::new();for (style,pattern) in [("valley","dashed"),("mountain","dash-dot"),("crease","solid"),("auxiliary","dotted"),("boundary","solid")]{lines.insert(style.into(),json!({"color":"#293d35","width":0.7,"strokePattern":pattern,"globalFields":["color","width","strokePattern"]}));}
        value["diagram"]["basicSettings"]=json!({"paper":{"shape":"rectangle","width":100,"height":200,"sides":6},"colors":{"front":"#c5dac2","back":"#f3e6ce","line":"#41634e"},"lineDefaults":lines,"adaptiveLines":true});
        let root=tempfile::tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let store=ArtworkRecovery::new(storage.clone());let id="11111111-1111-4111-8111-111111111111";
        let saved=store.put(&json!({"id":id,"expectedRevision":null,"text":value.to_string()})).unwrap();let file=storage.paths().data_dir.join(filename(id));let original=fs::read(&file).unwrap();
        assert_eq!(saved["steps"],2);assert_eq!(serde_json::from_str::<Value>(store.get(id).unwrap()["text"].as_str().unwrap()).unwrap(),value);
        assert_eq!(store.list().unwrap()["entries"][0]["steps"],2);
        let mut invalid=Vec::new();
        for settings in [json!(null),json!(false),json!([])]{let mut bad=value.clone();bad["diagram"]["basicSettings"]=settings;invalid.push(bad);}
        for (field,bad_value) in [("shape",json!("unknown")),("width",json!(0)),("height",json!(100001)),("sides",json!(2)),("sides",json!(6.5))]{let mut bad=value.clone();bad["diagram"]["basicSettings"]["paper"][field]=bad_value;invalid.push(bad);}
        for (field,bad_value) in [("color",json!("red")),("width",json!(0)),("strokePattern",json!("unknown")),("globalFields",json!(["color","color"])),("globalFields",json!(["unknown"])),("extra",json!(true))]{let mut bad=value.clone();bad["diagram"]["basicSettings"]["lineDefaults"]["valley"][field]=bad_value;invalid.push(bad);}
        let mut bad=value.clone();bad["diagram"]["basicSettings"]["colors"]["line"]=json!("#abc");invalid.push(bad);
        let mut bad=value.clone();bad["diagram"]["basicSettings"]["adaptiveLines"]=json!("true");invalid.push(bad);
        let mut bad=value.clone();bad["diagram"]["basicSettings"]["lineDefaults"].as_object_mut().unwrap().remove("boundary");invalid.push(bad);
        let mut bad=value.clone();bad["diagram"]["unknown"]=json!(true);invalid.push(bad);
        let mut bad=value.clone();bad["diagram"]["states"][2]["doc"]["paper"]["width"]=json!(-1);invalid.push(bad);
        for bad in invalid{assert_eq!(store.put(&json!({"id":id,"expectedRevision":saved["revision"],"text":bad.to_string()})).unwrap_err().status,400);assert_eq!(fs::read(&file).unwrap(),original,"an invalid update must preserve the previous complete snapshot");}
        for shape in ["square","rectangle","triangle","regular","custom"]{let mut valid=value.clone();valid["diagram"]["basicSettings"]["paper"]["shape"]=json!(shape);valid["diagram"]["basicSettings"]["paper"]["width"]=json!(if shape=="custom"{1_000_000}else{100_000});valid["diagram"]["basicSettings"]["lineDefaults"]["valley"]["color"]=json!("#AbC");valid["diagram"]["basicSettings"]["lineDefaults"]["valley"]["globalFields"]=json!([]);assert!(validate_artwork(&valid.to_string()).is_ok());}
    }
    #[test]fn cached_lists_persist_but_changed_deleted_and_corrupt_sources_are_detected(){
        let root=tempfile::tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let store=ArtworkRecovery::new(storage.clone());let id="11111111-1111-4111-8111-111111111111";
        store.put(&json!({"id":id,"expectedRevision":null,"text":artwork().to_string()})).unwrap();
        let first=store.list().unwrap();let cache_file=storage.paths().data_dir.join(".zhezhi-artwork-list-cache.v1.json");let cache_stamp=file_stamp(&cache_file).unwrap();
        assert_eq!(ArtworkRecovery::new(storage.clone()).list().unwrap(),first,"a fresh store reuses the persistent index");assert_eq!(file_stamp(&cache_file).unwrap(),cache_stamp,"unchanged lists do not rewrite the index");
        fs::write(&cache_file,"invalid index").unwrap();assert_eq!(store.list().unwrap(),first,"a broken disposable index rebuilds from original data");
        let source=storage.paths().data_dir.join(filename(id));let original=fs::read_to_string(&source).unwrap();let changed=original.replace("恢复作品","恢复新作");assert_eq!(original.len(),changed.len());fs::write(&source,changed).unwrap();
        fs::OpenOptions::new().write(true).open(&source).unwrap().set_times(fs::FileTimes::new().set_modified(std::time::SystemTime::now()+std::time::Duration::from_secs(2))).unwrap();
        assert_eq!(store.list().unwrap()["entries"][0]["name"],"恢复新作","same-length external edits invalidate the mtime fingerprint");
        fs::write(&source,"broken source").unwrap();
        assert_eq!(store.list().unwrap()["entries"][0]["damaged"],true);assert!(store.get(id).is_err(),"opening still validates the actual source");assert_eq!(fs::read_to_string(&source).unwrap(),"broken source");
        fs::remove_file(source).unwrap();assert!(store.list().unwrap()["entries"].as_array().unwrap().is_empty(),"deleted sources cannot survive only in the display index");
    }
    #[test]fn startup_cached_list_never_builds_missing_or_stale_body_summaries(){
        let root=tempfile::tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let store=ArtworkRecovery::new(storage.clone());let id="11111111-1111-4111-8111-111111111111";
        let source=storage.paths().data_dir.join(filename(id));fs::write(&source,"uncached corrupt body").unwrap();
        assert_eq!(store.list_cached().unwrap(),json!({"entries":[],"warnings":[]}));assert!(!storage.paths().data_dir.join(".zhezhi-artwork-list-cache.v1.json").exists());
        assert_eq!(store.list().unwrap()["entries"][0]["damaged"],true);assert_eq!(store.list_cached().unwrap()["entries"][0]["damaged"],true);
        fs::write(&source,"a changed body with a different length").unwrap();assert!(store.list_cached().unwrap()["entries"].as_array().unwrap().is_empty());
    }
    #[test]fn revisions_and_tombstones_prevent_stale_resurrection(){
        let root=tempfile::tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let store=ArtworkRecovery::new(storage);let id="11111111-1111-4111-8111-111111111111";let text=artwork().to_string();
        let first=store.put(&json!({"id":id,"expectedRevision":null,"text":text})).unwrap();assert_eq!(first["name"],"恢复作品");assert_eq!(store.list().unwrap()["entries"].as_array().unwrap().len(),1);assert_eq!(serde_json::from_str::<Value>(store.get(id).unwrap()["text"].as_str().unwrap()).unwrap(),artwork());
        assert_eq!(store.put(&json!({"id":id,"expectedRevision":null,"text":text})).unwrap_err().status,409);
        store.delete(&json!({"id":id,"expectedRevision":first["revision"]})).unwrap();assert!(store.list().unwrap()["entries"].as_array().unwrap().is_empty());assert_eq!(store.get(id).unwrap_err().status,404);assert_eq!(store.put(&json!({"id":id,"expectedRevision":null,"text":text})).unwrap_err().status,409);
    }
    #[test]fn malformed_records_are_reported_and_preserved(){let root=tempfile::tempdir().unwrap();let storage=Storage::new(root.path().join("data"),false).unwrap();let file=storage.paths().data_dir.join(filename("11111111-1111-4111-8111-111111111111"));fs::write(&file,"broken").unwrap();let store=ArtworkRecovery::new(storage);let list=store.list().unwrap();assert_eq!(list["entries"][0]["damaged"],true);assert_eq!(list["warnings"].as_array().unwrap().len(),1);assert_eq!(fs::read_to_string(file).unwrap(),"broken");}
    #[test]fn invalid_geometry_is_rejected_before_committing(){let mut value=artwork();value["editor"]["paper"]["width"]=json!(-1);assert!(validate_artwork(&value.to_string()).is_err());}
    #[test]fn cp_source_keys_roundtrip_without_losing_legacy_results(){
        let mut value=artwork();let source=value["editor"].clone();
        let entry=json!({"id":"model-0","name":"模型","snapshot":{"format":"zhezhi-folded-model","version":2,"source":source,"model":{"vertices":[]}},"view":{},"cpKey":"boundary:\"original-paper\""});
        let entries:Vec<Value>=(0..6).map(|i|{let mut e=entry.clone();e["id"]=json!(format!("model-{i}"));e}).collect();
        value["models"]=json!({"activeId":"model-0","entries":entries});
        let root=tempfile::tempdir().unwrap();let store=ArtworkRecovery::new(Storage::new(root.path().join("data"),false).unwrap());let id="11111111-1111-4111-8111-111111111111";
        store.put(&json!({"id":id,"expectedRevision":null,"text":value.to_string()})).unwrap();
        assert_eq!(serde_json::from_str::<Value>(store.get(id).unwrap()["text"].as_str().unwrap()).unwrap(),value);
        let mut old=value.clone();old["models"]["entries"][0].as_object_mut().unwrap().remove("cpKey");assert!(validate_artwork(&old.to_string()).is_ok());
        for key in [json!(null),json!(5),json!(""),json!("  "),json!("bad\nkey")]{let mut bad=value.clone();bad["models"]["entries"][1]["cpKey"]=key;assert!(validate_artwork(&bad.to_string()).is_err());}
        let mut bad=value.clone();bad["models"]["entries"][1]["extra"]=json!(true);assert!(validate_artwork(&bad.to_string()).is_err());
    }
    #[test]fn borrowed_old_envelopes_preserve_decoder_acceptance_and_tombstone_checks(){
        let id="11111111-1111-4111-8111-111111111111";
        let active=json!({"format":"zhezhi-artwork-recovery","version":1,"id":id,"updated":now(),"artwork":artwork()});
        let mut bad=active.clone();bad["unexpected"]=json!(true);
        let mut bad_date=active.clone();bad_date["updated"]=json!("invalid");
        let tombstone=json!({"format":"zhezhi-artwork-recovery","version":1,"id":id,"deleted":true});
        for value in [active,bad,bad_date,tombstone]{let saved=Saved{text:value.to_string().replace("\"format\"","\"form\\u0061t\""),revision:String::new(),bytes:0,updated:now()};
            let old=decode(&saved,id).map(|v|v.is_none());let current=existing_deleted(&saved,id);assert_eq!(old.is_ok(),current.is_ok());if let Ok(deleted)=old{assert_eq!(current.unwrap(),deleted);}}
    }
    #[test]fn old_envelope_numeric_overflow_depth_and_duplicate_keys_keep_value_parser_semantics(){
        let id="11111111-1111-4111-8111-111111111111";let text=json!({"format":"zhezhi-artwork-recovery","version":1,"id":id,"updated":now(),"artwork":artwork()}).to_string();
        let nested=format!("{}0{}","[".repeat(130),"]".repeat(130));
        for input in [text.replace("\"artwork\":","\"artwork\":1e400,\"artwork\":"),text.replace("\"artwork\":","\"artwork\":-1e400,\"artwork\":"),text.replace("\"artwork\":","\"artwork\":1e-400,\"artwork\":"),text.replace("\"artwork\":","\"artwork\":{\"\\ud800\":0},\"artwork\":"),text.replace("\"artwork\":","\"artwork\":\"\\ud800\",\"artwork\":"),text.replace("\"artwork\":",&format!("\"artwork\":{nested},\"artwork\":")),text.replace("\"version\":1","\"version\":0,\"version\":1"),text.replace("\"version\":1","\"version\":1,\"version\":0")]{
            let saved=Saved{text:input,revision:String::new(),bytes:0,updated:now()};let previous=decode(&saved,id).map(|v|v.is_none());let current=existing_deleted(&saved,id);assert_eq!(previous.is_ok(),current.is_ok(),"{}",saved.text);if let Ok(deleted)=previous{assert_eq!(current.unwrap(),deleted);}
        }
    }
    #[test]fn updates_retain_exact_artwork_and_report_compact_utf8_bytes(){
        let root=tempfile::tempdir().unwrap();let store=ArtworkRecovery::new(Storage::new(root.path().join("data"),false).unwrap());let id="11111111-1111-4111-8111-111111111111";
        let mut value=artwork();value["editor"]["metadata"]=json!({"unrecognized":{"preserved":"中文\\\"\n"}});let first=store.put(&json!({"id":id,"expectedRevision":null,"text":value.to_string()})).unwrap();
        value["editor"]["name"]=json!("更新后的完整作品");let next=store.put(&json!({"id":id,"expectedRevision":first["revision"],"text":value.to_string()})).unwrap();assert_ne!(next["revision"],first["revision"]);
        assert_eq!(next["bytes"],serde_json::to_vec(&value).unwrap().len());let loaded=store.get(id).unwrap();assert_eq!(serde_json::from_str::<Value>(loaded["text"].as_str().unwrap()).unwrap(),value);assert_eq!(loaded["summary"],next);
    }
}
