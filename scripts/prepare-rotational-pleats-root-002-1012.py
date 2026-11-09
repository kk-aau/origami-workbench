from pathlib import Path

root=Path.cwd().resolve()
source=(root/'scripts/prepare-rotational-pleats-root-1012.py').read_text(encoding='utf8')
source=source.replace("out=root/'output/parallel/rotational-pleats-root-stage-1012'", "out=root/'output/parallel/rotational-pleats-root-stage-002-1012'")
source=source.replace("dialog('basic-paper-models-cp','单纸基础模型 CP')", "dialog('basic-paper-models-cp','五种原单纸基础模型 CP')")
exec(compile(source,str(root/'scripts/prepare-rotational-pleats-root-002-1012.py'),'exec'))
