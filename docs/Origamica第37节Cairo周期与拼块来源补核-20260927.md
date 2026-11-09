# Origamica 第 37 节 Cairo 周期与拼块来源补核

核对范围为原笔记本 240535–241460 行的 `CairoPatch`、`DoubleCairoPatch`、`CairoLatticeVectors` 和 `DoubleCairoLatticeVectors`。原版 `JoinTiling`（207914–208332 行）输出的是有序 `UnitCairoPentagonTile` 规格；每项同时携带底角、嵌入位移、旋转和缩放。此前工作区的 Cairo 后端只保留嵌入后的多边形与周期向量，`source.periodicCell` 因而丢失了这层可审计的拼块来源。

本轮在 `cairo_cell` 的 `tileSpecs` 中补回 4 块 Cairo 和 8 块 Double Cairo 的有序规格。每块使用独立的单位五边形顶点，底角严格依照原版 `δ, 180°−δ` 排列；位置来自实际边对边拼接，旋转按原版 `ScaleRotationOffset` 的 `ArcTan[dot,cross]` 主值计算。原版保存的 `DoubleCairoPatch[90°]` 数值 `Out[3294]` 中，第 3、7 块的等效半周角分别为 `−180°`、`+180°`，新规格保留这两个代表值。已有多边形、周期向量和纸面/平折路径未改。

| 原版来源 | 本轮核对 | 证据等级 |
| --- | --- | --- |
| `In[3285] CairoPatch[δ]` | 4 块的角度顺序为 `δ,180°−δ,δ,180°−δ`；每项规格重新嵌入后与输出多边形重合。 | 保存输入公式与数值几何不变量。 |
| `In[3293] DoubleCairoPatch[δ]`、`Out[3294]` | 8 块角度顺序、`δ=90°` 的八个位移和旋转与保存数值匹配，绝对误差约 `10⁻¹²`。 | 原版保存数值输出。 |
| `In[3289] CairoLatticeVectors[δ]` | 周期向量分别取拼块顶点 `(4,5)→(1,3)`、`(4,5)→(3,2)`。 | 保存输入公式与坐标差核对。 |
| `In[3296] DoubleCairoLatticeVectors[δ]` | 周期向量分别取 `(3,2)→(1,3)`、`(4,5)→(5,3)`。 | 保存输入公式与坐标差核对。 |

在 `δ=70°、90°、98.707370271°、105°` 分别核查了拼块来源、数值重新嵌入和两种周期向量；在更靠近合法端点的角度还做了周期覆盖及几何检查。`backend/test_tessellation_cairo.py` 与 `backend/test_tessellation_paper_cairo.py` 共 7 项通过。原版仅在 `90°` 保存了可逐项比较的 Double Cairo 数值规格；其他角度以输入公式和几何不变量核对，不宣称 Wolfram 数值逐位等价。此处补的是拼块来源信息，不代表 Cairo 任意底角已有可用平折赋型或全局层序证明。
