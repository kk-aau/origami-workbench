import {segmentPaperSize} from './exchangeCoordinates';
import {LIMITS,defaultAngle,validateDoc,type Assignment,type Doc,type DrawingObject,type ExportResult,type ImportResult,type Point,type Segment} from './types';

const palette:Record<string,string>={BLACK_0:'#000000',RED_1:'#ff0000',BLUE_2:'#0000ff',CYAN_3:'#64c8c8',ORANGE_4:'#ffc800',MAGENTA_5:'#ff00ff',GREEN_6:'#00ff00',YELLOW_7:'#ffff00',PURPLE_8:'#d200ff',GREY_10:'#a2a2a2'};
const assignment:Record<string,Assignment>={BLACK_0:'B',RED_1:'M',BLUE_2:'V',CYAN_3:'A'};

/** Geometry exchange using the actual Oriedita v1.1 JSON schema, not a workbench wrapper. */
export function exportORI(doc:Doc):ExportResult{
  validateDoc(doc);
  if(doc.segments.some(s=>s.assignment==='U'||s.assignment==='F'))throw new Error('ORI 线型不能无损表示未指派 U 或平线 F；请先明确处理这些线，或导出 FOLD/完整工程。');
  const original=doc.metadata?.oriSource;
  const inherited=original&&typeof original==='object'&&!Array.isArray(original)?structuredClone(original as Record<string,unknown>):{};
  if(Object.keys(inherited).length&&inherited['@version']!=='v1'&&inherited['@version']!=='v1.1')throw new Error('ORI 来源版本未知，不能安全回写其设置。');
  const warnings=['ORI v1.1 仅交换当前折痕、圆、独立标记和文字；不包含本工作台模型集合、撤销历史、起始面或参考底图。请另存完整工程/模型集合。','坐标按 1 单位 = 1 毫米写出，不平移或缩放；Oriedita 不声明物理单位，请核对尺寸。'];
  if(Object.keys(inherited).length)warnings.push('沿用来源 ORI 的相机、网格、偏好与其他根字段；这些设置未随本工作台编辑更新。线段/对象的未映射扩展字段不回写。');
  else warnings.push('未写入 Oriedita 相机、网格或偏好；接收软件保留其当前设置，必要时请调整视图。');
  if(Array.isArray(inherited.points)&&inherited.points.length)warnings.push('沿用来源 points 数据，未随几何编辑变换，请在 Oriedita 中核对。');
  if(doc.segments.some(s=>s.angle!==defaultAngle(s.assignment)))warnings.push('ORI 不保存目标折角或未知角度；山谷在重新载入时恢复为 ±180°。');
  if(doc.objects?.some(o=>o.kind==='text'))warnings.push('文字只保存内容和位置；字号、文字颜色与基线布局由 Oriedita 决定。');
  const custom=(hex:string|undefined)=>({customized:hex?1:0,customizedColor:'ff'+(hex?.slice(1)??'64c8c8').toLowerCase()});
  const line=(a:Point,b:Point,color:string,hex?:string)=>({a:a.join(','),b:b.join(','),active:'INACTIVE_0',color,...custom(hex),selected:0});
  const objectColor=(hex:string,fallback:string)=>{const match=Object.entries(palette).find(([,value])=>value===hex.toLowerCase());return {color:match?.[0]??fallback,...custom(match?undefined:hex)};};
  const lineSegments=doc.segments.map(s=>line(s.a,s.b,Object.entries(assignment).find(([,value])=>value===s.assignment)![0],s.displayColor));
  const circles:unknown[]=[],auxLineSegments:unknown[]=[],texts:unknown[]=[];
  for(const object of doc.objects??[]){
    if(object.kind==='circle')circles.push({x:object.center[0],y:object.center[1],r:object.radius,...objectColor(object.color,'CYAN_3')});
    else if(object.kind==='mark')auxLineSegments.push({...line(object.a,object.b,'ORANGE_4'),...objectColor(object.color,'ORANGE_4')});
    else texts.push({x:object.position[0],y:object.position[1],text:object.text});
  }
  const text=JSON.stringify({...inherited,'@version':'v1.1',title:doc.name,lineSegments,circles,auxLineSegments,texts,points:inherited.points??[]});
  return {text,warnings};
}
function record(value:unknown,label:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`ORI ${label}必须是对象。`);return value as Record<string,unknown>;}
function number(value:unknown,label:string):number{if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e6)throw new Error(`ORI ${label}坐标或数值无效。`);return value;}
function point(value:unknown,label:string):Point{
  if(typeof value!=='string')throw new Error(`ORI ${label}应为 x,y 坐标字符串。`);
  const parts=value.split(',');if(parts.length!==2||parts.some(p=>!p.trim()||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(p.trim())))throw new Error(`ORI ${label}坐标无效。`);
  return [number(Number(parts[0]),label),number(Number(parts[1]),label)];
}
export function importORI(text:string,name='导入 ORI'):ImportResult{
  let parsed:unknown;try{parsed=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('ORI 文件不是有效 JSON。');}
  const raw=record(parsed,'文件');if(raw['@version']!=='v1'&&raw['@version']!=='v1.1')throw new Error('暂只支持 ORI v1 / v1.1；未知或更早版本请先用 Oriedita 另存。');
  const warnings=['ORI 坐标按 1 单位 = 1 毫米读取，不平移或缩放；请核对纸张尺寸。','相机、网格、偏好、选择状态及未映射数据保留在来源元数据，未应用为本工作台设置；这不是完整 ORI 状态恢复。'];
  function list(key:string,required=false):unknown[]{const value=raw[key];if(value===undefined&&!required)return [];if(!Array.isArray(value))throw new Error(`ORI ${key}必须是数组。`);if(key!=='lineSegments'&&value.length>LIMITS.objects)throw new Error(`ORI ${key}超过当前 ${LIMITS.objects} 项容量。`);return value;}
  function color(item:Record<string,unknown>):string{
    if(item.customized!==undefined&&item.customized!==0&&item.customized!==1)throw new Error('ORI 自定义颜色标记无效。');
    if(item.customized===1){
      if(typeof item.customizedColor!=='string'||!/^[0-9a-f]{8}$/i.test(item.customizedColor))throw new Error('ORI 自定义颜色不是有效 ARGB。');
      if(item.customizedColor.slice(0,2).toLowerCase()!=='ff'&&!warnings.some(w=>w.includes('透明度')))warnings.push('自定义颜色透明度未应用，原 ARGB 保留在来源元数据。');
      return '#'+item.customizedColor.slice(2).toLowerCase();
    }
    if(typeof item.color!=='string'||!Object.hasOwn(palette,item.color))throw new Error(`ORI 不支持的对象颜色 ${String(item.color)}，未猜测类型。`);
    return palette[item.color];
  }
  const segments:Segment[]=list('lineSegments',true).map((value,i)=>{
    const line=record(value,`线段 ${i+1}`);if(typeof line.color!=='string'||!Object.hasOwn(assignment,line.color))throw new Error(`ORI 线段 ${i+1} 的颜色不对应已支持的折痕类型，未载入。`);
    const type=assignment[line.color],display=color(line);return {id:`ori-line-${i}`,a:point(line.a,'起点'),b:point(line.b,'终点'),assignment:type,angle:defaultAngle(type),...(line.customized===1?{displayColor:display}:{})};
  });
  const objects:DrawingObject[]=[];
  list('auxLineSegments').forEach((value,i)=>{const line=record(value,'独立标记');objects.push({id:`ori-mark-${i}`,kind:'mark',a:point(line.a,'标记起点'),b:point(line.b,'标记终点'),color:color(line)});});
  list('circles').forEach((value,i)=>{const circle=record(value,'圆');objects.push({id:`ori-circle-${i}`,kind:'circle',center:[number(circle.x,'圆心X'),number(circle.y,'圆心Y')],radius:number(circle.r,'半径'),color:color(circle)});});
  list('texts').forEach((value,i)=>{const label=record(value,'文字');if(typeof label.text!=='string')throw new Error('ORI 文字内容无效。');objects.push({id:`ori-text-${i}`,kind:'text',position:[number(label.x,'文字X'),number(label.y,'文字Y')],text:label.text,fontSize:12,color:'#000000'});});
  if(objects.some(o=>o.kind==='text'))warnings.push('ORI 文字采用 12 毫米字号；原屏幕字号/基线布局未等价映射。');
  if(list('points').length)warnings.push('ORI 独立 points 数据保留在来源元数据，尚未转换成画布对象。');
  const doc:Doc={schemaVersion:2,name:typeof raw.title==='string'&&raw.title.trim()?raw.title:name,paper:segmentPaperSize(segments),segments,objects,metadata:{sourceFormat:'ori',oriSource:raw}};
  validateDoc(doc);return {doc,warnings};
}
