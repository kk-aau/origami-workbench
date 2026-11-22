import {validateDoc} from '../core/types';
import {readDiagramCPExportSettings,type DiagramCPExportSettings} from './diagramCPExportSettings';
import {defaultDiagramPDFOptions,validateDiagramPDFOptions,type DiagramPDFOptions} from './diagramPDFLayout';

/** Store authored overrides only, so untouched defaults still follow the project. */
export interface DiagramExportSettings {
  pdf?:Partial<DiagramPDFOptions>;
  format?:'pdf'|'images';
  coverCPSource?:'last'|'editor'|'file';
  cp?:DiagramCPExportSettings;
}

export function validateDiagramExportSettings(value:unknown):asserts value is DiagramExportSettings {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('折序工程导出设置格式无效。');
  const settings=value as DiagramExportSettings;
  if(settings.format!==undefined&&!['pdf','images'].includes(settings.format))throw Error('折序工程导出格式无效。');
  if(settings.coverCPSource!==undefined&&!['last','editor','file'].includes(settings.coverCPSource))throw Error('封面 CP 来源无效。');
  if(settings.pdf!==undefined){
    if(!settings.pdf||typeof settings.pdf!=='object'||Array.isArray(settings.pdf))throw Error('折序图解导出设置无效。');
    validateDiagramPDFOptions({...defaultDiagramPDFOptions(),...settings.pdf});
    if(settings.pdf.coverCPDoc!==undefined)validateDoc(settings.pdf.coverCPDoc);
  }
  if((settings.coverCPSource==='editor'||settings.coverCPSource==='file')&&!settings.pdf?.coverCPDoc)throw Error('封面 CP 来源缺少折痕图。');
  readDiagramCPExportSettings(settings.cp);
}
