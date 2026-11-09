# P16：`RenderTile` 二维图形指令审计与逐边方向

证据为 `tmp/Origamica-15.0-reference.nb` 中保存的输入和输出；行号按该文件原始文本计。这里仅核对 `TilingStyle` 与 `RenderTile[{PolygonTile, verts}, Tiling, opts]`，不把其他折痕图的 `Graphics` 样式套用到拼块装饰。

| 原版证据 | 实际指令与结论 | 工作台范围 |
| --- | --- | --- |
| In[2784–2785]，206525–206637 行 | `TilingText` 只指定文字色；`TilingLine` 指定线色、1 点绝对线宽、实线、圆端和圆角；浅／中／深填充分别是 `EdgeForm[]` 加 `FaceForm[Lighter[fill,.70/.50]]` 或 `FaceForm[fill]`。没有透明度、材质或任意绘图指令入口。 | 现有不透明 RGB 三色、浅／中／深填充和固定线样式；不接受任意 `Graphics` 指令。 |
| In[2860]，210965–211088 行 | `TilePolys` 生成 `Style[Polygon[verts], pt]`；`TileEdges` 逐边生成 `Style[Line[edge], TilingLine]`；箭头以 `MapThread[ea,{edges,et}]` 生成；中心标签用 `Text[ToString[ci], ctr]`，顶点编号用 `ToString[j]`。 | 保留现有二维多边形、边线、箭头和纯文字标签的渲染合同。 |
| In[2836/2838/2840/2842]，209931–210439 行；In[2852/2860/2862]，210779–210789、211006–211049、211223–211309 行 | DH／CH／DF／CF 四种箭头均用 `Style[Polygon[pts],TilingLine]` 绘制三角形，顶点按整条边向量乘以固定比例计算。`TileEdgeArrowDirs` 是逐边 `±1` 数值列表；原版将它直接传入箭头函数，**不含 M/V 折痕赋型**。In[2862] 保存输入为 `{1,1,-1,-1}`。 | 编辑器新增“方向箭头”，无须先选 M/V，即可逐边指定顺边 +1／逆边 −1；新箭头按原版比例绘制实心三角形。方向标记 `D` 和方向列表经项目 JSON 严格回读，顺逆时针轮廓映射后保持物理方向。旧工程 M/V 红蓝线箭头及其默认方向保留。 |
| In[2797]，207227–207241 行；In[2863]，211330–211370 行 | 已保存中心标签例是数值 `1` 和字符串 `"a"`。`ToString[ci]` 可接收更广泛的 Mathematica 表达式，但没有保存输出足以给出任意符号的可核对排版语义。 | 仅显示普通文字、自动数字编号和隐藏状态；不执行或解析任意 Mathematica 标签表达式。 |
| Out[2937]，217956–217993 行 | `Opacity[0.5]`、`EdgeForm[None]`、`FaceForm[RGBColor[.92,.85,1]]` 出现在 `CreasePatternGraphics[tobj] /. OrigamiStyle[]` 的保存输出，不是 `RenderTile[...,Tiling]` 或 `TilingStyle[]` 的输出。 | 不将这组透明纸面材质归入 P16 拼块装饰。 |

专项验证：`npx tsx --test tests/app/tileDecorations.test.ts tests/app/starTileDecoration.test.ts` 核对四种三角形的数值顶点、SVG 颜色与旧工程画法，In[2862] 无赋型方向列表的工程 JSON 往返、非法方向和标记拒绝、构造键不变，以及顺逆时针边映射；`npx tsc --noEmit` 核对编辑器与类型。此实现只覆盖有明确保存源码和数值输入的二维箭头，不声称等价于任意 `Graphics`、透明材质、富文本或符号排版。

真实浏览器复验：在自定义母拼块的装饰编辑器中选择原版边线色实心三角箭头，第一条边直接选“方向箭头”，无需赋 M/V，再设为“逆边 −1”；预览即时显示反向实心箭头。[纯方向箭头截图](../output/playwright/p16-direction-only-arrow-20260927.png)。旧 M/V 兼容预览另见[旧式箭头截图](../output/playwright/p16-origamica-tile-arrow-reverse-20260927.png)。

## 追加扫描：第 33 节是否还有可落地的保存图元

复查笔记本文本约 206283–210702 行的 `TilingStyle`、`RenderTile` 通用定义和实际保存输入：In[2786] 的测试图是 `Style[Polygon]`、`Style[Line]`、`Style[Text["A"]]`；In[2795/2797] 的 `TestTile` 只返回顶点、轮廓和普通数字中心／顶点标签；In[2853/2860] 的 `PolygonTile` 选项及主体只组装多边形、逐边线、现有四类实心三角箭头和普通文字。该范围没有保存为拼块装饰输入的 `Point`、`Disk`、`Circle`、`Inset` 或任意 `Graphics` 图元指令。In[2863] 的字符串 `"a"` 与数字标签已由现有 `label` 和自动编号覆盖，且项目 JSON 对标签长度和控制字符作严格检查。

因此本次追加审计没有可据保存定义新增的安全图元子域；不增加任意 Mathematica `Graphics` 解析器或符号排版入口。上述输入仅有图形展示，不含能逐像素核验字体与 Mathematica 排版的数值 `Out`。这不否定其他章节的 `Graphics` 功能，也不把 `CreasePatternGraphics` 的透明纸面样式误归入第 33 节 `RenderTile[...,Tiling]`。
