# 第46节六角 Flasher 保存例 In[4197] 数值入口

原笔记本 `tmp/Origamica-15.0-reference.nb` 约 350199–350271 行将 `HexFlasherGraph3DAssigned` 标作六角 Flasher。In[4197] 在 `AddTGraphExample` 中调用 `MakeFlasher[r,h,m,dr,FlasherSectorDiagFoldLines→FlasherSectorDiagFoldLinesZ,TypeMinimumAngle→10°]`，局部变量固定 `r=2,h=2,m=6,dr=.05`；In[4199] 只展示该对象。笔记本没有在这两处保存可提取的逐点数值 FOLD。

工作区原已有通用 `MakeFlasher` 参数求解，现于 Flasher 控件增加“六角保存例 · In[4197]”一键入口，并通过同一严格参数读取器送入真实生成路由。它不是新的几何公式，也不是把 In[4199] 的绘图当作已知数值结果。

固定输入生成 **90 点、234 边、145 面**，二维几何门禁 `passed`，同索引三维面逐面距离与共面误差均小于 `1e-10`。结果属于可采用的**静态空间等距候选**；局部平折判据 `not_applicable`，全局层序 `not_checked`。没有认证完整平折层序、连续折叠运动、自碰撞或原版逐点 Out。屏幕按钮、六项工程参数读回、采用后工程恢复由真实浏览器 1000×720 与 390×720 验证。

证据：`backend/test_tessellation_flasher_candidate.py` 的 `test_in4197_hexagonal_saved_input_is_static_isometric_candidate`、`tests/app/flasherParams.test.ts` 的保存参数测试，以及 `output/playwright/p46-flasher-hex-saved-browser-report-{1000,390}.json`。
