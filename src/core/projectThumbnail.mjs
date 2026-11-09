const point=value=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<1e8);
const colors={B:'#58615e',M:'#bd5147',V:'#477caa',U:'#8c9290',A:'#a3a9a5',F:'#9b7943'};
const safeColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:null;
const sample=(items,count)=>items.length<=count?items:Array.from({length:count},(_,i)=>items[Math.floor(i*items.length/count)]);

function curveGeometry(design) {
  if(design?.format!=='zhezhi-curve-design'||design.version!==1||!Number.isFinite(design.millimetersPerUnit)||design.millimetersPerUnit<=0||design.millimetersPerUnit>1e6||design.result?.flattening?.status!=='computed')return null;
  const flat=design.result.flattening.result,rows=flat?.sample?.rows,grid=flat?.grid;
  // Native designs have 8–128 longitudinal and 2–64 transverse segments.
  // Reject damaged or oversized metadata before traversing its coordinates.
  if(!Array.isArray(rows)||rows.length<2||rows.length>129||!Array.isArray(grid)||grid.length!==rows.length||!rows.every(row=>point(row?.targetBase)))return null;
  let columns;
  for(const row of grid)for(const side of ['targetLeft','targetRight']){
    const points=row?.[side];
    if(!Array.isArray(points)||points.length<2||points.length>65||columns!==undefined&&points.length!==columns||!points.every(point))return null;
    columns=points.length;
  }
  // Match curveDesignGeometry's millimeter coordinates and the SVG export's
  // upward-positive source axes. Samples remain a preview, never CP segments.
  const p=value=>[value[0]*design.millimetersPerUnit,-value[1]*design.millimetersPerUnit];
  const crease=rows.map(row=>p(row.targetBase));
  const bands=['targetLeft','targetRight'].map(side=>grid.map(row=>row[side].map(p)));
  const boundaries=bands.map(band=>[...band.map(row=>row[0]),...band.map(row=>row[row.length-1]).reverse()]);
  const rulings=bands.flatMap(band=>sample(band,32).map(row=>[row[0],row[row.length-1]]));
  return {crease,boundaries,rulings,points:[...crease,...bands.flat(2)]};
}

/** A bounded SVG preview of the actual CP. Only numeric geometry and whitelisted
 * colors are interpolated; names, text objects, backgrounds and URLs are omitted.
 * Callers can use it as an encoded image source without injecting SVG into HTML. */
export function projectThumbnail(doc) {
  if(!doc||!Array.isArray(doc.segments))return '';
  const curve=!doc.segments.length?curveGeometry(doc.metadata?.curveDesign):null;
  const segments=doc.segments.filter(s=>s&&point(s.a)&&point(s.b)&&Object.hasOwn(colors,s.assignment));
  const boundaries=segments.filter(s=>s.assignment==='B');
  const circles=(Array.isArray(doc.objects)?doc.objects:[]).filter(o=>o?.kind==='circle'&&point(o.center)&&Number.isFinite(o.radius)&&o.radius>0&&o.radius<=1e6).slice(0,48);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const extend=(x,y)=>{minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);};
  for(const s of segments){extend(...s.a);extend(...s.b);}
  for(const o of circles){extend(o.center[0]-o.radius,o.center[1]-o.radius);extend(o.center[0]+o.radius,o.center[1]+o.radius);}
  if(curve)for(const p of curve.points)extend(...p);
  const paperDimension=value=>Number.isFinite(value)&&value>0?Math.min(1e8,value):200;
  const paper={width:paperDimension(doc.paper?.width),height:paperDimension(doc.paper?.height)};
  if(!boundaries.length&&!curve){extend(0,0);extend(paper.width,paper.height);}
  const width=Math.max(maxX-minX,1e-6),height=Math.max(maxY-minY,1e-6),scale=Math.min(292/width,192/height);
  const offsetX=(320-width*scale)/2,offsetY=(220-height*scale)/2;
  const number=n=>String(Math.round(n*100)/100);
  const x=value=>number(offsetX+(value-minX)*scale),y=value=>number(offsetY+(value-minY)*scale);
  const parts=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220" width="320" height="220"><rect width="320" height="220" fill="#fff"/>'];
  if(!boundaries.length&&!curve)parts.push(`<rect x="${x(0)}" y="${y(0)}" width="${number(paper.width*scale)}" height="${number(paper.height*scale)}" fill="#fff" stroke="#87918b" stroke-width="1.15"/>`);
  if(curve){
    const path=points=>points.map((p,i)=>`${i?'L':'M'}${x(p[0])} ${y(p[1])}`).join(' ');
    for(const boundary of curve.boundaries)parts.push(`<path d="${path(boundary)} Z" fill="#f7f5ec" stroke="${colors.B}" stroke-width="1.15"/>`);
    for(const ruling of curve.rulings)parts.push(`<path d="${path(ruling)}" fill="none" stroke="${colors.A}" stroke-width="0.65"/>`);
    parts.push(`<path d="${path(curve.crease)}" fill="none" stroke="#008b9a" stroke-width="1.5"/>`);
  }
  // Give real material edges priority, then sample the remaining creases evenly
  // so large tessellations retain their overall structure within the SVG budget.
  const edges=sample(boundaries,Math.min(550,boundaries.length));
  const chosen=[...edges,...sample(segments.filter(s=>s.assignment!=='B'),550-edges.length)];
  for(const s of chosen){
    const color=safeColor(s.displayColor)??colors[s.assignment];
    parts.push(`<line x1="${x(s.a[0])}" y1="${y(s.a[1])}" x2="${x(s.b[0])}" y2="${y(s.b[1])}" stroke="${color}" stroke-width="${s.assignment==='B'?'1.35':'1.1'}"${s.assignment==='V'?' stroke-dasharray="5 3"':s.assignment==='A'?' stroke-dasharray="2 3"':''}/>`);
  }
  for(const o of circles)parts.push(`<circle cx="${x(o.center[0])}" cy="${y(o.center[1])}" r="${number(o.radius*scale)}" fill="none" stroke="${safeColor(o.color)??colors.U}" stroke-width="1"/>`);
  parts.push('</svg>');
  return parts.join('');
}
