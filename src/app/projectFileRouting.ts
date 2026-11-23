import type {DesktopDocumentWorkspace} from '../desktop';

export type ProjectFileKind='crease'|'diagram'|'design'|'artwork'|'curve'|'model'|'models';
export const PROJECT_FILE_ACCEPT='.zds,.zcp,.oriw,.json,.fold,.cp,.opx,.ori,.orh,.tmd,.tmd4,.tmd5,.bps';
export const isProjectFileName=(name:string)=>/\.(zds|zcp|oriw|json|fold|cp|opx|ori|orh|tmd[45]?|bps)$/i.test(name);

/** Routing only. The destination importer still performs full validation before
 * replacing anything. Generic JSON must be identified by its root structure. */
export function projectFileKind(name:string,raw?:unknown):ProjectFileKind{
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
    const value=raw as Record<string,any>;
    switch(value.format){
      case 'zhezhi-diagram':return 'diagram';
      case 'zhezhi-base-design':return 'design';
      case 'zhezhi-artwork':return 'artwork';
      case 'zhezhi-curve-design':return 'curve';
      case 'zhezhi-folded-model':return 'model';
      case 'zhezhi-model-collection':return 'models';
    }
    if(value.design?.tree&&value.design?.layout)return 'design';
    if(value.paper&&Array.isArray(value.segments))return value.metadata?.curveDesign?'curve':'crease';
    if(Array.isArray(value.vertices_coords)&&Array.isArray(value.edges_vertices))return 'crease';
    throw Error('无法识别这个 JSON 工程。请选择折纸工程、折序、基础形设计、模型或完整作品文件。');
  }
  if(/\.zds$|\.diagram\.json$/i.test(name))return 'diagram';
  if(/\.(tmd[45]?|bps)$|\.design\.json$/i.test(name))return 'design';
  if(/\.oriw$/i.test(name))return 'artwork';
  if(/\.(zcp|fold|cp|opx|ori|orh)$/i.test(name))return 'crease';
  throw Error('不支持这个文件类型。请选择折纸软件支持的工程文件。');
}

export const projectFileWorkspace=(kind:ProjectFileKind):DesktopDocumentWorkspace=>kind==='diagram'?'diagram':kind==='design'?'design':kind==='curve'?'tess':'edit';

