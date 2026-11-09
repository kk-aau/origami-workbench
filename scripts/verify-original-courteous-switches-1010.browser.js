async page=>{
 const bundle=await page.evaluate(()=>Array.from(document.scripts).map(s=>s.getAttribute("src")).find(s=>s?.startsWith("/assets/main-")));const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(v,name)=>{if(!v)throw Error(name);checks.push(name);};await page.evaluate(()=>window.confirm=()=>true);
 const responseFor=predicate=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.status()===200&&predicate(r.request().postDataJSON()));
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const capture=async(name,value)=>{const wait=page.waitForEvent('download');await page.evaluate(({name,value})=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.download=name;a.click();},{name,value});await(await wait).saveAs('output/original-ring-unsafe-courteous-browser-1010/courteous/'+name);};
 const restore=async()=>{await page.getByLabel('随机母线接受规则',{exact:true}).selectOption('original-courteous');const p=responseFor(q=>q.randomVersion==='original-courteous'&&q.count===2&&q.width===.02);await page.getByRole('button',{name:'原随机母线示例',exact:true}).click();await(await p).json();await ready();};
 await restore();
 let pending=responseFor(q=>q.mode==='graph'&&!q.randomVersion);await page.getByLabel('线组方式',{exact:true}).selectOption('graph');const graph=await(await pending).json();await ready();
 check(!Object.hasOwn(graph.stats.parameters,'randomVersion')&&!graph.source.courteousAnarchy,'native random to finite mother graph clears version and origin source');
 check(await page.getByLabel('随机母线接受规则',{exact:true}).count()===0,'random version control absent for graph');await capture('switch-graph-response.json',graph);
 pending=responseFor(q=>q.mode==='random'&&!q.randomVersion);await page.getByLabel('线组方式',{exact:true}).selectOption('random');const random=await(await pending).json();await ready();
 check(!random.source.courteousAnarchy&&random.stats.parameters.maxTries===500,'graph back to random restores exact legacy default mode');await restore();
 await page.getByRole('button',{name:'编辑边界',exact:true}).click();const dialog=page.getByRole('dialog',{name:'编辑编织边界',exact:true});
 await dialog.getByLabel('点 X',{exact:true}).fill('-1.05');await dialog.getByLabel('点 X',{exact:true}).press('Enter');
 await page.waitForFunction(()=>document.querySelector('dialog[open] [data-point="0"] title')?.textContent?.includes('-1.05'));
 pending=responseFor(q=>q.randomVersion==='original-courteous'&&q.boundary?.[0]?.[0]===-1.05);
 await dialog.getByRole('button',{name:'保存几何修改',exact:true}).click();const boundary=await(await pending).json();await ready();
 check(boundary.stats.parameters.randomVersion==='original-courteous'&&boundary.source.courteousAnarchy.boundary[0][0]===-1.05,'actual boundary point edit and save preserves native acceptance/source');await capture('boundary-edited-response.json',boundary);
 pending=responseFor(q=>q.randomVersion==='original-courteous'&&q.seed===1&&q.boundary?.[0]?.[0]===-1.05);await page.getByLabel('随机种子',{exact:true}).fill('1');const seed=await(await pending).json();await ready();
 check(seed.source.courteousAnarchy.randSeed===1&&seed.source.courteousAnarchy.boundary[0][0]===-1.05,'seed edit after saved boundary actually rebuilds native source');await capture('boundary-seed-response.json',seed);
 pending=responseFor(q=>q.randomVersion==='original-courteous'&&q.width===.01);await page.getByLabel('条带基准宽',{exact:true}).fill('.01');await(await pending).json();await ready();
 pending=responseFor(q=>q.randomVersion==='original-courteous'&&q.count===3&&q.width===.01&&q.seed===1);await page.getByLabel('目标线数',{exact:true}).fill('3');const count=await(await pending).json();await ready();
 check(count.source.generated===3&&count.source.courteousAnarchy.goal===3&&count.stats.parameters.boundary[0][0]===-1.05,'count edit after boundary and seed rebuilds three accepted original Lines');await capture('boundary-count-response.json',count);
 pending=responseFor(q=>q.mode==='chord'&&!q.randomVersion);await page.getByLabel('线组方式',{exact:true}).selectOption('chord');const chord=await(await pending).json();await ready();
 check(!Object.hasOwn(chord.stats.parameters,'randomVersion')&&!chord.source.courteousAnarchy,'native random to rotational chords clears source/version');await capture('switch-chord-response.json',chord);
 pending=responseFor(q=>q.wovenVersion==='original-old'&&!q.randomVersion);await page.getByLabel('编织构造示例',{exact:true}).selectOption('old-in3442');const old=await(await pending).json();await ready();
 check(old.stats.parameters.mode==='graph'&&old.source.oldWoven&&old.source.courteousAnarchy===undefined&&!Object.hasOwn(old.stats.parameters,'randomVersion'),'original Old saved example actually reconstructs old source without random leftovers');await capture('switch-old-response.json',old);
 check(errors.length===0,'no page error during mode/boundary switches');const evidence={passed:checks.length,checks,errors,bundle};await capture('browser-switch-evidence.json',evidence);return evidence;
}
