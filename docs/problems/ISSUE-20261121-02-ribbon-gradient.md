# ISSUE-20261121-02 · 分支首段蛇带渐变未沿路径

2026-11-22 关联反馈：[05 彩带走线与布局](ISSUE-20261122-05-ribbon-routing.md) 共用绘制入口，但根因是节点排布及曲线通道；本条渐变回归在该修复中保留。

| 字段 | 记录 |
|---|---|
| 首次反馈／建档 | 2026-11-21／2026-11-22 |
| 发生版本 | 与同轮 PDF 预览反馈相邻；独立版本未确认 |
| 触发 | 导出图解，给分支设置颜色，查看首段弯曲或跨页蛇带；使用线性／径向渐变 |
| 预期 | 从父分支原色沿彩带方向过渡到设定色；跨页连续 |
| 实际 | 渐变相对页面而非蛇带走向，不能正确跟随弯曲路径 |
| 状态／交付 | 源码与开发运行验证；tauri.86 已打包未追加实包验收 |

## 前因后果与解决方法

渐变在页面坐标中定义 → 蛇带转弯后颜色进度与路径脱离 → 首段分支过渡和跨页连接不符合操作预期。用户已明确“反向”是笔误，应按彩带方向处理。

首段按实际曲线弧长从原色过渡到设定色；线性／径向采用沿程、带宽局部坐标，跨页共用进度。使用曲线分片重叠消缝与独立透明度遮罩，保持矢量导出，避免重叠导致半透明色变深。

## 对应文件

- 关键源码：`src/app/diagramPDFRibbonPaint.ts`、`diagramPDFDecoration.ts`、`diagramPDFBranchColors.ts`；精确实际修改列表和原始哈希见 `.runtime/pdf-preview-cache-1121/source-changes.json`，其余文件为相关入口。
- 回归：`tests/app/diagramPDFRibbonPaint.test.ts`、`diagramPDFBranchColors.test.ts`、`diagramPDFVector.test.ts`。
- 本机结果：`.runtime/pdf-preview-cache-1121/gradient-native.pdf`、`gradient-ui-final.png`、`vector-inspection.json`、`verification.json`。

## 历史比较与验证

| 关联 | 判断／依据 | 回归结果 |
|---|---|---|
| [20261121-01](ISSUE-20261121-01-pdf-preview.md) | 共享样式更新入口，根因分别为坐标体系和渲染复用 | 同轮检查颜色修改不重生成正文，渐变页面和透明样张无新增栅格图像，跨页无分段浅缝 |

2026-11-21 记录：12 页原生 PDF 导出；半透明径向样张检查；和预览问题共用的 222 项 PDF 测试及类型检查通过。完整实包验收未执行，图片和日志为本机开发证据。
