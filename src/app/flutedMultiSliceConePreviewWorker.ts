import {buildFlutedConePreviewReply,type FlutedConePreviewRequest,type FlutedConePreviewReply} from './flutedMultiSliceConePreview';
const channel=globalThis as unknown as {onmessage:((event:{data:FlutedConePreviewRequest})=>void)|null;postMessage:(reply:FlutedConePreviewReply)=>void};
channel.onmessage=event=>channel.postMessage(buildFlutedConePreviewReply(event.data));
