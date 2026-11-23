import {saveDownload} from './api';

const bindings=new WeakMap<File,string>();
export function rememberFileBinding(file:File,binding?:string){
  if(binding)bindings.set(file,binding);
  return file;
}
export const projectFileBinding=(file:File)=>bindings.get(file);

/** Pick a file once; an opaque native receipt follows the file into its tab. */
export async function selectProjectFile(input:Pick<HTMLInputElement,'click'>|null,kind:'associated'|'project'|'crease'|'diagram'|'design'='crease'):Promise<File|null>{
  if(!window.desktop?.openProject){input?.click();return null;}
  const selected=await window.desktop.openProject(kind);
  return selected?rememberFileBinding(new File([selected.bytes],selected.name),selected.binding):null;
}
export function saveProjectFile(content:string|Blob,name:string,binding?:string){
  const blob=typeof content==='string'?new Blob([content],{type:'application/json'}):content;
  return saveDownload(blob,name,{projectFile:true,binding});
}
