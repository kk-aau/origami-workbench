import {useEffect,useState} from 'react';
import type {PaperPatterns} from '../app/paperPatterns';
import {decodePaperTextures,decodedPaperTextures} from '../engine/simPaperTexture';

export function usePaperPixels(patterns?:PaperPatterns){
  const [,refresh]=useState(0);
  useEffect(()=>{
    if(!patterns||decodedPaperTextures(patterns))return;
    let current=true;
    void decodePaperTextures(patterns).then(()=>{if(current)refresh(n=>n+1);},()=>{});
    return ()=>{current=false;};
  },[patterns]);
  return decodedPaperTextures(patterns);
}
