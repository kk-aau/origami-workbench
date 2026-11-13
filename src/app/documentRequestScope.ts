const documentIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validDocumentOwner(value:unknown):value is string{return typeof value==='string'&&documentIdPattern.test(value);}

/** A simulation iframe belongs to the document view, not the host shell. */
export function currentDocumentOwner():string|undefined{
  if(typeof window==='undefined')return undefined;
  const own=window.desktop as {documentId?:unknown}|undefined;
  if(validDocumentOwner(own?.documentId))return own.documentId;
  try{
    if(window.parent!==window&&window.parent.location.origin===window.location.origin){
      const parent=window.parent.desktop as {documentId?:unknown}|undefined;
      if(validDocumentOwner(parent?.documentId))return parent.documentId;
      const owner=new URL(window.parent.location.href).searchParams.get('workspace');
      if(validDocumentOwner(owner))return owner;
    }
  }catch{/* A foreign iframe is not an owning document. */}
  try{
    const owner=new URL(window.location.href).searchParams.get('workspace');
    return validDocumentOwner(owner)?owner:undefined;
  }catch{return undefined;}
}
export function documentScopeHeaders(owner=currentDocumentOwner()):Record<string,string>{return validDocumentOwner(owner)?{'X-Zhezhi-Document':owner}:{};}
