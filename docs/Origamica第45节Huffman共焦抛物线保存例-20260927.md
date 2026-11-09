# Origamica 第 45 节：Huffman 单位圆＋共焦抛物线保存例

**状态：只读数值重建；不能采用为精确平折或制造模型。** 本例与半径 4 圆版本 `HCwCCircle4` 是原笔记本中两个不同的构造。原文将抛物线版称为 *partially worked out*，将圆版称为 *fully worked out*，并说明书中使用圆版；不能把圆版的闭合根或认证结论移植到本例。

## 可核对的原版输入

本地只读副本 `tmp/Origamica-15.0-reference.nb` 中，第 335633–337428 行保存了下列输入单元：

| 单元 | 可核对内容 |
| --- | --- |
| In[4058] | `HCwCParabola[ti1,ti2,γ1i,γ2i]`，构造三片直纹面及 `f0..f3,ff0..ff3` 等 17 项；`t∈[0,π/2]`。 |
| In[4059] | 共用的 `HCwCGraphics` CP 绘图函数；三片母线分别标为山／谷／山，采样 `RulingLineDivisions→25`。 |
| In[4060]、In[4062] | 二维单块／对镜绘图，均以 `(5°,85°,60°,−90°)` 调用 `HCwCParabola`。 |
| In[4066]、In[4069] | 同一参数的三维单块／对镜绘图。 |

这些单元保存的是绘图**输入**，没有可用来逐点核对的机器可读数值 `Out`、顶点表或最终闭合参数。原版也没有给抛物线例保存类似圆版 In[4071] 的闭合 `FindRoot` 四方程。源文本称其为“部分完成”，这一证据边界在 UI/接口里必须保留。

平面第一折线是单位圆 `f1=(cos t,sin t)`，第二折线由

```text
f2 = 4/(1+cos q) · (cos q,sin q)
```

给出，等价于焦点在原点、顶点为 `(2,0)` 的抛物线 `x+y²/8=2`。第三边界为 `f3=(2,f2_y)`。原版的 `q,γ1,γ2` 由三条一致性 ODE 决定；`q(5°)=0, γ1(5°)=60°, γ2(5°)=−90°`，`q′` 在 `t<5°` 和 `t>85°` 的端区为零。本地独立求解得到 `q(90°)≈84.61185363°`；它不是读取到的 Wolfram 输出，也未证明唯一性。

源中 `γ2′` 的表达式含互相相消的 `tan(γ2/2)·cot(γ2/2)` 与一个因子及其倒数。本地按等价化简式积分，并显式拒绝原表达式的极点；不能据此宣称与 Wolfram 的 `NDSolve`、`NRecoverDarboux3D`、`FunctionInterpolationAlt` 插值策略逐位一致。

## 几何与认证边界

本地计算验证了保存参数下第一、第二片二维／三维连续曲面的局部 `E,F,G` 数值一致，以及活动段第三片母线方向近似恒定。测试在活动段取内部点，用独立中心差分检查三种宽度的度量，残差小于 `3×10^-7`；所测七个活动点的圆柱方向变化小于 `2×10^-8`。这只是受限数值证据，不是全域解析证明。

更关键的是，In[4058] 明确给**三维**第三母线长度加 `10^-6`，注释称用于避免零长度线；对应**平面**母线没有这个偏移：

```text
|f3−f2| = 2 − 4 cos(q)/(1+cos(q))
|ff3−ff2| = |f3−f2| + 10^-6
```

在 `q=0` 的端区，平面第三片零宽、三维第三片仍宽 `10^-6`。所以完整块不是精确等距折叠，不能标为已验证 FOLD、可采用 CP、全局无自交或可制造结构。二维对镜绕 `f1(0)` 半转，三维对镜绕通过 `ff1(0)` 的源定义轴半转；刚体对镜不会消除这处差异。

## 受限查询契约

`backend/tessellation_huffman_parabola.py` 重建保存参数下的 ODE、Darboux 框架和平面／三维边界；`backend/tessellation_huffman_parabola_query.py` 只接受：

```json
{"family":"huffman-parabola-in4060","divisions":25}
```

`divisions` 可取整数 8–64。25 段标记为原版绘图保存输入；其他段数标记为本地受限重采样。不得提交任意公式或另一组参数。响应 `family=origamica-huffman-confocal-parabola-pair`，`sample.rows` 每行包含 `t`、`anglesDeg`、四条二维边界 `flat`、四条三维边界 `folded` 及其两套对镜坐标和第三母线长度；`source.originalCompletionStatus=partially-worked-out`、`source.machineReadableWolframOut=false`。所有完整等距、精确 FOLD、采用、自交和部署路径认证标志固定为 `false`。`src/app/huffmanParabola.ts` 严格验证来源、采样范围、抛物线方程、对镜坐标和逐样点 `10^-6` 差，并拒绝虚假的认证标志。专用前端请求路径为 `/api/tessellation/huffman-parabola`，服务端已接入独立只读路由。

`backend/test_tessellation_huffman_parabola_query.py` 的 5 项测试和 `tests/app/huffmanParabola.test.ts` 的 4 项测试通过，`tsc --noEmit` 通过。测试覆盖受限输入、保存参数与端点、数值度量、镜像刚体关系、实际 Python 响应严格回读以及篡改后拒绝。它们没有证明与原版渲染逐像素一致，也没有把抛物线例提升为圆版那样的闭合构造。

## 工作区接入

2026-09-27 已通过独立 `/api/tessellation/huffman-parabola` 路由接入“空间构造 → Huffman 共焦抛物线 · 部分完成”。弹窗并排展示保存输入下的二维／三维对镜双块，允许受限的 8–64 段本地采样、查看当前母线和调整三维正交视角；25 段明确标为原版绘图输入。界面显示末端**抛物线参数** `q(90°)`，明确它不是折角 `γ₂` 或 Wolfram 数值 `Out`。错误采样会清除旧图；没有采用按钮，也不修改工作区 CP、FF 或工程。服务端新增的安全路由测试通过，Huffman 圆版仍走自己独立的查询路径。

1000×720 真实浏览器加载 `main-DygUgwjb.js`：25 段绘出 2 个 SVG，末端 `q=84.61185363°`；改为 8 段重新采样并标为本地扩展；改为非法 65 段显示输入错误且旧 SVG 为 0。弹窗 648/648、控制栏 564/564、结果栏 566/566、页面 720/720，无垂直滚动；窗口按钮只有关闭和恢复采样，没有采用。截图 `output/playwright/huffman-parabola-readonly-20260927.png`。打包后的 `zhezhi-tess.exe` 已直接调用圆版与抛物线版各 8 段，两者各返回 9 行且 `adoptableCreasePattern=false`。
