import {useCallback,useEffect,useState} from 'react';
import {ADAPTIVE_LINE_STYLE_EVENT,ADAPTIVE_LINE_STYLE_KEY,readAdaptiveLineStyle,saveAdaptiveLineStyle} from './adaptiveLineStyle';

/** One shared display preference for CP and diagram workspaces. */
export function useAdaptiveLineStyle():[boolean,(enabled:boolean)=>void] {
  const [enabled,setEnabled]=useState(readAdaptiveLineStyle);
  useEffect(()=>{
    const refresh=()=>setEnabled(readAdaptiveLineStyle());
    const storageChanged=(event:StorageEvent)=>{if(event.key===null||event.key===ADAPTIVE_LINE_STYLE_KEY)refresh();};
    window.addEventListener(ADAPTIVE_LINE_STYLE_EVENT,refresh);window.addEventListener('storage',storageChanged);refresh();
    return()=>{window.removeEventListener(ADAPTIVE_LINE_STYLE_EVENT,refresh);window.removeEventListener('storage',storageChanged);};
  },[]);
  const change=useCallback((value:boolean)=>{saveAdaptiveLineStyle(value);setEnabled(value);},[]);
  return [enabled,change];
}
