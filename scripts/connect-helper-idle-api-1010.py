from pathlib import Path
for file in ['src/app/goreData.ts','src/app/vertexFigure.ts']:
 p=Path(file);s=p.read_text(encoding='utf8');old="import {api} from './api';";assert s.count(old)==1
 s=s.replace(old,"import {apiWhenIdle} from './api';")
 assert s.count('await api(')==1,(file,s.count('await api('))
 p.write_text(s.replace('await api(','await apiWhenIdle('),encoding='utf8')
