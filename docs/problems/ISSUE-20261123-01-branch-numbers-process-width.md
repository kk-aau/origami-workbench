# ISSUE-20261123-01 · 分支编号跳号与过程图线宽遗漏

| 项目 | 记录 |
|---|---|
| 日期／版本 | 2026-11-23，用户反馈 tauri.94 后的导出 |
| 触发 | 多分支蛇形或顺序阅读跨页；基本信息修改边界线宽后导出含过程图的教程 |
| 实际结果 | 56 的后继编号 62，53 的后继编号 57；普通折图线宽变化而过程图仍粗 |
| 预期 | 各分支沿自身父步骤递增，56→57、53→54，隐藏字母；过程图继承主工程全局线宽 |
| 编号根因 | 20261122-07 中将用户“接着数字往下”错误理解成全篇唯一序号，按分页格子顺序编号；其他分支消耗了中间数字。用户本次明确纠正 |
| 样式根因 | 过程图优先使用自己保存的旧 palette；此外捕获的矢量过程图经 frameInkSVG 绘制时固定使用 1.35，完全没有接入主工程边界宽度 |
| 编号解决 | displayNumber 使用分支树深度 stepIndex+1；过程图保持父步号-过程序号。页面安排、主线选择、分隔线和仅分支开头的来源提示保留；内部身份键继续使用原分支标识 |
| 线宽解决 | 主工程显式 globalFields 覆盖过程图同类字段，保留未修改默认值和单线 appearanceOverrides。捕获矢量线条应用边界宽度比例，frameInkSVG 缓存加入宽度；保留纸面填色补缝宽度与原捕获颜色 |
| 修改文件 | diagramPDFLayout.ts、diagramExportPanel.ts、diagramLineStyles.ts、diagramFrameArtwork.ts、diagramImages.ts、diagramDrawing.ts、DiagramPDFExport.tsx |
| 真实工程 | 只读 gentleman-body-1122（沿用 07 记录的原始文件）；蛇形和顺序均 119 面板、118 条父子边，逐条验证下一折叠步骤为父步号+1，过程图不增加步骤号；真实捕获过程图的 .7/.4 输出已不同 |
| 回归 | diagramPDFSequentialBranches 与 diagramBoundaryWidth 新增/更新分支父子编号、过程图样式继承、单线例外及矢量线宽缓存断言；联合过程图和预览测试 31 项通过；Vite 开发产物构建通过 |
| 本机证据 | .runtime/pdf-branches1123/：改前 SHA256、tests.log、types.log、verify.ts、result.json、figure-07.svg、figure-04.svg |
| 边界 | 未改 CP、纸层或用户工程；位图像素无法按矢量线宽重画。本轮没有打包或推送请求，未进行桌面实包验收 |

历史对比：本次编号是 [07](ISSUE-20261122-07-sequential-branch-reading.md) 的错误需求解释纠正，不改变 [06](ISSUE-20261122-06-grid-tree-pagination.md) 的走线搜索；过程图与 [10](ISSUE-20261122-10-model-boundary-width.md) 属同一设置链路遗漏，但新增根因在独立捕获矢量入口。缓存仍遵守 [预览记录](ISSUE-20261121-01-pdf-preview.md) 的复用边界，改线宽不重算折叠几何。

2026-11-23 后续：用户指出已有折痕也成为黑粗线。确认此前只补统一笔宽，捕获类别原本已丢失；新增 [03 捕获折痕分类](ISSUE-20261123-03-captured-existing-creases.md)，新捕获按类别应用样式，旧图因缺少语义需重捕获。原整体线宽回归继续通过。
