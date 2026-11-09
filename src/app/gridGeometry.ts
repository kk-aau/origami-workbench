import type {Point} from '../core/types';
import type {Bounds} from './paper';
import {DEFAULT_GRID_DIVISIONS} from './gridControls';

export type GridPattern='square'|'triangular';
export interface GridLattice {origin:Point;stepX:number;stepY:number;pattern?:GridPattern;diagonal?:boolean;diagonalAngle?:number;rotation?:number}
export interface GridLineFamily {normal:Point;step:number;angle:number}
export const DEFAULT_DIAGONAL_GRID_ANGLE=45;
export function validateGridRotation(value:unknown):number{
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error('网格旋转角度须为有限数值。');
  let normalized=value%360;
  if(normalized>=180)normalized-=360;
  if(normalized< -180)normalized+=360;
  return normalized===0?0:normalized;
}
const gridRotation=(grid:Pick<GridLattice,'rotation'|'pattern'>)=>grid.pattern==='triangular'?0:validateGridRotation(grid.rotation??0);
function rotateVector(point:Point,angle:number):Point{
  if(angle===0)return [...point];
  const radians=angle*Math.PI/180,cosine=Math.cos(radians),sine=Math.sin(radians),c=Math.abs(cosine)<1e-15?0:cosine,s=Math.abs(sine)<1e-15?0:sine;
  return [point[0]*c-point[1]*s,point[0]*s+point[1]*c];
}
/** Local coordinates are millimetres relative to the lattice origin. */
export function gridToWorld(point:Point,grid:Pick<GridLattice,'origin'|'rotation'|'pattern'>):Point{
  const [x,y]=rotateVector(point,gridRotation(grid));return [grid.origin[0]+x,grid.origin[1]+y];
}
export function gridToLocal(point:Point,grid:Pick<GridLattice,'origin'|'rotation'|'pattern'>):Point{
  return rotateVector([point[0]-grid.origin[0],point[1]-grid.origin[1]],-gridRotation(grid));
}
export function validateDiagonalGridAngle(value:unknown):number{
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>=90)throw new Error('网格角度须大于 0° 且小于 90°。');
  return value;
}

/** The same normal/spacing pair defines painting and exact snap intersections.
 * Missing angle keeps legacy rectangular-cell diagonals for other workspaces.
 * Fixed normal spacing avoids pathological density near 0 or 90 degrees. */
export function diagonalGridFamilies(grid:GridLattice):GridLineFamily[]{
  if(!grid.diagonal||grid.pattern==='triangular')return [];
  const angle=grid.diagonalAngle===undefined?Math.atan2(grid.stepY,grid.stepX)*180/Math.PI:validateDiagonalGridAngle(grid.diagonalAngle);
  const radians=angle*Math.PI/180,step=grid.stepX*grid.stepY/Math.hypot(grid.stepX,grid.stepY);
  if(!Number.isFinite(step)||step<=0)throw new Error('网格间距无效。');
  // Preserve the exact legacy ratios rather than re-deriving them through trig.
  const size=Math.hypot(grid.stepX,grid.stepY),x=grid.diagonalAngle===undefined?grid.stepY/size:Math.sin(radians),y=grid.diagonalAngle===undefined?grid.stepX/size:Math.cos(radians);
  const rotation=gridRotation(grid);
  return [{normal:rotateVector([x,y],rotation),step,angle:-angle+rotation},{normal:rotateVector([-x,y],rotation),step,angle:angle+rotation}];
}
/** Width is the equilateral side length; paper height never stretches triangles. */
export function triangularGridTile(grid:Pick<GridLattice,'stepX'>):{width:number;height:number;path:string}{
  const width=grid.stepX,halfHeight=width*Math.sqrt(3)/2,height=2*halfHeight;
  if(!Number.isFinite(width)||width<=0)throw new Error('网格间距无效。');
  return {width,height,path:`M0 0H${width}M0 ${halfHeight}H${width}M0 ${height}H${width}M0 0L${width} ${height}M${width} 0L0 ${height}`};
}
export function gridLineFamilies(grid:GridLattice):GridLineFamily[]{
  if(grid.pattern==='triangular'){
    const step=triangularGridTile(grid).height/2,sine=Math.sqrt(3)/2;
    return [{normal:[0,1],step,angle:0},{normal:[-sine,.5],step,angle:60},{normal:[sine,.5],step,angle:-60}];
  }
  const rotation=gridRotation(grid);
  return [{normal:rotateVector([1,0],rotation),step:grid.stepX,angle:90+rotation},{normal:rotateVector([0,1],rotation),step:grid.stepY,angle:rotation},...diagonalGridFamilies(grid)];
}

/** Clip each line to the current viewport before constructing SVG paths. */
function gridFamilyPaths(rect:Bounds,grid:GridLattice,families:readonly GridLineFamily[]):string{
  if(![rect.x,rect.y,rect.width,rect.height,...grid.origin].every(Number.isFinite)||rect.width<0||rect.height<0)throw new Error('网格显示范围无效。');
  const result:string[]=[],[ox,oy]=grid.origin,corners=[[rect.x-ox,rect.y-oy],[rect.x+rect.width-ox,rect.y-oy],[rect.x-ox,rect.y+rect.height-oy],[rect.x+rect.width-ox,rect.y+rect.height-oy]];
  for(const {normal:[nx,ny],step} of families){
    const projections=corners.map(([x,y])=>(x*nx+y*ny)/step),first=Math.ceil(Math.min(...projections)-1e-9),last=Math.floor(Math.max(...projections)+1e-9);
    if(last-first+1+result.length>50000)throw new Error('网格过密，请放大画布后显示网格。');
    for(let index=first;index<=last;index++){
      const center:Point=[ox+nx*index*step,oy+ny*index*step],direction:Point=[-ny,nx];let low=-Infinity,high=Infinity;
      for(let axis=0;axis<2;axis++){
        const start=axis===0?rect.x:rect.y,end=start+(axis===0?rect.width:rect.height),delta=direction[axis];
        if(Math.abs(delta)<1e-15){if(center[axis]<start||center[axis]>end){low=1;high=0;break;}continue;}
        const a=(start-center[axis])/delta,b=(end-center[axis])/delta;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));
      }
      if(high-low>1e-9&&Number.isFinite(low)&&Number.isFinite(high))result.push(`M${center[0]+low*direction[0]} ${center[1]+low*direction[1]}L${center[0]+high*direction[0]} ${center[1]+high*direction[1]}`);
    }
  }
  return result.join('');
}
export function diagonalGridPaths(rect:Bounds,grid:GridLattice):string{
  return gridFamilyPaths(rect,grid,diagonalGridFamilies(grid));
}
export function orthogonalGridPaths(rect:Bounds,grid:GridLattice):string{
  return gridFamilyPaths(rect,grid,gridLineFamilies({...grid,diagonal:false}).slice(0,2));
}
export function triangularGridPaths(rect:Bounds,grid:GridLattice):string{
  return gridFamilyPaths(rect,grid,gridLineFamilies({...grid,pattern:'triangular'}));
}

/** Nearby intersections of the actual painted line families. Old callers that
 * omit a custom angle retain their original rectangular node snapping. */
export function gridLatticeNodes(point:Point,grid:GridLattice):Point[]{
  if(grid.pattern==='triangular'){
    const step=grid.stepX,height=triangularGridTile(grid).height/2,row=Math.round((point[1]-grid.origin[1])/height),points:Point[]=[];
    for(let j=row-1;j<=row+1;j++){
      const offset=j/2,column=Math.round((point[0]-grid.origin[0])/step-offset);
      for(let i=column-1;i<=column+1;i++)points.push([grid.origin[0]+(i+offset)*step,grid.origin[1]+j*height]);
    }
    return points;
  }
  const localPoint=gridToLocal(point,grid),x=Math.round(localPoint[0]/grid.stepX),y=Math.round(localPoint[1]/grid.stepY),points:Point[]=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)points.push(gridToWorld([(x+dx)*grid.stepX,(y+dy)*grid.stepY],grid));
  if(!grid.diagonal||grid.diagonalAngle===undefined&&grid.pattern!=='square')return points;
  const axes=gridLineFamilies(grid),local:Point=[point[0]-grid.origin[0],point[1]-grid.origin[1]];
  for(let i=0;i<axes.length;i++)for(let j=i+1;j<axes.length;j++){
    if(i===0&&j===1)continue;
    const a=axes[i],b=axes[j],det=a.normal[0]*b.normal[1]-a.normal[1]*b.normal[0];if(Math.abs(det)<1e-15)continue;
    const indexA=Math.round((local[0]*a.normal[0]+local[1]*a.normal[1])/a.step),indexB=Math.round((local[0]*b.normal[0]+local[1]*b.normal[1])/b.step);
    for(let da=-1;da<=1;da++)for(let db=-1;db<=1;db++){
      const va=(indexA+da)*a.step,vb=(indexB+db)*b.step;
      points.push([grid.origin[0]+(va*b.normal[1]-vb*a.normal[1])/det,grid.origin[1]+(a.normal[0]*vb-b.normal[0]*va)/det]);
    }
  }
  return points;
}

/** Explicit square cells keep equal sides. Legacy callers without a pattern
 * retain rectangular subdivisions; square rotation is around the paper centre. */
export function paperGridGeometry(bounds:Bounds,divisions:number,options:Pick<GridLattice,'pattern'|'diagonal'|'diagonalAngle'|'rotation'>={}){
  const count=Number.isFinite(divisions)&&divisions>0?Math.min(1000,divisions):DEFAULT_GRID_DIVISIONS;
  const stepX=bounds.width/count,stepY=options.pattern==='triangular'?stepX*Math.sqrt(3)/2:options.pattern==='square'?stepX:bounds.height/count;
  if(options.diagonalAngle!==undefined)validateDiagonalGridAngle(options.diagonalAngle);
  const rotation=options.pattern==='triangular'?0:validateGridRotation(options.rotation??0),center:Point=[bounds.x+bounds.width/2,bounds.y+bounds.height/2];
  const offset=rotateVector([-bounds.width/2,-bounds.height/2],rotation),origin:Point=rotation===0?[bounds.x,bounds.y]:[center[0]+offset[0],center[1]+offset[1]];
  const grid:GridLattice={origin,stepX,stepY,...options,rotation};
  return {...grid,snap:(p:Point):Point=>{
    if(grid.pattern!=='triangular'&&(!grid.diagonal||grid.diagonalAngle===undefined&&grid.pattern!=='square')){
      const local=gridToLocal(p,grid);return gridToWorld([Math.round(local[0]/stepX)*stepX,Math.round(local[1]/stepY)*stepY],grid);
    }
    return gridLatticeNodes(p,grid).reduce((best,candidate)=>Math.hypot(candidate[0]-p[0],candidate[1]-p[1])<Math.hypot(best[0]-p[0],best[1]-p[1])?candidate:best);
  }};
}
