import {projectFileKind} from '../app/projectFileRouting';

self.onmessage=async(event:MessageEvent<File>)=>{
  try{
    const file=event.data,text=(await file.text()).replace(/^\uFEFF/,'');
    let raw:unknown;
    try{raw=JSON.parse(text);}catch{throw Error('文件不是有效的 JSON，当前工程保持不变。');}
    self.postMessage({kind:projectFileKind(file.name,raw)});
  }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
