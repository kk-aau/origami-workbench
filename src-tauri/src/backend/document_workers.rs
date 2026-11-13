//! Each live document owns its calculation processes. Moving its native view
//! leaves this bank untouched; closing it retires only that document's leases.
use super::{tess::TessWorker,ApiError};
use std::{collections::HashMap,sync::{Arc,Mutex}};
use uuid::Uuid;

struct Pair {tess:TessWorker,design:TessWorker}
impl Pair {
    fn retire(&self){self.tess.retire();self.design.retire();}
    async fn stop(&self){self.tess.stop().await;self.design.stop().await;}
}
#[derive(Default)]
struct Entries {closed:bool,documents:HashMap<String,Option<Arc<Pair>>>}
pub struct DocumentWorkers {tess:TessWorker,design:TessWorker,entries:Mutex<Entries>}
impl DocumentWorkers {
    pub fn new(tess:TessWorker,design:TessWorker)->Self{Self{tess,design,entries:Mutex::new(Entries::default())}}
    fn pair(&self,owner:&str)->Result<Arc<Pair>,ApiError>{
        if Uuid::parse_str(owner).map(|id|id.to_string()!=owner).unwrap_or(true){return Err(ApiError::new(400,"作品计算标识无效。"))}
        let mut entries=self.entries.lock().map_err(|_|ApiError::new(503,"作品计算队列不可用。"))?;
        if entries.closed{return Err(ApiError::new(503,"工作台正在关闭，本次计算未启动。"))}
        let slot=entries.documents.entry(owner.to_owned()).or_insert_with(||Some(Arc::new(Pair{tess:self.tess.fresh(),design:self.design.fresh()})));
        slot.clone().ok_or_else(||ApiError::new(410,"作品已关闭，本次计算未启动。"))
    }
    pub fn worker(&self,owner:Option<&str>,design:bool)->Result<TessWorker,ApiError>{
        if let Some(owner)=owner{let pair=self.pair(owner)?;Ok(if design{pair.design.clone()}else{pair.tess.clone()})}
        else{Ok(if design{self.design.clone()}else{self.tess.clone()})}
    }
    /// Keep a tombstone for a closed UUID. A queued request cannot recreate it.
    pub fn release(&self,owner:&str){
        let pair=self.entries.lock().unwrap().documents.insert(owner.to_owned(),None).flatten();
        if let Some(pair)=pair{pair.retire();}
    }
    pub async fn shutdown(&self){
        let pairs={let mut entries=self.entries.lock().unwrap();entries.closed=true;entries.documents.values_mut().filter_map(Option::take).collect::<Vec<_>>()};
        self.tess.retire();self.design.retire();
        for pair in &pairs{pair.retire();}
        for pair in pairs{pair.stop().await;}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const A:&str="11111111-1111-4111-8111-111111111111";
    const B:&str="22222222-2222-4222-8222-222222222222";
    fn bank()->DocumentWorkers{DocumentWorkers::new(TessWorker::new("absent".into(),vec![]),TessWorker::design("absent".into()))}
    #[test]fn document_owns_one_stable_pair_and_peers_are_distinct(){let bank=bank();let a=bank.pair(A).unwrap();assert!(Arc::ptr_eq(&a,&bank.pair(A).unwrap()));assert!(!Arc::ptr_eq(&a,&bank.pair(B).unwrap()));}
    #[tokio::test]async fn closing_one_document_retires_already_captured_leases_only_for_it(){let bank=bank();let a=bank.worker(Some(A),false).unwrap();let b=bank.worker(Some(B),false).unwrap();bank.release(A);assert_eq!(a.run(serde_json::json!({})).await.unwrap_err().status,410);assert_eq!(bank.worker(Some(A),true).err().unwrap().status,410);assert_eq!(b.run(serde_json::json!({})).await.unwrap_err().status,422);}
    #[test]fn closing_before_the_first_request_cannot_recreate_the_owner(){let bank=bank();bank.release(A);assert_eq!(bank.worker(Some(A),false).err().unwrap().status,410);assert!(bank.worker(Some(B),true).is_ok());}
    #[test]fn invalid_document_identifiers_do_not_allocate_a_process_slot(){let bank=bank();for owner in ["", "../other", "other-window", "11111111111141118111111111111111"]{assert_eq!(bank.worker(Some(owner),false).err().unwrap().status,400);}assert!(bank.entries.lock().unwrap().documents.is_empty());}
    #[tokio::test]async fn shutdown_rejects_late_document_work(){let bank=bank();let worker=bank.worker(Some(A),true).unwrap();bank.shutdown().await;assert_eq!(worker.run(serde_json::json!({})).await.unwrap_err().status,410);assert_eq!(bank.worker(Some(B),false).err().unwrap().status,503);}
}
