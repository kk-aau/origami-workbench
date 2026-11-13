import {upgradeProject} from '../core/project';
import {validateDoc,type Doc} from '../core/types';
import {splitEditableSegments} from './planarize';
import {curveDesignFromDocument} from './curveDesignProject';
import {validSavedProjectHead,type SavedProjectImportInfo} from './projectImportProtocol';

/** Prepare a complete editing document before replacing the current project. */
export function prepareProjectImport(source:Doc, alreadyUpgraded=false):Doc {
  const upgraded=alreadyUpgraded?source:upgradeProject(source),prepared=splitEditableSegments(upgraded);
  validateDoc(prepared);
  return prepared;
}

/** A saved API record is already a native document, not an interchange file.
 * Keep unknown document fields in place and prepare the same full geometry as
 * replace() did, while retaining its pre-upgrade saved/dirty baseline. */
export function prepareSavedProjectImport(text:string):{doc:Doc;savedProject:SavedProjectImportInfo} {
  let record:Record<string,unknown>;
  try{record=JSON.parse(text) as Record<string,unknown>;}catch{throw new Error('本地工程返回格式异常，请检查文件是否完整。');}
  if(!record||typeof record!=='object'||Array.isArray(record)||!Object.hasOwn(record,'doc')
    ||!validSavedProjectHead(record)
    ||record.draft!==undefined&&typeof record.draft!=='boolean')throw new Error('本地工程记录不完整，当前工程未替换。');
  const revision=record.revision as string|null,draft=record.draft===true,sourceSignature=JSON.stringify(record.doc);
  const doc=prepareProjectImport(record.doc as Doc);
  // The parsed source is no longer needed after the unchanged upgrade/split
  // operator has produced its document. Do not retain it during chunk delivery.
  record.doc=null;text='';
  curveDesignFromDocument(doc);
  const encoded=JSON.stringify(doc),upgraded=encoded!==sourceSignature;
  return {doc,savedProject:{draft,revision,sourceSignature,preparedSignature:upgraded?encoded:sourceSignature,upgraded,...(record.workspaceDraft===true?{workspaceDraft:true}:{}),...(record.workspaceDraftConflict===true?{workspaceDraftConflict:true}:{})}};
}
