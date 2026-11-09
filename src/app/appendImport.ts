import { validateDoc, type Doc, type Segment } from '../core/types';

export interface AppendImportResult {
  doc: Doc;
  appended: number;
  warnings: string[];
}

/** Append only crease geometry from an imported document without replacing the current project. */
export function appendImportedSegments(base: Doc, incoming: Doc, placement:'original'|'beside'='original'): AppendImportResult {
  validateDoc(base); validateDoc(incoming);
  let dx=0,dy=0;
  if(placement==='beside'&&base.segments.length&&incoming.segments.length){
    let right=-Infinity,top=Infinity,left=Infinity,incomingTop=Infinity;
    for(const segment of base.segments)for(const point of [segment.a,segment.b]){right=Math.max(right,point[0]);top=Math.min(top,point[1]);}
    for(const segment of incoming.segments)for(const point of [segment.a,segment.b]){left=Math.min(left,point[0]);incomingTop=Math.min(incomingTop,point[1]);}
    dx=right-left+Math.max(10,Math.min(base.paper.width,incoming.paper.width)*.1);dy=top-incomingTop;
  }
  const used = new Set(base.segments.map(segment => segment.id));
  const prefix = `import-${Date.now().toString(36)}`;
  const additions: Segment[] = incoming.segments.map((segment, index) => {
    let id = `${prefix}-${index.toString(36)}`;
    while (used.has(id)) id += 'x';
    used.add(id);
    return { ...segment, id, a: [segment.a[0]+dx,segment.a[1]+dy], b: [segment.b[0]+dx,segment.b[1]+dy] };
  });
  const warnings:string[]=[];
  if(placement==='beside')warnings.push('已将新 CP 放到现有图案右侧，保持毫米尺寸；框选一张完整 CP 后可单独折叠。');
  if(base.paper.width!==incoming.paper.width||base.paper.height!==incoming.paper.height)
    warnings.push(`导入纸张为 ${incoming.paper.width} × ${incoming.paper.height} mm，当前纸张为 ${base.paper.width} × ${base.paper.height} mm；${placement==='beside'?'保留毫米尺寸并平移摆放':'坐标按原毫米值追加'}，未缩放。`);
  if(incoming.objects?.length)warnings.push(`导入文件含 ${incoming.objects.length} 个圆／文字／标记对象；追加导入只加入折痕，未复制对象。`);
  if(incoming.background)warnings.push('导入文件含底图；追加导入不替换当前底图。');
  if(!additions.length)return {doc:base,appended:0,warnings};
  const doc={...base,segments:[...base.segments,...additions]};validateDoc(doc);
  return {doc,appended:additions.length,warnings};
}
