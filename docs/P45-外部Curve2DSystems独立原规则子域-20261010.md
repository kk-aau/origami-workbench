# 第45节：Curve2DSystems 独立调用者规则的有限可用域

本批新增独立显式模式，让原 `Curve2DSystems` 中不来自输入曲线的外部规则真正参与求角、隐式根续接与三维恢复。默认仍是已验证同源系统；两种描述与文件类型不能互相冒充来源证明。原输入表达式、声明域、规则数组顺序和未归一化初标架均保留，非等距构形继续显示实际残差，不生成虚假的 CP/FOLD 认证。

## 原定义证据

| 原来源与行号 | 真实合同 | 本批处理 |
| --- | --- | --- |
| In[4073–4076]，338595–338775 | `Automatic` 转空列表，按长度选择 `cs[[1]] / cs[[2]] / cs[[3]]`。没有同源、与 f 相等、规则域相等或单位标架核验。 | 显式 `independent-external` 接受调用者声明的四规则。默认同源模式的严格来源核验是工作台子域，不再作为整个原函数的合同。 |
| In[4076]，338777–338809 | 通过规则替换读第一系统 l0/ds0/κg0、第二系统 t1/l1/ds1/κg1，直接调用提供的函数。 | 按原规则键消费独立表达式，原数组顺序完整保存，不归一化、不重建为替代系统。 |
| In[4076]，338811–338940 | 第三系统被选中后没有在该 Next2D 中引用。 | 前2项与前3项三曲线用例角／根／构形完全相同；明确 `next2DThirdSystemUsed:false`。四曲线后续调用把第三系统作为下一三曲线组的第二系统，会真实改变下一角和后续带。 |
| In[4085]，339860–339897 | Next3D 同样直接消费提供系统的切向和左法向规则，没有单位化导入值。 | 原 raw 标架用于实际 Darboux 首曲线恢复与后续原标架代数，不以只放宽门禁代替构造。 |
| In[4085]，339830–340040 | f0 已在签名声明；第二系统默认分支却读取 f0 而非 f1。 | 记录错曲线 fallback 的原缺陷，未假称 f0 未定义，也未猜修原义。本工作台既有共同参数公式纠正戳保持不变。 |

来源摘录及原笔记本 SHA256 为 `evidence/original-independent-systems-source.txt/.json`。原笔记本 SHA256 为 `19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9`；这是源码核对，不是执行 Wolfram 内核保存输出。

## 实际合同与验证边界

沿用 `/api/tessellation/curved-linked-first-band` 的 `generic-common-parameter` 入口，新可选 `curve2DSystemsMode`：

| 模式 | 系统描述／文件 | 来源与求值 |
| --- | --- | --- |
| 默认 `verified-same-source` | `origamica-curve2d-system-description`／`origamica-curve2d-systems-file` | 原同源符号恒等与完整原生域门禁不变；独立描述无法绕过该证明。 |
| 显式 `independent-external` | `origamica-independent-curve2d-system`／`origamica-independent-curve2d-systems-file` | 声明调用者来源 `Curve2DSystems / In[4076] / caller-supplied-safe-rules/no-source-identity`，没有曲线同源绑定。来源戳明确 `sourceIdentityAsserted:false`。 |

独立描述包含原 `parameterDomain:[uMin,uMax]` 和四个唯一原键：`TangentVector2D`、`LeftNormalVector2D`、`Speed2D`、`LeftCurvature2D`；两个标架规则各有2分量，速度和曲率各有1分量。规则数组可按输入顺序存放，消费按原键匹配；前0–3项系统数组仍按对应曲线顺序替换。`Automatic` 与空列表保持零外部系统，独立模式仍显式声明。

表达式为现有有预算白名单数值语言，原参数 u、三角／反三角、平方根、指数、对数、整数幂均有实际求值和 Taylor 导数。声明域在±20内、长度至少.02，完整声明域用区间细分检查有限性；实际关联参数必须落在原声明域，禁止外推、缩域或移动参数。声明域可以与源曲线域不同。有限负速度也按原值消费，不取绝对值或替换成源导数长度。零分母、隐藏极点和积分预算失败均明确拒绝原输入。

这仍是原任意 Function／InterpolatingFunction 合同中的有限安全表达式子域，**没有实现任意 Wolfram 运行时或数值插值对象**。既有共同参数入口仍要求原生根位于有限曲线域、q′为正、可包围的简单根与有限曲面求值；这些是本工作台构造域限制，不是原函数要求规则必须同源。`originalArbitrarySystemContractReproduced:false`、`numericalInterpolationReproduced:false` 保持。

实际首曲线用导入速度及 κds 求 Darboux 系数，初标架直接用原导入 t/l。后续使用原点积、叉积与折角旋转代数，不把标架单位化。前端以独立 Dormand–Prince 5阶积分重建12维首曲线状态，再独立回放全部带的原代数和导数；后端采用 SciPy DOP853。回读比对显示节点的三维位置／导数、129审计节点的标架／可展／测地残差，拒绝伪造初值、轨迹、规则来源和认证。有限抽样不声称全域恒等或积分误差包围。

独立模式取消同源等距身份的假定，`isometryIdentitiesApplied`、`allBandsAnalyticLocalIsometry`、完整材料正则／单射证书为 false。实际 EFG／标架残差单独报告；`finiteNumericalMetricVerified` 只有实际残差通过时才为 true。即使同源规则显式复制成独立描述，也不继承同源证明。CP采用、精确直线FOLD、碰撞、运动路径与积分全区间误差均未认证。

产品入口是通用原生曲线关联多带的“Curve2DSystems · 外部预计算系统”。可以选择合同、直接编辑规则 JSON、显式复制当前规则为独立输入、载入未归一化示例、导入／导出系统及保存／载入参数。切换模式不会静默重写文件身份；恢复起始函数回到默认同源模式。独立结果明确标“三维实际构形 · 等距未证”。

## 原字面参考与真实产物

参考源曲线为 `f_i(u)={u,.3u²+.2i}`，q0=q1=s、γ0=1.8，共同域[0,.35]，原根初值0。外部常量为 `T={2,0}, L={0,3}, ds=1, κ=.6`，规则声明域[-2,3]与源[-1,2]不同，数组顺序为 T、L、ds、κ。原规则本身允许这种输入；非单位标架不会被改造成单位替代系统。

前两项独立时，原 Next2D 字面角为γ1=-1.8，根方程化为 `2(z-s)=0`。三维首曲线用独立增广矩阵指数预测，逐点对照真实积分输出；后续三维带用原 raw 代数预测，没有调用生产 Kernel 作为预期值。

| 真实替换项 | 最大原值标架 Gram 残差 | 最大 EFG 残差 | 保存的真实公共API与下载产物 |
| ---: | ---: | ---: | --- |
| 1 | 5571.401094054139 | 310.37128482250125 | `browser-raw-prefix-1-response / source / systems.json` |
| 2 | 559851.5552954682 | 78728.26558842522 | `browser-raw-prefix-2-response / source / systems.json` |
| 3 | 559851.5552954682 | 78728.26558842522 | `browser-raw-prefix-3-response / source / systems.json` |

这组大残差是原值不相容的真实结果，不能算折纸等距证书。前三项的第三系统在当前 Next2D 未使用，几何与前两项相同。四曲线补例把第三系统曲率从.6改为.8：首个 Next2D不变，下一原字面角从103.1324031235482°变为 `2 atan(.6/.8 tan(.9))=86.76766768472473°`，前三曲线相同、第四曲线真实改变。

| 验证 | 通过结果 | 证据 |
| --- | --- | --- |
| 独立原规则及旧同源／通用关联 TS | 18项 | `evidence/ts-tests.log` |
| 新独立规则及旧同源／通用关联 Python | 23项（9新＋5同源＋9通用） | `evidence/python-tests.log` |
| 实际界面、前1/2/3项替换、规则与参数真下载／再导入、来源伪造、隐藏极点、窄窗、恢复默认 | 46项、零页面异常 | `evidence/browser-validation.log`、桌面／窄窗截图 |
| 实际浏览器下载文件独立回读 | 20项 | `evidence/download-readback.log` |
| TypeScript及构建 | 通过，985模块 | `evidence/build.log` |

所有实现与证据在 `output/parallel/original-independent-systems-1010`，冻结 baseline 捕获于2026-10-10 03:29:20 UTC，1655文件。补丁只比较该 baseline，保留其 EOL；不交付server、tessellate、Darboux、Resample、公共入口面板或其他并行工作的文件。根线程的 Darboux `getattr(self,'resampling',None)` 继承兼容修复完整保留，生产及旧冻结目录均未写入。
