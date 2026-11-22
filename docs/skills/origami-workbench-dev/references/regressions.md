# 复现与历史保护

## 实际工程的最小诊断

1. 只读取得原工程摘要与 SHA256，在 `.runtime/<任务>/` 使用副本。确认实际格式再解析；本项目 `.zds` 可为 `zhezhi-diagram` JSON，不能仅凭后缀当 ZIP。
2. 根据分支编号定位目标，记录操作前／后 CP、姿态来源、修订号、活动纸面状态、预折意图、相对约束。截图中的界面步号不是数组序号。
3. 分别复现导入恢复、修改、下一步、保存重开。先用真实数据调用与应用相同的业务函数缩小原因，再按任务需要验证实际 Worker、界面和宿主。
4. 最小夹具只留必要几何、关系与参数；移除完整历史、图像、私人路径及无关作品内容。证明它保留同一失败机制。
5. 区分几何失败、层序矛盾、范围／精度无法确认、状态过期和线程故障。记录旧逻辑如何失败，修后如何满足几何、关系、持久化不变量。
6. 因果链确认后、实施修复前，按问题记录规范比较历史问题并写明关联依据；根因变化后重新比对，修复后更新关联案例的回归结果。详细结论放入问题档案，而不是只写在本次聊天或临时日志中。

## 历史记录的唯一维护入口

使用 [问题索引](../../../problems/INDEX.md) 和 [问题模板](../../../problems/TEMPLATE.md)。具体案例的触发、结果、对应文件、方案及验证在档案中维护，不在 skill 内重复复制整份历史结论。

- 分区退化与有效细三角：读 [ISSUE-20261018-01](../../../problems/ISSUE-20261018-01-next-step-mesh.md)。
- 空间接触继承与循环：读 [ISSUE-20261110-01](../../../problems/ISSUE-20261110-01-spatial-contact-cycle.md)。
- 接触覆盖与容差树判定差异：读 [ISSUE-20261121-04](../../../problems/ISSUE-20261121-04-layer-overlap.md)，同时核对它的旧风险和关联案例。
- PDF 缓存或渐变：从索引进入两个独立问题，按共享的更新链路做联合回归。

先分清计算层，再决定旧限制能否调整。索引尚未覆盖全部历史，未找到记录时继续查原有文档与测试；本机证据缺失、未复现和未验收如实保留，不能把缺失证据当作无关联或已通过。

## 测试入口按风险选取

| 改动 | 相关测试 |
|---|---|
| 预折、赋型、已有折痕、下一步 | `tests/app/diagramPrecrease.test.ts`、`diagramPrecreaseAdvance.test.ts`、`diagramCPEdgeEdit.test.ts`、`diagramCPEditing.test.ts` |
| 纸层约束、覆盖与候选 | `tests/core/relativeLayerConstraints.test.ts`、`layerAdjustment.test.ts`、`flatLayerSelfDiagnosis.test.ts` |
| 空间接触与继承 | `tests/app/diagramSpatialLayerSolver.test.ts`、`diagramSpatialLayerGuard.test.ts`、`diagramSpatialContactGroups.test.ts`、`diagramSpatialContactTransition.test.ts`、`diagramSpatialContactPrecision.test.ts` |
| PDF 缓存、连续滚动、彩带 | `tests/app/diagramPDFPreviewPlan.test.ts`、`diagramPDFScrollWindow.test.ts`、`diagramPDFRibbonPaint.test.ts`、`diagramPDFBranchColors.test.ts`、`diagramPDFVector.test.ts` |

这些是选取入口，不是每次全部运行的清单。新语义需要有意义的补充断言。快速断言通过后，仅因新失败、后续修改或未解决风险才扩大测试。

性能比较使用同一输入、模式、机器与计时范围，区分预热和缓存命中；同时检查输出几何、面数、折角、完整覆盖、诊断及取消能力。一次较快结果或粗略内存读数不能证明普遍改善。
