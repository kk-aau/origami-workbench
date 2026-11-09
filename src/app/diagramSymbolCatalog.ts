import {DIAGRAM_SYMBOL_PARAM_LIMITS,validateDiagramSymbolParams,type DiagramSymbolAnnotation,type DiagramSymbolKind,type DiagramSymbolParams} from './diagramAnnotations';

export interface DiagramSymbolParameter {key:keyof DiagramSymbolParams;label:string;min:number;max:number;step:number;defaultValue:number}
export interface DiagramSymbolCatalogEntry {kind:DiagramSymbolKind;label:string;group:string;cadName:string;parameters:DiagramSymbolParameter[];textLabel?:string;sourceOnly?:boolean;variantOf?:DiagramSymbolKind;
  /** New placement only, relative to the source paper's short edge. Saved size/legacy rendering never use this. */
  initialPaperSizeRatio?:number;
}
const labels:Record<keyof DiagramSymbolParams,string>={length:'长度',height:'高度',curve:'弧度',headLength:'箭头长度',headWidth:'箭头宽度',radius:'圆半径',gap:'组件间距',count:'重复个数',markSize:'标记尺寸'};
const base:DiagramSymbolParams={length:74,height:35,curve:-55,headLength:12,headWidth:14,radius:30,gap:12,count:3,markSize:12};
function entry(kind:DiagramSymbolKind,label:string,group:string,cadName:string,values:Partial<DiagramSymbolParams>,textLabel?:string):DiagramSymbolCatalogEntry {
  return {kind,label,group,cadName,textLabel,parameters:(Object.keys(values) as (keyof DiagramSymbolParams)[]).map(key=>{
    const [min,max]=DIAGRAM_SYMBOL_PARAM_LIMITS[key];
    const parameterLabel=key==='count'?(kind==='star'?'星角数量':['equalLength','equalAngle'].includes(kind)?'标记数量':kind.startsWith('flap')?'纸层数量':labels[key]):textLabel&&key==='markSize'?'标签字号':labels[key];
    return {key,label:parameterLabel,min:key==='count'&&kind==='star'?3:min,max,step:1,defaultValue:values[key]!};
  })};
}

/** Library names map to blocks present in the bundled original CAD library.
 * Parameters describe legacy illustrations only; real CAD controls come from
 * cadPropertyDefinitions and must not be invented from these legacy fields. */
export const SYMBOL_CATALOG:DiagramSymbolCatalogEntry[]=[
  entry('paperFront','正面指示箭头','指示与标记','0-NAFt',{headLength:40,headWidth:46}),
  entry('paperBack','背面指示箭头','指示与标记','0-NABk',{headLength:40,headWidth:46}),
  // Each CAD angle-bisector dot spans 26.983412346665975% of its normalized
  // symbol. Match that dot at the angle marker's 8%-of-paper placement size.
  {...entry('referencePoint','参考点','指示与标记','1-NMkPT',{radius:25}),initialPaperSizeRatio:.08*.26983412346665975},
  entry('equalLength','平行标记','指示与标记','1-NMkPar',{length:72,gap:24,markSize:8,count:2}),
  {...entry('equalAngle','角平分标记','指示与标记','1-NDivAng',{gap:48,markSize:10,count:2}),initialPaperSizeRatio:.08},
  {...entry('rightAngle','直角标记','指示与标记','1-NRtAng',{length:70,height:70,markSize:20}),initialPaperSizeRatio:.08},
  entry('fold','谷折箭头','折叠动作','2-NVFold',{length:74,height:35,curve:-55,headLength:12,headWidth:14}),
  entry('unfold','预折箭头','折叠动作','2-NFUnf',{length:74,height:35,curve:-55,headLength:12,headWidth:14}),
  entry('foldSmall','简式谷折箭头','折叠动作','2-NVFoldS',{length:62,height:25,curve:-38,headLength:10,headWidth:10}),
  entry('swivel','段折箭头','折叠动作','2-NSwFold',{length:65,height:45,gap:16,headLength:12,headWidth:14}),
  // The untouched source library has one NSwFold block. This requested variant
  // pairs two complete evaluated shafts and heads in a mirrored arrangement.
  {kind:'swivelDouble',label:'双向段折箭头',group:'折叠动作',cadName:'2-NSwFold',parameters:[],sourceOnly:true,variantOf:'swivel'},
  entry('mountainFold','山折箭头','折叠动作','2-NMFold',{length:70,height:35,curve:60,headLength:25,headWidth:26}),
  entry('unfoldDouble','预折箭头（双线）','折叠动作','2-NFUnf2',{length:70,height:30,curve:-50,gap:7,headLength:10,headWidth:10}),
  entry('sink','沉折','开层与塑形','3-NSink',{length:72,height:38,headLength:24,headWidth:50}),
  entry('angleMarker','角标记点','开层与塑形','3-NMkAng',{radius:12}),
  entry('open','撑开纸层','开层与塑形','3-NOpen',{length:74,height:40,curve:12,headLength:24,headWidth:50}),
  entry('pull','拉出纸层','开层与塑形','3-NPull',{length:74,height:32,headLength:24,headWidth:50}),
  entry('flip','翻面','视图与方向','4-NFlip',{length:80,height:24,radius:20,curve:35,headLength:12,headWidth:14}),
  entry('zoom','局部放大','视图与方向','4-NZoomIn',{length:74,height:28,curve:25,headLength:25,headWidth:50}),
  entry('rotate','顺时针旋转','视图与方向','4-NRotate',{radius:34,gap:20,headLength:12,headWidth:14}),
  {kind:'rotateCCW',label:'逆时针旋转',group:'视图与方向',cadName:'4-NRotate',parameters:[],sourceOnly:true,variantOf:'rotate'},
  entry('zoomOut','缩小视图','视图与方向','4-NZomOut',{length:74,height:28,curve:25,headLength:25,headWidth:50}),
  entry('repeat','重复步骤','步骤与保持','5-NRepeat',{length:62,height:30,gap:18,count:3,markSize:15},'步骤范围 / 次数'),
  entry('return','返回步骤','步骤与保持','5-NReturn',{length:66,height:34,count:3,markSize:14},'返回步骤'),
  entry('repeatSmall','对侧重复','步骤与保持','5-NReptS',{length:70,height:40,headLength:12,headWidth:14,count:2,markSize:10},'步骤 / 次数'),
  entry('hold','按住并拉动','步骤与保持','5-NHoldP',{length:72,radius:5,headLength:12,headWidth:14}),
  entry('flapFront','纸层向外翻折','纸层与其他','6-NFlapF',{radius:29,gap:12,headLength:16,headWidth:22,count:3,markSize:9},'纸层数量'),
  entry('flapBack','纸层向内翻折','纸层与其他','6-NFlapB',{radius:29,gap:12,headLength:16,headWidth:22,count:3,markSize:9},'纸层数量'),
  entry('star','重点星号','纸层与其他','6-HStar',{radius:35,markSize:15,count:5}),
  entry('view','观察方向','纸层与其他','6-NView',{length:60,height:42,gap:18,headLength:10,headWidth:10,markSize:10},'观察方向编号'),
  entry('cut','裁切','纸层与其他','7-NCutP',{length:78,height:18,headLength:25,gap:4}),
  entry('tearWindow','撕纸透视','纸层与其他','',{radius:30}),
  entry('blow','吹气撑开','纸层与其他','1-NBlowIn',{length:64,height:54,curve:24,gap:14,markSize:14}),
  {kind:'equalDivision',label:'等分标记',group:'指示与标记',cadName:'1-NDivLen',parameters:[],sourceOnly:true},
  {kind:'filledReferencePoint',label:'实心参考点',group:'指示与标记',cadName:'1-HMkPT',parameters:[],sourceOnly:true},
  {kind:'repeatMark',label:'重复标记',group:'步骤与保持',cadName:'5-NMkRept',parameters:[],sourceOnly:true},
];

/** Palette preview and new placement share the same symbolAt factory. Only
 * compact markers opt into a paper-relative size; all other tools retain their
 * existing drawing-frame sizing. This is deliberately outside rendering defaults. */
export function diagramSymbolInitialSize(kind:DiagramSymbolKind,drawingBounds:{width:number;height:number},paper?:{width:number;height:number}):number {
  const ratio=SYMBOL_CATALOG.find(entry=>entry.kind===kind)?.initialPaperSizeRatio;
  const bounds=ratio===undefined?drawingBounds:paper??drawingBounds;
  return Math.max(1,Math.min(1_000_000,Math.min(bounds.width,bounds.height)*(ratio??.2)));
}

/** All parameter fields are present; only fields listed for this kind affect its drawing. */
export function getSymbolParameters(annotation:Pick<DiagramSymbolAnnotation,'symbol'|'params'>):DiagramSymbolParams {
  const found=SYMBOL_CATALOG.find(item=>item.kind===annotation.symbol);
  if(!found)throw new Error('未知的折纸符号。');
  if(annotation.params!==undefined)validateDiagramSymbolParams(annotation.params);
  const defaults={...base};for(const field of found.parameters)defaults[field.key]=field.defaultValue;
  return {...defaults,...annotation.params};
}
