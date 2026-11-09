async page=>{
await page.evaluate(()=>window.confirm=()=>true);await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
await page.getByRole('button',{name:/^\d+ 空间构造$/}).click();if(await page.locator('.tess-source-tools').getAttribute('open')===null)await page.locator('.tess-source-tools>summary').click();
await page.getByLabel('原式工具与参考示例',{exact:true}).selectOption('curved-linked-first-band');
await page.getByLabel('关联同心圆构造范围',{exact:true}).selectOption('common-parameter');await page.getByLabel('关联同心圆构造范围',{exact:true}).selectOption('generic-common-parameter');

const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},dialog=page.getByRole('dialog',{name:'第 45 节 · 通用原生曲线关联多带',exact:true}),
 ready=()=>page.waitForFunction(()=>document.querySelector('.generic-linked-dialog .huffman-status')?.classList.contains('ready')),
 invalid=()=>page.waitForFunction(()=>document.querySelector('.generic-linked-dialog .huffman-status')?.classList.contains('error')),
 responseFor=n=>page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-linked-first-band')&&r.request().postDataJSON()?.curve2DSystemsMode==='independent-external'&&r.request().postDataJSON()?.curve2DSystems?.length===n);
const capture=async(actual,name)=>{const pending=page.waitForEvent('download');await page.evaluate(r=>{const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)])),a=document.createElement('a');a.href=url;a.download='public-response.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},actual);await(await pending).saveAs(`output/original-independent-browser-1010/browser-${name}-response.json`);};
const download=async(label,path)=>{const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:label,exact:true}).click();await(await pending).saveAs(path);};
await page.setViewportSize({width:1360,height:860});await ready();
if(await dialog.locator('.generic-cache').getAttribute('open')===null)await dialog.locator('.generic-cache summary').click();
check(await dialog.getByLabel('通用外部系统规则模式',{exact:true}).inputValue()==='verified-same-source','默认保留已验证同源系统合同');
for(const count of [1,2,3]){
 const pending=responseFor(count);await dialog.getByLabel('载入通用关联曲线参数文件',{exact:true}).setInputFiles(`output/original-independent-browser-1010/raw-prefix-${count}-input.json`);
 const response=await pending,actual=await response.json();await ready();await capture(actual,`raw-prefix-${count}`);
 check(response.ok()&&actual.curve2DSystems.replacementIndices.length===count,`前${count}項独立原规则真正从公共API替换`);
 check(actual.curve2DSystems.evaluations.every(n=>n>0),`前${count}項规则实际求值而非内部cache`);
 check(actual.curve2DSystems.next2DThirdSystemUsed===false,`前${count}項保持原Next2D第三系统未使用`);
 check(actual.independentRules.initialState[3]===2&&actual.independentRules.initialState[7]===3,`前${count}項原未归一化初标架完整保存`);
 check(actual.independentRules.ruleDomains.every(d=>d[0]===-2&&d[1]===3),`前${count}項不同声明域保留且未改成源域`);
 check(actual.query.curve2DSystems[0].rules[0].key==='TangentVector2D',`前${count}項原输入规则序未重排`);
 check(!actual.certification.finiteNumericalMetricVerified&&!actual.certification.adoptableCreasePattern,`前${count}項非等距结果明确未证CP`);
 check((await dialog.locator('.huffman-status').innerText()).includes('等距未证'),`前${count}項界面不冒称等距`);
 check(await dialog.locator('.huffman-panels svg').count()===2,`前${count}項真实二维与三维图形`);
 const images=await dialog.locator('.huffman-panels').innerHTML(),systemFile=`output/original-independent-browser-1010/browser-raw-prefix-${count}-systems.json`,sourceFile=`output/original-independent-browser-1010/browser-raw-prefix-${count}-source.json`;
 await download('导出系统',systemFile);await download('保存参数',sourceFile);
 const importing=responseFor(count);await dialog.getByLabel('载入通用外部曲线系统文件',{exact:true}).setInputFiles(systemFile);await importing;await ready();
 check(await dialog.locator('.huffman-panels').innerHTML()===images,`前${count}項真实下载系统再导入恢复原构形`);
 const loading=responseFor(count);await dialog.getByLabel('载入通用关联曲线参数文件',{exact:true}).setInputFiles(sourceFile);await loading;await ready();
 check(await dialog.locator('.huffman-panels').innerHTML()===images,`前${count}項真实保存参数再载入保持全部原值`);
}
let before=await dialog.locator('.huffman-panels').innerHTML();await dialog.getByLabel('载入通用外部曲线系统文件',{exact:true}).setInputFiles('output/original-independent-browser-1010/forged-raw-system-file.json');
check((await dialog.getByRole('alert').innerText()).length>0,'伪造已验证来源的独立规则文件明确拒绝');
check(await dialog.locator('.huffman-panels').innerHTML()===before,'来源拒绝不改当前合法独立构形');
await dialog.getByLabel('通用外部系统规则模式',{exact:true}).selectOption('verified-same-source');await invalid();
check(await dialog.locator('.huffman-panels svg').count()===0,'独立描述不能在默认同源模式冒充来源证明');
const pending=responseFor(3);await dialog.getByRole('button',{name:'复制当前规则为独立输入',exact:true}).click();await pending;await ready();
check(await dialog.getByLabel('通用外部系统规则模式',{exact:true}).inputValue()==='independent-external','明确复制操作恢复独立模式，不静默改描述身份');
const poleResponse=responseFor(2);await dialog.getByLabel('载入通用外部曲线系统文件',{exact:true}).setInputFiles('output/original-independent-browser-1010/pole-raw-system-file.json');const pole=await poleResponse;await invalid();
check(pole.status()===422&&(await pole.json()).error.includes('cache-domain'),'数值样点难以发现的隐藏极点被完整声明域检查拒绝');
check(await dialog.locator('.huffman-panels svg').count()===0,'极点拒绝后立即撤回未证旧图形');
const example=responseFor(3);await dialog.getByRole('button',{name:'载入独立未归一化规则示例',exact:true}).click();await example;await ready();
check((await dialog.getByLabel('通用外部系统规则JSON',{exact:true}).inputValue()).includes('"2"'),'原值规则示例可以直接编辑与实际构造');
await page.screenshot({path:'output/original-independent-browser-1010/browser-desktop.png',fullPage:true});
await page.setViewportSize({width:640,height:960});await dialog.getByRole('button',{name:'导出系统',exact:true}).scrollIntoViewIfNeeded();
const box=await dialog.getByRole('button',{name:'导出系统',exact:true}).boundingBox();check(box&&box.x>=0&&box.x+box.width<=640&&box.y>=0&&box.y+box.height<=960,'窄窗口独立系统导出控件可操作');
await page.screenshot({path:'output/original-independent-browser-1010/browser-mobile.png',fullPage:true});
await dialog.getByRole('button',{name:'恢复起始函数',exact:true}).click();await ready();
check(await dialog.getByLabel('通用外部系统规则模式',{exact:true}).inputValue()==='verified-same-source','恢复起始函数保留默认同源规则模式');
const preparing=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/curved-curve2d-systems-native'));
await dialog.getByRole('button',{name:'预计算原曲线系统',exact:true}).click();const prepared=await(await preparing).json();await ready();
check(prepared.proof.sourceIdentitiesVerified===true,'旧同源公开预计算仍返回原来源恒等证明');await capture(prepared,'verified-precomputed');
await download('导出系统','output/original-independent-browser-1010/browser-verified-systems.json');
await dialog.getByLabel('载入通用外部曲线系统文件',{exact:true}).setInputFiles('output/original-independent-browser-1010/raw-systems-file.json');
check((await dialog.getByRole('alert').innerText()).length>0,'默认模式拒绝独立文件身份且不降级来源验证');
check(errors.length===0,'零页面运行异常');return {passed:checks.length,checks,errors};
}
