# ISSUE-20261122-09 · 外部拖入与跨工作区统一打开

## 概况与发生记录

| 字段 | 内容 |
|---|---|
| 首次反馈／建档 | 2026-11-22 |
| 模块与关键词 | 文件打开、外部拖放、工作区分发、JSON、原生选择器 |
| 当前状态 | 功能已实现；针对性源码测试通过；真实界面流程尚未完成验收 |
| 交付边界 | 计划随 tauri.93 打包；用户随后明确“打包不检测”，停止追加检测，不标记实包已验收 |

| 发生日期与版本 | 输入／前置状态 | 用户动作与实际结果 | 结论 |
|---|---|---|---|
| 2026-11-22，tauri.92 后源码 | 停留在任意工作区，持有另一工作区的工程文件 | 要求外部拖入即可打开，打开按钮不再局限当前工作区 | 原入口按工作区筛选和调用专用导入器；新增统一识别和分发 |

## 触发方式和结果

| 项目 | 内容 |
|---|---|
| 复现操作 | 在折序界面点打开并选择基础形设计；或从外部将 ZDS、ZCP、ORIW 等工程拖到应用画布 |
| 原行为 | 文件选择器仅列当前工作区类型；缺少应用级外部工程拖入分发入口 |
| 预期 | 打开按钮、Ctrl+O、外部工程拖入均识别格式，自动进入对应工作区；桌面使用新标签保留当前作品 |
| 错误与取消 | 无效数据仍由目标导入器完整校验；不能用识别成功替代导入成功；保留原替换确认、取消和过期结果保护 |
| 多文件 | 拖入的工程文件按队列逐个分发；内部标签、符号拖动不作为文件，已有图片／SVG导入目标保留 |

## 对应文件与因果链

- `src/app/projectFileRouting.ts`：支持格式、JSON 根内容识别与工作区映射。镶嵌生成后采用的独立 CP 仍属于折痕编辑；原生曲面设计进入镶嵌工作区。
- `src/app/projectFileRoutingTask.ts`、`src/workers/projectFileRouting.worker.ts`：大 JSON 在 Worker 中识别；取消、出错或完成后释放线程。
- `src/app/projectFileDrop.ts`、`src/components/ProjectFileDrop.tsx`：捕获外部 Files，阻止文件导航，串行队列、拖入提示和同源 iframe 覆盖；卸载清理。
- `src/App.tsx`、`src/components/DocumentWindowShell.tsx`、`src/app/workspaceFileWindow.ts`：统一按钮／快捷键／文件关联／拖入分发，文件及原生绑定随新标签移交。
- `src/components/DiagramWorkspace.tsx`、`src/components/DesignWorkspace.tsx`：打开按钮接统一入口；实际校验和导入仍由原工作区负责。
- `src/app/selectProjectFile.ts`、`src/desktop.d.ts`、`src-tauri/src/desktop.rs`：新增 project 类型的原生文件选择器，合并支持的文件扩展名。
- `src/workers/projectImport.worker.ts`：内容识别出的 FOLD JSON 使用 FOLD 导入；去除 JSON BOM，保留完整准备及分块确认协议。
- `tests/app/projectFileRouting.test.ts`、`tests/app/projectFileContentImport.test.ts`：路由、取消、事件隔离、真实 Worker 导入与无效数据回归。
- 本机最小夹具、改前 SHA256 与日志：`.runtime/unified-open1122/`。不使用或复制用户私人工程作为源码夹具。

## 历史问题对比与受保护行为

| 历史来源 | 关联与差异 | 本次保护／证据 |
|---|---|---|
| [百万折痕 CP 导入响应修复](../百万折痕CP导入响应修复-20261027.md) | 共享导入链路，本次是入口分发缺失，不是交点准备卡顿复发 | JSON 识别放 Worker；继续调用原后台导入、完整分块和迟到保护；未重跑百万折痕性能案例 |
| [ORIW 作品文件格式](../ORIW作品文件格式.md) | 完整作品含多个工作区，不能误送折序或基础形解析器 | ORIW 与旧完整作品 JSON 分发到原完整作品恢复链路；不转换成单一 CP |
| `selectProjectFile.test.ts` 原生绑定案例 | 共享文件跨标签移交机制 | 不丢失原生选择器绑定；文件绑定和取消等原有测试通过；拖入文件没有原生写入授权，保存沿用另存选择器 |
| `desktop_documents.rs` 原有 disable_drag_drop_handler | 此保护使 HTML5 标签／符号拖动继续工作 | 不改成原生拦截拖放；只捕获 Files，内部 MIME 不拦截；图片留给原目标 |
| 问题索引中的 PDF／纸层案例 | 未发现同因；入口分发不改布局、层序、运动或求解预算 | 保留上述已有实现；本轮未重跑无关计算案例 |

## 验证与交付

| 项目 | 结果／边界 |
|---|---|
| 针对性单测 | 打包请求前，路由、真实内容导入、导入任务、选择器、CP 编码及基础形文件共 30 项通过 |
| 类型与开发构建 | TypeScript、Vite、Rust Release 构建通过；不等于界面验收 |
| 桌面开发窗口 | 曾启动隔离宿主并观察首次设置界面；跨区打开和拖放端到端未完成，不计通过 |
| 用户追加指示 | 2026-11-22“打包不检测”：不再运行 Playwright、功能检测、独立实包验收或 Rust 测试 |
| 候选交付 | tauri.93；正常构建与源码／许可归档，候选状态 packaged-not-acceptance-tested |

## 未完成事项与复发排查

资源管理器物理拖放、原生选择器实际交互、多个 WebView 标签切换、同源模拟器 iframe 拖入以及最终 Setup／Portable 生命周期均未完成本轮验收。若用户反馈失败，先区分扩展名／JSON识别、跨标签文件移交、目标工作区校验、事件目标是否为同源 iframe；不得直接取消校验或覆盖当前未保存工程。
