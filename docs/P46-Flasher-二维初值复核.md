# 第 46 节：平面 Flasher 的二维初值

原版 `Origamica 15.0.nb` 的 `MakeFlasher[r,h,m,dr]`（In[4193]）返回三维折后图与折痕图组成的 `TGraph3DAssigned`。它先用 `FlasherDefaultScalarRules` 取 CP 和 FF 初值，再联立 `FlasherCPRotationFns`、`FlasherIsometryFns`、`FlasherXYFns` 和 `FlasherOuterRingFns`，用 `FindRoot` 求解；最后给三维图重新赋型。因此，仅画出对称环线并不是这个函数的 CP，更不是 FF。平面 Flasher 也不同于同节后面的抛物面“部署形”（DP），后者通过 sag 函数额外引入第三维。

独立 `backend/tessellation_flasher.py` 复现求解前明确可核的二维初值：In[4099] 的 `FlasherDefaultCPRules`，In[4097]/In[4098] 的跨扇区 `i=-1` 顶点别名，In[4116] 的 major/minor 区域四边形顺序，In[4118] 的四边形极限处原生三角面，以及 In[4124]/In[4126] 的 Y/Z 轻折对角线。输出类型是 `flasher-ideal-cp-seed`，明确标记 `solvedCreasePattern=False`、`mountainValleyAssigned=False`、`foldedForm=False`、`deployedPattern=False`、`isometryVerified=False`。其中三角面只描述初值面板的拓扑，不能作为已求解折痕工程采用。

原版保存的 In[4194] 使用 `r=2,h=2,m=4,dr=.05` 和默认 Y 对角线，In[4195] 使用 `r=2,h=2,m=5,dr=.1` 和 Z 对角线。`dr` 参与 FF 目标与最终 `FindRoot`，不参与二维 CP 初值公式。按上述源函数可推导参考初值分别有 40／50 个四边形、96／120 个三角面（包括每扇区 4 个原生三角面）、60／75 个不同 `{i,j,k}` 顶点；这些是本实现按源码计算的计数，**不是**笔记本保存的 `MakeFlasher` 数值输出。数值专项还校验 m=4 中心点 `p[0,0,0]=(-0.5,0.5)`，任意 m 的中心多边形内切圆半径为 0.5，以及 Y/Z 的不同对角线端点。

CP/FF 联立数值求解、等距检验及山谷赋型现由独立 `backend/tessellation_flasher_solver.py` 处理，详见 `P46-Flasher-CP-FF-求解与赋型.md`。二维初值本身仍不等于该求解结果。
