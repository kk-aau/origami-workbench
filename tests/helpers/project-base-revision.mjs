// Existing workflow tests read the revision they are about to edit. This never
// retries a failed write; conflict tests send explicit stale revisions directly.
export async function withProjectBaseRevision(route,input,request){
  const id=/^\/api\/projects\/([a-f0-9-]{36})\/rename$/.exec(route)?.[1]??(/^\/api\/projects(?:\/draft)?$/.test(route)?input?.id:null);
  if(!id||!input||Object.hasOwn(input,'baseRevision'))return input;
  const current=await request('/api/projects/'+id+'?draft=1');
  return {...input,baseRevision:current.status===200?current.value.revision:null};
}
