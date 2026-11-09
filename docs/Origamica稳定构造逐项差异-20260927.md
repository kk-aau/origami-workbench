# Origamica 15.0 稳定构造逐项差异（2026-09-27）

范围以用户提供的 `tmp/Origamica-15.0-reference.nb` 为准：第 31–42 节（197576–258924 行）的镶嵌构造、直接使用的拼块/折后表示，以及第 43–46 节的相邻构造族。章节行号由 `output/original-notebook-notes.json` 复查。每行同时给出可搜索的原版函数名、当前入口文件及验证文件；“已接入”只表示所列**数值子域**有入口和测试，不表示 Mathematica 任意表达式、全参数逐点等价或连续无碰撞折叠。多数原版示例只保存 In 和图形调用，没有数值顶点 Out；这些例子按原式推导、局部几何/等距/层序分级核对，不记作与 Wolfram 数值 Out 一致。

标记：**实** = 保存输入/公式对应的当前数值子域已接入并有专项回归；**限** = 仅列出的子域或只读参考；**缺** = 此原版输入语义尚无等价入口；**外** = 原版已标废弃、未完成或无相应稳定输出，不计必达项。表内路径从 `workbench` 起算，可用 `rg -n '函数名' tmp/Origamica-15.0-reference.nb` 和所列测试复核。

2026-09-30 至 10-10 新增与修正（同一项以最新专项及文末日期记录为准，旧批次记录保留历史状态）：

10-10 材料参考面持续配方：v13保存指定面/恢复默认，按原材料来源重算；保CP/FF存储基底和全部身份，原起始面/默认按钮接入，连续切换复用末尾组，失效轮廓可明确修复并保旧归档。11新测试、194专项、完整2530/1101/7/63、967模块、166界面、38普通/3组三维实际文件通过。见 `P42-材料参考面参数重放-20261010.md`；辅助线生成/编辑持续配方、连续解析引用及其它8类完整缺口继续，免安装包未更新。

10-10 材料折痕属性持续配方验收：v12保存赋型、目标折角、未知角及山谷互换，保原CP/ID/拓扑及原属性/FF规则；完整原边区间跟随前组交点，后续镜像继承属性，直接输入连续调角复用末尾组，空剪切仍可编辑。12新测试、178专项、完整2519/1101/7/63、965模块、392界面、89普通/3组三维实际文件通过。见 `P42-材料折痕属性参数重放-20261009.md`；辅助线生成/编辑、参考面切换等持续配方及其它8类完整缺口继续，免安装包未更新。

10-09 定位移动持续配方：v11记录两点/四点原参考公式、完整材料选区和辅助线，保原CP/FF/所有ID及边界保护；改方式重算后细分，粘贴来源/后续镜像/空剪切历史保持。11新测试、143专项、完整2507/1101/7/63、963模块、307界面、69普通/3组三维实际文件通过。见 `P42-定位移动参数重放-20261009.md`；直接线型/折角与更多辅助线/参考面持续操作、连续解析寻址及其它8类完整缺口继续。

10-09 单线镜像持续配方：v10保存有限源边完整区间、材料/辅助轴来源；交点改变后镜像整条原区间，改轴重算后细分，保原矩阵/赋型/折角和切口身份。新增10项、132专项、完整2496/1101/7/63、961模块、237界面、53普通/3组三维实际文件通过。见 `P42-单线镜像参数重放-20261009.md`；两点/四点定位移动、直接线型/折角持续修改、连续解析寻址及其它8类完整缺口继续。

10-09 剪贴板持续配方：v9保存跨工程独立源面/辅助线与普通或空基底，剪切全部仍可重开参数、恢复和再粘贴；更改粘贴后细分按原面/边重算，依赖删除拒绝。最终前端2486、112专项、959模块构建、159界面、36普通/3组三维实际文件通过，完整后端1101/桌面7/服务63源SHA保持。见 `P42-剪贴板粘贴剪切参数重放-20261009.md`；单线镜像配方、连续解析寻址与其它8类主要完整缺口继续。

10-09 定位复制持续配方：v8保存两点/四点/任意轴参数和完整来源选择，原CP/FF公式不分解取整；A/B/C/D可拖动、毫米输入、预览回填和后组重算。11新测试、165专项、完整2472/1101/7/63、957模块构建、157界面、33普通/3组三维实际文件通过。见 `P42-定位复制参数重放-20261009.md`；剪贴板独立源/空目标、单线镜像配方、连续寻址及其它完整原版域继续。

10-09 镜像参数与逻辑原面：补来源面身份和逐步后代关系，前组镜像后可继续细分；两级细分的子面顺序反转以两端和来源边共同确认，兼容真实旧v7方向侧引用。13新测试、133专项、完整2460/1101/7/63及最终前端2461、955模块构建、181界面、36普通/3组三维文件通过。见 `P42-镜像参数与逻辑原面续接-20261009.md`；定位复制/剪贴板、单线镜像持续配方、连续寻址和其它完整原版域继续。

10-09 单面细分/合并持续配方：v7保存端点、材料侧及完整内边区间，合并传播全部原面来源，跨原部件粘合后线网仍可编辑。18新测试、120专项、完整2447/1101/7/63及最终前端2448、955模块构建、234界面、51普通/3组三维实际文件通过。见 `P42-单面细分合并参数重放-20261009.md`；定位复制/剪贴板、单线镜像配方、连续寻址及其它完整原版域继续。

10-09 材料整片参数复制：v6保存原件及逐份变换，份号/材料与辅助线独立ID保后组引用；增加副本不扰原引用，删除依赖副本拒绝。16新测试、101专项、最终前端2430、954模块构建、120界面、31普通/3组三维实际文件通过。见 `P42-材料复制参数重放-20261009.md`；定位复制/剪贴板、单面插入删除的持续操作、连续寻址及其它完整原版域继续。

10-09 材料参数变换：v5保存移动、旋转、缩放和两种镜像的完整部件来源，复用原CP/FF规则并重算后续组；切开后单片和射线来源通过。14新测试、86专项、完整2414/1101/7/63、953模块构建及56项新界面通过，16组实际普通文件回读通过。见 `P42-材料参数变换与重放-20261009.md`；复制/单面插入删除持续操作、连续寻址及其它8类主要缺口继续。

10-09 切开/粘合参数续接：v4保存完整来源区间、独立切口侧和连接赋型，七种配方混合重算；相邻选定切开区间合并来源，交点移动后解析整条实际后代链；后续射线按来源侧所属部件定位。原版求得FF切开后逐值保位，15新测试、79专项、196界面、41普通/3组三维实际文件、完整2400/1101/7/63及951模块通过。见 `P42-切开粘合参数重放-20261009.md`；当前8类主要缺口见 `Origamica当前剩余范围-20261009.md`，不是8个函数或完成百分比。完整操作栈、连续寻址、高偶度及其它完整原版域继续。

10-09 直线/射线/批量参数续接：加入v3来源边比例引用，实际细分后沿同侧后代边定位，五种配方混合保存/重开/重算；删除依赖来源、分段身份变化和后组重叠明确拒绝，组外修改保归档。18新测试、74专项、221界面、37组普通与3组新三维实际文件、完整2379/1101/7/63及最终2385/950模块通过，见 `P42-直线射线批量参数重放-20261009.md`。复杂端点连续参数寻址、变换/切开/粘合/复制等完整操作栈、高偶度及完整Wolfram余项继续。

10-09 线网/曲线混合参数组续接：闭合线网默认保存节点、边、赋型、固定点及范围配方，可与曲线混合重算后续组；v1保兼容、v2支持混合，JSON/FOLD重开可编辑、删除有预览、失败原子回滚，失效旧配方归档并保当前实际材料。16项新测试、59专项、230项界面、27组实际普通文件与3组实际FOLD/OBJ/STL、完整2361/1101/7/63及947模块构建通过，见 `P42-线网曲线混合参数组与重放-20261009.md`。只完成曲线与闭合线网有序配方，射线/批量轨迹/变换/切开/粘合的完整操作栈、高偶度和完整Wolfram语义仍继续。

10-09 弱材料闭合线网续接：内部/边界/交叉树/孔洞单桥上的闭环、明确范围裁剪、独立纸片和两闭环连接线接通实际CP/分面及三维；有毫米节点、赋型、有效默认草稿和实际/空白反馈，保原FF与未选部件。跨不同面同端点B边的三维关联修复，快照核查保持原角点顺序。23项新测试、67专项、318项界面、28组实际普通文件及新旧三维回读、最终前端2345及完整1101/7/63通过，见 `P42-弱材料闭合线网裁剪与可视编辑-20261009.md`。完整材料操作重放、更复杂域、高偶度和完整Wolfram语义仍继续。

10-09 弱材料直线/射线续接：真实弱切口上的单面/跨面直线、指定侧射线、批量及分段赋型接入实际材料分面；新增明确仅CP，保端点/孔洞/切口身份，完整山折可求平折，F编辑保原FF。受约束模拟回退插入全部源点/线，并独立验证局部/全局材料扇，不直接以区域种子替代切口网格。20项新测试、106专项、280项界面、22组实际普通文件及新旧三维回读、最终前端2322及完整1101/7/63通过，见 `P42-弱材料直线射线与批量构造-20261009.md`。其它弱操作/闭合线网、更复杂域、高偶度和完整原版语义仍继续。

10-09 弱边界三维续接：独立内部/边界/交叉树/孔洞单桥切口、开放 F/M 真实网格接入 CPU/WebGL2。显式逐角边关联保源身份，不用层序面积图代替模拟切口；反向轮廓修复，数值塌缩拒绝。八组 CP 回读、FOLD/OBJ/STL 完整性、244 项界面、68 项专项、最终前端2302及完整1101/7/63通过，见 `P42-弱边界三维网格与动态模拟-20261009.md`。悬空 M/V 数值形变不等于有效刚性平折；更复杂弱域、十度以上编织、任意曲线/非平折操作及完整 Wolfram 语义仍继续，未宣布全目标完成。

10-09 弱边界平折续接：独立B切口和同面F平面线接通刚性位置、原面层序、覆盖/孔洞显示、正背/透视/实体及模型快照重开重算。默认F开放构造可保原版材料所有部件原FF姿态；悬空M/V/U仍仅CP。尖端续线修复后可完成分面并真实折叠纸角。新增内部面积图仅供层序，不替换公开CP/FF/源边；361项界面、49组文件、最终前端2287及完整1101/7/63通过，见 `P42-弱边界平折层序与模型保存-20261009.md`。弱边界动态三维、更多复杂操作、可见色约束及完整原版其它域继续，未宣布全目标完成。

10-09 弱切口续接：切开改用真实逐角有向边，面内孤立边/边界悬空边/交叉树/孔洞单桥可生成身份独立B侧，并按明确配对粘合恢复原CP。v4区分区域几何分析与实际顶点扇身份；切开后建立当前材料参数模型，跨切口曲线的两侧交点分别绑定、同步细分而不焊接。新旧296项实际界面、42组文件、最终前端2274、完整后端1101/桌面7/服务63通过，见 `P42-弱切口切开粘合与跨切口构造-20261009.md`。弱边界平折/层序/三维、其它复杂操作及完整原版其它余项仍未完成；不能以仅CP子域宣称全目标完成。

10-09 自由端点与单桥续接：有限材料开放贝塞尔在明确仅CP时支持面内自由起止、悬空边、交叉树及真实非B单桥。保实际折痕/孔洞、不自动补桥；补齐或明确删除后可按当前完整CP重新计算平折，独立部件保CP根面位置。参数组重开、剪贴板/整片移动/镜像、JSON/FOLD及原普通DXF回读通过；新旧251项界面、31组文件、最终前端2265、完整后端1101/桌面7/服务63。详见 `P42-自由端点与单桥CP构造及补齐平折-20261009.md`。此批只支持同indexed非B双向darts的CP弱绕行；复杂独立B弱切口、任意解析曲线、高偶度、任意非平折/操作栈及完整Wolfram语义余项继续，未宣布目标完成。

10-09 编织仅 CP 采用：原生有限母图在原式、实际 CP 与材料身份独立核对通过后，可以明确仅采用 CP 继续编辑，不携带活动 FF；普通平折采用门禁保持。四组实际文件与 50 项界面通过，完整前端 2247/后端 1101/桌面 7/服务 63，见 `P42-编织仅CP采用与高偶度核查-20261009.md`。高偶度新增各向异性、方纸、聚角、物理尺度负图和根分支诊断仍无十度可用构造；未据此放开门禁或宣布完成。其它完整目标余项继续。

10-09 开放曲线续接：有限开放贝塞尔按真实材料边界/孔洞裁剪，支持完全相连路径和开闭组合；有毫米可视控制点、精确分段加节点/删节点、持续参数组及 JSON/FOLD 重开编辑。九组真实文件及 192 项新旧界面检查，最终前端 2243、完整后端 1101 通过，见 `P42-开放曲线构造与可视节点编辑-20261009.md`。面内悬空端点/自由起点、单桥、任意解析曲线类型、高偶度及完整原版语义继续，不用自动延伸或吸附代替构造。

10-09 参数曲线组续接：从保存材料基底重算已提交闭合曲线，前组修改后顺序重算后组，可预览删除；JSON/FOLD 重开继续编辑。独立配方/几何核对、组外材料修改保护与明确归档重建接通。见 `P42-已提交曲线参数组重构与验收-20261009.md`。有限闭合曲线持续参数化子域已接入，未保存基底的历史、任意材料操作栈、开放曲线、任意非平折及其它全域余项仍未完成。

10-09 跨面曲线续接：有限闭合圆/椭圆/贝塞尔可按参考部件或全部材料构造；精确交点绑定原边，共享折痕同一交点，重合切口/独立纸片保各自身份；实际纸边、孔洞和空白裁剪后统一材料面与FF验证。八组真实文件（含原版材料）、130项界面、最终前端2220及完整后端1101通过。见 `P42-跨面跨材料曲线构造与验收-20261009.md`。补齐上一批闭合曲线的跨面/跨材料子域；开放端点/曲线、弱简单面、持续参数化、高偶度及完整Wolfram语义等余项继续。

10-09 材料曲线续接：本地圆/椭圆和闭合三次贝塞尔可按毫米误差离散成批量材料CP；有真实源曲线、可视控制点、刻度、预览取消、独立重放及历史。六组实际文件逐值回读，最终前端2211、完整后端1101通过，见 `P42-材料曲线批量构造与验收-20261009.md`。这是有限闭合曲线的本地数值子域，不冒充原均匀弧长/任意插值对象语义；跨面/开放曲线及完整Wolfram余项继续。新高偶度14条记录仍无认证CP，生产门禁保留。

10-08 原线网区域续接：通用 Intersectify 自动拆分后新增明确母图区域选择，真实环孔/内部单元孔洞/嵌套独立纸片可构造、采用和导出；`motherSelection`保重算几何戳及角色，原点边/容差编辑后须重拆且不沿用旧编号。四组实际文件、156项界面、完整2203/1101/7/63及最终935模块构建通过，详见 `P42-原线网拆分后区域构造与验收-20261008.md`。补齐上一批“原线网来源环关联”余项；In[3437]冻结合同保留，曲线/触碰环、高偶度等其它完整目标余项继续。

10-08 多环母面续接：有限直线母图新增明确 `ringHoles`（原面/原部件），单个原面可带多个互不接触的简单内环；保源索引，真实孔洞参与原内缩、回展、切口拆分、材料采用和普通导出。方孔/双孔/三角原目标/旧单元孔组合/凹L孔五组真实文件回读通过；层序保真实三角角点，私有J边不作为折叠接缝，前端2199及后端1097通过。详见 `P42-多环母面构造与统一层序验收-20261008.md`。该子域不覆盖曲线、孔洞触碰、单桥/弱简单面或原线网来源上的环关联，高偶度及其它完整目标余项继续。

10-08 嵌套独立母图续接：手工母图新增明确 `nestedSheets:true` 选择，原相互包含的独立轮廓可以进入实际编织、各自固定回展、材料采用和普通导出。孔洞仍由显式 `holeFaces` 定义，可与嵌套独立纸片组合；三组双纸片及一组带孔内纸片实际文件回读通过。最终前端2191、完整后端1091及新增组合专项、933模块构建通过，见 `P42-嵌套独立母图纸片与验收-20261008.md`。任意多环母面、高偶度及完整Wolfram语义等仍未完成，不能用独立纸片语义代替同张纸上的任意孔洞。

10-08 材料闭合线网续接：采用后的材料面内任意合法闭合图已有可視点边编辑、交点拆分、逐边赋型、CP/FF预览、独立重放和一次历史；相交和嵌套环形成真实多环子面，纸张孔洞保留，原CP/FF坐标不动。四组实际JSON/FOLD/普通DXF回读、最终前端2186及933模块构建通过。此入口不补齐母图任意多环语义，也不支持自由端点、单桥/弱简单面；高偶度、曲线批量、非平折编辑及Wolfram完整语义等仍需继续。见 `P42-材料内部闭合线网构造与验收-20261008.md`。

10-08 材料射线续接：原边锚点与方向点的正向射线已有毫米可视编辑、CP/FF预览、仅CP、独立重放及一次历史；穿孔/独立片空白不构造。五组实际JSON/FOLD/普通DXF回读、84项真实界面、最终前端2175及930模块构建通过。高偶度新增22组诊断仍未得到可用CP，生产4/6/8度门禁不变；任意面内自由起点、闭合线网、单桥等余项仍需继续。见 `P42-材料边锚点射线构造与验收-20261008.md`。

| 原版功能 | 本轮已落地的可用行为 | 验证及保留边界 |
| --- | --- | --- |
| 42 材料折痕编辑 | 属性/变换、切开/粘合、单面细分及真正带孔面合并、单条及1–32条批量跨面构造、完整部件复制/阵列、两点/四点复制及移动、镜像选区、跨工程剪贴板和有限材料单线镜像插面已接；保身份、孔洞及活动/参考面，中央重放与正背显示同步。带孔网格已接既有GPU/CPU模拟及三维导出。 | 带孔二维前批2142/1070/7/63及412GUI已验收；本批模拟专项41、926模块构建及79GUI通过，完整检查见 `P42-带孔三维模拟与导出验收-20261008.md`。自由端/曲线批量、自接切口/单桥及原版任意非平折构造编辑仍缺。旧0.13.5不支持新索引/带孔字段，EXE未更新，外部FOLD多环兼容未实测。 |
| 42 材料切口与完整内缩 | 切口采用、工程保存重开、双帧FOLD回读、编辑区再平折和材料模型v3已接；完整内缩以私有辅助点保原13面求得精确2解，切口两侧边按显式关联保留。独立母图已可共同构造、保持各自FF固定面并组合切口。 | 完整内缩及材料增删/切开/粘合见各10-08专项；原平方和非周期/周期已接。新独立母图六组可采用，150GUI和实际JSON/FOLD/普通DXF回读通过，见 `P42-独立母图构造与高偶度核查-20261008.md`。≥10有效编织、母图自身孔洞及未证全域继续。 |
| 45 Ribbon四源带片 | 原cc3／η(s)／σ及raw二维初值，原零母线和非单位初帧保实际输出；空间源与原展开同步。 | Python16／TS10、60位19272严格区间参点及真实30场景／33请求通过。原域与证据分开，无工具滚动；见 `P45-Ribbon四源带片原入口-20261001.md`。 |
| 45 圆锥曲线四参数 | 原fl／fr／hl／hr、左右唯一无穷标签、九规则与四独立域；原None半角孔和双曲线两支不桥接。 | Python6／TS4、16永久来源、80位字面规则与导数；真实33场景／33请求、四域三宽和旧六例回调通过。见 `P45-圆锥曲线四参数原入口-20261001.md`。 |
| 45 六源 `FoldCurvedFold3D/NFoldCurvedFold3D` | 原f2/rL2/rR2六个可编辑源、ui/γi/ffi3/tti3/bbti3五组初值；按原折角ODE与Signκl初帧双向恢复，不单位化母线，保非主值余弦半角分支。原正负圆弧保存入口保持。 | Python13／TS10、十二永久夹具、60位108行／5580严格区间参点及独立DP54通过。真实主App26场景／25六源响应，三宽720双图和全字段无滚动；390两图147.5×78.8125px。latest／JSON下载重开／源unknown／焦线／原初帧均通过。见 `Origamica第45节六源平面曲折恢复三维-20261001.md`；曲线只读，不声称符号／插值／轨迹误差或精确FOLD已等价。 |
| 45 四源空间曲折原入口 | ff3与γ(s)、ς均真实可调，无恢复初值；三维源与二维展开保持原单位母线、Sign／Abs和固定In3966初值。γ=π按字面成功，当前γ=0正则入口限制明确报错。 | Python12／TS10；真实主App23场景／26请求，三宽无滚动、源JSON重开和旧入口回调通过。详见 `Origamica第45节四源空间曲折原入口-20261001.md`。 |
| 45 四种规范可展系统原入口 | Cylinder／Cone／Tangent／General保原表达式、三独立域、三维规范与Cross双图；严格恒等分支，保锥面原未赋值bb门禁及非可展字面输出。 | Python8／TS8、15固定来源及直线退化／实际unknown，真实主App29场景／29请求通过；原视图与规范视图母线单位分别标注。见 `P45-通用规范可展系统原入口-20261001.md`。 |
| 45 四恢复入口原初帧门槛 | 一般展开／重塑、九源展开及六源恢复保原数值初向量；接收容差与初帧Gram数值相容门槛分开。有限EFG通过不能覆盖初帧未相容，形式旗标false且formal条带unknown；源条带与实际图保持。 | Python新增2统一专项及四路真实API通过；三旧入口×三宽共9实际UI场景，六源原初帧纳入其26场景。两旧60位审计扩到165行／2013及114行／1770严格参点；raw reshape独立加密积分差2.286e−15。详见 `曲折恢复原初帧统一核验-20261001.md`。 |
| 42 六／八度有限母图 | 四度原路径保持；原逐角makeverts和addpleat生成六／八个四度CP内点。仅高偶度graph增有界负初值拓扑候选，逐根经反射／展开／CP校验，失败保最深阶段和真实残差。 | 新Python6／TS3及woven47／39通过；永久9例保原V/E/F、完整h、固定F6、None/空周期，CP/FF实际等距。六度30/48/19、八度40/64/25有效，但新例整片层序均no-solution，只读不采用；≥10偶度、普通凹图/切口仍未接。旧四度及In3437输出逐字段不变。最终真实UI44场景、37主App请求及三宽无滚动通过，未采用CP的参数快照实际下载重开恢复。见 `P42-六八度数值母图-20261001.md`。 |
| 45 九源 `FlattenFold2D/NFlattenFold2D` | 空间折痕和左右母线九源直接可编辑，原ui/fi/ti向两端恢复共同平面；保原右q负号及非单位母线。左右可展、共有g、左右有限EFG及source/formal四份条带正则独立显示。 | 新Python11／TS9及服务专项通过，60位1737严格区间点通过；真实主App19个机器记录场景、21请求、九份fixture和三宽720全部无滚动、状态抖动或页面异常。两侧各自可展但g不同保持真实不相容图；焦线、非可展、真实1024预算unknown及tinyD按自身尺度分级。见 `Origamica第45节九源双侧曲折展开-20261001.md`。统一测试另列冻结快照。 |
| 42 In[3437] 原容差母图 | 原22点／13段、两种容差2及原M/V倒置保存为可重算来源，两端核对46点／79边／34面及原索引。保原约353坐标与h=8，不隐式缩放；仅完整合法来源允许原容差产生的已证微凹外边界，普通graph仍保门禁。 | 新Python6／TS4及原woven41／36通过，三宽组件27和真实服务／主App30场景通过；CP172／304／133、整片层序及正背、全79项绝对h、空周期F4、采用下载／重开及改图失效全部已核。见 `P42-In3437-原容差母图来源-20260930.md`。 |
| 45 通用 `FlattenGeneric2D/NFlattenGeneric2D` 与 `ReshapeGeneric3D/NReshapeGeneric3D` | 六个原空间源表达式、非单位母线、全部σ、任意域内初值双向积分；重塑可编辑κn(s)和原ui/bbi/ddi/tti，保源p/q并分开请求／实际初始母线；原圆锥／柱保存模式保留。 | Python15／TS11、60位独立1896区间点严格包含及真实浏览器32分支通过；三宽双图／全部字段无滚动，JSON及最新generation通过。非可展、焦线、区间unknown保真实图并分级；形式相容与尚无全区间误差证明的数值积分分开。见 `Origamica第45节通用可展面展开与重塑-20261001.md`。 |
| 42 有限数值 TGraph 与完整逐边内缩 | 原顶点／边索引、半边发现面序、全部源边独立绝对h、None/空周期、In3437来源及自动拆交点均已接。四/六/八度、凹母面、内部B切口和独立母图可进入原构造与统一材料链；母图和原线网可视点边编辑已有刻度、精确输入与历史。显式内部单元孔洞已接；兼容及原倍率平方和求解均加入完整绕孔回展约束，后者有解析导数、数值独立行求解和全部输出残差检查，保持原B切口语义。 | 非对称孔洞原目标可真实采用、平折、保存重开及普通JSON/FOLD/DXF导出；完整2168/1088/7/63、929模块构建、260GUI及8组公共构造/往返通过。≥10、任意多环母面/嵌套轮廓及未证全域继续；孔洞/周期/内缩任意组合与跨绕数分支也未验。材料任意自由端点/闭合线网等独立余项未由本入口替代。见 `P42-孔洞原目标全局闭合与解析导数-20261008.md`及前批母图专项。 |
| 45 通用 `NConstantWidthScale2D` 原生数值输入 | 可编辑二维 b/d、有向垂距及完整 s 域，按原两维方程和源种子求真实垂足；Sign 在足点 u 而非当前位置 s 计算。垂足可越出原显示域，有限算法求值域单独可编辑；原圆弧模式保留。 | 新 Python10／TS8及60位独立原式审计通过；1593个 cell 端／中点严格包含，位置／导数最大差1.76e−13／5.94e−13。连续简单根、全域垂距、纸带正则分别分级，预算 unknown 保全部真实样本；未证明全局最近足点、Wolfram插值重放或可采用CP。见 `Origamica第45节通用恒宽求垂足-20260930.md`。 |
| 45 通用 `FoldAcrossRight2D/3D/Both` 原生数值输入 | 原二维／三维曲线、左母线及角度函数可编辑，分别按三个原函数计算右母线和完整双侧曲面；左母线幅度保留。Both 不相容仍保源真实双图并报告原因，不暗改源。 | Python9／TS8及60位非圆独立审计通过；Pi半角极点与跨极点角度源明确拒绝，γ大于π的合法原分支仍可计算。有限度量、左右区间正则与尚未认证的全域配对等距分开；不输出精确直线FOLD。见 `Origamica第45节FoldAcrossRight一般原生数值入口-20260930.md`。 |
| 45 通用 `MatchCurvesPair` 原生数值输入 | 新增五条二维/三维源函数、全部 ψ/σ、非均匀共同参数、非零起点和非对称宽度区间；保留原圆弧保存视图。安全源表达式生成真实二维/三维曲面及一阶导数，速度恒等式与完整区间正则性分别验证。 | Python10、TS8专项通过，60位独立原式/Frenet/U′复核全部四ψσ，坐标与导数最大差≤4.57e−16。预算未闭合保留完整真实只读网格并报告 unknown；尚无 Wolfram 插值对象、全局单射、碰撞与精确直线 FOLD 证书。见 `Origamica第45节通用匹配曲线数值入口-20260930.md`。 |
| 45 通用 `NearConstantWidthScale` 原生数值输入 | 可编辑二维/三维基线及同维母线，按原式直接计算近恒宽比例和真实母线；保留负/零宽度与非单位母线，不自动改成另一函数。原保存例仍独立可用。 | Python7、TS7、真实主程序7场景通过；三宽所有字段可见、两图高度至少70px、无滚动，源JSON与非法输入清旧图已验。完整区间证书仅证明比例函数有定义，不替代求垂足的 `NConstantWidthScale2D`、可展性或可采用 CP；见 `Origamica第45节通用近恒宽比例-20260930.md`。 |
| 31 数值公式、`Piecewise`、有限模式与数值 Module | 原安全公式、有限实数字面量模式与局部纯函数保留；Module 进一步支持顺序局部赋值、局部纯函数、Set 定义时取值与 SetDelayed 调用时取值、词法闭包和嵌套局部遮蔽。原三条 F 可放在 Module 中，索引与逐环调用仍生成真实 CP/FF，全部来源原文保存。 | Ring 后端81项、前端22项通过；1000/760/390实际浏览器原完整局部F三模式260/500/241，CP/FF与原路径差0，非恒局部helper与内联最大差≤1.66e-14。覆盖后未使用的错误执行RHS、未用函数自由名/递归/外部元数仍拒绝。完整条件模式、一般命令式/有副作用Module与符号系统仍有限；见 `P01-Ring-二维数值函数.md`、`output/playwright/p31-module-body-report-20260930.json`。 |
| 32 可扩展赋型查询 | 3–64边精确旋转类计数、全部代表迭代器与任意M/V单串查询；容量内实际完整JSON下载，有限界面预览明确标注真实显示数。 | 14算法回归、46实际浏览器检查通过；13边α1°真实下载632项与独立原Union完全一致，64边α36°及居中自包含各完整2项，巨量计数无Number舍入。1000/760/390无滚动；见 `P32-可扩展赋型查询-20260930.md`。 |
| 33 TestTile、TileIndex 与通用数值 Graphics | Point/Line/Polygon/Text、Style/Directive、GraphicsComplex和数值MatrixTransform进一步支持多列表来源，严格保留原式 f[x] 与 f/@x 的不同层级、Listable 位移及二维矩阵左乘；CP放置与FF逐点面映射分别执行。Text锚点、对齐、偏移与方向独立，TilingLine使用原AbsoluteDashing屏幕间距。 | 关联38项、新浏览器8场景及既有6场景通过；普通多列表源与原矩阵放置不相容时仅只读预览，显式“转为共享顶点”后可保存，不冒称转换前后原式相同。GC正背各147真实可见分区，缩放字号/点径/线宽/虚线长度不变；任意Graphics、盒排版与三维图元仍有限。见 `P33-通用二维Graphics数值入口-20260930.md`、`output/playwright/p33-graphics-multilist-20260930.json`。 |
| 34 小尺寸精确多边形 CP | 四种精确数值变体先在局部尺度构造，再恢复来源；后台检查、前端导入及几何编辑均不再因绝对容差丢边或误报共线。编辑 SVG 使用局部单位坐标，精确字段不舍入原值。公有入口固定原版两组褶线与ccw；普通逐块配方按对应居中、Alt或垂直偏置规则确定方向，不能通过自由改山谷伪满足来源参数。 | `10^-3/10^-6/10^-8` 四模式与原点 `10^-14` 保持 CP 拓扑／山谷及平折；非退化门禁保留。小尺寸关联 Python 29 项、前端及来源 15 项通过，独立浏览器拖动／Enter／保存通过；固定来源关联32项及24组新旧CP/层序对照已核（15已解、9旧有无解），旧84边工程及规则保存已解例保持。n=9二色偏置推演旧CP曾自由改型；按源规则接缝局部拒绝，已独立分级记录。见 `Origamica第34节精确多边形小尺寸构造-20260930.md`、`P34-多边形扭转源山谷赋型-20260930.md`。不外推任意非平折多边形。 |
| 36 四边分裂固定山谷、来源固定面与诊断 | 原固定第17面与In[3088] CP/FF诊断保留；两新增线按左右有向扭角、八褶线按中心边和ccw固定，退化无分裂也不再自动改方向。In[3072] 先前V/M接缝结论来自自由改型，已更正为源规则M/M接缝及正偏置片最小扇区同型反例。 | 独立源式192组中接受的28组中心坐标差≤4.996e-16、新增线零差；保存In[2937]及In[3088]不变。In[3088]三面层序闭环仍存在，不开放采用。见 `四边分裂原版山谷规则核查-20260930.md` 和原专项文档。 |
| 37 二色偏置候选源规则更正 | 固定原版ccw=d>0后，n=1及n=8逐片与旧有效CP保持；n=9中间六边的12条褶线原曾全部反向，才让接缝局部通过。现在按源规则返回接缝Maekawa拒绝，撤回旧n=9“局部通过、平折ready、层序无解”结论；母结构入口仍可用。 | n=1与n=8真实整片层序分别无解／已解，n=9在实际接缝(0.65,0.606217783)为M=1/V=1，不计算层序。具名／通用CLI准确拒绝，真实服务HTTP200/200/422后同worker再生成n=8正常；39项关联后端、10项前端与1000×720实际专属控件通过，无滚动、无页面异常。见 `P37-双色偏置n9源赋型纠正-20260930.md` 与 `output/p37-offset-source-http-audit-report-20260930.json`。 |
| 44 参数化等弦椭圆截面（数值原语In[458]/[459]） | 在既有封顶、扭转连接、双连接管截面编辑器中加入3–48点、两半轴、真实极角起相位与整体旋转；上下圈变换/褶皱收缩和来源原值一并保存，两端独立解闭合等弦方程并核对actual点。保留16/24原数组及旧CP拓扑；手工点列清源，普通参数更新保源。 | 新TS7、Python5及原管13项通过；60位9定点包含m48轴比4/a<b/小尺度。27组件及12服务/主App真实browser通过，三family HTTP200、篡改点/源各3个422；采用121边、实际同索引3D、真实工程下载/重开/恢复φθ45、改高度再计算通过。三宽无滚动/异常。两轴.001–1000、max/min≤4、φθ±360，未求得根不冒称全域无解；不宣称全FindRoot或连续无碰撞。见 `P44-参数化等弦椭圆截面-20260930.md`。 |
| 45 In[3992]/[3995] 完整圆弧跨面连续运动 | 默认完整单位宽度有限光滑纸张由平展连续折到保存终态，固定全路径视域；恢复原单位／半单位红绿母线标记。 | 解析逆映射覆盖闭域和每帧，证明等距、正则、全局单射及零厚度无自碰撞；TS/Python 各 6 项、桌面／390 播放与暂停通过。独立多面体 FOLD 的刚体路径、任意空间曲线及纸厚未认证；见 `Origamica第45节圆弧跨面光滑连续运动In3992In3995-20260930.md`。 |
| 45 `CanonicalCylinderDevelopableSystem`／`CanonicalConeDevelopableSystem` | 从固定保存图扩为可调数值函数族：柱半径／轴向斜率、锥半角／顶点高度、原母线尺度和规范裁域均实时重新求值，并同步原输入、规范输出及二维展开；一键恢复保存输入。 | 原实际单位化／投影规则、逐点跨语言回读、完整度量／奇点／有限片标记；TS 11 项、Python 12 项及桌面／390 浏览器通过，24 帧调参无需后端请求。任意纯函数与一般母线方向仍有限，见 `Origamica第45节可调规范柱锥函数求值-20260930.md`。 |
| 45 通用原生曲线关联多带 | 在原式参考与同心函数族之外，新增3–6条可编辑原生x/y函数、q0/q1/γ0、原生参数域及根种子，真实共同参数续接全部2–5带。高阶导数含原生q链式因子，参数化Krawczyk与接缝联合cell/point根包围证明同一连续简单根。 | 新Python9、TS7、旧关联回归通过；502接缝根层/1004点到cell包围及60位参考独立审计通过。1e-6/1e-8加1e9平移的几何由归一化字段保留，世界坐标舍入界限明确。Chrome9场景通过，五带计算中改γ最终为最新结果，390窗实际编辑第六曲线后仍完整五带、无滚动/状态抖动。SPD充分证书不通过时保留全部真实只读带并报告unknown；未证明一般边界交点、退化极限、积分全区间误差、精确FOLD/运动/碰撞，不称原版全部任意函数等价。见 `Origamica第45节通用原生曲线共同参数续接-20260930.md`、`output/playwright/p45-generic-linked-report-20260930.json`。 |
| 45 共同参数关联多带 | 新增共同参数下的同心曲线函数族；3–6条曲线、2–5带、1–3项谐波、正负初始折角及有限区间可调，全部带共用真实边界，不改掉原非零扰动或删掉后三带。二维单纸与三维连续等距方程分别核验；原不等距调用仍可独立复放。 | 新Python9项、关联21项，TS新5项及关联12项；真实二面角／原初值核验拒绝度量相同的伪平面和整体平移；最终Chrome11状态无运行异常，快速变化、存取及390专属弹窗无滚动通过。区间参数包围采用明确的libm误差假设；三维整体碰撞、任意原生曲线、严格积分误差与精确直线FOLD仍有限。见 `Origamica第45节共同参数关联多带续接-20260930.md`。 |

上一阶段完整 `npm test` **2347项全部通过**（前端1546、桌面3、后端758、服务/worker40），覆盖通用续接最终3/4带prefix、等弦椭圆来源、Module及多列表新增回归，全部保存来源/整片层序脚本通过；构建799模块。日志 `output/test-origamica-generic-and-ellipse-20260930.log`、`output/build-origamica-generic-and-ellipse-20260930.log`。此记录不覆盖随后新增的完整逐边内缩、通用匹配和近恒宽数值输入，后续统一结果另记。测试数量不代替原版数值Out或未覆盖功能的等价证明。

上述完整逐边内缩、显式空周期、通用匹配及近恒宽的最终统一验证：`npm test` **2395项全部通过**（前端1566、桌面3、后端784、服务/worker42），所有保存来源和整片层序验证脚本亦通过；新增 Python10/7/9 项均实际列于完整日志中。`npm run build` 成功，806模块。日志 `output/test-origamica-matched-near-full-insets-20260930.log`、`output/build-origamica-matched-near-full-insets-20260930.log`。最终三窗口的真实浏览器分别覆盖55项编织检查、12个匹配构形及失效/原模式、7个近恒宽场景；均无页面错误、控件溢出或工具滚动。

有限 TGraph、通用恒宽求垂足及通用跨右侧曲折的最终统一验证：`npm test` **2442项全部通过**（前端1586、桌面3、后端809、服务／worker44），全部保存来源与整片层序脚本通过；`npm run build` 成功、815模块。日志 `output/test-origamica-generic-width-graph-across-20260930.log`、`output/build-origamica-generic-width-graph-across-20260930.log`。最终真实浏览器覆盖编织35个组件及28个服务／主App场景、恒宽14场景、跨曲折21分支，三宽专属窗口均无滚动、控件溢出或页面错误。主App既有800px最小宽度没有改变，本轮不声称全App支持移动布局。此记录为本批冻结代码验收，2395是上一批历史快照。

通用可展面展开／重塑与 In[3437] 完整母图来源的统一验证：`npm test` **2480项通过**（前端1601、桌面3、后端830、服务／worker46），全部保存来源及整片层序脚本通过；最终 `npm run build`819模块成功。日志 `output/test-origamica-generic-darboux-in3437-20261001.log`、`output/build-origamica-generic-darboux-in3437-20261001.log`。最后严格元数据／永久夹具检查分别复跑TS11／Python6，最终实际API4次回读亦通过；真实UI覆盖展开／重塑32分支、In[3437]组件27及服务／主App30场景。前述2442与2395保留为先前批次的验证快照。

最新镜面序列／专用重塑／非均匀螺旋／十源转换冻结批：`npm test` **2702项全部通过**（1692前端、3桌面、950后端、57服务／worker），生产构建849模块；141真实浏览器场景／111响应，含嵌套图形完整可见及原整数编织坐标回归。机器记录 `output/audits/p45-sequence-special-helix-surface-batch-acceptance-20261001.json`。公开数学系统及其余源合同继续，目标未完成、未打包。

最新Ribbon／Conic冻结批：`npm test` **2617项全部通过**（1657前端、3桌面、904后端、53服务／worker），生产构建837模块；63真实浏览器场景／66响应、源快照绑定。机器记录 `output/audits/p45-ribbon-conic-batch-acceptance-20261001.json`。其余原合同继续实施，未打包。

六源恢复、四源空间曲折与四种规范系统的后续冻结批：`npm test` **2579项全部通过**（前端1643、桌面3、后端882、服务／worker51），`npm run build`831模块成功，四份真实浏览器报告共87场景且源码快照一致。机器验收 `output/audits/p45-native-batch-acceptance-20261001.json` 明确全功能未完成、未打包；该批日志为 `output/test-origamica-native-canonical-space-fold-20261001.log` 和 `output/build-origamica-native-canonical-space-fold-20261001.log`。

九源双侧曲折展开与六／八度母图冻结批的统一验证：`npm test` **2510项全部通过**（前端1613、桌面3、后端847、服务／worker47），全部保存来源、整片层序与显式来源脚本通过；`npm run build`822模块成功。日志 `output/test-origamica-native-fold-even-20261001.log`、`output/build-origamica-native-fold-even-20261001.log`。九源主App19场景／21请求通过；高偶度最终worker真实主App44场景／37请求及九份直接fixture、八份负相位422通过。前述2480、2442为上一批历史快照，后续六源恢复及规范曲面开发不算入此批。

用户本轮新增／纠错范围（不以产品扩展替代原版等价差异）：

| 功能 | 当前可用行为 | 实际验证与保留范围 |
| --- | --- | --- |
| 盒褶编织 CP | 旧正交双线网格改为真实条带母图、反射闭合与逆展开；三选项明确为等距交替／双列成组／三列错位布局，反转整体 M／V。原边界采用必须通过整体层序，线组专属字段错标为其他族时拒绝，旧正常参数可恢复。 | 默认 88／148／61，28 个真实浏览器案例和 42 组规模边界实际层序全部已解；采用／存取／背面／快速调参验过。没有声称任意织物穿插序列或全连续参数证明；真实编织的保真纸边外延尚无规则。见 `盒褶编织CP修复-20260930.md`。 |
| 显式内切纸张 | 外延失败可改内切；正方形、矩形、正多边形逐面裁去外围图样，内部山谷保留，仅新纸边为 B。裁后顶点／面来源、装饰、固定面及真实 FF 重建，旧工程缺省仍为外延。 | 后端纸张 30 项含 90 矩形极值组合；32 案浏览器及最终矩形 5／正 12 边／方纸独立来源、层序、正背与存取通过，1000×720 侧栏无滚动。修复裁剪真实小面被全图阈值误删；前端同尺度预览与后台结果一致且退化／错编号／错山谷仍拒。空间、无效来源及非严格凸源面不套用此入口，不把内切当作任意无解构造的修复证明。见 `内切纸张-20260930.md`。 |

| 节/原版稳定入口与行号 | 状态 | 当前入口与机器可查证据 | 准确差异／下一验收 |
| --- | --- | --- | --- |
| 31 `PolarInt2D`、`RingFunctionGraphics`、`MakeRingTessellation` 197616–198940 | 限、缺 | `backend/tessellation_ring_original.py`、`tessellation_ring_vector_expression.py`、`tessellation_ring_vector_ellipse.py`、`tessellation_ring_vector_fourier.py`、`tessellation_ring_signed_power.py`；`src/components/RingVectorExpressionDialog.tsx`；对应 `backend/test_tessellation_ring_*.py`、`docs/P01-Ring-二维数值函数.md` | 原版逐环传播、椭圆/傅里叶/有符号幂、逐环二维公式及同一条 `pfn[i]`／`rfn[i]` 按索引变化的可区间认证二维数值公式均有入口；光滑安全公式支持 `exp`、严格正值域 `sqrt`。分段函数支持原四参数 `piecewise(g,b,a,c)=b+g²·分支`，新增普通三参数 `piecewise(g,正支,负支)` 的可证明 C¹ 子域：相同基式加含 `g²` 因子的差异项；两支的区间值与导数同时计算，跨接缝取并包围。三参数和简写的 72/136/65 CP、FF 坐标一致，UI 示例与 JSON 回读通过。In[2681] 保存的圆到方形整对公式有一键入口，按解析超椭圆界与专用模式逐点比较。**完整 Mathematica 符号系统、一般非光滑／布尔 `Piecewise`、一般条件定义、有副作用或任意命令式 Module、符号精确性及 Wolfram 逐点 Out 对照仍缺；安全纯函数、有限实数字面量重载、词法数值 Module 的顺序局部赋值及局部纯函数已有入口**；原笔记本 Ring 段未保存分段实例。 |
| 31 原版数值公式语法 In[2675]/In[2681] | 实、限 | `backend/tessellation_ring_vector_expression.py`、`src/app/ringVectorFormulaText.ts`、`ringVectorFunctionDefinitions.ts`、`src/components/RingVectorExpressionDialog.tsx`、`backend/test_tessellation_ring_mathematica_formula.py`、`test_tessellation_ring_local_functions.py`、`tests/app/ringParams.test.ts`、`docs/P01-Ring-二维数值函数.md` | 原 `Sin/Cos/Exp/Sqrt/Sign/Abs[...]`、常数、φ/π、`^` 与相邻因子乘法经白名单归一化后仍进 AST/区间证书。In[2675] 的对角线射线交点核为 `t=(√7−1)/2`；In[2681] 可保留局部F定义及其索引／逐环调用，走同一解析超椭圆通道，20/3 的260/500/241 CP/FF与内联及专用模式逐点一致。原文及定义严格工程回读；有限实数字面量模式与词法数值 Module 的顺序赋值、局部纯函数及Set/SetDelayed已接入；一般条件模式、有副作用或任意命令式的 Module、全 Wolfram Piecewise、完整符号系统及机器可读原版数值 Out 仍缺。 |
| 32 二/三循环临界角、赋型枚举 199175–201514 | 实、限 | `src/app/twistAnalysis.ts`、`src/components/TwistAnalysisDialog.tsx`、`tests/app/twistAssignmentCatalog.test.ts`、`docs/P32-可扩展赋型查询-20260930.md` | 原临界角尺度回归保留；赋型查询扩到3–64边，用BigInt精确计数及完整rotation-only necklace迭代器，完整材料/文件容量100000。13边以上有限预览明确标总数与实际显示数，可查询任意M/V串并导出容量内全部有效/自包含结果，超容量不伪造空集或截断文件。原独立Union回放3–13边全部相同；64边总数288230376218822676，α36°完整有效2类；14测试及46实际browser检查通过，三宽无滚动。普通扭转构造仍3–12边，64边查询不是其构造扩展；局部谓词不替代整片层序、无大边数Wolfram保存Out。 |
| 32 `CircularPolygonTwistGraph2D` 与 CP/FF 绘图 201769–205830 | 限 | `backend/tessellation_circular_twist.py`、`src/app/circularTwistOriginal.ts`、`src/components/CircularTwistDialog.tsx`、`backend/test_tessellation_circular_twist.py`、`tests/app/circularTwistOriginal.test.ts`、`tests/app/circularTwistFlat.test.ts`、`docs/P32圆形扭转层序审计-20260927.md` | 有圆形 CP、严格等距 FF 和标明非物理性的圆化图；按原版 `UnitRegularPolygonVertices[n]`、`m·Csc(π/n)/2` 有 n/m 入口，并按 `UnitTriangleVertices[{A,B,C}]` 有三角角度入口。凸中心多边形范围从 3–12 扩至 3–64 边，13/16/24/32/48/64 边正多边形和 24 边非等角凸轮廓通过几何、局部和严格 FF；64 边浏览器 320/448/129 且层序已解。保存的 n=4、n=6、m=3 及 40°/60°/80° 三角例通过原拓扑、等距、闭合和区域可见面回归。原版隐藏线图无可机比的物理层序表；64 边产品上限和任意轮廓的 Wolfram 全参数逐点对照仍为范围限制。 |
| 33 `TilingStyle/RenderTile`、拼块编号/箭头 206283–210702 | 实、限 | `src/app/tileDecorations.ts`、`src/app/tileColorExpressions.ts`、`src/components/TileDecorationLayer.tsx`、`TileDecorationEditor.tsx`、`tests/app/tileDecorations.test.ts`、`tests/app/flatTileDecorations.test.ts`、`docs/P16-TilingStyle-RGB.md`、`P16-RenderTile-Graphics指令审计-20260927.md` | 二维拼块填充、边/顶点/块号、箭头、文字/边线/填充三种不透明 RGB 规则及可证明相似的折后叠加已接；无参 `TilingStyle[]` 的原版默认三色、固定圆角实线与无描边原版文字已接。支持安全有界的 RGBColor、Hue、GrayLevel、CMYKColor、Lighter/Darker 和具名色表达式，原文与数值一致后回读。四种原版箭头按 In[2836/2838/2840/2842] 绘成边线色实心三角形；In[2862] 的逐边 ±1 **纯方向**可独立于 M/V 编辑并严格回读，旧工程 M/V 线段箭头保持兼容。任意 Mathematica Graphics 指令与符号标签排版仍不等价；保存的 `Opacity[0.5]` 属另一 `CreasePatternGraphics` 输出，不是本项缺失。 |
| 33 `EmbedTile/EmbedTiling/JoinTiling` 207316–208643 | 实 | `src/app/tileSpecs.ts`、`src/components/TileSpecEditor.tsx`、`tests/app/tileSpecs.test.ts` | 位移、旋转、缩放、顶点/反向边对接，保存后按来源顶点和网格严格回读；只限有限数值二维及列出的具名来源。 |
| 33 `PruneTiling/PrunePoly` 208682–209110 | 实、限 | `backend/tessellation_prune.py`、`src/components/PruneControls.tsx`、`backend/test_tessellation_prune.py` | 原版凸轮廓保留相交拼块语义已有参数化入口；容差、临界切触和所有非凸输入未宣称等价。 |
| 33 通用 `TGraph3DAssigned`/`FoldedForm3D` 装饰 209187–209659 | 限 | `src/app/spatialTileEmbedding.ts`、`src/components/TessRigidPane.tsx`、`tests/app/spatialTileEmbedding.test.ts`、`docs/Origamica第33节通用RenderTile三维TObj审计-20260924.md` | 已验证的真实静态 3D 图可在同画布按原版数值规则 XY 平移、绕 Z 旋转和缩放，灰虚线显示原位，按同索引查询 CP/FF；100 面真实 3D 浏览器案例实测 200 条参考边和等距面。原保存源码将二维变换误用于三维顶点，且无具名镶嵌拼块 3D `RenderTile` 分派或保存 Out；通用符号装饰与 Wolfram 输出仍未等价。 |
| 34 `PolygonTwistTile`、居中/Alt/偏置和四边分裂族 211471–221521 | 实、限 | `backend/tessellation_tile_twist.py`、`tessellation_tile_patch.py`；`src/components/TileTwistEditor.tsx`、`SplitControls.tsx`；`backend/test_tessellation_tile_twist.py`、`test_tessellation_tile_patch.py` | 当前可逐块给 w/d/τ/α、M/V 和分裂参数并生成组合 CP/FF；以几何与层序门禁决定可采用，超出数值几何/块数上限及不兼容接缝明确拒绝。 |
| 34 `PolygonTwist*` 五项性质 212845–213585 | 实、限 | `src/app/polygonTwistProperties.ts`、`tests/app/polygonTwistProperties.test.ts`、`docs/Origamica第34节多边形扭转性质尺度与边数-20260927.md` | 五项数值属性在局部单位尺度计算后还原坐标，保存的不规则四边形缩小 10⁻⁶ 后不再误报无效；相似变换、81 组参数及 13/24 边有专项，查询范围与精确多边形单元一致。原版没有数值 Out 可逐点比；后端10^-3/10^-6/10^-8精确CP及极小原点子域已独立核验（见本页第34节最新修正），更广临界参数仍待核验。 |
| 35 `MonolithicEmbedTiling` 和合并选项 221887–222450 | 实、限 | `backend/tessellation_tile_patch.py`、`src/components/TileTwistEditor.tsx`、`backend/test_tessellation_tile_patch.py`、`test_tessellation_tile_t_seam_source_audit.py`、`docs/Origamica第35节MonolithicT接缝源码反例-20260927.md` | 重合完整边删除/保留、共点/共线清理有数值合同。原版 `MergeGraphsData` 仅按完整端点对找重复边，`RebuildPlaneGraph` 也不负责 T 接缝切分；精确三块反例的长短边褶线端点数分别为 2/4，无法直接对应。当前拒绝并给出具体提示；重划同外形八方块的静态候选是另一输入，不冒充原三块 CP/FF。 |
| 36 `UnitRegularPolygonTile`、`UnitTriangleTile`、`UnitRegularStarPolygonTile` 223345、224941、229328 | 实、限 | `src/app/tileSpecs.ts`、`src/components/TileSpecEditor.tsx`、`tests/app/tileSpecs.test.ts`、`docs/Origamica第36节正多边形通用边数-20260927.md` | 单位正多边形具名来源由 3–12 扩至 3–24 边，首边单位长度、拼块组装、编辑和工程严格回读一致；数值三角内角、正星来源保留。24 边是当前面/拼块容量限制，符号角度仍不支持。 |
| 36 正多边形居中/Alt/偏置扭转 223608–224834、In[3079] 侧向双块 | 实、限 | `backend/tessellation_unit_regular_centered.py`、`backend/tessellation_meshes.py`、`src/components/UnitRegularCenteredControls.tsx`、`scripts/verify-unit-regular-general-bound.ts`、`backend/test_tessellation_unit_regular_centered.py`、`test_tessellation_unit_regular_centered_in3079.py`、`tests/app/p36RegularIn3079.test.ts`、`docs/Origamica第36节正多边形通用边数-20260927.md`、`Origamica第36节正方形侧边Alt双块In3079-20260927.md` | n=4 保存双块回归保留；In[3079] 新增可见侧向 Alt 双块预设，n=4/w=.2/α=25°/MMMM-VVVV，CP 24/38/15、FF 闭合 3.69×10⁻¹⁰、整片层序精确 1 解，工程来源严格回读。n=13/16/24 三种单块全 M 的真实 CP、局部、严格 FF 和唯一层序均通过，24 边偏置母图精度修复后闭合误差 3.88×10⁻⁹，未放宽门禁。其他多块/混合 M/V/临界角仍按实际几何与层序拒绝或采用，缺 Wolfram n>12 数值 Out。 |
| 36 多块保存构造 In[3078–3088] 229639–230861 | 实、限 | `src/app/p36In3081Source.ts`、`unitRegularCentered.ts`、`src/components/UnitRegularCenteredControls.tsx`、`tests/app/p36RegularIn3079.test.ts`、`p36In3081Saved.test.ts`、`p36In3088Boundary.test.ts`、`docs/Origamica第36节正多边形侧接双块In3078至3086-20260927.md`、`Origamica第36节多块保存输入In3081至3088-20260927.md` | In[3078–3080]/[3084–3086] 六种三／四／六边侧接双块预设已按原 `JoinTiling` 新片末边接合语义接入，几何、局部和当前层序唯一解。In[3081] 13 块可见逐块入口 CP 84/144/61、唯一层序；In[3087] 四方偏置可编辑预设 CP 36/60/25、唯一层序。In[3088] 正确源顶点顺序下 CP 40/72/33、2D 几何 ready；重建图的 8/9/11 号面正面积重叠且局部约束导出三面层序闭环，故当前层序 `no-solution`、保持不可采用。原版逐块 `FoldedForm2D` 明确只是几何相似示意；整片 `MonolithicTGraph2D` 未保存数值 FF／层序 Out，不能由此断言原公式必然不可折。上述均未证明连续无碰撞折叠。 |
| 36 单位三角形居中/Alt/偏置 225088–226439 | 实、限 | `backend/tessellation_unit_triangle_centered.py`、`src/components/UnitTriangleControls.tsx`、`backend/test_tessellation_unit_triangle_centered.py`、`tests/app/unitTriangleOffset.test.ts`、`docs/Origamica第36节单位三角形偏置扭转-20260924.md` | 保存例按源公式重建；原版偏置角公式与 Out 冲突已保留注记，工作区采用与否由真实层序决定。 |
| 36 `UnitCyclicPolygonVertices` 与单位圆内接居中/Alt 226614–227187 | 实、限 | `backend/tessellation_unit_cyclic_polygon.py`、`test_tessellation_unit_cyclic_general_source.py`；`src/app/unitCyclicPolygon.ts`、`unitCyclicSource.ts`、`src/components/TileSpecEditor.tsx`、`UnitCyclicControls.tsx`；`tests/app/unitCyclicGeneralSource.test.ts`、`unitCyclicPolygon.test.ts`、`scripts/verify-unit-cyclic-general-bound.ts` | 数值 3–24 边母图及单块居中/Alt 扭转的几何、局部条件和逐面平折已接入并严格回读；13/16/24 边六例整片层序均精确 1 解、可采用，四边 In[3042]/[3045] 双块保存例保留。24 边是单面容量，不是原版数学上限。扩展边数没有 Wolfram 扭转 CP 数值 Out；中心外、非凸、符号输入、任意多块排布和整片层序全域不作等价声明。详见 `Origamica第36节圆内接居中扭转通式-20260927.md`。 |
| 36 `UnitCyclicBrocardPolygonOffsetTwistTile` 227225–227538 | 实、限 | `backend/tessellation_unit_cyclic_brocard_offset.py`、`backend/test_tessellation_unit_cyclic_brocard_offset.py`、`src/components/BrocardControls.tsx` | In[3048] 正负偏置五边形双块几何/FF/层序已分级核验；其他 n 和混合边赋型只在数值求解可行时成立。 |
| 36 单位四边形居中分裂/Alt/偏置 228296–229192 | 实、限 | `backend/tessellation_unit_quadrilateral_centered_split.py`、`src/components/UnitQuadrilateralSplitControls.tsx`、`tests/app/unitQuadrilateralSplitSource.test.ts`；偏置在 `backend/tessellation_split_exact.py` | In[3066]/In[3069] CP/FF 保存输入已接，但当前全局层序 `no-solution` 时不可采用；这不是“没有构造入口”。一般四边形参数仅在当前数值子域。 |
| 37 `RegularizePatch`、`PatchVector(s)`、`MakeLatticeTiling` 230928–231593 | 实、限 | `backend/tessellation_lattice_patch.py`、`src/app/patchVectors.ts`、`tests/app/patchVectors.test.ts`、`backend/test_tessellation_lattice_patch.py` | 含负整数格点、1-based 原引用换算、原 j₂ 外层/j₁ 内层顺序；当前块数与面数上限是产品约束。 |
| 37 Archimedean/双色/双均匀/Resch 补片 231621–242406 | 实、限 | `backend/tessellation_archimedean_patch_catalog.py`、`tessellation_uniform_data.py`、`tessellation_resch.py`、`src/components/ArchimedeanPatchControls.tsx`、`TwoColorableArchimedeanPatchControls.tsx`、`scripts/verify-tilespec-patch6-in3182.ts`、`scripts/verify-archimedean-patch1-lattice-in3106-3180.ts`、对应 `backend/test_tessellation_*catalog.py`、`docs/Origamica第37节双三角2x2接缝-20260927.md`、`Origamica第37节Patch6多格Alt接缝反例-20260927.md` | 原版保存补片和有限目录可选；In[3182] 的 3.3.3.4.4 单补片已保留两正三角形/一正方形具名来源与扭转参数，CP/FF/层序分级验证。另把 In[3106] 的 2×2 双三角母格与 In[3180] 的居中褶角配方组合为真实 8 片接缝 CP/FF（64/96/33，层序精确 1 解）；这是两个保存输入的**组合**，原版未保存组合数值 Out。In[3182] 多格 Alt 延伸的横、纵六片接缝存在已固定 `M=1/V=1` 的内部二度顶点，局部必要条件即失败；现会报首个冲突坐标而不绕过门禁。其他复杂接缝、全部排布临界参数和 Wolfram 数值 Out 仍缺。 |
| 37 `TwoUniformPatch[1..20]`、周期向量、2×2 保存排布 In[3197–3275] | 实、限 | `src/app/twoUniformPatchCatalog.ts`、`twoUniformPatchSource.ts`、`src/components/TwoUniformPatchControls.tsx`、`scripts/verify-two-uniform-patch13-in3247.ts`、`docs/Origamica第37节TwoUniformPatch全目录-20260927.md` | 原版 20 个编号均有完整有序 `JoinTiling`、格矢及 2×2 保存输入；工作区用同一来源目录提供 1–20 下拉选择。静态数据与笔记本逐项重抽 20/20 相符，工程严格回读及真实后端 2×2 几何 20/20 通过，最大第 9 项 144 片。13 号四片与 14 号五片等同类平铺保持不同来源。保存例仅展示母结构，无数值 CP/FF Out；局部折叠不适用，层序未检查，不能算折后结构等价。 |
| 37 Cairo/Double Cairo 单元与周期向量 240535–241460 | 实 | `backend/tessellation_cairo.py`、`backend/test_tessellation_cairo.py`、`src/app/tileSpecs.ts`、`tests/app/tileSpecs.test.ts` | 4/8 块母图、底角 δ、晶格向量及本次新增具名 `UnitCairoPentagonTile` 可回读；原版对应保存例只展示 Tiling，不将 Double Cairo 的扭转/FF 虚构为原版必达项。 |
| 38 `JoinTilingPatches` 242444–242918 | 实、限 | `src/app/joinTilingPatches.ts`、`src/components/TileSpecEditor.tsx`、`tests/app/joinTilingPatches.test.ts`、`docs/Origamica第38节JoinTilingPatches-20260927.md` | 全组等比缩放/旋转/平移、展平、保存严格回读已接；原 In[3321] 没数值 Out，只能以保存公式及几何不变量核对。 |
| 38 `GoldbergPatch/Tiling/OffsetTiling` 242946–243202 | 限 | `backend/tessellation_goldberg.py`、`src/components/GoldbergReferenceDialog.tsx`、`backend/test_tessellation_goldberg.py`、`scripts/verify-goldberg-saved-layer.ts`、`docs/Goldberg大偏移Indexify-20260927.md`、`Origamica第38节Goldberg保存例纸面拓扑边界-20260927.md` | In[3323] 单扇区是只读拼块；In[3325] `(7,2)` 和 In[3327] `(8,2,1)` 已生成连续母网格。当前默认扭转候选虽几何／局部通过，整片层序均 `no-solution`，已改为必须层序已解才可采用；原保存输入只是排布。后者上下半片有 3 条完整共边；偏移 4 仅接一点、5 有间隙、0.5 有 T 接缝，均不可直接升格连续纸面。负偏移虽然可有完整共边，原版后续线图函数会以 `badoff` 中止；大偏移只读线图不能伪造可折纸面。 |
| 39 `ShrinkAndTwistParms`、`Dual*`、`MakePrimalDualTwistTessellation` 243441–245737 | 实、限 | `src/app/primalDualParams.ts`、`src/app/primalDualFaceup.ts`、`backend/tessellation_advanced.py`、`tessellation_primal_dual_fold.py`、`src/components/PrimalDualEdgeControls.tsx`、`PrimalDualVisibleFaceControls.tsx`、`backend/test_tessellation_primal_dual_sources.py`、`tests/app/primalDualSource.test.ts`、`docs/Origamica第39节自定义母结构-20260927.md`、`Origamica第39节有向边保存例核对-20260927.md` | γ/α↔ρ/β、后旋转、有限自定义母图及逐条原/对偶边**成对反向**已接。In[3354] 2×2 方格现按原 `OrientedInteriorEdgePairs` 保留输入有向边，24/24 条折痕端点及 B/M/V 均与独立来源算式相合；几何、局部和 LFF 通过；`npm run test:p39-layer` 对真实生成的 24 边图取得唯一全局层序解，并满足 `FaceupFace=3`，当前采用门禁放行。原版 `FaceupFace` 的有符号局部二染色传播种子已与全局顶面约束分开，求解层序后逐条校验。任意 Mathematica 边顺序与 Wolfram 数值 Out 对照仍缺。 |
| 40 Goldberg 原/对偶、Voronoi/Delaunay、Penrose、旋转梯形 246220–248887 | 实、限 | `backend/tessellation_goldberg.py`、`tessellation_advanced.py`、`tessellation_meshes.py`、`tessellation_prune.py`、`test_tessellation_goldberg.py`、`test_tessellation_penrose.py`、`test_tessellation_voronoi_original.py`、`docs/Origamica第40节Voronoi原始种子对偶-20260927.md`、`Origamica第40节Penrose原始对偶精度-20260927.md`、`Origamica第40节Delaunay与旋转梯形保存输入-20260927.md` | 原版 In[3378] 有界 Voronoi 的对偶顶点严格取输入种子并保留面映射，修剪后同步筛选。In[3382] Penrose 原版网格保留 12 位精度，验证后返回源码 a2/o2 对偶点；n=0…7 及半菱形两态有专项。In[3385] 旋转梯形现按每面解析外心生成并验证垂直/正向，旧 m=11 案例最大偏约 0.248；显式对偶编辑仍可投影。In[3386] 径向优先、同径时逆时针定向取代误用的 BFS；保存的 `m=11,rvals={1,2,4},IncludeCenter=False,γ=2,α=20°,CW,FaceupFace=1` 现有独立一键诊断入口，真实后端 99/187/89 的几何与局部通过，LFF 失败、全局层序无解，采用保持禁止（`src/app/primalDualIn3386.ts`、`scripts/verify-primal-dual-in3386-layer.ts`、`tests/app/primalDualIn3386Preset.test.ts`、`docs/Origamica第40节旋转梯形原始对偶保存例In3386-20260928.md`）。另 `IncludeCenter=True` 的 m=11/16 几何和局部 LFF 通过，但层序未验证；m=3 指定参数有赋型约束奇环，维持失败。Delaunay 的凸包和三角外心语义已对照，其他全组合未逐例等价。 |
| 41 `MakePrimalDualFlagstoneTessellation` 248951–250080 | 实、限 | `backend/tessellation_flagstone.py`、`src/components/FlagstoneSourceControls.tsx`、`backend/test_tessellation_flagstone_sources.py`、`docs/Origamica第41节铺石显式对偶来源-20260927.md` | 自定义母图/对偶目标和原版式平行褶线有入口；In[3393] 已垂直且正向的显式对偶目标现在原坐标保留，不再被 MaxMin 二次移动（旧例首点偏差 0.13966364），不可行目标仍作软目标。更改母参数会清除旧目标以防面索引错配，界面文案已校正。`GroupFaces→True` 原函数最后仍返回未分组的 `FoldGraph2DAll`，当前单独面组分析是新增查询；In[3391–3393] 全图仍缺 Wolfram 数值 Out 对照。 |
| 42 线组、`InsetSeparationFn/Plot`、`MakeSimpleWovenTessellation` 251024–256490 | 实、限 | `backend/tessellation_woven.py`、`tessellation_woven_inset_separation.py`、`src/components/WovenControls.tsx`、`WovenSegmentInsetsDialog.tsx`、`src/app/wovenFullInsets.ts`、`src/app/wovenCutTopology.ts`；`docs/P42-完整逐边内缩来源-20260930.md`、`docs/P42-凹母面与内部切口统一验收-20261001.md` | 弦星/随机、全部源边及纸边的独立绝对内缩、周期和分离曲线已有入口；原 In[3429]/[3431]/[3432]/[3434] 四例保留。空周期与None分开，边列表完整绑定真实母边。前三保存例整片层序及正背已核；七角星无层序解不采用。lines/chord/random/graph 保原V/E/F顺序；In[3437]原22点/13段、容差2独立拆成46点/79边/34面，保原大坐标/h8及M/V倒置，生成172/304/133并通过层序及工程往返。四／六／八度有限母图已有有效例；原相邻偏移线公式已支持真正凹母面，四例完整层序已解。内部B切口原FF、材料拓扑、同画布正背面、独立层序、采用、JSON保存重开、CP/FF双帧FOLD回读及材料模型v3已接。完整内缩薄片由私有内部点分片保原13面，五组凹母面均求得精确2解；同端点切口边按逐角关联区分。材料属性、整部件变换及同拓扑可平折坐标编辑已接；切开/粘合及单面细分、简单面内部折痕增删已接；一条直线跨多面已接；多条非共线批量、完整部件复制已接；孔洞面合并、跨工程材料剪贴板/构造复制及非平折编辑仍缺。≥10、母图自身孔洞/断开、原优化未证数值分支、Wolfram数值Out/完整选项及未证域仍需继续；原平方和非周期/周期入口已接。详见 `P42-材料切口工程与层序分片-20261002.md`。 |
| 43 `MoselyBudCrossSectionPt` 与 `MakeRadialPot` 保存例 In[3481]/In[3482]，259745–259886、264454–264654 | 实、限 | `backend/tessellation_mosely_bud.py`、`src/app/radialPotMoselyBudSaved.ts`、`src/components/RadialPotControls.tsx`、`backend/test_tessellation_mosely_bud.py`、`tests/app/radialPotMoselyBudSaved.test.ts`、`docs/P43-MoselyBud保存例-20260928.md` | 原复数椭圆积分在 `0≤r≤1` 的保存实支化为实积分，50 位原主支七个锚点相符；两例各 21 点、m4、ρ0/.3333、赋型阈值30°，各 393/792/400、二维几何与逐面静态等距通过。径向点数上限 12→24 同步保留 600 面预算；1000×720 双例、正背、二维/三维、采用和无滚动验收。小直线段模拟曲线；没有原 Wolfram 数值 Out、连续路径或无自碰撞认证。 |
| 43 `MakeRectangularPot` 光滑保存例 In[3504]/In[3505]，268436–268539 | 实、限 | `backend/tessellation_rectangular_pot.py`、`src/app/rectangularPotSaved.ts`、`src/components/RectangularPotControls.tsx`、`backend/test_tessellation_rectangular_pot.py`、`tests/app/rectangularPotSavedSmooth.test.ts`、`docs/P43-矩形壶体.md` | 原 `Table[{.5 Sin θ,Cos θ−1},{θ,0,π,π/20}]//N` 的 21 点剖面及 m4、ρ0/.3333、法兰余量 .5、赋型阈值30° 已作为一键保存输入；各 425/824/400，几何/静态逐面等距/三维共面及工程读回通过。点数上限 12→24 与 600 面预算独立受检；1000×720 双视图、正背和无滚动验收。只证明静态目标等距，不证明连续路径或无自碰撞，原本无数值顶点 Out 可逐点核对。 |
| 43 `MakeRadialPot` In[3483]、`MakeRectangularPotWedge` In[3489]–In[3494]、`MakeRectangularPot` In[3506]，264765–268653 | 实、限 | `src/app/radialPotSaved.ts`、`src/app/rectangularPotSaved.ts`、`src/components/RadialPotControls.tsx`、`src/components/RectangularPotControls.tsx`、`backend/test_tessellation_p43_saved_remaining.py`、`tests/app/p43RemainingPotSaved.test.ts`、`docs/P43-其余壶体保存输入-20260928.md` | 八个已执行保存输入的原始点列、m、ρ、间隙角、法兰及赋型参数已有一键入口；六个单楔片与整壶体明确区分，In[3506] 保留原 `PotPanels=m−1=7`。八例真实后端分别 81/160/80、30/49/20、25/40/16、28/47/20、21/36/16、19/33/15、26/45/20、117/228/112，逐面静态等距及工程严格读回通过；In[3494] 的两条接缝边按本地 0-based 索引附于来源，非 Wolfram 打印编号。1000×720 浏览器八例、二维／三维、正背与无滚动通过。遮挡不确定时保持线框；原版数值 Out、连续路径与无碰撞均未认证。 |
| 43 `PotCircular` 的 `ArcDirection=CW` | 限 | `docs/P43-旋转对称壶体.md`、`backend/tessellation_radial_pot_cw_query.py`、`src/components/RadialPotCWDialog.tsx`、对应 Python／TS 专项 | 原 In[315] 的 CW 长弧和 `MakeRadialPotWedge` 透传已按源码接为独立只读线图，允许当前有界剖面与圆弧参数，响应严格回读且不返回面或 FOLD。In[3480] 剖面重建 1816 点／1915 边／25 弧，首条约 −345.29°，五扇区旋转的原弧角区间重叠；可采用入口仍拒绝 CW。第 43 节没有显式 CW 保存调用或数值 Out，故无 Wolfram 逐点对照；108 组无可采用例不证明全域不可能，安全纸面子域与任意输入解支仍待证。 |
| 43 `MakeAltMoselyPot` 历史保存例 In[3557]/In[3558]，276467–276933 | 外、限 | `backend/tessellation_alt_mosely_pot_query.py`、`src/app/altMoselyPotReference.ts`、`src/components/AltMoselyPotDialog.tsx`、对应 Python／TS／API 专项、`docs/Origamica第43节交替Mosely壶体历史例-20260928.md` | 所在 `TRotationalPot` 类由原笔记本标 deprecated，但两个展示例有源码定义。已按 `MakeMoselyPot` 正／倒 SplitWedge 原式重建二维交替反射平移与三维旋转抬升；保存默认分别 272 线／160 面、180 线／120 面。独立只读入口可切保存例及有限偶数 m，严格回读，不写工程。默认三维显示间隙 .05、退化轴点、没有可机读 Wolfram 数值 Out；不是精确 FOLD，未认证无自交或可制造。Circle/Closed 外缘、自由剖面和任意选项未接。 |
| 43 `MakeTwistedPot` 固定保存例 In[3521]–[3523] | 实、限 | `src/app/twistedPotParams.ts`、`src/components/TwistedPotControls.tsx`、`TwistedPotSmoothDialog.tsx`、`tests/app/twistedPotSavedPreset.test.ts`、`backend/test_tessellation_twisted_pot.py`、`docs/Origamica第43节稳定保存调用封口清单-20260928.md` | 六点厚剖面 m12、ζ25° 与九点细剖面 m6、ζ−8° 的 Faceted 输入在剖面行一键加载，真实后端分别 156/420/265、132/372/241，静态逐面等距通过；中间 In[3522] 固定 Smooth+Trimmed 参数现在直接打开只读窗口，最大面内距误差约 0.1899，明确非等距且不可采用。双视口无弹窗/右栏新增滚动；无连续路径、自碰撞或 Wolfram 顶点 Out。 |
| 43 `MakeRectangularPot` 默认整壶体保存例 In[3503] | 实、限 | `src/app/rectangularPotSaved.ts`、`src/components/RectangularPotControls.tsx`、`tests/app/p43RemainingPotSaved.test.ts`、`docs/Origamica第43节稳定保存调用封口清单-20260928.md` | 默认五点、m=5、ρ=0、原输入赋型阈值 10° 已有独立一键入口；105/204/100，几何与静态逐面等距、工程严格读回及双视口浏览器通过。原通用默认 0° 阈值仍独立，不伪称同一保存输入；连续路径、自碰撞及 Wolfram 顶点 Out 未证。 |
| 44 `DiscreteEllipseEquilateral`、`TwistJoinedTubes` 保存例 In[3587] | 实、限 | `src/app/joinedTubeParams.ts`、`src/components/JoinedTubeControls.tsx`、`tests/app/joinedTubeParams.test.ts`、`docs/Origamica第44节等边椭圆连接管In3587-20260927.md` | 可见固定来源：24 边黄金比等弦椭圆，顶圈旋转 90° 再左移 3 位，间距 0.2。椭圆残差与 24 弦等长误差 `<10⁻¹²`；当前二维展开／静态 3D 为 104/203/100，逐面等距 `<10⁻⁹`，参数严格回读通过。空间局部山谷及平折层序不适用／未检查，连续刚性路径、自碰撞和原 Wolfram 数值 Out 仍未验证；本轮新增3–48点/两半轴/真实φθ的有界数值来源，进入既有三类截面编辑器，source与点列双端独立核验；见 `P44-参数化等弦椭圆截面-20260930.md`，仍不代表任意FindRoot或Wolfram选支逐点等价。 |
| 44 `TwistJoinedTubes` 矩形对保存例 In[3588]/[3589] | 实、限 | `src/app/joinedTubeParams.ts`、`src/components/JoinedTubeControls.tsx`、`tests/app/joinedTubeParams.test.ts`、`docs/Origamica第44节保存输入完整差异扫描-20260927.md` | 原矩形 1.732×1、顶圈转 60° 再左移一位、`dz=.95` 已有一键预设并可 CW/CCW 切换；两方向严格回读、真实后端 24/43/20 及静态逐面等距通过。In[3589] 来源文字明确说 CCW 自相交；本地尚无空间自碰撞认证，不能把静态等距视作无碰撞折叠。 |
| 44 `TwistJoinedTubes` 默认 30° 方管双方向 In[3584]/In[3585] | 实、限 | `src/app/joinedTubeParams.ts`、`src/components/JoinedTubeControls.tsx`、`tests/app/joinedTubeParams.test.ts`、`docs/Origamica第44节保存输入完整差异扫描-20260927.md` | 现有默认方管入口对应原四点次序、上下圈角度、管高及搭片；新专项对 CCW/CW 两保存调用的真实后端静态逐面等距与参数回读通过。无可机读 Wolfram 数值 Out，连续路径及空间自碰撞未认证。 |
| 44 `TwistJoinedTubes` 偏移圆管 In[3586] | 实、限 | `src/app/joinedTubeParams.ts`、`src/components/JoinedTubeControls.tsx`、`tests/app/joinedTubeParams.test.ts`、`docs/Origamica第44节保存输入完整差异扫描-20260927.md` | 24 边单位圆、顶圈转 175° 后平移 (0.5,0.5)、`dz=.32`、最小赋型角 30° 已进入紧凑保存例选择器；首点、点序、严格读回、真实后端几何和静态逐面等距通过。仍无 Wolfram 数值 Out、连续刚性路径和空间自碰撞证明。 |
| 44 `TwistJoinedTubes` 倾斜圆管 In[3592] | 实、限 | `src/app/joinedTubeParams.ts`、`src/components/JoinedTubeControls.tsx`、`tests/app/joinedTubeParams.test.ts`、`docs/Origamica第44节保存输入完整差异扫描-20260927.md` | 12 边单位圆、顶圈转 90°、`dz=.8`、倾斜轴角 90°、顶面倾角 15°、最小赋型角 30° 已进入紧凑保存例选择器；严格读回与真实后端静态逐面等距通过。连续路径、碰撞及 Wolfram 数值 Out 仍未验证。 |
| 44 `TwistJoinedTubes` 五边双褶皱保存例 In[3590]/[3591] | 实、限 | `src/app/joinedTubeParams.ts`、`src/components/JoinedTubeControls.tsx`、`tests/app/joinedTubeParams.test.ts`、`docs/Origamica第44节保存输入完整差异扫描-20260927.md` | 上下圈由五边形 `PleatReducePolygon` 的 `.8/.4` 生成，上圈旋转 10°，管高 `.5`；可见固定来源和 CCW/CW 切换。两方向均为 48/91/44，二维几何通过、原方程残差 `<10⁻⁸`、静态逐面等距 `<10⁻⁹`。连续刚性路径与自碰撞未验证。 |
| 44 封顶等边椭圆保存例 In[3568]/[3569] | 实、限 | `backend/tessellation_closed_twist_topped_tube.py`、`src/app/closedTubeParams.ts`、`src/components/ClosedTubeControls.tsx`、`backend/test_tessellation_closed_twist_topped_tube.py`、`tests/app/closedTubeParams.test.ts`、`docs/Origamica第44节保存输入完整差异扫描-20260927.md` | 16 边等弦椭圆来源方程残差 `6.7×10⁻¹⁶`；修复中间点镜像双根的错误选支，按既有四边纸面对角距离选支且不增折痕；按原 `TweakFoldAngles` 规则只修正 ±180° 平折的赋型符号冲突。封顶／开孔延伸 .2／-.1 两保存例现均 71 点／121 边／51 面，二维几何与静态逐面等距 `<10⁻⁹`，严格工程读回及真实浏览器一键入口通过。原版临时 Graphics3D 的 CCW 面索引与最终边图不符，本地以最终边图为准；本轮可调等弦来源与工程来源核验另见 `P44-参数化等弦椭圆截面-20260930.md`；连续刚性路径、自碰撞及Wolfram数值Out仍无证明。 |
| 44 封顶管偏心倾斜保存例 In[3567] | 实、限 | `src/app/closedTubeParams.ts`、`src/components/ClosedTubeControls.tsx`、`tests/app/closedTubeParams.test.ts`、`backend/test_tessellation_closed_twist_topped_tube.py`、`docs/Origamica第44节保存输入完整差异扫描-20260927.md` | 新增直接固定入口：原方截面、会聚点 `(0.4,0,0.2)`、法向 `(-0.2,-0.3,1)`、CW、无搭片，未传选项按原版默认延伸 `0`、管高 `1`。严格参数回读、真实后端 19/30/12、逐面静态等距 `<10⁻⁹`；原本只可手工输入。无原版数值 `Out`、连续路径或自碰撞证明。 |
| 44 管状输入示意 In[3573]–[3575]/[3595] | 限 · 只读 | `src/app/tubeSavedInputExamples.ts`、`src/components/TubeSavedInputDialog.tsx`、`JoinedTubeControls.tsx`、`tests/app/tubeSavedInputExamples.test.ts`、`docs/Origamica第44节管状输入示意四保存例-20260928.md` | 四个固定 `*Graphics` 调用现从管状构造可见入口切换；来源的 12 点偏移圆管双方向、16 点等弦椭圆左移 3 位、12→24 褶皱圆管均按原式校核。In[3595] 的 `φ=135°` 仅赋值未使用，真实上圈旋转为 10°，界面明确提示。只重绘输入俯视图，不调用管体求解、不修改参数或工程、不生成 CP／FF；不同于已解的 In[3600]。无原版数值 Out 或碰撞认证。 |
| 45 `CurvedFoldShapePlots2D/3D` 均匀螺旋保存图 In[3957]/In[3958] | 实、限 | `src/app/curvedUniformHelix.ts`、`src/components/CurvedUniformHelixDialog.tsx`、`tests/app/curvedUniformHelix.test.ts`、`docs/Origamica第45节曲折范围与均匀螺旋样例-20260924.md` | 同一保存 `r=1, θ=30°, γ=90°` 的解析/数值形状图已进「形状函数」视图：四图显示三维 κ=3/4、κg=3√2/8、τ=√3/4，二维 κl=κg，两侧母线角 `acos(√(2/5))`、折角 90°；改参实时更新。原 In[3958] 为 Wolfram 32 点插值，本地报告连续解析量，未复刻其插值噪声或可机读数值 Out。桌面和窄屏浏览器验收通过；不把曲带采样当精确 FOLD。 |
| 45 `MatchCurvesPair` / `NMatchCurvesPair` In[3865]/[3868] 及一般原式 | 实、限 | `backend/tessellation_curved_matched_pair_query.py`、`src/app/curvedGenericMatchedPair.ts`、`src/components/CurvedGenericMatchedPairDialog.tsx`、`tests/app/curvedGenericMatchedPair.test.ts`、`docs/Origamica第45节通用匹配曲线数值入口-20260930.md` | 原圆弧保存例及安全半径族保留；新增可编辑一般二维/三维曲线、全部ψσ、共同反向参数、非圆及非均匀参数的有界原生数值入口。速度恒等式按安全符号节点检查，正则性采用完整域区间包围；两侧真实网格、母线及一阶导数独立回读。没有机读 Wolfram Out；原 NMatch 的插值对象/选项、任意 Mathematica 符号系统、全局单射、精确直线 CP、运动和碰撞仍未等价，不把预算 unknown 当数学无解。 |
| 45 `NConstantWidthScale2D` In[3878]/In[3879] 310906–311355 | 实、限 | `backend/tessellation_curved_constant_width_generic.py`、`src/app/curvedGenericConstantWidth.ts`、`src/components/CurvedGenericConstantWidthDialog.tsx`、新 Python／TS 专项、`docs/Origamica第45节通用恒宽求垂足-20260930.md`；旧圆弧专属文件保留 | 通用二维 b/d、安全源表达式、非单位母线、正负及零 w0、非零 s 起点可查询和保存。原两维方程、两对种子、足点 u 的 Sign 与隐函数导数逐点回读，垂足可越出显示域；真实原函数求值，不改成源码未使用的切线外推。全域简单根与距离的 Krawczyk 图、相邻图同根证据和纸带 Jacobian 分开，预算 unknown 保原域全部真实样本。有限算法足点域不足不称数学无解；没有复刻任意 FindRoot／FunctionInterpolation 选项、三维折面或精确FOLD。旧保存圆弧仍可选。 |
| 45 `ReshapeGeneric3D` / `NReshapeGeneric3D` 柱面双向保存例 In[3891]/In[3892]/In[3896]/In[3897] | 实、限 | `backend/tessellation_curved_generic_cylinder_reshape.py`、`src/app/curvedGenericCylinderReshape.ts`、`src/components/CurvedGenericCylinderReshapeDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第45节柱面双向重塑保存例-20260928.md` | 固定 σ=+1 与保存初值，原式常系数 Darboux 方程唯一给出圆柱→平面 `X=(u,v,0)` 和平面→单位圆柱 `X=(sin u,v,1−cos u)`，`u∈[0,π],v∈[0,1]`；源／目标连续度量均 `E=G=1,F=0`、正则面积 1，目标有向法曲率分别 0/+1。只读双视图与桌面／窄屏浏览器验收通过；数值两例的 NDSolve／插值及 Wolfram 数值 Out 未复刻。圆柱弧与平面弦的采样边不等距，未输出精确 FOLD、可采用纸面或运动证书。 |
| 45 `FoldAcrossRight2D` / `NFoldAcrossRight2D` 线性折角圆弧保存例 In[3984]/In[3987] | 实、限 | `backend/tessellation_curved_across_right_linear_angle.py`、`src/app/curvedAcrossRightLinearAngle.ts`、`src/components/CurvedAcrossRightLinearAngleDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第45节线性折角圆弧跨右侧In3984-20260928.md` | 以原式唯一右母线分支重现保存二维输入 `f=(cos u,sin u),rL=-f,γ=u/2`，提供 `0.001≤u≤π/2` 内有界斜率／宽度及只读入口；解析雅可比证明左宽 `<1` 避开焦线、右侧正向局部无焦线。In[3987] 的 64 点是原插值设置，本地按解析式采样，未伪称 Wolfram 数值 Out；该两例缺成对三维初值，故无二维／三维等距、精确 FOLD、可采用纸面。真实浏览器桌面／窄屏验收通过。 |
| 45 `NFlattenGeneric2D` In[3885]/In[3886] 313733–314002 | 实、限 | `backend/tessellation_curved_generic_cone_flatten_query.py`、`src/app/curvedGenericConeFlatten.ts`、`src/components/CurvedGenericConeFlattenDialog.tsx`、`backend/test_tessellation_curved_generic_cone_flatten_query.py`、`tests/app/curvedGenericConeFlatten.test.ts`、`docs/Origamica第45节通用圆锥展开保存例-20260928.md` | 保存圆锥曲线 `bb=(cosθ,-sinθ cos s,sinθ sin s)` 与 `dd=-bb` 在 θ=30°、σ=+1 的双视图已解析恢复：平面 `b=(cos(sinθ·s),sin(sinθ·s))`、`d=-b`，两面同度量 `E=sin²θ(1−v)²,F=0,G=1`；仅 v<1 正则，v=1 锥顶奇异。允许同族 15–60°、有限采样与 v 截短只读推演；无 Wolfram 数值 Out，不含任意一般可展面、精确 FOLD、部署或自碰撞证明。 |
| 45 `ReshapeCone3D` / `NReshapeCone3D` 保存例 In[3902]/[3903]/[3907]/[3908] | 实、限 | `src/app/curvedConeReshape.ts`、`src/components/CurvedConeReshapeDialog.tsx`、`tests/app/curvedConeReshape.test.ts`、`docs/Origamica第45节圆锥重塑保存例-20260928.md` | 展平圆锥 θ=30° 与平面扇区卷锥 β=0.7 均从原 Darboux 常系数式得到同参数三视图；前者两侧 `E=v²sin²θ,F=0,G=1`，后者 `E=v²,F=0,G=1`，β 与目标法曲率一致。10–60°／0.1–1.5 解析变体有局部度量专项和 1000×720 浏览器验收。两例 v=0 均为锥顶奇点，只有 v>0 正则；无 Wolfram 逐点 Out、一般 ODE 输入、精确 FOLD 或运动/碰撞认证。 |
| 45 `NearConstantWidthScale` / `NNearConstantWidthScale` In[3871–3875] 310465–310901 | 实、限 | `backend/tessellation_curved_near_width_query.py`、`src/app/curvedGenericNearWidth.ts`、`src/components/CurvedGenericNearWidthDialog.tsx`、`tests/app/curvedGenericNearWidth.test.ts`、`docs/Origamica第45节通用近恒宽比例-20260930.md` | 保留 b=(u,0)、d=(sin u,cos u)、ws=sec u 的保存二维例及其解析纸带证书；新增可编辑二维/三维 b、d 的原式数值入口、负/零宽度与非单位母线。完整区间验证的是速度与根号严格正，证书分级不沿用保存例的单射/纸带正则性；三维源图仅显示比例结果，不冒称空间折痕。原 FunctionInterpolationAlt 对象/采样/选项尚未复刻，求垂足的 NConstantWidthScale2D 仍为另一未完成通用合同。无精确FOLD或可采用工程。 |
| 45 `ReshapeTandev3D` / `NReshapeTandev3D` 反向保存调用 In[3914]/In[3919] 317962–318931 | 实、限 | `src/app/curvedTangentDevelopable.ts`、`src/components/CurvedTangentDevelopableDialog.tsx`、`tests/app/curvedTangentDevelopable.test.ts`、`docs/Origamica第45节切线可展面平展保存例-20260927.md` | 这两次把正向 In[3913]/In[3918] 的平展目标 b,d 作为新的输入，并以 τ=−1/2、bb(0)=(-1,0,0) 反折；反向三维曲面相对正向源面仅整体平移 (√3/2−1,0,0)，不是第三种内蕴几何。只读双视图现可切换反向，三维坐标按源初值逐点平移、二维保持同一展开；反向平移和基点有专项。原切线可展面在 v=0 奇异，严格等距只在避开此边的局部子域；原版数值插值轨迹未逐点复刻。 |
| 45 `ConicSection2DSystem` 光学保存例 In[4020]–In[4025] 330369–331495 | 实、限 | `src/app/curvedConicOptical.ts`、`src/components/CurvedConicOpticalDialog.tsx`、`tests/app/curvedConicOptical.test.ts`、`docs/Origamica第45节圆锥曲线光学六保存例In4020-4025-20260928.md` | 六个固定输入分别覆盖双焦点椭圆、抛物线、双曲线的两支光学取向；按原二维隐式方程、射线共线和单位方向式独立核验，残差在 1e−12 内。空间构造内可切换六例并逐点检查，严格限于源输入的二维只读曲线及光路；无数值 Wolfram Out、三维折面、精确 FOLD 或可采用工程。 |
| 45 `ConicSection2DSystem` → `NFoldCurvedFold3D` 保存例 In[4034] 331634–331902 | 实、限 | `src/app/curvedConicEllipseFoldIn4034.ts`、`src/components/CurvedConicEllipseFoldDialog.tsx`、`tests/app/curvedConicEllipseFoldIn4034.test.ts`、`docs/Origamica第45节双焦点椭圆三维曲折In4034-20260928.md` | 固定 fl=−1、fr=−2、hl=−1/2、hr=1/2、初始 γ=−60° 与三维正交标架；源先设 u∈[−60°,60°]，随后覆盖成 u∈[0°,120°]。原式消去得 cotρL=cotρR=−sin u/(3+cos u)、γ′=0，数值三维轨迹和二维折面具有相同局部度量，限定横宽 0.5 的只读配对。未复刻 Wolfram 逐点 Out、任意参数、精确 FOLD、连续折叠或可采用工程。 |
| 46 `FlasherSectorDiagFoldLinesX` 保存例 In[4123] | 限 · 只读 | `backend/tessellation_flasher_x_topology.py`、`src/app/flasherXSavedTopology.ts`、`src/components/FlasherXSavedTopologyDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第46节FlasherX棋盘对角线保存例In4123-20260928.md` | 固定 r=3,h=2,m=5,k=0,n=6，按原 `FlasherSectorQuads` 次后主顺序给出 21 条 X：次行 5/3/1、主行 6/4/2，棋盘式 1–3／2–4 分别 11／10 条；全 21 条端点标签和周期缝边已核。此弹窗仅展示原二维 CP 种子，不含已解 CP／FF、山谷、等距或层序，不可采用。独立 X 求解入口见下行，不能混称原版保存 Out。 |
| 46 X 拓扑传入 `MakeFlasher` 选项，In[4128]/[4129]/[4169]/[4193] | 实、限 | `backend/tessellation_flasher.py`、`tessellation_flasher_solver.py`、`tessellation_flasher_candidate.py`、`src/app/flasherParams.ts`、`src/components/FlasherControls.tsx`、`backend/test_tessellation_flasher_x_solved.py`、`docs/Origamica第46节FlasherX静态CPFF数值链-20260928.md` | X 21 条源棋盘斜线进入等距方程和三角面；一键入口取保存拓扑 r=3,h=2,m=5，但 dr=0 与阈值 10° 是**本地选择**，In[4123] 未保存这两项或已解数值 Out。真实生成得 140 点／380 边／241 面、几何通过、逐面边长误差约 2.44e−15；可采用为静态三维等距候选，`layerOrder=not_checked`，不声称平折层序、连续运动或无自碰撞。工程读回及双视口浏览器通过。 |
| 46 `FlasherSectorDiagFoldLinesY/Z` 保存图 In[4125]/In[4127] | 限 · 只读 | `backend/tessellation_flasher_yz_saved_topology.py`、`src/app/flasherYzSavedTopology.ts`、`src/components/FlasherXSavedTopologyDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第46节FlasherYZ对角线保存例In4125In4127-20260928.md` | 固定 r=3,h=2,m=5,k=0,n=6，原四边形顺序为主 12 面（行 6/4/2）后次 9 面（行 5/3/1）；Y 每面取 1–3，Z 每面取 2–4，初始二维种子各 21 条。两型全部端点标签、跨扇区缝边和非零长度已核；桌面／窄屏只读入口通过。既有一般 Y/Z 初始种子与 MakeFlasher CP／FF 求解分别在独立模块，本固定保存图自身不产出已解 CP／FF、赋型、等距、层序、精确 FOLD 或可采用工程。无 Wolfram 数值 Out。 |
| 45 `PlanarCurvedFold3DSequence` / `NPlanarCurvedFold3DSequence` 保存例 In[4039]/[4040]/[4043] 331930–333401 | 实、限 | `backend/tessellation_curved_planar_reflection_sequence.py`、`src/app/curvedPlanarReflectionSequence.ts`、`src/components/CurvedPlanarReflectionSequenceDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第45节平面镜像曲折序列保存例In4039-4043-20260928.md` | 四镜面圆锥（ComposeReflections=True）、两平面圆柱（False）及圆锥数值调用的三组固定保存输入可在只读入口查看原面、反射后连续曲带和二维展开。由原镜像递推解析得圆锥切线 v=[0,secθ,2cos10°/(cosθ cos10°−sinθ sin10° sin u),3cos10°/(cosθ cos10°+sinθ sin10° cos u),4secθ]，圆柱 v=[0,cos u,1+cos u,3]；全域严格有序，相邻曲带共用折痕，二维／三维第一基本形式分别同为圆锥 `(v²/4,0,1)`、圆柱 `(1,0,1)`。圆锥 v=0 为锥顶奇点；In[4043] 只重演源公式，未复刻 `FunctionInterpolationAlt` 或 Wolfram 数值 Out。桌面／窄屏浏览器通过；无精确直折痕 FOLD、赋型、层序、运动或碰撞证书。 |
| 45 `NFoldAcrossRight2D` → `NFoldCurvedFold3D` 变角圆弧保存例 In[3988] 327136–327366 | 实、限 | `src/app/curvedAcrossRightRefoldIn3988.ts`、`src/components/CurvedAcrossRightRefoldIn3988Dialog.tsx`、`tests/app/curvedAcrossRightRefoldIn3988.test.ts`、`docs/Origamica第45节变角圆弧二维反折三维In3988-20260928.md` | 原固定 f=(cos u,sin u)、左母线向内、γ=150°(1−0.9999u/(π/2))、u∈[0,π/2]、空间初值 (F,T,B)=((1,0,0),(0,1,0),(0,0,1))；原式唯一右母线 (aT−tan(γ/2)L)/√(a²+tan²(γ/2))，a=1.6665，三维曲率 sec(γ/2)、挠率 a/2。只读双视图截宽 0.5，解析保证左侧避开 v=1 焦线、右侧正向无焦线，逐侧二维／三维第一基本形式、可展性和有向折角专项通过；末端仍为 0.015°，并未恰好展平。真实桌面／窄屏浏览器通过。原 64 点插值和 Wolfram 数值 Out 未复刻；无精确 FOLD、赋型、层序、运动、自碰撞或可采用工程。 |
| 45 规范柱面／锥面保存例 In[3826]/In[3830] 304924–305502 | 实、限 | `backend/tessellation_curved_canonical_cone_cylinder.py`、`src/app/curvedCanonicalConeCylinderIn3826.ts`、`src/components/CurvedCanonicalConeCylinderDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第45节规范柱面锥面保存例In3826In3830-20260928.md` | 按原 `CanonicalCylinderDevelopableSystem` / `CanonicalConeDevelopableSystem` 固定输入核原始直纹线、单位母线和柱面垂直投影；柱面规范面 `(cos u,sin u,v)` 与本地展开 `(u,v)` 同度量 `(1,0,1)`，锥面规范面与本地扇区展开同度量 `(v²/4,0,1)`，锥顶 `v=0` 奇异。只读原输入、规范三维及本地推导二维三视图；原输入与规范输出有限母线区间不同。该规范化 API 不等同现有柱／锥重塑；无 Wolfram 数值 Out、精确 FOLD、赋型、层序、运动或自碰撞。桌面／窄屏浏览器通过。 |
| 45 规范切线／一般可展面 In[3833]/[3834]/[3837]–[3839] 305519–306774 | 实、限 | `backend/tessellation_curved_canonical_tangent_general.py`、`src/app/curvedCanonicalTangentGeneralIn3833.ts`、`src/components/CurvedCanonicalTangentGeneralDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第45节规范切线与一般可展面In3833-3839-20260928.md` | 两个 θ=30° 螺旋切线面保存图分别裁成 v≥u 单支和保留 v<u／v>u 双支；通用规范化的柱、锥、切线面三固定输入由 B₁=B₀+uD₀ 恢复原规范基线。局部 3D 与本地推导 2D 同第一基本形式：切线面 `(¾(v−u)²,0,1)`、柱面 `(1,0,1)`、圆锥 `(v²/4,0,1)`；切线面 v=u 为回归边、圆锥 v=0 为顶点，原画图塌缩区不当正则片。五例三视图入口、源规则/双支/奇点专项及 Chrome 桌面/窄屏通过。原输入与规范输出有限片不同；无 Wolfram 数值 Out、通用任意输入符号求解、精确 FOLD、赋型、层序或运动/碰撞认证。 |
| 45 `KnotData["Trefoil","SpaceCurve"]` → `NSpaceCurveFold3D` 保存例 In[3944] 321864–321945 | 实、限 | `src/app/curvedTrefoilSavedIn3944.ts`、`src/components/CurvedTrefoilSavedDialog.tsx`、`tests/app/curvedTrefoilSavedIn3944.test.ts`、`docs/Origamica第45节三叶结空间曲折In3944-20260928.md` | 两份直接打印 Mathematica `KnotData` 求值的独立记录给出同一明确曲线 `(sin u+2sin2u,cos u−2cos2u,−sin3u)`，按原 γ135°、σ+1、u∈[π/3,7π/3] 还原闭曲线、两侧单位母线方向，以及原两张形状图的 κ／κg／τ、ρL／ρR／γ。全域速度与 Frenet 曲率有代数正下界，局部可展有专项；1000×720、760×720 浏览器无滚动且关闭画布不变。没有通过有限宽度全域焦线门禁，故不绘成纸带，不生成二维展开、FOLD 或可采用工程；笔记本无数值 Out，Wolfram 插值、运动与碰撞未验证。 |
| 45 前段曲率／标架四保存例 In[3793]/[3794]/[3796]/[3797] 299637–301008 | 实、限 | `backend/tessellation_curved_early_darboux_saved.py`、`src/app/curvedEarlyDarbouxSavedIn3793.ts`、`src/components/CurvedDarbouxNormalSavedDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第45节前段曲率标架四保存例In3793In3794In3796In3797-20260928.md` | In[3793] 固定 `S=(x,y,x²+3y²)`、α30°、t₀=.15、向量长 .1，源叠画的 Frenet/Darboux 标架拆成同几何双图；In[3794] 两单位圆柱的交线 `F=(1−cos t,sin t,1−cos t)` 严格属于两面，两端曲面相切但曲线仍正则；In[3796]/[3797] 同二次面 `S=(x,y,(x²+2y²)/2)` 的参数直线／旋转抛物线共用双图，后置固定绘图参数给 t=0 的 `(κg,κn,τg)` 分别 `(0,5/4,√3/4)`、`(2,5/4,√3/4)`，与前置符号 Print 分开。源导数、正交、Darboux 微分方程、曲率与曲面正则专项各 5 项及 Chrome 桌面/390px 通过。无可机读 Wolfram 数值 Out、精确 FOLD、纸张展开、赋型或层序。 |
| 45 广义柱面曲线 Frenet／Darboux In[3795] 300222–300454 | 实、限 | `backend/tessellation_curved_darboux_normal_saved.py`、`src/app/curvedDarbouxNormalSavedIn3812.ts`、`src/components/CurvedDarbouxNormalSavedDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第45节正弦曲线FrenetDarbouxIn3795-20260928.md` | 原 `S(x,y)=(x,y,1−cos y)`、`F(t)=S(cos t−1,t)`、`t∈[−1,1]`，在 `t=.5` 画长度 .3 的 Frenet 与 Darboux 双标架。连续曲面第一基本形式 `(1,0,1+sin²y)`、面积因子≥1，曲线正则且曲率非零；解析 κg(.5)=0.4487120503、κn(.5)=0.5421246987、τg(.5)=−0.2343659361 是源式推导值，不是 Wolfram 数值 Out。双图只读、源微分定义/正交/曲率专项及 Chrome 桌面/窄屏通过。显示网格不是纸面证书；无展开、赋型、层序或精确 FOLD。相邻四例已共用同一入口的独立诊断分组。 |
| 45 Darboux 恢复／直纹法向 In[3812]/[3816]/[3818] 303385–304720 | 实、限 | `backend/tessellation_curved_darboux_normal_saved.py`、`src/app/curvedDarbouxNormalSavedIn3812.ts`、`src/components/CurvedDarbouxNormalSavedDialog.tsx`、对应 Python／TS 专项、`docs/Origamica第45节Darboux恢复与直纹法向In3812In3816In3818-20260928.md` | In[3812]/[3816] 的同一 ds=1、sdκn=1、sdκg=sdτg=0、标准初值源 ODE 有闭式 C=(sin u,0,1−cos u)、正交 Darboux 帧；本地 512 步 RK4 只重演 In[3816] 方程，不冒充 Wolfram 插值。In[3818] θ=45° 直纹双曲面在保存 u∈[−π/2,1.4π],v∈[−1,1] 上面积因子 √(½+v²/2)，± 法向严格相反且全域正则；det(B′,D,D′)=−1/2，明确不可展。三个固定例只读双图、专项与 Chrome 桌面/窄屏通过；无可机读 Wolfram 数值 Out、精确 FOLD 或可采用纸面。In[3800] 保存比较图的两条表达式均引用解析 `dsys`，不计数值对照。 |
| 43–46 壶体、管、曲折、Flasher 258925–352152 | 限 | `src/components/TwistedPotControls.tsx`、`TwistedPotSmoothDialog.tsx`、`CurvedUniformHelixDialog.tsx`、`CurvedLinkedFirstBandDialog.tsx`、`CurvedCirclePolyhedralControls.tsx`、`backend/tessellation_twisted_pot.py`、`tessellation_twisted_pot_smooth_query.py`、`tessellation_curved_linked_zero_chain_query.py`、`tessellation_curved_p45_linked_chain_query.py`、`tessellation_curved_linked_first_band_polyhedral.py`、`tessellation_curved_uniform_helix.py`、`tessellation_curved_circle_polyhedral_candidate.py`、`docs/Origamica第45节圆弧跨面多面体纸张-20260927.md`、`Origamica第45节关联同心圆首带等距多面体-20260927.md`、`Origamica第45节关联同心圆保存五曲线数值图-20260927.md` | 非平面族已有多个受限输入和独立验收；In[3992]/[3995] 圆弧跨面保存例及非零扰动关联同心圆**首带**有真实单纸 CP／同索引静态 3D 的等距多面体近似，均不冒充原光滑曲面或完整五折整串。In[4086] 有**五曲线与四片直纹面只读有限数值图**，原函数 `InterpolationPoints` 可在本地调 8–128，默认 32，曲线默认 100 段／母线 50 段；非默认值标为数值试验，按请求重新求根和四次样条。端点外推与分辨率敏感已标明，不导出纸面或平折。Flasher 的 r·h=9、dr=0 已接。径向 PotCircular 的 ρ=±1 通过局部等距门禁；扭转壶体 Smooth 保存例作为非等距只读参考。零扰动四带仍只读且有空间端边接触；原保存非零扰动第二带有内蕴等距反例。本轮另接入可编辑原生函数的共同参数2–5带续接及分层证书，只读结果与原保存错误公式分开；仍无精确直线FOLD可采用整链，不能据此宣布整个笔记本完成。 |
| 46 六角 `HexFlasherGraph3DAssigned` 保存调用 In[4197]/展示 In[4199] | 实、限 | `src/app/flasherParams.ts`、`src/components/FlasherControls.tsx`、`backend/test_tessellation_flasher_candidate.py`、`tests/app/flasherParams.test.ts`、`docs/Origamica第46节六角Flasher保存例In4197-20260928.md` | 原固定 r=2,h=2,m=6,dr=.05、Z 对角线、10° 阈值现有一键入口；复用已接 `MakeFlasher` 求解器，真实生成 90 点／234 边／145 面、二维几何通过、静态三维逐面等距。`layerOrder=not_checked`，仅作可采用的静态空间候选，非原版 In[4199] 逐点 Out 或已解平折层序。 |
| 46 深碗抛物面 `MakeParaboloidalFlasher` In[4208] 351644–351712 | 实、限 | `src/app/paraboloidalFlasherParams.ts`、`src/components/ParaboloidalFlasherControls.tsx`、`backend/test_tessellation_paraboloidal_flasher_candidate.py`、`tests/app/paraboloidalFlasherParams.test.ts`、`docs/Origamica第46节Flasher保存输入封口清单-20260928.md` | 原未剪 r2/h3/m6/f5/dr.2/Y/20° 的 DP/FF 126/342/217 逐面等距，但竖直投影非平面纸张；一键入口明示另加**本地剪后阈值 10°**，衍生展开候选 222/438/217 通过几何与静态等距门禁、可采用，层序 `not_checked`。不能把剪后拓扑称为 In[4208] 保存 Out。第46节其余保存输入及独立只读缺口见封口清单。 |
| 46 首扇区标签图 In[4131]/[4132] 与高焦距未剪图 In[4206] | 限 · 只读 | `src/components/FlasherP46ReadonlyDialog.tsx`、`src/app/flasherP46ReadonlyData.json`、`scripts/generate-flasher-p46-readonly.py`、`backend/test_tessellation_flasher_p46_readonly.py`、`tests/app/flasherP46ReadonlyData.test.ts`、`docs/Origamica第46节最终只读保存图In4131In4132In4206-20260928.md` | r4/h1/m5/k0 的 Y/Z 源首扇区各有 49 基础折线、16 对角线、30 标签，均为理想 CP 种子；f=10⁶ 的未剪 DP/FF 本地求解为 60 点／156 边／97 面、逐面误差约 1.33e−15。高焦距剪后单纸被几何门禁拒绝；三图只读、不可采用，无平折层序或 Wolfram 逐点 Out。双视口各 11/11、无新增控件上下滚动，关闭后工程参数不变。 |

| 原版状态项 | 源位置 | 判断 |
| --- | --- | --- |
| `PrimalDualUnsafeTwistAngleRange` 标注 `IN PROGRESS`/`TBD` | 243751–244102 | 原版未定稿；记录研究项，不计稳定交付数。 |
| `Twist-specific rendering`、旧梯形、兼容旧 Monolithic 装饰标 `deprecated` | 202308、227544–228103、222508–223113 | 历史行为可留回归，但不算未完成稳定构造。 |
| `MakeSimpleWovenTessellationOld` 旧版 | 256491–258924 | 新版已有独立原版入口，旧版不重复计数。 |

**仍未闭合的等价差异**（按实际源接口区分，不重复列已完成输入）：

| 范围 | 具体剩余职责 |
| --- | --- |
| 第45节通用曲折 | 通用关联多带、MatchCurvesPair、近恒宽、求垂足、跨已有曲折、一般可展面展开及重塑、九源双侧FlattenFold、六源FoldCurvedFold3D、四源FoldSpaceCurve3D与四种Canonical原生数值入口均已接入并完成真实GUI验收。RibbonPair四源和ConicSection2DSystem四参数也已完成2617项冻结批及真实GUI验收；专用ReshapeCone／ReshapeTandev、非均匀Helix完整参数、六源PlanarSequence镜列表和十源FoldSurfaceToCone／Cylinder也已完成2702项冻结批及141真实GUI场景；公开数学系统helper与其它真实余项继续实施。原ToCone symbolic／N单位化职责与MatchCurveSpeed平方速度ODE均须保字面差异。原N插值对象／选项与数值ODE轨迹区间误差仍未等价／认证。 |
| 第45节全域证据 | 关联续接的负速及退化极限、一般边界交点、严格全区间积分误差、共同纸张的精确直线 FOLD；已认证圆弧跨面族之外的一般全局运动/三维碰撞仍缺。已有独立只读网格不冒称这些证书。 |
| 第42节有限母图 | 完整逐源边/边界内缩、显式空周期、原V/E/F、四／六／八度有限母图、In[3437]原容差来源以及通用线网自动拆分已接。新增真正凹母面按原相邻偏移线相交，四例整片层序已解；内部B切口保留分片拓扑、原FF相对位置，支持同画布正背面、独立层序及双帧FOLD导出。切口采用/保存重开/再平折、材料快照v3及双帧FOLD导入已接；全逐边h例保原13面求得精确2解，并行切口层序按显式关联保留。材料赋型/目标角、整部件变换和可重新平折的同拓扑坐标编辑已接。非周期及原周期平方和数值入口、相位顺序/Drop末项和活动下界KKT诊断已接。切开/粘合、单面细分和简单面内部折痕增删已接。一条直线跨多面统一构造已接。仍缺：多条非共线批量拓扑、孔洞面合并、跨工程材料剪贴板/构造复制、非平折中间态编辑（完整部件复制/阵列已接）、≥10偶度、原优化的病态/冗余约束与全部数值分支、母图自身孔洞/断开及未证域。详见 `P42-材料切口工程与层序分片-20261002.md`。算法失败不等于数学无解。 |
| 第36节来源冲突 | In[3088] 当前源重建的三面层序闭环及其他临界参数；保留原山谷，不用自由翻转赋型绕过门禁。 |
| 第31/33节源语义 | 完整 Mathematica 符号语义、任意 Graphics/TObj/盒排版及缺失的机器可读 Wolfram Out；目前有限安全表达式/数值图元与源公式核验不能代替整个符号运行时。 |
| 数值容量与临界域 | 各入口的有限容量、区间预算和未证明的临界参数域；unknown 与数学无解区分，新增入口不构成无条件全域等价。 |

第33节保存源码没有具名拼块三维 `RenderTile[...,TGraph3DAssigned]` 分派或数值Out，不把想象的通用分派列为稳定保存例。第36节保存输入已扫描到章节结尾，第37节双均匀1–20母图逐项接入；P39 `FaceupFace`、成对边方向的In[3354]保存例已核对。P38大偏移线图没有连续二维桥接面，第45节保存曲折链还存在精确不等距反例；均不能据原保存绘图解锁采用。当前继续完整目标，未打包，不把“限/缺”写成“全部实现”。


## 2026-10-01 用户暂停与 v0.13.1 打包快照

用户明确要求“暂停，并打包”，goal 已 paused，三个子线程停止写入。原完整范围保留，未计全部复现完成。详见 v0.13.1暂停快照-20261001.md。

根线程随后完成的 MatchCurveSpeed 原入口已有 Python7／TS4／真实服务1 专项通过，独立 DP54 双向回读与70位平方速度积分一致；42真实浏览器场景／39响应，8维三宽无滚动，JSON保存重开及迟到读取→编辑／新JSON／关闭竞态通过。原 c2(f(s)) 通常与 c1 不同速，原方程未修正，实际速度差单独显示。

通用曲面与七类曲线辅助系统尚未接主入口，保留开发稿，不计公开功能完成。编织内部 B 切口暂阻止进入普通单纸平折与采用流程；其完整前端呈现和层序隔离、高偶度及自动拆分仍需继续。打包完整测试与启动验证以 release/验收-v0.13.1-20261001.json 为最终证据。


## 2026-10-01 恢复开发：公开系统、双变量曲面与自动拆分

用户明确要求“恢复构建镶嵌功能目标”，已继续实现原完整范围；未创建重复目标，未宣称全部复现完成，未重新打包。目标工具卡仍为 paused，当前工具没有恢复接口，自动续跑需由用户在目标卡恢复；本批开发与验收已实际完成。

| 本批范围 | 结果 |
|---|---|
| 七类公开曲线／恢复系统 | 原数值API与GUI接入，保raw初值及RecoverDarboux参数系数；49真实主App场景／54响应，七模式三宽无工具滚动。 |
| 双变量曲面与独立法向 | 三个双变量源、混合jets、基本形式／曲率／原UV和三维主方向；正反法向独立。修复零根式、tiny数值、病态参数及忙时重试；最终22真实主App场景通过。见 `P45-双变量曲面与公开曲线系统-20261001.md`。 |
| 编织原线网自动拆分 | 两种原容差、保原边归属及来源，改参数清旧绑定；23真实组件场景及3主App生成／重开场景通过。修复真实后台占用时的可取消重试。见 `P42-通用线网自动拆分验收-20261001.md`。 |
| 一般离散化 | 三类后端独立内核及17回归完成，保重复key／乱序参数／无递增约束原根方程／raw倍率；独立审查修复展开预算漏计和超大整数错误合同。中央API、TS回读和GUI仍未接。 |
| 统一验收 | 等价分阶段完成2800项：前端1724、后端1012、桌面3、服务／worker61；全部保存来源校验通过，生产构建860模块。实际界面共97场景，其中23为真实组件而非完整主App；报告绑定最终源码。 |

总验收 `output/audits/resume-public-systems-acceptance-20261001.json`。完整目标继续保留：一般离散化公开入口、旧Uncurl的20规则／参数0初值合同、编织≥10偶度、任意凹面和内部切口完整显示／层序，以及Wolfram符号／插值／选项与未证全局域。双变量零恒等式证明也有已知范围差异（例如sqrt(u-u)），未把有限数值验收写成全部原语义等价。

## 2026-10-01 恢复目标：一般离散化、旧式展开与曲面恒等式

目标工具已核实为 **active**，完整复现继续进行；此前 paused 和“公开入口未接”的文字是旧批次快照，以本节为当前状态。本次没有打包，也没有把有限安全数值实现记为完整 Wolfram 运行时等价。

| 范围 | 本批完成与核验 |
|---|---|
| 一般离散化公开入口 | DiscretizeSystem／DiscretizeCurveUniformly／FoldAngleMultipliers2D 接中央API、独立回读和界面。保有序重复key、乱序采样、原弦向方程及raw倍率；Python18、TS13、23真实响应见证，三模式三窗口宽度32主App场景通过。常量根式导数、高维巨大平移的有限容差已修复。 |
| 旧 Uncurl 六源展开 | 旧Darboux的20规则、固定参数0积分、raw法向及只取方向的初始切向均保留；新API和界面可编辑、保存和载入源。Python31、TS11加恒等式5、6基本响应及27边界响应、独立80位参考通过。源C′×C″恒等式证明消除小数参数直线的假曲率，同时保真微小弯曲、原定义域及旧kn规则。 |
| 双变量曲面恒等式 | 修复sqrt(u-u)、有理消去、有限三角/指数身份，原表达式的极点/根式定义域不被约分放宽。Python18、TS18、43系统和86正反法向响应回读通过；本次29真实主App场景、27响应含4次预期422，通过三宽及正反法向检查。 |
| 回归与构建 | 本批全量npm test基线2859通过；随后修复完成后再验收完整前端1757、受影响后端67、真实API3，均通过。最终构建和追加真实界面结果、源码SHA统一记录在 `output/audits/p45-discretization-uncurl-surface-final-20261001.json`。不能把基线计数当成最终代码重新全量运行的次数。 |

仍需继续：第42节≥10偶度、一般凹面/凹边界、内部B切口的完整显示和层序/采用；绘图与求解选项、完整符号及插值对象语义；未证明的全局连续域、积分误差与折叠/碰撞证书。通用原线网自动拆分已在上一批完成有限源合同与真实界面验收，不再列为完全未实现。算法预算失败或unknown不等于数学无解。

## 2026-10-01 继续目标：凹母面与内部 B 切口

目标保持 active；未打包，未标记全部功能完成。本节更新先前“一般凹面/切口未接”的旧快照，完整范围见 `P42-凹母面与内部切口统一验收-20261001.md`。

| 范围 | 本批结果 |
|---|---|
| 真正凹母面 | 按原 In[931] 相邻偏移直线交点构造，旧凸面路径不变。正相/负相/固定 F3/None 四例整体层序已解且正背面完整；全部逐边内缩例因数值薄片仍 unsupported，采用禁用。 |
| 内部 B 切口 | 24 份响应独立来源验证；真实切口 4 例保留 B、原 FF 相对位置和三部件材料拓扑。镶嵌同画布平折、正背可见区域、调参/拖动、观察及双帧 FOLD 导出已接。 |
| 验收 | 完整前端 1778、受影响后端 72 均通过；最终 872 模块类型/生产构建成功。29 项唯一真实 GUI 检查，零页面异常。最后追加的 unsupported/error 状态文字由最终构建和真实界面验证，不将前端次数重复计数。 |
| 冻结 | `output/audits/p42-cut-concave-final-20261001.json` 绑定生产、原笔记本、fixture、测试、构建与真实界面 SHA。临时 8794/浏览器已关闭，用户 8787 未动。 |

仍需实现：内部切口采用进入普通编辑、无损保存/加载/编辑/再平折及双帧 FOLD 导入；母图自身孔洞/断开；凹面平行裂缝的层序；全逐边内缩薄片；≥10 偶度与原平方和优化 fallback；完整 Wolfram 符号/选项/插值语义及尚未认证的全域。普通线段重建会将切口 14 点/16 边焊回 10 点/14 边，因此采用门禁必须保留到整条数据链实现，不能只放开按钮。静态层序不证明连续折叠路径。

## 2026-10-02 继续目标：材料切口工程与完整内缩层序

目标保持 active，未打包；本节替代此前“切口仅预览导出/不能采用”和“全逐边内缩薄片 unsupported”的历史限制。详细记录见 `P42-材料切口工程与层序分片-20261002.md`。

| 范围 | 当前结果 |
|---|---|
| 切口材料持久化 | 独立索引、逐角边关联及原 FF 全程保留。已接采用、JSON 保存重开、CP/FF 双帧 FOLD 回读、固定面选择及编辑区再平折，多个部件不再按同坐标焊接。 |
| 模型与纸面 | 材料模型快照 v3/异步身份核对完整关联；普通 v1/v2 兼容。材料有向边界采用 nonzero 填充，孔洞及重叠独立片不误消除。 |
| 完整内缩与并行切口边 | 私有内部点避免底层数值误删薄三角片；24 点/36 边/13 原面不改，不降低容差。五组凹母面均精确 2 层序解，切口两侧按显式边关联分别保留。 |
| 统一验收 | 前端 1810/1810；类型/生产构建 876 模块通过。真实工程往返、固定 F2、正背/宽度更新及采用再计算已核。后端源 SHA 不变，沿用上一批 72 项证据。统一清单 `output/audits/p42-material-steiner-final-20261002.json`。 |

仍需实施：材料折痕几何/赋型/目标角/拓扑的统一编辑事务（当前原子拒绝不匹配编辑，可标注与辅助线）；≥10 偶度及原平方和优化；母图自身孔洞/断开输入；完整 Wolfram 符号、选项、插值对象与未证全域。材料编辑下一步设计在 `output/audits/p42-material-edit-next-20261001.md`。单个内部点无法严格证明、真实退化或预算超额仍明确不支持；静态层序不证明连续无碰撞折叠。

## 2026-10-02 继续目标：材料编辑事务与原优化差异

目标仍为全部复现，未打包；本批将此前“一律拒绝非辅助材料编辑”推进为可验证的实际编辑流程，仍未实现任意拓扑编辑。

| 功能 | 本批实际行为与验证 |
|---|---|
| 属性与几何编辑 | M/V/U、目标角、F↔反射铰链、同拓扑可平折坐标变化，按原材料身份更新；多个部件沿旧根面姿态重算，所有闭环、顶点、逐面等距核对，失败原子拒绝。 |
| 部件与变换 | 属性面板按完整材料部件选择；移动、旋转、正等比缩放、设计镜像显式重放CP与FF，保持其他部件。修改使旧模型过期；撤销恢复原模型对应版本。 |
| 统一验收 | 全前端1839/1839、类型/880模块构建通过；真实界面14项、实际下载独立回读15项，共29项。完整记录 `output/audits/p42-material-edit-final-20261002.json`，说明 `P42-材料折痕编辑与重新平折-20261002.md`。 |
| 原优化新增证据 | 原目标是倍率平方和而非仅约束残差。四个既有内部切口源没有反射等式/非空周期，其下界向量目标0.000004、当前返回0.16，下界展开闭合且CP无交叉；已有解析最优分支可实施。原周期Drop末项也须逐项对应。探针未改后端，见 `p42-original-lower-bound-probe-20261002.json` 与 `p42-original-merit-next-20261002.md`。 |

下一步优先落实原优化解析分支与一般等式约束目标，而非永久只对失败做fallback；同时保留材料拓扑增删/切割粘合、任意非平折中间态、≥10偶度、原周期/母图孔洞断开、Wolfram符号/选项/插值和未证全域。原几何/层序验证继续保持，不能把优化残差为零当作无交叉CP或连续折叠证明。

## 2026-10-07 继续目标：非周期原目标与实际可采用示例

目标已明确重新设为active。本批替代此前“原平方和仅有探针/开发稿”的状态：精确下界分支、解析反射Jacobian及有总预算的SLSQP局部候选接入，兼容输出保持不变。无非空周期时可显式选择原目标；数值解与下界证明分别显示，退化/预算/交叉/层序门禁不放宽。

下界切口与凹母面两个本地示例可生成、正背观察、采用、保存和再平折；不是Wolfram保存Out对照。最终网页29项、实际JSON下载后程序FOLD往返通过。全量npm test通过，末次修改再通过前端1996/受影响后端74/构建；详见 `P42-原目标求解与可采用示例-20261007.md`。源码和网页已更新，免安装EXE未打包。

原周期列表/Drop末项合同、高偶度有效拓扑、母图孔洞/断开、材料拓扑编辑、完整符号/选项/插值对象与未证全域继续保留为缺口。其他凹输入的几何通过不等于整片层序通过；未认证数值结果不可采用，未宣布全部原功能完成。

## 2026-10-07 继续目标：原周期目标、列表顺序与Drop末项

本节更新此前“原目标尚不支持周期”的历史限制。原目标已按输入顺序的+1/−1相位构造位移投影与源三角形面积方程，并在完整展开后只丢弃最后一项。KKT诊断包含非负下界乘子，不再以任意最小范数等式乘子误报约53.53的大误差。兼容分支的三份源例与SHA核实的v0.13.5发布源码逐项一致。

原四线周期参数实际可采用，调宽/固定面/正背/取消草稿/JSON-FOLD下载/JSON重开恢复已完成28项真实网页检查，非周期29项界面回归通过。全量前端2001、后端1070、桌面7、服务/worker63及各保存例专项通过；详见 `P42-原周期平方和求解与验收-20261007.md`。未打包，完整目标active。

本批补齐有限原周期数值入口，不宣称全部数值分支或Wolfram语义等价。病态/冗余约束、不能吻合的展开周期与未证全域继续显示失败或未知；高偶度、母图孔洞断开、材料拓扑与非平折编辑，以及完整符号/选项/插值对象仍需继续。

## 2026-10-08 继续目标：材料切开拓扑事务

新增按明确材料内边ID切开的拓扑事务：共享铰链变为两条独立边界，面角沿剩余共享边连接，保留裂缝共同端点和已有并行切口边的归属。原CP/FF逐值保留，面编号/固定面不变；中央提交独立重放提案、拒绝过期或被篡改预览。实际界面可选边预览、取消、应用与撤销/重做；新模型按新版本计算，不复用旧层序。

全量前端2010/后端1070/桌面7/服务worker63通过，末次新增无FF回归与材料专项合计35项通过；最终20项真实界面及实际JSON/FOLD下载/重开/独立回读通过。见 `P42-材料切口编辑与验收-20261007.md`。完整目标active，未打包。

闭合切口支持在材料上形成孔洞，不计作母图自身孔洞/断开输入完成。粘合、一般面细分/增删折痕、材料复制与非平折编辑继续实施。高偶度恢复边角原式已核对一致；当前原目标四组十/十二度诊断仍失败，生产门禁未改。高偶度及全部符号/选项/插值与未证全域继续保留为真实缺口。

## 2026-10-08 继续目标：材料边界显式粘合

本节替代此前“材料粘合未接”的状态。用户明确配对精确重合、面侧相反的完整材料边界，可选择M/V/F/U连接；不吸附、不移动CP端点、不因重合自动粘合其他边。保第一侧ID与样式，兼容连接逐值保留旧FF；改变连接时保原固定面姿态重算，闭环、顶点及逐面等距失败原子拒绝。无FF不虚构位置。

配对窗口有毫米刻度、紫色第一侧和青色虚线第二侧，支持显式预览、取消与应用；中央独立重放提交，撤销/重做完整恢复，旧层序过期后重新计算。实际V连接与重算FF的F连接均完成JSON/FOLD下载、重开及再平折。

全量前端2022、后端1070、桌面7、服务/worker63通过，材料专项55项通过（含新增11项，不重复相加），构建通过；真实粘合26项与切口回归20项通过，零页面异常。范围与改动见 `P42-材料边界粘合与验收-20261008.md`，冻结 `output/audits/material-join-final-1008.json`。完整目标active，源码/网页更新，免安装EXE未打包。

仍需实现高偶度≥10有效拓扑、母图自身孔洞/断开输入、一般面细分/增删折痕、材料复制、任意非平折中间态及完整Wolfram符号/选项/插值与未证全域。不同长度边的部分粘合没有隐式细分；静态层序不证明连续无碰撞折叠，最大配对容量性能、桌面原生确认桥与设备效果未在本批验证。

## 2026-10-08 继续目标：单面细分与内部折痕增删

本批补齐采用后材料副本的专用拓扑编辑：选材料面及沿边端点添加F/M/V/U弦，同步细分共享边；同部件切口对侧只同步分点，保持独立身份。内部折痕可批量删除，合法简单面合并且孤立顶点移除；面孔洞、自接或未明确删除的内部划分不被静默处理。中央完整意图重放、固定面归属映射及FF等距/闭环检查保留，撤销重做及JSON/FOLD实际重开已接。

编辑窗口有毫米刻度、拖动端点、百分比滑条/精确输入、缩放平移及预览/取消；窄面当前端点优先响应，1000/800×720添加与删除无整体滚动。实际原版切口来源保三部件和原CP/FF，5→6面后层序已解；M例真实重算FF并保固定侧。重复细分构造四向交叉，唯一中心顶点，再经现有赋型事务构成3M/1V，层序已解。

项目全量npm test通过2035/1070/7/63；最后新增交叉回归后前端2036/2036与材料专项69/69通过，最终类型/构建通过。真实新增/删除35项、普通CP/DXF下载4项、粘合26项、切开20项共85项通过；实际JSON/FOLD与独立普通DXF/CP解析通过。详见 `P42-材料面细分与折痕增删-20261008.md`，冻结 `output/audits/material-face-final-1008.json`。

完整目标active，未打包。一次跨多面批量构造、带孔面合并表示、材料复制、任意非平折中间态、高偶度≥10、母图自身孔洞/断开、完整符号/选项/插值及未证域仍需继续；本批未验证最大容量性能、桌面EXE/原生确认桥、刻字软件或实物，不承诺连续无碰撞折叠或实机提速。

## 2026-10-08 继续目标：一条直线跨多个材料面

一条明确选择的直线已可在一个材料部件或显式全部部件中统一裁剪构造；凹面多区间、已有孔洞、断开与重叠部件保持各自身份，空白区间不添加折痕。共享交点只生成一次，切口对侧仅同步分点并保持独立；完成全部面划分后才处理FF，避免逐面生成不相容的中间平折状态。参考虚线和实际青色实线分别显示，固定侧按画布Y向下的视觉左右判断，中央完整意图重放、历史和旧模型过期处理保留。

最终跨面30项、单面35项、粘合26项、切开20项和普通交换4项，共115项真实界面通过；三组实际JSON/FOLD/DXF独立回读通过。实际原版切口来源跨五面三部件，原CP/FF逐值保留；九格三段M和材料孔洞两段M均确实重算FF，孔洞100 mm空白无新增线，正背层序已解。

全量npm test通过2048/1070/7/63，最终视觉左右修正与闭环回归后前端2049/2049、材料专项82/82及类型/909模块构建通过。范围与文件见 `P42-跨面直线构造与验收-20261008.md`，冻结 `output/audits/material-trace-final-1008.json`。原严格材料校验、刚性传播、切开、粘合与加工优化源SHA保持。

完整目标active，未打包。多条非共线折痕一次构造、孔洞面合并表示、材料复制、非平折中间态、高偶度≥10、母图自身孔洞/断开及完整Wolfram语义/未证域仍继续；已有材料孔洞避让不计作母图孔洞输入完成。本批未验证最大容量、桌面EXE/原生确认桥、连续无碰撞折叠、刻字软件或实物效果。

## 2026-10-08 继续目标：完整部件复制、阵列与原位选面

完整材料部件可生成1–64份副本，支持偏移、旋转、正比例缩放及镜像；原件CP/FF及线段保原值，副本保持切口/孔洞与独立身份，CP/FF使用同一变换。专用复制窗口有毫米CP/FF图及导航、预览/取消/历史；原“复制所选”完整部件偏移入口已接，部分选择不静默扩展。

为区分原位重叠副本，材料平折设置增加经索引图和轮廓共同核对的materialFace，选面器可按部件/面选择；面细分/合并及变换同步更新索引，材料FOLD保当前有效起始面。普通图上的索引配置明确失效，用户重选普通面可修复。旧0.13.5发布源码校验器已实测拒绝新索引字段，含该字段的完整JSON需本批源码读取；EXE未更新，不假定旧EXE可打开。

全量npm test通过2061/1070/7/63；最终追加索引异常与普通面恢复后前端2062/2062、材料及选面100/100及911模块类型/构建通过。复制28、普通面恢复5、跨面30、单面35、粘合26、切开20、交换4共148真实界面检查通过。实际三部件原版源两份阵列成九部件、旋转30°/0.75/左右镜像副本及原位选F2均经JSON/FOLD回读、再平折及普通DXF验证；原件保持原值。范围见 `P42-材料复制与索引选面-20261008.md`，冻结 `output/audits/material-copy-final-1008.json`。

完整目标active。跨工程材料剪贴板与构造复制路由、多条非共线一次构造、孔洞面合并、非平折、高偶度≥10、母图自身孔洞/断开、完整符号/选项/插值与未证域仍需继续；旧/新EXE、最大规模性能、连续折叠与设备效果未验证，不发布、不操作设备。

## 2026-10-08 继续目标：材料画布两点/四点复制与镜像选区

三个构造复制入口已接入完整材料意图和中央独立重放，CP/已有FF直接使用原平移、四点相似或轴反射公式；不拆角度重算、不补接、不裁剪或按坐标焊接材料。允许原位副本，完整部件含边界可在保护开启时复制；部分材料选择明确拒绝，前后整个工程保持相同。普通两点/四点复制/移动和镜像源代码保持基线SHA。

最终全量npm test通过前端2070、后端1070、桌面7、服务worker63及既有保存层序专项；类型/912模块构建通过。本批新工具40、部分选择拒绝10、普通工具49、旧复制28、普通选面修复5，共132项真实界面检查通过。原版三部件在三工具/原位操作后均为28点/32边/10面/6部件；四组实际JSON/FOLD与CP/FF/历史/正背层序、普通R12毫米34条LINE独立回读通过。见 `P42-材料画布复制工具与验收-20261008.md` 和 `output/audits/material-tools-final-1008.json`。初次全量出现的旧Python绘图库初始化异常、单项/完整复跑通过及原始日志均如实保留。

完整目标active，未打包。余项为跨工程材料剪贴板、画布两点/四点移动、单边插面镜像、多条非共线一次构造、孔洞面合并、非平折、高偶度≥10、母图自身孔洞/断开、完整符号/选项/插值与未证域。现有EXE未更新，新材料索引JSON与旧校验器不兼容限制延续；原生桥、最大容量、连续折叠与实机效果未验证。

## 2026-10-08 继续目标：材料画布两点/四点移动与拖放

两点移动、四点相似定位及两点工具内拖放已接入完整材料意图，原顶点/边/面/逐角关联和切口身份保持，不替换线段ID、不裁剪重叠或按坐标合并部件；CP与已有FF直接应用同一原公式。单部件可独立移动，其他部件及未选辅助/注释保持原值；纸边移动遵守边界保护，部分边及无位移明确拒绝。起始面索引及轮廓同步迁移，旧层序过期后重算；无FF不虚构。

完整npm test通过前端2080/后端1070/桌面7/服务worker63及原命名构造/保存层序专项，材料/普通工具专项73、类型/913模块构建通过。真实移动38、普通工具49、材料复制40、部分选择拒绝10共137界面检查通过；四组实际JSON/FOLD/普通18条R12 LINE回读与全意图、历史、身份、CP/FF、正背层序核对通过。已有孔洞环形材料单独四点移动后内片不动、身份保留且平折已解。13个既有内核/普通工具/加工优化源SHA保持。见 `P42-材料画布定位移动与验收-20261008.md` 和 `output/audits/material-move-final-1008.json`。

完整目标active，未打包。跨工程材料剪贴板、单边插面镜像、多条非共线一次构造、孔洞面合并、非平折、高偶度≥10、母图自身孔洞/断开、完整符号/选项/插值与未证域仍继续。选择工具普通局部直接拖线不计本批两点定位拖放；现有EXE、新材料索引与旧校验器限制、最大容量、原生桥、连续折叠和实机效果仍未验证或未更新。

## 2026-10-08 继续目标：跨工程材料剪贴板与FF参考关系

完整材料会话快照、跨工程粘贴与部件/全部剪切已接，保顶点/边/面/切口/孔洞及当前FF姿态。复制部分材料明确拒绝，不替换旧快照；剪切遵守纸边保护；普通几何剪贴板和Ctrl+C/X/V保旧路径。粘贴有CP/FF毫米刻度、导航、预览/取消、一次历史、显式仅CP及普通目标按既有交点分段选择，不静默吸附或删重复线。目标独立注释保留，来源未选注释不作为材料复制。

进一步补查发现活动起始面被错误写成FF参考面，可令已保原数值的画面位移285.2954831454554 mm。现集中处理显示/储存基底，参考与活动面独立迁移；FOLD新增zhezhi_flat_fold保活动设置，不再覆盖FF参考。复制、移动、粘合、面细分/合并的参考关系同步修正。实际GUI下载的粘贴前后模型与JSON/FOLD重开的模型证明：原14个显示顶点逐值相同，位移0，参考索引4及活动索引3独立保留。

最终全量npm test通过2106/1070/7/63及原专项；材料95项、类型/917模块构建通过，其中新增19剪贴板及7基底回归。新剪贴板32、额外11、普通剪贴板15、异根实际模型8，以及移动38、复制28、粘合26、单面35、跨面30、切开20、普通选区49共292项真实界面通过。剪切/粘贴和异根模型、四种普通R12 LINE、各旧材料下载均独立回读通过。12个既有普通工具/严格校验/刚性传播/切口/跨面/加工优化源SHA保持；参考相关修改列在 `P42-材料跨工程剪贴板与参考面验收-20261008.md`，冻结 `output/audits/material-clipboard-final-1008.json`。

完整目标active，未打包。多条非共线一次构造、单边插面镜像、孔洞面合并、非平折、高偶度≥10、母图自身孔洞/断开、完整符号/选项/插值与未证域继续。任意操作/任意根/最大规模组合仍未作全域等价证明；旧/新EXE、原生桥、最大性能、连续折叠与实机效果未验证。新索引JSON与旧0.13.5校验器不兼容限制及新增FOLD字段的旧EXE未测范围延续。

## 2026-10-08 继续目标：多条材料直线一次构造

本节更新此前“多条非共线一次构造未接”的状态：1–32条原材料边锚定直线现可一次提交，全部交点/材料面细分后按最终分段赋型统一重折。分段沿每条起点→终点编号，可覆盖F/M/V/U；固定面内点明确选定保持区域。真实六角三条M/M/V六段整体可解，前两条的失败中间FF不再阻止用户补全第三条。源边锚点保持原世界位置；共享交点唯一，切口/重叠材料保持独立，孔洞和空白不补线。

新增窗口有毫米刻度、比例滑条与精确输入、端点和固定点视觉/键盘调整、导航、CP/FF、几何分段表、预览/取消和一次历史。完整重折失败仍可修正分段赋型，失败结果不能应用；仅CP须显式选择。中央完整意图独立重放，FOLD/原生保存、普通R12 LINE DXF保持。

完整npm test通过2116/1070/7/63；新增断开/重叠回归后最终前端2117/2117，批量11及旧跨面13共24项、类型/919模块构建通过。新GUI35项和旧回归266项共301项通过；实际交叉、六角和切口三组JSON/FOLD/DXF分别12/12/42边，完整意图、坐标尺度、根、正背层序及旧材料下载回读通过。12个基线源SHA保持，涉及批量路由/绘图的修改明确列出。见 `P42-材料多线批量构造与验收-20261008.md`，冻结 `output/audits/material-batch-final-1008.json`。

完整目标active，未打包。当前批量限原边锚定直线，任意内部自由端点/射线/闭合线网和曲线批量仍未接；单边插面镜像、带孔面合并、非平折、高偶度≥10、母图自身孔洞/断开、完整符号/选项/插值及未证全域继续。旧/新EXE、原生桥、最大容量、连续折叠、刻字软件和实机效果仍未验证；旧0.13.5材料索引兼容限制延续，不承诺已完全复现。

## 2026-10-08 继续目标：有限材料单线镜像插面

原画布“镜像线段”已将单条材料折痕与完整部件复制分开：选择材料原线与已有轴线，按有限反射生成实际材料区间并更新面和共享交点，全部赋型后统一处理FF。默认原部件，可显式全部材料、固定侧及仅CP；源山谷/F/U和目标角保留，纸外/凹口/孔洞不补线，重复/自由面内端点不能合法划分时明确拒绝。45°采用不含开方的等价反射矩阵，实际端点(25,0)→(25,100)和唯一交叉点已验证，不自动吸附。原普通镜像和完整部件镜像源保持。

本批完整npm test通过2125/1070/7/63；追加凹口/45°及最终数值式后前端2127/2127，镜像10+旧单线13+批量11共34项、类型/920模块构建通过。新真实GUI37项和旧批量/工具/跨面/复制/异根190项共227项通过；实际F/M/45°JSON/FOLD和普通R12 LINE DXF逐意图、坐标尺度、根、历史及正背层序回读通过，M确实重算FF，普通DXF含原辅助轴分别11/11/13条。13个基线SHA保持，修改见 `P42-材料单线镜像插面与验收-20261008.md`，冻结 `output/audits/material-reflect-final-1008.json`。

完整目标active，未打包。任意面内自由端点/射线/闭合线网、曲线批量、孔洞面合并、非平折、≥10有效编织、母图自身孔洞/断开、完整符号/选项/插值及未证全域继续。实际Wolfram运行、任意操作/根组合、最大性能、旧/新EXE/原生桥、连续折叠和实机未验证；旧0.13.5材料索引兼容限制延续，不自动发布、不操作设备。

## 2026-10-08 继续目标：带孔材料面合并与统一二维流程

本节更新此前“孔洞面合并未接”的状态：简单互不接触的孔环已有真正多环面表示，可删除内折痕合并成带孔面，支持单面/跨面/批量细分以及切开、粘合、完整镜像和剪贴板。实际构造按纸面区间分段，不跨孔补线；所有内外角与邻面关联同步维护，原 CP 不写入私有层序辅助边。正背显示、命中、遮挡、阴影和 SVG 同步排孔；JSON/FOLD 保 CP/FF、根与多环数据，普通 DXF 仍为 R12 LINE。

完整 npm test 当时通过2136/1070/7/63及保存例专项；最后前端2142、材料专项116、925模块类型/构建通过。新GUI34与旧回归378共412项通过，五组实际JSON/FOLD/DXF完整重放、尺度位置次数及正背层序回读通过；普通DXF分别16/22/22/28/32条。5个基线源SHA保持，31个生产文件的范围见 `P42-带孔面合并与统一流程验收-20261008.md`，冻结清单为 `output/audits/material-holes-final-1008.json`。

完整目标仍active，未打包。重复角/自接切口合并、外环到孔环单桥、任意自由端点/射线/闭合线网及曲线批量、非平折、带孔三维、≥10有效编织、母图自身孔洞/断开及完整Wolfram语义仍缺。带孔三维在三角化前明确拒绝，不能算作三维实现；已有材料孔洞不能算作母图孔洞输入完成。外部FOLD多环、旧/新EXE及原生桥、最大性能、连续无碰撞折叠与实机效果未验证，不自动发布、不操作设备。

## 2026-10-08 继续目标：带孔材料的既有三维模拟

本节替代上一批“带孔三维直接拒绝”的限制：独立模拟副本复用完整多环三角化，保持原边界角及源面朝向，不填孔，不焊接独立同坐标材料。三角化面积/有向边界与源面核对，第三方清理改变结构时明确拒绝；私有F辅助边不进入原CP。二维和逐面共面的三维FOLD均可生成网格，非共面孔环拒绝。

单孔、双孔和真实山折铰链已通过实际GPU/CPU显示、目标比例调整、复位与三维FOLD/OBJ/STL下载核对。34项新GUI及45项普通模拟回归通过，8项新单测及相关专项共41通过，926模块类型/构建通过；完整npm test通过2150/1070/7/63及既有保存例专项。模拟前后原生工程和普通DXF逐值相同。三维导出沿用既有归一化模拟坐标，与毫米加工DXF分开。

完整目标active，未打包。带孔数值模拟不等于原版任意非平折中间态构造编辑完成；自由端点/射线/闭合线网、曲线批量、单桥/重复角拓扑、高偶度≥10、母图自身孔洞/断开、完整Wolfram语义及未证全域继续。最大容量、连续无碰撞物理路径、EXE/原生桥、外部软件与实机未验证。见 `P42-带孔三维模拟与导出验收-20261008.md`。

## 2026-10-08 继续目标：独立母图的实际编织构造

本节更新“母图断开输入未接”的状态：互不接触、互不包含的独立部件现可按原半边顺序发现母面，分别二着色，共同数值求解，每片保持自己的原FF固定回展面。新增可采用的双部件工作区示例，保原编号、完整逐边内缩、空/非空周期及既有原平方和目标。独立来源由前端完整重放验证；缺失/伪造信息不能退回普通纸面，其他构造的图扩展不误入此流程。普通图单片及In3437旧输出逐字段保持。

六组实际生成、原CP/FF、整片层序、正背、采用、保存重开及JSON/FOLD/普通DXF下载通过；前五组采用40/64/26、2片、64 LINE；带原目标和内部B的组合采用28/32/10、6片、32 LINE。新93项GUI及旧原目标29/周期28共150项通过，实际文件独立回读通过。完整npm test通过2154/1076/7/63，最后前端2155/类型及926模块构建通过。上一批两处DXF验证误用通用交换导出，本批改用真正exportDXF并重新核对，不改生产导出。

高偶度继续为缺口：非均匀正初值96、负初始图192、边界约束组合图中的6个高偶度情景及组合非均匀根128均未找到有效CP；两个六/八度校准场景成功。即使反射残差零，交叉展开仍拒绝。诊断没有接入产品，没有用放宽几何门禁“复现”结果。

完整目标active，未打包。母图自身孔洞、≥10有效编织、自由端点/射线/闭合线网/曲线批量、重复角/单桥、原版任意非平折编辑及完整Wolfram语义继续。分开的独立纸片不等于母图孔洞输入；任意组合/最大容量、EXE/原生桥、外部交换与设备、连续无碰撞物理路径未验证。见 `P42-独立母图构造与高偶度核查-20261008.md`。
