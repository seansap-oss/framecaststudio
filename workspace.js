'use strict';
let timelineZoom=1;
const timelineTools=el('div');timelineTools.className='actions timelineTools';
timelineTools.innerHTML='<label><input id="snapEnabled" type="checkbox" checked> Snap</label><button id="zoomOut">−</button><input id="zoomTimeline" aria-label="Timeline zoom" type="range" min="1" max="20" step=".5" value="1"><button id="zoomIn">＋</button><output id="snapStatus">30 fps</output>';
$('timeline').firstElementChild.append(timelineTools);
const scrollTime=el('div');scrollTime.className='scrollTime';$('tracks').before(scrollTime);scrollTime.append($('tracks'));
function frameTime(t){const frames=Math.round(t*30);return fmt(Math.floor(frames/30)).slice(0,8)+':'+String(frames%30).padStart(2,'0')}
function buildRuler(ruler,span){
 const pixels=Math.max(300,scrollTime.clientWidth*timelineZoom-180);
 const secondsPerLabel=span/(pixels/100);
 const step=[1/30,2/30,5/30,.5,1,2,5,10,30,60,300,600,1800,3600].find(s=>s>=secondsPerLabel)||3600;
 for(let t=0;t<span;t+=step){const tick=el('small',frameTime(t));tick.style.left=t/span*100+'%';ruler.append(tick)}
}
function zoomTimeline(value){timelineZoom=clamp(value,1,20);$('zoomTimeline').value=timelineZoom;timeline()}
$('zoomTimeline').oninput=()=>zoomTimeline(+$('zoomTimeline').value);
$('zoomIn').onclick=()=>zoomTimeline(timelineZoom+1);$('zoomOut').onclick=()=>zoomTimeline(timelineZoom-1);
function clearSnap(){document.querySelectorAll('.snapLine').forEach(n=>n.remove());$('snapStatus').value='30 fps'}
function snapRange(key,state,mode,span,width,bypass){
 clearSnap();
 const frame=1/30;
 if(mode==='move')state.start=Math.max(0,Math.round(state.start/frame)*frame);
 if(!$('snapEnabled').checked||bypass||mode==='slip')return state;
 const targets=[0,time,...Object.entries(layers).filter(([k,l])=>k!==key&&!l.removed).flatMap(([,l])=>[l.start,l.end||total()])];
 const edges=mode==='left'?[state.start]:mode==='right'?[state.start+state.duration]:[state.start,state.start+state.duration];
 let best=null;
 for(const edge of edges)for(const target of targets){const delta=target-edge;if(Math.abs(delta)<=span/width*9&&(!best||Math.abs(delta)<Math.abs(best.delta)))best={delta,target}}
 if(!best)return state;
 const next={...state};
 if(mode==='move')next.start+=best.delta;
 if(mode==='right')next.duration+=best.delta;
 if(mode==='left'){next.start+=best.delta;next.duration-=best.delta;next.source+=best.delta}
 if(next.start<0||next.source<0||next.duration<MIN_LENGTH||next.source+next.duration>(assets[key]?.duration||Infinity)+.001)return state;
 for(const lane of $('tracks').querySelectorAll('.lane')){const guide=el('span');guide.className='snapLine';guide.style.left=best.target/span*100+'%';lane.append(guide)}
 $('snapStatus').value='SNAP '+frameTime(best.target);return next;
}

// Per-layer processing is shared by preview and the recorded canvas.
const gradeDefaults={exposure:0,brightness:0,contrast:0,highlights:0,shadows:0,temperature:0,tint:0,saturation:0,hue:0,lift:0,gamma:1,gain:1,red:1,green:1,blue:1};
icons.Color='◉';
tool('Color','left','<b id="gradeName">Select a video or image</b><div class="actions"><button id="gradeReset">Reset</button><button id="gradeCopy">Copy grade</button><button id="gradePaste">Paste grade</button><label><input type="checkbox" id="gradeBefore"> Before</label></div><div id="gradeBasic"></div><details><summary>Pro · RGB and tonal range</summary><div id="gradePro"></div></details><div class="actions"><button id="gradeNeutral">Neutral</button><button id="gradeWarm">Warm</button><button id="gradeCool">Cool</button></div>',true);
const gradeSpecs={exposure:[-2,2,.05],brightness:[-50,50,1],contrast:[-80,80,1],highlights:[-100,100,1],shadows:[-100,100,1],temperature:[-100,100,1],tint:[-100,100,1],saturation:[-100,100,1],hue:[-180,180,1],lift:[-.2,.2,.01],gamma:[.2,3,.05],gain:[.2,3,.05],red:[0,2,.05],green:[0,2,.05],blue:[0,2,.05]};
let copiedGrade=null;
for(const [name,[min,max,step]] of Object.entries(gradeSpecs)){
 const label=el('label');label.className='row';const title=el('span',name[0].toUpperCase()+name.slice(1)),input=el('input'),value=el('output');
 input.type='range';input.min=min;input.max=max;input.step=step;input.id='grade-'+name;input.value=gradeDefaults[name];value.value=input.value;
 input.oninput=()=>{const l=layers[selectedLayer];if(!l)return;l.grade={...gradeDefaults,...l.grade,[name]:+input.value};value.value=input.value};
 label.append(title,input,value);$(Object.keys(gradeSpecs).indexOf(name)<9?'gradeBasic':'gradePro').append(label)
}
function inspectGrade(){
 const l=layers[selectedLayer];$('gradeName').textContent=l?.name||'Select a video or image';
 for(const [name,defaultValue] of Object.entries(gradeDefaults)){const input=$('grade-'+name);input.value=l?.grade?.[name]??defaultValue;input.nextElementSibling.value=input.value}
}
const previousChoose=chooseLayer;
chooseLayer=function(key){previousChoose(key);inspectGrade()};
$('gradeReset').onclick=()=>{if(layers[selectedLayer]){delete layers[selectedLayer].grade;inspectGrade()}};
$('gradeCopy').onclick=()=>{copiedGrade={...gradeDefaults,...layers[selectedLayer]?.grade};notify('Grade copied')};
$('gradePaste').onclick=()=>{if(copiedGrade&&layers[selectedLayer]){layers[selectedLayer].grade={...copiedGrade};inspectGrade()}};
for(const [id,temp] of [['Neutral',0],['Warm',20],['Cool',-20]])$('grade'+id).onclick=()=>{if(layers[selectedLayer]){layers[selectedLayer].grade={...gradeDefaults,temperature:temp};inspectGrade()}};
const gradedCanvas=document.createElement('canvas'),gradedContext=gradedCanvas.getContext('2d',{willReadFrequently:true});
const processedFrames=new WeakMap();
function gradePixel(rgb,g){
 const lum=(rgb[0]+rgb[1]+rgb[2])/3;
 return rgb.map((n,c)=>{
  let v=n*Math.pow(2,g.exposure);
  v+=(g.shadows/100)*.3*(1-lum)**2+(g.highlights/100)*.3*lum**2;
  v=(v-.5)*(1+g.contrast/100)+.5+g.brightness/100;
  v+=c===0?g.temperature/600:c===2?-g.temperature/600:-g.tint/600;
  v=(v+g.lift)*g.gain*[g.red,g.green,g.blue][c];
  return clamp(Math.pow(Math.max(0,v),1/g.gamma),0,1)
 })
}
function processedAsset(asset,g){
 const stamp=asset.currentTime??0,signature=JSON.stringify(g),cached=processedFrames.get(asset);
 if(cached&&cached.stamp===stamp&&cached.signature===signature&&cached.width===monitor.width)return cached.canvas;
 const sw=asset.videoWidth||asset.naturalWidth,sh=asset.videoHeight||asset.naturalHeight;if(!sw||!sh)return asset;
 const scale=Math.min(1,Math.max(monitor.width,monitor.height)/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
 const canvas=cached?.canvas||document.createElement('canvas');
 canvas.width=w;canvas.height=h;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(asset,0,0);
 const pixels=c.getImageData(0,0,w,h),d=pixels.data;
 for(let i=0;i<d.length;i+=4){const rgb=gradePixel([d[i]/255,d[i+1]/255,d[i+2]/255],g);d[i]=rgb[0]*255;d[i+1]=rgb[1]*255;d[i+2]=rgb[2]*255}
 c.putImageData(pixels,0,0);canvas.naturalWidth=w;canvas.naturalHeight=h;canvas.readyState=4;
 processedFrames.set(asset,{stamp,signature,canvas,width:monitor.width});return canvas;
}
function graphic(key,l){
 const g=l.grade,asset=assets[key];
 if(!g||($('gradeBefore').checked&&key===selectedLayer&&!busy)){graphicRaw(key,l);return}
 const grade={...gradeDefaults,...g};ctx.save();ctx.filter='saturate('+(1+grade.saturation/100)+') hue-rotate('+grade.hue+'deg)';
 const eligible=asset&&['VIDEO','IMG'].includes(asset.tagName)&&(asset.tagName!=='VIDEO'||asset.readyState>=2);
 try{
  if(eligible){const result=processedAsset(asset,grade);assets[key]=result;graphicRaw(key,l)}
  else graphicRaw(key,l);
 }finally{if(eligible)assets[key]=asset;ctx.restore()}
}

// Local project files retain media, timing, grades and transitions.
const projectActions=el('div');projectActions.className='actions';
projectActions.innerHTML='<button id="saveProject">Save project</button><button id="loadProject">Open project</button><input hidden type="file" id="projectFile" accept=".json"><button id="pngExport">Export graphic PNG</button>';
panels.Media.querySelector('.content').append(projectActions);
function downloadBlob(blob,name){const a=el('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000)}
$('saveProject').onclick=async()=>{
 try{
  const media={};for(const [key,asset] of Object.entries(assets)){
   if(asset.srcObject)continue;
   const blob=await(await fetch(asset.src)).blob();
   media[key]=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({kind:asset.tagName.toLowerCase(),url:reader.result});reader.onerror=reject;reader.readAsDataURL(blob)});
  }
  downloadBlob(new Blob([JSON.stringify({version:9,layers,media,transitions:[...transitions],framing,ratio:currentRatio})],{type:'application/json'}),'FrameCast-project.json');notify('Project saved with embedded media')
 }catch(e){notify('Save failed · '+e.message)}
};
$('loadProject').onclick=()=>$('projectFile').click();
$('projectFile').onchange=async e=>{
 try{
  const file=e.target.files[0];if(!file)return;const data=JSON.parse(await file.text());if(data.version!==9||!data.layers||!data.media)throw Error('Choose a FrameCast v0.9 project');
  const media={};for(const [key,item] of Object.entries(data.media)){if(!['video','audio','img'].includes(item.kind)||!item.url.startsWith('data:'))throw Error('Invalid media');media[key]=item.kind==='img'?await loadImage(item.url):await loadMedia(item.url,item.kind)}
  stop();for(const key of Object.keys(layers)){discard(key)}Object.assign(layers,data.layers);Object.assign(assets,media);
  serial=Math.max(0,...Object.keys(layers).map(k=>Number(k.replace('insert-',''))||0));transitions.clear();for(const [key,value] of data.transitions||[])transitions.set(key,value);
  framing=data.framing||{};currentRatio=data.ratio||'16:9';$('ratio').value=currentRatio;demo=false;rebuildOptions(Object.keys(layers)[0]);chooseLayer(Object.keys(layers)[0]);timeline();dimensions();seek(0);notify('Project opened')
 }catch(error){notify('Open failed · '+error.message)}finally{e.target.value=''}
};
$('pngExport').onclick=()=>{
 if(!selectedLayer||!layers[selectedLayer])return notify('Select a graphic layer first');
 stop();ctx.clearRect(0,0,monitor.width,monitor.height);graphic(selectedLayer,{...layers[selectedLayer],visible:true,start:0,end:0});
 monitor.toBlob(blob=>{if(blob)downloadBlob(blob,'FrameCast-graphic.png');draw()},'image/png')
};

// Live production uses a dedicated canvas and source mix.
const workspaceNav=el('div');workspaceNav.className='actions workspaceNav';
for(const name of ['Edit','Live','Signage']){const b=el('button',name);b.onclick=()=>setWorkspace(name);workspaceNav.append(b)}
document.querySelector('header').insertBefore(workspaceNav,$('reset'));
const live=el('section');live.id='liveWorkspace';live.hidden=true;
live.innerHTML='<aside><h3>Sources</h3><div class="actions"><button id="liveCamera">＋ Camera / mic</button><button id="liveScreen">＋ Screen share</button><button id="liveFile">＋ Video</button><input hidden type="file" id="liveMediaFile" accept="video/*"></div><div id="liveSources"></div><details><summary>Teleprompter</summary><textarea id="scriptText" placeholder="Presenter script"></textarea><label>Scroll speed <input id="scriptSpeed" type="range" min="0" max="100" value="20"></label><button id="scriptPlay">Scroll / pause</button><div id="scriptDisplay"></div></details></aside><main><div class="liveMonitors"><section><b>PREVIEW · next scene</b><canvas id="livePreview" width="960" height="540"></canvas></section><section><b>PROGRAM · recording output</b><canvas id="liveProgram" width="960" height="540"></canvas></section></div><div class="actions"><button id="takeScene" class="gold">Take</button><select id="liveLayout"><option>Solo</option><option>Side by side</option><option>Picture in picture</option></select><label>Fade <input id="liveFade" type="number" min="0" max="5" step=".1" value=".5"> s</label><label><input type="checkbox" id="liveTitles"> Project graphics</label><button id="saveScene">Save scene</button><button id="liveRecord">Record program</button><button id="stopLiveRecord" disabled>Stop recording</button></div><div id="liveScenes" class="actions"></div><output id="liveStatus">Add sources, arrange a preview, then Take.</output><div id="liveRecordings"></div></main><aside><h3>Broadcast destinations</h3><p>Local recording is available. Cloud live output and remote guests require a hosted media service.</p><button id="openPublished">Open rendered-video publishing</button><h3>Source levels</h3><div id="liveMixer"></div></aside>';
document.body.append(live);
let activeWorkspace='Edit',liveSources=[],nextScene={ids:[],layout:'Solo'},onAirScene={ids:[],layout:'Solo'},previousScene=null,fadeStart=0,liveRecorder=null,liveStream=null,liveClock=0,scriptPlaying=false;
const liveScenes=[];
let liveAnimation=null;
function setWorkspace(name){activeWorkspace=name;$('desk').hidden=name!=='Edit';live.hidden=name!=='Live';signage.hidden=name!=='Signage';if(name==='Live'&&!liveAnimation){liveAnimation=requestAnimationFrame(paintLive)}
 if(name!=='Live'&&liveRecorder?.state!=='recording')for(const src of liveSources)src.gain.gain.value=0;for(const [i,b] of [...workspaceNav.children].entries())b.classList.toggle('gold',['Edit','Live','Signage'][i]===name)}
async function addLiveSource(media,name,stream){
 await audioReady();const gain=audio.createGain();gain.connect(mix);
 if(stream){if(stream.getAudioTracks().length)audio.createMediaStreamSource(stream).connect(gain)}
 else audio.createMediaElementSource(media).connect(gain);
 media.muted=!!stream;const id=crypto.randomUUID();liveSources.push({id,media,name,stream,gain,volume:100});
 nextScene.ids.push(id);nextScene.ids=nextScene.ids.slice(-2);renderLiveSources();media.play().catch(e=>notify(e.message))
}
function renderLiveSources(){
 $('liveSources').replaceChildren();$('liveMixer').replaceChildren();
 for(const src of liveSources){
  const row=el('div');row.className='liveSource';const name=el('button',src.name);name.onclick=()=>{nextScene.ids=[src.id,...nextScene.ids.filter(id=>id!==src.id)].slice(0,2)};
  const remove=el('button','Remove');remove.onclick=()=>{if(liveRecorder?.state==='recording')return notify('Stop recording before removing a source');src.stream?.getTracks().forEach(t=>t.stop());src.media.pause();src.gain.disconnect();if(src.media.src.startsWith('blob:'))URL.revokeObjectURL(src.media.src);liveSources=liveSources.filter(s=>s!==src);nextScene.ids=nextScene.ids.filter(k=>k!==src.id);onAirScene.ids=onAirScene.ids.filter(k=>k!==src.id);renderLiveSources()};
  const thumb=el('canvas');thumb.width=240;thumb.height=135;
  if(src.media.readyState>=2)thumb.getContext('2d').drawImage(src.media,0,0,240,135);
  row.append(thumb,name,remove);$('liveSources').append(row);
  const label=el('label',src.name),level=el('input'),value=el('output',src.volume+'%');level.type='range';level.min=0;level.max=100;level.value=src.volume;
  level.oninput=()=>{src.volume=+level.value;value.value=src.volume+'%'};label.append(level,value);$('liveMixer').append(label);
 }
}
$('liveCamera').onclick=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});const media=document.createElement('video');media.srcObject=stream;media.playsInline=true;media.muted=true;await media.play();await addLiveSource(media,'Camera '+(liveSources.length+1),stream)}catch(e){$('liveStatus').value='Camera · '+e.message}};
$('liveScreen').onclick=async()=>{try{const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});const media=document.createElement('video');media.srcObject=stream;media.muted=true;await media.play();await addLiveSource(media,'Screen share',stream)}catch(e){$('liveStatus').value='Screen share · '+e.message}};
$('liveFile').onclick=()=>$('liveMediaFile').click();
$('liveMediaFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const media=await loadMedia(URL.createObjectURL(file),'video');media.loop=true;await addLiveSource(media,file.name)}catch(error){$('liveStatus').value=error.message}e.target.value=''};
$('liveLayout').onchange=()=>nextScene.layout=$('liveLayout').value;
$('takeScene').onclick=()=>{previousScene=structuredClone(onAirScene);onAirScene=structuredClone(nextScene);fadeStart=performance.now();$('liveStatus').value='On program · '+onAirScene.layout};
$('saveScene').onclick=()=>{const name=prompt('Scene name','Scene '+(liveScenes.length+1));if(!name?.trim())return;const scene={...structuredClone(nextScene),name:name.trim()};liveScenes.push(scene);const button=el('button');const thumbnail=el('canvas');thumbnail.width=192;thumbnail.height=108;paintScene(thumbnail.getContext('2d'),scene);button.append(thumbnail,el('span',scene.name));button.onclick=()=>{nextScene=structuredClone(scene);$('liveLayout').value=scene.layout};$('liveScenes').append(button)};
function paintScene(c,scene,alpha=1){
 c.save();c.globalAlpha=alpha;const w=c.canvas.width,h=c.canvas.height;
 const sources=scene.ids.map(id=>liveSources.find(s=>s.id===id)).filter(Boolean);
 for(const [i,s] of sources.entries()){
  if(s.media.readyState<2||!s.media.videoWidth)continue;
  if(i>0&&scene.layout==='Solo')continue;
  let box={x:0,y:0,w,h};
  if(scene.layout==='Side by side')box={x:i*w/2,y:0,w:w/2,h};
  if(scene.layout==='Picture in picture'&&i===1)box={x:w*.65,y:h*.08,w:w*.3,h:h*.3};
  const scale=Math.min(box.w/s.media.videoWidth,box.h/s.media.videoHeight);
  c.drawImage(s.media,box.x+(box.w-s.media.videoWidth*scale)/2,box.y+(box.h-s.media.videoHeight*scale)/2,s.media.videoWidth*scale,s.media.videoHeight*scale);
 }
 c.restore();
}
function paintLive(){
 liveAnimation=null;
 const now=performance.now(),delta=liveClock?now-liveClock:0;liveClock=now;
 const fade=clamp((now-fadeStart)/(Math.max(.001,+$('liveFade').value)*1000),0,1);
 for(const s of liveSources){
  const active=onAirScene.ids.includes(s.id)?(previousScene&&!previousScene.ids.includes(s.id)?fade:1):(previousScene?.ids.includes(s.id)?1-fade:0);
  s.gain.gain.value=active*s.volume/100;
 }
 const preview=$('livePreview').getContext('2d'),program=$('liveProgram').getContext('2d');
 for(const c of [preview,program]){c.fillStyle='#070b12';c.fillRect(0,0,c.canvas.width,c.canvas.height)}
 paintScene(preview,nextScene);if(previousScene&&fade<1)paintScene(program,previousScene);paintScene(program,onAirScene,fade);
 if(fade>=1)previousScene=null;
 if($('liveTitles').checked){
  ctx.clearRect(0,0,monitor.width,monitor.height);for(const [id,l] of Object.entries(layers))if(!l.kind||l.kind==='text'||l.kind==='image')graphic(id,l);
  program.drawImage(monitor,0,0,960,540);preview.drawImage(monitor,0,0,960,540);draw()
 }
 if(scriptPlaying)$('scriptDisplay').scrollTop+=delta/1000*+$('scriptSpeed').value;
 if(activeWorkspace==='Live'||liveRecorder?.state==='recording')liveAnimation=requestAnimationFrame(paintLive);
}
$('scriptText').oninput=()=>$('scriptDisplay').textContent=$('scriptText').value;
$('scriptPlay').onclick=()=>scriptPlaying=!scriptPlaying;
$('openPublished').onclick=()=>{setWorkspace('Edit');$('exportTop').click()};
$('liveRecord').onclick=async()=>{
 if(!onAirScene.ids.length)return $('liveStatus').value='Take a scene before recording.';
 try{
  await audioReady();stop();liveStream=$('liveProgram').captureStream(30);
  // Record only the live source bus to avoid timeline audio leaking into the program.
  const destination=audio.createMediaStreamDestination();for(const s of liveSources)s.gain.connect(destination);
  liveStream.addTrack(destination.stream.getAudioTracks()[0].clone());
  const mime=['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(v=>MediaRecorder.isTypeSupported(v));if(!mime)throw Error('This browser has no supported recorder');
  liveRecorder=new MediaRecorder(liveStream,{mimeType:mime});const chunks=[];
  liveRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  liveRecorder.onstop=()=>{for(const s of liveSources){try{s.gain.disconnect(destination)}catch{}}liveStream.getTracks().forEach(t=>t.stop());const a=el('a','Download program recording');a.href=URL.createObjectURL(new Blob(chunks,{type:mime}));a.download='FrameCast-live.'+(mime.includes('mp4')?'mp4':'webm');$('liveRecordings').append(a);$('liveStatus').value='Recording complete';$('liveRecord').disabled=false;$('stopLiveRecord').disabled=true};
  liveRecorder.onerror=e=>{$('liveStatus').value=e.error?.message||'Recording failed'};
  liveRecorder.start(1000);$('liveRecord').disabled=true;$('stopLiveRecord').disabled=false;$('liveStatus').value='Recording program locally';
 }catch(e){liveStream?.getTracks().forEach(t=>t.stop());$('liveStatus').value=e.message}
};
$('stopLiveRecord').onclick=()=>{if(liveRecorder?.state==='recording')liveRecorder.stop()};

// Local signage playlist preview with explicit scheduling.
const signage=el('section');signage.id='signageWorkspace';signage.hidden=true;
signage.innerHTML='<aside><h3>Playlist</h3><button id="signageImport">＋ Videos / images</button><input hidden type="file" id="signageFiles" multiple accept="video/*,image/*"><div id="signageItems"></div></aside><main><div id="signageScreen"></div><div class="actions"><button id="signagePlay">Play playlist</button><button id="signageStop">Stop</button><button id="signageFull">Fullscreen</button></div><output id="signageStatus">Add videos or images to begin.</output></main><aside><h3>Local schedule</h3><label>Start <input type="datetime-local" id="scheduleStart"></label><label>End <input type="datetime-local" id="scheduleEnd"></label><button id="scheduleSet">Arm schedule</button><p>This page must remain open for local scheduled playback. Remote screens require the cloud player service.</p></aside>';
document.body.append(signage);
let playlist=[],playlistIndex=0,playlistTimer=null,playlistRunning=false,schedule=null;
$('signageImport').onclick=()=>$('signageFiles').click();
function drawPlaylist(){
 $('signageItems').replaceChildren();
 playlist.forEach((item,i)=>{const row=el('div');row.className='playlistRow';const name=el('input');name.value=item.name;name.onchange=()=>item.name=name.value;
  const duration=el('input');duration.type='number';duration.min=1;duration.value=item.seconds;duration.title='Seconds';duration.onchange=()=>item.seconds=Math.max(1,+duration.value||5);
  const up=el('button','↑');up.onclick=()=>{stopPlaylist();if(i){[playlist[i-1],playlist[i]]=[playlist[i],playlist[i-1]];drawPlaylist()}};
  const remove=el('button','×');remove.onclick=()=>{stopPlaylist();item.media.pause?.();URL.revokeObjectURL(item.url);playlist.splice(i,1);drawPlaylist()};
  row.append(name,duration,up,remove);$('signageItems').append(row)
 })
}
$('signageFiles').onchange=async e=>{for(const file of e.target.files){const url=URL.createObjectURL(file);try{const video=file.type.startsWith('video/');const media=video?await loadMedia(url,'video'):await loadImage(url);playlist.push({name:file.name,media,url,seconds:video?media.duration:5})}catch(error){URL.revokeObjectURL(url);notify(error.message)}}e.target.value='';drawPlaylist()};
function stopPlaylist(){playlistRunning=false;clearTimeout(playlistTimer);for(const item of playlist)item.media.pause?.();$('signageStatus').value='Stopped'}
function showPlaylistItem(){
 if(!playlistRunning||!playlist.length)return;
 for(const item of playlist)item.media.pause?.();
 const item=playlist[playlistIndex%playlist.length];$('signageScreen').replaceChildren(item.media);if(item.media.play){item.media.currentTime=0;item.media.play().catch(e=>{$('signageStatus').value=e.message})}
 $('signageStatus').value=item.name+' · '+item.seconds.toFixed(1)+' s';
 playlistTimer=setTimeout(()=>{playlistIndex++;showPlaylistItem()},item.seconds*1000)
}
$('signagePlay').onclick=()=>{stopPlaylist();playlistRunning=true;playlistIndex=0;showPlaylistItem()};
$('signageStop').onclick=()=>{schedule=null;stopPlaylist()};
$('signageFull').onclick=()=>$('signageScreen').requestFullscreen().catch(e=>notify(e.message));
$('scheduleSet').onclick=()=>{
 const start=new Date($('scheduleStart').value).getTime(),end=new Date($('scheduleEnd').value).getTime();
 if(!playlist.length||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return $('signageStatus').value='Add media and select a valid start and end.';
 schedule={start,end,started:false};$('signageStatus').value='Armed for '+new Date(start).toLocaleString()
};
setInterval(()=>{if(!schedule)return;const now=Date.now();if(now>=schedule.end){schedule=null;stopPlaylist()}else if(now>=schedule.start&&!schedule.started){schedule.started=true;playlistRunning=true;playlistIndex=0;showPlaylistItem()}},500);

// Extend project sizing while keeping each orientation's saved layer positions.
for(const value of ['4:5','21:9','Custom'])$('ratio').add(named(value,value));
const sizeControls=el('div');sizeControls.className='actions';
sizeControls.innerHTML='<label>Width <input id="customWidth" type="number" min="64" max="7680" step="2" value="1920"></label><label>Height <input id="customHeight" type="number" min="64" max="4320" step="2" value="1080"></label><button id="applyDimensions">Apply custom size</button>';
panels.Export.querySelector('.content').append(sizeControls);
dimensions=function(){
 const short=parseInt($('resolution').value),ratio=$('ratio').value;
 let width,height;
 if(ratio==='Custom'){width=clamp(+$('customWidth').value||1920,64,7680);height=clamp(+$('customHeight').value||1080,64,4320)}
 else{const [a,b]=ratio.split(':').map(Number);width=a>=b?short*a/b:short;height=a>=b?short:short*b/a}
 monitor.width=Math.round(width/2)*2;monitor.height=Math.round(height/2)*2;monitor.style.setProperty('--ar',monitor.width/monitor.height);draw()
};
$('resolution').onchange=dimensions;
$('applyDimensions').onclick=()=>switchRatio('Custom');
for(const label of $('destinations').children){for(const value of ['4:5','21:9','Custom'])label.lastChild.add(named(value,value))}

// Named template cards expose the existing saved slot data.
const templateCards=el('div');templateCards.className='templateCards';panels.Brand.querySelector('.content').append(templateCards);
async function refreshTemplateCards(){
 templateCards.replaceChildren();
 for(let i=1;i<=6;i++){const saved=await slotData(String(i)),card=el('button',saved?.name||'Template '+i+' · empty');card.style.borderColor=saved?.graphics?.[0]?.layer?.fill||'#384863';card.onclick=async()=>{$('slot').value=String(i);await slotLabels();if(saved)$('recallSlot').click();else $('slotName').focus()};templateCards.append(card)}
}
for(const id of ['saveSlot','renameSlot']){const previous=$(id).onclick;$(id).onclick=async()=>{await previous();await refreshTemplateCards()}}
refreshTemplateCards().catch(()=>{});

// Highlight the common time range of a selected video and other video layers.
const existingTimeline=timeline;
timeline=function(){
 existingTimeline();
 const selected=layers[selectedLayer];if(selected?.kind!=='video')return;
 const span=timelineSpan();
 for(const row of $('tracks').querySelectorAll('.track[data-key]')){
  const key=row.dataset.key,l=layers[key];if(key===selectedLayer||l.kind!=='video')continue;
  const start=Math.max(selected.start,l.start),end=Math.min(selected.end,l.end);if(end<=start)continue;
  const badge=el('div','Overlap '+(end-start).toFixed(2)+' s');badge.className='overlapRange';badge.style.left=start/span*100+'%';badge.style.width=(end-start)/span*100+'%';row.querySelector('.lane').append(badge)
 }
};
