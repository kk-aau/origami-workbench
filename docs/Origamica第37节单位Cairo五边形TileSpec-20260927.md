# 原版 `UnitCairoPentagonTile[δ]` 数值二维来源

原版 `Origamica 15.0.nb` 的 240722–240859 行、In[3281]/In[3283] 定义 `UnitCairoPentagonTile[δ]`，并令 `RenderTile` 以 `CairoPentagonAngles[δ]` 求单位边五边形，再作为 `PolygonTile` 输出。第 33 节的通用 `TileSpec`、`JoinTiling` 和第 38 节的 `JoinTilingPatches` 可携带该具名来源；保存的 In[3294]、Out[3294] 提供 δ=90° 的八块 Double Cairo 母图原点与旋转数值锚点。

| 核对项 | 实现与证据 |
| --- | --- |
| 单位几何 | `src/app/tileSpecs.ts` 的 `unitCairoPentagonTileVertices` 使用现有 Cairo 后端相同的闭合方程，在 `60°<δ<120°` 的非退化凸支路解出五条单位边。δ=90° 的五顶点是 `(0,0),(1,0),(1.4114378277661477,0.9114378277661477),(0.75,1.661437827766148),(0,1)`，与原版 Out[3294] 首块及后端已核锚点吻合。 |
| 编辑 | “自定义 → 拼块组合 → 原版 tilespec／整组对接”中的“原版类型”新增 `UnitCairoPentagonTile 底角`。选择时按当前首边生成单位五边形，可将底角 δ 调到 60.1°–119.9°；预览与拼块轮廓即时更新。 |
| 严格保存 | 工程保留 `tiletype:'UnitCairoPentagonTile'`、`cairoAngle`、单位局部顶点、位移、旋转和缩放。`readTileSpecs` 按 δ 重新计算几何，并复核整个保存网格；改动角度、顶点、添加未识别表达式或多余来源字段会拒绝。组间 `JoinTilingPatches` 可以把已放置 Cairo 拼块当作普通数值拼块整体对接。 |

验证：`node --import tsx --test tests/app/tileSpecs.test.ts tests/app/joinTilingPatches.test.ts` 23/23，`npx tsc --noEmit` 通过。浏览器单块由正方形按首边切换 Cairo，δ 改为 100°，逐级“采用 tilespec 变换”→“采用拼块组合”→“采用折痕副本”→“保存工程”；隔离文件 `output/join-patches-browser-20260927/projects/c9a6f537-22ec-47a2-8961-0288921108ff.json` 有五条轮廓边和具名 δ=100° 来源，生产 `readTessParams` 回读成功。

当前合同只覆盖可稳定比较的数值二维来源。原版任意 Wolfram 符号表达式及 `RenderTile` 的一般 `Graphics3D` 语义没有因此实现；Cairo 拼块本身仅是母结构，不能由源轮廓直接推断扭转折痕或平折层序。
