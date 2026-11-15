'use strict';
// Static graphic compositions can be rendered in one local FFmpeg pass.
const fastToggle=document.createElement('label');
fastToggle.innerHTML='<input id="fastExport" type="checkbox" checked> Fast export when compatible (static graphics, one video)';
$('render').before(fastToggle);
function fastCandidate(settings){
 if(settings.format!=='mp4'||settings.codec!=='h264'||$('keyOn').checked||background||transitions.size)return null;
 const video=Object.entries(layers).filter(([id,l])=>!l.removed&&l.visible&&l.kind==='video'&&assets[id]?.tagName==='VIDEO');
 if(video.length!==1||clips.length!==1)return null;
 const [id,l]=video[0],media=assets[id];
 if(!l.program||l.x!==0||l.y!==0||l.w!==100||l.h!==100||l.grade||l.crop||l.opacity!==100||l.layout==='Split 50:50')return null;
 if(settings.start<l.start||settings.end>l.end||settings.end>l.start+media.duration-(l.trimIn||0))return null;
 const audio=renderAudioSources().filter(a=>!a.mute&&a.volume>0);
 if(audio.some(a=>a.id!==id)||l.volume!==100||settings.clip!==100||settings.master!==100||settings.bass||settings.equalizer||settings.treble||settings.hum||settings.noise||settings.compress)return null;
 for(const [key,g] of Object.entries(layers)){
  if(key===id||g.removed||!g.visible)continue;
  if(g.kind==='video'||g.kind==='audio'||assets[key]?.tagName==='VIDEO')return null;
  if(g.start>settings.start||(g.end&&g.end<settings.end)||g.direction!=='Static'||g.motion||g.imageMotion||g.objectAnimation&&g.objectAnimation!=="None"||g.grade)return null;
 }
 return {id,media,sourceIn:(l.trimIn||0)+settings.start-l.start};
}
async function staticOverlay(id,at){
 const old=time;time=at;ctx.clearRect(0,0,monitor.width,monitor.height);
 try{
  for(const [key,l] of Object.entries(layers))if(key!==id&&onAir(l))drawTransitionLayer(key,l);
  return await new Promise((resolve,reject)=>monitor.toBlob(blob=>blob?resolve(blob):reject(Error('Overlay image failed')),'image/png'));
 }finally{time=old;draw()}
}
const regularRender=render;
render=async function(){
 const range=ranges.find(x=>String(x.id)===$('rangeChoice').value);
 renderStart=range?.start??0;renderEnd=range?.end??null;
 await bridgeReady;
 if(!$('fastExport').checked||!bridgeInfo.ffmpeg||busy)return regularRender();
 dimensions();const settings=fixedSettings(),candidate=fastCandidate(settings);
 if(!candidate){notify('Complex project · using standard export');return regularRender()}
 stop();fixedCancel=false;fixedRequest=new AbortController();let id=null,ok=false,reason='';
 try{
  settings.visual=[{id:candidate.id}];settings.audio=[];settings.sourceIn=candidate.sourceIn;
  settings.width=monitor.width;settings.height=monitor.height;
  lock(true);$('jobStatus').value='Preparing fast export';
  const overlay=await staticOverlay(candidate.id,settings.start);
  const started=await fixedJson('/api/render/start',JSON.stringify(settings),fixedRequest.signal);
  id=fixedSession=started.id;
  const source=await(await fetch(candidate.media.currentSrc||candidate.media.src,{signal:fixedRequest.signal})).blob();
  for(const [path,blob] of [['source/'+id+'/'+candidate.id,source],['fast-overlay/'+id,overlay]]){
   const response=await fetch('/api/render/'+path,{method:'POST',body:blob,signal:fixedRequest.signal});
   if(!response.ok)throw Error((await response.json()).error||'Media preparation failed');
  }
  $('progress').value=10;$('jobStatus').value='FFmpeg encoding video and graphics · keep this tab open';
  const result=await fixedJson('/api/render/fast-finish/'+id,'{}',fixedRequest.signal);
  fixedResult(result,settings);ok=true;
  $('jobStatus').value='Fast export ready · '+result.frames+' frames · '+result.encoder;
  notify('Fast export finished · '+result.encoder);
 }catch(e){reason=fixedCancel?'Render cancelled':'Fast export failed · '+e.message;notify(reason)}
 finally{
  if(id&&!ok)fetch('/api/render/cancel/'+id,{method:'POST',body:'{}'}).catch(()=>{});
  fixedSession=null;fixedRequest=null;renderStart=0;renderEnd=null;lock(false);finishJob(ok);
  if(!ok)$('jobStatus').value=reason;
 }
};
$('render').onclick=render;
