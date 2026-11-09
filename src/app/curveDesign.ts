import {
  parseGenericNonuniformHelixResult, validateGenericNonuniformHelixQuery,
  type GenericNonuniformHelixQuery, type GenericNonuniformHelixResult,
} from './curvedNativeNonuniformHelix';

/** A continuous-source design with sampled views. This is never a FOLD document. */
export type CurveDesign={
  format:'zhezhi-curve-design';version:1;name:string;millimetersPerUnit:number;
  query:GenericNonuniformHelixQuery;result:GenericNonuniformHelixResult;
};
export type CurvePoint2=[number,number];
export type CurvePoint3=[number,number,number];
export type CurveDesignGeometry={
  crease2D:CurvePoint2[];crease3D:CurvePoint3[];
  left2D:CurvePoint2[][];right2D:CurvePoint2[][];
  left3D:CurvePoint3[][];right3D:CurvePoint3[][];
};

/** Only governs adopting a regular continuous design, never CP foldability. */
export function curveDesignApplyProblem(result:GenericNonuniformHelixResult):string|null{
  if(!result.domain.certified||!result.certification.sourceRulesCertified)
    return '完整曲线区间尚未验证，请缩短区间或调整折角。';
  const flat=result.flattening.result;
  if(result.flattening.status!=='computed'||!flat)
    return '尚未得到完整二维展开，请调整半径、折角或参数区间。';
  const c=flat.certification;
  if(!c.formalCommonFlatteningCertified||!c.finiteLeftMetricVerified||!c.finiteRightMetricVerified)
    return '左右纸带的共同展开或等距核验未通过。';
  if(!c.sourceLeftStripRegularityCertified||!c.sourceRightStripRegularityCertified||
    !c.formalLeftStripRegularityCertified||!c.formalRightStripRegularityCertified)
    return '纸带包含焦点或正则性未验证，请减小带宽或调整区间。';
  return null;
}

function metadata(name:unknown,scale:unknown):{name:string;millimetersPerUnit:number}{
  if(typeof name!=='string'||!name.trim()||name.length>120)throw Error('曲面设计名称须为 1–120 个字符。');
  if(typeof scale!=='number'||!Number.isFinite(scale)||scale<=0||scale>1e6)
    throw Error('实际尺寸须大于 0，且不超过每单位 10⁶ 毫米。');
  return {name:name.trim(),millimetersPerUnit:scale};
}

export function createNonuniformHelixDesign(result:GenericNonuniformHelixResult,
  options:{name?:string;millimetersPerUnit?:number}={}):CurveDesign{
  const details=metadata(options.name??'非均匀螺旋曲折',options.millimetersPerUnit??100);
  const verified=parseGenericNonuniformHelixResult(result,result.query);
  const problem=curveDesignApplyProblem(verified);if(problem)throw Error(problem);
  return {format:'zhezhi-curve-design',version:1,...details,
    query:{...verified.query},result:JSON.parse(JSON.stringify(verified))};
}

export function parseCurveDesign(raw:unknown):CurveDesign{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('曲面设计文件格式无效。');
  const value=raw as Record<string,unknown>,fields=['format','version','name','millimetersPerUnit','query','result'];
  if(Object.keys(value).length!==fields.length||!fields.every(k=>Object.hasOwn(value,k))||
    value.format!=='zhezhi-curve-design'||value.version!==1)throw Error('不支持的曲面设计格式或版本。');
  const details=metadata(value.name,value.millimetersPerUnit),query=validateGenericNonuniformHelixQuery(value.query),
    result=parseGenericNonuniformHelixResult(value.result,query),problem=curveDesignApplyProblem(result);
  if(problem)throw Error(problem);
  return {format:'zhezhi-curve-design',version:1,...details,query,result};
}

/** World coordinates in mm; normalization belongs to computation, not dimensions. */
export function curveDesignGeometry(design:CurveDesign):CurveDesignGeometry{
  const flat=design.result.flattening.result;if(!flat)throw Error('设计缺少二维展开。');
  const scale=design.millimetersPerUnit,
    p2=(p:number[]):CurvePoint2=>[p[0]*scale,p[1]*scale],
    p3=(p:number[]):CurvePoint3=>[p[0]*scale,p[1]*scale,p[2]*scale];
  return {
    crease2D:flat.sample.rows.map(row=>p2(row.targetBase)),
    crease3D:design.result.sample.rows.map(row=>p3(row.sourceBase)),
    left2D:flat.grid.map(row=>row.targetLeft.map(p2)),right2D:flat.grid.map(row=>row.targetRight.map(p2)),
    left3D:design.result.grid.map(row=>row.sourceLeft.map(p3)),right3D:design.result.grid.map(row=>row.sourceRight.map(p3)),
  };
}

export function curveBandBoundary<T>(grid:T[][]):T[]{
  return [...grid.map(row=>row[0]),...grid.map(row=>row[row.length-1]).reverse()];
}

/** Zero-based vertex/triangle indices shared by the viewport and OBJ export. */
export function curveDesignSampleMesh(geometry:CurveDesignGeometry){
  const vertices:CurvePoint3[]=[],faces:{side:'left'|'right';vertices:[number,number,number]}[]=[];
  for(const [side,grid] of [['left',geometry.left3D],['right',geometry.right3D]] as const){
    const offset=vertices.length,width=grid[0].length;vertices.push(...grid.flat());
    for(let i=0;i<grid.length-1;i++)for(let j=0;j<width-1;j++){
      const a=offset+i*width+j,b=a+width;
      faces.push({side,vertices:side==='left'?[a,b,a+1]:[a,a+1,b]},
        {side,vertices:side==='left'?[a+1,b,b+1]:[a+1,b+1,b]});
    }
  }
  const curveOffset=vertices.length;vertices.push(...geometry.crease3D);
  return {vertices,faces,curve:geometry.crease3D.map((_,i)=>curveOffset+i)};
}
const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const coordinate=(x:number)=>Number(x.toPrecision(14)).toString();
const path=(points:CurvePoint2[])=>points.map((p,i)=>`${i?'L':'M'}${coordinate(p[0])} ${coordinate(-p[1])}`).join(' ');

export function exportCurveDesignSVG(design:CurveDesign):string{
  const g=curveDesignGeometry(design),points=[...g.crease2D,...g.left2D.flat(),...g.right2D.flat()],
    x0=Math.min(...points.map(p=>p[0])),x1=Math.max(...points.map(p=>p[0])),
    y0=-Math.max(...points.map(p=>p[1])),y1=-Math.min(...points.map(p=>p[1])),
    margin=2,width=x1-x0+2*margin,height=y1-y0+2*margin;
  const bands=[g.left2D,g.right2D].map(grid=>`<path d="${path(curveBandBoundary(grid))} Z"/>`).join('\n'),
    rulings=[g.left2D,g.right2D].flatMap(grid=>grid.map(row=>`<path d="${path([row[0],row[row.length-1]])}"/>`)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${coordinate(width)}mm" height="${coordinate(height)}mm" viewBox="${coordinate(x0-margin)} ${coordinate(y0-margin)} ${coordinate(width)} ${coordinate(height)}">
<title>${xml(design.name)} · 二维曲面展开采样</title>
<desc>1 SVG 单位 = 1 mm。连续源的采样折线，不是经过刚性面等距验证的直折痕 CP；未验证全局重叠、碰撞和折叠运动。</desc>
<metadata>${xml(JSON.stringify({format:design.format,version:design.version,millimetersPerUnit:design.millimetersPerUnit,query:design.query}))}</metadata>
<g fill="none" stroke="#202824" stroke-width="0.2">${bands}</g>
<g fill="none" stroke="#8b5bb7" stroke-width="0.12">${rulings}</g>
<path fill="none" stroke="#008b9a" stroke-width="0.25" d="${path(g.crease2D)}"/>
</svg>`;
}

/** Triangles visualize the smooth samples; their flat counterparts are not rigid facets. */
export function exportCurveDesignOBJ(design:CurveDesign):string{
  const mesh=curveDesignSampleMesh(curveDesignGeometry(design)),lines=[
    '# Zhezhi continuous curve design: sampled surface mesh',
    '# Units: millimeters. Not an exact rigid-face FOLD or a collision-verified model.',
    `# Source: ${JSON.stringify(design.query)}`,
  ];
  for(const p of mesh.vertices)lines.push(`v ${p.map(coordinate).join(' ')}`);
  for(const side of ['left','right'] as const){lines.push(`g ${side}`);
    for(const face of mesh.faces)if(face.side===side)lines.push(`f ${face.vertices.map(i=>i+1).join(' ')}`);}
  lines.push('g curve');
  lines.push(`l ${mesh.curve.map(i=>i+1).join(' ')}`);
  return lines.join('\n')+'\n';
}

export const exportCurveDesignJSON=(design:CurveDesign):string=>JSON.stringify(design,null,2);
