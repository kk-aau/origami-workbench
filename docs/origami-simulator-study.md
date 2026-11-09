# Origami Simulator 功能研究与本地补充

研究日期：2026-10-15。核对对象为 [Origami Simulator 原站](https://origamisimulator.org/) 及 [Amanda Ghassaei 官方仓库](https://github.com/amandaghassaei/OrigamiSimulator) 的公开源码。本说明记录研究基线、实现取舍及本轮范围，不代表已完整复制原站；原站的旧版 WebVR 说明和被注释的实验功能须单独判断。

## 工作方式与本地已有能力

原站按一个全局比例同时驱动全部折痕，再用柔性动力学迭代位置；它不推导逐次折法。负比例把山谷折方向反转。[官方 README](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/README.md)

| 对照项 | 本轮前的本地能力 | 应保留的语义 |
| --- | --- | --- |
| 实时求解 | 本地 WebGL2；不支持时使用 CPU 参考求解器 | 不上传模型，不从原站运行服务取数 |
| 目标与操作 | 0～100% 目标、自动递增播放、暂停、单步×20、复位；默认旋转，Shift/顶点塑形才抓取 | 改镜头或显示设置不能推进求解、重置文档或偷偷启用塑形 |
| 显示 | 纸面、折线、透视、应变；红蓝/真实折痕样式；正背面色；视角立方体；纸层间距已暂时关闭 | 显示层修正不能写回求解坐标与几何导出 |
| 步骤动画 | 独立的逐折痕步骤规划、预折、刚性/柔性运动和层序时间轴 | 全局目标比例播放不能覆盖、重规划或声称验证了此路径 |
| 导出 | 当前三维 FOLD/OBJ/STL、当前视图 SVG/PNG | 导出快照与二维可编辑折痕图有区别；零厚度网格不等于打印实体 |

本地基线见 [三维模拟接入与验收](simulator-integration.md)、`src/components/SimulationControls.tsx`、`src/engine/simframe.ts`。该表描述修改前的对照状态；本轮增加项另列于后文。

## 原站实际功能清单

| 功能 | 已核实的细节 | 官方证据 |
| --- | --- | --- |
| 简易/高级界面 | 底部集中比例、纸面/应变、旋转/抓取和复位；高级界面分列求解与显示设置 | [界面定义](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/index.html#L1037-L1258) |
| 折叠比例 | 高级比例和数字输入为 -100～100%；底部简易滑条为 0～100%；有展开/折起端点 | [controls.js](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/controls.js#L446-L485) |
| 求解控制 | 开始、暂停、复位、暂停后单步；单步使用当前每帧步数；可重新居中几何 | [求解操作](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/controls.js#L627-L685) |
| 积分与材质 | Euler/Verlet；轴向 10～100、面内 0～5、折痕/面片弯折各 0～3、阻尼比 0.01～0.5 | [材质范围](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/controls.js#L414-L445) |
| 默认参数 | 轴向 20、面内 0.2、折痕/面片 0.7、阻尼比 0.45、Euler、每帧 100 步 | [globals.js](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/globals.js#L44-L86) |
| 时间步 | 材质改变后重算稳定时间步；每帧推进量独立可调，不是显示帧率 | [dynamicSolver.js](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/dynamic/dynamicSolver.js#L212-L233) |
| 纸面与边 | 正背面双色、隐藏纸面；M/V/F/U/B 独立显隐，M/V/B 默认开、F/U 默认关 | [材质与边显隐](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/model.js#L75-L131)、[默认值](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/globals.js#L12-L23) |
| 法向显示 | 以面法向作 RGB 着色，使用双面、平面着色的 MeshNormalMaterial；并非显示法向箭头 | [法向材质](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/model.js#L75-L85) |
| 应变显示 | 节点的邻边相对长度误差映射为蓝至红；显示上限默认 5%，可调 0.0001～100%；平均误差另输出 | [误差与色彩计算](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/dynamic/dynamicSolver.js#L173-L207)、[上限范围](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/controls.js#L651-L653) |
| 镜头与旋转 | 七个固定方向：六面和等轴；自由旋转缩放；禁用平移；可自动绕 X/Y/Z 旋转并调速；背景色可改 | [View 菜单](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/index.html#L983-L1010)、[镜头实现](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/threeView.js#L48-L81) |
| 抓取 | 独立 Rotate/Grab；悬停高亮、拖动塑形；大幅拖动可能进入难以恢复的构型 | [原站说明](https://origamisimulator.org/)、[交互切换](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/controls.js#L654-L674) |
| 平面图 | Pattern 单独预览导入后的折痕图，切入时暂停，回来时按原状态恢复；可保存原折痕 SVG | [视图切换](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/controls.js#L348-L370) |

### 导入与导出

| 功能 | 原站约定 | 对本地的影响 |
| --- | --- | --- |
| SVG 输入 | path/line/rect/polygon/polyline；红 M、蓝 V、黑 B、黄 F、绿 C、紫 U；透明度乘 180°形成目标角；线宽、虚实不编码折叠 | 此约定属于模拟导入格式，不能擅改工作台既有绘图语义 |
| SVG 清理 | 合并容差，自动分交点/清理重线；需移除裁剪蒙版；曲线模式有离散间距与近似容差 | 可作为独立导入能力；必须显示实际解析结果与限制 |
| 剪贴板与拖入 | 支持粘贴含 `<svg` 的文本；文件选择与拖放按后缀分流 | 可复用现有工作台导入，不必再放一套远程编辑入口 |
| FOLD 输入 | 需 vertices_coords、edges_vertices、edges_assignment、faces_vertices；支持 edges_foldAngle；缺少角数组时可选择从当前三维几何读取角度；兼容旧名 edges_foldAngles | 本地已对 null/未知赋型更严格，不能无提示把 null 变为 ±180° |
| STL/OBJ | 当前网格，可设文件名、比例、尺寸预览、双面；格式本身无单位 | 后续可补导出选项；双面重复三角形不是纸厚 |
| FOLD | 当前三维坐标、作者、比例、单位、可选三角面和目标角；导出实现把 C 改为 B | 本地继续把实测姿态和输入目标角区分；不照搬会丢失切口语义的做法 |
| PNG | 画布截图，支持缩放倍率与像素尺寸预览 | 适合轻量补充清晰导出；保持与当前显示设置一致 |

依据：[原站设计与导入说明](https://origamisimulator.org/)、[SVG 粘贴及 FOLD 导入](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/importer.js)、[FOLD 保存实现](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/saveFOLD.js)、[导出界面](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/index.html#L1424-L1517)。

### 录制与全局目标动画

| 原站行为 | 精确含义 |
| --- | --- |
| GIF、WebM、PNG | CCapture 处理录制；仅取三维 canvas，不包含界面或鼠标；倍率控制输出分辨率，窗口形状控制宽高比；录制中不应改变窗口尺寸 |
| 参数 | GIF/WebM 可设 1～60fps；WebM 质量 0～63；录制步数影响每帧的动力学推进量；原站默认 GIF 20fps、视频 60fps |
| 动画配置 | 从当前全局比例开始；每行是到某比例的线性动画或保持前一比例的停留，均以秒为时长；可逐行删除 |
| 运行方式 | 配置有效时在开始录制后启用，按录制帧数及求解子步采样；序列结束关闭目标自动变化；不是为每条折痕建立独立关键帧 |
| 原站校验限制 | 动画行主要检查是否填写；未设置行数或总时长上限；这不适合作为本地保存偏好的校验标准 |

依据：[录制控制](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/controls.js#L208-L345)、[时间序列实现](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/videoAnimator.js)、[捕获画布](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/threeView.js#L97-L118)。

## 原站限制与不应误认的功能

| 限制 | 研究结论与实现取舍 |
| --- | --- |
| 逐折痕折法、FOLD 多帧、glTF 动画 | 官方功能请求仍列出这些项目；本次核查的 UI/动画源码只实现全局比例序列。不能把“Configure Fold Percent Animation”描述成自动生成可行折法 |
| 碰撞、厚度、摩擦、制造验证 | 动力学核心没有接触求解阶段，官方请求亦列碰撞检测；低应变或目标到达不证明无自交、正确层序或可制造 |
| 实验代码 | 静态/刚性求解切换、AO、当前三维 SVG 截图入口在 index.html 中被注释；存在文件或变量不等于可用产品功能 |
| VR | 首页明确提示可能已废弃；作者讨论也提到 WebVR 失效。当前桌面工作台不纳入 |
| 数值质量 | 瘦长三角面、过硬材质、突变目标和激烈抓取可能造成振荡或错误构型；应允许慢推、暂停、单步、复位及查看误差 |
| 硬件 | 原站要求支持相关 GPU 能力；本地继续保留 CPU 回退、规模限制、帧预算和发散提示 |

依据：[官方功能请求 #41](https://github.com/amandaghassaei/OrigamiSimulator/discussions/41)、[动态求解阶段](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/js/dynamic/dynamicSolver.js#L67-L156)、[注释的菜单入口](https://github.com/amandaghassaei/OrigamiSimulator/blob/master/index.html#L1037-L1067)。官方讨论是历史证据，当前功能判断同时参考公开源码，不能只凭旧评论推断状态。

## 本轮补充范围与后续优先级

| 优先级 | 范围 | 边界 |
| --- | --- | --- |
| 本轮 P0 | 完整材质项、Euler/Verlet、反向 -100～100%、每帧步数上限 | 不绕过已有步骤模式、失稳保护和 CPU/GPU 能力校验；参数不承诺与真实纸张常数等价 |
| 本轮 P0 | M/V/F/U/B 独立显隐、法向着色、可调应变上限和图例、背景色 | 纯显示设置不改变求解姿态，屏幕与导出使用一致状态 |
| 本轮 P0 | 保存显示/求解偏好；全局目标播放序列 | 保存需校验；新增“折叠/停留/删除/速度/循环”，保持与逐折痕步骤动画独立 |
| 本轮模块 | `simTargetAnimation.ts` 纯函数时间轴 | 每段 0.1～120 秒，最多 20 段，总长≤600秒；比例 -100～100；起点为当前比例；支持向后采样，不依赖 DOM/真实求解器 |
| 本轮 P0 | PNG 1×/2×/4×真实分辨率导出 | CPU/GPU均重新渲染，线宽与虚线段同步缩放；尺寸限制为单边8192像素、总计1600万像素；不改变屏幕尺寸或求解坐标 |
| 后续 P1 | 导出尺寸预览、文件名/比例/单位等 | 本轮保留现有FOLD/OBJ/STL/SVG数据语义，不把计划记作已实现 |
| 后续 P2 | 自动展示旋转、GIF/WebM 录制、SVG 导入更多高级选项 | 录制增加体积、编码和浏览器兼容性成本，本轮不引入 CCapture/GIF/WebM 依赖 |
| 不在本轮 | VR、纹理、glTF、自动折法、完整碰撞/纸厚/摩擦 | 不能通过增加 UI 控件声称已经实现 |

本轮独立模块验收：`npx --offline tsx --test tests/app/simulationPreferences.test.ts tests/app/simulationTargetAnimation.test.ts` 共 14 项通过；`npx --offline tsc --noEmit` 通过。时间轴覆盖当前起点、负目标、停留、端点、向后定位、空序列、非法数值和资源边界；偏好模块覆盖往返保存、未知字段、损坏记录、版本、默认值独立性和保存失败。测试仅用内存存储；偏好默认通过工作台 `preferenceStorage` 访问设置目录，key 为 `zhezhi.simulation-preferences.v1`，包装为 `{version:1,preferences:...}`，不保存模型、进度或运行状态。具体 UI、渲染、CPU/GPU 回归以主任务最终验收为准。

## 求解细节与本地参数的含义

| 项目 | 核实后的实现含义 |
|---|---|
| 轴向刚度 | 边的弹簧刚度按长度反比缩放，即 `k=A/L`；轴向约束控制拉伸和压缩，并非纸厚 |
| 折痕与面片抗弯 | 角约束刚度按边长正比缩放，即 `kθ=K·L`；M/V驱动折痕与平坦面片的K分别控制，不能把调低折痕硬度称作降低整张纸的抗弯刚度 |
| 面内刚度 | 约束三角形内角偏离初值的程度，抑制剪切；与面片间弯曲是两类约束 |
| 阻尼 | 邻接节点的速度差产生阻尼，原站角阻尼项被注释；它不是自碰撞排斥或纸间摩擦 |
| 时间步 | 原站由轴向最高固有频率估算稳定步长，本地再乘时间步倍率；不是根据碰撞或实时误差自动选择的步长 |
| 积分切换 | CPU切入Verlet先播种位置历史，避免首次跳动；两后端切换时释放正在抓取的顶点。Verlet暂不支持顶点塑形，步骤动画继续使用Euler和原有固定顶点 |
| 帧调度 | 本地保持6ms时间预算，默认自动上限为GPU96步、CPU240步；用户可另设8的倍数上限。单步仍精确推进20步 |
| 平均与最大应变 | 原站误差是节点邻边相对长度误差的平均；本地同时显示全体节点平均值与最大的节点平均值，二者都不是所有边的平均误差。GPU复用速度纹理读回并缓存，报告不新增读回 |

依据：[边弹簧](https://github.com/amandaghassaei/OrigamiSimulator/blob/main/js/beam.js)、[角约束](https://github.com/amandaghassaei/OrigamiSimulator/blob/main/js/crease.js)、[动态求解和时间步](https://github.com/amandaghassaei/OrigamiSimulator/blob/main/js/dynamic/dynamicSolver.js)。本地默认阻尼0.5、时间步倍率0.35保持原设置；“原站参数”材质预设采用原站四项刚度和阻尼0.45，同时保留本地帧预算。

本地实现保留M/V显式null目标角的严格输入限制，U线则按无驱动类别显示。放行null还涉及导入器对字段省略与显式空值的区分，本轮没有将二者混同为±180°。

## 本轮整体验收

| 检查 | 结果 |
|---|---|
| 相关单元回归 | 341项通过，包含设置、偏好、全局时间轴、平均应变、图像缩放、原有普通/步骤模拟、顶点约束 |
| 渲染一致性 | 147项真实WebGL2/CPU/SVG检查通过，包含M/V/F/U/B筛选、法向、热图阈值、反射视角 |
| 同源协议 | GPU、CPU各34项通过；固定80步时±50%姿态镜像误差为0，实际帧上限32生效，2×PNG为1600×1200且保持原800×600屏幕和坐标 |
| 完整界面 | 30项通过：材质实效、Verlet限制、分类显示、热图图例、负目标、停留/循环、手动中止、切页恢复、高清PNG及1000×720布局 |
| 原有步骤动画 | 单短痕44项、四组短痕23项、刚性及最大安全并行分组92项通过；起末100%语义、固定点、CP不写回及纸层间距关闭均保持 |
| 界面机械检查 | Impeccable检测无发现；桌面与1000×720截图已核对 |

界面入口为三维模拟底栏的“模拟设置”。本轮仅更新本地网页，不生成新安装包。所有浏览器测试使用独立会话和阻断工程API的隔离服务，没有操作用户工程存储或停止8787服务。
