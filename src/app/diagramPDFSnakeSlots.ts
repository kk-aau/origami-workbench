/** Grid position on a left-to-right spread. The caller may mirror rows to
 * start at the bottom if the facing page ends there. */
export function spreadSnakeSlot(index:number,count:number,columns:number,rows:number,vertical:boolean) {
  if(vertical){
    const column=Math.floor(index/rows),offset=index%rows;
    return {column,row:column%2===0?offset:rows-1-offset};
  }
  const lastRow=Math.floor((count-1)/columns),pairs=count-lastRow*columns;
  const tailStart=(lastRow-1)*columns;
  if(lastRow%2===1&&pairs>1&&index>=tailStart){
    // A normal reversed last row would have to double back past its own
    // drawings to leave through the right edge. Snake through the few
    // occupied row-pairs by column after the unpaired part of the top row.
    const offset=index-tailStart,singles=columns-pairs;
    if(offset<singles)return {column:offset,row:lastRow-1};
    const paired=offset-singles,pair=Math.floor(paired/2);
    const rowOffset=pair%2===0?paired%2:1-paired%2;
    return {column:singles+pair,row:lastRow-1+rowOffset};
  }
  const row=Math.floor(index/columns),offset=index%columns;
  return {row,column:row%2===0?offset:columns-1-offset};
}
