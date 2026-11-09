# 第 33 节通用 `RenderTile` 的 3D／TObj 范围

原始证据来自 `tmp/Origamica-15.0-reference.nb` 保存的代码行号。`RenderTile[tiletype, decoration, opts]` 要求每种 tiletype／decoration 组合自行定义，缺省调用 `RenderTile::nodef` 并 `Abort`（206843–206980，In[2789]–In[2790]）；装饰列表逐项调用并返回结果列表（207002–207055，In[2792]）。因此不能把 `TileVertices`／`Tiling` 的现有二维装饰泛化成任意 3D 装饰。其文档允许返回 `Graphics`、`Graphics3D` 或 `TObj`（206904–206910），但返回类型取决于实际分派。

## 可复核的源码证据矩阵

| 原版证据 | 保存源码的实际作用 | 对工作区验收的含义 |
| --- | --- | --- |
| 206144–206222、206943–206980 | `TileVertices`／`Tiling` 是一般拼块应支持的装饰；`TGraph3DAssigned` 是有折后三维顶点时才可提供的附加装饰。未知 `tiletype`／`decoration` 报 `nodef` 后中止。 | 不存在可直接覆盖任意拼块的默认三维求解器。 |
| 209135–209179、209493–209576，In[2829] | 逐块折后顶点须与 CP 母拼块相似；`EmbedTile` 仅把已有的 2D／3D 图按位移、角度、倍率放置在 xy 母平铺上。 | 数值变换可单独实现，但前提是真实的每块 3D 图对象与可验证的归属。 |
| 209769–209810，In[2835] | `FoldedForm3D` 只从 `RenderTile[...,TGraph3DAssigned]` 取对象，再交给 `FoldedFormGraphics3D`。 | 此规则是渲染包装，不会生成 3D 顶点或折叠路径。 |
| 205981–258924 的镶嵌章节全域检索 | 作为 Mathematica 符号出现的 `TGraph3DAssigned` 仅在 209462、209503、209520、209796 四处，均属前两项通用规则；`FoldedForm3D` 符号仅在 209647、209789 两处，分别是文档和通用包装。未见针对任何具名拼块的 `RenderTile[...,TGraph3DAssigned]` 定义或专属 3D 保存输出。 | **“任意拼块的通用 Graphics3D／TObj 分派”不是原版已交付的稳定镶嵌构造，不能列为完全复现的必达缺口。** |
| 262967、266394、270783、280195、282468 | 后续壶体和管体章节构造或描述整件 `TGraph3DAssigned`；并非拼块 `RenderTile` 分派。 | 这些全局非平面构造须按各自保存输入、真实 3D 顶点和验证条件单独核对，不能移作第 33 节逐块三维装饰的证据。 |

该矩阵只对用户提供的 15.0 notebook 作结论；没有 Wolfram 内核及隐藏包的运行结果，不能证明某个未保存的外部扩展绝对不存在。它足以界定当前“复现原版已保存镶嵌构造”的验收范围：保留真实 3D 数据的数值基础，但不为缺乏具名分派的想象 API 造新控件或假透视。

`TGraph3DAssigned` 是组合 `TGraph3D` 与 `TAssigned` 的 `TObj` 类，有 2D `Vertices`、3D `Vertices3D`、边、面、边型及可选折角（134344–134487）。`EmbedTile[tilespec,TGraph3DAssigned,...]` 从 `RenderTileCache[tiletype,TGraph3DAssigned,...]` 取得图对象，然后按 `{offset,rotation,scale}` 放置两套顶点（209493–209576，In[2829]）。文字明确要求 3D 铺片的母排布在 xy 平面（209179），并要求折后拼块的 `TileVertices` 与 CP 拼块几何相似，才可借同一排布做逐块 FF（209135–209177）。`RenderTile[tiletype,FoldedForm3D,...]` 本身只委托 `TGraph3DAssigned`，再取 `FoldedFormGraphics3D[tobj][[1]]//KillBorder`（209769–209810，In[2835]）；它没有生成 3D 折后顶点的通用算法。保存笔记本中 `TGraph3DAssigned` 相关 `RenderTile` 引用仅见此通用调用，未见任意 tiletype 的对应专用分派。后面的整体合并流程也仍要求先有各块的 `TGraph3DAssigned`（221842–221930）。

原版 In[2829] 有一处直接可见的实现矛盾：它定义 `f3d = Append[offset,0] + RotationZMatrix3D[rotation].(scale * point)`（209540–209560），随后却用 `f2d /@ dtile[Vertices3D]` 计算 `verts3d`（209566–209575）。二维函数作用于三维点，且 `f3d` 没有实际被使用。适配器遵循该处写出的三维变换意图，不声称与这一保存代码的执行结果逐点等价。`Numeric -> True`、符号表达式求值和 Mathematica 图元样式也未在此实现。

现有工作区真实静态 3D 候选将展开图保存在 `fold.vertices_coords`、边／面及赋型保存在同一个 `fold`，折后坐标则保存在 `source.foldedForm3D`，使用完全相同的顶点索引。`src/app/spatialMeshView.ts` 和 `src/app/rigidQuadView.ts` 检查明确的 `staticGlobalIsometryChecked`、顶点与面索引、有限坐标、非退化面以及逐面二维／三维距离后才交给 `TessRigidPane` 投影。保存夹具可见真实非平面例子，如 `tests/fixtures/constructed_twist_joined_tube.json`，以及壶体、Flasher 和其他管体。`src/app/spatialTileEmbedding.ts` 的 `embedVerifiedSpatialTile` 仅接受上述已验证结果和数值放置参数，分别变换展开二维顶点与**实际** 3D 顶点，保留索引、边型和面，在变换后再运行面等距检查。缺少 3D 坐标／验证标志或放置导致几何退化时返回 `null`；从不把 2D 图补零当作折后形。其返回值是可供现有投影器使用的数值图数据，**不是** Mathematica `TObj` 或 `Graphics3D`。

现已将这一数值语义接入镶嵌工作区的真实静态三维画布：当当前结果具有可独立验证的同索引展开图与折后坐标时，标题栏出现“空间图放置”。面板采用原版 In[2829] 的 `{offset, rotation, scale}`，角度在界面以度输入，内部以弧度计算；灰色虚线绘制原三维图，彩色折后面绘制放置后的三维图，两者共用投影相机。输入顶点索引可以同时读到变换后的 CP `{x,y}` 和 FF `{x,y,z}`。`projectEmbeddedSpatialTile` 以原、放置后顶点拼接建立共同世界坐标，投影面只引用后半部分顶点；逐面的正反面与遮挡次序仍由已验证的 3D 面计算，次序不可判定时沿用原画布的线框退路。壶体的 `PotFlatFlangeInset` 是单独的非等距显示偏移，故其显示状态不提供此放置入口；抛物面 Flasher 的部署形 DP 也不应用折后形 FF 的放置参数。

现有 `tileDecorations` 只附着于 `custom` 家族的二维母拼块；`zhezhi_custom_face_index` 和 `zhezhi_face_tile_instance` 只覆盖该二维拼块／平折路径。当前静态 3D 候选没有与这些装饰对应的 tiletype、tilespec、逐实例 3D 面归属或相似性证明，且自定义拼块折叠结果没有同索引 `foldedForm3D`。因此不能安全地把第 33 节的 `TilePolyFill`、边箭头、中心编号或多装饰列表自动贴到管体／壶体／Flasher 的面上，也不能给自定义拼块画假三维透视。`TessRigidPane` 当前只显示已验证面及赋型边，并在遮挡次序不可靠时退回线框；直接给它叠加拼块填色会绕过这些条件。

若未来取得原版某个具名拼块的专用 3D 分派和保存例，构造端至少需输出每个拼块实例的局部 `Vertices`／`Vertices3D`、实例放置、面／边归属及赋型，并建立其与全局 FOLD 索引的可校验对应；然后逐块验证 CP/FF `TileVertices` 的相似性和遮挡关系。当前工作区入口将**整个已验证空间图**作为数值放置对象，并不声称它是原版逐实例 `RenderTile[...,TGraph3DAssigned]` 或 `FoldedForm3D`。原版保存源码未给该具名分派的输入、三维顶点或执行输出，因此没有可逐索引对照的 Wolfram 结果；本地专项仅能对 In[2829] 明写的三维矩阵、原版拓扑不变性及工作区可见面规则做独立验证。`npx tsx --test tests/app/spatialTileEmbedding.test.ts tests/app/spatialMeshView.test.ts tests/app/rigidQuadView.test.ts` 覆盖真实 z 坐标、CP／FF 同索引、投影面索引与正反面、界面入口、缺失／损坏数据和数值退化拒绝；2026-09-27 执行 23 项通过，`npx tsc --noEmit` 通过。

真实浏览器再验收默认旋转对称壶体：100 个折后面和 200 条原位参考边同时显示，放置状态为 `verified`；平移 X=2、旋转 30°、缩放 1.2 后，顶点 10 的同索引坐标显示 `CP [3.82152, 2.63914] · FF [3.24183, 1.33713, 2.4]`。角度输入在弧度转换后仍显示 `30`，不会出现浮点尾数。验收图为 `output/playwright/p33-spatial-placement-live-20260927.png`。

## 最小独立复核（2026-09-28）

在 `workbench` 目录执行以下 PowerShell 命令；数组索引从零开始，显示的笔记本行号比索引大一：

```powershell
$nb = Get-Content 'tmp/Origamica-15.0-reference.nb'
$nb[209539..209559]
$nb[209565..209574]
rg -n 'In\[2829\]|Out\[2829\]|In\[2835\]|Out\[2835\]' 'tmp/Origamica-15.0-reference.nb'
```

| 检查点 | 可直接看到的保存证据 | 结论边界 |
| --- | --- | --- |
| In[2829] 三维坐标 | 209540–209560 定义 `f3d`，用三维 `RotationZMatrix3D` 和 `Append[offset,0]`；209566–209575 的 `verts3d` 却调用 `f2d /@ dtile[Vertices3D]`。 | 该保存程序的二维矩阵与三维顶点维度不符，不能拿它作为已运行的 3D 数值对照；当前有限放置入口按明写的 `f3d` 意图计算。 |
| 保存的运行结果 | 上述 `rg` 仅找到 209588 的 `In[2829]` 与 209810 的 `In[2835]`，找不到对应 `Out`。 | 笔记本未保存该规则的数值输出；不能声称已与 Wolfram 逐点相等。 |
| 具名拼块分派 | 在 205981–258924 镶嵌章节搜索 `TGraph3DAssigned`，作为 Mathematica 符号仅见 209462、209503、209520、209796；后二者是通用 `EmbedTile`／`FoldedForm3D` 向 `RenderTileCache`／`RenderTile` 的调用。 | 没有可依此重建的具名拼块 `RenderTile[...,TGraph3DAssigned]` 输出。 |

本地重新运行 `npx tsx --test tests/app/spatialTileEmbedding.test.ts tests/app/spatialMeshView.test.ts tests/app/rigidQuadView.test.ts`，23/23 通过；`npx tsc --noEmit` 通过。现有入口已覆盖可验证的有限数值放置，未获得新的具名三维拼块装饰来源，因此不增设假定分派。
