# 原版专用 Cone 与 Tandev 安全数值重塑

本入口分别复现专用 `ReshapeCone3D/NReshapeCone3D` 和 `ReshapeTandev3D/NReshapeTandev3D` 的原生数值构造；未把它们改成通用 Darboux 带的包装。

| 项目 | Cone | Tandev |
|---|---|---|
| 原定义 | In[3901]/In[3906]，Notebook 315912–316045/316776–316886 行 | In[3912]/In[3917]，317572–317710/318361–318491 行 |
| 可编辑输入 | b₃(s)、d₃(s)、β(s)、σ、ψ、ui/bbi₃/ddi₃/uui₃ | b₃(s)、d₃(s)、τ(s)、σ、ψ、同序四初值 |
| 原速度/系数 | ds=1；g=−σψ‖d′‖；h=β；z=0 | v=‖b′‖；T=b′/v；U=σψ Normalize(d′)×raw d；L=U×T；g=L·T′；h=0；z=τ |
| 原初帧 | Li=σddi；Ti=Li×uui；Ui=uui | ζ=T(ui)·d(ui)；Ti=ζddi；Li=uui×Ti；Ui=uui |
| 原输出 | 返回固定 B=bbi、D=σL；积分所得交叉曲线被原函数丢弃 | 返回恢复 B、D=ζT；ζ与初值均保持原幅度 |
| 真正未定义的分母 | 原构造无 Normalize(d′)，所以 d′=0 可算 | b′=0 或 d′=0 的 Normalize 分母未定义 |

两项均使用原恢复方程 `B′=ds T, T′=gL+hU, L′=−gT+zU, U′=−hT−zL`，从任意域内 ui 分别向左右积分。β/τ直接作为参数导数系数，不额外乘速度。Cone 的原 b 不参与恢复 ODE：非常量 b 仍返回真实目标，独立标出源相容性不足。Tandev 的原 U 仅归一化 d′，没有归一化叉积，也没有归一化 d。

源与初帧证据独立保存。安全 AST 手工构造的有界恒等式仅提供充分条件：Cone 为恒定 b 与单位 d；Tandev 为单位 d 与 b′平行 d。每个原 RHS 仍按其原文计算，恒等式不会删去原表达式中的极点。原初值允许任意有限三维向量，含非单位与零向量；最大 Gram−I 不超过 64ε 才接受数值正交前提，此门槛不是符号精确单位证明。

| 返回证据 | 确切含义 |
|---|---|
| sourceDefinitionCertified | 原表达式与必需归一化分母在完整 s 域获得区间覆盖；Cone 常母线可成立 |
| sourceCompatibilityAnalytic | 有界安全恒等式证明上述充分源条件；采样近零不算解析身份 |
| formalIsometryCertified | 完整源定义、解析相容条件、roundoff 级初帧相容同时满足；描述原形式 ODE |
| finiteMetricVerified | 固定129点并上显示点，在所有显示 w 与中点独立比较自然尺度 E/F/G |
| stripRegularity | 原源面积与形式恢复面积分别区间验证；含 w=0 的焦线保留并标退化；无法证明保 unknown |
| integrationErrorIntervalCertified | 始终 false：DOP853 的有限误差检查没有区间轨迹误差包围 |

形式面积平方为 Cone 的 `w²g²/L⁴`，Tandev 的 `w²ζ⁴g²/L⁴`。实际恢复初帧不相容时，这个名义面积不能作真实目标下界，目标纸域证据改为 unknown。常 Cone 母线产生可计算的秩不足图，辅助 frameDefined=false、纸域 unknown，绝不声称原函数未定义或正则通过。完整域预算不足时保留原输入域和真实两幅几何；没有注入、碰撞、精确 FOLD 或可采用 CP 认证。

默认例分别为非圆单位球面母线 `(2s,2(.3+.2s²),1−s²−(.3+.2s²)²)/(1+s²+(.3+.2s²)²)` 和非圆空间曲线 `(sin s,s²/4,1−cos s)` 的单位切向母线。后者配原参数扭率 `−2s√(1+s²/4)/(5+s²)` 可独立闭式恢复原曲线；反向参数使用对应正扭率，不能静默乘负的重参数导数。

15项 Python 专项与19份真实 backend fixtures 覆盖四种 ψ/σ、变量 β/τ、任意域内初值、非均匀与反向参数、原非单位母线、非恒定 Cone 基线、零/非单位初帧、d′=0、焦线、恶意表达式、1e−8 尺度叠 1e9 平移及完整域预算不足。独立60位审计检查171行、621区间单元、6210个严格包含，未加入 epsilon；常规源导数最大相对差2.59e−16，目标导数2.65e−15，归一化目标坐标7.43e−16，自然 E/F/G 5.54e−15。高频 unknown 例保原 RHS，最大自然 E/F/G 差7.87e−13。三个一般恢复例另用独立高精度 RK4 Richardson；其收敛差最大3.64e−14，仅作有限数值证据。

机器合同见 `output/audits/p45-special-reshape-generic-contract-20261001.json`，可复跑审计与快照见 `p45-special-reshape-independent-audit-20261001.py/json`。生产 SHA256 为 `554607f3a3d82f5c20c5d58798a991659146f551bb0d5c7e8d8db71054965d98`，Notebook SHA256 为 `19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9`。

本入口数值算法域为 s∈[−10,10]、跨度.01–12、w∈[−10⁶,10⁶]，σ/ψ固定±1，显示预算8–128与2–64，初值分量≤10¹²。使用七个单变量安全标量源。未复现任意符号对象、Wolfram options、任意 InterpolatingFunction 或原 FunctionInterpolation 对象；保存源文与数学职责的数值实现不等于这些对象已复现。Cone 输入中不参与 ODE 的 b 也须可按本源图职责求值。


最终统一验收（2026-10-01 镜面序列／专用重塑／螺旋／十源转换统一验收）：**2702项完整测试与849模块构建通过**；Python15、TS13；38真实场景／28响应。四入口合计141真实主应用场景／111响应、0页面异常，1000/760/390×720控件与嵌套图形无滚动或裁切。统一机器报告 `output/audits/p45-sequence-special-helix-surface-batch-acceptance-20261001.json`。十源界面的最终主应用TSX/CSS以 `output/audits/p45-fold-surface-main-ui-freeze-20261001.json` 为准，先前隔离快照保留作历史。
