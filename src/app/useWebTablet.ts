import {useEffect, useState} from 'react';
import {WEB_APP} from './webRuntime';

// Narrow browser windows and touch tablets use sheets; desktop shells keep their layout.
const query='(max-width: 1180px), (pointer: coarse) and (max-width: 1440px)';
export function useWebTablet(){
  const [tablet,setTablet]=useState(()=>WEB_APP&&window.matchMedia(query).matches);
  useEffect(()=>{
    if(!WEB_APP)return;
    const media=window.matchMedia(query),update=()=>setTablet(media.matches);
    update();media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[]);
  return tablet;
}
