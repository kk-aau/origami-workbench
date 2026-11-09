# Origamica 第 45 节：MatchCurvesPair 一般原生数值入口

日期：2026-09-30。Notebook 来源为 In[3864] 的 `MatchCurvesPair` 与 In[3867] 的 `NMatchCurvesPair`；保存圆输入 In[3865/3868] 保留。前置推导与独立准备见 `output/audits/P45-MatchCurvesPair-通用数值实施准备-20260930.md`。本文记录工程合同及前端来源回读；后端连续区间证据由独立 Python 模块产生。

| 范围 | 已实现入口及准确边界 |
|---|---|
| 一般输入 | 五个白名单原生表达式 cₓ(s)、cᵧ(s)、ccₓ(s)、ccᵧ(s)、cc𝓏(s)，固定 ψ/σ=±1，共同 s 域、真实物理 w 域、显示密度；不是增加几个圆预设 |
| 原式语法 | `Sin[s]`、`Cos[s]`、`Tan[s]`、`ArcTan[s]`、`Sqrt[]`、`Exp[]`、`Log[]`、`Pi`、`E`、`^`、相邻因子乘法；兼容小写圆括号及整数 `**`。无 eval/Function/任意属性或代码执行 |
| 保存恢复 | query JSON 原样保存全部五个 source 字符串、ψ、σ、两域和两种密度；载入后重新计算。保留保存圆原式恢复与旧圆弧解析模式及旧导出 |
| 构形 | 输入已经给定平面和空间的位置函数。由 Frenet/Darboux 母线代数生成真实平面直纹带和空间直纹面；没有添加 frame IVP、人工初始 frame 或积分 |
| 只读边界 | 解析同速、有限点 EFG、全域数值容差、全域正则和二维纸域单射分开记录。保守证书 unknown 保留整个原域及真实数值曲面；不改曲线、不自动重参数、不缩宽度 |
| 未实现职责 | 任意 Wolfram 过程/模块/DSolve、任意符号恒等判定、未闭合区间的全域证明、一般纸边自交求解、三维碰撞、连续运动、层序和精确直线 FOLD；不能采用为折痕图 |

## 数学和参数合同

在相同共同参数 s 下要求两曲线同速 a(s)>0。平面单位切向 t=c′/a、左法向 l=rot₉₀t、有符号曲率 κₗ=det(c′,c″)/a³；空间采用 Frenet T,N,B、曲率 κ、挠率 τ。需要 κ>0、κ²−κₗ²>0。令

```
C = κₗ / κ
S = ψ sqrt(κ²−κₗ²) / κ
L = C N − S B
U = S N + C B
A = U′·T = −aκS
Q = U′·L
H = |U′|
p = −sgn(A) Q/H = ψ Q/H
r = |A|/H = −ψ A/H
d  = σ(p t + r l)
dd = σ(p T + r L)
X(s,w)  = c(s)  + w d(s)
XX(s,w) = cc(s) + w dd(s)
```

前端直接从源位置表达式的四阶 Taylor jets 构造 U′ 与母线导数；后端连续包围可采用等价 A、Q 和标量雅可比表达式减少依赖膨胀。所有导数均针对实际共同 s，非线显式共同重参数的链式导数只作用一次。没有用独立弧长参数混代 s。两侧同速是原同参数匹配的必要条件，因为 w=0 时 E=|c′|² 与 |cc′|²；不相容来源不能通过改空间速度或删带来“通过”。

令 g=aκₗ，则连续平面雅可比

```
J(s,w) = det(c′+w d′, d)
       = σ a r + w(r p′ − p r′ − g)
```

它关于 w 仿射，所以固定 s 下横向端点同一非零方向可覆盖整条母线。全 s 区间仍需连续包围，显示弦段或有限采样不是该证明。固定纸轴下 Jacobian 对称部分正定是完整共同矩形纸域单射的充分证书；该证书未通过时报告 unknown，不能把它当必要条件宣称几何无效。

## 返回合同与严格回读

API：`/api/tessellation/curved-matched-pair`；family=`curved-matched-pair`，variant=`generic-native`。固定合同见 `output/audits/p45-matched-pair-contract-20260930.json`。

| 对象 | 客户端独立核验 |
|---|---|
| query/source | 精确字段集合、原 source 字符串/ψσ/域/密度回读；Notebook cells、方法与参数语义逐字核对，不接受替换圆公式或未知字段 |
| 每个 row | s 同索引，c/d/cc/dd、四组 Prime 及八组 normalized 对应字段；从五个 source 重新计算四阶 jets 与分支，不相信返回坐标自行定义 geometry |
| 每个 grid 点 | 真正世界 w 同索引；用源 c+w d、cc+w dd 稳定构造 normalized，再验证 world 回变换；w 非对称时基线始终采用 row c/cc，而非显示网格中间列 |
| 度量 | 从返回 normalized jets 独立重算 EFG、母线单位长度与可展性；另在 129 个共同参数上从原 source 重算，不限于显示端点或 w=0 |
| 分支 | 固定 ψ/σ 原文回读；重算 S、A、p/r、真实母线及其导数，检查 A·ψ<0、r>0，拒绝母线反向或法向分支篡改 |
| 证书 | 所有 exactKeys 与布尔依赖；certified intervals 首尾及接缝连续覆盖、计数关系；正的下界不允许超过源采样实际最小值；纸轴源初值、正交性和充分证书数值一致性 |
| unknown | 全域正则未知时 lower bounds 为 null、reason 非空，解析等距/全域容差 flags 按依赖降级；所有源曲线和全部原宽度 grid 保留 |

浏览器的 129 点复核是有限数值验收，不冒称重新执行后端 SymPy 恒等证明或 outward 区间证明。后端解析同速是有界安全 AST 直接构造符号节点、受预算约束的代数/三角化简；解析恒等不能判定时采用数值容差或 unknown。结果标识明确区分 `analyticSpeedEquality`、`finiteNumericalMetricVerified`、`numericalIsometryToleranceCertified`、`fullIntervalRegularityCertified`、`analyticLocalIsometry` 与 `planarPaperInjectivityCertified`。

## 相似尺度与 IEEE 边界

两侧分别保存原 source 起点作为 origin，共同 L=起点平面 source speed。位置满足 `world=origin+L·normalized`，d/dd 和全部导数满足 `world=L·normalized`。因此 `normalizedD=d/L`，不是另造单位母线；canonical EFG 使用 normalized 位置、横向 w/L 与真实 unit d/dd。显示使用 normalized 字段，不能由世界坐标先相减丢失小图样。

AST 保留可分离常数 offset，先在局部坐标中求源导数再回变换。独立回归覆盖 1e−8 图样叠加 ±1e9 平移；normalized 几何/导数仍严格核验。world 坐标仅允许本地尺度容差或少量 ULP 的实际表示误差：1e9 处 binary64 无法表达 1e−8 的每个变化，多个世界点可能相同，不能据此声称小图样已经几何塌缩。origin 允许少量跨 JS/Python libm ULP 差；normalized 字段仍单独严读，不能用大平移的相对容差遮掩结构改变。

共享 Taylor 倒数只拒零值或非有限倒数，移除绝对 1e−13 分母门槛。专项同时覆盖原式 `2e−16/(1e−16)+s` 与 1e−16 实际匹配图样，而非仅把小分母绕过归一化；非有限倒数仍拒绝。全域 interval/libm 包围采用返回的 binary64 outward 与 libm endpoints 2 ULP 假设，不能称无假设的实数严格证明。

## 验收记录

| 检查 | 当前证据 |
|---|---|
| 前端专项 | 新增 8 项匹配测试全部通过；原圆 4 项、已有通用关联 7 项通过，共 19 项。包含四 ψσ 分支、非线共同 s/非零起点、负共同方向/负曲率、数值同速、尺度、导数有限差分、源/母线/导数/grid/证书篡改与真实 unknown 保留 |
| 真实 Python fixtures | 共 10 份最终数学源码结果：四分支非圆、原圆、非线共同 s、1e−8 叠大平移、负共同方向、数值同速、真实全域 interval unknown。生成器 `output/audits/p45-matched-pair-frontend-fixtures-20260930.py`；测试 fixture `tests/fixtures/curved-generic-matched-pair.json` |
| 静态检查 | `npx tsc --noEmit` 通过；统一全量验收由主代理执行 |
| 主应用浏览器 | 最终 reload 后 `output/playwright/p45-generic-matched-pair-report-20260930.json`：passed=true、pageErrors=[]。12 个真实构形 case 通过，另核不相容/unsafe 即时清图及旧圆本地模式；JSON 逐源/几何 hash 往返、请求中连续改参只最新 generation 生效、视角/母线零重请求、非对称 w 的源基线、真实 interval unknown 和 numerical 同速分级均通过 |
| 三宽真实可见性 | 1000×720 双 SVG 高 359/358px；760×720 高 376/375px；390×720 高 107.59375/102.59375px。全部五原式、ψσ、两域/密度、母线、JSON 存取/两种恢复和关闭真实可见；手机第 5 源表达式实际可编辑并成功重算。无工具/dialog 滚动，图像高度显式 ≥100px 门禁；普通单行 input 可内部水平移动长表达式，不等同工具滚动 |
| 初次失败与修复 | `p45-generic-matched-pair-before-layout-fix-report-20260930.json` 保留桌面真实纵向溢出；`p45-generic-matched-pair-before-phone-chart-fix-report-20260930.json` 保留手机最初图高 6–8px 的失败。通过实际 label/gap/同排布局修复，不裁掉 source/控件。原圆标记 circle 改 non-scaling-stroke，避免 2 个世界单位描边遮盖小图，最终截图能清晰看到两个真实带 |

本轮入口是通用白名单原生曲线的工程数值实现。未证明的全域/碰撞/运动边界会继续保留明确的 unknown/false，不以几个更容易认证的 demo 宣称任意来源已经全部闭合。
