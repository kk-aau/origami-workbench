/** documentText is the editor's JSON signature for this exact immutable Doc.
 * Envelope fields are always encoded separately, including their escaping. */
export function documentRequestJson(documentText:string,fields:Record<string,unknown>):string {
  if(Object.hasOwn(fields,'doc'))throw new Error('文档请求不能重复指定 doc。');
  const header=JSON.stringify(fields);
  return header.slice(0,-1)+(header.length>2?',':'')+'"doc":'+documentText+'}';
}
