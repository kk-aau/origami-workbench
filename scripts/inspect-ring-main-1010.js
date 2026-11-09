async page=>{
return await page.evaluate(()=>({status:Array.from(document.querySelectorAll('[role=status],.tess-preview-status,[role=alert]')).map(e=>({class:e.className,text:e.textContent,pending:e.getAttribute('data-pending')})),actions:Array.from(document.querySelectorAll('button')).filter(e=>/采用展开|平折|详情/.test(e.textContent||'')).map(e=>({text:e.textContent,disabled:e.disabled,title:e.title})),summary:document.querySelector('.tess-preview')?.textContent?.slice(0,2000)}));
}
