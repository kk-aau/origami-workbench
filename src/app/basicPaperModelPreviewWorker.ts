import {buildBasicPaperModelPreviewReply,type BasicPaperModelPreviewRequest,type BasicPaperModelPreviewReply} from './basicPaperModelPreview';
const channel=globalThis as unknown as {onmessage:((event:{data:BasicPaperModelPreviewRequest})=>void)|null;postMessage:(reply:BasicPaperModelPreviewReply)=>void};
channel.onmessage=event=>channel.postMessage(buildBasicPaperModelPreviewReply(event.data));
