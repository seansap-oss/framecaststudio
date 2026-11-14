'use strict';
const bridge=location.origin==='http://localhost:4173';
const formatPanel=el('section');
formatPanel.innerHTML=row('File format',select('container',bridge?['MP4','MOV','WebM']:['Browser recording']))+
 (bridge?row('Compression',select('quality',['Balanced','Small','High'])):'<small>Run py server.py for MP4, MOV and connected publishing.</small>');
$('settingsHost').before(formatPanel);
const accountPanel=el('details');
accountPanel.innerHTML='<summary>Publishing accounts</summary><div class="actions"><button id="googleLogin">Connect YouTube</button><button id="metaLogin">Connect Facebook & Instagram</button><button id="refreshLogin">Refresh</button></div><p id="accountState"></p>'+row('Facebook Page','<select id="pageAccount"></select>')+row('YouTube visibility',select('privacy',['private','unlisted','public']));
if(bridge)$('destinations').before(accountPanel);
let accounts={pages:[]};
const publishViews=new Set();
let connectionError="";
async function api(path,options){
 const res=await fetch(path,options),data=await res.json();if(!res.ok)throw Error(data.error||res.statusText);return data
}
async function refreshAccounts(){
 try{connectionError="";accounts=await api('/api/accounts');const previous=$('pageAccount').value;
 $('pageAccount').replaceChildren(...accounts.pages.map(p=>named(p.id,p.name+(p.instagram?' · Instagram linked':''))));
 if(accounts.pages.some(p=>p.id===previous))$('pageAccount').value=previous;
 $('accountState').textContent='YouTube: '+(accounts.youtube||'Disconnected')+' · Meta: '+accounts.pages.length+' page(s)'}
 catch(e){accounts={pages:[]};connectionError=e.message;$('accountState').textContent=e.message}
 for(const view of publishViews){if(view.box.isConnected)view.update();else publishViews.delete(view)}
}
if(bridge){
 for(const [button,provider] of [['googleLogin','google'],['metaLogin','meta']])$(button).onclick=async()=>{
  const tab=window.open('about:blank','_blank');if(!tab)return $('accountState').textContent='Allow the sign-in window and try again.';
  tab.opener=null;
  try{const result=await api('/api/connect/'+provider,{method:'POST'});tab.location=result.url}catch(e){tab.close();$('accountState').textContent=e.message}
 };
 $('refreshLogin').onclick=refreshAccounts;window.addEventListener('focus',refreshAccounts);refreshAccounts()
}
async function deliverRender(link,blob){
 if(!bridge){registerRender(link,blob);return}
 const format=$('container').value.toLowerCase(),ratio=currentRatio;
 $('jobStatus').value='Encoding '+format.toUpperCase()+' · '+$('quality').value;
 const data=await api('/api/encode?'+new URLSearchParams({format,quality:$('quality').value}),{method:'POST',body:blob});
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
