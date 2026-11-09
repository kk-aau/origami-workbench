# Origamica 15.0 接入镶嵌工作区：初步评估

结论：可以接入镶嵌设计功能，但需要选择“调用 Wolfram 内核”或“独立实现算法”路线。当前只是静态源码检查，尚未在 Mathematica 中执行或验证结果等价性，不承诺整个笔记本可自动转换。

## 已检查的材料

- 用户提供：`D:/11312/Downloads/Origamica-15.0.nb_/Origamica 15.0.nb`，16,260,068 字节，包含可读 Wolfram Notebook 表达式、源码、说明及示例。
- 提取到 53 个 Section 标题；内容不止镶嵌，还包括通用几何、图结构、平折与三维、曲线折叠、伸缩折叠等。
- `__MACOSX` 不是本次算法移植的入口，未作为程序依赖处理。
- 现有工作区：`backend/tessellate.py`，本地 Pleat 后端，square／triangle／hexagon 三类母结构与 rings／angle／scale 参数，输出几何供预览和编辑。

## 镶嵌相关模块

| 源文件章节 | 可接入的设计能力 | 建议顺序 |
| --- | --- | --- |
| Twists / Twist tiles / Unit polygon tiles | 多边形扭转、中心扭转、偏置及分裂扭转单元 | 第一批 |
| Patches and periodic tilings | 单元拼块、周期阵列、阿基米德等平铺 | 第一批 |
| Primal-dual twist tessellations | 原始图与对偶图、缩放旋转、参数化折痕与折后形 | 第一批 |
| More tilings / Nonperiodic tilings | Voronoi／Delaunay、Penrose 等非规则母结构 | 第二批 |
| Primal-dual flagstone tessellations | 平行褶铺石镶嵌 | 第二批 |
| Ring tessellations / Woven tessellations | 环状传播、线组与宽度控制的编织镶嵌 | 第二批 |

源码可见的入口例子包括 `MakeRingTessellation`、`CircularPolygonTwistGraph2D`、`MakePrimalDualTwistTessellationEdges`、`MakeSimpleWovenTessellation`。它们还依赖笔记本自己的图对象体系与几何函数，不能只取同名函数孤立运行。文件含 Solve／FindRoot／FindMinimum／NDSolve 以及 Manipulate／DynamicModule；独立移植需要分别处理数学计算和交互显示，不是替换语法即可。

## 两种实现路线

1. **本地内核接入**：中文工作区收集参数，由本机 Wolfram 内核执行所需 Origamica 函数，适配器提取顶点、边、山谷等结构化结果并导回工程。更适合先建立原版对照结果，但运行机器仍需要可用且适当授权的 Wolfram 内核；笔记本依赖的前端功能需单独检查。
2. **独立实现**：将选定算法实现为现有 Python／TypeScript 计算模块，用原版示例做数值和拓扑对照。适合最终保持当前免安装、离线使用体验。先实现镶嵌所需依赖，分模块验证，而非一次重写全部 Origamica。

工作区建议统一为：母结构或扭转单元 → 周期／拼接与参数 → 折痕及折后预览 → 山谷和几何检查 → 采用可编辑副本 → 保存或导出。复用已有工程与撤销机制；原版折后形和本项目平折引擎的求解结果需要分别标明来源。

## 许可与验收

笔记本开头明确声明 CC BY-NC 4.0。直接复用或翻译源码应保留署名、标明修改并遵守非商业限制；翻译为另一种语言本身不消除这些要求。当前项目标注 GPL-3.0-only，不能直接把这部分当作同样许可的代码并入发布。分模块存放也不自动解决许可；直接移植前应明确使用和发布方式，必要时取得额外授权。

验收应使用原版产生的参考数据：同一输入下核对顶点／边／面、山谷、边界、局部条件和退化错误，再验证工作区参数修改、取消、采用副本、撤销及文件往返。未运行的功能或仍标记 IN PROGRESS 的原版模块不能标作已完整支持。

参考：

- Robert J. Lang：[Tessellatica / Origamica](https://langorigami.com/article/tessellatica/)
- [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)
- Wolfram：[Python 本地内核调用](https://reference.wolfram.com/language/workflow/EvaluateAWolframLanguageExpressionFromPython.html.en)
