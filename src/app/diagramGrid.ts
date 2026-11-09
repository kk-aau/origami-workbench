import type {Doc,Point} from '../core/types';
import {getPaperBounds,type Bounds} from './paper';
import {paperGridGeometry,diagonalGridFamilies,diagonalGridPaths,orthogonalGridPaths,triangularGridPaths,gridLineFamilies,gridLatticeNodes,gridToLocal,type GridLattice} from './gridGeometry';
import {clampGridDivisions} from './gridControls';

export interface DiagramSnapGrid extends GridLattice {}
interface GridSettings {gridDivisions?:number;gridSpacing:number;gridSubdivisions:number;diagonalGrid:boolean}
export interface DiagramPaperGrid extends DiagramSnapGrid {divisions:number;snap:(point:Point)=>Point}

/** Source paper bounds, not folded-model or annotation bounds, define the grid.
 * Legacy millimetre settings are interpreted once as a paper division count. */
export function diagramPaperGrid(settings:GridSettings,doc?:Doc):DiagramPaperGrid{
  const bounds=doc?getPaperBounds(doc):{x:0,y:0,width:200,height:200};
  const divisions=clampGridDivisions(settings.gridDivisions??bounds.width/settings.gridSpacing*settings.gridSubdivisions);
  return {...paperGridGeometry(bounds,divisions),divisions,diagonal:settings.diagonalGrid};
}

/** A hidden or unreadably dense grid must not catch a pointer. Zoom never
 * changes its division count or creates coarser replacement grid coordinates. */
export function diagramGridVisible(grid:DiagramSnapGrid,units:number,minGridPixelSize=3):boolean{
  return Number.isFinite(units)&&units>0&&Math.min(grid.stepX,grid.stepY)/units>=minGridPixelSize;
}

export function diagramSnapGrid(grid:DiagramSnapGrid|undefined,legacySpacing?:number):DiagramSnapGrid|undefined{
  const value=grid??(legacySpacing?{origin:[0,0] as Point,stepX:legacySpacing,stepY:legacySpacing}:undefined);
  return value&&Array.isArray(value.origin)&&value.origin.length===2&&value.origin.every(Number.isFinite)&&Number.isFinite(value.stepX)&&value.stepX>0&&Number.isFinite(value.stepY)&&value.stepY>0?value:undefined;
}

/** The same adjacent paper lattice nodes serve every free point or move. */
export function diagramGridNodes(point:Point,grid:DiagramSnapGrid):Point[]{
  return gridLatticeNodes(point,grid);
}

export function diagramGridIsNode(point:Point,grid:DiagramSnapGrid,epsilon:number):boolean{
  if(grid.pattern==='triangular'||grid.pattern==='square'&&grid.diagonal)return gridLatticeNodes(point,grid).some(candidate=>Math.hypot(candidate[0]-point[0],candidate[1]-point[1])<=epsilon);
  const local=gridToLocal(point,grid),x=local[0]/grid.stepX,y=local[1]/grid.stepY;
  return Math.abs(x-Math.round(x))<=epsilon/grid.stepX&&Math.abs(y-Math.round(y))<=epsilon/grid.stepY;
}

/** Grid lines satisfy dot(point-origin,normal) = integer * step. Normalising
 * diagonal normals keeps intersection tolerance meaningful on rectangular cells. */
export function diagramGridAxes(grid:DiagramSnapGrid,legacyDiagonalSpacing?:number):{normal:Point;step:number}[]{
  if(grid.pattern==='triangular'||grid.rotation)return gridLineFamilies(grid);
  const axes:{normal:Point;step:number}[]=[{normal:[1,0],step:grid.stepX},{normal:[0,1],step:grid.stepY}];
  if(grid.diagonal){
    axes.push(...diagonalGridFamilies(grid));
  }else if(legacyDiagonalSpacing&&Number.isFinite(legacyDiagonalSpacing)&&legacyDiagonalSpacing>0){
    axes.push({normal:[1,1],step:legacyDiagonalSpacing},{normal:[-1,1],step:legacyDiagonalSpacing});
  }
  return axes;
}

/** Paint the full drawing area, using the paper's shifted rectangular lattice.
 * Min/max index iteration also avoids cumulative coordinate drift while zooming. */
export function diagramGridPaths(rect:Bounds,grid:DiagramSnapGrid):{major:string;minor:string;diagonal:string}{
  if(grid.pattern==='triangular')return {major:triangularGridPaths(rect,grid),minor:'',diagonal:''};
  if(grid.rotation)return {major:orthogonalGridPaths(rect,grid),minor:'',diagonal:diagonalGridPaths(rect,grid)};
  const paths:string[]=[],diagonal:string[]=[],[ox,oy]=grid.origin;
  for(let index=Math.ceil((rect.x-ox)/grid.stepX);index<=Math.floor((rect.x+rect.width-ox)/grid.stepX+1e-9);index++){
    const x=ox+index*grid.stepX;paths.push(`M${x} ${rect.y}V${rect.y+rect.height}`);
  }
  for(let index=Math.ceil((rect.y-oy)/grid.stepY);index<=Math.floor((rect.y+rect.height-oy)/grid.stepY+1e-9);index++){
    const y=oy+index*grid.stepY;paths.push(`M${rect.x} ${y}H${rect.x+rect.width}`);
  }
  if(grid.diagonal&&grid.diagonalAngle!==undefined)diagonal.push(diagonalGridPaths(rect,grid));
  else if(grid.diagonal){
    const left=(rect.x-ox)/grid.stepX,right=(rect.x+rect.width-ox)/grid.stepX,top=(rect.y-oy)/grid.stepY,bottom=(rect.y+rect.height-oy)/grid.stepY;
    for(let index=Math.ceil(left+top);index<=Math.floor(right+bottom+1e-9);index++)diagonal.push(`M${rect.x} ${oy+grid.stepY*(index-left)}L${rect.x+rect.width} ${oy+grid.stepY*(index-right)}`);
    for(let index=Math.ceil(top-right);index<=Math.floor(bottom-left+1e-9);index++)diagonal.push(`M${rect.x} ${oy+grid.stepY*(index+left)}L${rect.x+rect.width} ${oy+grid.stepY*(index+right)}`);
  }
  return {major:paths.join(''),minor:'',diagonal:diagonal.join('')};
}
