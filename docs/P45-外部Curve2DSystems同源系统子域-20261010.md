# 第45节：外部 Curve2DSystems 的可验证同源子域

本批为现有通用原生曲线关联带入口增加真正的外部预计算系统：可以独立生成描述、导出系统文件、导入按原曲线顺序排列的前1/2/3项，并实际用提供的函数规则求速度、曲率、切向及左法向。内部记忆化不是本选项的替代。

**完成范围是本工作台的同源白名单表达式子域，不是原函数任意外部规则与 Wolfram 插值对象的完整等价实现。** 来源/错域/错序/不相容系统的拒绝是本工作台的可验证门禁，原函数没有这些同源核验限制。

## 原来源与范围

| 原来源 | 已确认的合同 | 本批对应 |
| --- | --- | --- |
| `Curve2DSystem`，In[3627]，286911–287120 | 返回 Curve2D、Speed2D、LeftCurvature2D、Curvature2D、TangentVector2D、LeftNormalVector2D、NormalVector2D 有序规则。速度为原生 c′ 的长度，t=c′/ds，l={-tᵧ,tₓ}，κl=l·t′/ds。 | 描述保留关联调用实际使用的四规则子集：Speed2D、LeftCurvature2D、TangentVector2D、LeftNormalVector2D；原曲线与域另完整绑定。不是宣称七规则完整公共系统或 NCurve2DSystem 的数值插值已完成。 |
| `Curve2DSystems`，In[4073]/In[4074]/In[4076]，338595–338940 | Automatic 转成空列表；提供前1/2/3项时，依次替换 NCurve2DSystem[f0/f1/f2]。原函数按调用者给定规则取值，没有同源检查。 | 保留数组顺序与原规则表达式，在同源门禁通过后真正替换对应曲线的求值函数。Automatic/空列表实际零外部调用。 |
| In[4076]，338780–338809 | 第一系统读 l0/ds0/κg0；第二系统读 t1/l1/ds1/κg1。 | 接入原用到的速度×有符号曲率及标架；供后续共同参数导数、求根、三维恢复使用。 |
| In[4076]，338811–338940 | 第三系统 c2dsys2 虽被创建或接受，但在该函数后续完全未被引用。q2 计算读取的是原曲线 f2 和第二系统。 | 明确记录 `next2DThirdSystemUsed:false`。第三项不影响当前三曲线的首个求角/根阶段；当前关联多带 API 后续曲线标架/三维检查可以使用它，来源戳区分这些用途。 |
| `NLinkedFoldsNext3D`，In[4085]，339830–340040 | 签名已声明 f0 和 f1；第二系统缺省分支却调用 NCurve2DSystem[f0]，不是 f1（339872–339882）。 | 这是已定义 f0 的错曲线回退，**不是 f0 未定义**。记录原实际错误；本批不把猜值/猜修当原语义复现，也不改现有公共 API 已声明的参数与标架纠正范围。 |

原笔记本 SHA256、带原行号摘录及上述机器可读结论在 `output/parallel/original-curve-systems-1010/evidence/original-curve2d-systems-source.txt/.json`；仅读取源码，没有运行 Wolfram 内核。

## 可实施与实际接口

新增 `POST /api/tessellation/curved-curve2d-systems-native`，输入为 `family:"curve2d-systems-native"` 和1–3条完整原生曲线。输出有序系统描述，每个包含：

| 字段 | 保存内容 |
| --- | --- |
| `source` | 原函数 `Curve2DSystem`、In[3627] 及明确四规则安全子域。 |
| `curve` / `parameterDomain` | 原 x/y 安全表达式与完整原生域；不重写调用者源式或截短原域。 |
| `rules` | 固定顺序四键、六个白名单标量表达式，向量逐分量保存。导入时不归一化、不重建为替代系统。 |

沿用真实 `POST /api/tessellation/curved-linked-first-band` 的 `variant:"generic-common-parameter"`，增加 `curve2DSystems` 参数，取 `"Automatic"` 或前0–3项描述。省略选项保持旧行为。源参数 JSON 保留选项、数组顺序及所有原曲线/原生域/q0/q1/γ0/共同域/根种子；独立系统 JSON 为 `family:"origamica-curve2d-systems-file", systems:...`。

后端用已支持的实数安全表达式构造原速度、曲率和标架公式，对每个输入规则执行有预算的符号恒等核验；完整原生域再用区间细分核验规则正则性。符号消去不能掩盖域内极点，例如 `v(u)*(u-.123)/(u-.123)` 虽代数相消，仍由原域检查明确拒绝。不能确认恒等性或全域时拒绝原描述，不修补、缩域或改用默认计算。

实际 Kernel 的标架和测地系数从外部规则计算，保留其白名单表达式的 Taylor 导数；没有把文件当作诊断附件或仅记录“缓存已接受”。单独测试替换导入切向求值函数为可辨认异常，实际 geometry 路径会抛该异常，确认不是忽略参数；求值计数另保存在来源戳。

前端独立重算原源导数与有限高阶 jets，检查系统来源及规则，随后从**导入规则本身**独立回放关联角、根及返回几何。有限 jets 只是一项回读检查，不是全域恒等证明；全域主张来源于后端明确的符号核验与完整域区间检查。结果明确 `originalArbitrarySystemContractReproduced:false`、`numericalInterpolationReproduced:false`，不把这个子域升级为原完整参数合同。

产品入口：镶嵌设计 → 空间构造 → 原式工具与参考示例 → 关联同心圆 → 共同参数 → 通用原生曲线。新增“Curve2DSystems · 外部预计算系统”面板：显式预计算、选择前缀、导出/导入系统、查看实际替换项与外部规则调用计数。旧曲线/原域变更后，过期系统因来源不匹配撤回旧几何；不会静默丢系统选项。需要用户显式重新预计算或选择 Automatic。

这些是连续曲面工具；当前关联带原有精确直折痕 CP/FOLD 采用边界没有提升。本批真实导出并重新采用到数值入口的是系统与源参数 JSON，不宣传 CP 采用或精确 FOLD 导出。

## 原字面与实际回归

独立原字面例采用原 In[4076] 接受的平行抛物线 `fᵢ(u)={u,.3u²+.2i}`、q0=q1=s、γ0=1.8。四规则分别直接对应原公式：

| 量 | 原字面参考 |
| --- | --- |
| 速度 | √(1+.36u²) |
| 有符号曲率 | .6/(1+.36u²)^(3/2) |
| 切向/左法向 | {1,.6u}/√(1+.36u²)、{-.6u,1}/√(1+.36u²) |
| 下一折角 | γ1=-γ0 |
| 下一参数根 | 原 rfn 在该子域化为 `(1-.36s²)(z-s)+1.2s(.3(z²-s²)+.2)=0`；用独立50位精度根对照。 |

参考不调用生产 Kernel 作为预期值。另三组真实导入/下载例保留非线性 q0/q1 和非恒定 γ0，验证来源、原参数和全部带的实际几何。

| 真正替换项数 | 实际外部求值计数 | 最大 EFG 残差 | 实际产物 |
| ---: | --- | ---: | --- |
| 1 | [434] | 7.329248319365433e-12 | `browser-prefix-1-response.json / systems.json / source.json` |
| 2 | [444,444] | 7.329248319365433e-12 | `browser-prefix-2-response.json / systems.json / source.json` |
| 3 | [444,444,430] | 7.329248319365433e-12 | `browser-prefix-3-response.json / systems.json / source.json` |

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 原通用关联带 + 新系统 TS | 11/11 | `evidence/frontend-final.log` |
| 原通用关联带 + 新系统 Python | 14/14（9旧+5新） | `evidence/backend-final.log` |
| 真实产品预计算、前缀替换、系统导出/导入、伪造来源、域内极点、恢复、窄窗及 Automatic | 28项、零页面异常 | `evidence/browser-final.log`、桌面/窄窗截图 |
| 实际系统文件与参数逐字段精确、真实 HTTP 输出独立回读、与 Python 公共生成几何逐数值一致 | 13项 | `evidence/download-readback-report.json` |
| 类型检查及构建 | 通过，976模块 | `evidence/typecheck-final.log / build-final.log` |

所有实现位于新隔离目录 `output/parallel/original-curve-systems-1010`。任务开始捕获1626文件冻结 baseline；patch 仅比较它，server 交付文件也从该 baseline 生成唯一新接口增量，排除隔离端口和 Python 启动路径。没有修改共享源码、测试、docs 或旧审计；本批不交付 Darboux 内核，保留根线程近期的继承兼容修复。
