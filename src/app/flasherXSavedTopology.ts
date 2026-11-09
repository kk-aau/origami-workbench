/** Origamica In[4123] first-sector X diagonals on In[4099]'s ideal CP seed.
 * Source quad order comes from In[4116]. This is topology only, never the
 * solved CP/FF or an adoptable FOLD graph.
 */

export type FlasherXLabel=[number,number,number];
export type FlasherXPoint=[number,number];
export type FlasherXDiagonal={region:'minor'|'major';row:number;column:number;
  sourceQuadIndex:number;diagonal:'13'|'24';quadLabels:FlasherXLabel[];
  quadCoords:FlasherXPoint[];endpointLabels:[FlasherXLabel,FlasherXLabel];
  endpointCoords:[FlasherXPoint,FlasherXPoint];quadSignedArea:number};
export type FlasherXSavedTopology={kind:'flasher-x-saved-first-sector-topology';
  savedInput:{rings:3;heightOrder:2;rotationalOrder:5;sector:0;radialOrder:6};
  sourceCells:readonly ['In[4099]','In[4116]','In[4122]','In[4123]'];
  majorRows:readonly [6,4,2];minorRows:readonly [5,3,1];
  diagonals:FlasherXDiagonal[];idealCPSeedOnly:true;solvedCreasePattern:false;
  foldedForm:false;mountainValleyAssigned:false;isometryVerified:false;
  layerOrderVerified:false;exactStraightCreaseFOLD:false;
  adoptableCreasePattern:false};

const SAVED={rings:3,heightOrder:2,rotationalOrder:5,sector:0,radialOrder:6} as const;
const MAJOR_ROWS=[6,4,2] as const,MINOR_ROWS=[5,3,1] as const;
const wrap=([i,j,k]:FlasherXLabel):FlasherXLabel=>
  i===-1?[j,0,4]:[i,j,k];
function idealCPPoint([i,j,k]:FlasherXLabel):FlasherXPoint{
  const m=5,t=Math.tan(Math.PI/m),turn=2*Math.PI/m;
  let x=1/(2*t),y=.5;
  if(i+1>=j){
    x+=(i+1)*Math.cos(Math.PI/2+turn)+t*j*Math.cos(turn);
    y+=(i+1)*Math.sin(Math.PI/2+turn)+t*j*Math.sin(turn);
  }else{x-=t*(i+1);y+=j;}
  x*=t;y*=t;
  const angle=turn*k,c=Math.cos(angle),s=Math.sin(angle);
  return [c*x-s*y,s*x+c*y];
}
function sourceQuads():FlasherXLabel[][]{
  const r=3,h=2,n=r*h,k=0;
  const quads:FlasherXLabel[][]=[];
  for(let group=0;group<r;group++){
    const j=h*group;
    for(let i=j;i<=n;i++)if(Math.min(j+h,i)>j)
      quads.push(([[i,j,k],[i-1,j,k],[i-1,Math.min(j+h,i),k],
        [i,Math.min(j+h,i+1),k]] as FlasherXLabel[]).map(wrap));
  }
  for(let group=0;group<r;group++){
    const i=h*group-1;
    for(let j=h*group+1;j<=n;j++)if(Math.min(i+h,j-2)>i)
      quads.push(([[i,j,k],[i,j-1,k],[Math.min(i+h,j-2),j-1,k],
        [Math.min(i+h,j-1),j,k]] as FlasherXLabel[]).map(wrap));
  }
  return quads;
}
const area=(points:FlasherXPoint[])=>points.reduce((sum,a,i)=>{
  const b=points[(i+1)%points.length];return sum+(a[0]*b[1]-b[0]*a[1]);
},0)/2;

export function buildFlasherXSavedTopology():FlasherXSavedTopology{
  const quads=sourceQuads();
  const majorCount=(quads.length+SAVED.rings)/2,minorCount=majorCount-SAVED.rings;
  if(quads.length!==21||majorCount!==12||minorCount!==9)
    throw Error('In[4123] 四边形来源顺序不符。');
  const diagonals:FlasherXDiagonal[]=[];
  for(const [region,rows,start] of [
    ['minor',MINOR_ROWS,majorCount],['major',MAJOR_ROWS,0],
  ] as const){
    let sourceQuadIndex=start;
    for(let row=1;row<=rows.length;row++)
      for(let column=1;column<=rows[row-1];column++){
        const quadLabels=quads[sourceQuadIndex],quadCoords=quadLabels.map(idealCPPoint);
        // In[4122]: Mod[col+(h-1)(row-1)+1,2]==0 with h=2.
        const pick13=(column+row)%2===0;
        const [a,b]=pick13?[0,2]:[1,3];
        diagonals.push({region,row,column,sourceQuadIndex,
          diagonal:pick13?'13':'24',quadLabels,quadCoords,
          endpointLabels:[quadLabels[a],quadLabels[b]],
          endpointCoords:[quadCoords[a],quadCoords[b]],
          quadSignedArea:area(quadCoords)});
        sourceQuadIndex++;
      }
  }
  return {kind:'flasher-x-saved-first-sector-topology',savedInput:SAVED,
    sourceCells:['In[4099]','In[4116]','In[4122]','In[4123]'],
    majorRows:MAJOR_ROWS,minorRows:MINOR_ROWS,diagonals,
    idealCPSeedOnly:true,solvedCreasePattern:false,foldedForm:false,
    mountainValleyAssigned:false,isometryVerified:false,
    layerOrderVerified:false,exactStraightCreaseFOLD:false,
    adoptableCreasePattern:false};
}
