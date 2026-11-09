from pathlib import Path
import json,hashlib
root=Path.cwd().resolve();base=root/'output/playwright/nested-mother-main-1011';out=base/'downloads-003';assert not out.exists();out.mkdir()
bundle=json.loads((root/'output/practical-construction-bundle-1011.json').read_text(encoding='utf8'))['bundle']
text=(base/'downloads-002/verify-main.browser.js').read_text(encoding='utf8')
text=text.replace("out='D:/codex/折纸工具/workbench/output/playwright/nested-mother-main-1011/downloads-002'", "out='D:/codex/折纸工具/workbench/output/playwright/nested-mother-main-1011/downloads-003'").replace('/assets/main-BDbQ7c0F.js',bundle)
text=text.replace('const checks=[],files=[],errors=[],layouts=[],receipts=[];', 'const checks=[],files=[],errors=[],layouts=[],receipts=[],apiCalls=[],apiPending=[];\n const apiResponse=r=>{if(r.url()!==origin+\'/api/tessellate\'||r.request().method()!==\'POST\')return;apiPending.push((async()=>{apiCalls.push({status:r.status(),request:r.request().postDataJSON(),response:await r.json(),actualUserExport:false,actualHTTP:true});})());};page.on(\'response\',apiResponse);')
old="check(await dialog().locator('svg').count()===1,'更改行数保母图');"
new=old+"await dialog().getByRole('spinbutton',{name:'行数',exact:true}).fill('6');await ready();const coverage=await dialog().locator('svg').evaluate(svg=>{const v=svg.viewBox.baseVal;return [...svg.querySelectorAll('.woven-inspect-edge')].every(l=>[1,2].every(i=>{const x=Number(l.getAttribute('x'+i)),y=Number(l.getAttribute('y'+i));return x>=v.x&&x<=v.x+v.width&&y>=v.y&&y<=v.y+v.height;}));});check(coverage,'源图增大自动适合全部，坐标不裁切');await dialog().getByRole('spinbutton',{name:'行数',exact:true}).fill('4');await ready();"
assert old in text;text=text.replace(old,new)
text=text.replace("check(errors.length===0,'实际主界面无未处理异常');await capture({verified:true,", "await Promise.all(apiPending);check(errors.length===0,'实际主界面无未处理异常');await capture({verified:true,apiCalls,")
text=text.replace("errors.push(cause.message);await screenshot", "errors.push(cause.message);await Promise.allSettled(apiPending);await screenshot")
text=text.replace('await capture({verified:false,checks:', 'await capture({verified:false,apiCalls,checks:')
text=text.replace("page.off('pageerror',pageError);page.off('dialog',native);", "page.off('pageerror',pageError);page.off('dialog',native);page.off('response',apiResponse);")
(out/'verify-main.browser.js').write_text(text,encoding='utf8',newline='\n')
config=json.loads((base/'config.json').read_text(encoding='utf8'));config['outputDir']=(base/'cli-003').as_posix();(out/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
(out/'before.json').write_text(json.dumps({'verified':True,'bundle':bundle,'checkRecord':'output/practical-construction-checks-1011.json','previousFailuresPreserved':['../browser-checks.json','../downloads-002/browser-checks.json'],'scriptSHA256':hashlib.sha256((out/'verify-main.browser.js').read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'bundle':bundle,'out':out.as_posix()},ensure_ascii=False))
