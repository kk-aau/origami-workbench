# 第 40 节 Delaunay 与旋转梯形保存输入核对

参考文件：`tmp/Origamica-15.0-reference.nb`。本次只把笔记本实际保存的定义和示例当作依据；没有保存数值 `Out` 的地方，不推测 Wolfram 随机数或图像像素。

## Delaunay：本轮只读核对

247363–247440 行的 In[3375] 将输入 `pverts` 交给 `DelaunayTriangulation`，把三角网组成平面图，再经 `MakeTriangleGraphReciprocalDiagram` 设置三角形外心对偶。说明文字明确母结构边界是输入点集的凸包。当前 `site_mesh('delaunay', ..., boundary_mode='hull')` 使用 SciPy Delaunay 和点集凸包；`tessellation_advanced.py` 从每个三角形求外心并送入垂直对偶。`boundary_mode='square'` 会额外加入方形角点，属于本软件的另一个纸张选项，不能当作原版 In[3375] 的语义。现有 `test_tessellation_site_bounds.py` 已检查凸包边界。

247459–247513 行的 In[3376] 用 `SeedRandom[0]` 与 `0.1+0.8 Random[]` 构造 8 个示例点，但笔记本没有保存这 8 个数值坐标的 `Out`。本软件的随机点预设也不是 Wolfram 的 RNG，因此只应核对函数接受的**显式点**及其凸包、三角形外心；不能宣称同一个整数种子会生成逐点相同的示例。

## 旋转梯形：已修复的对偶点差异

248627–248797 行的 In[3384]/In[3385] 给出 `MakeRotationalTrapezoidPrimalDualGraph[m,rvals,IncludeCenter->False]`：各层顶点为 `rvals[[i]] U[2π(j−1)/m]`，半径严格递增；默认中心是一个正多边形面，`IncludeCenter->True` 则以中心点形成三角扇。函数最后对每个面执行 `Circumcenter`，并**直接**写入 `DualVertices`。随后保存的示例使用 `m=11`、`rvals={1,2,4}`、`IncludeCenter->False`。

此前工作区的母结构拓扑正确，但以面重心作初值进行通用垂直对偶投影。该投影不唯一，垂直关系虽然满足，点却不一定是外心。原版示例中，旧结果与独立求得的外心最大相距约 `0.248`，会实质改变扭转折痕。

现在 `rotational_trapezoid_mesh` 按原版未取整半径生成逐面外心，母结构坐标保留 12 位以使证书不受 9 位舍入影响。对角宽 `2π/m` 的扇区，若径向层为 `a<b`，该梯形外心沿角平分线，距原点 `(a+b)/(2 cos(π/m))`；中心三角形外心距原点 `a/(2 cos(π/m))`，中心正多边形外心为原点。生产路径逐条验证共享母边与两个外心的连线垂直、且对偶方向为正，再将最终对偶坐标设为这些原版外心。若用户明确编辑 `dualTargets`，仍使用编辑值。

`test_tessellation_trapezoid.py` 独立检查 In[3385] 的 11 扇区示例、中心开关、每个面的等距圆心、最终对偶、编辑值优先级，以及折痕几何与局部平折条件；梯形、通用高级构造、修剪和点集边界的专项回归均通过。

## 中心三角扇的赋型核查

原版 In[3385] 只构造正交原始／对偶图，不给边赋山谷型。保存的 In[3386] 示例在 `IncludeCenter->False` 后，明确先用 `RadialAxialOrderingFn[{0,0},RadialMajor->True]` 调用 `OrientEdgePairs`，再进入扭转构造。`RadialAxialOrderingFn` 的定义位于 70378–70540 行（In[1130]/In[1132]）：优先让对偶边向外，径向分量在 `10⁻⁶` 容差内时取逆时针方向；对偶边中点位于原点时保持原方向。当前工作区此前用从中心面出发的 BFS 为所有构造定向。BFS 在 `m=11, rvals={1,2,4}, IncludeCenter=True, angle=20°, scale=.65` 中于两个四价折痕顶点违反了原版 LFF 的最小／最大扇区关系：旧结果的约束 82、83、118、119 失败，例如约束 82 需要相反山谷型，却给两条边都赋 `V`。保持同一几何，仅换用原版径向／轴向规则后，几何、Kawasaki／Maekawa 和 LFF 均通过；16 扇区中心扇也通过。用户编辑对偶点时仍按编辑后的对偶点执行同一排序函数。

这验证的是**保存的定向规则作用于保存的中心开关**，不是 Mathematica 逐像素输出比对；原版没有保存 `IncludeCenter->True` 的执行结果。折后层序仍标为 `not_checked`，没有全局层序证书。

并非所有旋转阶都能通过局部必要条件。以 `m=3, rvals={.4,1.3,2.2}, IncludeCenter=True, angle=20°, scale=.65` 为反例，LFF 约束图存在折痕边编号构成的闭环 `20→25→27→34→35→41→40→45→37→36→28→21→20`。这 12 条关系有 9 条要求两端山谷型相反、3 条要求相同；沿闭环相乘得到 `-1`，与起点赋型必须等于自身矛盾。因此换任何 M/V 赋型都不能通过该局部必要条件，结果继续报告 `lff=failed`，不把该参数误报成可平折。
