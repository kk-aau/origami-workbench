import type {JoinedTubeParams,TubePoint} from './joinedTubeParams';

export type TubeInputGraphicsData={
  sourceFunction:'TwistJoinedTubeGraphics'|'DoubleJoinedTubeGraphics';
  bottomOutline:TubePoint[];
  topOutline:TubePoint[];
  pleatTriangles:TubePoint[][];
  pleatOpacity:number;
  blueLinks:[TubePoint,TubePoint][];
  cyanLinks:[TubePoint,TubePoint][];
  darkCyanLinks:[TubePoint,TubePoint][];
  bottomStart:TubePoint;
  topStart:TubePoint;
};

/** Original top-view Graphics primitives, in their Mathematica drawing order. */
export function buildTubeInputGraphics(params:JoinedTubeParams):TubeInputGraphicsData{
  const bottom=params.bottomPoints,top=params.topPoints,m=bottom.length;
  if(m<3||top.length!==(params.family==='double-joined-tube'?2*m:m)){
    throw Error('上下截面顶点数不符合原版输入预览。');
  }
  const next=(index:number,length:number)=>(index+1)%length;
  const pleatTriangles:TubePoint[][]=[],blueLinks:[TubePoint,TubePoint][]=[],
    cyanLinks:[TubePoint,TubePoint][]=[],darkCyanLinks:[TubePoint,TubePoint][]=[];

  for(let j=0;j<m;j++){
    const k=next(j,m);
    if(params.family==='twist-joined-tube'){
      if(params.twistDirection==='CCW'){
        pleatTriangles.push([bottom[j],bottom[k],top[k]]);
        // In[3572] repeats top[k] in this Polygon. It contributes no filled area.
        pleatTriangles.push([top[k],top[k],top[j]]);
        cyanLinks.push([bottom[j],top[k]]);
      }else{
        pleatTriangles.push([bottom[j],bottom[k],top[j]]);
        pleatTriangles.push([top[j],bottom[k],top[k]]);
        darkCyanLinks.push([bottom[k],top[j]]);
      }
      blueLinks.push([bottom[j],top[j]]);
    }else{
      const a=(2*j+1)%(2*m),b=(2*j+2)%(2*m),c=(2*j+3)%(2*m);
      pleatTriangles.push([bottom[j],bottom[k],top[b]]);
      pleatTriangles.push([bottom[j],top[b],top[a]]);
      pleatTriangles.push([bottom[k],top[c],top[b]]);
      blueLinks.push([bottom[j],top[a]]);
      cyanLinks.push([bottom[j],top[b]]);
      darkCyanLinks.push([bottom[k],top[b]]);
    }
  }

  return {
    sourceFunction:params.family==='twist-joined-tube'?'TwistJoinedTubeGraphics':'DoubleJoinedTubeGraphics',
    bottomOutline:[...bottom,bottom[0]],topOutline:[...top,top[0]],
    pleatTriangles,pleatOpacity:1/m,blueLinks,cyanLinks,darkCyanLinks,
    bottomStart:bottom[0],topStart:top[params.family==='twist-joined-tube'?0:1],
  };
}
