import {useLayoutEffect,useState,type RefObject} from 'react';

/** Display sizes are screen sizes, independent of tile placement and SVG zoom. */
export function useSvgScreenUnits(ref:RefObject<SVGGElement|null>):number{
  const [units,setUnits]=useState(1);
  const measure=()=>{
    const matrix=ref.current?.getScreenCTM();if(!matrix)return;
    const scale=Math.hypot(matrix.a,matrix.b),next=scale>0?1/scale:0;
    if(Number.isFinite(next)&&next>0)setUnits(old=>Math.abs(old-next)>next*1e-10?next:old);
  };
  useLayoutEffect(measure);
  useLayoutEffect(()=>{
    const svg=ref.current?.ownerSVGElement;if(!svg)return;
    const resize=new ResizeObserver(measure),mutation=new MutationObserver(measure);
    resize.observe(svg);mutation.observe(svg,{attributes:true,attributeFilter:['viewBox','width','height','style','class']});
    window.addEventListener('resize',measure);
    return()=>{resize.disconnect();mutation.disconnect();window.removeEventListener('resize',measure);};
  },[ref]);
  return units;
}
