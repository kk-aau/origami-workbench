from pathlib import Path
import hashlib
import json
import shutil
root=Path.cwd()
old='output/original-flasher-all-labels-browser-1010'
out='output/original-flasher-all-labels-browser-final-1010'
(root/out).mkdir(exist_ok=True)
text=(root/'scripts/verify-original-flasher-all-labels-1010.browser.js').read_text(encoding='utf8').replace(old,out)
text=text.replace('checks=[],errors=[],downloads=[]','checks=[],errors=[],passiveErrors=[],downloads=[]')
text=text.replace("page.on('pageerror',e=>errors.push(e.message));", "page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/passive event listener/i.test(m.text()))passiveErrors.push(m.text());});")
text=text.replace("await svg.hover();await page.mouse.wheel(0,-300);", "await svg.hover();await page.evaluate(()=>document.addEventListener('wheel',e=>{window.__flasherWheelPrevented=e.defaultPrevented;},{once:true}));await page.mouse.wheel(0,-300);")
needle=" check(Number(await svg.getAttribute('data-view-zoom'))>1.3,'wheel actually zooms label view');"
assert needle in text
text=text.replace(needle,needle+"\n check(await page.evaluate(()=>window.__flasherWheelPrevented===true),'actual native wheel event prevents browser scrolling');")
needle="check(await d.getByTestId('flasher-original-all-label').count()===30,'current workbench binding resets without previous helper edits');"
assert needle in text
text=text.replace(needle,needle+"await svg.hover();await page.mouse.wheel(0,-120);await page.waitForTimeout(150);check(Number(await svg.getAttribute('data-view-zoom'))>1,'wheel handler rebinds after invalid import clears and restores SVG');")
text=text.replace("check(!errors.length,'full label and saved/import flow has zero page errors');", "check(!errors.length,'full label and saved/import flow has zero page errors');check(!passiveErrors.length,'native wheel has no passive-listener console errors');")
text=text.replace('checks,errors,downloads,layout','checks,errors,passiveErrors,downloads,layout')
(root/'scripts/verify-original-flasher-all-labels-final-1010.browser.js').write_text(text,encoding='utf8')
text=(root/'scripts/verify-original-flasher-all-labels-download-1010.ts').read_text(encoding='utf8').replace(old,out).replace('ui.passed,31','ui.passed,34')
text=text.replace('assert.deepEqual(ui.errors,[]);','assert.deepEqual(ui.errors,[]);assert.deepEqual(ui.passiveErrors,[]);')
(root/'scripts/verify-original-flasher-all-labels-final-download-1010.ts').write_text(text,encoding='utf8')
for name in ['custom-3d-parameters.json','invalid-parameters.json']:shutil.copy2(root/old/name,root/out/name)
delivery=root/'output/parallel/original-source-helper-1010/delivery/files/src/components/FlasherAllLabelsView.tsx'
target=root/'src/components/FlasherAllLabelsView.tsx'
report={'verified':True,'files':[{'file':'src/components/FlasherAllLabelsView.tsx','before':hashlib.sha256(delivery.read_bytes()).hexdigest(),'after':hashlib.sha256(target.read_bytes()).hexdigest()}],'change':'native passive:false wheel listener; rebind when invalid import replaces SVG','originalLabelDataUnchanged':True}
(root/'output/parallel/original-flasher-wheel-integrated-1010.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared actual native-wheel cancellation, remount and console regression checks; first evidence preserved, no results copied.')
