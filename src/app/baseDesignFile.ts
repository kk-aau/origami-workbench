import {validateBaseDesign,type BaseDesignProject} from './baseDesign';

export type BaseDesignFile={type:'design';project:BaseDesignProject}|{type:'box'};
export function parseBaseDesignFile(text:string):BaseDesignFile {
 let raw;try{raw=JSON.parse(text);}catch{throw Error('文件不是有效的设计工程；TreeMaker 文件请使用 .tmd / .tmd5 扩展名。');}
 if(raw?.format==='zhezhi-base-design')return {type:'design',project:validateBaseDesign(raw)};
 if(raw?.design?.tree&&raw?.design?.layout)return {type:'box'};
 throw Error('此文件不是基础形设计、TreeMaker 或 BPS 工程。');
}

/** A native BPS source is recognized here and still goes through its existing
 * native importer. Large editable JSON is parsed and validated in the worker. */
export async function prepareBaseDesignFile(text:string,signal?:AbortSignal):Promise<BaseDesignFile>{
 signal?.throwIfAborted();
 if(text.length<128*1024||typeof Worker==='undefined')return parseBaseDesignFile(text);
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('../workers/baseDesignFile.worker.ts',import.meta.url),{type:'module'});
  const done=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
  const abort=()=>{done();reject(signal?.reason??new DOMException('设计文件读取已取消。','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=event=>{done();if(event.data?.error)reject(Error(event.data.error));else resolve(event.data.result);};
  worker.onerror=event=>{done();reject(Error(event.message||'设计文件读取线程异常，原工程未改动。'));};
  worker.onmessageerror=()=>{done();reject(Error('无法读取设计文件校验结果，原工程未改动。'));};
  try{worker.postMessage(text);}catch(error){done();reject(error);}
 });
}
