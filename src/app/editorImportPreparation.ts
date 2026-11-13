import type {Doc} from '../core/types';
import {validSavedProjectHead,type SavedProjectImportInfo} from './projectImportProtocol';

export interface PreparedEditorImportData {
  doc:Doc;warnings:string[];
  /** Ordinary file imports encode once in the Worker. Saved imports use their
   * existing preparedSignature, without transferring the same text again. */
  signature?:string;savedProject?:SavedProjectImportInfo;
}
const signatures=new WeakMap<Doc,string>();

/** Register only after the owned import Worker finished its acknowledged tree.
 * A document property, old result reply or immutable edit cannot grant trust. */
export function registerPreparedEditorImport(value:PreparedEditorImportData):PreparedEditorImportData {
  const doc=value?.doc,saved=value?.savedProject;
  if(!doc||typeof doc!=='object'||typeof doc.name!=='string'||!doc.paper||!Array.isArray(doc.segments)
    ||!Array.isArray(value.warnings)||value.warnings.some(warning=>typeof warning!=='string')
    ||saved&&(typeof saved.draft!=='boolean'||!validSavedProjectHead(saved)
      ||typeof saved.sourceSignature!=='string'||typeof saved.preparedSignature!=='string'||typeof saved.upgraded!=='boolean')
    ||saved&&value.signature!==undefined)throw Error('折痕工程准备结果不完整，当前工程未替换。');
  const signature=saved?.preparedSignature??value.signature;
  if(typeof signature!=='string'||!signature)throw Error('折痕工程缺少完整准备签名，当前工程未替换。');
  signatures.set(doc,signature);return value;
}

/** Exact in-memory identity only. No serialized flag enables this fast path. */
export function getPreparedEditorSignature(doc:Doc):string|undefined{return signatures.get(doc);}
