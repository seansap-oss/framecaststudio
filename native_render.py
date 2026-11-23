"""One-pass video + pre-rasterized ticker export, without per-frame HTTP traffic."""
import ctypes
import json
import math
import os
import signal
import subprocess
import threading
import time
from pathlib import Path
from offline_render import output_frames, verify_video
from export_budget import budget, rate_options


def number(value, low, high):
    if not isinstance(value,(int,float)) or not math.isfinite(value) or not low<=value<=high:
        raise ValueError('Invalid native export geometry or timing')
    return float(value)


def ticker_graph(settings, root):
    w,h=settings['width'],settings['height'];fps=settings['fps'];frames=output_frames(settings)
    if any(not isinstance(v,int) or v%2 or not 32<=v<=4096 for v in (w,h)):raise ValueError('Invalid output size')
    items=settings.get('nativeLayers',[])
    if not isinstance(items,list) or len(items)>128:raise ValueError('Too many native overlays')
    color=settings.get('background','#000000')
    import re
    if not re.fullmatch('#[a-fA-F0-9]{6}',color):raise ValueError('Invalid background')
    graph=[f'[0:v]setpts=PTS-STARTPTS,scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=0x{color[1:]},setsar=1,fps={fps}:start_time=0:eof_action=pass,tpad=stop_mode=clone:stop={math.ceil(.25*fps)+1},trim=end_frame={frames}[base]']
    inputs=[];current='base';idx=1
    for i,item in enumerate(items):
        kind=item.get('kind');x=number(item.get('x',0),-8192,8192);y=number(item.get('y',0),-8192,8192)
        first=number(item.get('start',0),0,86400);last=number(item.get('end',settings['end']),0,86400)
        asset=Path(root)/f'graphic-{i}.png'
        if not asset.exists():raise ValueError('Missing prepared graphic')
        inputs+=['-loop','1','-framerate',str(fps),'-i',str(asset)]
        stamp=f'g{i}'
        if kind=='static':graph.append(f'[{idx}:v]format=rgba[{stamp}]');idx+=1
        elif kind in ('horizontal','vertical'):
            bw=int(number(item.get('width'),1,8192));bh=int(number(item.get('height'),1,8192))
            background=Path(root)/f'background-{i}.png'
            if not background.exists():raise ValueError('Missing ticker background')
            inputs+=['-loop','1','-framerate',str(fps),'-i',str(background)]
            relative=f'(t+{settings["start"]}-{first})'
            if kind=='horizontal':
                text_width=number(item.get('textWidth'),0,16384);speed=number(item.get('speed'),0,16384)
                distance=f'{relative}*{speed}';cycle=bw+text_width
                distance=f'mod({distance},{cycle})' if item.get('repeat') else f'min({distance},{cycle})'
                px=f'{bw}-{distance}' if item.get('direction')=='left' else f'{distance}-{text_width}'
                graph.append(f'[{idx+1}:v][{idx}:v]overlay=x=\'{px}\':y=0:format=auto:eval=frame[{stamp}]')
            else:
                count=int(number(item.get('count'),1,128));travel=number(item.get('travel'),.1,86400);hold=number(item.get('hold'),0,86400);cycle=travel+hold
                elapsed=relative if item.get('repeat') else f'min({relative},{count*cycle-.001})'
                # crop y is evaluated per frame; text is rasterized once with the browser font/emoji.
                crop=f'{bh}*mod(floor({elapsed}/{cycle}),{count})'
                sign=1 if item.get('direction')=='up' else -1
                py=f'{sign*bh}*(1-min(1,mod({elapsed},{cycle})/{travel}))'
                graph.append(f'[{idx}:v]crop={bw}:{bh}:0:\'{crop}\'[text{i}]')
                graph.append(f'[{idx+1}:v][text{i}]overlay=x=0:y=\'{py}\':format=auto:eval=frame[{stamp}]')
            idx+=2
        else:raise ValueError('Unsupported native graphic')
        enable=f'gte(t+{settings["start"]},{first})*lt(t+{settings["start"]},{last})'
        graph.append(f'[{current}][{stamp}]overlay=x={x}:y={y}:format=auto:enable=\'{enable}\'[v{i}]');current=f'v{i}'
    graph.append(f'[{current}]format=yuv420p,trim=end_frame={frames},settb=expr=1/{fps},setpts=N[out]')
    return inputs,';'.join(graph)


class NativeJob:
    def __init__(self,session,output):
        self.session=session;self.output=Path(output);self.process=None;self.started=time.monotonic()
        self.state='Preparing';self.frame=0;self.error=None;self.encoder=None;self.paused=False
        self.timings={};self.phase_started=time.monotonic()
        self.thread=threading.Thread(target=self.run,daemon=True);self.thread.start()

    def phase(self, name):
        now=time.monotonic()
        self.timings[self.state]=self.timings.get(self.state,0)+now-self.phase_started
        self.phase_started=now;self.state=name

    def snapshot(self):
        return dict(timings={**self.timings,self.state:self.timings.get(self.state,0)+(0 if self.state in ('Complete','Failed') else time.monotonic()-self.phase_started)},state=self.state,frames=self.frame,total=self.session.total,encoder=self.encoder,
                    stage=self.session.stage,finalSeconds=self.session.final_seconds,error=self.error,elapsed=time.monotonic()-self.started,paused=self.paused)

    def pause(self,value):
        p=self.session.mux_process or self.process
        if not p or p.poll() is not None:raise ValueError('Encoder is not running')
        if self.paused==value:return
        if os.name=='nt':
            api=ctypes.windll.ntdll.NtSuspendProcess if value else ctypes.windll.ntdll.NtResumeProcess
            api.argtypes=[ctypes.c_void_p];api.restype=ctypes.c_long
            if api(ctypes.c_void_p(int(p._handle)))!=0:raise ValueError('Windows could not pause/resume the encoder')
        else:os.kill(p.pid,signal.SIGSTOP if value else signal.SIGCONT)
        self.paused=value;self.session.paused=value

    def run(self):
        s=self.session.settings
        try:
            if len(s['visual'])!=1 or s['codec']!='h264' or s['format']!='mp4':raise ValueError('Native ticker export requires one H.264 MP4 video')
            source=self.session.sources[s['visual'][0]['id']]
            extra,graph=ticker_graph(s,self.session.root)
            src_in=number(s.get('sourceIn',0),0,86400);duration=s['end']-s['start']
            # Reject a truncated source before starting; allow only the same small tail
            # discrepancy as the frame renderer, never a long frozen output.
            probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=duration','-of','json',str(source)],timeout=30))
            video_end=probe.get('streams',[{}])[0].get('duration')
            if video_end and src_in+duration>float(video_end)+.25:raise ValueError('Export extends beyond the source video. Trim the range or relink the source.')
            encoders=subprocess.check_output(['ffmpeg','-hide_banner','-encoders'],text=True,stderr=subprocess.DEVNULL,timeout=15)
            choices=['h264_amf','libx264'] if 'h264_amf' in encoders else ['libx264']
            for encoder in choices:
                if self.session.cancelled:return
                self.encoder=encoder;self.frame=0;self.phase('Rendering')
                quality={'High':18,'Balanced':23,'Small':29}[s['quality']]
                opts=['-c:v',encoder]
                if encoder=='h264_amf':opts+=['-quality','speed' if s.get('speed')=='Fast' else 'balanced','-rc','cqp','-qp_i',str(quality),'-qp_p',str(quality+2)]
                else:opts+=['-preset',{'Fast':'veryfast','Balanced':'medium','Quality':'slow'}[s.get('speed','Balanced')],'-crf',str(quality),'-threads',str(min(8,os.cpu_count() or 2))]
                if budget(s):
                    if encoder=='h264_amf':
                        opts=['-c:v',encoder,'-quality','speed' if s.get('speed')=='Fast' else 'balanced']
                    else:
                        pos=opts.index('-crf');del opts[pos:pos+2]
                    opts+=rate_options(s,encoder)
                cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-xerror','-y','-ss',str(src_in),'-i',str(source),*extra,
                     '-filter_complex_threads','2','-filter_complex',graph,'-map','[out]','-an',
                     '-frames:v',str(self.session.total),'-r',str(s['fps']),'-fps_mode','cfr',*opts,
                     '-progress','pipe:1','-nostats',str(self.session.silent)]
                self.process=self.session.mux_process=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=self.session.log,text=True)
                for line in self.process.stdout:
                    if line.startswith('frame='):self.frame=int(line.strip().split('=')[1])
                self.process.stdout.close()
                rc=self.process.wait()
                if rc==0:break
            if self.session.cancelled:self.state='Cancelled';return
            if rc:raise ValueError('Native encoder failed. Download the error report for FFmpeg details.')
            self.phase('Finalizing')
            self.session.mux(self.output)
            self.phase('Verifying')
            actual=verify_video(self.output,self.session.total)
            self.frame=actual;self.phase('Complete')
        except Exception as error:
            self.error=str(error);self.phase('Failed')
