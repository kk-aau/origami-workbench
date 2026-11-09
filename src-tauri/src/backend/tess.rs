use super::ApiError;
use serde_json::Value;
use std::{path::PathBuf,process::Stdio,sync::{Arc,Mutex,atomic::{AtomicBool,Ordering}},time::Duration};
use tokio::{io::{AsyncReadExt,AsyncWriteExt},process::{Child,ChildStdin,ChildStdout,Command},sync::{Mutex as AsyncMutex,oneshot}};

const INPUT_BYTES:usize=131073;
const RESULT_BYTES:usize=20*1024*1024;
struct WorkerProcess{child:Child,stdin:ChildStdin,stdout:ChildStdout}
struct Inner{executable:PathBuf,args:Vec<String>,design:bool,busy:AtomicBool,process:AsyncMutex<Option<WorkerProcess>>,cancel:Mutex<Option<oneshot::Sender<()>>>}
#[derive(Clone)]pub struct TessWorker{inner:Arc<Inner>}
impl TessWorker{
    pub fn new(executable:PathBuf,args:Vec<String>)->Self{Self::configured(executable,args,false)}
    pub fn design(executable:PathBuf)->Self{Self::configured(executable,vec!["--design-worker".into()],true)}
    fn configured(executable:PathBuf,args:Vec<String>,design:bool)->Self{Self{inner:Arc::new(Inner{executable,args,design,busy:AtomicBool::new(false),process:AsyncMutex::new(None),cancel:Mutex::new(None)})}}
    pub fn busy(&self)->bool{self.inner.busy.load(Ordering::Acquire)}
    pub fn available(&self)->bool{self.inner.executable.is_file()}
    fn spawn(&self)->Result<WorkerProcess,ApiError>{
        let mut command=Command::new(&self.inner.executable);command.args(&self.inner.args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true)
            .env("PYTHONUTF8","1").env("OPENBLAS_NUM_THREADS","1").env("OMP_NUM_THREADS","1");
        if let Some(parent)=self.inner.executable.parent(){command.current_dir(parent);}
        #[cfg(windows)]command.creation_flags(0x08000000);
        let mut child=command.spawn().map_err(|_|ApiError::new(422,"无法启动镶嵌计算进程，请检查本地计算环境。"))?;
        let stdin=child.stdin.take().unwrap();let stdout=child.stdout.take().unwrap();
        if let Some(mut stderr)=child.stderr.take(){tokio::spawn(async move{let mut buffer=[0u8;4096];while let Ok(n)=stderr.read(&mut buffer).await{if n==0{break}}});}
        Ok(WorkerProcess{child,stdin,stdout})
    }
    pub async fn run(&self,input:Value)->Result<Value,ApiError>{
        let mut frame=serde_json::to_vec(&input)?;frame.push(b'\n');if frame.len()>if self.inner.design {128*1024*1024}else{INPUT_BYTES}{return Err(ApiError::new(413,if self.inner.design {"设计工程请求超过 128 MiB，请拆分工程后重试。"}else{"镶嵌参数超过 128 KiB。"}))}
        if self.inner.busy.compare_exchange(false,true,Ordering::AcqRel,Ordering::Acquire).is_err(){return Err(ApiError::new(429,if self.inner.design{"已有设计计算正在进行，请等待或停止后重试。"}else{"已有镶嵌计算正在进行，请等待或取消后重试。"}))}
        let (reply,receiver)=oneshot::channel();let (cancel,cancelled)=oneshot::channel();*self.inner.cancel.lock().unwrap()=Some(cancel);let worker=self.clone();
        tokio::spawn(async move{
            let result=worker.perform(frame,cancelled,reply).await;
            if let Err(error)=result{eprintln!("计算调度失败：{error}");}
        });
        receiver.await.map_err(|_|ApiError::new(422,"计算已停止。"))?
    }
    async fn perform(&self,frame:Vec<u8>,mut cancelled:oneshot::Receiver<()>,mut reply:oneshot::Sender<Result<Value,ApiError>>)->Result<(),ApiError>{
        let mut slot=self.inner.process.lock().await;
        if slot.is_none(){match self.spawn(){Ok(process)=>*slot=Some(process),Err(e)=>{self.finish(reply,Err(e));return Ok(())}}}
        let process=slot.as_mut().unwrap();
        let calculate=async{
            process.stdin.write_all(&frame).await.map_err(|_|ApiError::new(422,"无法向镶嵌计算进程发送参数。"))?;
            let mut output=Vec::new();let mut buffer=[0u8;8192];
            loop{let n=process.stdout.read(&mut buffer).await.map_err(|_|ApiError::new(422,"镶嵌计算连接已中断，请重试。"))?;if n==0{return Err(ApiError::new(422,"镶嵌计算进程已退出，请重试。"))}
                output.extend_from_slice(&buffer[..n]);if output.len()>if self.inner.design {128*1024*1024}else{RESULT_BYTES}{return Err(ApiError::new(422,"生成结果超过安全大小，已停止。"))}
                if let Some(end)=output.iter().position(|b|*b==b'\n'){
                    if output[end+1..].iter().any(|b|!b.is_ascii_whitespace()){return Err(ApiError::new(422,"计算结果格式异常，原工程未改变。"))}
                    let value:Value=serde_json::from_slice(&output[..end]).map_err(|_|ApiError::new(422,"计算结果格式异常，原工程未改变。"))?;
                    if let Some(error)=value["error"].as_str(){return Err(ApiError::new(422,error))}
                    return value.get("result").filter(|v|!v.is_null()&&*v!=&Value::Bool(false)&&v.as_f64()!=Some(0.0)&&v.as_str()!=Some("")).cloned().ok_or_else(||ApiError::new(422,"计算结果格式异常，原工程未改变。"));
                }
            }
        };
        let (result,reusable)=tokio::select!{
            result=calculate=>{let reusable=result.as_ref().is_ok()||result.as_ref().is_err_and(|e|e.status==422&&!e.message.contains("格式异常")&&!e.message.contains("安全大小")&&!e.message.contains("退出")&&!e.message.contains("连接")&&!e.message.contains("发送参数"));(result,reusable)},
            _=async{if self.inner.design{std::future::pending::<()>().await}else{tokio::time::sleep(Duration::from_secs(60)).await}}=>(Err(ApiError::new(422,"镶嵌计算超过 60 秒，已停止。请减小规模。")),false),
            _=&mut cancelled=>(Err(ApiError::new(422,"计算已取消。")),false),
            _=reply.closed()=>(Err(ApiError::new(422,"计算已取消。")),false),
        };
        if !reusable{if let Some(mut process)=slot.take(){let _=process.child.kill().await;let _=process.child.wait().await;}}
        self.finish(reply,result);Ok(())
    }
    fn finish(&self,reply:oneshot::Sender<Result<Value,ApiError>>,result:Result<Value,ApiError>){self.inner.cancel.lock().unwrap().take();self.inner.busy.store(false,Ordering::Release);let result=result.map_err(|mut e|{if self.inner.design{e.message=e.message.replace("镶嵌","设计");}e});let _=reply.send(result);}
    pub async fn stop(&self){if let Some(cancel)=self.inner.cancel.lock().unwrap().take(){let _=cancel.send(());}
        let mut slot=self.inner.process.lock().await;if let Some(mut process)=slot.take(){let _=process.child.kill().await;let _=process.child.wait().await;}}
}
