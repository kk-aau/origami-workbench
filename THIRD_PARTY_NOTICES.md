# Third-party notices / 第三方软件声明

## 独立 Tauri 版追加（2026-10-26）

本目录的 Tauri 发行版不分发 Electron 或 Node 运行时；下文 Electron 段落保留为原版历史说明。新宿主使用锁定的 Tauri、Wry、Tao、Axum、Tokio 等 Rust 依赖，复用系统 Microsoft Edge WebView2 Runtime。完整 Rust crate 源码、原始许可及包元数据随对应源码交付，实际清单见生成的 `TAURI-THIRD-PARTY-NOTICES.txt` 和 `licenses/RUST-PACKAGES.json`。NSIS 与所用插件仅用于安装/解压外壳，其许可和来源也随包保留；不改变各上游许可。

## 折序矢量 PDF 导出追加（2026-10-28）

本机 Rust 服务使用 svg2pdf 0.13.0（MIT OR Apache-2.0，https://github.com/typst/svg2pdf）将整页 SVG 转为矢量 PDF；roxmltree 0.20.0（MIT OR Apache-2.0）用于校验自包含页面。usvg/resvg、fontdb、subsetter 及其传递依赖按 `src-tauri/Cargo.lock` 锁定，并纳入现有 Rust 许可与对应源码收集流程。转换保留路径、裁剪、蒙版与文字，仅原有图片及 SVG 滤镜内容按需要保留像素。字体从本机读取，导出文件嵌入用到的字体子集；应用不分发或在线下载字体文件。

## 折序 PDF 导出基础组件（2026-10-13；2026-10-28 更新用途）

pdf-lib 1.17.1（MIT，Copyright (c) 2019 Andrew Dillon）用于浏览器离线合并矢量 PDF 页面及写入文档元数据。未修改的官方 UMD 分发文件、来源说明和完整 MIT 许可证位于 `public/vendor/pdf-lib/`，构建后随应用 `dist/vendor/pdf-lib/` 保留，并收入对应源码 ZIP。来源：https://github.com/Hopding/pdf-lib 。

## 设置包读取追加（2026-09-19）

fflate 0.8.3（MIT，Copyright (c) 2026 Arjun Barrett）用于 ORICONFIG 内存 ZIP 读取。固定版本见 package-lock.json，完整许可位于 node_modules/fflate/LICENSE；源码与文档：https://github.com/101arrowz/fflate 。发布构建的许可证收集脚本已纳入该包，本次未制作发布包。

## 桌面打包追加（2026-09-18）

Electron 44.4.2（MIT，含 Chromium/Node 及其第三方声明）和 electron-builder 26.15.3 用于独立 Windows 窗口及 NSIS/portable 构建。Electron 自带 LICENSE 与 LICENSES.chromium.html 随运行目录保留。PyInstaller 6.22.0 用于封装 Python 镶嵌引擎，构建工具版本见 requirements-build.txt；不要求终端用户安装 Python。

本目录当前 Tauri 版的运行依赖及已捆绑前端依赖许可/元数据随 `resources/legal/licenses` 提供；Rabbit Ear、项目及完整重建源码作为同版本 Source.zip / Source.7z 附件，在应用相同的发行位置以等价方式提供。应用内的 `resources/legal/SOURCE-AVAILABILITY.json` 与 `.txt` 列出附件名称和真实 SHA256，使用应用无需下载源码。完整流程见 `docs/打包与体积控制要求.md`。旧 Electron 交付布局只作历史记录，不用于当前 Tauri 包。桌面打包不改变本项目或第三方既有许可。

核查日期：2026-09-17。以下依据实际 vendored 文件、已安装包的许可证／元数据与锁文件；不是把所有组件重新许可为同一种许可证。

工作台整体按 GNU General Public License version 3 组织，完整文本在 `LICENSE`。Rabbit Ear 0.9.4 明确标记 GPLv3，本交付不替上游添加“or later”授权。分发组合程序时须保留声明并按适用许可提供对应源码与构建材料；不能只复制 `dist` 而丢弃必要许可及源码交付。GPL 原文：[GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.html)。

## 核心计算来源

| 组件 | 固定版本 | 原许可和版权 | 本地依据 |
|---|---|---|---|
| Rabbit Ear | npm 0.9.4 | GNU GPLv3；模块头 `(c) Kraft`，包作者 Maya Kraft | `node_modules/rabbit-ear/license`、`package.json`、`module/index.js`；GPL 全文另保留于根 `LICENSE` |
| Pleat | `6a7015834b3357290a1678abf35b613987b07c44` | MIT；Copyright (c) 2026 Roman Remme | `vendor/pleat/LICENSE`、`UPSTREAM.md` |
| Ori Studio 的独立 `origami-simulator` 包 | `9fe341cd9bff1d6a9ba58eb04d806b7489012148` | MIT；Copyright (c) 2018 Amanda Ghassaei；Copyright (c) 2026 Zachary Marion | `vendor/simulator/oristudio/packages/origami-simulator/LICENSE` 与 `NOTICE` |
| 上项算法来源 Origami Simulator | `7855983a613c879c171b2b1557f8cd102d2640cf` | MIT；Copyright (c) 2018 Amanda Ghassaei | 上项 `NOTICE` 列出原始求解器及 shader 文件 |

来源仓库：[Rabbit Ear](https://github.com/rabbit-ear/rabbit-ear)、[Pleat](https://github.com/imagirom/pleat)、[Ori Studio](https://github.com/zacharyfmarion/ori-studio)、[Origami Simulator](https://github.com/amandaghassaei/OrigamiSimulator)。

变更说明：Pleat 顶层导入改为按需加载，几何算法保持原样；模拟包保留原始源码，工作台适配、验证和中文界面由本项目独立代码提供。引入模拟包不等于引入 Ori Studio 主应用或其全部模块。没有引入 Pleat 的非商用照片、Lang 的 NC 软件／图版或博主素材。

v0.10.0：`backend/tessellation_patterns.py` 的正多边形扭转、规则周期网格和输出排序由工作台独立实现，适用本项目 GPL-3.0-only。周期母结构的缩放旋转继续调用上述固定版本 MIT Pleat；未将 Origamica 的 CC BY-NC 笔记本源码纳入程序或构建。

v0.12.0：`backend/tessellation_split.py` 为独立 Kawasaki 约束优化实现，使用 SciPy SLSQP 与既有局部山谷求解；Resch 星形以独立三角关系构造，拼接和 Shrink-Rotate 使用既有 MIT Pleat。新增应用实现适用 GPL-3.0-only。只读参考用户笔记本的功能说明和数学注释，没有执行或复制笔记本实现；数值等价性及未完成范围见 `docs/原版镶嵌续接-20260920.md`。

v0.11.0：新增 `tessellation_meshes.py`、`tessellation_advanced.py`、`tessellation_flagstone.py` 及交互编辑界面，独立实现部分适用 GPL-3.0-only。部分平铺、Goldberg 与 Shrink-Rotate 继续使用固定版本 MIT Pleat；其空内部顶点检查修复见 `vendor/pleat/UPSTREAM.md`。对偶优化和局部山谷整数求解调用 SciPy，不是 Pleat 的全局层序求解器。Penrose 与铺石的数学参考及功能边界见 `docs/独立镶嵌扩展-20260920.md`；未复制 Origamica 笔记本实现。

## JavaScript 运行依赖

版本以 `package-lock.json` 为准。本次已安装并核查：

| 包 | 版本 | 许可 |
|---|---|---|
| react / react-dom | 19.3.0 / 19.3.0 | MIT |
| scheduler | 0.28.0 | MIT |
| earcut | 3.0.2 | ISC |
| fast-xml-parser | 5.11.1 | MIT |
| @nodable/entities | 3.0.0 | MIT |
| fast-xml-builder | 1.3.1 | MIT |
| is-unsafe | 2.0.2 | MIT |
| path-expression-matcher | 1.6.2 | MIT |
| strnum | 2.4.2 | MIT |
| anynum | 1.0.1 | MIT |
| xml-naming | 0.3.0 | MIT |

上述依赖包括传递依赖，不代表其全部代码都进入最终浏览器 bundle。开发工具 TypeScript、Vite、tsx 及插件的许可保留在各安装包；完整重建清单由锁文件记录。

### MIT 版权声明

下列版权声明与其后完整 MIT 条款对应各相应组件，不改变原作者归属：

- React、React DOM、scheduler：Copyright (c) Meta Platforms, Inc. and affiliates.
- fast-xml-parser：Copyright (c) 2017 Amit Kumar Gupta
- fast-xml-builder、is-unsafe、anynum、xml-naming：Copyright (c) 2026 Natural Intelligence
- strnum：Copyright (c) 2021 Natural Intelligence
- path-expression-matcher：Copyright (c) 2024（本地许可未列出姓名，原样保留）
- @nodable/entities：Copyright (c) 2026 Nodable。npm 包仅带 MIT 元数据而未带许可文件，此声明及条款另外核自它在 package.json 指向的 [val-parsers 仓库 LICENSE](https://github.com/nodable/val-parsers/blob/main/LICENSE)。
- Pleat：Copyright (c) 2026 Roman Remme
- Ori Studio 独立模拟包：Copyright (c) 2018 Amanda Ghassaei；Copyright (c) 2026 Zachary Marion

```text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Earcut 3.0.2

```text
ISC License

Copyright (c) 2024, Mapbox

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

模拟页面另保留 `public/simulator/THIRD_PARTY_NOTICES.txt`，随构建进入本机服务。

## Python 私有环境与二进制边界

本地环境精确版本见 `requirements-lock.txt`。原始版权、许可证和 wheel 内附的第三方声明保留在 `.venv/Lib/site-packages/` 的对应包或 `.dist-info` 目录。不能把 Pleat 的 MIT 当成 NumPy／SciPy／Cairo 等二进制依赖的统一许可。

本次从安装元数据直接核到的较关键声明：

| 包 | 版本 | 安装元数据／原声明 |
|---|---|---|
| fastcluster | 1.3.0 | `BSD-2-clause OR GPL-2.0-or-later`，另见 `COPYING.txt` |
| pycairo | 1.29.1 | `LGPL-2.1-only OR MPL-1.1`；不能按 MIT 处理 |
| tqdm | 4.70.1 | `MPL-2.0 AND MIT`，另见 `LICENCE` |
| packaging | 26.3 | `Apache-2.0 OR BSD-2-Clause` |
| pillow | 12.3.0 | `MIT-CMU`，另见所附第三方库材料 |
| fonttools | 4.65.0 | MIT，另有 `LICENSE.external` |
| PuLP | 3.3.2 | MIT；私有环境包可能另带 solver 二进制，未调用其层序求解器，不据此把 solver 都视为 MIT |
| NumPy / SciPy | 2.3.5 / 1.17.1 | 主包 BSD 类声明；wheel 还含其附带原生计算库的许可，需完整保留 |
| Numba / llvmlite | 0.63.1 / 0.46.0 | 必须连同 `LICENSES.third-party` / `LICENSE.thirdparty` 审计，不能只保留主包标识 |
| Matplotlib | 3.10.9 | 自带 Matplotlib license agreement，元数据列 PSF 类许可 |

其余已安装运行依赖包括 colorama、contourpy、cycler、kiwisolver、mpmath、networkx、pyparsing、python-dateutil、PyYAML、six、svgwrite、sympy；完整版本由锁文件固定。它们的许可文件留在环境内，没有在本声明中猜测未逐字核实的子条款。

此交付是本机源码工作台，**不是已经完成全部二进制再分发审计的安装包**。未来对外制作安装包时，须再次核对所有轮子／原生库／求解器及 Node/Python 运行时的声明、源码／替换义务；不要将整个 `.venv` 原样复制后宣称统一 MIT 或已满足全部发行要求。

## CP Path Optimizer v1（用户提供的 MIT 模块）

来源附件：`CP_Path_Optimizer_v1 (1).zip`，SHA256 `1a6e3436958252c759f59d5a09e2b82790e4784465cc80ccd6c6c22e38e1f213`。版权为 `(c) 2026 CP Path Optimizer contributors`；许可原文保留在 `vendor/cp-path-optimizer/LICENSE.txt`。

`src/core/cpPathOptimizer.ts` 移植其 `makeTrails`、`reversePath`、`rotatePath`、`orderTrails` 中的欧拉分解、路径反转、闭环起点与邻近排序／2-opt 代码，并适配本项目的加工分组、实际重复次数、精确端点及容量限制。未接入附件的吸附和交点数值分割；不改变原 CP。

`vendor/cp-path-optimizer/src/` 原样保留附件 DXF 读写模块及其 R2000 模板：标准连续加工 DXF 复用 `writeDxf`，独立几何回读测试复用 `parseDxf`；新增 `.d.mts` 仅提供 TypeScript 类型声明。R12 LINE 兼容版复用本项目原有普通 DXF 输出结构。参考样例与测试只用于本地验证，不作为机器控制或通用 CAD 导入承诺。优化输出的刻字软件导入及机器试压仍未验证。

## Ori Studio 基础形设计引擎

新增设计工作区使用 [Ori Studio](https://github.com/zacharyfmarion/ori-studio) 的 Rust 计算组件，固定源码提交 `9d8604eeea18937aa1899877d1421149bc084b49`，原始源码及许可位于 `vendor/design/ori-studio/`。本项目新增本机进程适配与中文界面，不分发其网页素材或远程搜索服务。

| 组件 | 原始许可 | 原始许可位置 |
|---|---|---|
| treemaker-core（TreeMaker 移植） | GPL-2.0-or-later | `crates/treemaker-core/LICENSE.txt`；上游根目录 `LICENSE.txt`、`NOTICE`、`LICENSING.md` |
| treemaker-fold（FOLD 导出） | MIT OR Apache-2.0 | `crates/treemaker-fold/LICENSE-MIT`、`LICENSE-APACHE` |
| oristudio-bp（Box Pleating Studio 移植） | MIT | `crates/oristudio-bp/LICENSE` |

对应源码保留原作者、TreeMaker / Box Pleating Studio 归属声明和工作区依赖信息。本应用继续以 GPL-3.0-only 分发；不包含非自由的 CFSQP / RFSQP 求解器。原始许可随应用许可材料交付，完整对应源码随同版本独立源码附件提供。新增的 crates.io 依赖版本和原始许可由 Cargo.lock 及源码打包脚本收集，不将这些第三方组件统一标为 MIT。

