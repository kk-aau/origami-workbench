//! Native, bounded-memory exports. Only a picker-selected target enters this store.
use std::{collections::HashMap, fs::{self, File, OpenOptions}, io::Write, path::PathBuf, sync::{Arc, Mutex, atomic::{AtomicBool,Ordering}}};
use uuid::Uuid;

pub const CHUNK_BYTES: usize = 1024 * 1024;

pub fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len()>1000 || name=="." || name==".." || name.chars().any(|c|c.is_control()||"<>:\"/\\|?*".contains(c)) {
        return Err("导出文件名称无效。".into());
    }
    Ok(())
}

struct PendingExport { target: PathBuf, staging: PathBuf, file: Option<File>, expected: u64, written: u64 }
impl Drop for PendingExport {
    fn drop(&mut self) { drop(self.file.take()); let _=fs::remove_file(&self.staging); }
}
impl PendingExport {
    fn create(target: PathBuf, expected: u64) -> Result<Self,String> {
        if !target.is_absolute() || target.file_name().is_none() {return Err("请选择完整的保存路径。".into());}
        let staging=target.parent().ok_or("保存目录无效。")?.join(format!(".zhezhi-export-{}.part",Uuid::new_v4()));
        let file=OpenOptions::new().write(true).create_new(true).open(&staging).map_err(|e|format!("无法在所选目录创建导出文件：{e}"))?;
        Ok(Self{target,staging,file:Some(file),expected,written:0})
    }
    fn write(&mut self, offset: u64, data: &[u8]) -> Result<u64,String> {
        if data.is_empty() || data.len()>CHUNK_BYTES {return Err("导出数据块大小无效。".into());}
        if offset!=self.written {return Err("导出数据块顺序不匹配，原有文件未被替换。".into());}
        let end=self.written.checked_add(data.len() as u64).filter(|&v|v<=self.expected).ok_or("导出数据超出预期长度。")?;
        self.file.as_mut().ok_or("导出已结束。")?.write_all(data).map_err(|e|format!("导出写入失败：{e}。原有文件未被替换。"))?;
        self.written=end; Ok(end)
    }
    fn commit(mut self) -> Result<PathBuf,String> {
        let mut file=self.file.take().ok_or("导出已结束。")?;
        if self.written!=self.expected || file.metadata().map_err(|e|e.to_string())?.len()!=self.expected {return Err("导出文件不完整，原有文件未被替换。".into());}
        file.flush().map_err(|e|format!("导出文件刷新失败：{e}"))?;
        file.sync_all().map_err(|e|format!("导出文件未能写入磁盘：{e}"))?;
        drop(file);
        // The staging file is in the target directory: rename never crosses a
        // volume and replaces the old file only after all bytes are durable.
        fs::rename(&self.staging,&self.target).map_err(|e|format!("无法保存到所选路径：{e}。原有文件未被替换。"))?;
        Ok(self.target.clone())
    }
}

struct Entry { owner: String, pending: Mutex<Option<PendingExport>> }
#[derive(Default)]
pub struct ExportStore { entries: Mutex<HashMap<String,Arc<Entry>>>, closed: AtomicBool }
impl ExportStore {
    pub fn prepare(&self, owner: &str, target: PathBuf, bytes: u64) -> Result<String,String> {
        if self.closed.load(Ordering::SeqCst){return Err("应用正在关闭，未保存导出文件。".into());}
        let pending=PendingExport::create(target,bytes)?;
        let ticket=Uuid::new_v4().to_string();
        let mut entries=self.entries.lock().map_err(|_|"导出队列不可用。")?;
        if self.closed.load(Ordering::SeqCst){return Err("应用正在关闭，未保存导出文件。".into());}
        entries.insert(ticket.clone(),Arc::new(Entry{owner:owner.into(),pending:Mutex::new(Some(pending))}));
        Ok(ticket)
    }
    fn entry(&self, owner: &str, ticket: &str) -> Result<Arc<Entry>,String> {
        self.entries.lock().map_err(|_|"导出队列不可用。")?.get(ticket).filter(|e|e.owner==owner).cloned().ok_or_else(||"导出请求无效、已取消或已完成。".into())
    }
    fn remove(&self,ticket:&str) { if let Ok(mut entries)=self.entries.lock(){entries.remove(ticket);} }
    pub fn write(&self, owner:&str, ticket:&str, offset:u64, bytes:&[u8]) -> Result<u64,String> {
        let entry=self.entry(owner,ticket)?;
        let mut pending=entry.pending.lock().map_err(|_|"导出文件状态不可用。")?;
        let result=pending.as_mut().ok_or("导出已取消或已完成。")?.write(offset,bytes);
        if result.is_err(){pending.take();self.remove(ticket);}
        result
    }
    pub fn commit(&self, owner:&str, ticket:&str) -> Result<PathBuf,String> {
        let entry=self.entry(owner,ticket)?;
        let result=entry.pending.lock().map_err(|_|"导出文件状态不可用。")?.take().ok_or("导出已取消或已完成。")?.commit();
        self.remove(ticket); result
    }
    pub fn cancel(&self, owner:&str, ticket:&str) -> Result<bool,String> {
        let entry=match self.entry(owner,ticket){Ok(e)=>e,Err(_)=>return Ok(false)};
        let cancelled=entry.pending.lock().map_err(|_|"导出文件状态不可用。")?.take().is_some();
        self.remove(ticket); Ok(cancelled)
    }
    pub fn has_owner(&self, owner:&str)->bool {self.entries.lock().map(|entries|entries.values().any(|entry|entry.owner==owner)).unwrap_or(true)}
    pub fn cancel_owner(&self, owner:&str) {
        let entries=match self.entries.lock(){Ok(mut entries)=>{let tickets=entries.iter().filter(|(_,e)|e.owner==owner).map(|(id,_)|id.clone()).collect::<Vec<_>>();tickets.into_iter().filter_map(|id|entries.remove(&id)).collect::<Vec<_>>()},Err(_)=>return};
        for entry in entries {if let Ok(mut pending)=entry.pending.lock(){pending.take();}}
    }
    pub fn clear(&self) {
        self.closed.store(true,Ordering::SeqCst);
        let entries=match self.entries.lock(){Ok(mut entries)=>entries.drain().map(|(_,e)|e).collect::<Vec<_>>(),Err(_)=>return};
        for entry in entries {if let Ok(mut pending)=entry.pending.lock(){pending.take();}}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn native_chunks_commit_exact_bytes_and_preserve_target_until_complete(){
        let dir=tempfile::tempdir().unwrap();let target=dir.path().join("中文 路径.dxf");fs::write(&target,b"old").unwrap();
        let store=ExportStore::default();let ticket=store.prepare("main",target.clone(),8).unwrap();
        assert_eq!(store.write("main",&ticket,0,b"com").unwrap(),3);assert_eq!(fs::read(&target).unwrap(),b"old");
        assert_eq!(store.write("main",&ticket,3,b"plete").unwrap(),8);assert_eq!(store.commit("main",&ticket).unwrap(),target);
        assert_eq!(fs::read(&target).unwrap(),b"complete");assert_eq!(fs::read_dir(dir.path()).unwrap().count(),1);
        assert!(store.write("main",&ticket,0,b"replay").is_err());assert!(store.commit("main",&ticket).is_err());
    }
    #[test] fn owner_offset_and_length_are_enforced_without_replacing_old_file(){
        let dir=tempfile::tempdir().unwrap();let target=dir.path().join("keep.dxf");fs::write(&target,b"old").unwrap();let store=ExportStore::default();
        let ticket=store.prepare("main",target.clone(),3).unwrap();
        assert!(store.write("foreign",&ticket,0,b"new").is_err());assert!(!store.cancel("foreign",&ticket).unwrap());assert!(store.commit("foreign",&ticket).is_err());
        assert!(store.write("main",&ticket,1,b"new").is_err());assert_eq!(fs::read_dir(dir.path()).unwrap().count(),1);
        let ticket=store.prepare("main",target.clone(),3).unwrap();assert!(store.write("main",&ticket,0,b"long").is_err());
        let ticket=store.prepare("main",target.clone(),3).unwrap();store.write("main",&ticket,0,b"n").unwrap();assert!(store.commit("main",&ticket).is_err());
        assert_eq!(fs::read(&target).unwrap(),b"old");assert_eq!(fs::read_dir(dir.path()).unwrap().count(),1);
    }
    #[test] fn cancel_and_close_clear_only_owned_parts(){
        let dir=tempfile::tempdir().unwrap();let store=ExportStore::default();let target=dir.path().join("a.bin");fs::write(&target,b"old").unwrap();
        let ticket=store.prepare("main",target.clone(),4).unwrap();store.write("main",&ticket,0,b"ab").unwrap();assert!(store.cancel("main",&ticket).unwrap());assert!(!store.cancel("main",&ticket).unwrap());
        store.prepare("main",dir.path().join("b.bin"),u64::MAX).unwrap();store.clear();assert_eq!(fs::read_dir(dir.path()).unwrap().count(),1);assert_eq!(fs::read(target).unwrap(),b"old");
    }
    #[test] fn chunk_limit_is_not_a_file_size_limit_and_empty_files_are_valid(){
        let dir=tempfile::tempdir().unwrap();let store=ExportStore::default();let target=dir.path().join("large.bin");
        let ticket=store.prepare("main",target.clone(),(CHUNK_BYTES*2+7) as u64).unwrap();let bytes=vec![0xa5;CHUNK_BYTES];
        store.write("main",&ticket,0,&bytes).unwrap();store.write("main",&ticket,CHUNK_BYTES as u64,&bytes).unwrap();store.write("main",&ticket,(CHUNK_BYTES*2) as u64,b"1234567").unwrap();store.commit("main",&ticket).unwrap();assert_eq!(fs::metadata(target).unwrap().len(),(CHUNK_BYTES*2+7) as u64);
        let ticket=store.prepare("main",dir.path().join("empty.bin"),0).unwrap();store.commit("main",&ticket).unwrap();
    }
    #[test] fn destination_errors_do_not_leave_owned_parts(){
        let dir=tempfile::tempdir().unwrap();let store=ExportStore::default();assert!(store.prepare("main",dir.path().join("missing/file"),0).is_err());
        let target=dir.path().join("directory");fs::create_dir(&target).unwrap();let ticket=store.prepare("main",target.clone(),0).unwrap();assert!(store.commit("main",&ticket).is_err());assert!(target.is_dir());assert_eq!(fs::read_dir(dir.path()).unwrap().count(),1);
    }
    #[test] fn closing_store_rejects_late_preparation_without_leaving_parts(){let dir=tempfile::tempdir().unwrap();let store=ExportStore::default();store.clear();assert!(store.prepare("main",dir.path().join("late.bin"),100).is_err());assert_eq!(fs::read_dir(dir.path()).unwrap().count(),0);}
    #[test] fn rejects_path_names(){for name in ["../a","D:\\a","","..","a\0b"]{assert!(validate_name(name).is_err());}assert!(validate_name("龙神.dxf").is_ok());}
    #[test] fn closing_one_owner_removes_only_its_staging_and_does_not_close_the_export_store(){
        let dir=tempfile::tempdir().unwrap();let a=dir.path().join("a.txt");let b=dir.path().join("b.txt");fs::write(&a,b"old-a").unwrap();fs::write(&b,b"old-b").unwrap();
        let store=ExportStore::default();let first=store.prepare("doc-a",a.clone(),3).unwrap();let second=store.prepare("doc-b",b.clone(),3).unwrap();
        store.write("doc-a",&first,0,b"a").unwrap();store.cancel_owner("doc-a");
        assert!(store.write("doc-a",&first,1,b"bc").is_err());assert_eq!(fs::read(&a).unwrap(),b"old-a");
        store.write("doc-b",&second,0,b"new").unwrap();store.commit("doc-b",&second).unwrap();assert_eq!(fs::read(&b).unwrap(),b"new");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(),2);assert!(store.prepare("doc-c",dir.path().join("c.txt"),0).is_ok());
    }
}
