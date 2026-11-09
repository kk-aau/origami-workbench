# 第45节 FoldAcrossRight 一般原生数值入口

一般输入接入原“跨右侧曲折”窗口，保留原圆弧解析子域。原saved-pair圆锥/反折窗口及圆弧三维运动保持专属入口。

| 项目 | 内容 |
|---|---|
| 原函数 | FoldAcrossRight2D / NFoldAcrossRight2D In[3983/3986]；3D In[3991/3994]；Both In[3998/4001] |
| API | `/api/tessellation/curved-generic-across-right`，operation同名，导出query_curved_generic_across_right |
| 源合同 | f/rL二维、ff/rrL三维、γ安全s原式；mode决定实际计算；全部原文随JSON保留 |
| 实际构形 | 直接原Frenet/UL/UR′代数计算左右面、同索引网格及一阶导数，无积分或隐式根 |
| 左侧幅度 | 原rL完整保存，只按原源归一化T×rrL；正系数v∈[0,leftWidth/rightWidth] |
| 浏览器回读 | 独立AST/Taylor重算来源、原左右母线、分支、jets、位置、完整网格及129点EFG |
| 区间证明 | outward Taylor源分支与affine-width面积投影，最多511次；unknown保留完整源域与构形 |
| 不相容 | 原Both输入EFG失败时保持真实双图与false/reason，不能采用或宣称匹配 |
| 当前未证 | 全域配对等距、全部3D焦线判断、纸域全局单射、三维碰撞、运动路径、精确直折痕FOLD |

源推导、NB行号、60位独立非圆证据及工程区间见 `output/audits/P45-FoldAcrossRight-一般源输入实施审计-20260930.md`。有限点通过和连续外包围通过在UI及认证字段中分开。原数值函数的Wolfram插值规则并未复刻；本入口明确采用原生源导数的数值计算。

专项：9个Python测试已通过；13份真实来源fixtures由独立后端生成，8个TS严格回读/篡改/API专项通过。新增8+旧圆弧4+旧saved-pair6合计18前端专项通过。包含三模式、非恒γ、非线共同源、非单位幅度、不相容/非可展左面、未知区间保留、1e−8图样叠1e9平移，以及合法1e−13非零面积不误叫焦线。

真实浏览器最终报告 `output/playwright/p45-generic-across-report-20260930.json`：passed=true，pageErrors=[]，16个ready来源场景，另有原圆弧模式、原式奇点、精确Pi极点、半角tan跨极点、unsafe共5个验证分支。计算中连续改参只采纳最后s终点0.7/64段；旧图立即失效，status/诊断/图面占位没有抖动；JSON保存恢复原source文字/query/sampleHash完全一致；本地视角和母线不会重发参数请求。

| 真实窗口 | SVG高度 / 宽度 | 所有输入、footer及工具滚动 |
|---|---|---|
| 1000×720 Both | 359/358px；各277.5px宽 | 全部可见，0 overflow |
| 760×720 Both | 372/371px；各180px宽 | 全部可见，0 overflow |
| 390×720 Both，十个来源分量 | 78.297/75.297px；各147px宽 | 全部可见，第十字段真实编辑影响结果，0 overflow |
| 390×720 2D / 3D | 101.297 / 75.297px；各320px宽 | 实际只生成请求模式的一张图，0 overflow |

首次桌面controls overflow及首次手机SVG不足70px报告分别保存为 `p45-generic-across-before-layout-fix-report-20260930.json`、`p45-generic-across-before-phone-chart-fix-report-20260930.json`，均在同一output/playwright目录。修复实际间距、控件高度和caption布局后，最终图高门禁与完整控件门禁通过；未删输入或裁切controls。

精确Pi极点曾被binary64 cos(pi/2)近似非零误认可定义，最终由有界安全AST→符号节点对原表达式排查精确极点；同时禁止原域半角tan符号跨越。真实API已返回fold-angle-pole/fold-angle-branch并清图。γ=4仍按原signγ合法计算，并未人为限制主值角。最终数学SHA256：`BE0FF31575D18A93011E828D166FFFA3F312B0987647A4F96FFD52D86273777D`。
