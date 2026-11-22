import {useEffect,useRef} from 'react';

/** Wait for the second click before committing a destructive single right click. */
export function useRightClickPair(onDouble:(()=>void)|undefined,context:unknown){
  const pending=useRef<{x:number;y:number;time:number;timer:number;single?:()=>void}|null>(null);
  function clear(runSingle=false){
    const previous=pending.current;
    if(!previous)return;
    clearTimeout(previous.timer);pending.current=null;
    if(runSingle)previous.single?.();
  }
  useEffect(()=>()=>clear(),[context]);
  return {
    begin(e:{button:number;clientX:number;clientY:number}){
      const previous=pending.current;
      if(!onDouble||!previous)return false;
      if(e.button===2&&performance.now()-previous.time<=380&&Math.hypot(e.clientX-previous.x,e.clientY-previous.y)<=6){
        clear();onDouble();return true;
      }
      clear(true);return false;
    },
    end(x:number,y:number,single?:()=>void){
      if(!onDouble){single?.();return;}
      clear(true);
      pending.current={x,y,time:performance.now(),single,timer:window.setTimeout(()=>clear(true),380)};
    },
  };
}
