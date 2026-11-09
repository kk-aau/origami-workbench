# 第 37 节 Patch[6] 多格 Alt 接缝反例

这份记录只分析把 In[3182] 的三片 `ArchimedeanPatch[6]` Alt 配方原样施加到更多晶格单元的扩展。笔记本 `tmp/Origamica-15.0-reference.nb` 的 In[3126] 保存了 **2×2 未扭转母格**，In[3182] 保存了 **单个三片 Alt 补片**；没有保存两者组合后的数值 CP、FF 或层序输出。In[3181] 对传入的 `RegularizePatch[patch]` 逐片 `MapThread`，并不调用 `MakeLatticeTiling`。因此，以下多格结果是对原式参数的本地扩展诊断，不能称作原版保存的多格 Alt 失败。

输入固定为 `w=0.2`、`α=25°`、来源中心边 `MMM / VVV / MMMM`，由 Alt 公式换得 `τ=atan(tan(25°)/0.2)≈66.785439879°`；格矢 `l₁=(1,0)`、`l₂=(1/2,1+√3/2)`。原版 In[2872] 的 `PolygonTwistTile` 把每条边的赋型写为 `{B,B,B,t,反转(t),t}`（`ccw=True`），因此 pleat 射线的 M/V 由中心边类型和扭转方向确定，不能在拼接后自由翻转。

| 扩展范围 | 删除重合 B 接缝后的反例内部点 | 独立来源片的两条射线 | 必要条件 |
| --- | --- | --- | --- |
| `range1=[0,1], range2=[0,0]`，6 片 | `(3/2, √3/2+0.4)` 与 `(3/2, √3/2+0.6)` | 两格中的正方形分别为 `M/V`、`V/M` | 两点均为二度；`|M−V|=0`，Maekawa 要求 `2` |
| `range1=[0,0], range2=[0,1]`，6 片 | `(0.9, 1+√3/2)` | 前一格正方形 `V`，后一格三角形 `M` | 同为二度 `M/V`，违反 Maekawa |
| `range1=range2=[0,1]`，12 片 | 包含上述横向与纵向接缝 | 同样继承固定赋型冲突 | 在进入层序求解前必须拒绝 |

独立单片构造给出这些射线赋型；合并后的候选在这两种单方向扩展下均通过折痕几何和 Kawasaki 检查，失败点是固定的 Maekawa 条件，而非线段错位或层序求解超时。若保留重合 B 边而不按原版默认 `KillMergedEdges→True` 删除，局部角度条件也不能通过。改变单片的中心 M/V、逐单元交替配方或改变构造法会形成**另一个输入**，不能作为 In[3182] 的同参数多格结果。

`backend/tessellation_tile_patch.py` 现在在调用整数山谷求解前识别已全部固定的 Maekawa 冲突，并报告首个顶点坐标及 `M/V` 数量。它仍完整执行几何、奇偶度、Kawasaki、后续山谷与层序门禁；没有重赋型，也没有把失败图返回为可采用结果。`backend/test_tessellation_archimedean_patch6_alt_seams.py` 用独立构造的来源单片射线验证两种方向的精确反例，并验证 2×2 通用请求被拒绝。

最近的原版**已保存 Alt 输入**仍是 In[3182] 的单个三片补片：本项目 CP 为 32 点／48 边／17 面，平折几何 ready、原面层序精确 1 解。若需要已接通的**多格接缝**，In[3106] 的 2×2 双三角母格与 In[3180] 的 `w=.2, τ=70°`、`MMM/VVV` 保存配方可以明确组合成 8 来源片；本项目 CP 为 64 点／96 边／33 面，几何 ready、层序精确 1 解。这仍是两个保存输入的组合，笔记本没有保存其组合数值输出。两个正例都保持原来的层序求解门禁。

从 `workbench/backend` 运行：

```text
..\.venv\Scripts\python.exe -m unittest test_tessellation_archimedean_patch6_alt_seams test_tessellation_archimedean_patch6_lattice test_tessellation_archimedean_patch1_lattice_in3106_3180 test_tessellation_tile_patch -v
```

从 `workbench` 运行 `npx tsx scripts/verify-archimedean-patch6-alt-in3182.ts` 和 `npx tsx scripts/verify-archimedean-patch1-lattice-in3106-3180.ts` 可复核两个正例的完整平折层序及正背局部覆盖区域。
