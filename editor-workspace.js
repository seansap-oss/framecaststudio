'use strict';
// Workbench v0.10: the existing rendering engine remains the single output path.
const toolLabels={Media:'Media',Mixer:'Audio',Key:'Chroma',Graphics:'Inspector',Motion:'Tickers',Brand:'Templates',Transitions:'Transitions',Export:'Export',Color:'Color'};
const toolPaths={Media:'M3 5h18v14H3z M3 10h18 M8 5v5 M16 5v5',Mixer:'M5 5v14 M12 3v18 M19 5v14 M2 9h6 M9 15h6 M16 10h6',Key:'M12 3l8 9-8 9-8-9z M12 8v8 M8 12h8',Graphics:'M4 5h16 M12 5v15 M8 20h8',Motion:'M3 7h17 M16 3l4 4-4 4 M21 17H4 M8 13l-4 4 4 4',Brand:'M12 3l3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z',Transitions:'M3 5h18v14H3z M3 19L21 5',Export:'M4 14v7h16v-7 M12 3v13 M7 8l5-5 5 5',Color:'M12 3a9 9 0 1 0 0 18 3 3 0 0 0 3-3c0-2 1-3 3-3a3 3 0 0 0 3-3 9 9 0 0 0-9-9z'};
const iconSvg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+toolPaths[name]+'"/></svg>';
const tabBars={};
for(const side of ['left','right']){
 const tabs=el('div');tabs.className='dockTabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',side+' tools');$(side).prepend(tabs);tabBars[side]=tabs;
}
function refreshDockTabs(){
 for(const [side,bar] of Object.entries(tabBars)){
  const names=Object.entries(panels).filter(([,p])=>p.parentElement.id===side&&!p.hidden);
  bar.replaceChildren();
  for(const [name,p] of names){
   const b=el('button',toolLabels[name]);b.setAttribute('role','tab');b.setAttribute('aria-selected',!p.classList.contains('fold'));
   b.onclick=()=>activateDockTab(name);bar.append(b);
  }
 }
 for(const [index,name] of Object.keys(panels).entries()){
  const b=$('tools').children[index];b?.classList.toggle('active',!panels[name].hidden&&!panels[name].classList.contains('fold'));
 }
}
function activateDockTab(name){
 const p=panels[name];if(!p)return;
 if(['left','right'].includes(p.parentElement.id))for(const other of p.parentElement.querySelectorAll('.panel'))if(other!==p&&!other.classList.contains('pinned'))other.classList.add('fold');
 p.hidden=false;p.classList.remove('fold');refreshDockTabs();sizeWorkspace();keepLayout();
}
for(const [index,[name,p]] of Object.entries(panels).entries()){
 p.dataset.tool=name;
 const b=$('tools').children[index];b.innerHTML=iconSvg(name)+'<span>'+toolLabels[name]+'</span>';b.title=toolLabels[name];b.onclick=()=>activateDockTab(name);
 const pin=el('button','◇');pin.title='Pin panel open';pin.setAttribute('aria-label','Pin '+toolLabels[name]);pin.onclick=()=>{p.classList.toggle('pinned');pin.classList.toggle('gold',p.classList.contains('pinned'));pin.setAttribute('aria-pressed',p.classList.contains('pinned'))};p.querySelector('.panelhead').insertBefore(pin,p.querySelector('.panelhead button:last-child'));
}
const previousDock=dock;
dock=function(p,side){previousDock(p,side);refreshDockTabs()};
const resetWorkspace=$('reset').onclick;
$('reset').onclick=()=>{resetWorkspace();for(const [name,p] of Object.entries(panels)){p.classList.remove('pinned');p.classList.toggle('fold',!['Media','Graphics'].includes(name));}refreshDockTabs();sizeWorkspace();keepLayout()};
// Start from an intentional layout, without changing the saved project content.
for(const [name,p] of Object.entries(panels))if(!p.classList.contains('float'))p.classList.toggle('fold',!['Media','Graphics'].includes(name));
refreshDockTabs();
const projectBar=el('div');projectBar.className='projectBar';projectBar.innerHTML='<span class="projectBadge">PROJECT</span><button id="renameProject" title="Rename project">Evening bulletin ▾</button><span id="editState">Local session</span><span class="spacer"></span><button id="undoEdit" disabled title="Undo · Ctrl+Z">↶ Undo</button><button id="redoEdit" disabled title="Redo · Ctrl+Shift+Z">↷ Redo</button><button id="saveShortcut">Save project</button><button id="openShortcut">Open project</button>';
document.querySelector('header').after(projectBar);
$('saveShortcut').onclick=()=>$('saveProject').click();$('openShortcut').onclick=()=>$('loadProject').click();
$('projectTitle').hidden=true;
$('renameProject').onclick=()=>{const input=el('input');input.value=$('postTitle').value;input.setAttribute('aria-label','Project name');$('renameProject').replaceWith(input);input.focus();input.select();let done=false;
 const finish=save=>{if(done)return;done=true;if(save&&input.value.trim())$('postTitle').value=input.value.trim();const b=el('button',$('postTitle').value+' ▾');b.id='renameProject';b.onclick=rename;b.title='Rename project';input.replaceWith(b);$('projectTitle').textContent=$('postTitle').value;};
 const rename=$('projectTitle').ondblclick;input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false)};input.onblur=()=>finish(true);
};
$('projectTitle').ondblclick=$('renameProject').onclick;
const monitorBar=monitorPane.querySelector('.bar');monitorBar.querySelector('b').textContent='PROGRAM';
const badge=el('span','COMPOSITE');badge.className='monitorBadge';monitorBar.querySelector('b').after(badge);
const guides=el('button','Safe areas');guides.id='safeGuides';guides.title='Show title and action safe areas in the monitor only';monitorBar.insertBefore(guides,$('ratio'));let showSafe=false;
guides.onclick=()=>{showSafe=!showSafe;guides.classList.toggle('gold',showSafe)};
const drawComposite=draw;
draw=function(){drawComposite();if(showSafe&&!busy){ctx.save();ctx.strokeStyle='#ffffff65';ctx.setLineDash([6,5]);ctx.lineWidth=1;for(const inset of [5,10])ctx.strokeRect(monitor.width*inset/100,monitor.height*inset/100,monitor.width*(1-inset/50),monitor.height*(1-inset/50));ctx.restore()}};
const frameBack=el('button','‹'),frameNext=el('button','›');frameBack.title='Previous frame';frameNext.title='Next frame';frameBack.onclick=()=>{stop();seek(time-1/30)};frameNext.onclick=()=>{stop();seek(time+1/30)};$('play').before(frameBack);$('play').after(frameNext);
$('seek').setAttribute('aria-label','Seek video');$('ratio').setAttribute('aria-label','Aspect ratio');
const hint=el('div');hint.className='timelineHint';hint.innerHTML='<span><i></i> Top track appears in front</span><span>Drag clip = move · ends = trim · double-click name = rename</span><span id="timelineCount"></span>';
$('timeline').firstElementChild.after(hint);
const deleteButton=el('button','Delete');deleteButton.id='deleteSelected';deleteButton.title='Delete selected layer';deleteButton.onclick=()=>deleteTrack(selectedLayer);$('splitClip').after(deleteButton);
const duplicateButton=el('button','Duplicate');duplicateButton.id='duplicateSelected';duplicateButton.onclick=async()=>{
 if(busy||!layers[selectedLayer])return;stop();const key=selectedLayer,l=layers[key],asset=assets[key];
 try{const copy=asset?(asset.tagName==='IMG'?await loadImage(asset.src):await loadMedia(asset.src,asset.tagName.toLowerCase())):null,id=extraId();layers[id]=structuredClone(l);layers[id].name=(l.name||key)+' copy';if(copy)assets[id]=copy;orderAt(id,key,true);rebuildOptions(id);chooseLayer(id);timeline();notify('Duplicated '+layers[id].name);commitHistory()}catch(e){notify(e.message)}
};deleteButton.after(duplicateButton);
const fitTime=el('button','Fit');fitTime.id='fitTimeline';fitTime.onclick=()=>{zoomTimeline(1);scrollTime.scrollLeft=0};$('zoomOut').before(fitTime);
let detailWindow=0;
const beforeTimeline=timeline;
timeline=function(){
 const top=scrollTime.scrollTop,left=scrollTime.scrollLeft;
 beforeTimeline();
 $('timelineCount').textContent=$('tracks').querySelectorAll('.track[data-key]').length+' layers · '+fmt(total());
 for(const r of $('tracks').querySelectorAll('.track[data-key]')){
  const k=r.dataset.key,l=layers[k],region=r.querySelector('.region');
  r.classList.toggle('selectedTrack',k===selectedLayer);
  const name=r.querySelector('.trackName');name.title=(l.name||k)+' · double-click to rename';
  const tag=el('span',l.kind==='audio'?'A':l.kind==='video'?'V':l.kind==='image'?'I':'T');tag.className='trackType '+(l.kind||'text');name.before(tag);
  region.title=(l.name||k)+'\nStart '+frameTime(l.start)+' · End '+frameTime(l.end||total())+'\nDuration '+((l.end||total())-l.start).toFixed(2)+' seconds';
  region.setAttribute('aria-label',(l.name||k)+' clip');
  const toggle=el('button',l.kind==='audio'?(l.muted?'M':'♪'):(l.visible?'◉':'○'));toggle.className='trackToggle';toggle.title=l.kind==='audio'?'Mute / unmute':'Show / hide';toggle.setAttribute('aria-label',toggle.title+' '+(l.name||k));toggle.onclick=()=>{if(l.kind==='audio')l.muted=!l.muted;else l.visible=!l.visible;connectInserts();timeline();inspect()};name.after(toggle);
 }
 scrollTime.scrollTop=top;scrollTime.scrollLeft=left;
 clearTimeout(detailWindow);detailWindow=setTimeout(refreshDockTabs,0);
};
const priorChoice=chooseLayer;
chooseLayer=function(key){priorChoice(key);for(const row of $('tracks').querySelectorAll('.track[data-key]'))row.classList.toggle('selectedTrack',row.dataset.key===key);};
// Transition drop targets name both clips. No track assignment is required.
const transitionHelp=el('p','Drag a preset onto the incoming clip. The editor finds the preceding clip, creates the overlap and shows its duration. You can also select a clip and click Apply to selected.');transitionHelp.className='helpText';editor.prepend(transitionHelp);
gallery.open=true;
const quick=el('button','Apply to selected');quick.id='quickTransition';quick.className='gold';quick.onclick=()=>{
 const to=selectedLayer,b=layers[to];if(!b||!['video','image'].includes(b.kind))return notify('Select the incoming video or image first');
 const from=transitionPredecessor(to);if(!from)return notify('Add a second video or image to create a transition');
 $('transitionTo').value=to;$('transitionFrom').value=from;applyTransition(false,true);
};$('applyEffect').before(quick);
// Roll back complete editor operations without copying media bytes.
const historyBack=[],historyForward=[];let historyCurrent=null,historyRestoring=false,historyTimer=null,ready=false;
const mixerIds=['Clip','Bed','Master','Bass','Mid','Treble','hum','noise','compress','threshold','compRatio','keyOn','keyColor','tolerance','feather','back'];
function takeHistory(){
 const settings=Object.fromEntries(mixerIds.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));
 const data={layers:structuredClone(layers),transitions:structuredClone([...transitions]),framing:structuredClone(framing),ratio:currentRatio,settings,title:$('postTitle').value};
 return {data,signature:JSON.stringify(data),assets:{...assets},selected:selectedLayer,time,background};
}
function historyUI(){
 $('undoEdit').disabled=!historyBack.length||busy;$('redoEdit').disabled=!historyForward.length||busy;
}
function commitHistory(){
 if(!ready||historyRestoring||busy)return;
 const next=takeHistory();if(historyCurrent?.signature===next.signature)return;
 if(historyCurrent)historyBack.push(historyCurrent);if(historyBack.length>40)historyBack.shift();historyCurrent=next;historyForward.length=0;historyUI();$('editState').textContent='Unsaved changes';
}
function restoreHistory(s){
 historyRestoring=true;stop();for(const asset of Object.values(assets)){asset.pause?.();if(asset.insertGain)asset.insertGain.gain.value=0}
 for(const k of Object.keys(layers))delete layers[k];for(const k of Object.keys(assets))delete assets[k];
 Object.assign(layers,structuredClone(s.data.layers));Object.assign(assets,s.assets);transitions.clear();for(const [k,tr] of structuredClone(s.data.transitions))transitions.set(k,tr);
 framing=structuredClone(s.data.framing);currentRatio=s.data.ratio;$('ratio').value=currentRatio;background=s.background;
 for(const [id,v] of Object.entries(s.data.settings))if($(id).type==='checkbox')$(id).checked=v;else $(id).value=v;
 $('postTitle').value=s.data.title;$('renameProject').textContent=s.data.title+' ▾';selectedLayer=layers[s.selected]?s.selected:Object.keys(layers).find(k=>!layers[k].removed);rebuildOptions(selectedLayer);if(selectedLayer)chooseLayer(selectedLayer);
 timeline();dimensions();seek(Math.min(s.time,total()));connectInserts();levels();refreshCleanup();historyRestoring=false;historyUI();
}
$('undoEdit').onclick=()=>{commitHistory();if(!historyBack.length)return;historyForward.push(historyCurrent);historyCurrent=historyBack.pop();restoreHistory(historyCurrent);notify('Undo · restored previous edit')};
$('redoEdit').onclick=()=>{if(!historyForward.length)return;historyBack.push(historyCurrent);historyCurrent=historyForward.pop();restoreHistory(historyCurrent);notify('Redo · restored edit')};
function scheduleHistory(){clearTimeout(historyTimer);historyTimer=setTimeout(commitHistory,180)}
for(const event of ['pointerup','change','input','click','keydown'])document.addEventListener(event,e=>{if(e.target.closest('#undoEdit,#redoEdit,#play,#seek,#homeBtn'))return;scheduleHistory()});
document.addEventListener('keydown',e=>{
 const typing=e.target.closest('input,textarea,select,[contenteditable=true]');if(typing||busy)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?$('redoEdit'):$('undoEdit')).click()}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('saveProject').click()}
 if(e.key==='Escape'){stop();closeTrackMenu();}
});
function editorReady(){ready=true;selectedLayer=Object.keys(layers).find(k=>layers[k].program);if(selectedLayer)chooseLayer(selectedLayer);activateDockTab('Media');historyCurrent=takeHistory();historyUI();timeline();sizeWorkspace();notify('Ready · drag media onto the timeline to begin');}
const saveEmbedded=$('saveProject').onclick;
$('saveProject').onclick=async()=>{await saveEmbedded();if($('status').textContent.startsWith('Project saved'))$('editState').textContent='Project file saved'};
// Local live workspace: project sources, visible preview/program and real source meters.
const projectSources=el('button','＋ Project videos');projectSources.id='liveProjectSources';$('liveFile').after(projectSources);
projectSources.onclick=async()=>{
 try{for(const [key,l] of Object.entries(layers)){const asset=assets[key];if(l.kind!=='video'||l.removed||!asset)continue;if(liveSources.some(s=>s.projectKey===key))continue;const copy=await loadMedia(asset.src,'video');copy.loop=true;await addLiveSource(copy,l.name);liveSources.at(-1).projectKey=key;}renderLiveSources();$('liveStatus').value='Project sources ready · select a layout and press Take'}catch(e){$('liveStatus').value=e.message}
};
const liveHeading=el('div');liveHeading.className='liveHeading';liveHeading.innerHTML='<div><span class="eyebrow">BROADCAST WORKSPACE</span><h2>Control room</h2></div><span class="spacer"></span><span class="localPill">Local preview & recording</span>';
live.prepend(liveHeading);
const sourceRender=renderLiveSources;
renderLiveSources=function(){sourceRender();for(const [i,src] of liveSources.entries()){
 if(!src.analyser){src.analyser=audio.createAnalyser();src.analyser.fftSize=256;src.gain.connect(src.analyser);src.samples=new Uint8Array(256)}
 const row=$('liveSources').children[i];row.dataset.source=src.id;row.classList.toggle('inPreview',nextScene.ids.includes(src.id));const meter=el('meter');meter.min=0;meter.max=1;meter.setAttribute('aria-label',src.name+' audio meter');row.append(meter);
 const label=$('liveMixer').children[i],mute=el('button',src.volume===0?'Unmute':'Mute');mute.onclick=()=>{if(src.volume){src.lastVolume=src.volume;src.volume=0}else src.volume=src.lastVolume||100;renderLiveSources()};label.append(mute);
 }};
const liveDraw=paintLive;
paintLive=function(){liveDraw();for(const src of liveSources){if(!src.analyser)continue;src.analyser.getByteTimeDomainData(src.samples);let peak=0;for(const value of src.samples)peak=Math.max(peak,Math.abs(value-128)/128);const row=[...$('liveSources').children].find(r=>r.dataset.source===src.id);if(row?.querySelector('meter'))row.querySelector('meter').value=peak;}}
const setWorkspaceBefore=setWorkspace;
setWorkspace=function(name){if(name!=='Edit')stop();setWorkspaceBefore(name);document.body.dataset.workspace=name;sizeWorkspace()};
setWorkspace('Edit');
