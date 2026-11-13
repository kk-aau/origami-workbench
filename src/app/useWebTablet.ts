import {useEffect, useState} from 'react';
import {WEB_APP} from './webRuntime';

const query='(max-width: 1180px), (pointer: coarse) and (max-width: 1440px)';
export function useWebTablet(){
  const [tablet,setTablet]=useState(()=>WEB_APP&&window.matchMedia(query).matches);
  useEffect(()=>{
    if(!WEB_APP)return;
    const media=window.matchMedia(query);
    const update=()=>setTablet(media.matches);
    media.addEventListener('change',update);
    update();
    return ()=>media.removeEventListener('change',update);
  },[]);
  return tablet;
}
