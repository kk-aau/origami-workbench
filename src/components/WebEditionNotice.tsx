import {DESKTOP_DOWNLOAD,appAsset} from '../app/webRuntime';
import './WebEditionNotice.css';
export default function WebEditionNotice(){return <details className="web-edition-notice">
  <summary><strong>网页版 · 本地计算</strong><span>工程保存在当前浏览器</span><span className="web-edition-more">使用范围与保存说明</span></summary>
  <div><p>支持折痕编辑、平折、折序绘图、三维模拟和动画。计算与工程保存在此浏览器，不上传服务器；清除网站数据会删除本地文档，请用“保存完整作品”或导出工程文件保留备份。</p>
  <p>同一浏览器同时使用一个工作台标签页。基础形设计、镶嵌和部分高级构造需要桌面版。网页版 PDF 为 300 dpi 图像页面；矢量 CP 可导出 SVG。</p>
  <a href={DESKTOP_DOWNLOAD} target="_blank" rel="noreferrer">下载完整桌面版</a><a href="https://github.com/kk-aau/origami-workbench" target="_blank" rel="noreferrer">源码与反馈</a><a href={appAsset('origami-web-source.zip')}>本次网页版对应源码</a><a href={appAsset('legal/THIRD_PARTY_NOTICES.md')} target="_blank" rel="noreferrer">许可声明</a></div>
</details>;}
