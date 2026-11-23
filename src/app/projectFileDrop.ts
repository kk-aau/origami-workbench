import {isProjectFileName} from './projectFileRouting';

/** Only external files are captured. Internal tab/symbol drags and existing
 * image/SVG import targets keep their handlers. Always prevent file navigation. */
export function installProjectFileDrop(target:Window,onFiles:(files:File[])=>void,onHover:(hover:boolean)=>void,onError:(message:string)=>void){
  let depth=0;
  const hasFiles=(event:DragEvent)=>Array.from(event.dataTransfer?.types??[]).includes('Files');
  const enter=(event:DragEvent)=>{if(hasFiles(event)){event.preventDefault();depth++;onHover(true);}};
  const over=(event:DragEvent)=>{if(hasFiles(event)){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';}};
  const leave=(event:DragEvent)=>{if(hasFiles(event)){depth=Math.max(0,depth-1);if(!depth)onHover(false);}};
  const clear=()=>{depth=0;onHover(false);};
  const drop=(event:DragEvent)=>{
    if(!hasFiles(event))return;
    event.preventDefault();clear();
    const files=Array.from(event.dataTransfer?.files??[]),projects=files.filter(file=>isProjectFileName(file.name));
    if(projects.length){event.stopImmediatePropagation();onFiles(projects);return;}
    // Let an existing image import target handle raster/SVG files.
    if(files.length&&files.every(file=>/^image\//.test(file.type)||/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)))return;
    event.stopImmediatePropagation();onError('请拖入工程文件；文件夹或当前不支持的文件不能直接打开。');
  };
  target.addEventListener('dragenter',enter,{capture:true});target.addEventListener('dragover',over,{capture:true});
  target.addEventListener('dragleave',leave,{capture:true});target.addEventListener('drop',drop,{capture:true});
  target.addEventListener('dragend',clear);target.addEventListener('blur',clear);
  return()=>{target.removeEventListener('dragenter',enter,{capture:true});target.removeEventListener('dragover',over,{capture:true});target.removeEventListener('dragleave',leave,{capture:true});target.removeEventListener('drop',drop,{capture:true});target.removeEventListener('dragend',clear);target.removeEventListener('blur',clear);};
}
