import {readOriconfigArchive} from '../app/oriconfigArchive';
import {previewOrieditaHotkeys} from '../app/orieditaHotkeys';
import {validateToolShortcuts} from '../app/toolShortcuts';
import type {OriconfigRequest,OriconfigReply} from '../app/oriconfigTask';
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<OriconfigRequest>)=>void)|null;postMessage:(reply:OriconfigReply)=>void};
scope.onmessage=event=>{
 try{
  const bindings=validateToolShortcuts(event.data.bindings),archive=readOriconfigArchive(event.data.bytes);
  scope.postMessage({status:'complete',archive,hotkeys:archive.hotkeys===null?null:previewOrieditaHotkeys(archive.hotkeys,bindings)});
 }catch(e){scope.postMessage({status:'error',message:`设置包预检失败：${e instanceof Error?e.message:String(e)}`});}
};
