/** Layout settings use the same parented native file service as project files. */
export async function selectToolLayoutFile():Promise<File|null>{
 const runtime=window as Window&{__TAURI_INTERNALS__?:unknown;__TAURI__?:unknown};
 if(runtime.desktop?.openProject){
  const selected=await runtime.desktop.openProject('tool-layout');
  return selected?new File([selected.bytes],selected.name,{type:'application/json'}):null;
 }
 if(runtime.desktop?.isDesktop||runtime.__TAURI_INTERNALS__||runtime.__TAURI__){
  throw new Error('桌面文件选择接口未就绪，请从最新迁移版入口重新打开应用后导入。');
 }
 // Browser-only development entry. Desktop never falls through to this input.
 return new Promise((resolve,reject)=>{
  const input=document.createElement('input');
  input.type='file';input.accept='.json';input.hidden=true;
  const finish=(file:File|null)=>{input.remove();resolve(file);};
  input.addEventListener('change',()=>finish(input.files?.[0]??null),{once:true});
  input.addEventListener('cancel',()=>finish(null),{once:true});
  document.body.append(input);
  try{input.click();}catch(error){input.remove();reject(error);}
 });
}
