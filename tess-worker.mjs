import {spawn} from 'node:child_process';

// One in-flight job and one warm process. No queue of obsolete slider values.
export class TessWorker {
  constructor(executable,args,options={}) {
    this.executable=executable;this.args=args;this.options=options;
    this.child=null;this.job=null;
  }
  get busy(){return !!this.job;}
  run(input,signal){
    if(this.busy)return Promise.reject(Object.assign(new Error('已有镶嵌计算正在进行，请等待或取消后重试。'),{status:429}));
    const frame=JSON.stringify(input)+'\n';
    if(Buffer.byteLength(frame)>131073)return Promise.reject(Object.assign(new Error('镶嵌参数超过 128 KiB。'),{status:413}));
    if(signal?.aborted)return Promise.reject(new Error('计算已取消。'));
    return new Promise((resolve,reject)=>{
      const abort=()=>this.stop('计算已取消。');
      const timer=setTimeout(()=>this.stop('镶嵌计算超过 60 秒，已停止。请减小规模。'),60000);
      this.job={resolve,reject,cleanup:()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);}};
      signal?.addEventListener('abort',abort,{once:true});
      try{
        if(!this.child)this.start();
        const child=this.child;
        child.stdin.write(frame,error=>{if(error&&this.child===child)this.stop('无法向镶嵌计算进程发送参数。');});
      }catch{this.stop('无法启动镶嵌计算进程，请检查本地计算环境。');}
    });
  }
  start(){
    const child=spawn(this.executable,this.args,{windowsHide:true,...this.options});
    this.child=child;let output='';
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stderr.on('data',()=>{}); // Upstream diagnostics must not fill a pipe.
    child.stdout.on('data',chunk=>{
      if(this.child!==child)return;
      output+=chunk;
      if(output.length>20*1024*1024){this.stop('生成结果超过安全大小，已停止。');return;}
      const end=output.indexOf('\n');if(end<0)return;
      try{
        const reply=JSON.parse(output.slice(0,end));output=output.slice(end+1);
        if(output.trim()||!this.job||(!reply.result&&typeof reply.error!=='string'))throw new Error();
        const job=this.job;this.job=null;job.cleanup();
        if(reply.error)job.reject(Object.assign(new Error(reply.error),{status:422}));else job.resolve(reply.result);
      }catch{this.stop('计算结果格式异常，原工程未改变。');}
    });
    child.on('error',()=>{if(this.child===child)this.stop('无法启动镶嵌计算进程，请检查本地计算环境。');});
    child.on('close',()=>{if(this.child===child)this.stop('镶嵌计算进程已退出，请重试。');});
    child.stdin.on('error',()=>{if(this.child===child)this.stop('镶嵌计算连接已中断，请重试。');});
  }
  stop(message='计算已停止。'){
    const child=this.child;this.child=null;child?.kill();
    const job=this.job;this.job=null;
    if(job){job.cleanup();job.reject(Object.assign(new Error(message),{status:422}));}
  }
}
