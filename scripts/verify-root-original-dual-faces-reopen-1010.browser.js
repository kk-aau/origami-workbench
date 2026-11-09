async page=>{
 const button=name=>page.getByRole('button',{name,exact:true});await page.evaluate(()=>window.confirm=()=>true);
 const capture=async(value,file)=>{const d=page.waitForEvent('download');await page.evaluate(({value,file})=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)]));a.download=file;a.click();},{value,file});await(await d).saveAs(`output/playwright/original-topology-factors-main-1010/dual/${file}`);};
 for(const kind of ['base','edited']){
  await button('折痕编辑').click();await button('工程库').click();await page.locator('.project-list button').filter({hasText:`DualFaces1010-${kind}`}).first().click();
  await button('镶嵌设计').click();await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.status()===200&&r.request().postDataJSON()?.faceupFace===3&&!!r.request().postDataJSON()?.dualTargets===(kind==='edited'));
  await button('读取工程参数').click();const response=await(await pending).json();
  if(response.dual.faces_vertices.length!==1||response.dual.zhezhi_dual_primal_vertices[0]!==2)throw Error(kind+'工程参数恢复原对偶面/内点映射失败');
  if(kind==='edited'&&!response.stats.parameters.dualTargets)throw Error('编辑的对偶目标未存取');
  await capture(response,`browser-${kind}-regenerated-response.json`);
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled),{},{timeout:30000});
 }
 return {verified:true,actualLibraryParamsRegenerateFacesAndMapping:['base','edited'],editedDualTargetsPersist:true};
}
