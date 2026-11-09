# Gitee 首次上传

仓库根目录使用 `D:\codex\折纸工具\workbench`。外层目录还有其他工程、导出资料和临时文件，不作为本项目仓库根目录。

## 创建空仓库

| 页面字段 | 填写内容 |
|---|---|
| 仓库名称 | 折纸工作台 |
| 路径 | `origami-workbench` |
| 仓库介绍 | 本地优先的中文折纸设计工作台，支持 CP 折痕编辑、参数化镶嵌、平折分析、三维预览和折序绘图，提供 Windows 桌面版。 |
| 可见性 | 准备公开源码则选择开源；暂时自用则选择私有 |
| 初始化仓库 | 不勾选，本地已有 README、忽略规则和许可证 |
| 设置模板 | 首次上传不勾选 |
| 选择分支模型 | 首次上传不勾选，本地以 `main` 为主分支 |

保留现有 `LICENSE`、`THIRD_PARTY_NOTICES.md` 和依赖的来源说明。`package.json` 已声明 `GPL-3.0-only`，不要由创建向导另行生成不同许可证。

## 本地内容

| 纳入源码仓库 | 本机保留、不入库 |
|---|---|
| `src/`、`desktop/`、`backend/`、`scripts/` | `node_modules/`、`.venv/` |
| `public/`、`simulator/`、`vendor/` | `dist/`、`build/`、`release/` |
| `tests/`、`docs/` 与构建配置 | `data/`、`折纸工坊数据/` |
| README、许可证、依赖锁文件 | `output/`、临时文件、日志、本机照片处理资料及私密配置 |

`vendor/` 和 `public/` 含运行及构建需要的代码和离线资源，应保留。`tests/fixtures/` 含真实回归测试资料，不能按运行数据排除。已在 `.gitignore` 补充本机目录及私密配置的忽略规则。

## 首次提交与推送

项目仓库为 `https://gitee.com/kk-Origami/origami-workbench`。以下为全新本地仓库的首次上传命令，在 PowerShell 中运行；已有本地仓库不重复初始化或添加 `origin`：

```powershell
Set-Location -LiteralPath 'D:\codex\折纸工具\workbench'
git init -b main
git status --short
git add .
git diff --cached --stat
git status --short
git commit -m "Initial import"
git remote add origin 'https://gitee.com/kk-Origami/origami-workbench.git'
git push -u origin main
```

提交前确认暂存内容不含用户工程、恢复副本、日志、凭据、安装包或其他个人资料。Git 身份未配置时，按提示设置自己的提交姓名和邮箱，不代填他人身份。登录信息通过 Git 凭据提示输入，不写入源码、README 或远程 URL。

### 启用了双因素认证的账号

Gitee 开启双因素认证后，HTTPS 推拉代码须使用私人令牌代替登录密码。在网页的“头像 → 设置 → 私人令牌”生成用于仓库推送的令牌，再在本机 Git 登录窗口的 Password 栏填写令牌。令牌不提交到仓库，也不写入远程地址。参见 [Gitee 双因素认证说明](https://help.gitee.com/account/two-factor-authentication)。

后续修改完成后，先检查差异，再提交并执行 `git push`；本机数据和构建产物继续按 `.gitignore` 排除。
