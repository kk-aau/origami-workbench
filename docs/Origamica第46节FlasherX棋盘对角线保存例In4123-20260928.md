# 第 46 节 Flasher X 棋盘对角线 · In[4123]

## 原版证据与实现边界

只读原件为 `tmp/Origamica-15.0-reference.nb`。`FlasherSectorQuads` 在约 343473–343585 行，`FlasherSectorDiagFoldLinesX` 在约 344385–344547 行；保存的 `In[4123]` 位于约 344585–344629 行。保存调用令 `r=3,h=2,m=5,k=0,n=r*h=6`，以 `FlasherDefaultCPRules[p,m]` 绘制首扇区已有折线、X 对角线和顶点标签。前文约 344376–344379 行将 X 称为原 LLNL 排列。笔记本没有可机读的此例数值 `Out`，本实现按源式推导，不声称 Wolfram 逐点比对。

现有 `backend/tessellation_flasher.py` 的 `flasher_sector_quads` 和 `flasher_default_cp_point` 提供四边形顺序与初始二维种子坐标；新增 `backend/tessellation_flasher_x_topology.py` 独立返回 X 线型，前端 `src/app/flasherXSavedTopology.ts` 复刻同一固定输入供纯本地预览。它们不调用 `MakeFlasher`、Y/Z 求解器，也不返回 FOLD 面／边图。

## 可复核的组合结果

| 来源规则 | 保存例结果 |
| --- | --- |
| 原四边形数组先主网格、后次网格；`nmajor=(Length[fsq]+r)/2`，`nminor=nmajor-r` | 21 个四边形，主网格 12、次网格 9 |
| 主网格每行从 `r h` 开始减 `h`；次网格从 `r h−1` 开始减 `h` | 主行长 `6/4/2`；次行长 `5/3/1` |
| X 函数先输出次网格，后输出主网格 | 源四边形索引 `12…20,0…11` |
| `MapIndexed` 对行列选择：`Mod[col+(h−1)(row−1)+1,2]==0` 时取顶点 1、3，否则取 2、4 | h=2 时取 1、3 当且仅当 `col+row` 为偶数；两型分别 11、10 条 |
| `FlasherWrapRules` 对首扇区外编号作周期缝合 | 第一条四边形编号 `(2,0,4),(1,0,4),(0,1,0),(1,2,0)`；X 端点为 `(2,0,4)→(0,1,0)` |

21 条对角线的端点标签在 TypeScript 专项中逐条固定，Python 专项逐条与既有原式四边形及理想 CP 坐标核对。每条端点不同，初始种子对角线无退化；此为**拓扑和初始位置**检查，不是折痕图可用性或折后等距证明。

## 工作区入口与能力边界

进入「镶嵌设计 → 空间构造 → Flasher 旋转折叠」，点击「X 对角线保存例 · 只读拓扑」。弹窗固定保存参数，初选 21 条 X 对角线，并可切到同参数 Y/Z 保存图；可筛次／主网格并查看行列、源四边形和周期缝边标签。浅色四边形轮廓仅辅助定位，不作已解折痕。弹窗不修改当前画布、工程或撤销记录。

此 X **初始预览自身**没有求出山谷赋型、三维折后面、逐面等距或整片层序；原始初始 CP 线段长度不能代替这些证书，故此弹窗不导出精确 FOLD，也不能采用为折痕工程。另有独立的 [X 静态 CP/FF 数值链](Origamica第46节FlasherX静态CPFF数值链-20260928.md)，在本地选定 `dr=0` 后求解并逐面认证；不能把其结果称作 In[4123] 保存的数值 Out。

## 验证

- `backend/test_tessellation_flasher_x_topology.py`：4 项，覆盖原输入与分区顺序、棋盘奇偶、缝边坐标和非求解状态。
- `tests/app/flasherXSavedTopology.test.ts`：5 项，另固定 21 条 X 的全部端点标签。
- `npx tsc --noEmit`、`npm run build`、桌面与窄屏真实浏览器的只读入口及筛选／关闭验收。
