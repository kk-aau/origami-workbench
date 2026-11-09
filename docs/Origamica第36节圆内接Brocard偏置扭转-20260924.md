# Origamica 第 36 节：圆内接 Brocard 偏置扭转具名拼块（2026-09-24）

原笔记本 `tmp/Origamica-15.0-reference.nb` 的 `UnitCyclicBrocardPolygonOffsetTwistTile` 具名参数为 `{n,angle1,angle2,i1,i2}`、褶宽 `w`、偏移 `d` 和逐边中心 `types`（227225–227239 行）。说明正文 227245–227258 行把内层列表误排成 `{angle1,i1,angle2,i2}`，漏掉 `n` 且变更次序；真正的 `RenderTile` In[3047]（227393–227449 行）和保存 In[3048]（227456–227538 行）都使用 `{n,angle1,angle2,i1,i2}`。本项目 [具名模块](../backend/tessellation_unit_cyclic_brocard_offset.py) 按代码与保存输入的顺序接收该列表，角位置沿用原版 **1 起算**，再转换成现有 Brocard 求解器的 0 起算索引。

In[3047] 在 `Sign[w]==Sign[d]` 时调用 `UnitCyclicBrocardPolygonInfoCCW`，否则调用 `InfoCW`，随后只把所得顶点交给 `PolygonOffsetTwistTile[verts,w,d,types]`。通用偏置拼块 In[2919]（215823–215842 行）把褶角固定为 `π/2`，由 `d>0` 决定逆时针赋型。本模块限 `w>0`，所以正偏移选源版 InfoCCW、负偏移选 InfoCW。原版 InfoCCW 的 Brocard 点公式 `r₁=sin α/sin θ₁`、方位 `θ₁−α`（24855–24872 行），InfoCW 则取方位 `π−α`（25271–25290 行）。现有数值 `cyclic_brocard_polygon` 对相同顶点的 Brocard 点使用相反的 `clockwise` 标签约定：源版 InfoCCW 对应其 `clockwise=True`，InfoCW 对应 `False`。具名适配层按**点坐标公式**显式映射，另按偏移符号指定褶线赋型方向，不把两套命名混同。

保存 In[3048] 给 `n=5,angle1=110°,angle2=90°,i1=1,i2=2,w=.2,d=±.15,types=MMMMM`，第二块经 `JoinTiling` 的 `{1,2,2}` 让双方第 2 边反向重合。其后调用 Tiling、CreasePattern、FoldedForm2D 绘图；该处没有可比较的 Wolfram 点、边、面数表或折后坐标 Out。独立数值求解得到五个内角约为 `[110°,90°,96.384883418°,118.591690501°,125.023426082°]`，正偏移按源 InfoCCW 点公式求得 Brocard 点约 `(0.451860651594,0.711891888172)`、角 `52.404608303°`；负偏移按源 InfoCW 点公式求得局部点约 `(0.372199361018,0.483391142529)`、角 `127.595391697°`。本项目两种方向求得的外顶点差小于 `10⁻¹⁰`，且都满足所给角、共圆和对应 Brocard 点公式。上述数值是本项目按源码约束求出的候选；未得到原版数值顶点 Out，故不声称与 Mathematica 绘图逐点等价或全局唯一解。

正负偏移单片各得 20 点、30 边、11 面；半周旋转第二片并删除共边后，双片 CP 为 34 点、52 边、19 面。每片中心环保留 `MMMMM`，每条边上褶线端点精确对应 `(1−w)/2+d`、`(1+w)/2+d` 的边长比例，褶线与边垂直。CP 无零长、重复或交叉边，局部 Kawasaki/Maekawa 条件通过。逐面 180° 反射的 FF 保持每面所有顶点对距离，闭合误差约 `6.12×10⁻¹⁰`。[专项测试](../backend/test_tessellation_unit_cyclic_brocard_offset.py) 对这些性质及来源点公式和索引契约做可复跑检查。

[层序脚本](../scripts/verify-unit-cyclic-brocard-offset-in3048.ts) 将当前产品管线的 CP 与具名模块逐点、逐边、逐赋型和逐面对照后，得到 `computeFlatGeometry=ready`。拼合 CP 的第 **7、10** 号面本身为凹面（按当前规范化面序从 0 起算），初次审计曾因凸面门禁返回 `unsupported`；后续[受限原面统一层序](受限凹面层序生产接入-20260924.md)已接入，当前 `recomputeFlatLayers` 为 **`solved`、精确 1 解**，原几何不变，329 个原面局部区域的正背面均有序。三角片只生成覆盖约束、没有独立层变量，输出恢复原面编号与法向；没有一条全局绘制序。具名 Python 模块本身不求层序，仍返回 `adoptable=False`、`layerOrder=not_checked`，实际采用须验证当前输入的 Worker 结果。没有 Mathematica 数值 Out 逐点等价、连续无碰撞折叠路径或有厚度纸张可制造性主张。

从 `workbench` 运行 `.venv\Scripts\python.exe -m unittest discover -s backend -p test_tessellation_unit_cyclic_brocard_offset.py`，再运行 `node_modules\.bin\tsx.cmd scripts\verify-unit-cyclic-brocard-offset-in3048.ts`。
