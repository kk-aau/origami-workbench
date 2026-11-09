# 第 46 节：抛物面 Flasher 的 DP／FF 求解与真实二维剪裁展开

本专项只读核对 `tmp/Origamica-15.0-reference.nb` 第 350277–352153 行（In[4200]–In[4210]），并沿用同一笔记本紧邻前面的 Flasher 拓扑与默认数值规则。数值与剪裁构造位于 `backend/tessellation_paraboloidal_flasher.py`，应用候选位于 `backend/tessellation_paraboloidal_flasher_candidate.py`，通过 `backend/tessellate.py` 的新 family 路由调用。镶嵌工作区已加入独立空间构造入口、紧凑参数控件及同画布二维／三维切换。

## 三种几何状态不能混称

- 原版 `ParaboloidalFlasherDefaultDPRules`（In[4103]，342773–342838）先取平面 Flasher 的理想 XY，再赋予 `z=(x²+y²)/(4f)`。`ParaboloidalFlasherVertexRules`（In[4168]，347688–347746）从求得的 XY 生成真正的三维部署形 **DP**，另用 `ppx,ppy,ppz` 生成三维折后形 **FF**。
- 原版 `ParaboloidalFlasherIsometryFns`（In[4173]，348331–348469）比较的是 **DP 三维边长与 FF 三维边长**。`MakeParaboloidalFlasher`（In[4204]，350570–350692）把它与 CP 旋转、固定 FF 平面投影、外圈高度以及中心高度等式一起交给 `FindRoot`。原版的 `badiso` 检查只在等距残差绝对值和超过 `10⁻⁶` 时发出警告；本实现拒绝未收敛和逐面不等距的结果。
- 原版对象里的二维 `Vertices` 是 DP 的 **竖直投影**：350899–350929 的索引化依次拆成 `verts`（前两坐标）、`vertsdp`（前三坐标）、`verts3d`（后三坐标）。笔记本在 350536–350544 行明确说这个所谓“CP”不是三维部署形的真实展平。局部样例 `(2,2,5,3,.1,Z)` 的投影边长相对 DP 最大差约 `0.3114`，不能把投影当作可制造折痕展开。
- `CutParaboloidalFlasher`（In[4209]，351748–352072）沿底部、对角线、左右轴线剪裁，用 `SplitEdges` 复制切口顶点，随后 `UnfoldGraph3D` 求得真正的二维开发图。本实现按这四组剪裁边建立三角面邻接树，沿未剪裁边逐片展开；中心多边形保持为一个面。**每个输出索引同时对应二维展开坐标、DP 三维坐标和 FF 三维坐标**，切口两岸有不同索引但各自指回同一个原始顶点。

## 参数、选项与已保存样例

`MakeParaboloidalFlasher[r,h,m,f,dr,opts]` 的五个量依次为圈数、高度阶、旋转阶、抛物面焦距和同平面相邻顶点的径向间距（350290–350316、350475–350505）。`FlasherSectorDiagFoldLines` 选择 Y／Z 四边形对角折线，原版 `FlasherSectorFoldLines` 默认 Y（344942–344952）；`TypeMinimumAngle` 传给折线赋型，底层默认 `0.5°`（In[1808]，122636–122646）。`CutParaboloidalFlasher[tobj,opts]` 独立接受 `TypeMinimumAngle`，不会改变已求得的 DP／FF 坐标；In[4210] 在剪裁后使用 `π=180°`，使其所有内部边在该阈值下为 `U`。

原版单元只保存如下**输入**，没有可提取的最终数值顶点 `Out`；表中数值均为本地从原版规则初值求得，不能称为原版逐点相同的保存输出。

| 原版单元与参数 `(r,h,m,f,dr,对角线)` | 原始顶点／剪后顶点 | 剪后边／面 | 本地 DP↔FF 逐面最大边长误差 | 本地二维↔FF 逐面最大边长误差 |
|---|---:|---:|---:|---:|
| In[4205]，`(2,2,4,6,.05,Y)`，351423–351489 | 60／100 | 196／97 | `1.33e-15` | `1.78e-15` |
| In[4206]，`(2,2,4,10⁶,.05,Y)`，351499–351557 | 60／100 | 196／97 | `1.33e-15` | `1.78e-15` |
| In[4207]，`(2,2,5,6,.1,Z)`，351564–351633 | 75／125 | 245／121 | `1.55e-15` | `1.78e-15` |
| In[4208]，`(2,3,6,5,.2,Y)`，351644–351712 | 126／222 | 438／217 | `4.22e-15` | `4.58e-15` |
| In[4210]，`(2,2,5,3,.1,Z)`，352079–352146 | 75／125 | 245／121 | `1.55e-15` | `2.00e-15` |

原始面中的四边形沿选定 Y／Z 对角线分成两个三角面；中心多边形以临时扇形三角网求解展开，再恢复单面。剪裁后的输出逐面核对**全部顶点对**，包含中心多边形的非边对角线。上述样例的原版剪裁边数依次为 40、40、50、96、50；剪后增加相同数量的顶点副本，面邻接形成一棵树，没有未消去的曲率环路。独立数值模块返回原始展开时标注 `selfOverlapChecked=False`；应用候选路由还要经过下面的二维几何门槛。三维面间自碰撞和连续折叠路径仍未验证。

本模块的输入受限于 `1≤r≤2`、`1≤h≤3`、`3≤m≤8`、`rh≤6`、`0.1≤f≤10⁷`、`0≤dr≤0.5`，每组都仍需实际求根与几何验证，失败时拒绝。这个范围包含原版保存的五组输入；不宣称原版全部参数与所有求根分支等价。尤其原版 350547–350555 行指出 `r=3,h=3`、默认 Y 对角线的最优解可能出现两顶点重合，当前故意不把该区间说成已解决。

## 应用候选与可采用性

后端 family 为 `paraboloidal-flasher`，参数字段是 `rings`、`heightOrder`、`rotationalOrder`、`focalLength`、`radialIncrement`、`diagonal`（`Y`／`Z`）、`minimumAngleDeg`、`cutMinimumAngleDeg`；默认依次为 `2,2,4,6,.05,Y,10,10`。后两个阈值分别作用于原始 FF 和剪后的图，允许 `0–180°`。候选的 FOLD `vertices_coords` **仅取剪后真实二维开发图**；同索引的三维 FF 放在 `source.foldedForm3D`，DP 放在 `source.deployedForm3D`。原版竖直投影只以原始索引存于 `source.originalProjectedVertices2D`，绝不进入 FOLD 的二维坐标。

候选路由重新核对每个面的全部边长及共面性、`V−E+F=1`、一条闭合边界环和面边赋型对应，再调用公共 `check_geometry` 检查零长度、重复边与非邻边交叉。为防止一个面完全包含另一个面而绕过边交叉检查，还逐对裁切三角面检查正面积重叠，发现则拒绝候选；通过时标注 `planarFaceOverlapChecked=True`。这证明候选二维片不存在面积重叠，但**不证明三维 FF 无自碰撞，也不证明存在连续折叠路径**。

原版 In[4206] 的 `f=10⁶` 极限仍是有效的 DP／FF 数值核对样例，剪后逐面等距；但展开的切口边几乎重合，公共二维 `check_geometry` 检出多处非邻边接触，因此应用候选会拒绝它，不宣称是可采用的单纸展开。默认 In[4205] 与 In[4210] 的剪后图均通过候选门槛。

前端使用 `spatialMeshScene` 通用契约独立验收候选：`prepareTessResult` 对默认样例生成 196 条二维折痕线，对 In[4210] 的 Z／五阶样例生成 245 条；两者都可采用，且保存参数可读回。空间构造选择器提供独立的“抛物面 Flasher”入口，完整传输上述八个参数；焦距滑条按对数刻度调整，同时保留 0.1–10⁷ 的数值输入。二维画布直接显示 `fold.vertices_coords` 的真实剪后开发图；同一三维画布可在 FF 折后形和 DP 部署形之间切换，切换前分别用同一剪后二维面逐面核验距离与共面性。`source.originalProjectedVertices2D` 仅保留在来源元数据中，不当作折痕图。专项前端测试还逐边核对两组样例的 B／U／M／V 及 M／V 折角符号，并拒绝未标记为已验证的 DP 形态。

专项验证命令：`cd backend; python -m unittest -v test_tessellation_paraboloidal_flasher test_tessellation_paraboloidal_flasher_candidate` 与 `npx tsx --test tests/app/paraboloidalFlasherParams.test.ts`。测试覆盖五组保存输入、DP 抛物面方程、投影与真实展开的误差差别、同索引三态、剪裁拓扑、全部面内距离、焦距与坏参数拒绝、In[4210] 的独立赋型阈值、面积包含式重叠检出以及高焦距极限的候选拒绝。前端两组 fixture 使用真实后端路由生成。
