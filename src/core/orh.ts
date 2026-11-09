import {segmentPaperSize} from './exchangeCoordinates';
import {LIMITS,defaultAngle,validateDoc,type Assignment,type Doc,type DrawingObject,type ExportResult,type ImportResult,type Segment} from './types';

// ORH is a sectioned text format, not XML. Its numeric colors differ from CP.
const assignments:Record<string,Assignment>={'0':'B','1':'M','2':'V','3':'A'};
const palette:Record<string,string>={'0':'#000000','1':'#ff0000','2':'#0000ff','3':'#64c8c8','4':'#ffc800','5':'#ff00ff','6':'#00ff00','7':'#ffff00','8':'#d200ff','10':'#a2a2a2'};
type Section='title'|'lines'|'circles'|'marks'|'settings';
interface Item {line:number;fields:Map<string,string[]>}
const sections:Record<string,Section>={'<タイトル>':'title','<線分集合>':'lines','<円集合>':'circles','<補助線分集合>':'marks'};
const signature=(text:string)=>/^<線分集合>\s*$/m.test(text);

/** Native ORH geometry sections. Never append stale raw source geometry/settings. */
export function exportORH(doc:Doc):ExportResult{
  validateDoc(doc);
  if(doc.segments.some(s=>s.assignment==='U'||s.assignment==='F'))throw new Error('ORH 无法无损表示未指派 U 或平线 F；请使用 FOLD 或完整工程。');
  const warnings=[
    'ORH 以 UTF-8 写出折痕、圆和独立标记；不包含文字、相机/网格/偏好、参考底图、起始面、模型集合或撤销历史。请同时保存完整工程。',
    '坐标按 1 单位 = 1 毫米写出，不平移或缩放；请在接收软件核对尺寸与编码。',
    'Oriedita 1.1.3 的旧 ORH 读取器存在额外空线/空圆及圆数量读取缺陷；与 Oriedita 交换优先使用 ORI。'
  ];
  const title=doc.name.replace(/[\r\n,\u0000-\u001f\u007f]+/g,' ').trim()||'未命名作品';
  if(title!==doc.name)warnings.push('ORH 标题不支持换行、控制字符或旧读取器中的逗号；已替换为空格，不改变原工程名称。');
  if(doc.segments.some(s=>s.angle!==defaultAngle(s.assignment)))warnings.push('ORH 不保存目标折角；重新读取时山谷恢复为 ±180°。');
  if(doc.objects?.some(o=>o.kind==='mark'))warnings.push('独立标记按原生補助線分集合写出；Oriedita 1.1.3 旧读取器会漏读标记并可能误改圆颜色，建议改用 ORI。');
  const lines=['<タイトル>','タイトル,'+title,'<線分集合>'];
  const custom=(hex:string|undefined)=>{
    const rgb=hex??'#64c8c8';
    return ['<tpp>'+(hex?1:0)+'</tpp>',...['R','G','B'].map((c,i)=>'<tpp_color_'+c+'>'+parseInt(rgb.slice(1+i*2,3+i*2),16)+'</tpp_color_'+c+'>')];
  };
  const objectColor=(hex:string,fallback:string)=>{
    const match=Object.entries(palette).find(([,value])=>value===hex.toLowerCase());
    return {code:match?.[0]??fallback,custom:match?undefined:hex};
  };
  doc.segments.forEach((s,i)=>lines.push('番号,'+(i+1),'色,'+Object.entries(assignments).find(([,a])=>a===s.assignment)![0],...custom(s.displayColor),'座標,'+[...s.a,...s.b].join(',')));
  lines.push('<円集合>');
  (doc.objects??[]).filter(o=>o.kind==='circle').forEach((c,i)=>{
    const color=objectColor(c.color,'3');
    lines.push('番号,'+(i+1),'中心と半径と色,'+[...c.center,c.radius,color.code].join(','),...custom(color.custom));
  });
  lines.push('<補助線分集合>');
  (doc.objects??[]).filter(o=>o.kind==='mark').forEach((m,i)=>{
    const color=objectColor(m.color,'4');
    lines.push('補助番号,'+(i+1),'補助色,'+color.code,...custom(color.custom),'補助座標,'+[...m.a,...m.b].join(','));
  });
  const text=lines.join('\r\n')+'\r\n';
  return {text,warnings};
}

/** Detect legacy encodings by strict decoding AND native Japanese section markers. */
export function decodeORH(bytes:Uint8Array):{text:string;encoding:string}{
  for(const encoding of ['utf-8','euc-jp','shift_jis','gb18030']){
    try{const text=new TextDecoder(encoding,{fatal:true}).decode(bytes);if(signature(text))return {text,encoding};}catch{/* Try the next explicit legacy encoding. */}
  }
  throw new Error('无法识别 ORH 编码或缺少线段集合，请用 Oriedita 另存为 UTF-8 ORH/ORI。');
}

export function importORH(text:string,name='导入 ORH'):ImportResult{
  const source=text;text=text.replace(/^\uFEFF/,'');
  if(!signature(text))throw new Error('ORH 缺少 <線分集合>，不是支持的 Orihime 文本格式。');
  let section:Section='settings',item:Item|undefined,title=name,unknown=false;
  const groups:{lines:Item[];circles:Item[];marks:Item[]}={lines:[],circles:[],marks:[]},seen=new Set<string>();
  const fail=(line:number,message:string):never=>{throw new Error(`ORH 第 ${line} 行：${message}`);};
  const numeric=(value:string,line:number)=>{
    if(!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()))return fail(line,'数值格式无效。');
    const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>1e6)return fail(line,'数值超出有效范围。');return n;
  };
  for(const [index,raw] of text.split(/\r\n|\n|\r/).entries()){
    const line=index+1,value=raw.trim();if(!value)continue;
    if(Object.hasOwn(sections,value)){
      if(seen.has(value))fail(line,'集合重复，未猜测合并方式。');seen.add(value);section=sections[value];item=undefined;continue;
    }
    // A standalone tag begins/ends a settings block; per-item tpp tags have values.
    if(/^<[^<>]+>$/.test(value)&&!value.startsWith('<tpp')){section='settings';item=undefined;unknown=true;continue;}
    if(section==='settings')continue;
    if(section==='title'){if(value.startsWith('タイトル,'))title=value.slice('タイトル,'.length)||name;else unknown=true;continue;}
    const parts=value.split(',').map(s=>s.trim()),tag=value.match(/^<(tpp(?:_color_[RGB])?)>([^<>]+)<\/\1>$/);
    if(value.startsWith('<tpp')&&!tag)fail(line,'自定义颜色标签损坏。');
    const key=tag?tag[1]:parts[0],values=tag?[tag[2]]:parts.slice(1);
    const numberKey=section==='marks'?'補助番号':'番号';
    if(key===numberKey){
      if(values.length!==1||!/^\d+$/.test(values[0])||Number(values[0])!==groups[section].length+1)fail(line,'对象编号必须从 1 连续递增。');
      if(section!=='lines'&&groups[section].length>=LIMITS.objects)fail(line,`对象集合超过当前 ${LIMITS.objects} 项容量。`);
      item={line,fields:new Map()};groups[section].push(item);continue;
    }
    const allowed=section==='circles'?['中心と半径と色']:section==='marks'?['補助色','補助座標']:['色','座標','iactive','選択'];
    if(!allowed.includes(key)&&!['tpp','tpp_color_R','tpp_color_G','tpp_color_B'].includes(key)){unknown=true;continue;}
    if(!item)fail(line,'对象字段出现在编号之前。');
    if(item!.fields.has(key))fail(line,'对象字段重复。');
    item!.fields.set(key,values);
  }
  const required=(item:Item,key:string,count:number)=>{const value=item.fields.get(key);if(!value||value.length!==count)fail(item.line,`缺少或无效的 ${key} 字段。`);return value!;};
  const customColor=(item:Item):string|undefined=>{
    const flag=item.fields.get('tpp');
    if(flag&&(flag.length!==1||!['0','1'].includes(flag[0])))fail(item.line,'自定义颜色标记无效。');
    const channels=['R','G','B'].map(c=>item.fields.get('tpp_color_'+c));
    for(const channel of channels)if(channel&&(channel.length!==1||!/^\d+$/.test(channel[0])||Number(channel[0])>255))fail(item.line,'RGB 颜色通道无效。');
    if(flag?.[0]!=='1')return undefined;
    if(channels.some(c=>!c))fail(item.line,'自定义颜色缺少 RGB 通道。');
    return '#'+channels.map(c=>Number(c![0]).toString(16).padStart(2,'0')).join('');
  };
  const objectColor=(item:Item,code:string)=>{
    if(!Object.hasOwn(palette,code))fail(item.line,`不支持的对象颜色 ${code}。`);
    return customColor(item)??palette[code];
  };
  const segments:Segment[]=groups.lines.map((item,i)=>{
    const code=required(item,'色',1)[0];if(!Object.hasOwn(assignments,code))fail(item.line,`线段类型 ${code} 不对应边界/山/谷/辅助，未猜测。`);
    const coords=required(item,'座標',4).map(v=>numeric(v,item.line)),assignment=assignments[code],displayColor=customColor(item);
    return {id:'orh-line-'+i,a:[coords[0],coords[1]],b:[coords[2],coords[3]],assignment,angle:defaultAngle(assignment),...(displayColor?{displayColor}:{})};
  });
  const objects:DrawingObject[]=[];
  groups.circles.forEach((item,i)=>{
    const values=required(item,'中心と半径と色',4),[x,y,r]=values.slice(0,3).map(v=>numeric(v,item.line));
    if(r<=0)fail(item.line,'圆半径必须大于 0。');
    objects.push({id:'orh-circle-'+i,kind:'circle',center:[x,y],radius:r,color:objectColor(item,values[3])});
  });
  groups.marks.forEach((item,i)=>{
    const coords=required(item,'補助座標',4).map(v=>numeric(v,item.line));
    objects.push({id:'orh-mark-'+i,kind:'mark',a:[coords[0],coords[1]],b:[coords[2],coords[3]],color:objectColor(item,required(item,'補助色',1)[0])});
  });
  const doc:Doc={schemaVersion:2,name:title,paper:segmentPaperSize(segments),segments,objects,metadata:{sourceFormat:'orh',orhSource:source}};
  validateDoc(doc);
  const warnings=['ORH 按 1 单位 = 1 毫米读取，不平移或缩放；请核对尺寸。','仅应用折痕、圆和独立标记；相机、网格、偏好、选择状态等不应用，原始文本保留在来源元数据。ORH 不恢复本工作台历史或三维模型。'];
  if(unknown)warnings.push('文件包含未应用的设置或扩展字段，已随原始文本保留，非完整状态恢复。');
  return {doc,warnings};
}
