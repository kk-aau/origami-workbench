# Origamica In[3185] ArchimedeanPatch[2] 裁剪复现（2026-09-26）

| 项目 | 结果 |
|---|---|
| 来源 | Origamica 15.0 In[3185]，普通 ArchimedeanPatch[2] Alt |
| 母结构 | 4×4 方格母结构，范围 U/V 为 0…3 |
| 裁剪语义 | 只保留整块顶点落入 [0,2.9]² 的拼块；保留纸张外延到整块边界 [0,3]² |
| 通用请求 CP | 未裁剪 16 面 / 100 点 / 180 边 / 81 面；裁剪后 9 面 / 64 点 / 112 边 / 49 面 |
| 命名构造一致性 | 命名 JoinTiling/PatchVectors 与通用 JSON 逐字段一致，坐标误差 < 1e-8 |
| 几何与层序 | 未裁剪、裁剪后均通过平折几何；层序均为 solved，精确解数 1 |
| 正反面 | 可见区域均有确定 top-to-bottom 顺序，裁剪结果边界不人为切到 2.9 |
| 工作区入口 | 自定义拼块 → 阿基米德[2] →“4×4 Alt 裁剪 · In[3185]”；固定褶宽 0.2、扭角 30°、中心 VVMM、裁剪窗口和原版并边选项，仍按实时检查决定是否可采用 |

## 实现位置

- backend/test_tessellation_archimedean_patch2_prune_in3185.py：后端来源、整块裁剪、CP 与检查。
- scripts/verify-archimedean-patch2-pruned-in3185.ts：前端参数回读、命名/通用 CP 对照、平折层序与正反面区域回归。
- package.json：已加入 test:tessellation 主回归。
- src/app/archimedeanPatchSource.ts 与 src/components/ArchimedeanPatchControls.tsx：具名预设、严格来源读回及工作区入口；伪造折痕参数或裁剪窗口会失去原版来源资格。
- tests/app/archimedeanPatchSource.test.ts：保存回读、来源防伪和编辑后来源失效。

## 限制

该案例只覆盖 In[3185] 的方格 ArchimedeanPatch[2] 裁剪分支，不等同于所有 ArchimedeanPatch 的任意多边形窗口裁剪；其他构型仍须按各自的来源样例逐项核对。原笔记本没有可机读的对应数值 Out，因此本地 CP/层序通过不等于运行中 Wolfram 逐点等价。
