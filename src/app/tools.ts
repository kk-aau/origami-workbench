export type Tool = 'mark'|'erasemark'|'regioncheck'|'customcolor'|'voronoi'|'text'|'operationframe'|'advancetype'|'backgroundposition'|'restrictedline'|'restrictedcircle'|'mergecrossvertex'|'regionalswap'|'makemountain'|'makevalley'|'makeedge'|'makeaux'|'measurel1'|'measurel2'|'measurea1'|'measurea2'|'measurea3'|'alternatecollinear'|'alternatecross'|'drawdivide'|'drawratio'|'erase'|'eraseedge'|'eraseaux'|'eraseoverlap'|'erasecross'|'replacetype'|'deletetype'|'unselect'|'select'|'line'|'pan'|'measure'|'parallel'|'perpendicular'|'bisect'|'extend'|'lengthen'|'trim'|'divide'|'ratio'|'midperp'|'addvertex'|'mergevertex'|'polygon'|'circle'|'circleradius'|'circle3'|'circleedit'|'circleseparate'|'circleconcentric'|'circleequal'|'circlepair'|'tangentpoint'|'tangentcircles'|'circledifference'|'circleinvert'|'lineinvert'|'mirrorline'|'mirrorselection'|'reflection'|'reflectionlines'|'transverse'|'continuous'|'rabbitear'|'fishbone'|'cycletype'|'axiom5'|'axiom7'|'bisectlines'|'offsetparallel'|'angledrag'|'angledirection'|'angleconverge'|'angleproject'|'localflat'|'foldableinput'|'foldabledraw'|'moveselection'|'copyselection'|'movefour'|'copyfour'|'rotatecopyselection'|'selectpolygon'|'unselectpolygon'|'selectlasso'|'unselectlasso'|'selectcross'|'unselectcross';

interface Guide {
  name: string;
  usage: string;
  steps: readonly string[];
  reference?: boolean;
}

/** Short conceptual descriptions shown before the step-by-step instruction. */
const TOOL_PURPOSES: Partial<Record<Tool, string>> = {
  mark:'绘制独立的标注线，不改变折痕交点、山谷或折叠求解输入。',
  erasemark:'只删除独立标记线，不删除相交或重合的折痕、圆和文字。',
  select: '选择已有折痕、辅助圆或交点。圆可移动、定位复制、旋转复制、四点变换、编辑属性和删除；折痕也可用于镜像等操作。',
  unselect: '从当前选区移除折痕或辅助圆，不改变任何几何或线型。',
  erase: '从工程中删除折痕小段或辅助圆；交点分割后的折痕每段可独立处理，圆作为完整对象删除。',
  line: '在纸面上创建一条有限长度的折痕，端点会成为可吸附的几何顶点。',
  restrictedline: '从起点经过第二点向前延伸，直到与指定的已有线段相交，生成有确定终点的折痕。',
  pan: '移动当前视图，不改变工程中的毫米坐标。',
  measure: '读取两点之间的距离和方向，用于检查或为参数化构造提供依据。',
  parallel: '构造一条与参考线平行的有限折痕。',
  offsetparallel: '按指定距离复制参考线的平行位置，用于平行褶皱或等距结构。',
  perpendicular: '构造与参考线成 90° 的有限折痕，得到点到线的垂足或垂直方向。',
  bisect: '把一个角分成两个相等角，得到角平分折痕；终点由实际线段或纸边限定。',
  bisectlines: '构造两条参考线的角平分线；平行时退化为两线等距的中线。',
  midperp: '构造两点连线的垂直平分线，线上任一点到两端点等距。',
  extend: '沿原折痕的方向把有限线段延长到另一条线或纸边。',
  lengthen: '把线段延长到目标位置，但用当前选择的山、谷或边界线型生成新增部分。',
  trim: '截短已有折痕，保留指定端到截断点之间的部分。',
  divide: '把已有折痕按等分数切成多个可独立选择的小段。',
  ratio: '按指定比例在已有折痕上确定真实分点并切分线段。',
  drawdivide: '创建一条新折痕，并在创建时直接生成等分后的独立小段。',
  drawratio: '用根式长度比例定位分点，创建具有精确比例关系的新折痕。',
  addvertex: '在线段内部加入真实顶点，把原线段分成可独立编辑的小段。',
  mergevertex: '删除同线型共线折痕之间没有几何意义的冗余顶点。',
  polygon: '由一条首边生成正多边形，用于规则基础形和重复结构的快速构造。',
  circle: '创建辅助圆几何；辅助圆用于定位、测量和后续构造，不参与折叠求解。',
  circleradius: '以输入的毫米半径创建辅助圆。',
  circle3: '由三个不共线点确定一个辅助圆。',
  circleedit: '修改或删除已有辅助圆的圆心、半径和显示属性。',
  circleseparate: '用两点距离作为半径创建辅助圆，把测量关系转为可复用的几何对象。',
  circleconcentric: '以已有圆为中心创建同心圆，用于等距圆环构造。',
  circleequal: '复制参考圆的半径到新圆心，保持两个圆半径相等。',
  circlepair: '调整两个圆的半径，使它们形成外切关系并保留原圆。',
  tangentpoint: '构造从给定点到圆的切线，得到与圆只接触一次的折痕。',
  tangentcircles: '构造两个圆的公切线，连接相应切点。',
  circledifference: '用多个圆的半径做加减关系，生成新的同心辅助圆。',
  circleinvert: '执行圆反演，把圆映射为另一个圆或直线，研究反演下的几何关系。',
  lineinvert: '执行直线反演，把支撑直线映射为圆或保持为过反演中心的直线。',
  mirrorline: '把一条有限折痕关于指定轴反射，生成保留线型和折角的副本。',
  mirrorselection: '把选中的多条折痕关于用户指定的镜面反射，保留原选区和原图。',
  reflection: '按三点定义镜面和方向，构造一条反射后的有限折痕。',
  reflectionlines: '利用两条支撑线的交点和镜面关系构造反射折痕。',
  transverse: '对横截轴上的 T 形端点执行反射，生成另一侧的对应折痕。',
  continuous: '沿折痕生成连续折射路径，可指定终点并选择是否山谷交替。',
  rabbitear: '在三角形中构造兔耳内心相关折痕，作为局部折纸构造参考。',
  fishbone: '沿基线按网格间距生成交替山谷的鱼骨折痕组。',
  axiom5: '应用折纸公理 5：寻找一条折线，使一个点映到目标线并经过指定点；可能存在多个解。',
  axiom7: '应用折纸公理 7：寻找一条折线，把点映到目标线并满足与另一条线垂直的条件。',
  localflat: '根据局部平折角度条件补出候选折痕，不声称整个模型一定可平折。',
  foldableinput: '根据已有顶点、网格和局部方向条件补出一条候选折痕。',
  angledrag: '把自由拖画方向限制在当前角度系统的离散方向上。',
  angledirection: '从角度系统的候选方向中选择一条，并截取为有限折痕。',
  angleconverge: '生成两组受限角射线的会聚线，用于角度系统中的交会构造。',
  angleproject: '把终点投影到角度系统指定的候选方向上，得到精确方向折痕。',
  selectpolygon: '按闭合多边形范围选择内部折痕，便于局部批量编辑。',
  selectlasso: '用自由套索选择被轮廓包围的折痕。',
  selectcross: '用一条临时参考线选择与其相交或共线重叠的折痕。',
};

export function getToolPurpose(tool: Tool): string {
  if (TOOL_PURPOSES[tool]) return TOOL_PURPOSES[tool]!;
  if (tool.startsWith('measure')) return '读取工程中的长度或角度并写入对应测量寄存器，供检查和参数构造引用。';
  if (tool.startsWith('make')) return '把命中的已有折痕改成指定线型，保留真实几何并纳入撤销历史。';
  if (tool.startsWith('erase') || tool.startsWith('delete')) return '删除符合当前筛选条件的独立折痕小段，不把相邻小段误删为整条线。';
  if (tool.startsWith('select')) return '按点、区域或临时参考线选择折痕，供后续批量编辑使用。';
  if (tool.startsWith('unselect')) return '从当前选区移除命中的折痕，不改变作品几何。';
  if (tool.startsWith('circle') || tool.startsWith('tangent')) return '创建或检查辅助圆几何，为定位和精确构造提供参考，不参与折叠求解。';
  if (tool.startsWith('angle')) return '使用当前角度系统生成受约束方向或角度关系的参考折痕。';
  if (tool.includes('reflection') || tool.includes('mirror') || tool.includes('move') || tool.includes('copy')) return '对已有折痕执行保持几何关系的选择、变换或镜像操作。';
  return '在当前折痕工程中执行该工具名称所对应的几何编辑或检查操作。';
}

export const TOOL_GUIDES: Record<Tool, Guide> = {
  mark:{name:'独立标记线',usage:'选择橙色或黄色，点起点再点终点，或按住拖动后松开；可吸附网格及已有几何点。标记不参与折叠；右侧“标记撤销”只恢复标记，顶部撤销恢复整次工程操作。改色取消未完成草稿，不改已有标记。',steps:['点击标记起点，或按住拖动','点击终点完成标记；右击／Esc取消'],reference:true},
  erasemark:{name:'删除标记线',usage:'紫色高亮为待删除标记。左键单击删除最近标记；向右拖框删除完整包含的标记，向左拖框删除接触的标记。折痕不受影响；空闲右击仍删除折痕。',steps:['左键点击标记或拖框，松开删除；构造中右击取消'],reference:true},
  regioncheck:{name:'区域闭环检查',usage:'依次自由点击轮廓点，也可按住拖动确定末点；回到首点或点“闭合并检查”。轮廓只可横穿折线内部，应避开折线端点和交点，因此不吸附网格／折线。检查闭环连续镜像是否回位，不证明山谷、层序或全局可平折；不修改作品。',steps:['自由点击第一个轮廓点，或按住拖出首边','继续自由添加轮廓点；至少三点后回首点闭合'],reference:true},
  customcolor:{name:'圆与辅助线着色',usage:'先选显示颜色，再单击辅助线／圆，或左键拖出接触框；松开为紫色命中对象着色。框选不限方向，不改变山谷类型、折角或几何。单击不穿透最近的非辅助线；操作中右击／Esc取消，空闲右击仍删线。',steps:['选颜色，点击辅助线／圆或拖框；松开应用，右击／Esc取消'],reference:true},
  voronoi:{name:'Voronoi 参考图',usage:'点击加入种子，再次点击附近种子移除；至少两点显示紫色最近点分区。仅为临时参考，不生成折痕、不随工程保存。初始中垂线总长1000 mm，未裁剪到纸边。右击／Esc或清空按钮取消全部；中键平移与滚轮缩放保留种子。',steps:['点击加入第一个种子点','继续加点；点击已有种子移除，右击／Esc清空全部'],reference:true},
  text:{name:'文字注释',usage:'点击空白处创建，点击已有文字编辑；拖动已有文字可移动。输入后点“应用文字”，Enter换行，Ctrl+Enter应用。草稿／拖动中右击或Esc取消；空闲右击优先删除文字，否则删线。右键框选按原方向规则删除文字和线段。字号使用毫米，随画布缩放。',steps:['点击空白处新建文字；点击已有文字编辑，拖动移动'],reference:true},
  operationframe:{name:'操作框',usage:'框外按住左键拖动建框；框内拖动移动，拖边／角调整尺寸。紫色框固定在屏幕，用于SVG／PNG区域导出，不修改折线。右击／Esc取消当前拖动并恢复原框；空闲右击仍删线。切换工具或工程清框。',steps:['框外拖动建框；框内移动，边角调整；完成后点击“导出框内图”'],reference:true},
  advancetype:{name:'底图对照赋型',usage:'按住已有线段，暂时隐藏以查看下方底图。原位松开循环：未选边界→选中边界→山折→谷折→边界；已选山谷不变。拖动恢复原线且不赋型；右击／Esc取消。不是自动识图，不生成新线。',steps:['按住已有边界／山谷线查看底图；原位松开循环赋型，拖动则恢复原线'],reference:true},
  backgroundposition:{name:'底图四点配准',usage:'先在右侧加载底图，再自由点图片特征 A、B，然后点目标 C、D；A 对齐 C、B 对齐 D，等比缩放并旋转，不改变折线。目标靠近已有端点／交点时自动吸附，否则自由落点；不吸附网格。按下定点，第四点松开提交。',steps:['自由点击图片特征点 A（不吸附）','自由点击不同的图片特征点 B（不吸附）','点击目标 C，图片 A 将对齐这里','预览后点击不同的目标 D，松开完成配准；右击／Esc取消'],reference:true},
  restrictedline:{name:'射线',usage:'依次点击起点和经过点确定方向，再点击经过点前方路径上的已有线段，以实际交点结束。只接受有限目标线段上的交点，不回退、不延长目标；平行或共线时可重选目标。采用当前绘制线型，右击／Esc 取消。',steps:['点击射线起点','点击不同的经过点，确定向前方向','点击经过点前方路径上的已有线段，以交点结束'],reference:true},
  restrictedcircle:{name:'受限圆心半径圆',usage:'先选受限圆心，再选受限半径点，两次点击或拖放均可。只接受已有顶点／交点、圆心或可见纸内网格点，不接受任意圆周；生成独立辅助圆。',steps:['点击有效受限圆心，或按住拖画','点击有效半径点或在该点松开；右击／Esc取消'],reference:true},
  mergecrossvertex:{name:'跨线型合点',usage:'先点击两条共线小段的共有顶点，检查紫色预览和结果线型，再点同一顶点或“确认合点”。边＋山→山，边＋谷→谷，山＋谷→边界。角度冲突需明确选择；右击／Esc取消，不合并T形或交叉点。',steps:['点击两条共线小段的共有顶点','检查结果线型，若折角冲突先选择；再次点紫色顶点或确认合点'],reference:true},
  regionalswap:{name:'区域山谷互换',usage:'使用绘线、折射、复制或镜像等生成线段的工具时，点击可开启／关闭生成时山谷互换，保留当前工具和构造点。其他工具下，已有选区时立即互换所选山谷；无选区时点击山谷线或拖出接触框后松开互换。辅助、边界和其他线型不变，保留折角幅值，不改变新绘制预设。',steps:['点击山谷线或拖框互换，右击／Esc取消；绘线时再次选此工具可叠加生成互换'],reference:true},
  makemountain:{name:'改为山折',usage:'点击线段或左键拖框，松开将紫色命中线改为山折。框选接触即命中，不限方向；保留已有山谷折角幅值，不改变绘制预设。',steps:['点击线段或拖出接触框，松开改为山折；右击／Esc取消'],reference:true},
  makevalley:{name:'改为谷折',usage:'点击线段或左键拖框，松开将紫色命中线改为谷折。框选接触即命中，不限方向；保留已有山谷折角幅值，不改变绘制预设。',steps:['点击线段或拖出接触框，松开改为谷折；右击／Esc取消'],reference:true},
  makeedge:{name:'改为边界',usage:'点击线段或左键拖框，松开将紫色命中线改为边界。框选接触即命中，不限方向；折角归零，不改变绘制预设。',steps:['点击线段或拖出接触框，松开改为边界；右击／Esc取消'],reference:true},
  makeaux:{name:'改为辅助线',usage:'点击山、谷、边界线或左键拖框，松开改为辅助线。接触框选不限方向；点击不穿透不合格的最近线，等距优先后添加线。保持真实小段，遵守边界保护。',steps:['点击山／谷／边界线或拖出接触框，松开转辅助；右击／Esc取消'],reference:true},
  measurel1:{name:'长度 L1',usage:'依次点击两个已有端点／交点、圆心或显示的网格点，第二次松开存入 L1。数值为格单位，另列毫米；只测量，不生成线段。',steps:['点击测量起点（已有点／圆心／显示网格点）','点击测量终点，松开存入 L1；拖动不改变按下点'],reference:true},
  measurel2:{name:'长度 L2',usage:'依次点击两个已有端点／交点、圆心或显示的网格点，第二次松开存入 L2。数值为格单位，另列毫米；只测量，不生成线段。',steps:['点击测量起点（已有点／圆心／显示网格点）','点击测量终点，松开存入 L2；拖动不改变按下点'],reference:true},
  measurea1:{name:'角度 A1',usage:'依次点角边点、顶点、另一角边点，第三次松开存入 A1。有向角从第三点射线转向第一点射线；只取已有点／圆心／显示网格点。',steps:['点击第一角边点','点击顶点（第二点）','点击另一角边点，松开存入 A1'],reference:true},
  measurea2:{name:'角度 A2',usage:'依次点角边点、顶点、另一角边点，第三次松开存入 A2。有向角从第三点射线转向第一点射线；只取已有点／圆心／显示网格点。',steps:['点击第一角边点','点击顶点（第二点）','点击另一角边点，松开存入 A2'],reference:true},
  measurea3:{name:'角度 A3',usage:'依次点角边点、顶点、另一角边点，第三次松开存入 A3。有向角从第三点射线转向第一点射线；只取已有点／圆心／显示网格点。',steps:['点击第一角边点','点击顶点（第二点）','点击另一角边点，松开存入 A3'],reference:true},

  alternatecollinear:{name:'共线交替山谷',usage:'在已有点／圆心／显示网格点之间两击或拖画。沿起点朝终点方向，保留第一个共线小段的山谷类型，后续小段依次交替；不受当前绘图线型影响。首段须为山折或谷折。',steps:['点击已有点、圆心或网格点，或按住左键拖画','在已有点、圆心或网格点点击／松开，按紫色编号赋型'],reference:true},
  alternatecross:{name:'横截交替山谷',usage:'两击或拖画参考线，按起笔端距离赋型。包括 X 相交及参考线端点落在原线内部，不含原线端点接触或共线重叠。首项为当前线型，山谷交替，其它统一。',steps:['点击参考线起点，或按住左键拖画','点击终点或松开，按紫色编号赋型；右击／Esc取消'],reference:true},
  drawdivide:{name:'画线并等分',usage:'先设等分数，再两次点击或按住左键拖画新线。分点成为可独立选择的真实端点；同型重合处也保留分点，整组可撤销。',steps:['设置等分数，点击起点或按住左键拖画','点击终点或拖动松开，生成等分小段'],reference:true},
  drawratio:{name:'根式比例画线',usage:'设置 S=a+b√c、T=d+e√f，再两击或拖画。S 对应第一点到分点，T 对应分点到第二点。单边零画整线，双零不画，负比可外分。',steps:['设置根式比例，点击第一点或按住拖画','点击第二点或松开，按 S:T 生成真实小段'],reference:true},
  eraseoverlap:{name:'共线删除',usage:'在已有端点／交点、圆心或显示的网格点之间拖画，也可依次点击两点。删除与参考线正长度重叠的整个小段；不是裁掉重叠部分。松开前紫色预览，右击或 Esc 取消。',steps:['点击已有点、圆心或网格点作为起点，也可按住拖画','在已有点、圆心或网格点松开／再次点击，删除共线重叠小段'],reference:true},
  erasecross:{name:'横截删除',usage:'两次点击或拖画有限参考线，删除 X 相交或共线重叠的整个小段，不删仅 T 接触或共享端点的线。Ctrl 按共用角度组约束；松开前不删除。',steps:['点击参考线起点，或按住左键拖画','点击终点或松开删除；Ctrl 约束角度，右击／Esc 取消'],reference:true},
  replacetype:{name:'按类型替换',usage:'设置来源和目标类型，单击线段或左键拖框，松开后批量替换。框选采用接触规则；单击先找最近线再匹配类型。目标独立于新绘制线型，山谷互换保留折角。',steps:['设置来源／目标，单击线段或拖框；松开替换紫色命中线'],reference:true},
  deletetype:{name:'按类型删除',usage:'设置来源类型，单击线段或左键拖框，松开后删除匹配的小段。框选采用接触规则，不限方向；右击仍为通用取消／删除，不受来源筛选限制。',steps:['设置来源类型，单击线段或拖框；松开删除紫色命中线'],reference:true},
  unselect:{name:'点框撤选',usage:'单击线段或圆周撤选；按住左键拖框，撤选与矩形相交或接触的线段、辅助圆（不限拖动方向）。只改变选区，不删除对象；右击取消正在拖动的框。',steps:['点击线段或圆周撤选，或按住左键拖框撤选'],reference:true},
  selectpolygon:{name:'多边形选择',usage:'依次点击或逐边拖画轮廓，至少三点后点回起点或点击“完成轮廓”。追加命中线段，已有选区保留；仅处理完全在多边形内部或边界上的线段。',steps:['点击轮廓起点，或按住左键拖出第一边','继续点击或逐边拖画轮廓顶点','点回起点或点击“完成轮廓”；也可继续加点'],reference:true},
  selectlasso:{name:'套索选择',usage:'按住左键自由圈画，松开自动闭合。追加命中线段，已有选区保留；仅处理完整在套索内部且不接触轮廓的线段。不吸附网格。',steps:['按住左键开始自由圈画','继续圈画，松开左键闭合并选择'],reference:true},
  selectcross:{name:'划线选择',usage:'点击两点或按住左键拖出参考线，追加命中线段，已有选区保留。命中X相交或共线重叠，不包含T接触和共享端点；参考线不写入作品。',steps:['点击参考线起点，或按住左键拖画','点击终点或拖动松开，选择X相交／重叠线段'],reference:true},
  unselectpolygon:{name:'多边形撤选',usage:'依次点击或逐边拖画轮廓，至少三点后点回起点或点击“完成轮廓”。移除命中的已选线段；仅处理完全在多边形内部或边界上的线段。',steps:['点击轮廓起点，或按住左键拖出第一边','继续点击或逐边拖画轮廓顶点','点回起点或点击“完成轮廓”；也可继续加点'],reference:true},
  unselectlasso:{name:'套索撤选',usage:'按住左键自由圈画，松开自动闭合。移除命中的已选线段；仅处理完整在套索内部且不接触轮廓的线段。不吸附网格。',steps:['按住左键开始自由圈画','继续圈画，松开左键闭合并撤选'],reference:true},
  unselectcross:{name:'划线撤选',usage:'点击两点或按住左键拖出参考线，移除命中的已选线段。命中X相交或共线重叠，不包含T接触和共享端点；参考线不写入作品。',steps:['点击参考线起点，或按住左键拖画','点击终点或拖动松开，撤选X相交／重叠线段'],reference:true},
  moveselection:{name:'两点移动',usage:'先用选择工具选线，再点基准点和目标点，或从基准点拖到目标点。整组选区平移，保留线型与折角；右击取消当前定点，不清空选区。',steps:['先选线，再点击基准点或按住拖动','点击目标点或拖动松开，完成移动'],reference:true},
  copyselection:{name:'两点复制',usage:'先用选择工具选线，再点基准点和目标点，或从基准点拖到目标点。保留原图，平移副本保持原线型与折角。',steps:['先选线，再点击基准点或按住拖动','点击目标点或拖动松开，完成复制'],reference:true},
  movefour:{name:'四点移动',usage:'先选线，再依次点已有端点／交点 A、B、C、D。A 映到 C、B 映到 D，完成平移、旋转和等比缩放；第四点提交。',steps:['先选线，点击已有基准点 A','点击不同的已有基准点 B','点击已有目标点 C（A 将到这里）','点击不同的已有目标点 D（B 将到这里），完成移动'],reference:true},
  rotatecopyselection:{name:'旋转复制选区',usage:'先选线，再点旋转中心。自动以选区离中心最近的点为起始参考，鼠标投影到等半径圆上，整组选区随鼠标旋转，点击落位；原线保留，Esc／右击取消。中心在线上时使用最近的非重合端点作参考。',steps:['先选线，点击旋转中心','移动鼠标查看等半径旋转副本，点击落位'],reference:true},
  copyfour:{name:'四点复制',usage:'先选线，再依次点已有端点／交点 A、B、C、D。A 映到 C、B 映到 D，复制并等比缩放、旋转；原图与折角保留。',steps:['先选线，点击已有基准点 A','点击不同的已有基准点 B','点击已有目标点 C（A 将到这里）','点击不同的已有目标点 D（B 将到这里），完成复制'],reference:true},
  foldableinput:{name:'补线与网格输入',usage:'点已有顶点或网格点 → 选补线方向或暂定终点 → 再点暂定终点确认。也可改点其他终点，或沿当前方向点实际线截止；点回起点取消。输出始终使用当前线型，不保证可折。',steps:['点击已有顶点或网格点作为起点','选择紫色候选，或点击已有点／网格点暂定终点','再点暂定终点确认；点其他已有／网格点重选，或点实际线截止'],reference:true},
  foldabledraw:{name:'自由画线与补线组合',usage:'组合入口：从奇数度已有顶点起笔时进入局部补线候选；从其他点或空白网格起笔时按自由画线处理。补线自动沿用单邻线的山谷与折角；多线交点按已有山谷数量配平。紫色方向为预览，普通线段采用当前线型。',steps:['点击起点；奇数度已有顶点进入补线，否则进入自由画线','补线：选择紫色方向或暂定终点；自由画线：点击／拖动到终点','再次确认补线终点或释放自由线段；右击／Esc取消'],reference:true},
  localflat:{name:'局部平折补线',usage:'已有奇数度顶点 → 选择紫色补线方向（仅一解自动选）→ 实际截止线。只满足局部角度条件，不证明山谷或全模型可折；单邻线延长保留原线型和折角。',steps:['点击已有奇数度折线顶点，不使用空白网格点','点击紫色候选或候选编号选择方向','点击所选方向前方的实际线段或纸边作为截止'],reference:true},
  angleconverge:{name:'角度会聚',usage:'点击已有线身作为基线，或依次点击两个基准点；再点击两组紫色候选的交会处，同时生成两条线。基线不写入，附近已有点优先于线身。',steps:['点击已有基线线身，或点击第一基准点','点击另一基准点，确定两端方向','点击两组紫色候选的交会处，生成两条线'],reference:true},
  angleproject:{name:'角度投影',usage:'基准点 → 起点 → 候选方向上的终点。第三次点击直接投影并生成有限线段；附近实际交点仅在足够接近时吸附，不再要求第四次截止。',steps:['点击角度基准点','点击新线起点（第二点）','点击紫色方向附近的终点位置，确认投影'],reference:true},
  angledrag:{name:'角度拖画',usage:'点击起点后拖放，或再次点击终点。沿共用角度组投影，吸附不能改变指定方向；紫色预览，松开后采用当前线型。',steps:['点击起点，或按住左键开始拖画','再次点击终点，或拖到终点松开；端点保持角度约束'],reference:true},
  angledirection:{name:'定向截取',usage:'基准点 → 起点 → 紫色方向 → 实际截止线。第二点为新线起点，不在选方向时生成贯穿线。',steps:['点击角度基准点','点击新线起点（第二点）','点击紫色候选方向，或使用方向候选列表','点击所选方向前方的实际截止线或纸边'],reference:true},
  offsetparallel:{name:'定距平行线',usage:'选原线 → 两点量距离（可拖画）→ 选左右紫色候选。也可输入距离并点击“使用数值距离”。复制原线长度，不延长到边界，采用当前绘制线型。',steps:['点击有限原线段','点击距离起点或按住拖画；也可使用数值距离','点击距离终点或拖动松开，确定偏移宽度','点击紫色候选或“生成候选”按钮'],reference:true},
  bisectlines:{name:'两线角平分',usage:'依次选两条参考线。相交时从交点到一个截止线；平行时生成等距中线，选择两个实际截止线或生成完整中线。',steps:['点击第一条参考线','点击另一条不共线的参考线','点击截止线；平行时这是第一端','点击第二个截止线，确定中线另一端'],reference:true},
  axiom5:{name:'公理 5',usage:'映射点 A → 目标线 → 必经点 B → 选择候选 → 指定截止或生成整段。折线经过 B，将 A 映到目标支撑直线；不自动猜选多解。',steps:['点击要映射的点 A','点击目标线段（按完整支撑直线计算）','点击折线必须经过的点 B','点击编号按钮或紫色候选选择一个解','点击实际截止线，或“生成所选整段”'],reference:true},
  axiom7:{name:'公理 7',usage:'映射点 A → 目标线 → 垂直参考线 → 选择候选 → 指定截止或生成整段。将 A 映到目标支撑直线，折线垂直于参考线。',steps:['点击要映射的点 A','点击目标线段（不能经过 A）','点击折线需要垂直的参考线','点击编号按钮或紫色候选','点击实际截止线，或“生成所选整段”'],reference:true},
  cycletype:{name:'循环山谷边',usage:'在线段上松开左键，按“边界 → 山折 → 谷折 → 边界”循环；仅修改当前小段，可撤销，不改变新绘制线型。辅助、未指派和平面边不参与。',steps:['点击要切换的小段：边界 → 山折 → 谷折 → 边界；开启边界保护时纸边不可修改'],reference:true},
  fishbone:{name:'鱼骨构造',usage:'可两次点击，也可按住左键拖画基线，松开确定第二点；两点确定基线方向和范围，再确认紫色结果。按网格间距生成垂直线，两侧到首条实际折线或纸边；山谷逐取点交替，基线不写入。',steps:['点击基线起点，或按住左键拖画','点击基线终点，计算等距鱼骨线','核对跳过点及无截止方向，点击“确认鱼骨构造”或紫色线'],reference:true},
  rabbitear:{name:'兔耳构造',usage:'依次点选三个三角形顶点，再确认紫色结果；连接各顶点到内心，三条线均采用当前线型，不绘制三角形外框。',steps:['点击三角形第一顶点','点击不同的第二顶点','点击不共线的第三顶点','点击“确认兔耳构造”或紫色结果线'],reference:true},
  continuous:{name:'连续折射',usage:'点击起点和方向点，或拖画方向基线。可点击“选择终点”，再点紫色路径上的交点或任意位置；也可保留自动截止。勾选“山谷交替”时逐段互换山谷，取消时全部沿用当前新绘制线型。遇到交叉顶点时，唯一局部角度候选自动续接；多个候选可点紫色方向或编号继续。核对后确认；方向点不是终点。',steps:['点击起点，或按住左键拖画方向','点击方向点，计算候选路径','可选择终点并设置山谷交替，然后确认紫色路径'],reference:true},
  transverse:{name:'横截反射',usage:'可两次点击，也可按住左键拖画基线，松开确定第二点；两点定义横截轴 → 确认紫色结果。仅反射端点落在横截轴内部的 T 形原线，到前方第一条非辅助线或纸边；保留原线型和折角，横截轴不写入。',steps:['点击轴第一点，或按住左键拖画','点击横截轴第二点，使原线端点落在轴内部','点击“确认横截反射”或紫色结果线，整组生成'],reference:true},
  reflectionlines:{name:'两线反射线',usage:'原线 → 镜面轴 → 截止线。以两线支撑直线交点为起点，反射指向原线较远端点的方向；等距时取坐标较小端点。最后点击截止线，采用新绘制线型。',steps:['点击被反射的原线段','点击镜面轴线段或纸边（不能平行）','点击紫色反射方向上的截止线段或纸边'],reference:true},
  reflection:{name:'三点反射线',usage:'被反射点 A → 起点 V → 轴上点 B → 截止线。以 V–B 为镜面轴，反射 V→A 方向，从第二点画到所选实际线段；采用新绘制线型。',steps:['点击被反射的方向点 A','点击反射线起点 V（也是轴上一点）','点击镜面轴另一点 B','点击紫色反射方向上的截止线段或纸边'],reference:true},
  mirrorline:{name:'镜像线段',usage:'选择原线段 → 选择轴线段 → 确认紫色副本。按轴的完整支撑直线镜像有限原线，保留原图、原线型和折角；不自动延长。',steps:['点击需要镜像的原线段','点击作为对称轴的线段或纸边','点击“确认镜像”或紫色副本'],reference:true},
  mirrorselection:{name:'镜像选区',usage:'单击线身或拖框接触线段切换选择，重复点／框即取消。端点／交点优先定轴，空白网格点也可定轴；两点后点击紫色镜像区域完成。原图、山谷与折角保留。',steps:['点击线身或拖框切换选择；点到端点／交点／空白网格点开始定轴','点击镜面第二点；不再改变选区','点击紫色镜像区域完成，或点“确认镜像”'],reference:true},
  circledifference:{name:'半径差同心圆',usage:'依次选圆 A、B、C，再确认。新半径＝rA＋rC−rB，圆心沿用 A；允许缩小，原圆保留。',steps:['点击确定圆心和原半径的圆 A','点击要减去半径的圆 B','点击要加上半径的圆 C','确认紫色结果圆'],reference:true},
  circleinvert:{name:'圆反演',usage:'选待反演圆 → 反演基准圆。结果为圆时确认；结果为直线时，再选两条实际截止线，生成辅助线。原对象保留。',steps:['点击待反演的圆','点击反演基准圆','确认结果圆，或选择第一个截止线段／纸边','选择第二个截止线段／纸边'],reference:true},
  lineinvert:{name:'直线反演',usage:'选线段 → 反演基准圆 → 确认结果圆。按线段的完整支撑直线计算，不是有限线段对应的圆弧；过反演中心的直线不重复生成。',steps:['点击确定支撑直线的线段','点击反演基准圆','确认紫色结果圆'],reference:true},
  circleseparate:{name:'分离半径圆',usage:'圆心 → 长度起点 → 长度终点；以后两点距离作半径。测量线只作紫色参考，不写入折痕。',steps:['点击新圆圆心','点击半径长度起点','点击半径长度终点，生成圆'],reference:true},
  circleconcentric:{name:'同心圆',usage:'选参考圆 → 长度起点 → 长度终点。新半径＝原半径＋两点距离，保留原圆；可在圆编辑中缩小半径。',steps:['点击参考圆圆周或圆心','点击半径增量的起点','点击增量终点，生成同心圆'],reference:true},
  circleequal:{name:'等半径圆',usage:'选参考圆，再点新圆心，复制半径生成新圆；原圆保持不变。',steps:['点击提供半径的参考圆','点击新圆圆心'],reference:true},
  circlepair:{name:'双圆外切调整',usage:'选两个不同圆，预览两半径同时增减后的外切圆，再确认。保留原圆，整组一次撤销。',steps:['点击第一个参考圆','点击第二个参考圆','点击“确认双圆”或紫色新圆确认'],reference:true},
  tangentpoint:{name:'点圆切线',usage:'点起点 → 选圆 → 选紫色候选。圆外点连至切点；圆上点沿切线到首条非辅助线或纸边。可用编号按钮确认。',steps:['点击切线起点','点击参考圆','点击紫色候选线或对应编号按钮'],reference:true},
  tangentcircles:{name:'两圆公切线',usage:'选两个圆 → 选紫色候选；只画两切点间的小段。相切退化候选延至首条非辅助线或纸边。',steps:['点击第一个参考圆','点击第二个参考圆','点击紫色候选线或对应编号按钮'],reference:true},
  circle: {name:'两点圆',usage:'点击圆心，再点圆周上一点。紫色为预览，青色为辅助圆，不采用山谷线型、不参与折叠计算。',steps:['点击圆心','点击圆周上一点，确定半径'],reference:true},
  circleradius: {name:'定半径圆',usage:'先输入半径，再点击圆心生成辅助圆。半径单位为 mm，可连续放置。',steps:['设置半径，点击圆心生成圆'],reference:true},
  circle3: {name:'三点圆',usage:'依次点击圆周上三个不同且不共线的点；前两点仅作参考，第三点确认辅助圆。',steps:['点击圆周第一点','点击圆周第二点','点击不共线的第三点，确认圆'],reference:true},
  circleedit: {name:'圆编辑',usage:'点击圆周或圆心选择圆，在上方修改圆心、半径、颜色或删除。空闲时右击圆周也可删除；向右框删完整圆，向左框删圆周相交或接触的圆。',steps:['点击圆周或圆心，或从上方列表选择圆'],reference:true},
  addvertex: {name:'添加顶点',usage:'先点要分割的线段，再点击线内分点。吸附点会投影到原线，保留原线型与折角。',steps:['点击需要添加顶点的线段','点击紫色线段内部的分点'],reference:true},
  mergevertex: {name:'合并顶点',usage:'点击共线分点查看预览，再次点击该点确认。只合并两条线型与折角相同的线段，不改变交叉和 T 形连接。',steps:['点击需要合并的共线顶点','再次点击紫色顶点确认合并'],reference:true},
  polygon: {name:'正多边形',usage:'设置边数和方向，依次点击首边两个端点。预览为紫色，确认后整组采用新绘制线型，可一次撤销。',steps:['点击首边起点','点击首边终点，确认整个多边形'],reference:true},
  extend: {name:'保留原线型延长',usage:'先在线段靠近待延长端的位置点击，再点击目标线段或纸边。保留源线的山谷／边界类型与折角，只沿该端向外延长。',steps:['点击靠近待延长端的线段','点击延长要到达的线段或纸边'],reference:true},
  lengthen: {name:'按当前线型延长',usage:'先在线段靠近待延长端的位置点击，再点击目标线段或纸边。延长结果采用当前工具栏所选的山折、谷折或边界类型，长度截止于实际目标线段。',steps:['点击靠近待延长端的线段','点击延长要到达的线段或纸边'],reference:true},
  trim: {name:'截断线段',usage:'先点靠近要截去的端点，再点击该线内部的截断点；紫色预览为保留部分，另一端不动。',steps:['点击靠近要截去端的线段','点击线段内部的截断点'],reference:true},
  divide: {name:'等分线段',usage:'设置等分数，点击已有小段查看分点，再次点击该段确认。生成真正独立的小段，保留原线型。',steps:['点击要等分的线段','核对紫色分点，再次点击该线确认'],reference:true},
  ratio: {name:'比例分割',usage:'设置正数比例 m:n，先点击靠近起算端的线段，再次点击确认；比值按起算端→分点→另一端计算。',steps:['点击靠近比例起算端的线段','核对起算端和分点，再次点击该线确认'],reference:true},
  midperp: {name:'中垂线',usage:'依次选两个基准点，再点击截止线段或纸边。从两点的中点沿垂直方向画到目标，采用新绘制线型。',steps:['点击第一个基准点','点击第二个基准点','点击中垂线截止的线段或纸边'],reference:true},
  select: {
    name: '选择',
    usage: '单击选择线段、圆周或交点；空白处向右拖实线框，只选完整在框内的线段或圆；向左拖虚线框，也选相交或接触的线段、圆周。拖动已选线段或圆移动；Shift 可追加选择。',
    steps: ['单击选择；向右框内，向左接触也选；Shift 增减选择'],
  },
  erase: {
    name: '擦除线段',
    usage: '单击删除命中的小段或辅助圆；按住左键拖框后松开删除。向右拖框要求完整包含线段或圆，向左拖框删除与线段或圆周相交、接触的对象；遵守边界保护，可撤销。',
    steps: ['点击线段或圆周删除，或按住左键拖出删除框', '向右完整包含，向左接触命中；松开删除，右击／Esc取消'],
  },
  eraseedge:{name:'仅擦除边线',usage:'单击或拖框删除边界线段；拖框向右下只删完整包含，向左上删相交或接触。保护边界开启时不会删除。',steps:['点击边界线段，或按住左键拖框','松开删除命中的边界小段；右击／Esc取消'],reference:true},
  eraseaux:{name:'仅擦除辅助线',usage:'单击或拖框删除辅助线（青色 A）或辅助圆；不会穿透最近的山折、谷折或边界线。向右要求完整包含，向左命中线段或圆周接触。',steps:['点击辅助线或圆周，或按住左键拖框','松开删除命中的辅助线或圆；右击／Esc取消'],reference:true},
  line: {
    name: '线段',
    usage: '点击两点或从起点拖至终点松开；按住 Shift 锁定 45° 方向。',
    steps: ['点击起点，或按住拖画', '点击终点，或拖至终点松开'],
  },
  pan: {
    name: '平移视图',
    usage: '按住左键拖动画布；任何工具下都可按住滚轮拖动，滚轮滚动缩放。',
    steps: ['按住左键或滚轮拖动画布'],
  },
  measure: {
    name: '测量',
    usage: '依次点击两个点，在底部消息读取长度与方向角；不生成折痕。',
    steps: ['点击测量起点', '点击测量终点'],
    reference: true,
  },
  parallel: {
    name: '平行线',
    usage: '点击起点，再点参考线；点击紫色候选线或截止线段／纸边，确认长度。无需预先选择线段。',
    steps: ['点击平行线起点', '点击平行参考线或纸边', '点击紫色候选线，或选择截止线段／纸边'],
    reference: true,
  },
  perpendicular: {
    name: '垂线',
    usage: '点击起点，再点参考线。线外点连接至垂足（允许落在延长线上）；线上点需再点紫色候选线或截止线。',
    steps: ['点击垂线起点', '点击垂直参考线或纸边', '点击紫色候选线，或选择截止线段／纸边'],
    reference: true,
  },
  bisect: {
    name: '角平分线',
    usage: '角边点 A → 顶点 V（起点）→ 另一角边点 B → 截止线段或纸边。',
    steps: [
      '点击角边点 A',
      '点击顶点 V（角平分线起点）',
      '点击另一角边点 B',
      '点击截止线段或纸边',
    ],
    reference: true,
  },
};

export function getToolStep(tool: Tool, pendingCount: number): { label: string; instruction: string } {
  const guide = TOOL_GUIDES[tool];
  const step = Math.min(guide.steps.length - 1, Math.max(0, Number.isFinite(pendingCount) ? Math.floor(pendingCount) : 0));
  return {
    label: guide.steps.length > 1 ? `第 ${step + 1} / ${guide.steps.length} 步` : '当前操作',
    instruction: guide.steps[step],
  };
}


export const TOOL_NAMES = Object.fromEntries(Object.entries(TOOL_GUIDES).map(([id, guide]) => [id, guide.name])) as Record<Tool, string>;
