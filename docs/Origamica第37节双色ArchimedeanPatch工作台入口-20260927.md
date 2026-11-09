# 第 37 节二色 ArchimedeanPatch 工作台入口

`TwoColorableArchimedeanPatch` 的原版显式来源只有 n=1、2、8、9。工作台以单独的具名记录 `twoColorableArchimedeanPatch` 保存来源编号、逐来源片 `parity` 与预设，不将它当作普通 `ArchimedeanPatch` 的通用配色开关。n=1、8、9 逐点复用普通来源几何，parity 分别为 `(+,-)`、`(+,-,+,-,+,-)`、`(+,-,+)`；n=2 用两个单位正方形，parity 为 `(+,-)`、格矢为 `(2,0)` 与 `(1,1)`。普通 n=2 只有一个正方形和单位格矢，不能替代。后端权威目录见 `backend/tessellation_archimedean_patch_catalog.py`。

| 工作台选项 | 来源／参数 | 已验证输出 |
| --- | --- | --- |
| 2×2 二色母结构 | n=1、2、8、9；`range1=range2=[0,1]` | 母图 V/E/F 依次为 9/16/8、16/23/8、37/60/24、21/32/12；几何通过 |
| In[3183] 偏置公式推演 | n=8 单补片；`w=.05`、`d=±.03`、逐片全 M；无原版数值 CP Out | CP 54/88/35；本项目平折几何 ready、原面统一层序精确 1 解；选择后实时核验再采用 |
| In[3184] 单 patch 偏置 | n=2；`w=.2`、`d=±.1`、M4/M4；无格点复制 | CP 24/38/15；当前工作区平折几何 ready、层序 solved，1 个解 |
| In[3187] Alt 裁剪 | n=2；`w=.2`、`α=30°`、M4/V4；`[-2,2]×[0,3]` 后裁 `[.1,3.9]²` | 原 40 面、裁后 16 面；CP 100/180/81；当前工作区平折几何 ready、层序 solved，1 个解 |
| In[3188] 偏置裁剪 | n=2；`w=.2`、`d=±.1001`、M4/M4；同上格点和裁剪 | 原 40 面、裁后 16 面；CP 100/180/81；当前工作区平折几何 ready、层序 solved，1 个解 |

`src/app/twoColorableArchimedeanPatchSource.ts` 固定四个来源的 parity、n=2 独立几何、三个保存折痕预设以及 n=8 的受限公式推演。偏置按照每片 parity 生成符号，Alt 保存例保留逐片 M/V 与扭角。`readTwoColorableArchimedeanSpec` 拒绝未知编号、改写 parity、额外字段和超过 192 面的范围；`twoColorableArchimedeanSourceMatches` 将具名记录与实际顶点、面、格矢、范围、裁剪边界、输出模式、逐片参数及整体并边选项逐项核对。普通与二色具名记录互斥。自定义网格一旦改变几何或裁剪，过期的来源记录就会清除；仅打开并保存相同网格时保留。请求仍用现有 `family:'custom'`，发往后端前剥离仅供工作台识别的二色来源记录。

四个母结构中的默认 2×2 范围来自笔记本保存调用；改动范围后采用原版格矢规则展开，不能再称为该 2×2 保存例。n=8 的 In[3183] 是对原版通式的本地固定输入推演，原版没有这张 CP 的数值 Out；n=1/9 的同类输入整片层序无解，界面保持只读禁采用。三个 n=2 折痕预设是具体保存输入的工作区实现。上述层序结果来自本项目求解器和固定输入，并不是笔记本可机比的数值 `Out`，也不证明刚性运动路径或厚纸可制造性。

验证：`tests/app/twoColorableArchimedeanPatchSource.test.ts` 覆盖四项母结构的 parity/JSON 回读、n=2 与普通 n=2 的区别、三个预设完整回读及伪造拒绝。前端生成并剥离来源元数据后的七个请求实际经本地 `tessellate.generate`，七次几何检查均通过，母图和 CP 计数见上表。独立的 `scripts/verify-two-colorable-archimedean-patch2-offset-in3184.ts`、`scripts/verify-two-colorable-archimedean-pruned-in3187-3188.ts` 均通过折痕与层序专项检查；后端目录的四项来源及预设另见 `backend/test_tessellation_two_colorable_archimedean_catalog.py`。
