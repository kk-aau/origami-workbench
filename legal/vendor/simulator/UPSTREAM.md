# 固定的模拟器来源

- 仓库：https://github.com/zacharyfmarion/ori-studio
- Commit：`9fe341cd9bff1d6a9ba58eb04d806b7489012148`
- 路径：`packages/origami-simulator`
- 许可：该独立包为 MIT，见保留的 `LICENSE` 与 `NOTICE`。
- 上游算法来源：Amanda Ghassaei OrigamiSimulator，commit `7855983a613c879c171b2b1557f8cd102d2640cf`，MIT。
- 仅引入该包的 `src`、`LICENSE`、`NOTICE`、`README.md`、`package.json`；未引入 Ori Studio 主应用、作品图片、测试作品库或其他引擎。
- 2026-09-17：原样引入；工作台自己的验证、适配、中文视图位于 `src/engine/sim*.ts`。上游源码未修改。
- 2026-09-27：本地 `packages/origami-simulator/src/prepare.ts` 已针对工作台输入做修正，现与上述固定上游 commit 不完全相同。冗余折痕顶点仅在近乎严格共线时合并，避免上游约 8° 的容差拉直分段曲线；合并时保留显式 0° 目标角，不再平均不同的目标角。对应回归在 `tests/simulator.test.ts`。
- 2026-09-27：本地求解器另加入 `setVertexConstraint` 顶点目标约束，供三维工作区真实拖动纸面顶点。CPU 与 WebGL2 的默认 Euler 积分均支持；Verlet 对约束显式拒绝。GPU 复用外力纹理的空闲 alpha 通道标记约束，未新增纹理采样位。该改动也不是上述上游 commit 的原样代码。
- 2026-09-30：本地 `webgl/meshRenderer.ts` 改为与透视投影一致的齐次裁剪坐标和深度，完全重合纸面使用LESS深度比较固定显示顺序；`webgl/webglSolver.ts` 的图片导出改用24位深度缓冲。工作台另调整折线偏移、加入CPU逐像素遮挡并区分视角旋转与显式顶点塑形；没有新增物理碰撞处理。
- 2026-10-15：本地 CPU/GPU 求解器开放普通模拟负折叠比例（-100%～100%），CPU 切入 Verlet 时播种位置历史；两后端诊断增加平均节点轴向应变，GPU复用既有速度纹理读回，不增加状态报告读回。`types.ts`、`webgl/meshRenderer.ts` 和 `svgRenderer.ts` 同步加入 M/V/F/U/B 显隐和法向 RGB 着色，工作台 CPU 绘图读取相同选项与应变色阶。新增能力及验证见 `docs/origami-simulator-study.md`；以上均为本地修改，未变更固定的来源版本或许可。
- 运行时唯一外部包：`earcut@3.0.2`（ISC）；由工作台根目录的锁文件固定，构建进本地 JS。
- 2026-10-21：补齐原站抓取释放后的几何居中与全局速度清除。两后端新增 `recenter(target)`，在无活动顶点约束时统一平移当前姿态、同步位置历史，保留折角分支、目标、步数和原始纸面度量；CPU `arrestDynamics()` 同步清除 Verlet 隐式速度。交互层补可见顶点命中、悬停提示、真实拖动阈值、暂停恢复和取消清理，见 `docs/simulation-vertex-grab.md`。

## 获取和检查

先读取官方 README、包声明、LICENSE、NOTICE，再通过 Git 的 blob-filter + sparse checkout 获取以上明确路径。未运行上游安装脚本；未执行其测试或下载模型资源。检查引入代码中的 fetch、XMLHttpRequest、动态 eval、文件系统、进程创建等边界，未发现应用网络上传或远程执行行为。包内 `fetchPosition` 是 GPU 着色器的纹理取值函数，不是网络调用。

2026-10-16：首次将工作台加入版本控制时，将稀疏克隆的 Git 元数据移至本机忽略的 `output/` 目录保留备份；上述源码、许可证及本地修改作为普通 vendored 文件纳入工作台仓库，不使用子模块或 gitlink。克隆工作台即可取得构建所需文件，无需额外初始化子模块。可通过上述 commit 重新取得原始上游来源。
