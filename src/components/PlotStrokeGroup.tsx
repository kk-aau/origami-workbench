import {createContext,useContext,useMemo,useRef,type ComponentPropsWithoutRef} from 'react';
import {resolveLineStroke} from '../app/adaptiveLineStyle';
import {useAdaptiveLineStyle} from '../app/useAdaptiveLineStyle';
import {useSvgScreenUnits} from '../app/useSvgScreenUnits';

const PlotScale=createContext({units:1,enabled:true});

/** Measure the transformed plot once, including rotations and camera zoom. */
export function PlotStrokeGroup({children,...props}:ComponentPropsWithoutRef<'g'>){
  const ref=useRef<SVGGElement>(null),units=useSvgScreenUnits(ref);
  const [enabled]=useAdaptiveLineStyle();
  const value=useMemo(()=>({units,enabled}),[units,enabled]);
  return <g {...props} ref={ref}><PlotScale.Provider value={value}>{children}</PlotScale.Provider></g>;
}

function usePlotStroke(length:number,width:number,dash?:string){
  const display=useContext(PlotScale);
  const stroke=resolveLineStroke(length,width,dash,{...display,pen:'pixels'});
  return {pathLength:stroke.pathLength,style:{strokeWidth:stroke.width,strokeDasharray:stroke.dash??'none',strokeDashoffset:stroke.dashOffset,vectorEffect:'none' as const}};
}

type LineProps=Omit<ComponentPropsWithoutRef<'line'>,'x1'|'y1'|'x2'|'y2'> & {
  x1:number;y1:number;x2:number;y2:number;widthPixels:number;dash?:string;
};
export function PlotLine({x1,y1,x2,y2,widthPixels,dash,...props}:LineProps){
  const stroke=usePlotStroke(Math.hypot(x2-x1,y2-y1),widthPixels,dash);
  return <line {...props} x1={x1} y1={y1} x2={x2} y2={y2} {...stroke}/>;
}

/** Fit a sampled crease across its whole arc, including the two end vertices. */
export function PlotCreasePath({points,d,widthPixels,dash,className}:{points:readonly (readonly number[])[];d:string;widthPixels:number;dash:string;className:string}){
  let length=0;
  for(let i=1;i<points.length;i++)length+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
  return <path className={className} d={d} {...usePlotStroke(length,widthPixels,dash)}/>;
}
