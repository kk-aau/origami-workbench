import type {DiagramAnnotation,DiagramLineAnnotation} from './diagramAnnotations';
import type {DiagramLineFaceSelection} from './diagramLinePick';

/** A click selects one material occurrence for fold semantics/appearance edits.
 * Moving a drawing handle or one of its endpoints moves its entire saved route;
 * a temporary clicked-face selection must not manufacture a copy left behind. */
export function isolateDiagramLineEdits(before:readonly DiagramAnnotation[],edited:DiagramAnnotation[],selection:DiagramLineFaceSelection,idFactory:()=>string=()=>crypto.randomUUID()):DiagramAnnotation[] {
  const used=new Set([...before,...edited].map(a=>a.id)),remaining:DiagramLineAnnotation[]=[];
  let result=edited;
  for(const original of before){
    if(original.kind!=='line'||!Object.hasOwn(selection,original.id))continue;
    const wanted=[...new Set(selection[original.id])];
    if(wanted.some(face=>!Number.isInteger(face)||face<0)||original.foldFaces&&wanted.some(face=>!original.foldFaces!.includes(face)))throw Error('所选纸层已变化，请重新选择折痕。');
    const index=result.findIndex(a=>a.id===original.id),changed=index<0?undefined:result[index];
    if(changed&&JSON.stringify(changed)===JSON.stringify(original))continue;
    const moved=changed?.kind==='line'&&JSON.stringify([changed.a,changed.b])!==JSON.stringify([original.a,original.b]);
    if(moved){
      if(result===edited)result=[...edited];
      const {foldFaces:_temporaryRange,...line}=changed;
      result[index]={...line,...(original.foldFaces?{foldFaces:[...original.foldFaces]}:{})};
      continue;
    }
    const rest=original.foldFaces?.filter(face=>!wanted.includes(face))??[];
    if(rest.length){
      const prefix=original.id.startsWith('cp-existing:')?'cp-existing:':original.id.startsWith('cp-link:')?'cp-link:':'';
      let id='',attempts=0;do{if(++attempts>100)throw Error('无法生成独立折痕编号。');id=prefix+idFactory();}while(used.has(id));used.add(id);
      remaining.push({...structuredClone(original),id,foldFaces:rest});
    }
    if(changed?.kind==='line'){
      if(result===edited)result=[...edited];
      result[index]={...changed,foldFaces:wanted};
    }
  }
  return remaining.length?[...result,...remaining]:result;
}
