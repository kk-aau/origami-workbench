from pathlib import Path
p=Path('scripts/verify-mother-source-guard-1010.browser.js');s=p.read_text(encoding='utf8')
s=s.replace("{name:'编辑编织母图',exact:true}","{name:'有限母图 · 原CP与原FF',exact:true}")
s=s.replace("await d.getByRole('button',{name:'取消',exact:true}).click()", "await d.getByRole('button',{name:'关闭镶嵌窗口',exact:true}).click()")
p.write_text(s,encoding='utf8')
