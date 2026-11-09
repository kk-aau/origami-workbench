# Origamica 第 37 节：双色 ArchimedeanPatch 目录与 In[3184] 偏置审计

原版 `tmp/Origamica-15.0-reference.nb` 在 `TwoColorableArchimedeanPatch` 命名空间只保存 n=1、2、8、9 四个稳定定义及对应的 2×2 纯平铺例（In[3156–3171]）。它们**不是普通 `ArchimedeanPatch[1..12]` 的通用改色开关**：n=1、8、9 复用各自普通来源几何，但另有逐片 parity；n=2 则重新接出两片单位正方形，普通 n=2 只有一片。`backend/tessellation_archimedean_patch_catalog.py` 让两类目录共用同一套单位正多边形反向接边和格点工厂，二色结果另外保留 `variant`、逐来源片 `parity` 与原片号。未定义的二色编号直接拒绝。

| n；原版定义／2×2 样例 | 来源面与接边 | 原版 parity | 格矢 `u；v` | `[0,1]×[0,1]` 母图 V/E/F |
| --- | --- | --- | --- | --- |
| 1；In[3156]／[3159] | 普通 n=1 的两正三角形，逐点别名 | `(+1,-1)` | `(1,0)`；`(1/2,√3/2)` | 9/16/8 |
| 2；In[3160]／[3163] | **两正方形**；第二片接边 `{1,2,1}` | `(+1,-1)` | `(2,0)`；`(1,1)` | 16/23/8 |
| 8；In[3164]／[3167] | 普通 n=8 的六片，逐点别名 | `(+1,-1,+1,-1,+1,-1)` | `(1+√3,0)`；`((1+√3)/2,(3+√3)/2)` | 37/60/24 |
| 9；In[3168]／[3171] | 普通 n=9 的三片，逐点别名 | `(+1,-1,+1)` | `(2,0)`；`(1,√3)` | 21/32/12 |

二色 n=2 的 In[3160]（233842–233882 行）明确指定 `JoinTiling[{{4},{4,{1,2,1}}}]` 和 `PatchVectors[patch,{1,1},{2,2},{1,3}]`。刚性接边后来源点表为 `[(0,0),(1,0),(1,1),(0,1)]` 和 `[(1,0),(2,0),(2,1),(1,1)]`；故格矢分别为 `(2,0)`、`(1,1)`，行列式 2 恰等于两方形面积。普通 n=2 的单方形格矢为 `(1,0)`、`(0,1)`，不能替代。四个二色样例均将两个整数闭区间取 `[0,1]`；当前母图按 `j2→j1→来源片` 保留顺序，所有来源顶点加 `j1·u+j2·v` 后与通用 `family=custom/customOutput=tiling` 请求逐点相符，几何检查通过。上述数值均由原版输入公式推得；笔记本只保存图形调用，没有可机比的数值 `Out`。

原版 In[3184]（234827–234889 行）单独用二色 n=2，保存 `w=.2、d=.1、parity=(+1,-1)、types=(M4,M4)`。本项目受限适配得到两片偏置 `(+.1,-.1)`、共同 `tilt=90°`。以单个**未裁剪的两方形来源 patch** 作整体嵌入并删除共享边、清理共线顶点后，工作区 CP 为 **24 顶点、38 边、15 面**，边赋型为 `B16/M15/V7`；几何、局部条件通过，逐面反射 FF 闭合误差约 `1.14×10^-15`，逐面顶点对距离保持。`scripts/verify-two-colorable-archimedean-patch2-offset-in3184.ts` 用具名二色工厂直接构造 CP，再独立以显式两方形和有符号偏置送入 `readTessParams → tessellate.py`；两侧顶点坐标误差 0，边、赋型、折角、面及来源片号逐项相同。

同一 CP 经工作区 `tessFlatInput → computeFlatGeometry → recomputeFlatLayers` 得到 **`flatGeometry=ready`、`layerOrder=solved`、恰好 1 个层序候选**。这是当前求解器对本项目所构造单 patch CP 的证书，不是原版保存的数值层序 `Out`，也不证明刚性运动路径、厚纸可制造性。原版 In[3184] 绘制的是 `EmbedTiling[patch,{CreasePattern,Tiling}]`；上述整体并边/共线清理是为工作区层序求解而施加的有界选择，不能把两入口身份当成与原版绘图逐点身份。

后续 In[3187] 的二色 n=2 Alt `w=.2,α=30°,M4/V4`，及 In[3188] 的偏置 `w=.2,d=.1001,M4/M4`，均先用 `[-2,2]×[0,3]` 重复，再裁 `[.1,3.9]²`。后续专项脚本已按原版保存输入使 40 片母结构先裁为 16 片，再逐块构造折痕；两例均得到 100/180/81 的 CP，工作区平折几何 ready、层序 solved，恰好 1 个解。原版 `PruneTiling` 未保存可机比的数值坐标 `Out`，因此这些是本项目实现的工作区证书，不能称为原版数值结果逐点复现。工作台入口及严格来源回读见《Origamica第37节双色ArchimedeanPatch工作台入口-20260927.md》。

专项回归为 `backend/test_tessellation_two_colorable_archimedean_catalog.py` 与上述两份 TS 层序脚本。前者从 `workbench/backend` 运行 `..\.venv\Scripts\python.exe -m unittest test_tessellation_two_colorable_archimedean_catalog -v`，覆盖四个目录项、别名逐点几何、n=2 新接边与周期公式、parity、In[3184] CP/逐面 FF、In[3187]/[3188] 裁剪和未知编号拒绝；后两者从 `workbench` 以 `tsx` 执行。
