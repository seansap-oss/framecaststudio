'use strict';
// Local export steps the existing compositor through exact timeline timestamps.
// Browser-only exports retain the old real-time recorder as a compatibility fallback.
let fixedSession=null, fixedPaused=false, fixedResume=null, fixedCancel=false, fixedRequest=null;

function renderAudioSources(){
 return Object.entries(assets).flatMap(([id,media])=>{
  const l=layers[id];
  if(!l||l.removed||!['video','audio'].includes(l.kind)||!media?.src)return [];
  return [{id,start:l.start,end:l.end||total(),sourceIn:l.trimIn||0,
   volume:l.volume??100,mute:!!l.muted,bus:l.bus||'clip',url:media.currentSrc||media.src}];
 });
}
function renderVisualSources(){
 return Object.entries(assets).filter(([id,media])=>{
  const layer=layers[id];
  return media?.tagName==='VIDEO'&&layer&&!layer.removed&&media.src;
 }).map(([id,media])=>({id,media,url:media.currentSrc||media.src}));
}
function fixedSettings(){
 const start=renderStart,end=renderEnd??total();
 return {start,end,fps:+$('exportFps').value,format:$('container').value.toLowerCase(),
  quality:$('quality').value,speed:$('encodingSpeed').value,codec:$('videoCodec').value,audio:renderAudioSources().map(({url,...rest})=>rest),
  visual:renderVisualSources().map(({id})=>({id})),
  clip:+$('Clip').value,bed:+$('Bed').value,master:+$('Master').value,
  bass:+$('Bass').value,equalizer:+$('Mid').value,treble:+$('Treble').value,
  hum:parseInt($('hum').value)||0,noise:(parseInt($('noise').value)||0)*1000,
  compress:$('compress').checked,threshold:+$('threshold').value,ratio:+$('compRatio').value};
}
async function fetchFrameWithRetry(url,options){
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{return await fetch(url,options)}catch(error){
   if(options.signal.aborted)throw error;
   last=error;
   $('jobStatus').value='Reconnecting to local renderer · attempt '+(attempt+1)+' / 3';
   await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
 }
 throw last;
}
async function exactFrame(at){
 time=at;
 const videos=FrameCastFrameSeek.active(clips,assets,layers,at);
 const replacements=new Map();
 const sources=renderVisualSources();
 try{
 for(const [media,sourceTime] of videos){
  const source=sources.find(item=>item.media===media);
  if(!source)throw Error('Video source missing from local renderer');
  const safeTime=Math.max(0,Math.min(sourceTime,media.duration-1/(+$('exportFps').value)));
  const response=await fetchFrameWithRetry('/api/render/video/'+fixedSession+'/'+encodeURIComponent(source.id)+'?t='+encodeURIComponent(safeTime),{signal:fixedRequest.signal}).catch(error=>{if(fixedCancel)throw error;throw Error('Local video connection failed for '+(layers[source.id]?.name||source.id)+' at '+safeTime.toFixed(3)+'s. Check the Python terminal; save its error message. '+error.message)});
  if(!response.ok){const error=await response.json();throw Error(error.error||'Source frame decode failed')}
  const url=URL.createObjectURL(await response.blob());
  try{
   const image=new Image();image.src=url;await image.decode();
   image.readyState=4;
   replacements.set(media,{image,url});
  }catch(e){URL.revokeObjectURL(url);throw e}
 }
 if(typeof prepareAnimatedImages==='function')await prepareAnimatedImages(at);
  if(fixedCancel)throw Error('Render cancelled');
  // Substitute decoded FFmpeg frames just while composing this timeline timestamp.
  for(const clip of clips)if(replacements.has(clip.media))clip.media=replacements.get(clip.media).image;
  for(const [key,media] of Object.entries(assets))if(replacements.has(media))assets[key]=replacements.get(media).image;
  draw();
  return await new Promise((resolve,reject)=>monitor.toBlob(blob=>blob?resolve(blob):reject(Error('Frame encoding failed')),'image/png'));
 }finally{
  for(const [old,{image,url}] of replacements){
   for(const clip of clips)if(clip.media===image)clip.media=old;
   for(const [key,media] of Object.entries(assets))if(media===image)assets[key]=old;
   URL.revokeObjectURL(url);
  }
 }
}
async function fixedJson(path,body,signal){
 const response=await fetch(path,{method:'POST',body,signal,headers:body instanceof Blob?{}:{'Content-Type':'application/json'}});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||response.statusText);
 return result;
}
async function fixedGate(){
 if(fixedCancel)throw Error('Render cancelled');
 if(fixedPaused)await new Promise(resolve=>fixedResume=resolve);
 if(fixedCancel)throw Error('Render cancelled');
}
async function sendFrames(id,frames){
 const parts=[];
 for(const blob of frames){const size=new ArrayBuffer(4);new DataView(size).setUint32(0,blob.size);parts.push(size,blob)}
 const response=await fetch('/api/render/frames/'+id,{method:'POST',body:new Blob(parts,{type:'application/octet-stream'}),signal:fixedRequest.signal});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Frame upload failed');
}
function fixedResult(data,settings){
 const format=settings.format,ratio=currentRatio,codec=settings.codec;
 const link=el('a');link.href='/media/'+data.id;link.download=($('postTitle').value.trim()||'FrameCast').replace(/[<>:"/\\|?*]/g,'_')+'-'+ratio.replace(':','x')+'-'+$('resolution').value+'-'+codec+'.'+format;
 link.textContent='Download '+link.download+' ('+(data.bytes/1048576).toFixed(1)+' MB)';
 const box=el('div');box.append(link);$('results').append(box);$('downloads').replaceChildren(link.cloneNode(true));
 const targets=Array.from($('destinations').children).filter(l=>l.firstChild.checked&&l.lastChild.value===ratio).map(l=>l.children[1].textContent).filter(d=>d!=='WhatsApp');
 if(format==='mp4'&&codec==='h264'&&targets.length)buildPublishControls(box,data.id,targets,ratio);
}
const realTimeRender=render;
render=async function(){
 const r=ranges.find(x=>String(x.id)===$('rangeChoice').value);
 renderStart=r?.start??0;renderEnd=r?.end??null;
 await bridgeReady;
 if(!bridge||!bridgeInfo.ffmpeg||!bridgeInfo.fixedFrames)return realTimeRender();
 if(busy||!total())return;
 stop();fixedCancel=false;fixedPaused=false;fixedRequest=new AbortController();
 let id=null,ok=false,reason='';
 try{
  const settings=fixedSettings();if(!settings.codec)throw Error('Select an available FFmpeg codec');
  lock(true);dimensions();
  const started=await fixedJson('/api/render/start',JSON.stringify(settings),fixedRequest.signal);
  id=fixedSession=started.id;
  const sources=[...new Map([...renderAudioSources(),...renderVisualSources()].map(source=>[source.id,source])).values()];
  for(const source of sources){
   await fixedGate();
   $('jobStatus').value='Preparing audio source · '+source.id;
   const blob=await (await fetch(source.url,{signal:fixedRequest.signal})).blob();
   const response=await fetch('/api/render/source/'+id+'/'+source.id,{method:'POST',body:blob,signal:fixedRequest.signal});
   if(!response.ok)throw Error((await response.json()).error||'Media upload failed');
  }
  const batch=[],began=performance.now();
  for(let i=0;i<started.frames;i++){
   await fixedGate();
   batch.push(await exactFrame(settings.start+i/settings.fps));
   if(batch.length===4||i===started.frames-1){await sendFrames(id,batch);batch.length=0}
   const p=Math.floor((i+1)/started.frames*95);
   $('progress').value=p;
   const remaining=Math.max(0,Math.round((performance.now()-began)/(i+1)*(started.frames-i-1)/1000));
   $('jobStatus').value='Rendering fixed frames · '+(i+1)+' / '+started.frames+' · '+p+'% · about '+fmt(remaining)+' remaining';
   notify('Rendering '+currentRatio+' · '+p+'%');
  }
  await fixedGate();
  $('jobStatus').value='Mixing audio and verifying '+started.frames+' frames…';
  // Encoding and verification can exceed the normal API request timeout.
  const result=await fixedJson('/api/render/finish/'+id,'{}',fixedRequest.signal);
  fixedResult(result,settings);ok=true;
  $('jobStatus').value='Verified '+result.frames+' frames · download ready';
  notify('Fixed-frame render finished · '+result.frames+' verified frames');
 }catch(e){
  reason=fixedCancel?'Render cancelled':'Render failed · '+e.message;
  notify(reason);
 }finally{
  if(id&&!ok)fetch('/api/render/cancel/'+id,{method:'POST',body:'{}'}).catch(()=>{});
  stop();fixedSession=null;fixedRequest=null;fixedPaused=false;fixedResume?.();fixedResume=null;
  renderStart=0;renderEnd=null;lock(false);finishJob(ok);
  if(!ok)$('jobStatus').value=reason;
 }
};
const priorPause=$('pauseRender').onclick,priorCancel=$('cancelRender').onclick;
$('pauseRender').onclick=()=>{
 if(!fixedRequest)return priorPause();
 fixedPaused=!fixedPaused;$('pauseRender').textContent=fixedPaused?'Resume render':'Pause render';
 if(!fixedPaused){fixedResume?.();fixedResume=null}
 $('jobStatus').value=fixedPaused?'Paused between frames':'Rendering fixed frames';
};
$('cancelRender').onclick=()=>{
 if(!fixedRequest)return priorCancel();
 fixedCancel=true;fixedPaused=false;fixedResume?.();fixedResume=null;
 fixedRequest?.abort();jobs=[];jobSet=[];
 if(fixedSession)fetch('/api/render/cancel/'+fixedSession,{method:'POST',body:'{}'}).catch(()=>{});
};
if(bridgeInfo.fixedFrames)$('encoderState').textContent+=' · Fixed-frame render enabled';
