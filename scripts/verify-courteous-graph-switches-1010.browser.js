async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(v,name)=>{if(!v)throw Error(name);checks.push(name);};
 const apiFor=(predicate,status=200)=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.status()===status&&predicate(r.request().postDataJSON()));
 const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled),{},{timeout:45000});
 const capture=async(name,value)=>{const wait=page.waitForEvent('download');await page.evaluate(({name,value})=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.download=name;a.click();},{name,value});await(await wait).saveAs('output/playwright/courteous-graph/'+name);};
 await page.getByLabel('随机母线接受规则',{exact:true}).selectOption('original-courteous-graph');
 const graphPending=apiFor(q=>q.randomVersion==='original-courteous-graph'&&q.width===.02&&q.count===2);
 await page.getByRole('button',{name:'原随机母图示例',exact:true}).click();const graph=await(await graphPending).json();await ready();
 const linesPending=apiFor(q=>q.randomVersion==='original-courteous');await page.getByLabel('随机母线接受规则',{exact:true}).selectOption('original-courteous');const lines=await(await linesPending).json();await ready();
 check(lines.source.courteousAnarchy.originalGraphOptionsReproduced===false&&lines.source.courteousAnarchy.motherGraphRoute==='local-arrangement-from-accepted-lines'&&!lines.source.courteousGraph,'old Lines source remains explicitly local arrangement');
 check(!Object.hasOwn(lines.stats.parameters,'samePtTolerance')&&!Object.hasOwn(lines.stats.parameters,'intersectionTolerance'),'Graph to original Lines removes both tolerance parameters');
 check(JSON.stringify(lines.source.courteousAnarchy.completeLines)===JSON.stringify(graph.source.courteousAnarchy.completeLines)&&JSON.stringify(lines.mother)!==JSON.stringify(graph.mother),'same accepted Lines use distinct actual graph routes and ordered mothers');await capture('switch-original-lines-response.json',lines);
 await page.getByLabel('随机母线接受规则',{exact:true}).selectOption('original-courteous-graph');await page.getByRole('button',{name:'原随机母图示例',exact:true}).click();await ready();
 const seedPending=apiFor(q=>q.seed===1&&q.randomVersion==='original-courteous-graph');await page.getByLabel('随机种子',{exact:true}).fill('1');await(await seedPending).json();await ready();
 await page.getByRole('button',{name:'褶宽约束／周期／固定面',exact:true}).click();await page.getByLabel('端点合点公差',{exact:true}).fill('0');
 const badPending=apiFor(q=>q.seed===1&&q.samePtTolerance===0&&q.randomVersion==='original-courteous-graph',422);await page.getByRole('dialog').getByRole('button',{name:'保存编织约束',exact:true}).click();const bad=await(await badPending).json();
 check(bad.error.includes('不同二轮索引或边来源')&&!bad.fold&&!bad.source,'ambiguous original Sort topology refuses CP without repair');
 check(await page.getByRole('button',{name:'采用折痕副本 →',exact:true}).isDisabled(),'source ambiguity cannot adopt a stale ordinary CP');await capture('ambiguous-zero-tolerance-error.json',bad);
 await page.getByRole('button',{name:'原随机母图示例',exact:true}).click();await ready();check(true,'real worker and adoption recover after zero-tolerance source rejection');
 for(const mode of ['graph','chord']){const pending=apiFor(q=>q.mode===mode);await page.getByLabel('线组方式',{exact:true}).selectOption(mode);const result=await(await pending).json();check(!result.source.courteousAnarchy&&!result.source.courteousGraph&&!Object.hasOwn(result.stats.parameters,'randomVersion')&&!Object.hasOwn(result.stats.parameters,'samePtTolerance')&&!Object.hasOwn(result.stats.parameters,'intersectionTolerance'),`switch ${mode} clears native Graph fields`);await capture(`switch-${mode}-response.json`,result);}
 const oldPending=apiFor(q=>q.wovenVersion==='original-old');await page.getByLabel('编织构造示例',{exact:true}).selectOption('old-in3442');const old=await(await oldPending).json();await ready();check(old.source.oldWoven.function==='MakeSimpleWovenTessellationOld'&&!old.source.courteousGraph&&!Object.hasOwn(old.stats.parameters,'randomVersion'),'original Old d/dd source remains separate after Graph switches');await capture('switch-old-response.json',old);
 check(errors.length===0,'no page errors');const result={passed:checks.length,checks,errors};await capture('browser-switch-evidence.json',result);return result;
}
