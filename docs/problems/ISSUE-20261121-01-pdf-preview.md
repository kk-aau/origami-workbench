# ISSUE-20261121-01 · PDF 预览重复渲染和改样式卡顿

| 字段 | 记录 |
|---|---|
| 首次反馈／建档 | 2026-11-21／2026-11-22 |
| 发生版本 | 截图显示 0.13.53-tauri.85；具体首次引入版本未确认 |
| 输入与触发 | 83 步、12 页图解；打开 PDF 导出，来回切页、调整彩带宽度或颜色 |
| 预期／实际 | 复用已看页面、顺畅更新／反复加载渲染、调样式卡顿 |
| 状态／交付 | 源码与开发运行验证；0.13.53-tauri.86 已打包，按要求未追加实包验收 |

## 触发结果与因果

页面缓存容量与可见页保护不足、进行中的渲染任务未充分复用，样式变更触发不必要的折图生成；同时，父组件预读重渲染会影响节点拖动。实际验证使用上述样例，不能外推所有机器或任意大工程都无卡顿。

## 对应文件与解决方法

| 文件 | 处理 |
|---|---|
| `src/app/diagramPDFArtworkCache.ts`、`diagramPDFPreviewPlan.ts` | 有界缓存、可见页保护、共享在途任务及必要失效 |
| `src/components/DiagramPDFExport.tsx`、`diagramPDFPreviewBody.ts` | 合并短时输入；纯显示更新复用正文／几何；过期任务清理 |
| `src/components/DiagramPDFScrollPreview.tsx`、`src/app/diagramPDFScrollWindow.ts` | 默认双页连续滚动，保留单页，限制挂载范围并预读邻行；缩放／窗口变化保页 |
| `.runtime/pdf-preview-cache-1121/source-changes.json` | 完整修改列表和原始源码 SHA256，本机证据 |

## 历史比较

已比较同轮彩带问题及 skill 中纸层案例；未进行全历史性能故障普查。

| 关联 | 判断与证据 | 回归 |
|---|---|---|
| [20261121-02](ISSUE-20261121-02-ribbon-gradient.md) | 共享 PDF 样式和预览路径，触发交叉；渐变坐标错误与缓存失效不是同一根因 | 调分支色／带宽不重生成正文，曲线渐变与矢量输出仍正确；已有同轮联合验证 |

## 验证与发生记录

2026-11-21 开发验证：回访已看页面正文重渲染 0 次、12 次带宽修改正文重渲染 0 次、分支色更新正文重渲染 0 次；窗口往返保第 11 页；按下拖动后经历父级重渲染仍能保存。与彩带案例共用的 222 项 PDF 测试通过及类型检查通过，不能按两案例相加。

证据：`.runtime/pdf-preview-cache-1121/verification.json`、`final.json`、`scroll-final.json`、`node-drag.json`；回归入口 `tests/app/diagramPDFPreviewPlan.test.ts`、`diagramPDFScrollWindow.test.ts`。完整工程不归档进源码；未完成新版实包性能验收。

后续关联：[07 顺序阅读最长链路](ISSUE-20261122-07-sequential-branch-reading.md) 改变顺序模式分页并在正文添加分支引导，未修改缓存；对应预览计划、正文缓存及 artwork 一致性测试通过。

关联补充：[08 放大选区确认进度](ISSUE-20261122-08-zoom-selection-progress.md) 同有卡顿表象，但原因是同步全工程编码，与 PDF 预览缓存不同；未修改本问题的缓存保护。
