import type {DiagramProject} from '../app/diagramProject';
import type {DiagramLineDefaults} from '../app/diagramLineStyles';
import type {DiagramPDFOptions,DiagramPDFPlan} from '../app/diagramPDFLayout';
import {diagramPDFPreviewGeometry} from '../app/diagramPDFPreviewPlan';
import {renderDiagramPDFPreviewBody} from '../app/diagramPDFPage';

type PageArguments=readonly [DiagramProject,DiagramPDFOptions,DiagramPDFPlan,number,DiagramLineDefaults,boolean];
interface PreviewBody {args:PageArguments;svg?:string;pending?:Promise<string>;controller?:AbortController}
type PageSettings=Omit<DiagramPDFOptions,'ribbon'|'ribbonSeamHeights'|'pageBackground'|'pageTextColor'>;

interface PageCache {
  geometry:DiagramPDFPlan;settings:PageSettings;ribbonEnabled:boolean;palette:DiagramLineDefaults;adaptive:boolean;
  pages:Map<number,PreviewBody>;
  visiblePages?:readonly number[];
}
const projects=new WeakMap<DiagramProject,PageCache>();
const owners=new WeakMap<PreviewBody,PageCache>();
const viewers=new WeakMap<DiagramProject,number>();

export function retainPreviewPageBodies(project:DiagramProject){
  viewers.set(project,(viewers.get(project)??0)+1);
  return ()=>{
    viewers.set(project,(viewers.get(project)??1)-1);
    // React can immediately remount effects in development or during a move.
    queueMicrotask(()=>{if(!viewers.get(project))clearPreviewPageBodies(project);});
  };
}

function prune(cache:PageCache){
  let characters=0,kept=0;
  const visible=new Set(cache.visiblePages??[...cache.pages.keys()].slice(-2));
  for(const [index,entry] of [...cache.pages].reverse()){
    characters+=entry.svg?.length??0;
    // The overlapping page in a spread may not have been requested again by
    // React. Pin both visible pages, even for two oversized photos.
    // 32M UTF-16 characters is at most 64 MiB of retained page text.
    if((++kept>64||characters>32*1024*1024)&&!visible.has(index)){
      entry.controller?.abort();cache.pages.delete(index);
    }
  }
}

function cancel(cache:PageCache){for(const page of cache.pages.values())page.controller?.abort();}

/** End the dialog's render work without letting detached pages publish results. */
export function clearPreviewPageBodies(project:DiagramProject){
  const cache=projects.get(project);
  if(cache)cancel(cache);
  projects.delete(project);
}

/** Navigation shares work already in progress; only a new style/snapshot or a
 * closed dialog cancels it. A short delay coalesces continuous control input. */
export function loadPreviewPageBody(page:PreviewBody):Promise<string>{
  if(page.svg!==undefined)return Promise.resolve(page.svg);
  if(page.pending)return page.pending;
  const controller=new AbortController();page.controller=controller;
  const pending=(async()=>{
    await new Promise<void>(resolve=>setTimeout(resolve,60));
    controller.signal.throwIfAborted();
    const svg=await renderDiagramPDFPreviewBody(controller.signal,...page.args);
    controller.signal.throwIfAborted();
    page.svg=svg;
    const owner=owners.get(page);if(owner)prune(owner);
    return svg;
  })();
  page.pending=pending;
  // Clear failed/cancelled work too, so remounting can retry it.
  void pending.then(()=>{page.pending=undefined;page.controller=undefined;},()=>{page.pending=undefined;page.controller=undefined;});
  return pending;
}

export function previewPageBody(project:DiagramProject,options:DiagramPDFOptions,plan:DiagramPDFPlan,pageIndex:number,palette:DiagramLineDefaults,adaptive:boolean,visiblePages?:readonly number[]):PreviewBody {
  const {ribbon,ribbonSeamHeights,pageBackground,pageTextColor,...settings}=options;
  const geometry=diagramPDFPreviewGeometry(plan),ribbonEnabled=!!ribbon?.enabled;
  let cache=projects.get(project);
  if(!cache||cache.geometry!==geometry||cache.ribbonEnabled!==ribbonEnabled||cache.palette!==palette||cache.adaptive!==adaptive||
    Object.keys(settings).length!==Object.keys(cache.settings).length||
    (Object.keys(settings) as (keyof PageSettings)[]).some(key=>settings[key]!==cache!.settings[key])){
    if(cache)cancel(cache);
    cache={geometry,settings,ribbonEnabled,palette,adaptive,pages:new Map()};
    projects.set(project,cache);
  }
  // Page ink is applied to labelled text/rules in the preview DOM. The export
  // renderer still receives the original options and writes literal colors.
  const pages=cache.pages,body=pages.get(pageIndex)??{args:[project,{...options,pageTextColor:undefined},plan,pageIndex,palette,adaptive] as const};
  owners.set(body,cache);
  cache.visiblePages=visiblePages;
  pages.delete(pageIndex);
  pages.set(pageIndex,body);
  prune(cache);
  return body;
}
