import type {Point} from '../core/types';
import type {DiagramSymbolNativeGrip} from './diagramAnnotationSVG';

export type DiagramGripFunction='move'|'scale'|'rotate'|'mirror'|'shape';
export const DIAGRAM_GRIP_STYLES={
  move:{color:'#ed514d',label:'定位',shape:'circle'},
  scale:{color:'#268bd2',label:'缩放',shape:'square'},
  rotate:{color:'#278565',label:'旋转',shape:'circle'},
  mirror:{color:'#8b5abb',label:'镜像',shape:'diamond'},
  shape:{color:'#dfa03c',label:'调形',shape:'diamond'},
} as const;
export interface DiagramDisplayedGrip extends DiagramSymbolNativeGrip {anchorPoint:Point;displaced:boolean}
/** Retained for callers that describe labels; these never displace source points. */
export type DiagramGripReservedPoint=Point|{point:Point;radius:number};
export function diagramGripFunction(grip:Pick<DiagramSymbolNativeGrip,'id'|'kind'>&{semantic?:DiagramGripFunction}):DiagramGripFunction {
  return grip.semantic??(grip.kind==='anchor'?'move':grip.kind==='endpoint'?'scale':grip.kind==='rotation'?'rotate':'shape');
}

/** Original plugin points stay at their model coordinates at every zoom.
 * Crowding and labels never justify inventing or shifting a drag target. */
export function layoutDiagramSymbolGrips(grips:readonly DiagramSymbolNativeGrip[],units:number,minGapPixels=24,reservedPoints:readonly DiagramGripReservedPoint[]=[]):DiagramDisplayedGrip[] {
  if(!Number.isFinite(units)||units<=0||!Number.isFinite(minGapPixels)||minGapPixels<18)throw Error('符号夹点间距无效。');
  if(reservedPoints.some(value=>!Array.isArray(value)&&(!Number.isFinite(value.radius)||value.radius<0)||!(Array.isArray(value)?value:value.point).every(Number.isFinite)))throw Error('符号夹点保留区域无效。');
  return grips.map(grip=>({...grip,point:[...grip.point] as Point,anchorPoint:[...grip.point] as Point,displaced:false}));
}

/** Apply pointer delta without a jump when the press is offset inside a handle. */
export function diagramGripDragPoint(anchor:Point,startPointer:Point,pointer:Point):Point {
  return [anchor[0]+(pointer[0]-startPointer[0]),anchor[1]+(pointer[1]-startPointer[1])];
}
