# Origamica 第 35 节：T 接缝不能按原版 `MonolithicEmbedTiling` 自动细分

结论限于原版第 35 节的**逐块多边形扭转 + 整片合并**语义。一个长拼块边邻接两个短拼块边的 T 接缝，不能仅靠 `MonolithicEmbedTiling` 的合并选项产生与原逐块装饰等价的整片 CP／FF；当前逐块构造拒绝它是必要门禁。用户仍可重新划分母拼块，使所有相邻单元共享完整边，然后逐项检查平折条件。这里的八单元示例保持同一个外纸张矩形，但已不是原来的三拼块构造。

## 原版源码链

依据 `tmp/Origamica-15.0-reference.nb`：

| 保存行 | 可执行行为 | 对 T 接缝的影响 |
|---|---|---|
| 212240–212430，`PolygonTwistTile` 的 `TGraphAssigned` | 对每个源多边形边 `(P,Q)` 构造两个边界褶线端点，比例分别为 `(1−w)/2+d`、`(1+w)/2+d`；其后以相邻射线交点求中心顶点。 | 每条非退化边恰有两个内点，增加边的数量会改变褶线构造。 |
| 221988–222212，`MonolithicEmbedTiling` / In[2982] | `EmbedTiling` → `MergeGraphAssigneds[... KillMergedEdges→kme]` → 可选 `CollinearCleanupGraphAssigned` → `RebuildPlaneGraph`。In[2984] 的二维平折分支同样先合并、清理、重建再 `FoldGraph2D`。 | 没有“将边按另一拼块顶点／褶线端点切分后重算装饰”的步骤。 |
| 77066–77215，`MergeGraphsData` / In[1225] | 先 `Indexify` 顶点；每条边只用完整端点对 `tedge` 或 `Reverse[tedge]` 在已合并边表中执行 `Position`。`KillMergedEdges=True` 只删重数为 2 的同一完整边。 | `{A,C}` 不会与 `{A,B}`、`{B,C}` 识别成一条共享边。 |
| 82253–82440、83065，`AddTPlaneGraphTo` / `RebuildPlaneGraph` | 重建面数据要求输入图已连通、所有顶点度数至少 2、无交叉边；`RebuildPlaneGraph` 只是关闭已有面警告的 `AddTPlaneGraphTo`。 | 面重建不是 T 接缝平面化或半途折痕的修复器。 |

笔记本另有 `SplitEdges`（84766–84898 行），但定义是沿**已存在的边**切开 `TPlaneGraph` 并复制拓扑，返回的也只是新索引表；它不按几何内点把一条边分成两段，且没有在上述 `MonolithicEmbedTiling` 链中调用。

**构造反例。** 纸张为 `[0,2]×[0,1]`，左侧是 `[0,1]×[0,1]` 一块，右侧是 `[1,2]×[0,1/2]` 与 `[1,2]×[1/2,1]` 两块。共边 `x=1` 的左侧是长度 1 的一整边，右侧是两条长度 `1/2` 的边。取源例可用的 `w=1/5,d=0`：沿该共边从下到上的归一化坐标，长边的两个褶线端点是 `{2/5,3/5}`；两短边合起来有 `{1/5,3/10,7/10,4/5}`。这四点与长边两点无一重合。更一般地，只要每条短边符合合法的 `0<(1−w)/2+d<(1+w)/2+d<1`，第一条的两点严格落在 `(0,1/2)`，第二条的两点严格落在 `(1/2,1)`，因此短边一侧始终有 **4 个不同的褶线端点**；长边一侧只有 **2 个**，至少 2 个无法配对。即使额外平面化边界线，也会留下单侧终止的内部折痕；延长或重新求褶线已改变原装饰。`KillMergedEdges` 删除完整重复边和 `CollinearCleanup` 删除同型共线二度点均不能填补这些折痕。

单纯在左源多边形长边中点插入一个顶点也不构成原算法的等价修复：`PolygonTwistTile` 需对每对相邻边的旋转射线取交点；中点处相邻两边共线，射线交点不唯一。工作区 `polygon_pleat_tile` 因此明确报“相邻边不能共线”。若将左边真正拆成两个非退化凸单元，各单元边界褶线应从拆分后的新单元重新计算，中心折痕数、源拼块数和赋型都改变了，不可称为原三拼块输出。

## 已验证的安全替代

把同一 `[0,2]×[0,1]` 外形重划为 `4×2` 个边长 `1/2` 的方块，给各块原版 `PolygonCenteredTwistAltTile` 对应的 `w=.18, α=30°` 与交错 `V/M` 中心型，显式采用 `KillMergedEdges=True`、共线清理。现在每对相邻边在母网格中确实是一条完整共享边，整片结果为 60 顶点、104 边、45 面；几何、局部平折条件均通过，二维平折闭合误差 `1.6×10⁻⁹` 以下，每个面的任意两点距离与 CP 一致。这只证明该重划后有**静态整片 CP／FF 候选**；不证明原三块 T 接缝有同样结果，也不宣称全局层序、无碰撞运动路径或实物可折。

专项验证：在 `workbench/backend` 运行 `..\.venv\Scripts\python.exe -m unittest test_tessellation_tile_t_seam_source_audit test_tessellation_tile_patch -q`，目前 19 项通过。`test_tessellation_tile_t_seam_source_audit.py` 固定精确有理数端点反例、三拼块拒绝、共线顶点拒绝，以及八方块重划后的 CP／FF 不变量。没有可读取的原版 T 接缝成功保存输出，因此没有以本地八单元数值冒充 Wolfram `Out`。
