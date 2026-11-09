import type {XY} from './tessellation';

function exactUnitCoordinate(value:number):number{
  if(Math.abs(value)<1e-12)return 0;
  if(Math.abs(value-1)<1e-12)return 1;
  return value;
}

/** Origamica UnitRegularPolygonVertices[n], with vertex 1 at (0,0) and a unit base. */
export function unitRegularPolygonVertices(sides:number):XY[]{
  if(!Number.isInteger(sides)||sides<3||sides>64)throw Error('正多边形边数须为 3–64 的整数。');
  const centerY=.5/Math.tan(Math.PI/sides);
  return Array.from({length:sides},(_,index)=>{
    const angle=2*Math.PI*index/sides;
    return [exactUnitCoordinate(.5-.5*Math.cos(angle)+centerY*Math.sin(angle)),
      exactUnitCoordinate(centerY-.5*Math.sin(angle)-centerY*Math.cos(angle))] as XY;
  });
}

/** Origamica's circular regular twist takes radius m times the unit circumradius. */
export function unitRegularCircularTwist(sides:number,magnification:number):{polygon:XY[];radius:number}{
  const polygon=unitRegularPolygonVertices(sides);
  const radius=magnification/(2*Math.sin(Math.PI/sides));
  if(!Number.isFinite(magnification)||magnification<=1||radius>1000)
    throw Error('圆半径倍数 m 须大于 1，且生成的纸张半径不超过 1000。');
  return {polygon,radius};
}

/** UnitTriangleVertices[{A,B,C}], centered as the original circular CP wrapper does. */
export function centeredUnitTriangleVertices(angleA:number,angleB:number):XY[]{
  if(!Number.isFinite(angleA)||!Number.isFinite(angleB)||angleA<=0||angleB<=0||angleA+angleB>=180)
    throw Error('三角形两个底角须为正，且角度和小于 180°。');
  const a=angleA*Math.PI/180,b=angleB*Math.PI/180;
  const side=Math.sin(b)/Math.sin(a+b);
  const vertices:XY[]=[[0,0],[1,0],[side*Math.cos(a),side*Math.sin(a)]];
  const center:XY=[vertices.reduce((sum,point)=>sum+point[0],0)/3,
    vertices.reduce((sum,point)=>sum+point[1],0)/3];
  return vertices.map(([x,y])=>[x-center[0],y-center[1]]);
}
