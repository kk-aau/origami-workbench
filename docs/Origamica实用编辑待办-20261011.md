# 实际镶嵌创作编辑补盘

仅检查当前源码和既有验收文档，不打开浏览器、不运行测试。此增量不改原8文件盘点；不把只读理论示例、数学全域、完整Mathematica语义列为任务。**三个旧痛点已经有可视编辑，新增优先事项是把现有自定义创作从数字表或JSON进一步接到源图。**

| 用户旧痛点 | 当前源码行为 | 可复核证据（workbench内） |
| --- | --- | --- |
| 旋转壶体剖面 | 主入口是可视剖面；网格刻度、拖点、精确半径/高度、沿路径插点/删点、预览取消都有。JSON位于“高级坐标”，不是主流程。矩形和扭转壶体复用同组件。 | [RadialPotControls.tsx](D:/codex/折纸工具/workbench/src/components/RadialPotControls.tsx:34)、[PotProfileEditor.tsx](D:/codex/折纸工具/workbench/src/components/PotProfileEditor.tsx:36)、[高级坐标](D:/codex/折纸工具/workbench/src/components/PotProfileEditor.tsx:40) |
| 对偶目标点 | 黑母图、紫目标、青实际解分开；拖动和精确输入是主操作，已有刻度和导航。目标数量按母图索引固定，任意增删不属于该编辑器应做的操作。 | [TessellationPanel.tsx](D:/codex/折纸工具/workbench/src/components/TessellationPanel.tsx:234)、[TessellationEditor.tsx](D:/codex/折纸工具/workbench/src/components/TessellationEditor.tsx:94)、[P54真实编辑误拒修复及验收](D:/codex/折纸工具/workbench/docs/P54-原曲线CP与多瓣展开统一验收-20261011.md:30) |
| 修剪母结构 | 完整母图背景、轮廓拖点、闭轮廓插删点、精确输入、预览/取消、纸张适配已有；JSON是可展开的高级输入。保留相交整块是现行修剪规则，不计作编辑缺口。 | [PruneControls.tsx](D:/codex/折纸工具/workbench/src/components/PruneControls.tsx:77)、[轮廓操作与高级坐标](D:/codex/折纸工具/workbench/src/components/PruneControls.tsx:92) |

共用编辑器的[工具栏及指针处理](D:/codex/折纸工具/workbench/src/components/TessellationEditor.tsx:64)、[坐标刻度/精确输入](D:/codex/折纸工具/workbench/src/components/TessellationEditor.tsx:92)、[取消和采用](D:/codex/折纸工具/workbench/src/components/TessellationEditor.tsx:96)均已接。显示坐标转换与[原坐标回写](D:/codex/折纸工具/workbench/src/app/geometryEditor.ts:12)互逆；刻度不是新一次毫米缩放。本审查仅确认代码路径，不新增字号、布局或鼠标实测声明。

| 9基础空间family | 当前常用编辑方式 | 本次是否发现所问的操作缺口 |
| --- | --- | --- |
| radial-pot / rectangular-pot / twisted-pot | 三种壶体复用可视剖面编辑 | 无新增；3个family |
| gore-paper | 球面数字参数或[原Gore剖面可视点列](D:/codex/折纸工具/workbench/src/components/GoreControls.tsx:25)，支持增删、刻度、拖点 | 无新增；1个family |
| flasher / paraboloidal-flasher | 环数、高度、旋转阶、径向间隔、阈值等数字/滑条，加主画布候选 | 未见JSON主导问题；公式型参数不必伪装为自由点列；2个family |
| curved-circle-polyhedral / linked-first-band-polyhedral | 折角、分段、区间、宽度或保存源分段数字/滑条，加主画布候选 | 未见JSON主导问题；不把源函数范围当易用性任务；2个family |
| discrete-curve-cp | [逐原顶点选取、折线点和两母线向量数字表](D:/codex/折纸工具/workbench/src/components/DiscreteCurveCPControls.tsx:22)；3–16点选择会恢复本地示例 | **已有原盘点中的真实缺口**：无源图刻度/点拖动；自定义点列不能在保现源的同时方便插删。P55实际采用保存已验，不等于这项源图编辑已做。 |

| 常用创作区 | 已有能力 | 真实易用性缺口与建议边界 |
| --- | --- | --- |
| 混合平铺/拼块组合 | [主组合](D:/codex/折纸工具/workbench/src/components/TileAssemblyEditor.tsx:78)已有多选、整组拖动、旋转、缩放、复制、镜像、按边对接、删块和撤销；[添加正多边形/星形](D:/codex/折纸工具/workbench/src/components/TileAssemblyEditor.tsx:116)不靠JSON。阿基米德/二色/双均匀来源已有编号和格矢数值控件。 | 不能泛称“混合平铺只靠JSON”。但[组合SVG](D:/codex/折纸工具/workbench/src/components/TileAssemblyEditor.tsx:88)没有坐标刻度/网格、滚轮缩放或视图平移，仅“适合组合”；可补统一导航，保原组变换、源坐标和接缝不变。 |
| 自定义拼块轮廓与母网 | [编辑拼块形状](D:/codex/折纸工具/workbench/src/components/TileAssemblyEditor.tsx:133)、[拖动母结构顶点](D:/codex/折纸工具/workbench/src/components/TessellationPanel.tsx:229)已经有刻度和点拖；也可从折痕提取。 | 两处未启用editablePoints，数量固定；任意轮廓插删点、显式网格顶点/面拓扑仍主要经[网格JSON](D:/codex/折纸工具/workbench/src/components/TessellationPanel.tsx:228)。建议先做单拼块有序轮廓插删，显式网格拓扑另有清晰编辑流程，避免随意增点破坏面索引。可与上一行导航合成一个实用批。 |
| 线组编织：有限母图/原输入 | [WovenGraphEditor](D:/codex/折纸工具/workbench/src/components/WovenGraphEditor.tsx:26)已有新增点、连点、拖点、删点/边、分边、精确坐标、历史；[WovenGraphCanvas](D:/codex/折纸工具/workbench/src/components/WovenGraphCanvas.tsx:23)有刻度、网格、缩放、平移。自动拆分原输入也接该可视编辑，改源后须重拆。 | **此部分已解决，不列为JSON缺口。** [P42既有真实点边操作/210项回归](D:/codex/折纸工具/workbench/docs/P42-母图可视点边编辑与验收-20261008.md:34)说明实际链路已验；文档较早的“剩余范围”不能直接当当前剩余清单。 |
| 线组编织：直线/旋转弦线组及凸边界 | [线组表](D:/codex/折纸工具/workbench/src/components/WovenControls.tsx:70)能数字改角度/距离/宽度倍率并增删线；[边界编辑](D:/codex/折纸工具/workbench/src/components/WovenControls.tsx:72)可拖现有点且有刻度。 | 线组草稿窗口无可视源线/拖线，修改数字需保存后才更新主候选；边界编辑未启用editablePoints，改边界点数仍要[高级边界JSON](D:/codex/折纸工具/workbench/src/components/WovenControls.tsx:74)。建议补源线草稿图及保当前边界的插删点，继续沿原角度/有符号距离和重新构造门禁。 |
| 原始—对偶嵌套母参数 | 可从当前母结构“用于原始—对偶”；有[返回母结构](D:/codex/折纸工具/workbench/src/components/PrimalDualSourceControls.tsx:38)绕行进行其已有可视/数字编辑，再转换回来。 | 嵌套motherParams原位修改仍是[JSON弹窗](D:/codex/折纸工具/workbench/src/components/PrimalDualSourceControls.tsx:44)。这是低优先级流程简化，已有绕行；可复用原family控件并明确哪些母改动会清除旧对偶目标，不能暗保失效结果。 |

**建议顺序：P66真实布局闭环并打包 → 自定义拼块轮廓/组合导航 → N点源图编辑 → 直线组草稿及边界插删 → 嵌套母参数原位编辑。** N点项已在原8盘点，不再次计为新增；以上只是本次查到的实用体验事项，不宣称目标仅剩这些，也不由它们推算完整复现工期。原式参考、隐藏别名、数学合法全域不增加任务数。P66本轮父布局超高/字体失败由root与作者独立修复，本增量不评判其未完成的最终结果。

证据[evidence.json](D:/codex/折纸工具/workbench/output/parallel/original-public-construction-gap-inventory-1011/practical-editing-addendum-001/evidence.json)绑定28份当前源码/既有文档及精确行；原8文件逐SHA保持。没有新浏览器、服务、测试、生产修改或实际用户导出。
