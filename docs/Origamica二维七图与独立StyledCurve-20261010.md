# Curve2DSystemPlots 与独立 StyledCurve 数值图形合同

本批根据原定义补两个独立公开图形合同和真实主App入口。已有完整二维/恢复二维数值规则、单点标架图与外部Curve2DSystems仍保留；外部Curve2DSystems的四规则身份合同用于关联构造，不替代原Curve2DSystemPlots七图。已有保存例中固定StyledCurve调用也不替代独立源函数、分段与样式编辑。

入口：“空间构造 → 原式工具与参考示例 → 曲线系统与恢复”。二维/恢复二维模式提供“原二维系统七图”；安全源二维/三维模式提供“原样式曲线采样”。两个图形窗口都可编辑、导出、载入完整JSON和返回系统，不产生CP采用动作。

## 原二维七图

原源 `tmp/Origamica-15.0-reference.nb` 的 In[3623]，284044–284116，只有 `Curve2DSystemPlots[sys_List,{u0_,u1_}]`，没有opts重载。定义确实返回下面有序七图，固定标签不是规则全名。

| 顺序 | 规则 | 原绘图函数 | 固定标签 |
|---|---|---|---|
| 1 | Curve2D | ParametricPlot | c |
| 2 | Speed2D | Plot | ds |
| 3 | LeftCurvature2D | Plot | κl |
| 4 | Curvature2D | Plot | κ |
| 5 | TangentVector2D | ParametricPlot | t |
| 6 | LeftNormalVector2D | ParametricPlot | l |
| 7 | NormalVector2D | ParametricPlot | n |

`curve2DSystemPlots(verifiedSystem, range?)`接受既有完整安全curve2或recover2结果。默认显示全部原域，所有原系统样点/原规则值直接保留；编辑子范围必须在原完整域内递增，其新参数点按原源表达式或既有独立DP54恢复器求值。只有严格相同的已验证原参数才复用已有值，不作坐标最近匹配、参数吸附或样点插值。

本地显示密度沿用原系统已验证的segments，并明确属于数值显示密度。返回完整系统、原范围、原来源、顺序/标签/绘图函数、每图参数和值及显示连接。未定义null、左法向与法向的符号/零值、恢复系统原非单位初标架都保留；未证域不连接。读回重算并验证原参数、来源、顺序、标签、范围和数值。

本批没有复现Wolfram自适应ParametricPlot/Plot图形或任意sys_List的符号规则。数值规则回读继承现有系统3×10⁻⁸自然尺度诊断容差；参数、标签、顺序、来源与连接严格相等。原恢复器没有积分误差区间认证，七图不提升该认证。

## 独立 StyledCurve 原合同

原StyledCurve默认 In[1710]、执行 In[1711]（115419–115521）；实际样式图元由StyledLine In[1609]产生。

| 原选项 | 默认 | 独立入口行为 |
|---|---|---|
| CurveDivisions | 100 | 实际用于源参数Table；返回n+1个参数位置，接受1–1024整数 |
| CurveDirected | false | Line/Tube改为Arrow/Arrow[Tube] |
| CurveTube | false | 二维按原代码忽略；三维使用Tube图元 |
| CurveTubeThickness | 0.02 | 原StyledCurve说明称直径，但StyledLine代码实际Tube[pts,ltt]用半径；保存实际半径，接受0–10⁶有限数 |
| LineStyle | {AbsoluteThickness[2],Black} | 有限原指令列表；None按原代码返回空元素，不执行Table采样 |

与先前FrenetTrihedronPlot3D未转发CurveDivisions不同，独立StyledCurve会消费该选项。本批不修正先前原遗漏，也没有给二维七图添加原没有的样式opts。

`styledCurve(query)`的源输入为二维或三维安全单参数s函数分量，参数起止在±10内，跨度绝对值至少10⁻⁶，允许反向参数。每个位置直接由安全标量AST求值。它不需要Frenet导数，sqrt(0)、常量曲线和驻点位置可以正常采样；采样极点/非有限位置拒绝完整图形，源坐标限制±10¹²。

分量语法复用Planar白名单：每分量1–240字符、至多96 AST节点，四则运算和−8…8整数幂，sin/cos/tan/atan/sqrt/exp/log、pi/e，支持已有Wolfram函数别名/方括号及隐式乘法；s是唯一参数。有限常数和参数限定±10¹²。Tan处于数值不可分辨极点时拒绝。没有任意代码求值。

有限LineStyle域：列表至多16项，允许Black/Red/Green/Blue/Gray及明确RGBColor、CMYKColor、AbsoluteThickness、Thickness、Opacity、Dashing指令。颜色/Opacity/Thickness和虚线长度取0–1；绝对线宽0–1000；虚线至多12项。顺序和原值完整保存。任意命名样式、独立单符号颜色、任意Wolfram指令/Function/InterpolatingFunction与代码字符串未支持；未知项拒绝。

返回完整源query、有效原默认、原定义与采样语义、维数、每个原参数与源坐标、Style图元/点列/半径/原样式/CapForm[Round]。JSON以Line、Arrow、Tube、ArrowTube标签表示实际组合分支，未声称返回Wolfram Graphics表达式。

只有样点被实际求值，未证明样点间整个连续域。原StyledCurve本身采用Table后连点，本批不把这些离散样点升级为解析连续性、CP或FOLD认证。三维采用正交预览，Tube为本地线条外观，未复现Wolfram管面、箭头布局及通用渲染。

读回重新求所有源点；仅重算几何坐标允许32EPS原坐标自然尺度舍入，原参数、源函数、选项、样式顺序、图元及来源严格相等。不能通过保留相同坐标/修改源参数来替代原来源。

安全位置求值复用已有Planar标量AST解析器，仅增加小型公开单参数wrapper；没有eval、Function或任意代码执行，旧Planar合同不改变。

## 验收

| 验收 | 结果 |
|---|---|
| 专项TS | 13项：原七图顺序/全部值/范围/符号/未定义、StyledCurve默认与实际参数、反向/单位、2DTube忽略、3D原图元和半径、None、sqrt0、指令、代码/预算/伪造 |
| 已有Planar回归 | 9项通过，安全scalar wrapper未改已有行为 |
| 类型/主App构建 | tsc --noEmit与隔离主App入口Vite build通过 |
| 真实主App | 26项正常流程+9项真实伪造/恢复/取消，共35项 |
| 真实JSON | 7个下载，46项独立审计；默认/子域二维每个位置和速度/曲率/T/L/N按解析式验证；恢复raw初T=2的位置另用Simpson积分验证，最大独立误差<10⁻¹⁰ |
| 390窗口 | 两弹窗354×688、样式内宽330，无横向溢出；滚动后图形/按钮在窗口范围内 |

开发环境初次默认/api/tessellate可能因缺pulp返回422，属于旧默认路径；本批接口/窗口零pageerror不等于整个主App零HTTP错误。未安装依赖、不改变生产运行环境，不宣称整个主App手机适配。
