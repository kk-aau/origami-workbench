# 十源表面折至 Cone 与 Cylinder

四个公开原函数都接收 `b1₂(s),d1₂(s),bb1₃(s),dd1₃(s)`，共十个单变量标量源。本入口保持十源、原初值和原输出，没有用固定圆、Match 或 Darboux 恢复代替代数构造。

| 原函数 | Notebook 定义 | 原初值 |
|---|---|---|
| FoldSurfaceToCone | In[4046]，333687–333829 行 | `{ui,b2i₂,bb2i₃}` |
| NFoldSurfaceToCone | In[4049]，334194–334354 行 | 同上，另数值域 |
| FoldSurfaceToCylinder | In[4053]，334729–334859 行 | `{p2i₂,d2i₂,pp2i₃,dd2i₃}`，无 ui |
| NFoldSurfaceToCylinder | In[4056]，335256–335375 行 | 同上，另数值域 |

Cone 的 `FractionBox` 原式为

`v=(‖b2i−b1‖²−‖bb2i−bb1‖²)/(2((b2i−b1)·d1−(bb2i−bb1)·dd1))`。

两侧折痕为 `f=b1+vd1, ff=bb1+vdd1`，返回基线分别恒为两个锥顶。两种原函数具有实际不同的职责：

| 模式 | 原分支与母线 |
|---|---|
| normalized-symbolic | `d2i=unit(b2i−f(ui))`；原 `dd2i=unit(bb2i−ff(s))` 使用 **s**；`Ψ(s)=Sign(d1(ui)·d2i−dd1(ui)·dd2i(s))`；输出 `Ψ(s) unit(apex−fold(s))` |
| raw-numerical | 两个初始 unit 向量均在 **ui** 求值，Ψ固定；输出 `Ψ(apex−fold(s))` **不归一化** |

这不是把源码中的 s 自动改为 ui 的勘误版。真实反例 `b1=(s,0),bb1=(s,0,0),d1=(0,1),dd1=(0,1,0),b2i=(1,1),bb2i=(0,0,0),ui=0` 给出 `v=1−s`：符号版 Ψ(s)=Sign(1−s)，数值版 Ψ=+1。在 s=1，符号版原母线值为零而经典一阶导数不存在，返回值仍保存，母线导数与对应 E/F/G 为 null，整组有限度量验证为 false。安全 AST 若确证原符号分支恒为零，则原输出及一阶导数均为零；N 版固定 Ψ=0 也天然具有有效零导数。不能用零采样推断恒零。

Sign 的种子及符号参数按原物理方程计算，并补偿原 affine 常数偏移。相似归一化不能用于改变这个不连续选择：原整数恒零反例 `b1=bb1=0,d1=(1,0),dd1=(1,1,0),b2i=(7,0),bb2i=(9,4,0)` 的 v=4、径向量分别(3,0)/(5,0,0)、Ψ=0。规范化计算曾将其变为 +2.22e−16，现已修复；±1e−12 的真实非零扰动仍保持相反分支，没有 epsilon 截零。

Cylinder 的原分数及输出为

`v=((p2i−b1)·d2i−(pp2i−bb1)·dd2i)/(d1·d2i−dd1·dd2i)`，

`b2=f−((f−p2i)·d2i)d2i, bb2=ff−((ff−pp2i)·dd2i)dd2i, d2=d2i, dd2=dd2i`。

两个模式使用同一字面公式。四个原初始向量允许有限 raw 非单位或零值，投影系数不补除长度平方、不归一化。单位母线前提独立按最大 `|‖D‖²−1|≤64ε` 验证，只是 roundoff 级数值条件。9e−11 的近单位偏差仍保留真实几何，有限 E/F/G 可以通过，但形式目标匹配撤销。

默认源为非圆二维曲线 `(s,s²/4)` 与非圆空间曲线 `(sin s,s²/4,1−cos s)`，两母线沿各自 y 轴。Cone 锥顶为(0,2)/(0,1,0)，v=`.5+s²/4+cos s`；Cylinder 初参考点为零、母线为(0,1)/(0,0,1)，v=`1−cos s−s²/4`，真实输出基线为(s,0)/(sin s,1−cos s,0)。额外例使用共同非均匀参数以及变化的 raw 母线幅度 `1+.2 sin s`，十源均可编辑。

源纸对与输出纸对分别验证 E/F/G。解析充分证据来自安全 AST 手工符号构造，对原 E/F/G 关于 w 的六个系数逐项证明相等；每个原 RHS 与分母仍独立区间审计，身份不会擦除原极点。原源纸对等距时，沿 v(s) 得到两折痕速度相等。Cone 等 G 条件使原分数强制两径向长度相等，继而两原 radial 母线或单位 radial 母线具有同一目标 E/F/G；Cylinder 单位初始母线下，原投影标量相等，其导数和折痕速度决定相同目标 E/F/G。单位前提、全域分支和源定义均不足时，形式证书不成立。

完整源定义、Sign 分支、四个实际纸带面积和有限度量结果分别保存。129 固定节点并上显示点、所有显示 w 与中点，残差使用 E/maxE、F/√(maxE·maxG)、G/maxG，没有 max(1,physicalScale) 漏洞。分母/Normalize 真退化拒绝；N Cone 的原母线在非初值点可为零，原数值函数没有 Normalize 该输出，仍保留可算结果。焦线 w=0 保留并标退化。区间预算不足保留完整原域与全部实际图，不宣称注入、碰撞、精确 FOLD 或可采用 CP；这四个代数构造没有 ODE 或 root solver。

17项 Python 专项和22份真实结果覆盖全部四原函数、变量母线、非均匀输入、原不同 Ψ 分支、恒零和跳零、任意域内 ui、Cylinder raw 四初值、失配、极点、焦线、1e−8 尺度叠 1e9 平移及预算不足。独立60位审计检查198行、869区间单元、12126个严格包含，没有 epsilon。常规源一阶 jets 最大相对差2.67e−16、目标1.18e−15、折痕归一化坐标3.27e−16、自然 E/F/G 2.24e−15。高频 unknown 原表达式仍完整求值，最大自然 E/F/G 差1.05e−13。原数学恒零的导数误差按其自身母线尺度记录，避免虚构相对零误差。

精确机器合同为 `output/audits/p45-fold-surface-generic-contract-20261001.json`；独立可复跑报告为 `p45-fold-surface-independent-audit-20261001.py/json`。生产 SHA256：`ad45e3747c3a16d7ab68cb44a5da264bda47c96d8630fcdf230f00940c6bfe4c`。Notebook SHA256：`19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9`。

本入口算法域为 s∈[−10,10]、跨度.01–12、w∈[−10⁶,10⁶]，显示预算8–128/2–64，初值组件≤10¹²。源安全语言为现有单变量 AST 白名单。两种原公式的数值职责已区分，不宣称任意符号对象、原 Wolfram options、FunctionInterpolation 或 InterpolatingFunction 对象等价。


最终统一验收（2026-10-01 镜面序列／专用重塑／螺旋／十源转换统一验收）：**2702项完整测试与849模块构建通过**；Python17、TS12；22永久来源；43真实场景／31响应。四入口合计141真实主应用场景／111响应、0页面异常，1000/760/390×720控件与嵌套图形无滚动或裁切。统一机器报告 `output/audits/p45-sequence-special-helix-surface-batch-acceptance-20261001.json`。十源界面的最终主应用TSX/CSS以 `output/audits/p45-fold-surface-main-ui-freeze-20261001.json` 为准，先前隔离快照保留作历史。
