'use strict';
// Rasterize typography once; let FFmpeg move ticker textures and encode the source directly.
const fastToggle=document.createElement('label');
fastToggle.innerHTML='<input id="fastExport" type="checkbox" checked> Fast local export when compatible (one video, titles and tickers)';
$('progress').before(fastToggle);
let nativeExport=false,fastExportReason="";
function rejectNative(reason){fastExportReason=reason;return null}
function fastCandidate(settings){
 fastExportReason='';
 if(settings.format!=='mp4'||settings.codec!=='h264')return rejectNative('Choose MP4 and H.264 for native export.');
 if($('keyOn').checked||background||transitions.size)return rejectNative('Chroma key, a backdrop image, or transitions require the full compositor.');
 const visible=Object.entries(layers).filter(([,l])=>!l.removed&&l.visible&&l.kind!=='audio'&&l.start<settings.end&&(l.end||total())>settings.start);
 const video=visible.filter(([id,l])=>l.kind==='video'&&assets[id]?.tagName==='VIDEO');
 if(video.length!==1)return rejectNative("Native export needs one visible video in this range; found "+video.length+".");
 const [id,l]=video[0],media=assets[id];
 if(l.x!==0||l.y!==0||l.w!==100||l.h!==100||l.grade||l.opacity!==100||l.layout==='Split 50:50'||l.rotation||l.flip||l.animation&&l.animation!=='None')return rejectNative('Video '+(l.name||id)+' has resizing, cropping, grading or animation.');
 if(settings.start<l.start||settings.end>(l.end||total())||settings.end>l.start+media.duration-(l.trimIn||0)+.01)return rejectNative('The export range extends outside video '+(l.name||id)+'. Select a range within the clip.');
 const audio=renderAudioSources().filter(a=>!a.mute&&a.volume>0&&a.start<settings.end&&a.end>settings.start);
 if(settings.audio.some(a=>layers[a.id]?.points?.length))return rejectNative('Audio volume keyframes require the full compositor.');
 const overlays=visible.slice(visible.findIndex(([key])=>key===id)+1);
 for(const [key,g] of overlays){
  if(g.kind==='video'||assets[key]?.tagName==='VIDEO'||g.grade||g.rotation||g.flip||g.animation&&g.animation!=='None'||g.imageEffect&&g.imageEffect!=='None'||g.imageEntrance&&g.imageEntrance!=='None'||g.imageExit&&g.imageExit!=='None'||animatedGifAssets.has(assets[key]))return rejectNative('Layer '+(g.name||key)+' has an effect or animated image requiring the full compositor.');
  if(key==='Watermark'&&g.direction!=='Static')return rejectNative('The moving watermark requires the full compositor.');
  if(g.direction!=='Static'&&(assets[key]||g.w*monitor.width/100<1||g.h*monitor.height/100<1))return rejectNative('Layer '+(g.name||key)+' has unsupported asset motion or dimensions.');
 }
 return {id,media,overlays,sourceIn:(l.trimIn||0)+settings.start-l.start};
}
function canvasBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Cannot prepare graphic texture')),'image/png'))}
async function nativeGraphics(candidate,settings){
 const prepared=[],uploads=[],W=monitor.width,H=monitor.height,old=time;
 try{for(const [key,l] of candidate.overlays){
  const i=prepared.length,base={start:l.start,end:l.end||total(),x:0,y:0};
  if(l.direction==='Static'||!l.direction){
   time=Math.max(settings.start,l.start);ctx.clearRect(0,0,W,H);drawTransitionLayer(key,l);
   uploads.push(['graphic-'+i,await canvasBlob(monitor)]);prepared.push({...base,kind:'static'});continue;
  }
  const w=Math.max(1,Math.round(W*l.w/100)),h=Math.max(1,Math.round(H*l.h/100));
  const messages=Array.isArray(l.messages)&&l.messages.length?l.messages:null;
  const lines=(messages?messages.map(m=>m.text):l.text.split('\n')).filter(Boolean);
  const font='bold '+W*l.size/100+'px '+l.font;
  const texture=document.createElement('canvas'),bg=document.createElement('canvas');bg.width=w;bg.height=h;
  const b=bg.getContext('2d');b.globalAlpha=l.opacity/100;b.fillStyle=l.fill;b.fillRect(0,0,w,h);
  let item={...base,x:W*l.x/100,y:H*l.y/100,width:w,height:h,repeat:l.repeat};
  if(l.direction.startsWith('Scroll')){
   const content=messages?messages.map(m=>m.text+(m.icon?' '+m.icon:'')+' '+(m.separator??l.emoji)).join(' '):lines.join(' '+l.emoji+' ')+' '+l.emoji+' ';
   const measure=texture.getContext('2d');measure.font=font;const textWidth=measure.measureText(content).width;
   texture.width=Math.max(1,Math.ceil(textWidth)+8);texture.height=h;
   if(texture.width>16384)throw Error('Ticker texture exceeds native limit');
   const c=texture.getContext('2d');c.font=font;c.textBaseline='middle';c.fillStyle=l.ink;c.globalAlpha=l.opacity/100;c.fillText(content,0,h/2);
   item={...item,kind:'horizontal',textWidth,speed:l.speed*W/100,direction:l.direction==='Scroll left'?'left':'right'};
  }else{
   const list=messages?messages.filter(m=>m.text).map(m=>m.text+(m.icon?' '+m.icon:'')):lines;
   if(!list.length)list.push('');texture.width=w;texture.height=h*list.length;
   if(texture.height>16384||list.length>128)throw Error('Ticker texture exceeds native limit');
   const c=texture.getContext('2d');c.font=font;c.textBaseline='middle';c.fillStyle=l.ink;c.globalAlpha=l.opacity/100;
   list.forEach((text,index)=>{c.save();c.beginPath();c.rect(0,index*h,w,h);c.clip();c.fillText(text,w*.035,index*h+h/2,w*.94);c.restore()});
   item={...item,kind:'vertical',count:list.length,travel:Math.max(.1,h/(l.speed*H/100)),hold:l.hold,direction:l.direction==='Enter from bottom'?'up':'down'};
  }
  uploads.push(['graphic-'+i,await canvasBlob(texture)],['background-'+i,await canvasBlob(bg)]);prepared.push(item);
 }}finally{time=old;draw()}
 return {prepared,uploads};
}
const regularRender=render;
render=async function(){
 const range=ranges.find(x=>String(x.id)===$('rangeChoice').value);
 renderStart=range?.start??0;renderEnd=range?.end??null;await bridgeReady;
 if(!$('fastExport').checked||!bridgeInfo.ffmpeg||busy)return regularRender();
 dimensions();const settings=fixedSettings(),candidate=fastCandidate(settings);
 if(!candidate){jobs=[];jobSet=[];const message='Native export unavailable: '+fastExportReason+' No render started. To deliberately use the slower renderer, uncheck Fast local export.';$('jobStatus').value=message;notify(message);return}
 stop();fixedCancel=false;fixedPaused=false;fixedRequest=new AbortController();startExportClock();nativeExport=true;
 let id=null,ok=false,reason='';
 try{
  lock(true);$('jobStatus').value='Preparing native video and ticker export';
  settings.visual=[{id:candidate.id}];settings.sourceIn=candidate.sourceIn;
  settings.width=monitor.width;settings.height=monitor.height;settings.background=$('back').value;
  const {prepared,uploads}=await nativeGraphics(candidate,settings);settings.nativeLayers=prepared;settings.nativeCrop=!!layers[candidate.id].crop;
  const started=await fixedJson('/api/render/start',JSON.stringify(settings),fixedRequest.signal);id=fixedSession=started.id;
  const sourceUploads=[];
  const sources=new Map(renderAudioSources().map(a=>[a.id,a.url]));sources.set(candidate.id,candidate.media.currentSrc||candidate.media.src);
  for(const [key,url] of sources){await fixedGate();sourceUploads.push(['source/'+id+'/'+key,await(await fetch(url,{signal:fixedRequest.signal})).blob()])}
  for(const [path,blob] of [...sourceUploads,...uploads.map(([name,blob])=>['native-asset/'+id+'/'+name,blob])]){
   await fixedGate();const response=await fetch('/api/render/'+path,{method:'POST',body:blob,signal:fixedRequest.signal});
   if(!response.ok)throw Error((await response.json()).error||'Media preparation failed');
  }
  await fixedJson('/api/render/native-start/'+id,'{}',fixedRequest.signal);
  let result;
  while(true){
   if(fixedCancel)throw Error('Render cancelled');
   const r=await fetch('/api/render/native-status/'+id,{signal:fixedRequest.signal});result=await r.json();if(!r.ok)throw Error(result.error||'Cannot read export progress');
   if(result.state==='Failed')throw Error(result.error);if(result.state==='Complete')break;
   if(result.state==='Rendering'&&!fixedPaused)exportClock.update(result.frames,result.total);
   if(['Finalizing','Verifying'].includes(result.state))exportClock.state='Finalizing';
   let stages=$('exportStages');if(!stages){stages=el('p');stages.id='exportStages';stages.className='helpText';$('jobStatus').after(stages)}
   stages.textContent=Object.entries(result.timings||{}).map(([name,seconds])=>name+': '+Math.round(seconds)+'s').join(' · ');
   const percent=Math.min(99,Math.floor(result.frames/result.total*95));$('progress').value=percent;
   $('jobStatus').value=(fixedPaused?'Paused':result.state==='Finalizing'?(result.stage||'Finalizing')+' · '+Math.floor(result.finalSeconds||0)+'s processed':'Native '+result.state.toLowerCase())+' · '+percent+'% · '+(result.encoder||'preparing');
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  if($('exportStages'))$('exportStages').textContent=Object.entries(result.timings||{}).filter(([name])=>name!=='Complete').map(([name,seconds])=>name+': '+Math.round(seconds)+'s').join(' · ');
  fixedResult(result,settings);ok=true;$('jobStatus').value='Verified '+result.frames+' frames · '+result.encoder+' · download ready';notify('Native ticker export finished');
 }catch(e){reason=fixedCancel?'Render cancelled':'Render failed · '+e.message;notify(reason);if(!fixedCancel)await renderDiagnostics(id,reason)}
 finally{
  endExportClock(ok);if(id)fetch('/api/render/cancel/'+id,{method:'POST',body:'{}'}).catch(()=>{});
  nativeExport=false;fixedSession=null;fixedRequest=null;fixedPaused=false;fixedResume?.();fixedResume=null;renderStart=0;renderEnd=null;lock(false);finishJob(ok);if(!ok)$('jobStatus').value=reason;
 }
};
const framePause=$('pauseRender').onclick;
$('pauseRender').onclick=async()=>{
 if(!nativeExport)return framePause();
 if(!fixedSession)return;
 try{const paused=!fixedPaused;await fixedJson('/api/render/native-pause/'+fixedSession,JSON.stringify({paused}),fixedRequest.signal);fixedPaused=paused;exportClock.pause(paused);paintExportClock();$('pauseRender').textContent=paused?'Resume render':'Pause render'}catch(e){notify(e.message)}
};
$('render').onclick=render;
