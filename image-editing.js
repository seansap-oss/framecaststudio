'use strict';
// GIF frames are selected by timeline time, so offline export and scrubbing agree.
const animatedGifAssets=new WeakMap();
async function prepareGif(image,url){
 const blob=await (await fetch(url)).blob();
 if(blob.type.toLowerCase()!=='image/gif')return;
 if(typeof ImageDecoder==='undefined'||!(await ImageDecoder.isTypeSupported('image/gif')))
  throw Error('Animated GIF needs Chrome ImageDecoder. Convert this GIF to a video for this browser.');
 const decoder=new ImageDecoder({data:blob.stream(),type:'image/gif'});await decoder.tracks.ready;
 await decoder.completed;
 const count=decoder.tracks.selectedTrack.frameCount;
 if(!count||count>5000)throw Error('GIF has too many frames to preview. Convert it to a video first.');
 const ends=[];let duration=0;
 for(let i=0;i<count;i++){
  const {image:frame}=await decoder.decode({frameIndex:i});
  duration+=Math.max(10000,frame.duration||100000)/1000000;ends.push(duration);frame.close();
 }
 const item={decoder,ends,duration,cache:new Map(),pending:new Map(),last:null};animatedGifAssets.set(image,item);
 await gifFrameAt(image,0);
}
function gifIndex(item,at){
 const t=((at%item.duration)+item.duration)%item.duration;
 let low=0,high=item.ends.length-1;
 while(low<high){const mid=(low+high)>>1;if(item.ends[mid]>t)high=mid;else low=mid+1}
 return low;
}
async function gifFrameAt(image,at){
 const item=animatedGifAssets.get(image);if(!item)return image;
 const low=gifIndex(item,at);
 if(item.cache.has(low)){item.last=item.cache.get(low);return item.last}
 if(item.pending.has(low))return item.pending.get(low);
 const task=(async()=>{
  const {image:frame}=await item.decoder.decode({frameIndex:low});
  const canvas=document.createElement('canvas');canvas.width=frame.displayWidth;canvas.height=frame.displayHeight;
  canvas.getContext('2d').drawImage(frame,0,0);frame.close();
  canvas.naturalWidth=canvas.width;canvas.naturalHeight=canvas.height;canvas.readyState=4;
  item.cache.set(low,canvas);if(item.cache.size>12)item.cache.delete(item.cache.keys().next().value);
  item.last=canvas;return canvas;
 })();item.pending.set(low,task);
 try{return await task}finally{item.pending.delete(low)}
}
async function prepareAnimatedImages(at){
 await Promise.all(Object.entries(assets).map(async ([key,image])=>{
  const l=layers[key];if(l?.kind==='image'&&!l.removed&&l.visible&&at>=l.start&&(!l.end||at<l.end)&&animatedGifAssets.has(image))
   await gifFrameAt(image,at-l.start);
 }));
}
const imageImport=el('button','＋ Images');
imageImport.id='addImages';
imageImport.onclick=()=>{insertion=null;$('inserts').accept='image/*';$('inserts').click()};
$('addClips').before(imageImport);
const splitButton=el('button','Split at playhead');splitButton.id='splitClip';$('addText').before(splitButton);
async function splitSelected(){
 if(busy)return;
 const key=selectedLayer,layer=layers[key];if(!layer)return notify('Select a clip first');
 const end=layer.end||total(),at=Math.round(time*30)/30;
 if(at-layer.start<1/30||end-at<1/30)return notify('Place the playhead inside the clip');
 stop();
 try{
  const media=assets[key];let copy;
  if(media){copy=media.tagName==='IMG'?await loadImage(media.src):await loadMedia(media.src,media.tagName.toLowerCase())}
  const id=extraId(),right=structuredClone(layer);
  right.start=at;right.end=end;right.trimIn=(layer.trimIn||0)+(at-layer.start);right.name=(layer.name||key)+' · part 2';
  layer.end=at;layers[id]=right;if(copy)assets[id]=copy;
  orderAt(id,key,true);
  for(const [target,tr] of transitions)if(tr.from===key){tr.from=id}
  rebuildOptions(id);chooseLayer(id);connectInserts();timeline();seek(at);notify('Clip split · source media retained');if(typeof commitHistory==='function')commitHistory();
 }catch(error){notify('Split failed · '+error.message)}
}
splitButton.onclick=splitSelected;
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='s'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.target.closest('input,textarea,select,[contenteditable]')){e.preventDefault();splitSelected()}});
const motionControls=el('details');motionControls.id='objectMotion';motionControls.innerHTML='<summary>Image / graphic animation</summary>'+row('Motion',select('objectAnimation',['None','Fade in / out','Slide from left','Slide from right','Slide from bottom','Zoom in','Zoom out']))+row('Animation (s)',number('objectAnimationSeconds',.1,30,.1))+row('Rotation °',number('objectRotation',-180,180,1))+row('Flip horizontally',check('objectFlip'));
panels.Graphics.querySelector('.content').append(motionControls);
const imageMotion=el('details');imageMotion.id='imageMotion';imageMotion.open=true;
imageMotion.innerHTML='<summary>Image animation</summary>'+
 row('Shape',select('imageShape',['Original','Circle','Square','Rounded rectangle','Shield']))+
 row('Motion',select('imageEffect',['None','Spin','Flip horizontal','Flip vertical','Sway','Float','Pulse']))+
 row('One cycle (seconds)',number('imagePeriod',.2,120,.1))+
 row('Direction',select('imageDirection',['Clockwise','Counterclockwise']))+
 row('Repeat motion',check('imageRepeat'))+
 row('Entrance',select('imageEntrance',['None','Fade','Slide left','Slide right','Slide top','Slide bottom','Zoom']))+
 row('Exit',select('imageExit',['None','Fade','Slide left','Slide right','Slide top','Slide bottom','Zoom']))+
 row('Entrance / exit (s)',number('imageEdgeSeconds',.1,30,.1))+
 row('Clip duration (s)',number('imageDuration',.04,86400,.01))+
 row('Until video ends',check('imageUntilEnd'))+
 '<small>Drag or resize the image in the monitor. Drag its timeline ends to change its duration.</small>';
motionControls.after(imageMotion);
const imageTools=el('div');imageTools.className='actions';imageTools.id='imageFitTools';
for(const [text,handler] of [
 ['Fit canvas',l=>Object.assign(l,{x:0,y:0,w:100,h:100,crop:false})],
 ['Fill canvas',l=>Object.assign(l,{x:0,y:0,w:100,h:100,crop:true})],
 ['Center',l=>Object.assign(l,{x:(100-l.w)/2,y:(100-l.h)/2})]
]){const button=el('button',text);button.onclick=()=>{const l=layers[selectedLayer];if(l){handler(l);inspect()}};imageTools.append(button)}
motionControls.before(imageTools);
function inspectObjectMotion(){
 const l=layers[selectedLayer];motionControls.hidden=!l||l.kind==='audio';imageTools.hidden=motionControls.hidden;
 imageMotion.hidden=!l||l.kind!=='image';
 if(!l)return;
 $('objectAnimation').value=l.animation||'None';$('objectAnimationSeconds').value=l.animationSeconds||.5;$('objectRotation').value=l.rotation||0;$('objectFlip').checked=!!l.flip;
 if(l.kind==='image'){
  for(const [id,value] of Object.entries({imageShape:l.imageShape||'Original',imageEffect:l.imageEffect||'None',imagePeriod:l.imagePeriod||4,imageDirection:l.imageDirection||'Clockwise',imageEntrance:l.imageEntrance||'None',imageExit:l.imageExit||'None',imageEdgeSeconds:l.imageEdgeSeconds||.5}))$(id).value=value;
  $('imageRepeat').checked=l.imageRepeat!==false;$('imageUntilEnd').checked=!l.end;
  $('imageDuration').value=l.end?Math.max(.04,l.end-l.start).toFixed(2):Math.max(.04,total()-l.start||5).toFixed(2);
  $('imageDuration').disabled=!l.end;
 }
}
const previousObjectChoice=chooseLayer;
chooseLayer=function(key){previousObjectChoice(key);inspectObjectMotion()};
for(const [control,field] of [['objectAnimation','animation'],['objectAnimationSeconds','animationSeconds'],['objectRotation','rotation'],['objectFlip','flip']]){
 $(control).oninput=()=>{const l=layers[selectedLayer];if(!l)return;l[field]=control==='objectFlip'?$(control).checked:control==='objectAnimation'?$(control).value:+$(control).value}
}
for(const id of ['imageShape','imageEffect','imagePeriod','imageDirection','imageRepeat','imageEntrance','imageExit','imageEdgeSeconds']){
 $(id).oninput=()=>{const l=layers[selectedLayer];if(l?.kind!=='image')return;l[id]=id==='imageRepeat'?$(id).checked:['imagePeriod','imageEdgeSeconds'].includes(id)?+$(id).value:$(id).value};
 $(id).onchange=()=>{if(typeof commitHistory==='function')commitHistory()};
}
function imageLengthChanged(){const l=layers[selectedLayer];if(l?.kind!=='image')return;
 l.end=$('imageUntilEnd').checked?0:l.start+Math.max(.04,+$('imageDuration').value||5);
 $('imageDuration').disabled=!l.end;$('end').value=l.end;timeline();if(typeof commitHistory==='function')commitHistory();
}
$('imageUntilEnd').onchange=imageLengthChanged;$('imageDuration').onchange=imageLengthChanged;
function imageEdge(layer,t,end){
 const l={...layer},s=Math.max(.1,layer.imageEdgeSeconds||.5),start=layer.start;
 function apply(kind,p){if(kind==='None')return;
  if(kind==='Fade')l.opacity*=p;
  else if(kind==='Zoom'){const scale=.7+.3*p;l.x+=(l.w-l.w*scale)/2;l.y+=(l.h-l.h*scale)/2;l.w*=scale;l.h*=scale}
  else if(kind.startsWith('Slide')){const distance=1-p;
   if(kind==='Slide left')l.x-=l.w*distance;if(kind==='Slide right')l.x+=l.w*distance;
   if(kind==='Slide top')l.y-=l.h*distance;if(kind==='Slide bottom')l.y+=l.h*distance}
 }
 apply(layer.imageEntrance||'None',clamp((t-start)/s,0,1));
 apply(layer.imageExit||'None',clamp((end-t)/s,0,1));
 return l;
}
function clipImageShape(ctx,shape,x,y,w,h){
 if(!shape||shape==='Original')return;
 ctx.beginPath();const side=Math.min(w,h),sx=x+(w-side)/2,sy=y+(h-side)/2;
 if(shape==='Circle')ctx.ellipse(x+w/2,y+h/2,side/2,side/2,0,0,Math.PI*2);
 else if(shape==='Square')ctx.rect(sx,sy,side,side);
 else if(shape==='Rounded rectangle')ctx.roundRect(x,y,w,h,Math.min(w,h)*.18);
 else if(shape==='Shield'){ctx.moveTo(x+w*.5,y);ctx.lineTo(x+w,y+h*.14);ctx.lineTo(x+w*.9,y+h*.65);ctx.quadraticCurveTo(x+w*.78,y+h*.85,x+w*.5,y+h);ctx.quadraticCurveTo(x+w*.22,y+h*.85,x+w*.1,y+h*.65);ctx.lineTo(x,y+h*.14);ctx.closePath()}
 ctx.clip();
}
function animatedBox(layer,t,end){
 const duration=Math.max(.1,layer.animationSeconds||.5),elapsed=Math.max(0,t-layer.start),p=clamp(elapsed/duration,0,1),q=clamp((end-t)/duration,0,1),l={...layer};
 switch(layer.animation){
 case 'Fade in / out':l.opacity*=Math.min(p,q);break;
 case 'Slide from left':l.x-=l.w*(1-p);break;
 case 'Slide from right':l.x+=(100-l.x)*(1-p);break;
 case 'Slide from bottom':l.y+=(100-l.y)*(1-p);break;
 case 'Zoom in':case 'Zoom out':{
  const progress=clamp(elapsed/Math.max(.1,end-layer.start),0,1),scale=layer.animation==='Zoom in'?1+.15*progress:1.15-.15*progress;
  l.x-=(l.w*scale-l.w)/2;l.y-=(l.h*scale-l.h)/2;l.w*=scale;l.h*=scale;break;
 }}
 return l;
}
const colorGraphic=graphic;
graphic=function(key,layer){
 const l=layer.kind==='image'?imageEdge(animatedBox(layer,time,layer.end||total()),time,layer.end||total()):animatedBox(layer,time,layer.end||total());
 ctx.save();
 const cx=(l.x+l.w/2)*monitor.width/100,cy=(l.y+l.h/2)*monitor.height/100;
 let rotation=l.rotation||0,scaleX=l.flip?-1:1,scaleY=1,scale=1;
 if(l.kind==='image'&&l.imageEffect&&l.imageEffect!=='None'){
  const cycle=Math.max(.2,l.imagePeriod||4),elapsed=Math.max(0,time-l.start),phase=(l.imageRepeat===false?Math.min(1,elapsed/cycle):elapsed/cycle),theta=phase*Math.PI*2*(l.imageDirection==='Counterclockwise'?-1:1);
  if(l.imageEffect==='Spin')rotation+=theta*180/Math.PI;
  if(l.imageEffect==='Flip horizontal')scaleX*=Math.max(.02,Math.abs(Math.cos(theta)));
  if(l.imageEffect==='Flip vertical')scaleY*=Math.max(.02,Math.abs(Math.cos(theta)));
  if(l.imageEffect==='Sway')rotation+=12*Math.sin(theta);
  if(l.imageEffect==='Float')l.y+=1.5*Math.sin(theta);
  if(l.imageEffect==='Pulse')scale=1+.08*Math.sin(theta);
 }
 ctx.translate(cx,cy);ctx.rotate(rotation*Math.PI/180);ctx.scale(scaleX*scale,scaleY*scale);ctx.translate(-cx,-cy);
 if(l.kind==='image')clipImageShape(ctx,l.imageShape,l.x*monitor.width/100,l.y*monitor.height/100,l.w*monitor.width/100,l.h*monitor.height/100);
 const image=assets[key],gif=animatedGifAssets.get(image);
 if(gif){assets[key]=gif.cache.get(gifIndex(gif,time-l.start))||gif.last||image;
  if(!gif.cache.has(gifIndex(gif,time-l.start)))gifFrameAt(image,time-l.start).catch(e=>notify(e.message))}
 try{colorGraphic(key,l)}finally{if(gif)assets[key]=image;ctx.restore()}
};
