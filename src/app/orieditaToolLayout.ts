import type {Tool} from './tools';
const LEGACY_GROUPS:{name:string;tools:Tool[]}[]=[{name:'绘制 / 编辑',tools:['select','unselect','erase','eraseedge','eraseaux','line','pan','measure']},{name:'测量寄存器',tools:['measurel1','measurel2','measurea1','measurea2','measurea3']},{name:'精确作图',tools:['parallel','offsetparallel','perpendicular','bisect','bisectlines','midperp','rabbitear','fishbone']},{name:'多边形',tools:['polygon']},{name:'辅助圆',tools:['circle','circleradius','circle3','circleedit','circleseparate','circleconcentric','circleequal','circlepair']},{name:'圆与切线',tools:['tangentpoint','tangentcircles']},{name:'反演 / 半径差',tools:['circleinvert','lineinvert','circledifference']},{name:'线段 / 顶点',tools:['drawdivide','drawratio','extend','lengthen','trim','divide','ratio','addvertex','mergevertex','cycletype','alternatecollinear','alternatecross','eraseoverlap','erasecross','replacetype','deletetype']}];
LEGACY_GROUPS.splice(2,0,{name:'区域选择',tools:['selectpolygon','unselectpolygon','selectlasso','unselectlasso','selectcross','unselectcross']},{name:'角度系统',tools:['angledrag','angledirection','angleconverge','angleproject']},{name:'折纸公理',tools:['axiom5','axiom7','localflat','foldableinput','foldabledraw']},{name:'镜像 / 变换',tools:['moveselection','copyselection','movefour','copyfour','mirrorline','mirrorselection','reflection','reflectionlines','transverse','continuous']});
LEGACY_GROUPS.find(g=>g.name==='绘制 / 编辑')!.tools.push('restrictedline');
LEGACY_GROUPS.find(g=>g.name==='辅助圆')!.tools.push('restrictedcircle');
LEGACY_GROUPS.find(g=>g.name==='辅助圆')!.tools.push('customcolor');
LEGACY_GROUPS.find(g=>g.name==='精确作图')!.tools.push('voronoi');
LEGACY_GROUPS.push({name:'区域检查',tools:['regioncheck']});
LEGACY_GROUPS.push({name:'标记与文字',tools:['mark','erasemark','text']});
LEGACY_GROUPS.push({name:'背景与视图',tools:['backgroundposition','advancetype','operationframe']});
LEGACY_GROUPS.find(g=>g.name==='线段 / 顶点')!.tools.push('mergecrossvertex');
LEGACY_GROUPS.splice(2,0,{name:'直接赋型',tools:['makemountain','makevalley','makeedge','makeaux','regionalswap']});

export interface DockGroup {name:string;tools:Tool[]}
export const DOCK_LABELS:Partial<Record<Tool,string>>={line:'线段',bisect:'角平分',rabbitear:'兔耳',localflat:'局部补线',extend:'原型延长',perpendicular:'垂线',reflection:'三点反射',parallel:'平行线',continuous:'连续折射',fishbone:'鱼骨',transverse:'横截反射',offsetparallel:'偏移平行',voronoi:'Voronoi',midperp:'中垂线',ratio:'比例分点',addvertex:'加顶点',select:'选择',unselect:'撤选',selectpolygon:'多边形',selectlasso:'套索',moveselection:'移动',movefour:'四点移动',copyselection:'复制',copyfour:'四点复制',rotatecopyselection:'旋转复制',mirrorselection:'镜像选区',mirrorline:'镜像线段',erase:'擦除',replacetype:'替换线型',deletetype:'按型删除',regionalswap:'山谷互换',divide:'等分',mergevertex:'合点',mergecrossvertex:'跨型合点',trim:'截断',circle:'两点圆',circleradius:'定半径圆',circle3:'三点圆',circleedit:'圆编辑',circleseparate:'分离半径',circleconcentric:'同心圆',circleequal:'等半径圆',circlepair:'双圆外切',restrictedcircle:'受限圆',customcolor:'辅助着色',tangentpoint:'点圆切线',tangentcircles:'公切线',circledifference:'半径差',circleinvert:'圆反演',lineinvert:'直线反演',mark:'标记线',erasemark:'擦标记',text:'文字',eraseedge:'擦边线',eraseaux:'擦辅线',pan:'平移',restrictedline:'射线',makemountain:'赋山折',makevalley:'赋谷折',makeedge:'赋边界',makeaux:'赋辅助',unselectpolygon:'多边撤选',unselectlasso:'套索撤选',selectcross:'划线选择',unselectcross:'划线撤选',axiom5:'公理 5',axiom7:'公理 7',foldableinput:'网格补线',foldabledraw:'自由补线',reflectionlines:'两线反射',bisectlines:'两线平分',drawdivide:'画线等分',drawratio:'根式画线',lengthen:'新型延长',cycletype:'循环赋型',alternatecollinear:'共线交替',alternatecross:'横截交替',eraseoverlap:'共线删除',erasecross:'横截删除',regioncheck:'闭环检查',backgroundposition:'底图配准',advancetype:'底图赋型',operationframe:'操作框'};
// Side assignment follows Oriedita LeftPanel / RightPanel; additional tools remain reachable.
const rightNames=['角度系统','多边形','辅助圆','圆与切线','反演 / 半径差','标记与文字','测量寄存器'];
export const RIGHT_DOCK_GROUPS:DockGroup[]=rightNames.map(name=>LEGACY_GROUPS.find(g=>g.name===name)!);
const core:Tool[]=['line','bisect','rabbitear','localflat','extend','perpendicular','reflection','parallel','continuous','fishbone','transverse','offsetparallel','voronoi','midperp','ratio','addvertex'];
const selection:Tool[]=['select','unselect','selectpolygon','selectlasso','moveselection','movefour','copyselection','copyfour','rotatecopyselection','mirrorselection','mirrorline'];
const editing:Tool[]=['erase','replacetype','deletetype','regionalswap','divide','mergevertex','mergecrossvertex','trim'];
const placed=new Set<Tool>([...core,...selection,...editing,...RIGHT_DOCK_GROUPS.flatMap(g=>g.tools)]);
export const LEFT_MAIN_GROUPS:DockGroup[]=[{name:'绘图与构造',tools:core},{name:'选择与变换',tools:selection},{name:'修改与整理',tools:editing}];
export const LEFT_EXTRA_GROUPS:DockGroup[]=LEGACY_GROUPS.map(g=>({...g,tools:g.tools.filter(t=>!placed.has(t))})).filter(g=>g.tools.length);
export const ALL_DOCK_GROUPS=[...LEFT_MAIN_GROUPS,...LEFT_EXTRA_GROUPS,...RIGHT_DOCK_GROUPS];
export const BACKGROUND_TOOLS:readonly Tool[]=['backgroundposition','advancetype','operationframe'];

/** The editor's task-based categories. The legacy dock exports above remain as
 * the exact migration reference for saved, unmodified built-in layouts. */
export const TOOL_CATEGORY_GROUPS:(DockGroup&{id:string})[]=[
 {id:'types',name:'类型',tools:[]},
 {id:'selection',name:'选择',tools:['select','unselect','selectpolygon','unselectpolygon','selectlasso','unselectlasso','selectcross','unselectcross']},
 {id:'drawing',name:'绘制',tools:['line','restrictedline','parallel','offsetparallel','perpendicular','bisect','bisectlines','midperp','angledrag','angledirection','angleconverge','angleproject','divide','ratio','addvertex']},
 {id:'advanced',name:'高级',tools:['polygon','circle','circleradius','circle3','circleedit','circleseparate','circleconcentric','circleequal','circlepair','restrictedcircle','tangentpoint','tangentcircles','circleinvert','lineinvert','circledifference']},
 {id:'deletion',name:'删除',tools:['erase','eraseedge','eraseaux','deletetype','eraseoverlap','erasecross']},
 {id:'copy-move',name:'复制与移动',tools:['moveselection','movefour','copyselection','copyfour','rotatecopyselection','mirrorselection','mirrorline','pan']},
 {id:'transform',name:'变换',tools:['makemountain','makevalley','makeedge','makeaux','replacetype','regionalswap','cycletype']},
 {id:'repair',name:'修复',tools:['localflat','foldableinput','foldabledraw','mergevertex','mergecrossvertex','trim','extend','lengthen','alternatecollinear','alternatecross']},
 {id:'marks',name:'注释',tools:['mark','erasemark','text','customcolor']},
 {id:'generation',name:'生成',tools:['voronoi','axiom5','axiom7','rabbitear','fishbone','drawdivide','drawratio','reflection','reflectionlines','transverse','continuous']},
 {id:'measurement',name:'测量',tools:['measure','measurel1','measurel2','measurea1','measurea2','measurea3']},
 {id:'checks',name:'整理与检查',tools:['regioncheck']},
];
