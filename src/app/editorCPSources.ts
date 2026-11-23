import type {DesktopDocumentInfo,DesktopDocuments,DesktopDocumentSnapshot} from '../desktop';
import type {Doc} from '../core/types';

const isEditorCP=(item:DesktopDocumentInfo)=>item.workspace==='edit'&&item.ready&&!item.home&&item.hasEditorCP===true;

export function listEditorCPChoices(snapshot:DesktopDocumentSnapshot,preferred:string|null){
  return snapshot.documents.filter(isEditorCP).map(item=>{
    const host=snapshot.windows.find(w=>w.id===item.windowId);
    const tab=(host?.documentIds.indexOf(item.id)??-1)+1;
    const hostName=item.windowId===snapshot.windowId?'当前窗口':`窗口 ${snapshot.windows.findIndex(w=>w.id===item.windowId)+1}`;
    return {id:item.id,title:item.title,detail:[hostName,tab?`标签 ${tab}`:'',item.dirty?'未保存':''].filter(Boolean).join(' · '),preferred:item.id===preferred};
  });
}

export function serveEditorCP(id:string,getCurrent:()=>Doc|null){
  const channel=new BroadcastChannel('workspace-cp:'+id);
  channel.onmessage=({data})=>{
    if(data?.type!=='read'||typeof data.request!=='string')return;
    const doc=getCurrent();
    channel.postMessage(doc?{request:data.request,doc}:{request:data.request,error:'所选折痕工程已关闭。'});
  };
  return ()=>channel.close();
}

export async function readOpenEditorCP(documents:Pick<DesktopDocuments,'list'|'subscribe'>,id:string):Promise<Doc>{
  const available=(snapshot:DesktopDocumentSnapshot)=>snapshot.documents.some(item=>item.id===id&&isEditorCP(item));
  if(!available(await documents.list()))throw Error('所选折痕工程已关闭。');
  const request=crypto.randomUUID(),channel=new BroadcastChannel('workspace-cp:'+id);
  let timer:ReturnType<typeof setTimeout>|undefined,unsubscribe:(()=>void)|undefined;
  try{
    return await new Promise<Doc>((resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('所选折痕窗口未响应，请稍后重试。')),10000);
      unsubscribe=documents.subscribe(snapshot=>{if(!available(snapshot))reject(Error('所选折痕工程已关闭。'));});
      channel.onmessage=({data})=>{
        if(data?.request!==request||data.type==='read')return;
        if(data.doc)resolve(data.doc);
        else reject(Error(data.error||'读取所选折痕工程失败。'));
      };
      channel.postMessage({type:'read',request});
    });
  }finally{clearTimeout(timer);unsubscribe?.();channel.close();}
}
