import {validateDoc,type Assignment,type Doc,type ExportResult} from './types';

/** Oriedita layer names, with explicit extra layers instead of guessing U/F as M/V. */
export const DXF_LAYERS:Record<Assignment,{name:string;color:number}>={
  B:{name:'CutLine',color:250},M:{name:'MountainLine',color:1},V:{name:'ValleyLine',color:5},A:{name:'AuxiliaryLine',color:4},U:{name:'UnassignedLine',color:8},F:{name:'FlatLine',color:3},
};

/** R12/AC1009 ASCII LINE exchange. One drawing unit = 1 mm; reflect Y for CAD's upward axis. */
export function exportDXF(doc:Doc):ExportResult{
  validateDoc(doc);
  const out:string[]=[],pair=(code:number,value:string|number)=>{out.push(String(code),String(Object.is(value,-0)?0:value));};
  pair(999,'Zhezhi Workbench: 1 drawing unit = 1 mm; X=x, Y=-y; crease pattern only');
  pair(0,'SECTION');pair(2,'HEADER');pair(9,'$ACADVER');pair(1,'AC1009');pair(9,'$LUNITS');pair(70,2);pair(0,'ENDSEC');
  pair(0,'SECTION');pair(2,'TABLES');pair(0,'TABLE');pair(2,'LTYPE');pair(70,1);
  pair(0,'LTYPE');pair(2,'CONTINUOUS');pair(70,0);pair(3,'Solid line');pair(72,65);pair(73,0);pair(40,0);pair(0,'ENDTAB');
  pair(0,'TABLE');pair(2,'LAYER');pair(70,7);
  for(const layer of [{name:'0',color:7},...Object.values(DXF_LAYERS)]){pair(0,'LAYER');pair(2,layer.name);pair(70,0);pair(62,layer.color);pair(6,'CONTINUOUS');}
  pair(0,'ENDTAB');pair(0,'ENDSEC');pair(0,'SECTION');pair(2,'ENTITIES');
  for(const segment of doc.segments){const layer=DXF_LAYERS[segment.assignment];pair(0,'LINE');pair(8,layer.name);pair(6,'CONTINUOUS');pair(62,layer.color);pair(10,segment.a[0]);pair(20,-segment.a[1]);pair(30,0);pair(11,segment.b[0]);pair(21,-segment.b[1]);pair(31,0);}
  pair(0,'ENDSEC');pair(0,'EOF');
  const warnings=['DXF 按 1 绘图单位 = 1 毫米输出（请在 CAD 中核对导入单位）；Y 轴向上，因此坐标为 (x, -y)。不缩放、不平移。','DXF 仅导出折痕线段并按线型分图层，不含模型、目标折角、起始面或撤销历史；请同时保存完整工程或模型集合。'];
  if(doc.objects?.length)warnings.push(`未导出 ${doc.objects.length} 个圆、文字或独立标记对象。`);
  if(doc.background)warnings.push('DXF 不包含参考底图。');
  if(doc.segments.some(s=>s.displayColor))warnings.push('DXF 采用标准图层颜色，不保留自定义显示色。');
  if(doc.segments.some(s=>s.assignment==='U'||s.assignment==='F'))warnings.push('未指派线与平线分别放在 UnassignedLine / FlatLine 图层，不会被猜测为山谷线。');
  return {text:out.join('\r\n')+'\r\n',warnings};
}
