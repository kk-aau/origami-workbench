# 第 46 节 X 棋盘斜线到静态 CP/FF 的有界数值链

原版 `tmp/Origamica-15.0-reference.nb` 的 In[4122]（约 344385–344547 行）定义 X 棋盘斜线，In[4123]（约 344585–344629 行）**只保存首扇区初始二维图**，固定 `r=3,h=2,m=5,k=0`；它没有 `dr`、赋型阈值或 `MakeFlasher` 数值 Out。In[4128]/[4129]（约 344925–344956 行）把 `FlasherSectorDiagFoldLines` 定义为可传递选项，In[4169] 的 `FlasherIsometryFns` 将它传给折线系统，In[4193]（约 349413 行起）的 `MakeFlasher` 又将同一选项传给求解及绘图。因此把 X 作为求解器的选项有源式依据，但**下面的 X 解不是原版保存的 X 求解输出**。

工作区的「X 棋盘 CP/FF · r3/h2/m5」一键入口采用上述固定拓扑，另外明确选择**本地** `dr=0`、`TypeMinimumAngle=10°`。`dr` 与阈值都可在入口载入后调整，选择它们不意味着 In[4123] 曾保存这些数值。原「X 对角线保存例 · 只读拓扑」弹窗仍只展示原初始图；两入口的图与证书分开。

`backend/tessellation_flasher.py` 按 In[4122] 的主／次网格行长和 `Mod[col+(h−1)(row−1)+1,2]` 选择 X 斜线；固定源例逐条与先前独立的 21 条端点标签对照。该拓扑同时供 `flasher_ideal_cp_seed` 的三角剖分和 `tessellation_flasher_solver.py` 的等距方程使用。求解部分沿用已核查的 In[4193] CP 朝向、边长、FF 平面投影、外圈高度与中心高度方程；全扇区重建后仍检查每个三角面的面积、方向、边长、面邻接及最终二维几何。未通过任一门禁即拒绝候选。

| 本地 X 数值输入 | 点／边／面 | 等距方程残差和 | 全面最大边长误差 | 二维几何 | 层序 |
| --- | ---: | ---: | ---: | --- | --- |
| 固定源拓扑 `r3/h2/m5`，本地 `dr=0`、阈值 `10°` | 140／380／241 | 约 `1.24e−14` | 约 `2.44e−15` | passed | not_checked |

此外 `dr=.05` 和 `.1` 在同一源拓扑下也分别收敛，二维几何通过，逐面等距误差约 `2e−15`；它们只是本地参数敏感性检查。当前参数读回仍受现有 `r,h∈[1,3]`、`m∈[3,8]`、面数不超过 600、`dr∈[0,.5]` 等工程界限约束，其他输入必须各自通过方程及几何门禁，不能从固定例外推全域可解。

求得的 CP 与 FF 同索引，三角面逐片等距；工作区可以把它作为**静态三维候选**采用。`layerOrder` 保持 `not_checked`、`local` 为 `not_applicable`，不声称平折层序、连续折叠路径、无自碰撞或原 Wolfram 逐点 Out。入口与普通 Y/Z 求解共享已存在的工程保存／恢复字段；X 选项在 TypeScript 和后端均能严格读回。

专项：`backend/test_tessellation_flasher_x_solved.py` 校验 21 条源斜线进入求解方程、140／380／241 面图、后端完整生成路由、全面等距和几何／层序门禁；`tests/app/flasherParams.test.ts` 校验 X 参数的工程读回。相关原 Y/Z 求解回归一并运行。1000×720 与 390×720 真实浏览器各 9 项通过，包括真实 `/api/tessellate` 返回、参数显示、静态采用门禁、采用后恢复工程参数；证据见 `output/playwright/p46-flasher-x-solved-browser-report-1000.json` 与 `output/playwright/p46-flasher-x-solved-browser-report-390.json`。
