import type {Doc} from '../core/types';
import {validateDoc} from '../core/projectValidation.mjs';
import type {CPPrintOptions} from './creasePatternExport';

export interface DiagramCPExportSettings {
  source:'before'|'after'|'last'|'editor'|'file';
  format:'pdf'|'svg'|'png';
  print:CPPrintOptions;
  snapshot?:{doc:Doc;name:string};
}

export const defaultDiagramCPExportSettings:DiagramCPExportSettings={
  source:'after',format:'pdf',print:{paper:'A4',orientation:'portrait'}
};

export function readDiagramCPExportSettings(value:unknown):DiagramCPExportSettings|undefined {
  if(value===undefined)return;
  const settings=value as Partial<DiagramCPExportSettings>|null;
  if(!settings||!['before','after','last','editor','file'].includes(settings.source??'')||
    !['pdf','svg','png'].includes(settings.format??'')||
    !['A4','A3'].includes(settings.print?.paper??'')||
    !['portrait','landscape'].includes(settings.print?.orientation??''))throw Error('工程中的 CP 导出设置无效。');
  if(settings.source==='editor'||settings.source==='file'||settings.snapshot!==undefined){
    if(!settings.snapshot||typeof settings.snapshot.name!=='string')throw Error('工程中的 CP 导出图缺少来源信息。');
    validateDoc(settings.snapshot.doc);
  }
  return settings as DiagramCPExportSettings;
}
