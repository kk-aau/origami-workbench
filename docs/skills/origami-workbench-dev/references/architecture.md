# 代码地图与状态语义

以下源码路径相对迁移版根目录。入口用于定位，文件改名后用 `rg` 查符号，不据旧路径创造第二套实现。

## 核心区域

| 区域 | 优先入口 | 易混淆的边界 |
|---|---|---|
| 工作区与状态 | `src/App.tsx`、`src/app/state.ts`、`src/core/types.ts` | 工作标签、作品和绘图步骤不是同一状态 |
| CP／预折联动 | `src/components/DiagramWorkspace.tsx`、`src/app/diagramCPEditing.ts`、`diagramCPEdgeEdit.ts`、`diagramFoldTransactions.ts`、`diagramFoldLink.ts` | 操作意图与物理 CP 分开；保持事务和撤销完整 |
| 工程与分支 | `src/app/diagramProject.ts`、`diagramBranches.ts` | 界面步号由分支计算，不能拿数组索引当 57B |
| 平折与相对层序 | `src/core/flatFold.ts`、`relativeLayerConstraints.ts`、`layerAdjustment.ts`、`flatLayerSelfDiagnosis.ts` | 候选顺序、用户硬约束、完整覆盖认证不同 |
| 空间接触与姿态 | `src/app/diagramSpatialPose.ts`、`diagramSpatialLayerSolver.ts`、`diagramSpatialContactGroup.ts`、`diagramSpatialTask.ts` | 屏幕重叠不等于真实共面接触；旧关系不能直接当新证书 |
| 精确覆盖与绘图分区 | `src/app/modelExactTopology.ts`、`modelExactArrangement.ts`、`diagramIllustrationMesh.ts` | 显示分片不等于新材料纸面；精确数值结果仍受输入模型有效性约束 |
| PDF 预览与导出 | `src/components/DiagramPDFExport.tsx`、`DiagramPDFScrollPreview.tsx`、`src/app/diagramPDFArtworkCache.ts`、`diagramPDFPreviewPlan.ts`、`diagramPDFRibbonPaint.ts` | 预览缓存、排版、矢量生成和原生保存分层处理 |
| 桌面保存与宿主 | `src/app/api.ts`、`src-tauri/src/`、`desktop-tauri/` | React／WebView2 负责交互，Rust 负责桌面文件选择与写入 |
| 完整离线引擎 | `backend/`、`vendor/`、`scripts/build-tessellation.ps1` | 不能改成联网依赖或删组件换取体积下降 |

搜索限于相关源码目录，明确排除 `src-tauri/target/`、`node_modules/`、`.toolchain/`、构建产物。PowerShell 不会像某些 shell 一样替工具展开路径通配符；例如用 `rg ... src/app -g 'diagramSpatial*.ts'`。

## CP 和步骤

- `M/V` 表示山谷方向；`F` 是已有展开折痕，通常为 0°。主图的 `valley/mountain/crease` 是显示与操作类别，不能仅凭虚实线判断实际终态。
- 预折指令通常把新路径写为操作后 CP 的 `F/0°`，用 `foldLink.precreases` 保留压折时的 M/V 方向及角度。本步可画山谷线；下一步保留痕迹，不保留折起终态。
- 已经折叠的旧 M/V 上执行预折返回有专门语义：不要把全图 M/V 机械改成 F。参考 `retainDiagramPrecreaseIntents` 和 `diagramPrecrease.test.ts`。
- 当前步骤的操作前 CP 可能共享上一步的操作后 CP；整份 CP 编辑、选中某边设置本步用途是不同权限路径。
- 修改 CP 后核对 pose 的 `sourceStateId`、`sourceRevision`、`sourceDoc`、活动 `paperStates`、联动生成记录与下游缓存。不能用旧姿态掩盖新 CP 计算失败。
- 分支定位使用 `diagramBranchNumbering`；遍历主链和 `branchSteps`。同名、同序号附近的步骤可能属于不同分支。

## 层序

- 几何 `ready` 不保证层序 `solved`；局部面关系已解不保证存在单一全局绘制顺序。
- 保存的层序记录和便携接触解需按当前几何重新验证。跨 Worker 或 JSON 边界不能沿用进程内对象缓存作为证明。
- 下一步继承关系是求解偏好；明确指定的相对关系是硬约束。两者都不能凭面编号直接跨拓扑复用，须按材料纸面映射并复核。
- 容差接触求解、精确覆盖、显示三角化各有职责。查清哪个阶段过滤了什么，再判断补关系还是修分区；不要笼统地“提高精度”。

## PDF

页缓存应有边界并保护正在显示的内容；翻页、预读、快速样式变化、关闭弹窗与过期任务取消需协调。纯显示颜色变化优先复用几何，真正影响排版的变化要正确失效。

连续浏览同时考虑单／双页、当前页定位、滚动位置、缩放、邻页预读和节点拖动保存。分支首段颜色按蛇带方向沿曲线从父色过渡到子色，跨页保持沿程连续；不能用页面坐标渐变代替蛇带走向。
