# tauri-runtime-wry 本地修复

- 上游：Tauri 锁定的 crates.io `tauri-runtime-wry 2.12.3`，未升级版本。保留原 MIT 与 Apache-2.0 双许可证、Cargo 包信息及完整源码。
- 上游缓存源码保持不变；本地副本通过 `src-tauri/Cargo.toml` 的 `[patch.crates-io]` 使用。
- 原始 `src/lib.rs` SHA256：`ec343fc347aff1fb5327100df2541992e47eb6be1ddb55102170e2253b9c6d59`。原始完整逐文件清单与精确补丁记录在本轮工作证据 `output/multiwindow-implementation-20261112/runtime-wry-patch/`；该证据不是发行时必须存在的外部构建依赖。

## 修复范围

WebView2 的原生焦点回调会读取 dispatcher 的 `window_id`，而上游 `reparent()` 在等待 UI 回执时持有同一互斥锁，真实已聚焦作品移窗可因此死锁。本地改动使等待期间不持该锁，在 UI 完成移动后、发出成功回执前短暂锁定并发布新父窗口。

另一个线程可能在提交前捕获旧父窗口路由、在移动后才投递消息。普通 WebView 消息先按指定父窗口查找，仅查无同一 WebView 时，按整个 Runtime 唯一的 WebView ID 定位当前父窗口，使排队的 getter/eval 仍送达原视图。没有替换 WebView、复制工程状态或改变 IPC 的来源校验。应用层 `document_gate` 继续串行同一作品的创建、布局、移动与销毁。

该修复不承诺上游高层 `tauri::Webview::reparent` 错误时完整回滚原生父窗口；应用错误提示保留“窗口状态未确认”的边界，验收覆盖受控存活源/目标窗口的成功迁移。

原生调用前仅克隆源视图和目标窗口，不持有 `WindowsStore` 的 `RefCell` 借用。仅成功后短暂修改父窗口列表；失败时源列表仍保留原视图，dispatcher 路由仍为源窗口，缺失目标也返回错误回执。应用包装器在失败后尝试恢复高层父窗口句柄与原可见状态，仍不把未验证的原生错误分支宣称为无损回滚。
