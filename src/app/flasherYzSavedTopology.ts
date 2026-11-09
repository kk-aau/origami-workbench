/** In[4125]/In[4127]: fixed ideal CP seed drawings, not solved Y/Z CP/FF. */
import {buildFlasherXSavedTopology,type FlasherXDiagonal} from './flasherXSavedTopology';

export type FlasherYzVariant='Y'|'Z';
export type FlasherYzSavedTopology={kind:'flasher-yz-saved-first-sector-topology';
  variant:FlasherYzVariant;sourceCells:string[];savedInput:{rings:3;heightOrder:2;
    rotationalOrder:5;sector:0;radialOrder:6};
  majorRows:readonly [6,4,2];minorRows:readonly [5,3,1];
  diagonals:FlasherXDiagonal[];idealCPSeedOnly:true;solvedCreasePattern:false;
  foldedForm:false;mountainValleyAssigned:false;isometryVerified:false;
  layerOrderVerified:false;exactStraightCreaseFOLD:false;
  adoptableCreasePattern:false};

export function buildFlasherYzSavedTopology(variant:FlasherYzVariant):FlasherYzSavedTopology{
  if(variant!=='Y'&&variant!=='Z')throw Error('仅支持保存 Y/Z 首扇区。');
  const x=buildFlasherXSavedTopology();
  // In[4124]/In[4126] map directly over In[4116]'s major-then-minor quads.
  const ordered=x.diagonals.slice().sort((a,b)=>a.sourceQuadIndex-b.sourceQuadIndex);
  if(ordered.length!==21||ordered.some((item,i)=>item.sourceQuadIndex!==i))
    throw Error('保存 Y/Z 首扇区四边形顺序不符。');
  const [a,b]=variant==='Y'?[0,2]:[1,3];
  const diagonals=ordered.map(item=>({...item,diagonal:variant==='Y'?'13':'24' as '13'|'24',
    endpointLabels:[item.quadLabels[a],item.quadLabels[b]] as typeof item.endpointLabels,
    endpointCoords:[item.quadCoords[a],item.quadCoords[b]] as typeof item.endpointCoords}));
  return {kind:'flasher-yz-saved-first-sector-topology',variant,
    sourceCells:variant==='Y'?['In[4099]','In[4116]','In[4124]','In[4125]']:
      ['In[4099]','In[4116]','In[4126]','In[4127]'],
    savedInput:x.savedInput,majorRows:x.majorRows,minorRows:x.minorRows,diagonals,
    idealCPSeedOnly:true,solvedCreasePattern:false,foldedForm:false,
    mountainValleyAssigned:false,isometryVerified:false,
    layerOrderVerified:false,exactStraightCreaseFOLD:false,
    adoptableCreasePattern:false};
}
