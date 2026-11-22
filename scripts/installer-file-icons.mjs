import fs from 'node:fs';

// A document silhouette with either a crease pattern or three numbered-step bars.
export function writeFileIcon(file, diagram) {
  const size=32, stride=size*4, maskStride=4;
  const pixels=Buffer.alloc(40+size*(stride+maskStride));
  pixels.writeUInt32LE(40); pixels.writeInt32LE(size,4); pixels.writeInt32LE(size*2,8);
  pixels.writeUInt16LE(1,12); pixels.writeUInt16LE(32,14);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const row=size-y-1;
    if(x<4||x>27||y<1||y>30||x-y>18){
      pixels[40+size*stride+row*maskStride+(x>>3)]|=0x80>>(x%8);
      continue;
    }
    const base=diagram?[54,106,75]:[49,90,147];
    const mark=diagram?([12,18,24].includes(y)&&x>=9&&x<=22):
      (x>=8&&x<=23&&y>=10&&y<=25&&(x===15||y===17||x-y===-2||x+y===33));
    const [r,g,b]=mark?[255,255,255]:base;
    const i=40+row*stride+4*x;
    pixels.set([b,g,r,255],i);
  }
  const header=Buffer.alloc(22);
  header.writeUInt16LE(1,2); header.writeUInt16LE(1,4); header[6]=size; header[7]=size;
  header.writeUInt16LE(1,10); header.writeUInt16LE(32,12);
  header.writeUInt32LE(pixels.length,14); header.writeUInt32LE(header.length,18);
  fs.writeFileSync(file,Buffer.concat([header,pixels]));
}
