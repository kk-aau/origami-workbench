import {diagramImageDataInfo} from './diagramImages';
import type {Doc} from '../core/types';

export type PaperSide='front'|'back';
export interface PaperFaceStyle {
  mode:'color'|'image';
  color:string;
  texture:'none'|'washi';
  /** The previous upload, retained while the color mode is active. */
  upload?:string;
}
export interface PaperPatterns {
  front?:string;
  back?:string;
  styles?:Partial<Record<PaperSide,PaperFaceStyle>>;
}
export function validPaperImage(url:unknown):url is string {
  if(typeof url!=='string')return false;
  try{diagramImageDataInfo(url);return true;}catch{return false;}
}
function validStyle(value:unknown):value is PaperFaceStyle{
  if(!value||typeof value!=='object')return false;
  const s=value as PaperFaceStyle;
  return (s.mode==='image'||s.mode==='color')&&/^#[a-f\d]{6}$/i.test(s.color)&&
    (s.texture==='none'||s.texture==='washi')&&(s.upload===undefined||s.mode==='color'&&validPaperImage(s.upload));
}
export function readPaperPatterns(value:unknown):PaperPatterns|undefined {
  if(!value||typeof value!=='object')return;
  const {front,back,styles}=value as PaperPatterns;
  const result:PaperPatterns={...(validPaperImage(front)?{front}:{}),...(validPaperImage(back)?{back}:{})};
  if(styles&&typeof styles==='object'&&Object.keys(styles).length&&
      Object.entries(styles).every(([side,s])=>(side==='front'||side==='back')&&validStyle(s)&&(s.mode==='image'||!!result[side]))){
    result.styles=styles;
  }
  return result.front||result.back||result.styles?result:undefined;
}
export function withPaperPatterns(doc:Doc,patterns:PaperPatterns|undefined):Doc {
  if(!patterns&&!doc.metadata?.paperPatterns)return doc;
  const metadata={...doc.metadata};
  if(patterns?.front||patterns?.back||patterns?.styles)metadata.paperPatterns=patterns;
  else delete metadata.paperPatterns;
  return {...doc,metadata:Object.keys(metadata).length?metadata:undefined};
}
