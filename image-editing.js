'use strict';
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
const imageTools=el('div');imageTools.className='actions';imageTools.id='imageFitTools';
for(const [text,handler] of [
 ['Fit canvas',l=>Object.assign(l,{x:0,y:0,w:100,h:100,crop:false})],
 ['Fill canvas',l=>Object.assign(l,{x:0,y:0,w:100,h:100,crop:true})],
 ['Center',l=>Object.assign(l,{x:(100-l.w)/2,y:(100-l.h)/2})]
]){const button=el('button',text);button.onclick=()=>{const l=layers[selectedLayer];if(l){handler(l);inspect()}};imageTools.append(button)}
motionControls.before(imageTools);
function inspectObjectMotion(){
 const l=layers[selectedLayer];motionControls.hidden=!l||l.kind==='audio';imageTools.hidden=motionControls.hidden;
 if(!l)return;
 $('objectAnimation').value=l.animation||'None';$('objectAnimationSeconds').value=l.animationSeconds||.5;$('objectRotation').value=l.rotation||0;$('objectFlip').checked=!!l.flip;
}
const previousObjectChoice=chooseLayer;
chooseLayer=function(key){previousObjectChoice(key);inspectObjectMotion()};
for(const [control,field] of [['objectAnimation','animation'],['objectAnimationSeconds','animationSeconds'],['objectRotation','rotation'],['objectFlip','flip']]){
 $(control).oninput=()=>{const l=layers[selectedLayer];if(!l)return;l[field]=control==='objectFlip'?$(control).checked:control==='objectAnimation'?$(control).value:+$(control).value}
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
 const l=animatedBox(layer,time,layer.end||total());
 ctx.save();
 const cx=(l.x+l.w/2)*monitor.width/100,cy=(l.y+l.h/2)*monitor.height/100;
 ctx.translate(cx,cy);ctx.rotate((l.rotation||0)*Math.PI/180);ctx.scale(l.flip?-1:1,1);ctx.translate(-cx,-cy);
 colorGraphic(key,l);ctx.restore()
};
