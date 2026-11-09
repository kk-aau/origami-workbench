export interface BackgroundImage {
  name:string;
  dataUrl:string;
  width:number;
  height:number;
  opacity:number;
  visible:boolean;
  placement:{origin:[number,number];axis:[number,number]};
  /** Present only for screen-fixed images. CSS pixel reference camera. */
  viewport?:{x:number;y:number;units:number};
}
export const MAX_BACKGROUND_DATA_LENGTH:number;
/** Envelope validation only; image loader must also decode and verify dimensions. */
export function validateBackground(value:unknown):asserts value is BackgroundImage;
