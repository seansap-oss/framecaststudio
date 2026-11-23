'use strict';
// Only seek sources visible at this timeline position. Inactive decoders may remain
// in a seeking state after playback, but must never block the final render.
const FrameCastFrameSeek={
 active(clips,assets,layers,at){
  const videos=new Map();
  const main=clips.find(c=>at>=c.at&&at<c.at+c.duration);
  if(main)videos.set(main.media,(main.trimIn||0)+at-main.at);
  for(const [key,media] of Object.entries(assets)){
   const l=layers[key];if(media?.tagName!=='VIDEO'||!l||l.removed||!l.visible||at<l.start||(l.end&&at>=l.end))continue;
   if(!videos.has(media))videos.set(media,l.kind==='video'?at-l.start+(l.trimIn||0):(at-l.start)%media.duration);
  }
  return videos;
 },
 seek(media,target,signal){
  if(!Number.isFinite(media.duration)||media.duration<=0)throw Error('Unreadable source video');
  target=Math.max(0,Math.min(target,Math.max(0,media.duration-.001)));
  if(!media.seeking&&media.readyState>=2&&Math.abs(media.currentTime-target)<.0005)return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cleanup();reject(Error('Source video seek timed out at '+target.toFixed(2)+'s. Check that this file plays and seeks in Chrome.'))},20000);
   function cleanup(){clearTimeout(timer);media.removeEventListener('seeked',done);media.removeEventListener('error',fail);signal?.removeEventListener('abort',cancel)}
   function done(){if(media.seeking)return;cleanup();media.readyState>=2?resolve():reject(Error('Source video has no decoded frame at '+target.toFixed(2)+'s'))}
   function fail(){cleanup();reject(Error('Video decode failed during export'))}
   function cancel(){cleanup();reject(Error('Render cancelled'))}
   media.addEventListener('seeked',done);media.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',cancel,{once:true});
   try{if(!media.seeking||Math.abs(media.currentTime-target)>.0005)media.currentTime=target}
   catch(e){cleanup();reject(Error('Cannot seek source video · '+e.message))}
  });
 }
};
if(typeof module!=='undefined'&&module.exports)module.exports=FrameCastFrameSeek;
