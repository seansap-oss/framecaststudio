"""Single-user local publishing bridge. Python 3.10+ and FFmpeg."""
import json, os, re, secrets, shutil, subprocess, tempfile, threading, time, webbrowser
from offline_render import FixedFrameRender
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from functools import lru_cache

ROOT = Path(__file__).resolve().parent
ORIGIN = 'http://localhost:4173'
PUBLIC = {'index.html','studio.css','studio.js','timeline.js','layers.js','tracks.js','sample.js','publish.js','editing.js','workspace.js','image-editing.js','editor-core.js','editor-workspace.js','editor-workspace.css','ticker-inspector.js','render-ranges.js','deterministic-export.js'}
CONFIG = ROOT/'publish-settings.json'
cfg = json.loads(CONFIG.read_text(encoding='utf-8-sig')) if CONFIG.exists() else {}
temp = tempfile.TemporaryDirectory()
renders, states, jobs, tokens = {}, {}, {}, {}
render_codecs = {}
fixed_renders = {}
graph = 'https://graph.facebook.com/'+cfg.get('meta_version','v25.0')
lock = threading.Lock()

def http(url, method='GET', data=None, headers=None, raw=False):
    if isinstance(data,dict):
        data = urlencode(data).encode()
    try:
        with urlopen(Request(url,data=data,headers=headers or {},method=method),timeout=180) as r:
            if raw: return r.headers
            body = r.read()
            return json.loads(body) if body else {}
    except HTTPError as e:
        try:
            error = json.loads(e.read()).get('error',{})
            msg = error.get('message') if isinstance(error,dict) else error
        except Exception: msg = None
        raise ValueError(f'Provider HTTP {e.code}: {msg or e.reason}') from None

def auth(token): return {'Authorization':'Bearer '+token}
def oauth(provider, code):
    callback = ORIGIN+'/callback/'+provider
    if provider=='google':
        t=http('https://oauth2.googleapis.com/token','POST',dict(code=code,client_id=cfg['google_id'],client_secret=cfg['google_secret'],redirect_uri=callback,grant_type='authorization_code'))
        channels=http('https://www.googleapis.com/youtube/v3/channels?mine=true&part=snippet',headers=auth(t['access_token']))['items']
        if not channels: raise ValueError('Choose a Google account with a YouTube channel')
        channel=channels[0]
        tokens['google']={**t,'channel_id':channel['id'],'name':channel['snippet']['title'],'expires':time.time()+t['expires_in']}
    else:
        t=http(graph+'/oauth/access_token?'+urlencode(dict(client_id=cfg['meta_id'],client_secret=cfg['meta_secret'],redirect_uri=callback,code=code)))
        pages=http(graph+'/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100',headers=auth(t['access_token']))['data']
        if not pages: raise ValueError('No accessible Facebook Pages returned')
        tokens['pages']={p['id']:p for p in pages}
@lru_cache(maxsize=1)
def available_encoders():
    if not shutil.which('ffmpeg'): return {}
    try:
        output=subprocess.check_output(['ffmpeg','-hide_banner','-encoders'],text=True,stderr=subprocess.DEVNULL,timeout=10)
        names={line.split()[1] for line in output.splitlines() if len(line.split())>1}
        candidates={'h264':['libx264'],'hevc':['libx265'],'av1':['libsvtav1','libaom-av1'],'vp9':['libvpx-vp9']}
        return {k:next(n for n in v if n in names) for k,v in candidates.items() if any(n in names for n in v)}
    except (OSError,subprocess.SubprocessError): return {}

CODEC_FORMATS={'mp4':('h264','hevc','av1'),'mov':('h264','hevc'),'webm':('vp9','av1')}
def resolve_codec(fmt,codec=None):
    codec=codec or ('vp9' if fmt=='webm' else 'h264')
    if codec not in CODEC_FORMATS.get(fmt,()): raise ValueError('Codec is not supported in this file format')
    if codec not in available_encoders(): raise ValueError('This FFmpeg build does not include '+codec+'. Install a full FFmpeg build and restart FrameCast.')
    return codec

def encode(src,dst,fmt,preset,fps=60,video_codec=None):
    selected=resolve_codec(fmt,video_codec);encoder=available_encoders()[selected]
    if fps not in (30,60) or preset not in ('Small','Balanced','High'): raise ValueError('Invalid export settings')
    quality={'h264':(29,23,18),'hevc':(30,25,20),'av1':(38,30,24),'vp9':(38,32,26)}[selected][('Small','Balanced','High').index(preset)]
    codec=['-c:v',encoder,'-crf',str(quality),'-threads','2']
    if selected=='h264': codec+=['-preset','medium']
    elif selected=='hevc': codec+=['-preset','medium','-x265-params','pools=2:frame-threads=2:log-level=error','-tag:v','hvc1']
    elif encoder=='libsvtav1': codec+=['-preset','8','-svtav1-params','lp=2']
    elif selected=='av1': codec+=['-b:v','0','-cpu-used','6']
    else: codec+=['-b:v','0','-deadline','good','-cpu-used','4']
    codec+=['-c:a','libopus' if fmt=='webm' else 'aac','-ar','48000','-b:a','192k']
    if fmt!='webm': codec+=['-movflags','+faststart']
    subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-f',('mov' if src.suffix=='.mp4' else 'matroska'),'-i',str(src),'-map','0:v:0','-map','0:a:0?','-pix_fmt','yuv420p',*codec,'-r',str(fps),'-fps_mode','cfr',str(dst)],check=True)
def google_token():
    t=tokens['google']
    if t['expires']<time.time()+60:
        fresh=http('https://oauth2.googleapis.com/token','POST',dict(client_id=cfg['google_id'],client_secret=cfg['google_secret'],refresh_token=t['refresh_token'],grant_type='refresh_token'))
        t.update(fresh,expires=time.time()+fresh['expires_in'])
    return t['access_token']
def upload(job, asset, platform, meta):
    try:
        path=renders[asset]
        job['status']='Uploading'
        size=str(path.stat().st_size)
        caption='\n'.join(filter(None,[meta.get('caption'),meta.get('tags')]))
        if platform.startswith('YouTube'):
            body={'snippet':{'title':meta['title'],'description':caption},'status':{'privacyStatus':meta['privacy']}}
            headers={**auth(google_token()),'Content-Type':'application/json','X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':size}
            session=http('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status','POST',json.dumps(body).encode(),headers,True)['Location']
            with path.open('rb') as f:
                result=http(session,'PUT',f,{'Content-Type':'video/mp4','Content-Length':size})
            job.update(status='Uploaded · processing on YouTube',id=result['id'])
            return
        page=tokens['pages'][meta['page']]
        token=page['access_token']
        instagram=platform=='Instagram Reels'
        if instagram:
            endpoint=graph+'/'+page['instagram_business_account']['id']
            init=http(endpoint+'/media','POST',dict(media_type='REELS',upload_type='resumable',caption=caption),auth(token))
            target=init['uri']; ident=init['id']
        else:
            endpoint=graph+'/'+page['id']+'/video_reels'
            init=http(endpoint,'POST',dict(upload_phase='start'),auth(token))
            target=init['upload_url'];ident=init['video_id']
        if urlparse(target).hostname!='rupload.facebook.com' or urlparse(target).scheme!='https': raise ValueError('Unexpected Meta upload host')
        with path.open('rb') as f:
            http(target,'POST',f,{'Authorization':'OAuth '+token,'offset':'0','file_size':size,'Content-Length':size,'Content-Type':'application/octet-stream'})
        if instagram:
            job['status']='Processing on Instagram'
            for _ in range(120):
                state=http(graph+'/'+ident+'?fields=status_code',headers=auth(token))['status_code']
                if state=='FINISHED': break
                if state in ('ERROR','EXPIRED'): raise ValueError('Instagram processing '+state)
                time.sleep(5)
            else: raise ValueError('Instagram processing timed out')
            result=http(endpoint+'/media_publish','POST',dict(creation_id=ident),auth(token))
            job.update(status='Published',id=result['id'])
        else:
            result=http(endpoint,'POST',dict(upload_phase='finish',video_id=ident,video_state='PUBLISHED',description=caption,title=meta['title']),auth(token))
            if not result.get('success'): raise ValueError('Facebook did not accept the publish request')
            job.update(status='Accepted by Facebook',id=ident)
    except Exception as e: job.update(status='Failed',error=str(e),retryable=isinstance(e, ValueError) and str(e).startswith(('Provider HTTP 400:', 'Provider HTTP 401:', 'Provider HTTP 403:', 'Provider HTTP 429:')))

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,data,typ='application/json',code=200):
        if typ=='application/json': data=json.dumps(data).encode()
        if isinstance(data,str): data=data.encode()
        self.send_response(code);self.send_header('Content-Type',typ);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
    def do_GET(self): self.dispatch(False)
    def do_POST(self): self.dispatch(True)
    def dispatch(self,post):
        try:
            if self.headers.get('Host')!='localhost:4173' or (post and self.headers.get('Origin')!=ORIGIN): return self.reply({'error':'Invalid origin'},code=403)
            url=urlparse(self.path);route=url.path; qs=parse_qs(url.query)
            if not post and route.startswith('/callback/'):
                provider=route.split('/')[-1]; state=states.pop(qs.get('state',[''])[0],None)
                if not state or state[0]!=provider or state[1]<time.time(): raise ValueError('Sign-in expired')
                if 'code' not in qs: raise ValueError('Sign-in cancelled or denied. Return to FrameCast and reconnect.')
                oauth(provider,qs['code'][0]);return self.reply('Account connected. Close this tab and refresh accounts in FrameCast.','text/plain')
            if not post and route=='/api/health':
                return self.reply(dict(service='framecast-local',version='0.11.0',ffmpeg=bool(shutil.which('ffmpeg')),fixedFrames=True,encoders=available_encoders()))
            if post and route=='/api/render/start':
                if not shutil.which('ffmpeg') or not shutil.which('ffprobe'): raise ValueError('Install FFmpeg and FFprobe for fixed-frame export')
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=131072:raise ValueError('Invalid render settings size')
                settings=json.loads(self.rfile.read(size))
                if settings.get('format') not in CODEC_FORMATS or settings.get('quality') not in ('High','Balanced','Small'):raise ValueError('Unknown output format or quality')
                encoder=available_encoders()[resolve_codec(settings['format'],settings.get('codec'))]
                fps=settings.get('fps');start=settings.get('start');end=settings.get('end')
                if fps not in (30,60) or not all(isinstance(v,(int,float)) and __import__('math').isfinite(v) for v in (start,end)) or not 0<=start<end<=86400:raise ValueError('Invalid render time or frame rate')
                if not isinstance(settings.get('audio'),list) or len(settings['audio'])>256:raise ValueError('Invalid audio sources')
                for entry in settings['audio']:
                    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',entry.get('id','')):raise ValueError('Invalid media source ID')
                ident=secrets.token_hex(16)
                fixed_renders[ident]=FixedFrameRender(Path(temp.name)/('fixed-'+ident),settings,encoder)
                return self.reply(dict(id=ident,frames=fixed_renders[ident].total))
            if post and route.startswith('/api/render/source/'):
                _,_,_,_,ident,key=route.split('/')
                session=fixed_renders[ident]
                session.source(key,self.rfile,int(self.headers.get('Content-Length','0')))
                return self.reply(dict(ok=True))
            if post and route.startswith('/api/render/frames/'):
                ident=route.split('/')[-1]
                count=fixed_renders[ident].frames(self.rfile,int(self.headers.get('Content-Length','0')))
                return self.reply(dict(received=count))
            if post and route.startswith('/api/render/finish/'):
                ident=route.split('/')[-1];session=fixed_renders[ident]
                output=Path(temp.name)/(ident+'.'+session.settings['format'])
                size=session.finish(output)
                renders[ident]=output;render_codecs[ident]=session.settings['codec']
                del fixed_renders[ident]
                session.cancel()
                return self.reply(dict(id=ident,bytes=size,frames=session.count))
            if post and route.startswith('/api/render/cancel/'):
                ident=route.split('/')[-1]
                session=fixed_renders.pop(ident,None)
                if session:session.cancel()
                return self.reply(dict(cancelled=True))
            if not post and route=='/api/accounts':
                return self.reply(dict(configured={p:bool(cfg.get(p+'_id') and cfg.get(p+'_secret')) for p in ('meta','google')},youtube=tokens.get('google',{}).get('name'),pages=[dict(id=p['id'],name=p['name'],instagram=bool(p.get('instagram_business_account'))) for p in tokens.get('pages',{}).values()]))
            if post and route.startswith('/api/connect/'):
                provider=route.split('/')[-1]
                if provider not in ('meta','google') or not all(cfg.get(provider+'_'+k) for k in ['id','secret']):raise ValueError('Set app credentials in publish-settings.json and restart FrameCast')
                state=secrets.token_urlsafe(32);states[state]=(provider,time.time()+600)
                args=dict(client_id=cfg[provider+'_id'],state=state,redirect_uri=ORIGIN+'/callback/'+provider,response_type='code')
                base='https://accounts.google.com/o/oauth2/v2/auth'
                if provider=='google':args.update(access_type='offline',prompt='consent',scope='https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly')
                else:
                    base='https://www.facebook.com/'+cfg.get('meta_version','v25.0')+'/dialog/oauth'
                    args.update(scope='pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish')
                    if cfg.get('meta_config_id'):args['config_id']=cfg['meta_config_id']
                return self.reply(dict(url=base+'?'+urlencode(args)))
            if post and route=='/api/encode':
                fmt=qs['format'][0];preset=qs['quality'][0]
                if fmt not in ('mp4','mov','webm') or preset not in ('High','Balanced','Small'): raise ValueError('Unknown encoding preset')
                video_codec=resolve_codec(fmt,qs.get('codec',[None])[0])
                ident=secrets.token_hex(16);dst=Path(temp.name)/(ident+'.'+fmt);src=Path(temp.name)/(ident+'.source.'+('mp4' if 'mp4' in self.headers.get('Content-Type','') else 'webm'))
                remaining=int(self.headers['Content-Length'])
                try:
                    with src.open('wb') as f:
                        while remaining>0:
                            part=self.rfile.read(min(1048576,remaining))
                            if not part:raise ValueError('Incomplete recording')
                            f.write(part);remaining-=len(part)
                    encode(src,dst,fmt,preset,60 if qs.get('fps',['60'])[0]=='60' else 30,video_codec);renders[ident]=dst;render_codecs[ident]=video_codec
                finally:src.unlink(missing_ok=True)
                return self.reply(dict(id=ident,bytes=dst.stat().st_size))
            if not post and route.startswith('/media/'):
                p=renders[route.split('/')[-1]];self.send_response(200);self.send_header('Content-Type',{'mp4':'video/mp4','mov':'video/quicktime','webm':'video/webm'}[p.suffix[1:]]);self.send_header('Content-Length',str(p.stat().st_size));self.end_headers()
                with p.open('rb') as f:shutil.copyfileobj(f,self.wfile)
                return
            if post and route=='/api/publish':
                n=int(self.headers['Content-Length'])
                if n>65536:raise ValueError('Metadata too large')
                m=json.loads(self.rfile.read(n));asset=m['asset'];platform=m['platform']
                if renders[asset].suffix!='.mp4':raise ValueError('Render MP4 for publishing')
                if render_codecs.get(asset,'h264')!='h264':raise ValueError('Use H.264 MP4 for the current publishing integration. This codec export is available for download.')
                if platform not in ('Instagram Reels','Facebook Page Reels','YouTube','YouTube Shorts'):raise ValueError('Unknown destination')
                if m.get('privacy') not in ('private','unlisted','public'):raise ValueError('Select visibility')
                if platform.startswith('YouTube') and not tokens.get('google'):raise ValueError('Connect YouTube first')
                if not platform.startswith('YouTube'):
                    page=tokens.get('pages',{}).get(m.get('page'))
                    if not page:raise ValueError('Choose a connected Facebook Page')
                    if platform=='Instagram Reels' and not page.get('instagram_business_account'):raise ValueError('Select a Page linked to Instagram')
                key=(asset,('YouTube' if platform.startswith('YouTube') else platform),m['page'] if not platform.startswith('YouTube') else tokens['google']['channel_id'])
                with lock:
                    existing=next((i for i,j in jobs.items() if j['key']==key and not j.get('retryable')),None)
                    if existing:return self.reply(dict(id=existing))
                    ident=secrets.token_hex(16);job=jobs[ident]=dict(key=key,status='Queued')
                    threading.Thread(target=upload,args=(job,asset,platform,m),daemon=True).start()
                return self.reply(dict(id=ident))
            if not post and route.startswith('/api/job/'):return self.reply(jobs[route.split('/')[-1]])
            name=route.lstrip('/') or 'index.html'
            if not post and name in PUBLIC:return self.reply((ROOT/name).read_bytes(),{'html':'text/html','js':'text/javascript','css':'text/css'}[name.split('.')[-1]]+'; charset=utf-8')
            return self.reply({},code=404)
        except Exception as e:return self.reply({'error':str(e)},code=400)

if __name__=='__main__':
    if not shutil.which('ffmpeg'):print('FFmpeg not found: editing is available; install FFmpeg for MP4 / MOV conversion.',flush=True)
    server=ThreadingHTTPServer(('127.0.0.1',4173),Handler)
    print('FrameCast Studio: '+ORIGIN,flush=True);webbrowser.open(ORIGIN)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();temp.cleanup()
