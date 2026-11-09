# 基础形设计引擎来源

- 上游：https://github.com/zacharyfmarion/ori-studio
- 固定提交：`9d8604eeea18937aa1899877d1421149bc084b49`
- 引入时间：2026-11-04。
- 范围：`crates/treemaker-core`、`crates/treemaker-fold`、`crates/oristudio-bp` 的源码、包声明、说明和许可；不引入上游应用界面、训练模型、远程搜索或参考图片。
- 同时保留以上 crate 原始测试、示例和引用的 `tests/fixtures/bp-studio/` 测试夹具。这些属于源码开发材料，不作为应用运行资源复制。
- `treemaker-core` 是 Robert J. Lang TreeMaker 5.0.1 模型引擎的 Rust 移植，GPL-2.0-or-later；`treemaker-fold` 为 MIT OR Apache-2.0；`oristudio-bp` 是 Mu-Tsun Tsai Box Pleating Studio 的 MIT 移植。完整原文保留于同目录及各 crate 的 LICENSE 文件，原始版权声明见 NOTICE。
- 源码引擎不修改。根 Cargo.toml 是本机集成的最小工作区适配清单；上游原清单保留为 Cargo.upstream.toml。实际使用版本由 src-tauri/Cargo.lock 锁定。
- 工作台自行编写中文工作区、存储、交换和 Rust 命令适配，不复制上游 React 主应用。本地 CPU 原生执行，复用本应用宿主作为可停止的独立设计计算进程。
- 上游 LICENSING.md 涉及未引入的工具与服务，仅作原始来源记录，不表示本软件分发其中全部组件。
