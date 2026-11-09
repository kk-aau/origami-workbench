# P16：`TilingStyle` 不透明颜色子域

原笔记本 In[2784–2785] 定义 `TilingTextColor`、`TilingLineColor`、`TilingFillColor` 三个全局样式选项，规定 `TilingLightFill=Lighter[TilingFillColor,0.70]`、`TilingMedFill=Lighter[TilingFillColor,0.50]`、`TilingDarkFill=TilingFillColor`，`TilingNoFill` 不绘制填充。保存的 In[2786] 同时展示四种填充、`TilingLine` 和 `TilingText`；In[2861] 对 `PolygonTile` 直接调用四种填充；In[2863] 用 `TileIndex->"a"` 展示中心标签。原文件未保存自定义 RGB 三色参数的数值 `Out`，以下颜色数值属于依原公式的本地推算。

In[2784] 的无参 `TilingStyle[]` 还规定了**实际默认色**：文字 `Darker[Brown,0.8]`、边线 `Orange`、填充基色 `Lighter[Brown]`。[Wolfram Brown](https://reference.wolfram.com/language/ref/Brown.html) 是 `RGBColor[0.6,0.4,0.2]`，[Orange](https://reference.wolfram.com/language/ref/Orange.html) 是 `RGBColor[1,0.5,0]`，而 [Lighter](https://reference.wolfram.com/language/ref/Lighter.html) 的省略比例为 `1/3`。换为 8 位 SVG 颜色后分别是文字 `#1f140a`、边线 `#ff8000`、填充 `#bb9977`；其浅填充为 `#ebe0d6`。In[2785] 的 `TilingLine` 另规定固定 1 点实线与圆端、圆角；`TilingText` 只规定文字颜色，没有白色描边。新建装饰在预览、母结构和平折边线中使用不随缩放变化的 1 像素圆角 SVG 描边，文字也不加描边。新建原版拼块装饰和具名扭转自动装饰显式采用这组源配色，并有“原版配色／旧版配色”切换。旧工程未保存 `tilingStyle` 时继续显示原先的工作台绿棕配色、线宽和白边文字，不因读取新版代码而变色。

“拼块装饰与编号”可分别设置文字色、边线色和填充基色。颜色公式折叠栏接受严格白名单中的 Mathematica 形式：`RGBColor[r,g,b]`、`GrayLevel[g]`、`Hue[h]`／`Hue[h,s,b]`、`CMYKColor[c,m,y]`／`CMYKColor[c,m,y,k]`、`Lighter[color]`／`Lighter[color,f]`、`Darker[color]`／`Darker[color,f]`，以及 `Black`、`Blue`、`Brown`、`Cyan`、`Gray`、`Green`、`Magenta`、`Orange`、`Pink`、`Purple`、`Red`、`White`、`Yellow`。数值限于 `0..1` 的十进制或分数；嵌套深度最多 8 层、输入最多 160 字符。也可继续直接输入六位 `#RRGGBB` 或使用取色器。有效公式即时转成不透明 SVG RGB，同时保留公式原文供工程再编辑；项目回读验证公式与 RGB 色值一致，输入无效时禁用保存。这里没有使用 `eval` 或 Wolfram 内核。

浅、中、深填充由基色实时计算，并应用到母结构、折痕叠加和经可见面核验的平折边线与编号。旧工程不含 `tilingStyle` 时沿用之前的配色；修改三色不改变折痕构造键。基色为 `#336699` 时，浅、中、深分别计算为 `#c2d1e0`、`#99b3cc`、`#336699`。专项测试核对 SVG 填充、边线、文字、JSON 回读、公式和值一致性和非法 CSS/透明色拒绝，并在真实四块平折夹具中检查正面可见边线和标签的颜色传播。[Hue 文档](https://reference.wolfram.com/language/ref/Hue.html)说明 HSB/HSV 的参数含义；`CMYKColor` 使用无 ICC 配置的屏幕近似换算，未承诺匹配 Mathematica 的色彩管理输出。

等价范围为 **8 位不透明 RGB** 三色规则、上述白名单公式、原版默认配色及现有纯文字标签。不解析通用 Mathematica 符号表达式、任意 Graphics 指令、透明度、渐变、图案或 3D 材质。`TileIndex->"a"` 的文字显示可对照保存输入；自定义颜色的计算属于原版公式的有界数值实现，不能视为已验证 Wolfram 全部 Graphics 样式的求值结果。

逐边箭头的原版三角形指令、`TileIndex` 保存例和透明材质的归属另见 [P16 RenderTile Graphics 指令审计](P16-RenderTile-Graphics指令审计-20260927.md)。
