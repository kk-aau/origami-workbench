async page=>{
 await page.getByRole('button',{name:/^编辑母图 · \d+ 点$/}).click();const c=page.getByRole('dialog',{name:'有限母图 · 原CP与原FF',exact:true});const before=await c.getByLabel('有限母图 JSON',{exact:true}).inputValue();await c.getByLabel('嵌套轮廓作为独立纸片',{exact:true}).check();const after=await c.getByLabel('有限母图 JSON',{exact:true}).inputValue();const response=page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));await c.getByRole('button',{name:'保存母图',exact:true}).click();const r=await response;return {before,after,request:r.request().postDataJSON(),status:r.status(),reply:await r.json()};
}
