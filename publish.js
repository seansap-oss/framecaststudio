'use strict';
let bridge=false;
let bridgeInfo={ffmpeg:false};
const formatPanel=el('section');
formatPanel.innerHTML=row('File format',select('container',['MP4','MOV','WebM']))+row('Compression',select('quality',['Balanced','Small','High']))+'<p id="encoderState" class="helpText">Checking available encoders…</p>';
$('settingsHost').before(formatPanel);
const accountPanel=el('details');accountPanel.open=true;
accountPanel.innerHTML='<summary>Connected publishing</summary><div class="actions"><button id="googleLogin">Connect YouTube</button><button id="metaLogin">Connect Facebook & Instagram</button><button id="refreshLogin">Check connection</button></div><p id="accountState" role="status"></p>'+row('Facebook Page','<select id="pageAccount"></select>')+row('YouTube visibility',select('privacy',['private','unlisted','public']));
$('destinations').before(accountPanel);
let accounts={pages:[]};
const publishViews=new Set();
let connectionError="";
async function api(path,options){
 const res=await fetch(path,{...options,signal:options?.signal||AbortSignal.timeout(20000)});if(!res.headers.get('content-type')?.includes('application/json'))throw Error('Publishing service is unavailable. Start FrameCast with py server.py.');const data=await res.json();if(!res.ok)throw Error(data.error||res.statusText);return data
}
async function refreshAccounts(){
 if(!bridge){$('accountState').textContent='This is the browser editor. Direct publishing needs the local FrameCast server with your Google / Meta app credentials, or a configured hosted publishing service. Your accounts are not connected.';return}
 try{connectionError="";accounts=await api('/api/accounts');const previous=$('pageAccount').value;
 $('pageAccount').replaceChildren(...accounts.pages.map(p=>named(p.id,p.name+(p.instagram?' · Instagram linked':''))));
 if(accounts.pages.some(p=>p.id===previous))$('pageAccount').value=previous;
 $('accountState').textContent='YouTube: '+(accounts.youtube||'Disconnected')+' · Meta: '+accounts.pages.length+' page(s)'}
 catch(e){accounts={pages:[]};connectionError=e.message;$('accountState').textContent=e.message}
 for(const view of publishViews){if(view.box.isConnected)view.update();else publishViews.delete(view)}
}
function recordingMime(){
 const format=$('container').value;
 const candidates=bridge&&bridgeInfo.ffmpeg?['video/webm;codecs=vp8,opus','video/webm','video/mp4']:format==='MP4'?['video/mp4;codecs=avc1.42001e,mp4a.40.2','video/mp4']:format==='WebM'?['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']:[];
 return typeof MediaRecorder!=='undefined'?candidates.find(v=>MediaRecorder.isTypeSupported(v)):null;
}
function encoderStatus(){
 const native=recordingMime();
 $('encoderState').textContent=bridge&&bridgeInfo.ffmpeg?'Local FFmpeg encoder ready · MP4 / MOV / WebM.':native?'Browser '+$('container').value+' recording available. Direct publishing is not configured.':$('container').value+' requires the local server with FFmpeg, or choose a format supported by this browser.';
 $('quality').disabled=!bridge||!bridgeInfo.ffmpeg;$('quality').title=bridge?'FFmpeg compression preset':'Browser bitrate is set automatically';
}
const bridgeReady=(async()=>{
 try{const info=await api('/api/health');if(info.service==='framecast-local'){bridge=true;bridgeInfo=info}}catch{}
 encoderStatus();await refreshAccounts();
})();
for(const [button,provider] of [['googleLogin','google'],['metaLogin','meta']])$(button).onclick=async()=>{
 await bridgeReady;
 if(!bridge){refreshAccounts();$('accountState').textContent+=' On your Windows PC, run py server.py in D:\\Framecaststudio and open http://localhost:4173.';return}
 const popup=window.open('about:blank','_blank');if(!popup)return $('accountState').textContent='Allow the sign-in window and try again.';
 popup.opener=null;
 try{const result=await api('/api/connect/'+provider,{method:'POST'});popup.location=result.url}catch(e){popup.close();$('accountState').textContent=e.message}
};
$('refreshLogin').onclick=async()=>{await bridgeReady;await refreshAccounts()};
$('container').onchange=encoderStatus;
window.addEventListener('focus',()=>{if(bridge)refreshAccounts()});

async function deliverRender(link,blob){
 if(!bridge||!bridgeInfo.ffmpeg){registerRender(link,blob);return}
 const format=$('container').value.toLowerCase(),ratio=currentRatio;
 $('jobStatus').value='Encoding '+format.toUpperCase()+' · '+$('quality').value;
 renderAbort=new AbortController();const timeout=setTimeout(()=>renderAbort.abort(),3600000);let data;
 try{data=await api('/api/encode?'+new URLSearchParams({format,quality:$('quality').value}),{method:'POST',body:blob,signal:renderAbort.signal})}finally{clearTimeout(timeout);renderAbort=null}
 URL.revokeObjectURL(link.href);link.href='/media/'+data.id;
 link.download=($('postTitle').value.trim()||'FrameCast').replace(/[<>:"/\\|?*]/g,'_')+'-'+ratio.replace(':','x')+'-'+$('resolution').value+'.'+format;
 link.textContent='Download '+link.download+' ('+(data.bytes/1048576).toFixed(1)+' MB)';
 const box=el('div');box.append(link);$('results').append(box);$('downloads').replaceChildren(link.cloneNode(true));
 const targets=Array.from($('destinations').children).filter(l=>l.firstChild.checked&&l.lastChild.value===ratio).map(l=>l.children[1].textContent).filter(d=>d!=='WhatsApp');
 if(format!=='mp4'||!targets.length)return;
 buildPublishControls(box,data.id,targets,ratio);
}
function buildPublishControls(box,asset,targets,ratio){
 box.className='publishResult';
 const rows=new Map(),completed=new Set();
 const actions=el('div'),send=el('button'),connect=el('button','Set up publishing accounts');
 let sending=false;
 for(const platform of targets){const line=el('output');line.className='publishState';line.setAttribute('aria-live','polite');rows.set(platform,line);box.append(line)}
 actions.append(send,connect);box.append(actions);
 const selectedPage=()=>accounts.pages.find(p=>p.id===$('pageAccount').value);
 function readiness(d){
  if(connectionError)return {reason:'Account check failed · '+connectionError};
  if(d!=='YouTube'&&ratio!=='9:16')return {reason:'Choose 9:16 and render this destination again'};
  if(d.startsWith('YouTube'))return accounts.youtube?{name:accounts.youtube}:{reason:accounts.configured?.google===false?'Set up Google credentials in publish-settings.json':'Connect YouTube'};
  const page=selectedPage();
  if(!page)return {reason:accounts.configured?.meta===false?'Set up Meta credentials in publish-settings.json':'Connect Meta and select a Facebook Page'};
  return d==='Instagram Reels'&&!page.instagram?{reason:'Select a Page with a linked professional Instagram account'}:{name:page.name}
 }
 function update(){
  if(sending)return;
  const ready=targets.filter(d=>!completed.has(d)&&readiness(d).name);
  for(const d of targets){if(completed.has(d))continue;const state=readiness(d);rows.get(d).textContent=d+' · '+(state.reason||'Ready · '+state.name)}
  send.disabled=!ready.length;send.textContent=ready.length?'Publish to '+ready.join(', '):completed.size===targets.length?'See destination results':'Connect an account to publish';
  connect.hidden=targets.every(d=>completed.has(d)||readiness(d).name);
 }
 connect.onclick=()=>{accountPanel.open=true;accountPanel.scrollIntoView({block:'center'});const id=targets.some(d=>d.startsWith('YouTube')&&!accounts.youtube)?'googleLogin':'metaLogin';$(id).focus()};
 send.onclick=async()=>{
  if(sending)return;
  const chosen=targets.filter(d=>!completed.has(d)&&readiness(d).name);
  sending=true;send.disabled=true;
  await refreshAccounts();
  await Promise.all(chosen.map(async platform=>{
   const state=rows.get(platform),r=readiness(platform);
   if(r.reason){state.textContent=platform+' · '+r.reason;return}
   state.textContent=platform+' · Queued';
   try{
    const payload={asset,platform,page:selectedPage()?.id||'',privacy:$('privacy').value,title:$('postTitle').value,caption:$('caption').value,tags:$('tags').value};
    const job=await api('/api/publish',{method:'POST',body:JSON.stringify(payload)});
    for(;;){
     const result=await api('/api/job/'+job.id);
     state.textContent=platform+' · '+result.status+(result.error?' · '+result.error:'');
     if(!['Queued','Uploading','Processing on Instagram'].includes(result.status)){
      if(result.status==='Failed'&&!result.retryable){completed.add(platform);state.append(' · Check your account before attempting another upload.')}
      if(result.status!=='Failed'){completed.add(platform);if(platform.startsWith('YouTube')&&result.id){const a=el('a','Open video');a.target='_blank';a.rel='noopener';a.href='https://www.youtube.com/watch?v='+encodeURIComponent(result.id);state.append(a)}}
      break
     }
     await new Promise(resolve=>setTimeout(resolve,1200));
    }
   }catch(e){state.textContent=platform+' · '+e.message}
  }));
  sending=false;const outcomes=chosen.map(d=>[d,rows.get(d).cloneNode(true)]);update();
  for(const [d,copy] of outcomes){rows.get(d).replaceChildren(...copy.childNodes)}
 };
 publishViews.add({box,update});update();refreshAccounts();
}
$('pageAccount').onchange=()=>{for(const view of publishViews)view.update()};
