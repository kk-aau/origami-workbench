import {useSyncExternalStore} from 'react';
import {preferenceStorage} from './preferenceStorage';

const key='zhezhi.cp-junction-warnings.v1';
const listeners=new Set<()=>void>();
let enabled:boolean|undefined;
function snapshot():boolean{
  if(enabled===undefined){
    // Detached WebViews can open before the desktop preference service connects.
    try{enabled=(localStorage.getItem(key)??preferenceStorage.getItem(key))!=='false';}
    catch{enabled=true;}
  }
  return enabled;
}
function notify(value:boolean){
  enabled=value;
  for(const listener of listeners)listener();
}
function storageChanged(event:StorageEvent){
  if(event.key===key||event.key===null)notify(event.newValue!=='false');
}
function subscribe(listener:()=>void){
  if(!listeners.size){
    window.addEventListener('storage',storageChanged);
    enabled=undefined;
  }
  listeners.add(listener);
  return ()=>{
    listeners.delete(listener);
    if(!listeners.size)window.removeEventListener('storage',storageChanged);
  };
}
export function setJunctionWarningsEnabled(value:boolean){
  const stored=String(value);
  preferenceStorage.setItem(key,stored);
  // Also notify other windows and give newly opened CP popouts the same setting.
  if(localStorage.getItem(key)!==stored)localStorage.setItem(key,stored);
  notify(value);
}
export function useJunctionWarningsEnabled(){
  return useSyncExternalStore(subscribe,snapshot,()=>true);
}
