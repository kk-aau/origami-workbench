export interface PixelRect {x:number;y:number;width:number;height:number}

/** Scan alpha alone so white paper and antialiased outlines are both retained. */
export function visiblePixelBounds(rgba:Uint8ClampedArray,width:number,height:number):PixelRect|null {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||rgba.length!==width*height*4)throw new Error('图像尺寸与像素数据不一致。');
  let left=width,right=-1,top=height,bottom=-1;
  for(let y=0;y<height;y++){
    const row=y*width*4;
    let first=0,last=width-1;
    while(first<width&&rgba[row+first*4+3]===0)first++;
    if(first===width)continue;
    while(last>first&&rgba[row+last*4+3]===0)last--;
    left=Math.min(left,first);right=Math.max(right,last);
    top=Math.min(top,y);bottom=y;
  }
  return right<left?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
}
