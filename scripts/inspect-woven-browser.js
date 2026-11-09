async page=>{
const r=page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));await page.getByRole('button',{name:'重新计算',exact:true}).click();const response=await r;return {input:response.request().postDataJSON(),output:await response.json()};
}
