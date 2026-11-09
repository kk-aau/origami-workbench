# 独立迁移说明

来源：`../workbench/` v0.13.36。方案：Tauri＋Windows WebView2，Rust 替代 Node 本地服务；保留完整 Python 离线计算引擎。迁移初期保留四工作区的前端、绘制算法和操作逻辑，以下原始 SHA256 与验收记录用于追溯该迁移基线。

2026-10-28 用户确认：后续工作以本迁移版为准。新增功能、修复和界面调整在本目录继续开发，不要求与原项目逐文件一致；`../workbench/` 保持只读。当前版本以 `package.json` 与 `desktop-tauri/release.json` 为准，本文历史验收记录不代表当前版本已通过同项检查。

| 位置 | 用途 |
|---|---|
| `src/`、`public/`、`simulator/` | 迁移时复制并核对原工作区代码，后续在此实现当前需求 |
| `src-tauri/` | 新桌面宿主、Rust HTTP 服务、存储和 Python 进程调度 |
| `build/tessellation/zhezhi-tess/` | 独立复制的完整离线引擎 |
| `migration/` | 来源基线、测试和隔离验证记录 |
| `.toolchain/` | D盘 Rust、MSVC、Windows SDK、下载缓存及临时文件；不进入发行包 |
| `.venv/` | D盘独立 Python 开发环境，按原锁文件做数值回归；不进入发行包 |
| `.runtime/` | 迁移版独立 profile、数据与开发下载目录 |
| `desktop/`、`server.mjs`、`tess-worker.mjs` | 保留的迁移对照源码；新桌面运行时不启动 Node 服务 |

不复制用户工程、profile、偏好、恢复稿或日志；不使用指向原项目依赖的可写目录链接。本目录的依赖、构建输出与应用数据均独立。

## 开发命令

构建脚本加载 `scripts/toolchain-env.ps1`，将 npm／Cargo／pip 缓存、临时目录和运行数据指向本目录 D盘路径，不修改全局 PATH。

```powershell
# 开发构建，不生成发行安装包
npm run desktop:build

# 启动，也可双击“启动独立迁移版.cmd”
npm run desktop

# 后端单测和现有HTTP契约回归
npm run test:rust
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-rust-api.ps1

# 迁移初期的来源一致性核对（历史基线；后续授权改动不要求逐文件一致）
python scripts/verify-migration-isolation.py
```

Node／npm 仅用于前端开发构建及 JavaScript 测试。应用运行时为 Tauri／Rust 宿主、原前端 Worker 与 Python 离线引擎。WebView2 使用本机已有运行时，本次开发不将新运行时下载安装到 C盘。

开发启动脚本优先直接运行已有 Release EXE，其次 Debug；缺少 EXE 时才编译。修改宿主后先运行 `npm run desktop:build`。开发 EXE 配套本目录的 `dist/` 和完整引擎；发行构建改为相对EXE定位 `resources/dist` 与 `resources/engine`，不依赖开发目录。

## 验收状态

| 检查 | 证据与状态 |
|---|---|
| 复制来源4450个文件 | `migration/source-baseline.json` |
| 前端构建 | `npm run build` 已通过 |
| 原前端回归 | `migration/frontend-regression-summary.json`：首轮5285项通过，补齐独立Python后相关167项全部通过，原失败均已覆盖复核 |
| 原项目／工作区隔离 | `migration/isolation-verification.json`：原4450文件、四区源码及195个离线引擎文件 SHA256 一致，依赖无目录链接 |
| Rust HTTP 兼容 | `migration/rust-api-tests.log`：77项原接口断言通过；删除回退修复后相关存储接口16项再次通过 |
| Rust 后端与集成 | `migration/rust-final-backend-tests.log`：18项单测＋3项HTTP集成通过，包含真实锁争用退出测试 |
| 最终桌面构建与回归 | `migration/rust-final-desktop-tests.log`：22项单测＋3项集成通过；Debug和Release开发构建均成功 |
| 桌面兼容桥 | `migration/tests/desktop-bridge.test.cjs`：5项通过 |
| CP／FOLD 导入 | 真实 WebView2 中原生二进制IPC读CP；FOLD保留82条线段，记录 `migration/desktop-import.json`、`desktop-foldimport.json` |
| 镶嵌、平折、三维联动 | 参数滑条触发重新生成和平折；采用副本后以WebGL2实际折叠至25%目标，记录 `migration/desktop-slider.json`、`desktop-fold3d.json` |
| 折序与 PDF | 从CP建立2步折序并保存；PDF真实下载至D盘，71424字节、A4一页；`output/pdf/migration-qa.png` 已目视确认中文、CP及折图正常 |
| 关闭取消与异常清理 | 原生WM_CLOSE取消后窗口保留；强杀宿主后9个后代全部清理，`migration/desktop-forced-exit.json` |
| 修复后正常关闭／无响应关闭 | `migration/desktop-close-normal.json`：确认关闭约371ms；`desktop-close-unresponsive.json`：真实暂停渲染器后约4382ms退出，均释放端口且写入关闭日志 |
| Release 实际启动／关闭 | `migration/desktop-close-release-normal.json`：启动页交接到真实工作台，原生固定标题正确，约453ms正常退出 |
| 保存后重开 | `migration/desktop-reopen.json`：强杀前保存的2步折序在重启后可完整打开 |

本次C盘Visual Studio安装残留已获用户明确授权，备份并核对SHA256后清理；`migration/c-drive-admin-cleanup.json` 四项成功，D盘备份保留。后续使用D盘便携MSVC、Windows SDK和Rust工具链。

用户随后要求打包。本工程新增了安装版与单文件便携版流程，遵循[打包规范的Tauri补充](docs/打包与体积控制要求.md)；构建、源码双归档、调试材料、实包验收和finalize分别设门禁，原Electron命令不能直接使用。

发行版本取 `package.json`，候选标识取 `desktop-tauri/release.json`；`0.13.36-tauri.5` 是早期迁移候选。所有实现冻结后依次使用 `package:tauri:debug`、`package:tauri:source`、`package:tauri:stage`、`package:tauri:shells`；完成实包验证后才运行 `package:tauri:finalize`。不得覆盖内容不同的同名交付文件。

本地成品目录为 `release/Tauri-0.13.36-tauri.5/`，以其中版本化SHA清单与RELEASE记录为准；未上传任何发行网站。使用前提、数据位置与此次边界见[迁移版发布说明](docs/发布-Tauri-0.13.36-tauri.5-20261026.md)。

按用户最新要求，自候选5起应用不再内嵌对应源码。完整源码ZIP／7z继续与应用同版本、同发行位置提供；`resources/legal`保留许可和带附件名称／SHA256的获取说明。stage、双EXE解包核验和finalize均检查此边界，后续打包不得恢复源码归档、开发目录或独立调试材料到应用内。宿主、前端和完整离线引擎不因分离源码而删减。
