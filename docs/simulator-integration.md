# 三维模拟接入与验收

## 已实现

2026-10-21 新增用户固定点、三维独立撤销／重做与完整作品中的姿态恢复。同日根据实际反馈修正塑形：拖动期间自动支撑远处纸面，暂时停止折痕目标的回弹驱动；松手清除临时支撑和动能，保留当前形状并暂停，不再整体居中或自动继续原目标。恢复姿态保持暂停，不改变原始 CP；完整约定和分阶段测试记录见[顶点塑形、固定点与姿态恢复](simulation-vertex-grab.md)。这些功能不增加碰撞处理能力。

同日补充实际折角诊断与完整作品自动恢复。`SimulationAngleAnalyzer` 从当前几何测量有向角，并用求解器角度历史保持 ±180° 分支，报告平均／最大绝对偏差及最差有向偏差（实际角减目标角）。不把相反折向的 +179° 当作 −181°；U 折痕没有驱动目标，单独计数。步骤轨迹无法提供可靠分支时明确不可用。`solveState` 区分求解中、速度暂稳、用户暂停与不可用，任何状态都不是无碰撞证书。

自动恢复通过 `capturePose({finishGesture:false})` 获取姿态；iframe 在视角或塑形指针手势期间拒绝本次自动捕获，下一次再试，保留现有指针捕获与约束。手动完整作品下载默认结束当前手势再获取姿态。恢复副本写入本机数据目录，并随保存目录迁移；各窗口和作品范围独立，不覆盖之前作品或其他窗口。

2026-10-15 新增完整材质/积分控制、负比例、分类边显隐、法向/应变色阶、全局目标序列、设置记忆及高清PNG。当前行为和验证见[Origami Simulator研究与本地补充](origami-simulator-study.md)；下文较早的协议表和验收按历史版本保留。纸层间距仍保持关闭。

不是静态示意动画：输入 FOLD 的纸面、山谷赋型、目标角会进入真实质量—弹簧折纸动力学求解器。优先 WebGL2 浮点纹理求解与深度缓冲渲染；不支持时采用同一算法的 CPU ReferenceSolver，加三维投影绘图。模块来自 Ori Studio 独立 MIT 包，算法来自 Amanda Ghassaei 的 Origami Simulator。固定来源和完整许可见 `vendor/simulator/UPSTREAM.md`；发布版权声明在 `/simulator/THIRD_PARTY_NOTICES.txt`。

页面：`/simulator/index.html`，由 Vite 多入口生成，运行时完全本地。不可直接以 file:// 启动构建后的模块；使用工作台提供的本地服务。无上传模型、CDN、遥测或在线模型依赖。

## 父子窗口协议

父窗口发往 iframe.contentWindow，targetOrigin 必须为 `location.origin`。

| type | 字段 | 行为 |
|---|---|---|
| zhezhi-sim-load | fold, revision:string/number，可选 pose | 三角化副本并载入；pose 验证通过后使用其自带源 CP、姿态、固定点、参数及视角，握手 loaded 后报告 paused；原文档不改写 |
| zhezhi-sim-capture-pose | requestId, revision | 完成当前抓取后捕获当前静止姿态数据，以 zhezhi-sim-pose 回复相同请求与版本；保存失败返回中文 error |
| zhezhi-sim-undo-pose / zhezhi-sim-redo-pose | — | 恢复三维独立历史，停止目标序列播放并保持暂停，不操作二维 CP 历史 |
| zhezhi-sim-progress | value:0..1 | 所有已赋型折痕的目标角乘该比例，继续求解 |
| zhezhi-sim-pause | — | 暂停动力学，仍可旋转视角 |
| zhezhi-sim-resume | — | 继续求解 |
| zhezhi-sim-reset | — | 恢复输入初态、目标比例0并暂停；不是重置原文档 |
| zhezhi-sim-clear | revision | 新输入无效时销毁旧后端并清空画布 |
| zhezhi-sim-view | mode:paper/wireframe/xray/strain | 纸面、折线、透视与应变热图 |
| zhezhi-sim-crease-style | style:assignment/crease | 红蓝山谷线／中性细实线，屏幕与图片导出共用 |
| zhezhi-sim-camera | preset:front/back/isometric | 固定正面、背面或立体视角；画布仍可手动旋转缩放 |
| zhezhi-sim-material | creaseStiffness, damping | 设置求解材质并重新求解 |
| zhezhi-sim-colors | front, back | 设置纸张正反面颜色 |
| zhezhi-sim-step | — | 暂停时推进20个数值步 |
| zhezhi-sim-export-fold/obj/stl/svg/png | — | 导出当前求解网格或当前视图 |
| zhezhi-sim-ping | — | 回复ready握手 |

子窗口检查 `event.origin === location.origin && event.source === window.parent`。状态消息只回复同源父窗口，type为 `zhezhi-sim-status`，status为ready/loaded/error/running/paused，message中文，另有revision、backend、strain、steps、view、warnings、error。`strain` 是最大节点平均轴向应变比例，0.01代表1%；不是顶点偏差，也不是可折性证明。

固定点和历史状态另含 `pinnedVertices`、`canUndoPose`、`canRedoPose`、`poseEditRevision` 与 `interactionActive`；`poseRestored` 表示本次载入来自保存的姿态。控制栏收到姿态操作修订时停止自身的目标序列，并同步引擎实际求解参数；不能把旧偏好回发，覆盖已恢复的参数或重新启动暂停的姿态。

推荐使用 `src/engine/simulator.ts` 的 `SimulatorBridge`：监听ready并排队早到命令、校验消息来源、丢弃旧revision状态、卸载暂停。若父端自己处理，应先注册监听器，等待ready再发送load；初始模块下载期间直接发送的消息不保证接收。再次load会保留上一次目标比例，reset回到0。加载过程中状态为running，避免把ready误当成每次加载的循环触发器。

`SimulatorBridge.capturePose()` 返回经 `validateSimulationPose()` 校验的可序列化数据；模型切换、帧重载或关闭会拒绝尚未完成的捕获请求。`SimulationPose` 包含源 FOLD、求解器快照、目标比例、求解参数和视角。求解器快照的 `positions` 和 `displacements` 必须与源纸面一致，`creaseAngles` 使用未绕回弧度，`pins` 保存顶点索引及绝对位置；完整模型签名检查原纸面、拓扑和原目标角，不能只检查数组长度。

`restorePose()` 在完成校验后替换姿态与固定点，同步 Euler／Verlet 位置历史并清动能，保留原纸面度量和当前步数。外层 `restorePoseEdit()` 再恢复快照记录的参数与目标比例，完成后暂停。历史只覆盖塑形、固定点和展开复位，不记录连续数值求解的每一帧；更改目标、参数或重新运行会清除旧重做分支。新载入／清空模型会清除三维历史，完整作品不保存撤销栈。

## 输入与边界

- 必须包含 `vertices_coords`、`edges_vertices`、闭合有效的 `faces_vertices`。主编辑器负责交点分割和纸面构建；不能把一串孤立线段直接当纸面。
- 已实现多边形三角化，补充的面内边为F；原始FOLD通过副本处理。
- 二维坐标和三维FOLD `[x,y,z]` 一致映射到模拟器的XZ纸面坐标系。
- 明确目标角0保持0；山/谷目标角null会中文报错，不暗中当±180。若整个角数组省略，按M=-180、V=+180默认并给出提示。U为无驱动目标角，不能误称已完成山谷赋型。
- 有限数、索引、非流形、切割/连接赋型、模型大小在进入引擎前校验。C/J尚不支持；不会默默降级为边界线。
- 三维载入与平折几何均已取消 200 面限制；完整层序仍有独立容量保护。2026-09-18 已验证 225 个四边形面生成 450 个三角面并实际推进 CPU 求解，位置有限且发生离面运动，原工程不变。
- 顶点上限5,000；边上限15,000；输入面上限10,000；三角化后面上限15,000。CPU兼容限制1,200顶点/2,400三角面，避免大型模型阻塞交互。编辑器的线段与切分边数限制仍独立生效，不代表任意规模无限计算。
- 每帧求解时间预算6ms；对较高应变/非有限状态停止并中文提示，避免把发散后的静止画面当成成功。
- 尚无完整接触响应、纸厚、摩擦、可靠层序或逐步折法约束。“数值暂稳”仅表示速度低于阈值，不代表已验证可折。
- GPU和CPU纸面着色均使用逐像素深度遮挡，深度与透视投影对应；CPU不再依赖面心排序。完全重合的面按固定拓扑顺序显示，折线仅有微小深度偏移且不覆盖深度缓冲。透视模式刻意显示后层，其透明混合不代表物理层序。
- 控制栏将折叠比例、自动播放目标、四种显示方式、三个固定视角、暂停、单步和复位压在两行内；材质预设、硬度/阻尼、正反面色及导出在上方弹出的面板中。控制栏本身不需要滚动。
- 默认拖动只旋转镜头，不触发位置约束，也不启动已暂停的求解器。按住Shift或启用画布右上方“顶点塑形”后，悬停亮点并拖动才会修改纸面；单击或空白拖动不改变纸面及视角。拖动按原纸面拓扑选择远处支撑面，在当前姿态上临时固定，并暂时停止山谷折痕目标驱动；轴向与面片刚度仍有效。松手移除临时约束、清除速度并暂停，不改动纸面位置；连续塑形从当前形状继续。主动继续求解、单步或改变目标才重新计算，修改求解参数保留暂停。用户固定点保留，需先解除才能直接抓取；临时支撑不写入用户固定点及姿态历史。非透明纸面不会拾取被前层遮住的顶点。GPU 和 CPU 默认 Euler 积分都支持；Verlet 明确拒绝顶点约束。抓取并不会绕过应变/失稳保护，也不是折叠路径或可制造性证明。2026-10-21 修正记录见[顶点塑形、固定点与姿态恢复](simulation-vertex-grab.md)。
- 三维 FOLD、OBJ、STL 取当前求解顶点（不是目标角推测）；OBJ/STL 是三角化的零厚度纸面，适合网格交换，尚非适合直接打印的实体。FOLD 快照不把输入目标角冒充已测角，也不保证可由当前二维折痕导入器重新编辑。SVG 导出最多支持2,000个三角面；PNG 导出当前着色视角。
- 不自动上传第三方艺术作品、不包括上游演示照片或作品集。

## 初版验收（2026-09-17）

`npx tsx --test tests/simulator.test.ts`：5项测试通过。

1. 四边形纸面实际三角化为4个三角形，原文档保持不变。
2. CPU求解单折线8,000步；顶点离开纸面，轴向应变小于3%；M/V结果的法向位移互为相反数；reset严格恢复初态。
3. 目标0保持平面，显式null不会误折成180°。
4. 二维与平面三维输入的模拟坐标一致。
5. 缺纸面、无穷坐标、不支持的切割、非流形产生中文错误。

真实Chromium交互检查：WebGL2与强制CPU(`?backend=cpu`)均成功将同一单折线模型折至目标50%，与90°折叠相符；两者都达到“数值暂稳”，未出现外网资源请求或英文弹窗。截图：工作区 `output/playwright/模拟引擎-GPU-50.png`、`模拟引擎-CPU-50.png`。测试用CPU选项只改变本地后端选择，不接入任何服务。

另以真实同源父窗口嵌入iframe完成协议检查：ready只有一次、load成功、目标50%推进8,064步、pause停下、reset步数归零、resume继续。伪造外域origin与非父窗口source的重置消息均被忽略。状态revision在全程保持输入标记。

限制：上述检查不是对任意镶嵌构造、复杂闭环或接近180°多层压平的全覆盖认证；这些模型必须保留应变读数及可折性边界提示。

## 本轮验收（2026-09-27）

- `npx --offline tsx --test tests/simulator.test.ts`：16项通过，新增轻微折线弯折与不同目标角保真、驱动折痕双面校验、显示模式、三维 FOLD/OBJ/STL 导出及屏幕到三维拖动映射。
- vendored 求解器的 `tests/vertexConstraint.test.ts`：2项通过，覆盖 CPU 顶点目标约束、释放与复位。
- `scripts/verify-simulation-workspace.browser.js`：真实 Chrome 中45项通过，覆盖数值求解、播放/停止/暂停/复位/单步、四种显示模式、固定与自由视角、材质预设、GPU/CPU 回退、FOLD/OBJ/STL/SVG/PNG 下载、载入失败清旧模拟以及1000×720侧栏无滚动。
- `scripts/verify-simulation-grab.browser.js`：真实 Chrome 中22项通过；WebGL2 和 CPU 分别抓取同一顶点，拖动中的三维 FOLD 顶点坐标均改变约0.088（归一化模拟坐标），松开后约束清除且求解继续。
- `npm run build`：TypeScript 类型检查及 Vite 构建通过。以上验收只证明这些输入和操作，不等同于任意复杂纸张的碰撞或实际折叠验证。

## 遮挡与视角漂移修复验收（2026-09-30）

| 检查 | 结果 |
|---|---|
| `tests/simulator.test.ts` | 18项通过；新增交叠三角面透视深度、绘制顺序无关、隐藏折线和重合面稳定性 |
| `scripts/verify-simulation-depth.browser.js` | 真实Chrome中12项通过；1,405个交叠内部像素的GPU/CPU遮挡一致，紧贴后层折线隐藏、前层折线可见、完全重合面重复绘制一致 |
| `scripts/verify-simulation-grab.browser.js` | 2倍像素比例下40项通过；GPU/CPU分别覆盖从顶点旋转、角度与鼠标位移一致、展开和实际折叠后三维坐标/步数不变、Shift塑形及释放 |
| `scripts/verify-simulation-workspace.browser.js` | 45项通过；四种显示模式及GPU/CPU图片和网格导出等回归通过 |
| `npm run build` | 类型检查与生产构建通过 |

逐像素遮挡测试通过Vite开发服务8898载入真实渲染模块，工作区交互测试通过独立数据目录的生产服务8897执行。渲染深度修复不会新增物理自接触或防碰撞能力；模型几何真正相交时仍需碰撞求解，不能把显示遮挡当成碰撞处理。

## 100%端点显示与折痕样式（2026-10-14）

仅在100%的不透明纸面／应变视图，对满足近共面条件且正面积重叠的材料面板建立显示专用微层网格。F连通片保持同一面板，层序固定于源拓扑，法向和距离均比较同一基准，未完成平折或真实相交的面不强制修正。原求解纹理、顶点和几何导出不改；0–99%、折线和透视视图保留求解姿态。

工具栏常驻“红蓝／折痕”切换。GPU、CPU、PNG、SVG共享颜色、线宽、虚线及显示网格，SVG同步使用透视深度和当前边偏移。专项62项及浏览器89项通过；全量回归仍有2项平折／镶嵌失败，具体结果见[本次验收记录](三维100%显示与折痕样式-20261014.md)。

## 自穿越保护取消（2026-10-14）

按用户要求，取消本轮新加的自穿越检测、回退暂停、接触检查预算、输入初态穿透拒绝和接触后自动停止播放。CPU／GPU恢复原有数值求解流程，保留原有非有限值与应变保护、近共面显示稳层及“红蓝／折痕”样式切换。

此前机制的复现与验收保留为[历史记录](三维自穿越保护-20261014.md)，其检测和暂停行为不再生效。

取消后验收：56项模拟、显示层、折痕样式及孔洞／切口测试通过；`verify-simulation-no-contact-guard.browser.js` 真实浏览器97项通过，GPU／CPU分别用环状镶嵌和保存的CP越过原156／208步停点，单步完整推进20步，FOLD不再附加接触暂停标记，样式与视角操作不漂移。TypeScript与网页生产构建通过；安装包未重新打包。
