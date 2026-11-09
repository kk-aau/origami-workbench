# 第 43 节 `MakeAltMoselyPot` 历史保存例

原笔记本 `tmp/Origamica-15.0-reference.nb` 第 272048 行将所在类标为 `TRotationalPot [deprecated]`。但 `MakeAltMoselyPot` 仍有明确定义 In[3556]（约 276530–276766 行）及两组保存展示调用 In[3557]、In[3558]（约 276798–276933 行）。因此工作区提供**历史只读显示**，不把 deprecated 类重新计作稳定、可采用的镶嵌构造。

| 保存输入 | 剖面 `[半径, 高度]` | 旋转阶数 | 源码轴点处理 |
| --- | --- | ---: | --- |
| In[3557] | `(0,0)→(1,1)→(1,2)→(2,3)` | 8 | 原式在末端附加 `(0,3.0001)`；高度 `ht=3` 仍取原始剖面。 |
| In[3558] | `(0,0)→(1,0)→(2,√3)→(1,2√3)→(0,2√3)` | 6 | 首末半径均 0，不加点；双向首段均为平底。 |

In[3556] 对原剖面和反向剖面分别调用 `MakeMoselyPot`，各提取 `CreasePatternSplitWedge`、`FoldedFormSplitWedge`。本地只转写保存使用的 `CreasePatternBoundary→Default`、`MinimumAngle→10°`、`FoldedFormGapSize→0.05`。每个 SplitWedge 的二维点列 `e,f,g,i,j,k`、三维点列及五条带面依照 `MakeMoselyPot` In[3546]（约 273397–274275 行）的公式计算；平底时按 `fbfn` 删去纵向折线的首点。横向折线按 In[1691] 的 `StyledFoldLine` ±10° 阈值分 M/V/F。

二维第二半片使用原式 `w(cos 2φ,sin 2φ)+ReflectionYMatrix2D·RotationMatrix2D[-2φ]·p`，其中 `φ=π/m`、`w` 是第一 SplitWedge 的最大 x（在保存域内等于剖面累计弧长）。`ReflectionYMatrix2D` 的确切矩阵由原版 In[303] 确认为 `diag(-1,1)`；不能按函数名称猜成 y 取负。两半片再平移 `w·i(cos 2φ−1,sin 2φ)`，`i=0…m/2−1`，最后整体旋转 `−φ`。三维第二半片绕 Z 转 `2φ` 并加 `(0,0,ht)`，同时反转面点序；双片各绕 Z 再转 `4πi/m`。接口返回正反两片以及完整重复的显示折线和四边面。

| 项目 | 本地结果与证据 | 限制 |
| --- | --- | --- |
| In[3557] | 末端轴点 `+0.0001`、272 条完整二维显示线、160 个四边显示面；Python/TS/API 专项通过。 | 保存展示没有可机读的 Wolfram 顶点 Out，数值由源码公式重建。 |
| In[3558] | 无轴点补齐、180 条完整二维显示线、120 个四边显示面；Python/TS 专项通过。 | `√3` 在有限浮点下计算；只验保存的 Default 外缘。 |
| 交替变换 | TS 响应读回逐条核对二维 `m/2` 平移及三维 `m/2` 旋转；Python 核对来源锚点、偶数阶、反向面、翻面及边界。 | 只读历史图形，不传入 `/api/tessellate` 候选，不导出 FOLD。 |

请求为 `POST /api/tessellation/alt-mosely-pot-reference`，体为 `{"family":"alt-mosely-pot-reference","example":3557|3558,"sectors":4..16 的偶数}`。修改 `m` 是在同一保存剖面上按原式重算的有限数值变体，只有默认 `m=8/6` 才是保存输入。UI 从“镶嵌设计 → 空间构造 → 交替 Mosely 壶体 · 历史只读”进入，可切换保存例、偶数旋转阶数、完整拼接／双楔片、三维正交视角；关闭不改工程。

`FoldedFormGapSize=0.05` 是原函数的展示间隙，三维显示面不是与二维纸面同一张无缝、严格等距的物理模型；首末轴点处也会出现退化四边形。原笔记本并未给出完整纸面几何、层序、无自交或制造认证。本入口明确 `exactFOLD=false`、`adoptableCreasePattern=false`、`selfIntersectionChecked=false`、`manufacturabilityChecked=false`。原版其余 `CreasePatternBoundary=Circle/Closed`、`CircleDivisions`、`FoldedFormGapSize`/`MinimumAngle` 任意值及自由剖面暂未接入；这些不能用两张保存图推断已复现。

专项：`backend/test_tessellation_alt_mosely_pot_query.py` 4/4、`tests/app/altMoselyPotReference.test.ts` 4/4、`tests/server.test.mjs` 的 `deprecated MakeAltMoselyPot` 1/1，`npx tsc --noEmit` 通过。真实 Chrome 在隔离服务和 1000×720 视口从空间构造入口打开：In[3557] 272 线／160 面、In[3558] 180 线／120 面；m 改 8 后 160 面，双楔片 60 线／40 面；三维视角可调，奇数 m 时两张图清空并显示错误。弹窗及各分栏的 `scrollHeight=clientHeight`、`scrollWidth=clientWidth`，页面无 `pageerror`。关闭后原 `radial-pot` 家族、折痕画布 `viewBox` 与 202 条 SVG 线／路径均未变化。截图和机器报告见 `output/playwright/alt-mosely-in3557-1000x720.png`、`alt-mosely-in3558-1000x720.png`、`alt-mosely-browser-report.json`。
