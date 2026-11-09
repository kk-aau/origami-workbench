# 第 46 节 Flasher Y/Z 首扇区保存对角线 · In[4125]/In[4127]

## 原件与范围

只读原件 `tmp/Origamica-15.0-reference.nb` 的 `FlasherSectorDiagFoldLinesY` 定义是 In[4124]（约 344665–344696 行），紧接着的保存图形 In[4125] 在约 344705–344750 行。`FlasherSectorDiagFoldLinesZ` 定义是 In[4126]（约 344787–344815 行），保存图形 In[4127] 在约 344824–344870 行。两幅保存图都固定 `r=3,h=2,m=5,k=0,n=r h=6`，组合首扇区已有折线、对角线及顶点标签，并用 `FlasherDefaultCPRules[p,m]` 代入初始二维坐标。笔记本没有可机读的数值 `Out`，这里仅按源公式核对，不声称 Wolfram 逐点比对。

| 源函数 | 原式选择 | 保存例 21 个四边形的线型 |
| --- | --- | --- |
| Y，In[4124] | `FlasherSectorQuads` 每面顶点 `{1,3}` | 21 条 1–3；首条 `(1,0,0)→(0,1,0)` |
| Z，In[4126] | 同一四边形每面顶点 `{2,4}` | 21 条 2–4；首条 `(0,0,0)→(1,2,0)` |

两函数均按原 `FlasherSectorQuads` 的数组顺序输出，即主网格 12 面（行长 6/4/2）在前，次网格 9 面（行长 5/3/1）在后。次网格第一面的跨扇区缝边经过 `FlasherWrapRules` 后，Y 端点是 `(2,0,4)→(0,1,0)`，Z 是 `(1,0,4)→(1,2,0)`。Y/Z 每面对角线互补，初始种子上两端点均不同且无零长。文中数值与计数来自源公式和本地函数，不是原版数值 `Out`。

## 现有实现与本次补齐

`backend/tessellation_flasher.py` 原已实现通用 Y/Z `flasher_ideal_cp_seed`，`backend/tessellation_flasher_solver.py` 另有 `MakeFlasher` 有界 CP／FF 求解；后者的保存例 In[4194]/In[4195] 分别是 **r=2,h=2,m=4,dr=.05,Y** 与 **r=2,h=2,m=5,dr=.1,Z**，和本页首扇区绘图参数不同。本次新增 `backend/tessellation_flasher_yz_saved_topology.py` 和 `src/app/flasherYzSavedTopology.ts`，固定 In[4125]/In[4127] 的 21 面、源顺序、端点编号及 In[4099] 初始坐标。TypeScript 版本共用已核准的 X 四边形来源，重新按原 Y/Z 源序选择对角线；Python 版本直接复用现有四边形与初始坐标函数。

进入「镶嵌设计 → 空间构造 → Flasher 旋转折叠 → Y/Z 对角线保存例 · 只读拓扑」。Y 为初选，可切换 Z、X，查看 21 条线、主／次网格、行列和端点。浅色四边形只用于定位，不代表已解折痕。弹窗不写画布、工程或撤销记录。

这个**保存图形预览**只有初始二维种子，不在弹窗内求解 CP／FF、分配山谷、检验逐面等距或层序。已有 MakeFlasher Y/Z 候选是独立求解流程，不能把这 21 条种子线当作其证书。此预览不导出精确 FOLD，也不可采用。

## 验证

- Python 专项 `backend/test_tessellation_flasher_yz_saved_topology.py`：4 项，核原输入和次序、逐条选端与初始坐标、缝边锚点、非求解能力。
- TypeScript 专项 `tests/app/flasherYzSavedTopology.test.ts`：4 项，固定 Y/Z 各 21 条端点标签并核互补性和能力边界。
- `npx tsc --noEmit`、`npm run build`、Chrome 1000×720 / 390×720 的入口、Y/Z 切换、筛选、只读和关闭后本地工程状态验收。
