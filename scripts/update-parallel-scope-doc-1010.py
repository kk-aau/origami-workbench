from pathlib import Path
p=Path('docs/Origamica当前剩余范围-20261009.md');s=p.read_text(encoding='utf8')
old='辅助线生成/编辑持续配方仍待补，复杂来源仍需唯一证明。'
assert s.count(old)==1
s=s.replace(old,'辅助线生成/修改/删除持续配方及空材料 FOLD 重开本批已验收；任意旧绘图工具修改仍不会自动转换为材料参数配方，复杂来源继续要求唯一证明。')
old='完整操作栈继续补辅助线生成/编辑等持续配方。'
assert s.count(old)==1
s=s.replace(old,'辅助线生成/编辑/删除、稳定曲线及贝塞尔节点来源最新验收见 `P42-并行构造与持续来源验收-20261010.md`。')
p.write_text(s,encoding='utf8')
