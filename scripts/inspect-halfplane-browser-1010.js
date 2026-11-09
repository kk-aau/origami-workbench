async page=>{
return await page.evaluate(()=>Array.from(document.querySelectorAll('dialog[open]')).map(d=>({title:d.getAttribute('aria-label'),errors:Array.from(d.querySelectorAll('[role=alert]')).map(e=>e.textContent),points:Array.from(d.querySelectorAll('circle[data-point] title')).map(e=>e.textContent),fields:Array.from(d.querySelectorAll('input')).map(e=>({label:e.getAttribute('aria-label'),value:e.value,invalid:e.getAttribute('aria-invalid')}))})));
}
