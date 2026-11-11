export interface HelpRect {x:number;y:number;width:number;height:number}
/** All coordinates are CSS pixels. Help never changes the canvas or CP transform. */
export function placeCanvasHelp(canvas:{w:number;h:number},paper:HelpRect,textWidth:number,headerHeight:number,top=56,open=false){
  const margin=12,gap=16,right=Math.max(margin,canvas.w-72),bottom=Math.max(top,canvas.h-60);
  const regions:HelpRect[]=[
    {x:margin,y:top,width:Math.min(right,paper.x-gap)-margin,height:bottom-top},
    {x:Math.max(margin,paper.x+paper.width+gap),y:top,width:right-Math.max(margin,paper.x+paper.width+gap),height:bottom-top},
    {x:margin,y:top,width:right-margin,height:Math.min(bottom,paper.y-gap)-top},
    {x:margin,y:Math.max(top,paper.y+paper.height+gap),width:right-margin,height:bottom-Math.max(top,paper.y+paper.height+gap)},
  ].filter(r=>r.width>=84&&r.height>=headerHeight+(open?48:0));
  const wanted=Math.min(720,textWidth);
  const room=regions.find(r=>r.width>=wanted&&r.height>=headerHeight+(open?120:0))
    ??regions.find(r=>r.height>=headerHeight+(open?120:0))
    ??regions.find(r=>r.width>=wanted)
    ??regions.sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  if(room)return{...room,width:Math.min(wanted,room.width),height:Math.min(240,room.height),compact:false};
  // When zoom covers every free region, keep only a compact overlay entry.
  // Do not shrink or pan the user's drawing to make room for help.
  return{x:margin,y:Math.max(8,Math.min(top,canvas.h-(open?210:42))),width:Math.min(open?360:110,Math.max(80,canvas.w-24)),height:open?190:30,compact:true};
}


