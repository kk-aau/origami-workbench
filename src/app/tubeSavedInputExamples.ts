import {closedTubeSavedEllipsePreset} from './closedTubeParams';
import {joinedTubePreset,pleatReducePolygon,rotateTubePoints,type JoinedTubeParams,type TubePoint,
  type TwistJoinedTubeParams} from './joinedTubeParams';

export type TubeSavedInputCell=3573|3574|3575|3595;
export const tubeSavedInputCells:TubeSavedInputCell[]=[3573,3574,3575,3595];

export function tubeSavedInputExample(cell:TubeSavedInputCell):{
  cell:TubeSavedInputCell;title:string;detail:string;params:JoinedTubeParams;
}{
  if(cell===3595){
    const bottomPoints:TubePoint[]=Array.from({length:12},(_,j)=>[
      Math.cos(j*Math.PI/6),Math.sin(j*Math.PI/6)]);
    return {cell,title:'双连接管 · 12→24 点',
      detail:'下圈为正十二边形；上圈按 0.5 褶皱收缩并旋转 10°。原输入虽定义 φ=135°，绘图实际没有使用它。',
      params:{...joinedTubePreset('double-joined-tube'),bottomPoints,
        topPoints:rotateTubePoints(pleatReducePolygon(bottomPoints,.5),10)}};
  }
  if(cell===3575){
    const bottomPoints:TubePoint[]=closedTubeSavedEllipsePreset().points;
    const rotated=rotateTubePoints(bottomPoints,90);
    return {cell,title:'等弦椭圆 · 顺时针',
      detail:'金比例长轴、短轴 1 的 16 点等弦椭圆；上圈旋转 90°，再左移顶点序列 3 位。',
      params:{...joinedTubePreset('twist-joined-tube') as TwistJoinedTubeParams,bottomPoints,
        topPoints:[...rotated.slice(3),...rotated.slice(0,3)],twistDirection:'CW'}};
  }
  const bottomPoints:TubePoint[]=Array.from({length:12},(_,j)=>[
    Math.cos(j*Math.PI/6),Math.sin(j*Math.PI/6)]);
  const topPoints=rotateTubePoints(bottomPoints,135).map(([x,y]):TubePoint=>[x+.5,y+.4]);
  return {cell,title:`偏移圆管 · ${cell===3573?'逆时针':'顺时针'}`,
    detail:'上下圈均为正十二边形；上圈旋转 135°，再偏移 (0.5, 0.4)。两例仅改变连线方向。',
    params:{...joinedTubePreset('twist-joined-tube') as TwistJoinedTubeParams,bottomPoints,topPoints,
      twistDirection:cell===3573?'CCW':'CW'}};
}
