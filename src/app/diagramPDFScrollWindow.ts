/** Dimensions are CSS pixels; pageWidth/pageHeight are the PDF aspect ratio. */
export function diagramPDFScrollGeometry(count:number,spread:boolean,enlarged:boolean,pageWidth:number,pageHeight:number,viewportWidth:number,viewportHeight:number){
  const columns=spread&&count>1?2:1,rows=Math.ceil(Math.max(0,count)/columns);
  const padding=12,gap=2,labelHeight=26,rowGap=14;
  const ratio=pageWidth>0&&pageHeight>0?pageWidth/pageHeight:210/297;
  const availableWidth=Math.max(1,viewportWidth-padding*2-gap*(columns-1));
  const availableHeight=Math.max(1,viewportHeight-padding*2-labelHeight);
  const sheetWidth=Math.max(1,Math.min(availableWidth/columns,availableHeight*ratio))*(enlarged?1.6:1);
  const sheetHeight=sheetWidth/ratio,rowHeight=sheetHeight+labelHeight,rowStride=rowHeight+rowGap;
  const rowWidth=sheetWidth*columns+gap*(columns-1),contentWidth=Math.max(viewportWidth,rowWidth+2*padding);
  const contentHeight=rows?rows*rowStride-rowGap+2*padding:0;
  return {columns,rows,padding,gap,labelHeight,rowGap,sheetWidth,sheetHeight,rowHeight,rowStride,rowWidth,contentWidth,contentHeight};
}

export type DiagramPDFScrollGeometry=ReturnType<typeof diagramPDFScrollGeometry>;

/** Keep intersecting rows plus at most one neighbouring row on either side.
 * Usually this mounts at most three rows. A very narrow viewport can expose
 * more small sheets; all visible rows remain mounted, without extra overscan. */
export function diagramPDFScrollWindow(count:number,geometry:DiagramPDFScrollGeometry,scrollTop:number,viewportHeight:number){
  const {columns,rows,padding,rowStride,rowHeight,contentHeight}=geometry;
  if(!rows)return {first:0,last:-1,firstVisible:0,lastVisible:-1,current:0,pages:[] as number[]};
  const top=Math.max(0,Math.min(scrollTop,Math.max(0,contentHeight-viewportHeight)));
  const clamp=(row:number)=>Math.max(0,Math.min(rows-1,row));
  let firstVisible=clamp(Math.floor((top-padding)/rowStride));
  const lastVisible=clamp(Math.ceil((top+viewportHeight-padding)/rowStride)-1);
  const current=clamp(Math.floor((top+viewportHeight/2-padding)/rowStride));
  // A viewport edge in the row gap does not require the preceding paper.
  if(firstVisible<lastVisible&&top>=padding+firstVisible*rowStride+rowHeight)firstVisible++;
  let first=firstVisible,last=Math.max(firstVisible,lastVisible);
  let remaining=Math.max(0,3-(last-first+1));
  if(remaining&&last<rows-1){last++;remaining--;}
  if(remaining&&first>0)first--;
  const pages=Array.from({length:Math.max(0,Math.min(count,(last+1)*columns)-first*columns)},(_,i)=>first*columns+i);
  return {first,last,firstVisible,lastVisible,current,pages};
}
