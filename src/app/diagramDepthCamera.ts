import type {Point} from '../core/types';
import {modelProjection} from './modelProjection';
import {rotateDiagramViewportPoint} from './diagramViewport';

const origin:Point=[0,0];
const normalize=(degrees:number)=>((degrees%360)+360)%360;
function check(side:'front'|'back',...angles:number[]):void {
 if(side!=='front'&&side!=='back'||angles.some(value=>!Number.isFinite(value)))throw Error('相机方向和观察旋转必须是有效角度。');
}

/** Relief is applied in folded-paper XY before back-side mirroring, observation
 * rotation and whole-drawing rotation. Screen Y points downward, as in SVG. */
export function depthCameraScreenDirection(direction:number,side:'front'|'back',viewRotation:number,drawingRotation:number):Point {
 check(side,direction,viewRotation,drawingRotation);
 const radians=normalize(direction)*Math.PI/180,vector:Point=[Math.cos(radians),Math.sin(radians)];
 const shown=modelProjection([],side==='back',viewRotation,origin).project(vector);
 return rotateDiagramViewportPoint(shown,origin,drawingRotation);
}

/** Invert only the direction vector, not any canvas/model translations.
 * At the ring center retain the caller's prior angle instead of inventing one. */
export function depthCameraDirectionFromScreen(delta:Point,side:'front'|'back',viewRotation:number,drawingRotation:number,fallback=0):number {
 check(side,viewRotation,drawingRotation,fallback);
 if(!Array.isArray(delta)||delta.length!==2||delta.some(value=>!Number.isFinite(value)))throw Error('相机拖动方向必须是有效坐标。');
 if(delta[0]===0&&delta[1]===0)return normalize(fallback);
 const unturned=rotateDiagramViewportPoint(delta,origin,-drawingRotation);
 const raw=modelProjection([],side==='back',viewRotation,origin).unprojectDelta(unturned);
 return normalize(Math.atan2(raw[1],raw[0])*180/Math.PI);
}
