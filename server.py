"""Single-user local publishing bridge. Python 3.10+ and FFmpeg."""
import json, os, re, secrets, shutil, subprocess, tempfile, threading, time, webbrowser, socket, traceback, sys
from offline_render import FixedFrameRender
from native_render import NativeJob
from export_budget import budget
from upload_transport import youtube_upload, youtube_processing, ProgressReader
from licensing import machine_code
from online_license import status as license_status, activate as activate_license
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from functools import lru_cache

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
APP_DIR = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else ROOT
if getattr(sys, 'frozen', False):
    os.environ['PATH'] = str(ROOT) + os.pathsep + str(APP_DIR) + os.pathsep + os.environ.get('PATH', '')
ORIGIN = 'http://localhost:4173'
PUBLIC = {'index.html','studio.css','studio.js','timeline.js','layers.js','tracks.js','sample.js','publish.js','editing.js','workspace.js','image-editing.js','editor-core.js','editor-workspace.js','editor-workspace.css','ticker-inspector.js','render-ranges.js','frame-seek.js','render-progress.js','deterministic-export.js','fast-export.js','poknapham-logo.png'}
CONFIG = APP_DIR/'publish-settings.json'
LICENSE_FILE = (Path(os.environ.get('LOCALAPPDATA', str(APP_DIR)))/'PoknaphamEditingSuite'/'license.key') if getattr(sys, 'frozen', False) else APP_DIR/'license.key'
LICENSE_SERVER_CONFIG = ROOT/'license-server.json'
OWNER_DEVICE = None  # Only the separately generated owner EXE embeds a PC code.
APP_VERSION = '0.12.15'

def owner_access():
    return bool(getattr(sys,'frozen',False) and OWNER_DEVICE and machine_code()==OWNER_DEVICE)
cfg = json.loads(CONFIG.read_text(encoding='utf-8-sig')) if CONFIG.exists() else {}
temp = tempfile.TemporaryDirectory()
renders, states, jobs, tokens = {}, {}, {}, {}
render_codecs = {}
fixed_renders = {}
native_jobs = {}
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
    if codec not in available_encoders(): raise ValueError('This FFmpeg build does not include '+codec+'. Install a full FFmpeg build and restart Poknapham Editing Suite.')
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
        job.update(status='Uploading',started=time.time(),bytesSent=0)
        size=str(path.stat().st_size)
        caption='\n'.join(filter(None,[meta.get('caption'),meta.get('tags')]))
        if platform.startswith('YouTube'):
            body={'snippet':{'title':meta['title'],'description':caption},'status':{'privacyStatus':meta['privacy']}}
            headers={**auth(google_token()),'Content-Type':'application/json','X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':size}
            session=http('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status','POST',json.dumps(body).encode(),headers,True)['Location']
            result=youtube_upload(path,session,google_token,job)
            job.update(id=result['id'],uploadSeconds=round(time.time()-job['started'],1))
            youtube_processing(job,lambda:http('https://www.googleapis.com/youtube/v3/videos?'+urlencode(dict(part='processingDetails,status',id=result['id'])),headers=auth(google_token())))
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
            http(target,'POST',ProgressReader(f,job,int(size)),{'Authorization':'OAuth '+token,'offset':'0','file_size':size,'Content-Length':size,'Content-Type':'application/octet-stream'})
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
    except Exception as e: job.update(status='Failed',error=str(e),retryable=False)
    finally: job['elapsed']=round(time.time()-job.get('started',time.time()),1)

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def setup(self):
        super().setup()
        self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

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
            if getattr(sys, 'frozen', False) and not owner_access():
                if not post and route=='/poknapham-logo.png':
                    return self.reply((ROOT/'poknapham-logo.png').read_bytes(),'image/png')
                if not post and route=='/license':
                    page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Activate Poknapham Editing Suite</title><style>body{font:16px system-ui;background:#101827;color:#f0f3f8;min-height:100vh;display:grid;place-items:center;margin:0}main{max-width:550px;padding:38px;background:#1b2638;border:1px solid #40506a;border-radius:14px}img{width:80px;height:80px;border-radius:50%;object-fit:cover;background:white}h1{font-size:25px}textarea{width:100%;box-sizing:border-box;min-height:110px;background:#111a2a;color:white;padding:12px;border:1px solid #66758c;border-radius:8px}code{display:block;padding:12px;background:#111a2a;word-break:break-all;user-select:all}button{background:#e9c573;color:#101827;border:0;border-radius:8px;padding:12px 20px;font-weight:bold;cursor:pointer}p{line-height:1.5;color:#b7c7de}</style><main><img src="/poknapham-logo.png" alt=""><h1>Poknapham Editing Suite</h1><p>Internet access and an active serial are required. One customer account can register one Windows PC. The editor stops when the term expires or is revoked.</p><p>This PC code:</p><code id="device">__DEVICE__</code><p><button id="copy" type="button">Copy PC code</button></p><p>Paste the serial for the current three-month term.</p><textarea id="key" aria-label="Serial number" placeholder="PES-..."></textarea><p><button id="activate">Activate serial</button></p><p id="message"></p></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('device').textContent);document.getElementById('activate').onclick=async()=>{const message=document.getElementById('message');try{const response=await fetch('/api/license',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:document.getElementById('key').value})});const result=await response.json();if(!response.ok)throw Error(result.error);message.textContent='Activated for '+result.customer+' until '+result.expires+'. Opening editor…';setTimeout(()=>location.href='/',1000)}catch(error){message.textContent=error.message}}</script></html>'''
                    return self.reply(page.replace('__DEVICE__',machine_code()),'text/html; charset=utf-8')
                if post and route=='/api/license':
                    size=int(self.headers.get('Content-Length','0'))
                    if not 0<size<=8192: raise ValueError('Invalid license request')
                    payload=json.loads(self.rfile.read(size))
                    if not isinstance(payload.get('key'),str) or len(payload['key'])>4096: raise ValueError('Invalid license key')
                    activated=activate_license(payload['key'], LICENSE_FILE, LICENSE_SERVER_CONFIG)
                    return self.reply({k:activated[k] for k in ('customer','starts','expires')})
                if not license_status(LICENSE_FILE,LICENSE_SERVER_CONFIG):
                    self.close_connection=True
                    if route.startswith('/api/') or post: return self.reply({'error':'License inactive. Open /license to activate.'},code=403)
                    self.send_response(302);self.send_header('Location','/license');self.send_header('Content-Length','0');self.end_headers();return
            # These commands ignore their JSON payload, but persistent HTTP requires
            # consuming it before accepting the next request on the connection.
            if post and route.startswith(('/api/render/finish/','/api/render/fast-finish/','/api/render/native-start/','/api/render/cancel/','/api/connect/')):
                size=int(self.headers.get('Content-Length','0'))
                if not 0<=size<=65536:raise ValueError('Invalid command size')
                self.rfile.read(size)
            if not post and route.startswith('/callback/'):
                provider=route.split('/')[-1]; state=states.pop(qs.get('state',[''])[0],None)
                if not state or state[0]!=provider or state[1]<time.time(): raise ValueError('Sign-in expired')
                if 'code' not in qs: raise ValueError('Sign-in cancelled or denied. Return to Poknapham Editing Suite and reconnect.')
                oauth(provider,qs['code'][0]);return self.reply('Account connected. Close this tab and refresh accounts in Poknapham Editing Suite.','text/plain')
            if not post and route=='/api/health':
                return self.reply(dict(service='poknapham-local',version=APP_VERSION,ffmpeg=bool(shutil.which('ffmpeg')),fixedFrames=True,encoders=available_encoders()))
            if post and route=='/api/render/start':
                if not shutil.which('ffmpeg') or not shutil.which('ffprobe'): raise ValueError('Install FFmpeg and FFprobe for fixed-frame export')
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=131072:raise ValueError('Invalid render settings size')
                settings=json.loads(self.rfile.read(size))
                if settings.get('format') not in CODEC_FORMATS or settings.get('quality') not in ('High','Balanced','Small') or settings.get('speed','Balanced') not in ('Fast','Balanced','Quality'):raise ValueError('Unknown output format, quality or speed')
                encoder=available_encoders()[resolve_codec(settings['format'],settings.get('codec'))]
                fps=settings.get('fps');start=settings.get('start');end=settings.get('end')
                if fps not in (30,60) or not all(isinstance(v,(int,float)) and __import__('math').isfinite(v) for v in (start,end)) or not 0<=start<end<=86400:raise ValueError('Invalid render time or frame rate')
                if not isinstance(settings.get('audio'),list) or len(settings['audio'])>256 or not isinstance(settings.get('visual'),list) or len(settings['visual'])>256:raise ValueError('Invalid media sources')
                for entry in settings['audio']+settings['visual']:
                    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',entry.get('id','')):raise ValueError('Invalid media source ID')
                budget(settings)
                ident=secrets.token_hex(16)
                fixed_renders[ident]=FixedFrameRender(Path(temp.name)/('fixed-'+ident),settings,encoder)
                return self.reply(dict(id=ident,frames=fixed_renders[ident].total))
            if post and route.startswith('/api/render/source/'):
                _,_,_,_,ident,key=route.split('/')
                session=fixed_renders[ident]
                session.source(key,self.rfile,int(self.headers.get('Content-Length','0')))
                return self.reply(dict(ok=True))
            if not post and route.startswith('/api/render/diagnostics/'):
                session=fixed_renders[route.split('/')[-1]]
                session.log.flush()
                return self.reply(dict(settings=session.settings,framesReceived=session.count,
                    totalFrames=session.total,ffmpeg=(session.root/'ffmpeg.log').read_text(errors='replace')[-16000:]))
            if not post and route.startswith('/api/render/video/'):
                parts=route.split('/')
                if len(parts)!=6:raise ValueError('Invalid video frame route')
                _,_,_,_,ident,key=parts
                timestamp=float(qs.get('t',['nan'])[0])
                png=fixed_renders[ident].video_frame(key,timestamp)
                return self.reply(png,'image/png')
            if post and route.startswith('/api/render/frames/'):
                ident=route.split('/')[-1]
                count=fixed_renders[ident].frames(self.rfile,int(self.headers.get('Content-Length','0')))
                return self.reply(dict(received=count))
            if post and route.startswith('/api/render/native-asset/'):
                _,_,_,_,ident,name=route.split('/')
                if not re.fullmatch(r'(graphic|background)-[0-9]{1,3}',name):raise ValueError('Invalid graphic asset')
                session=fixed_renders[ident]
                if ident in native_jobs:raise ValueError('Export already started')
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<32*1024**2:raise ValueError('Invalid graphic size')
                data=self.rfile.read(size)
                if not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Invalid PNG graphic')
                (session.root/(name+'.png')).write_bytes(data)
                return self.reply(dict(ok=True))
            if post and route.startswith('/api/render/native-start/'):
                ident=route.split('/')[-1]
                if ident in native_jobs:raise ValueError('Export already started')
                native_jobs[ident]=NativeJob(fixed_renders[ident],Path(temp.name)/(ident+'.mp4'))
                return self.reply(dict(started=True))
            if not post and route.startswith('/api/render/native-status/'):
                ident=route.split('/')[-1];job=native_jobs[ident];data=job.snapshot()
                if data['state']=='Complete':
                    renders[ident]=job.output;render_codecs[ident]='h264'
                    data.update(id=ident,bytes=job.output.stat().st_size)
                return self.reply(data)
            if post and route.startswith('/api/render/native-pause/'):
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<128:raise ValueError('Invalid pause request')
                paused=json.loads(self.rfile.read(size)).get('paused')
                if not isinstance(paused,bool):raise ValueError('Invalid pause state')
                native_jobs[route.split('/')[-1]].pause(paused)
                return self.reply(dict(paused=paused))
            if post and route.startswith('/api/render/fast-overlay/'):
                ident=route.split('/')[-1];session=fixed_renders[ident]
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<32*1024**2:raise ValueError('Invalid overlay size')
                data=self.rfile.read(size)
                if not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Expected PNG overlay')
                (session.root/'overlay.png').write_bytes(data)
                return self.reply(dict(ok=True))
            if post and route.startswith('/api/render/fast-finish/'):
                ident=route.split('/')[-1];session=fixed_renders[ident];s=session.settings
                if session.cancelled or len(s.get('visual',[]))!=1 or s['codec']!='h264' or s['format']!='mp4':raise ValueError('Fast export requires one H.264 MP4 video')
                if budget(s):raise ValueError('Target size requires native or fixed-frame export, not the legacy overlay endpoint')
                key=s['visual'][0]['id'];source=session.sources.get(key);overlay=session.root/'overlay.png'
                if not source or not overlay.exists():raise ValueError('Upload video and overlay first')
                width,height=s.get('width'),s.get('height')
                if not all(isinstance(v,int) and 32<=v<=4096 and v%2==0 for v in (width,height)):raise ValueError('Invalid dimensions')
                output=Path(temp.name)/(ident+'.mp4')
                source_in=float(s.get('sourceIn',0));duration=(s['end']-s['start'])
                if source_in<0:raise ValueError('Invalid source time')
                encoder='h264_amf' if 'h264_amf' in subprocess.check_output(['ffmpeg','-hide_banner','-encoders'],text=True,errors='replace') else 'libx264'
                opts=['-c:v',encoder,'-pix_fmt','yuv420p']
                if encoder=='h264_amf':opts+=['-quality','speed' if s.get('speed')=='Fast' else 'balanced','-rc','cqp','-qp_i','20','-qp_p','22']
                else:opts+=['-preset','veryfast' if s.get('speed')=='Fast' else 'medium','-crf','18' if s['quality']=='High' else '23']
                cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-ss',str(source_in),'-i',str(source),'-i',str(overlay),'-filter_complex',f'[0:v]scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1[base];[base][1:v]overlay=0:0:format=auto,fps={s["fps"]}[out]','-map','[out]','-map','0:a:0?','-t',str(duration),*opts,'-c:a','aac','-b:a','192k','-movflags','+faststart',str(output)]
                session.mux_process=subprocess.Popen(cmd,stderr=session.log)
                failed=session.mux_process.wait()
                if failed and encoder=='h264_amf' and not session.cancelled:
                    encoder='libx264'
                    cpu=['-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-crf','18' if s['quality']=='High' else '23']
                    cmd=cmd[:cmd.index('-c:v')]+cpu+cmd[cmd.index('-c:a'):]
                    session.mux_process=subprocess.Popen(cmd,stderr=session.log)
                    failed=session.mux_process.wait()
                if failed:raise ValueError('Fast encoding failed; check FFmpeg log')
                if session.cancelled:raise ValueError('Render cancelled')
                probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','json',str(output)]))
                frames=int(probe['streams'][0]['nb_read_frames'])
                renders[ident]=output;render_codecs[ident]='h264';del fixed_renders[ident];session.cancel()
                return self.reply(dict(id=ident,bytes=output.stat().st_size,frames=frames,encoder=encoder))
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
                native_jobs.pop(ident,None)
                if session:session.cancel()
                return self.reply(dict(cancelled=True))
            if not post and route=='/api/accounts':
                return self.reply(dict(configured={p:bool(cfg.get(p+'_id') and cfg.get(p+'_secret')) for p in ('meta','google')},youtube=tokens.get('google',{}).get('name'),pages=[dict(id=p['id'],name=p['name'],instagram=bool(p.get('instagram_business_account'))) for p in tokens.get('pages',{}).values()]))
            if post and route.startswith('/api/connect/'):
                provider=route.split('/')[-1]
                if provider not in ('meta','google') or not all(cfg.get(provider+'_'+k) for k in ['id','secret']):raise ValueError('Set app credentials in publish-settings.json and restart Poknapham Editing Suite')
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
                if not isinstance(m.get('title'),str) or not m['title'].strip():raise ValueError('Enter a video title before publishing')
                if platform.startswith('YouTube') and len(m['title'])>100:raise ValueError('YouTube title must be at most 100 characters')
                if platform=='YouTube Shorts':
                    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height:format=duration','-of','json',str(renders[asset])],timeout=30))
                    video=probe['streams'][0]
                    if float(probe['format']['duration'])>180 or video['width']>video['height']:raise ValueError('YouTube Shorts requires a square or vertical video of at most 3 minutes. Export a shorter portrait range or choose YouTube.')
                key=(asset,('YouTube' if platform.startswith('YouTube') else platform),m['page'] if not platform.startswith('YouTube') else tokens['google']['channel_id'])
                with lock:
                    existing=next((i for i,j in jobs.items() if j['key']==key and not j.get('retryable')),None)
                    if existing:return self.reply(dict(id=existing))
                    ident=secrets.token_hex(16);job=jobs[ident]=dict(key=key,status='Queued')
                    threading.Thread(target=upload,args=(job,asset,platform,m),daemon=True).start()
                return self.reply(dict(id=ident))
            if not post and route.startswith('/api/job/'):
                job=jobs[route.split('/')[-1]]
                return self.reply({**job,'elapsed':job.get('elapsed',round(time.time()-job.get('started',time.time()),1))})
            name=route.lstrip('/') or 'index.html'
            if not post and name in PUBLIC:
                mime={'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css; charset=utf-8','png':'image/png'}[name.split('.')[-1]]
                return self.reply((ROOT/name).read_bytes(),mime)
            return self.reply({},code=404)
        except Exception as e:
            print('Poknapham request failed:', self.path, str(e), flush=True)
            traceback.print_exc()
            try:return self.reply({'error':str(e)},code=400)
            except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):return

if __name__=='__main__':
    if not shutil.which('ffmpeg'):print('FFmpeg not found: editing is available; install FFmpeg for MP4 / MOV conversion.',flush=True)
    server=ThreadingHTTPServer(('127.0.0.1',4173),Handler)
    print('Poknapham Editing Suite: '+ORIGIN,flush=True);webbrowser.open(ORIGIN)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();temp.cleanup()
