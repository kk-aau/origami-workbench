# 原 FrenetTrihedronPlot3D 的数值函数与图形数据合同

本批增加独立公开函数 `frenetTrihedronPlot3D(verifiedSystem, options)`、完整数据回读 `readFrenetTrihedronPlot`、有限正交预览 `frenetPlotPreview` 和真实主 App“原曲线与多标架”窗口。入口位于“空间构造 → 原式工具与参考示例 → 曲线系统与恢复 → 三维 Frenet 系统”。复用现有安全三维曲线表达式和经过独立求值回读的完整系统，不新增求解后端，不产生或采用 CP。

## 原定义与有效默认

| 原定义 | 实际语义与本批行为 |
|---|---|
| `FrenetTrihedronPlot3D`，In[3713]，294184–294318 | 基线 StyledCurve；按等参数步长计算位置、T、N、B；对四个列表使用同一 Drop；返回 Graphics3D 图形 |
| 默认选项 In[3712] | FrenetVectorLength=0.1、FrenetTrihedrons=5、FrenetDrop=0，全部保存为 `source.declaredDefaults` |
| 原 `flen` 未参与后续调用 | StyledFrenetTrihedron 仅收到显式 opts。未显式长度时实际默认为 1；显式长度按输入生效。保存为 `effectiveVectorLength`，不修正原遗漏 |
| 说明称 CurveDivisions 传入 StyledCurve，但代码未传 opts | 原 StyledCurve In[1710–1711] 默认100分段，基线101个参数位置。CurveDivisions 输入保存、明确无效，基线不改变 |
| 基线固定原样式 | Black、Thickness[0.01]、非 directed、非 tube；绘图数据保存原属性，显示为正交线条预览 |
| StyledFrenetTrihedron In[3708] | 保留 T、N、B 顺序；端点为 p+length*v；默认三标签为空。颜色/CMYK、线宽3、管厚0.007、偏移[-2,0]复用已公开原三面体合同 |

源定义保存于 `tmp/Origamica-15.0-reference.nb`；本批证据另保存精确原行号摘录，不以说明文字覆盖原执行代码。

## 可表示输入域

| 输入 | 接受域与行为 |
|---|---|
| 原 pp_Function | 已有 `curve3` 安全表达式三分量函数。s 域在±10、递增跨度0.01–12，来源和完整域沿用现有校验。任意 JavaScript/Wolfram Function、InterpolatingFunction、恢复系统或其它模式明确拒绝 |
| FrenetTrihedrons | −128–0 或2–129整数。≤0保留基线，不生成标架；1原式除零，拒绝；小数及超预算值未支持 |
| FrenetDrop | 正整数删头、负整数删尾、0保留；All、None；JSON `{ "UpTo": n }`；单层 `[n]`、`[m,n]`、`[m,n,step]`，采用原1起始正/负位置。范围须在列表内、方向与非零整数步长一致。普通超长整数不截断；仅 UpTo 可截断。fn≤0原本不执行Drop，本应用仍校验有限规范的形状及预算 |
| FrenetVectorLength | ±10⁶内有限数，包括0和负数。留空为未显式原选项，实际默认1 |
| 标签/厚度/偏移 | 三个≤120字文本；线宽0–1000、管厚0–1、两个±1000有限偏移，继承原三面体构造器校验。任意样式对象、显式 VectorLabelStyle 或颜色重定义未支持 |
| CurveDivisions | 1–1024整数，记录用户原选项但按原代码不转发 |

四个标架输入列表对应同一原参数数组与 Drop 索引。每个保留参数直接从安全源函数与导数重新求值，既不吸附原系统的显示采样点，也不在已有位置或向量间插值。未定义N/B的标架保留原参数、位置、T、null和诊断，图形为null；不捏造单位标架。基线100段遇现有完整域未证区间会中断显示连接，不把未证区间画成已证连续线。

## Graphics3D 的有限 JSON 子集

原实现用 FilterRules 将 Graphics3D 选项传给 Graphics3D。本批接受并完整保存下面九项。预览实施相应有限值的边界框、轴、比例、裁剪、观察方向、尺寸、标签和背景，原世界坐标及全部箭头数据始终保留。

| 选项 | 默认表示 | 可表示值 |
|---|---|---|
| Axes | false | boolean或三个boolean |
| Boxed | true | boolean |
| BoxRatios | "Automatic" | "Automatic"或三个0–10⁶正有限数 |
| PlotRange | "All" | "All"或三个±10¹²内递增范围 |
| ViewPoint | [1.3,-2.4,2] | 三个±10¹²有限数，非零向量 |
| ImageSize | "Automatic" | "Automatic"或64–4096宽度、宽高数组；窄窗口约束预览显示宽度，导出仍保原数值 |
| AxesLabel | "None" | "None"或三个≤120字文本 |
| PlotLabel | "None" | ≤240字文本；"None"表示原无标签 |
| Background | "None" | "None"或三个0–1 RGB数值 |

此默认表来自[官方 Graphics3D 文档](https://reference.wolfram.com/language/ref/Graphics3D.html)，没有运行 Wolfram 15 内核验证通用选项。Drop 的位置/范围规则按[官方 Drop 文档](https://reference.wolfram.com/language/ref/Drop.html)中的单层有限序列实现。

未知选项拒绝；Lighting、Method、任意函数/符号样式、无限ViewPoint、Graphics3D其它自动/通用选项尚未支持。预览采用正交投影及简化线/管显示，未复现 Wolfram 透视、自动轴边/刻度、光照、样式排版、图形表达式或机器Table舍入行为。输出相应 `wolfram*Reproduced` 标志均为false。

## 完整返回与读回

返回完整已校验系统、显式 options、原来源/声明及有效默认、图形选项、101个基线点、显示连接、全部原标架参数、保留/丢弃索引与每个保留点的原T/N/B和三箭头原数据。读回重新计算并逐字段验证。

Chrome/Node 的 sin/cos 有约一ulp跨运行时差异。仅重算几何坐标允许 `32*Number.EPSILON*自然尺度` 舍入容差；位置尺度使用原归一化scale/坐标/箭长，方向使用原单位向量尺度。来源、显式选项、参数、索引、颜色、标签、厚度、连接、null及诊断仍严格相等。回读返回当前运行时重算结果；不承诺跨运行时字节相等。

## 验收证据

| 检查 | 结果 |
|---|---|
| 专项TS | 14项：原遗漏默认、实际非旧网格参数T/N/B、Drop、有限选项、裁剪、伪造、跨运行时舍入、未定义/未证域 |
| 类型与隔离主App构建 | tsc --noEmit与主App入口Vite build通过；不包含模拟器入口打包 |
| 真主App UI | 24项正常流程+5项真实伪造/恢复文件，共29项 |
| 真实JSON | 五文件，完整回读与独立解析位置/叉积TNB/箭头审计；每点误差<10⁻¹¹ |
| 390窗口 | 弹窗354×688、内宽330，均无横向溢出；实际滚动后图形/按钮可见 |

隔离初次主App默认 `/api/tessellate` 有422：当前开发Python缺pulp，此旧默认路径不属于本批。新增图形使用已成功返回的三维系统数据；本批零pageerror不等同于整个主App零HTTP错误。
