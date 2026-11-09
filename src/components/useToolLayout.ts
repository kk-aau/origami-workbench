import {useRef,useState} from 'react';
import {activeToolLayoutTemplate,copyToolLayoutTemplate,createToolLayoutTemplate,deleteToolLayoutTemplate,moveToolLayoutGroup,moveToolLayoutItem,readToolLayoutPreferences,returnToolLayoutGroupToPool,returnToolLayoutItemToPool,saveToolLayoutPreferences,selectToolLayoutTemplate,updateToolLayoutTemplate,type ToolLayoutPreferences,type ToolLayoutSide,type ToolLayoutTemplatePatch} from '../app/toolLayoutPreferences';
import {mergeToolLayoutPreferences,parseToolLayoutFile,serializeToolLayoutFile} from '../app/toolLayoutFile';
import {selectToolLayoutFile} from '../app/selectToolLayoutFile';
import {saveDownload} from '../app/api';

export type ToolLayoutDrag={kind:'tool';id:string;groupId:string}|{kind:'group';id:string};
export interface ToolLayoutDrop {groupId?:string;side:ToolLayoutSide|'pool';index:number;itemId?:string;after?:boolean;surface?:'rail'|'canvas'}
export function useToolLayout(){
 const [preferences,setPreferences]=useState(readToolLayoutPreferences),[editing,setEditing]=useState(false),[error,setError]=useState(''),[selectedItem,setSelectedItem]=useState<string|null>(null),[drag,setDrag]=useState<ToolLayoutDrag|null>(null),[drop,setDrop]=useState<ToolLayoutDrop|null>(null);
 const current=useRef(preferences),snapshot=useRef(preferences);
 const [fileBusy,setFileBusy]=useState(false),[fileMessage,setFileMessage]=useState('');
 const filePending=useRef(false),editingRef=useRef(false);
 const template=activeToolLayoutTemplate(preferences);
 function apply(change:(previous:ToolLayoutPreferences)=>ToolLayoutPreferences){
  try{const next=change(current.current);if(!editingRef.current)saveToolLayoutPreferences(next);current.current=next;setPreferences(next);setError('');setFileMessage('');return true;}catch(cause){setError(cause instanceof Error?cause.message:String(cause));return false;}
 }
 function patch(change:ToolLayoutTemplatePatch){return apply(previous=>updateToolLayoutTemplate(previous,previous.activeId,change));}
 function stopDrag(){setDrag(null);setDrop(null);}
 function begin(){if(!editingRef.current)snapshot.current=structuredClone(current.current);editingRef.current=true;setEditing(true);setError('');setFileMessage('');setSelectedItem(null);}
 function cancel(){current.current=snapshot.current;setPreferences(snapshot.current);editingRef.current=false;setEditing(false);setSelectedItem(null);setError('');setFileMessage('');stopDrag();}
 function save(){try{saveToolLayoutPreferences(current.current);editingRef.current=false;setEditing(false);setSelectedItem(null);setError('');setFileMessage('');stopDrag();}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}}
 function editDraft(next:ToolLayoutPreferences){begin();current.current=next;setPreferences(next);stopDrag();}
 function createTemplate(){try{editDraft(createToolLayoutTemplate(current.current));}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}}
 async function importTemplates(){
  if(filePending.current)return;
  filePending.current=true;setFileBusy(true);setError('');setFileMessage('');
  try{
   const file=await selectToolLayoutFile();if(!file)return;
   const imported=parseToolLayoutFile(await file.text());
   editDraft(mergeToolLayoutPreferences(current.current,imported));
   setFileMessage('排版文件已导入，可继续调整；点击“保存排版”应用。');
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{filePending.current=false;setFileBusy(false);}
 }
 async function exportTemplates(){
  if(filePending.current)return;
  filePending.current=true;setFileBusy(true);setError('');setFileMessage('');
  try{
   const text=serializeToolLayoutFile(current.current),name=`折纸工坊-工具排版-${new Date().toISOString().slice(0,10)}.tool-layout.json`;
   const result=await saveDownload(new Blob([text],{type:'application/json'}),name);
   if(result.status==='saved')setFileMessage('已导出全部排版模板，可在其他便携版本中导入。');
   else if(result.status==='browser')setFileMessage('排版文件已交给浏览器下载。');
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{filePending.current=false;setFileBusy(false);}
 }
 function addGroup(side:ToolLayoutSide){const groups=activeToolLayoutTemplate(current.current).groups;patch({groups:[...groups,{id:crypto.randomUUID(),name:'新分组',side,items:[]}]});}
 function renameGroup(id:string,name:string){patch({groups:activeToolLayoutTemplate(current.current).groups.map(group=>group.id===id?{...group,name}:group)});}
 function removeGroup(id:string){
  apply(previous=>returnToolLayoutGroupToPool(previous,id));
 }
 function moveItem(id:string,groupId:string,index?:number){apply(previous=>moveToolLayoutItem(previous,id,groupId,index));}
 function moveGroup(id:string,side:ToolLayoutSide,index?:number){apply(previous=>moveToolLayoutGroup(previous,id,side,index));}
 function returnItem(id:string,index?:number){apply(previous=>returnToolLayoutItemToPool(previous,id,index));}
 function moveItemToSide(id:string,side:ToolLayoutSide){
  const source=activeToolLayoutTemplate(current.current),target=source.groups.find(group=>group.side===side);
  if(target){moveItem(id,target.id);return;}
  patch({groups:[...source.groups.map(group=>({...group,items:group.items.filter(item=>item!==id)})),{id:crypto.randomUUID(),name:'常用工具',side,items:[id]}],unassigned:source.unassigned.filter(item=>item!==id)});
 }
 function finishDrop(target:ToolLayoutDrop){
  if(!drag)return;
  if(drag.kind==='tool'&&target.itemId===drag.id||drag.kind==='group'&&target.groupId===drag.id){stopDrag();return;}
  if(target.side==='pool'){
   if(drag.kind==='group')removeGroup(drag.id);else returnItem(drag.id,target.index);
  }
  else if(drag.kind==='group')moveGroup(drag.id,target.side,target.index);
  else if(target.groupId)moveItem(drag.id,target.groupId,target.index);
  else {
   const source=activeToolLayoutTemplate(current.current),group={id:crypto.randomUUID(),name:'新分组',side:target.side,items:[drag.id]};
   patch({groups:[...source.groups.map(g=>({...g,items:g.items.filter(id=>id!==drag.id)})),group],unassigned:source.unassigned.filter(id=>id!==drag.id)});
  }
  stopDrag();
 }
 return {preferences,template,editing,error,fileBusy,fileMessage,importTemplates,exportTemplates,selectedItem,setSelectedItem,drag,setDrag,drop,setDrop,stopDrag,begin,cancel,save,patch,addGroup,renameGroup,removeGroup,moveItem,moveGroup,returnItem,moveItemToSide,finishDrop,
  selectTemplate:(id:string)=>{stopDrag();setSelectedItem(null);apply(previous=>selectToolLayoutTemplate(previous,id));},
  copyTemplate:()=>{apply(previous=>copyToolLayoutTemplate(previous,previous.activeId));setSelectedItem(null);},
  createTemplate,
  removeTemplate:()=>{apply(previous=>deleteToolLayoutTemplate(previous,previous.activeId));setSelectedItem(null);},
 };
}
export type ToolLayoutController=ReturnType<typeof useToolLayout>;
