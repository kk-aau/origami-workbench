import {preferenceStorage} from './preferenceStorage';
import type {ShortcutKeyEvent} from './toolShortcuts';

const preferenceKey='zhezhi.tool-command-input.v1';
export const TOOL_COMMAND_INPUT_CHANGED='zhezhi-tool-command-input-changed';

export function readToolCommandInput():boolean{
  try{
    const saved=JSON.parse(preferenceStorage.getItem(preferenceKey)??'null');
    return saved?.version===1&&typeof saved.direct==='boolean'?saved.direct:true;
  }catch{return true;}
}

export function saveToolCommandInput(direct:boolean):void{
  preferenceStorage.setItem(preferenceKey,JSON.stringify({version:1,direct}));
  if(typeof window!=='undefined'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new Event(TOOL_COMMAND_INPUT_CHANGED));
}

/** Only plain alphabetic typing starts a command; editing and modal guards belong to the caller. */
export function toolCommandCharacter(event:ShortcutKeyEvent&{keyCode?:number}):string|null{
  if(event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||event.getModifierState?.('AltGraph'))return null;
  return /^[a-z]$/i.test(event.key)?event.key:null;
}
