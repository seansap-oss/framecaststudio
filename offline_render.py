from export_budget import budget, rate_options
"""Fixed-frame local renderer. Frames arrive in timeline order; FFmpeg never watches the UI clock."""
import json
import math
import os
import shutil
import struct
import subprocess
import threading
import time
from pathlib import Path


class FinalizationWatch:
    """Only advancing media time/bytes counts; FFmpeg speed/fps chatter does not."""
    def __init__(self, duration, now):
        self.duration=duration;self.last=now;self.started=now;self.previous=now
        self.media=0;self.size=0;self.paused_time=0
    def check(self, media, size, now, paused=False):
        delta=max(0,now-self.previous);self.previous=now
        if paused:
            self.paused_time+=delta;self.last=now;return
        if media>self.media or size>self.size:self.last=now
        self.media=max(self.media,media);self.size=max(self.size,size)
        if now-self.last>120:raise ValueError('Audio/file finalization made no progress for 120 seconds. Download the render error report.')
        if now-self.started-self.paused_time>max(180,self.duration*2+60):
            raise ValueError('Audio/file finalization exceeded its time limit. Download the render error report.')


def output_frames(settings):
    """One output frame for each timeline timestamp strictly before the range end."""
    return math.ceil((settings['end'] - settings['start']) * settings['fps'] - 1e-8)


def verify_video(path, expected):
    # MP4 sample tables contain the frame count; avoid decoding the entire video twice.
    data = json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0',
        '-show_entries','stream=nb_frames','-of','json',str(path)], timeout=30))
    value = data.get('streams',[{}])[0].get('nb_frames')
    if value in (None, 'N/A'):
        data = json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0',
            '-count_packets','-show_entries','stream=nb_read_packets','-of','json',str(path)], timeout=120))
        value = data['streams'][0]['nb_read_packets']
    actual = int(value)
    if actual != expected:
        raise ValueError(f'Output verification failed: expected {expected} frames, got {actual}')
    return actual


class CleanVideoEnd(EOFError):
    """No bytes for the next frame; unlike an incomplete/corrupt PNG."""


class VideoFrameSource:
    """Keep one sequential FFmpeg decoder alive instead of seeking Chrome per frame."""
    def __init__(self, path, fps, log):
        self.path, self.fps, self.log = path, fps, log
        self.process = None
        self.origin = 0
        self.index = -1
        self.pending = b''
        self.last = None
        self.end_repeats = 0
        self.video_end = self.probe_end()
        self.lock = threading.Lock()

    def probe_end(self):
        try:
            data = json.loads(subprocess.check_output([
                'ffprobe', '-v', 'error', '-select_streams', 'v:0',
                '-show_entries', 'stream=duration', '-of', 'json', str(self.path)], timeout=30))
            value = float(data['streams'][0]['duration'])
            return value if math.isfinite(value) and value > 0 else None
        except (OSError, subprocess.SubprocessError, KeyError, IndexError, ValueError):
            return None

    def tail_allowed(self, target):
        # Only bridge a small, known video/container duration mismatch. Never hide
        # an early decoder exit or an incomplete PNG as a repeated good frame.
        tolerance = max(.25, 2 / self.fps)
        last_time = self.origin + self.index / self.fps
        return (self.last is not None and self.video_end is not None
                and self.video_end - tolerance <= last_time <= self.video_end + tolerance
                and target <= self.video_end + tolerance
                and self.process.wait(timeout=5) == 0)

    def close(self):
        if self.process:
            if self.process.poll() is None: self.process.kill()
            self.process.wait()
            self.process.stdout.close()
            self.process = None
        self.pending = b''

    def restart(self, target):
        self.close()
        self.origin = target
        self.index = -1
        self.last = None
        self.process = subprocess.Popen(
            ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error',
             '-xerror', '-ss', f'{target:.8f}', '-i', str(self.path), '-an',
             '-vf', f'fps={self.fps}:eof_action=pass', '-f', 'image2pipe', '-vcodec', 'png', '-compression_level', '1', '-pix_fmt', 'rgb24', 'pipe:1'],
            stdout=subprocess.PIPE, stderr=self.log)

    def read_exact(self, count, frame_start=False):
        data = bytearray()
        while len(data) < count:
            block = os.read(self.process.stdout.fileno(), count - len(data))
            if not block:
                if frame_start and not data: raise CleanVideoEnd()
                raise ValueError('FFmpeg returned an incomplete source frame')
            data.extend(block)
        return bytes(data)

    def next_png(self):
        signature = self.read_exact(8, frame_start=True)
        if signature != b'\x89PNG\r\n\x1a\n':
            raise ValueError('Invalid PNG source frame from FFmpeg')
        parts = [signature]
        size = 8
        while True:
            header = self.read_exact(8)
            length = struct.unpack('>I', header[:4])[0]
            size += length + 12
            if size > 256 * 1024**2:
                raise ValueError('Decoded source frame is too large')
            parts.extend((header, self.read_exact(length + 4)))
            if header[4:] == b'IEND': return b''.join(parts)

    def frame(self, target):
        with self.lock:
            current = self.origin + max(0, self.index) / self.fps
            if not self.process or target < self.origin - .25 / self.fps or target - current > 20:
                # Start just before a requested tail frame so a valid final frame
                # is available even when the first request is at the source end.
                origin = target
                if self.video_end is not None and target >= self.video_end - .5:
                    origin = max(0, min(target, self.video_end - .5))
                self.restart(origin)
            wanted = round((target - self.origin) * self.fps)
            if wanted < self.index:
                self.restart(target)
                wanted = 0
            process = self.process
            expired = threading.Event()
            def deadline():
                expired.set()
                if process.poll() is None:
                    try: process.kill()
                    except OSError: pass
            timer = threading.Timer(30, deadline)
            timer.daemon = True
            timer.start()
            try:
                while self.index < wanted:
                    try:
                        self.last = self.next_png()
                    except CleanVideoEnd:
                        if expired.is_set() or not self.tail_allowed(target):
                            raise ValueError('Unexpected end of source video; no valid frame at this time')
                        self.end_repeats += 1
                        return self.last
                    self.index += 1
                return self.last
            except (OSError, ValueError) as error:
                if expired.is_set():
                    raise ValueError(f'Source decoder stalled at {target:.3f}s for 30 seconds. Source: {self.path.name}') from error
                raise ValueError(f'Source decode failed at {target:.3f}s: {error}') from error
            finally:
                timer.cancel()


def video_options(fmt, preset, codec, encoder, speed='Balanced', settings=None):
    quality = {'h264': (29, 23, 18), 'hevc': (30, 25, 20), 'av1': (38, 30, 24), 'vp9': (38, 32, 26)}[codec][('Small', 'Balanced', 'High').index(preset)]
    args = ['-c:v', encoder, '-crf', str(quality), '-pix_fmt', 'yuv420p', '-threads', '2']
    if speed not in ('Fast','Balanced','Quality'):raise ValueError('Invalid encoding speed')
    if codec == 'h264': args += ['-preset', {'Fast':'veryfast','Balanced':'medium','Quality':'slow'}[speed]]
    elif codec == 'hevc': args += ['-preset', {'Fast':'fast','Balanced':'medium','Quality':'slow'}[speed], '-x265-params', 'pools=2:frame-threads=2:log-level=error', '-tag:v', 'hvc1']
    elif encoder == 'libsvtav1': args += ['-preset', {'Fast':'10','Balanced':'8','Quality':'6'}[speed], '-svtav1-params', 'lp=2']
    elif codec == 'av1': args += ['-b:v', '0', '-cpu-used', {'Fast':'8','Balanced':'6','Quality':'4'}[speed]]
    else: args += ['-b:v', '0', '-deadline', 'good', '-cpu-used', {'Fast':'6','Balanced':'4','Quality':'2'}[speed]]
    if settings and budget(settings):
        pos=args.index('-crf');del args[pos:pos+2]
        args += rate_options(settings, encoder)
    return args


class FixedFrameRender:
    def __init__(self, root, settings, encoder):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.settings = settings
        self.encoder = encoder
        self.total = output_frames(settings)
        self.count = 0
        self.sources = {}
        self.video_decoders = {}
        self.process = None
        self.mux_process = None
        self.lock = threading.Lock()
        self.cancelled = False
        self.paused = False
        self.stage = "Preparing"
        self.final_seconds = 0
        # MP4 preserves the encoder time base; millisecond-rounded MKV timestamps
        # can introduce uneven 60fps timestamps when video is copied into MP4.
        self.silent = self.root / 'silent.mp4'
        self.log = (self.root / 'ffmpeg.log').open('wb')

    def source(self, key, stream, size):
        if self.process or key not in {entry['id'] for entry in self.settings['audio'] + self.settings.get('visual', [])}:
            raise ValueError('Unknown or late media source')
        if key in self.sources: raise ValueError('Media source already uploaded')
        if not 0 < size <= 30 * 1024**3: raise ValueError('Invalid media size')
        path = self.root / ('source-' + key)
        with path.open('wb') as target:
            while size:
                block = stream.read(min(size, 1024**2))
                if not block: raise ValueError('Incomplete media upload')
                target.write(block)
                size -= len(block)
        self.sources[key] = path

    def video_frame(self, key, timestamp):
        if self.cancelled or key not in {entry['id'] for entry in self.settings.get('visual', [])}:
            raise ValueError('Unknown video source')
        if not math.isfinite(timestamp) or timestamp < 0:
            raise ValueError('Invalid video timestamp')
        path = self.sources.get(key)
        if not path: raise ValueError('Upload video source before rendering')
        if key not in self.video_decoders:
            self.video_decoders[key] = VideoFrameSource(path, self.settings['fps'], self.log)
        return self.video_decoders[key].frame(timestamp)

    def start_encoder(self):
        s = self.settings
        cmd = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
               '-f', 'image2pipe', '-framerate', str(s['fps']), '-vcodec', 'png', '-i', 'pipe:0',
               '-an', *video_options(s['format'], s['quality'], s['codec'], self.encoder,s.get('speed','Balanced'),s), str(self.silent)]
        self.process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=self.log)

    def frames(self, stream, size):
        if not 0 < size <= 64 * 1024**2: raise ValueError('Invalid frame batch')
        with self.lock:
            if self.cancelled: raise ValueError('Render cancelled')
            if not self.process: self.start_encoder()
            remaining = size
            while remaining:
                header = stream.read(4)
                if len(header) != 4: raise ValueError('Incomplete frame batch')
                length = struct.unpack('>I', header)[0]
                remaining -= 4
                if not 8 < length <= remaining or self.count >= self.total:
                    raise ValueError('Unexpected frame payload or frame count')
                payload = stream.read(length)
                if len(payload) != length or not payload.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise ValueError('Invalid PNG frame')
                remaining -= length
                try:
                    self.process.stdin.write(payload)
                except BrokenPipeError:
                    raise ValueError('Video encoder stopped; check local FFmpeg') from None
                self.count += 1
            return self.count

    def finish(self, output):
        with self.lock:
            if self.cancelled: raise ValueError('Render cancelled')
            if self.count != self.total: raise ValueError(f'Expected {self.total} frames, received {self.count}')
            self.process.stdin.close()
        if self.process.wait(timeout=3600): raise ValueError('Video encoder failed; check FFmpeg log')
        if self.cancelled: raise ValueError('Render cancelled')
        self.log.flush()
        self.mux(output)
        if self.cancelled: raise ValueError('Render cancelled')
        verify_video(output, self.total)
        return output.stat().st_size

    def mux(self, output):
        s = self.settings
        duration = self.total / s['fps']
        # Audio is decoded from the originals, aligned to the same timeline and mixed only once.
        active = []
        for entry in s['audio']:
            path = self.sources.get(entry['id'])
            if not path or entry.get('mute') or not entry.get('volume'): continue
            try:
                streams = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'a',
                    '-show_entries', 'stream=index', '-of', 'json', str(path)], timeout=30))['streams']
            except (subprocess.CalledProcessError, ValueError): streams = []
            if streams: active.append((entry, path))
        cmd = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(self.silent)]
        for entry, path in active:
            limit = max(0., float(entry.get('sourceIn',0)) + min(float(entry['end']),float(s['end'])) - float(entry['start']))
            cmd += ['-t', str(limit), '-i', str(path)]
        filters = []
        inputs = []
        for i, (entry, _) in enumerate(active, 1):
            first = max(float(entry['start']), float(s['start']))
            last = min(float(entry['end']), float(s['end']))
            if last <= first: continue
            source_in = max(0., float(entry.get('sourceIn', 0)) + first - float(entry['start']))
            offset = max(0., first - float(s['start']))
            level = max(0., min(2., float(entry['volume']) / 100))
            if entry.get('bus') == 'bed': level *= s['bed'] / 100
            else: level *= s['clip'] / 100
            filt = f'[{i}:a]atrim=start={source_in:.6f}:duration={last-first:.6f},asetpts=PTS-STARTPTS,aresample=48000,volume={level:.6f}'
            if offset: filt += f',adelay={round(offset*1000)}:all=1'
            filt += f'[a{i}]'
            filters.append(filt)
            inputs.append(f'[a{i}]')
        if inputs:
            filters.append(''.join(inputs)+f'amix=inputs={len(inputs)}:normalize=0:dropout_transition=0,atrim=duration={duration:.6f}[program]')
            last = '[program]'
            effects = []
            for kind, freq in [('bass', 160), ('equalizer', 1000), ('treble', 5000)]:
                db = float(s.get(kind, 0))
                if db:
                    effects.append(f'{kind}=g={db}:f={freq}' if kind != 'equalizer' else f'equalizer=f={freq}:t=o:w=1:g={db}')
            hum = int(s.get('hum', 0))
            if hum:
                effects += [f'equalizer=f={hum*i}:t=q:w=18:g=-24' for i in (1, 2, 3)]
            noise = int(s.get('noise', 0))
            if noise: effects.append(f'lowpass=f={noise}')
            if s.get('compress'):
                threshold = 10 ** (float(s.get('threshold', -20)) / 20)
                effects.append(f'acompressor=threshold={threshold:.6f}:ratio={float(s.get("ratio", 3)):.2f}')
            effects.append(f'volume={s["master"]/100:.6f}')
            filters.append(last+','.join(effects)+f',apad=whole_len={round(duration*48000)},atrim=end_sample={round(duration*48000)}[out]')
            cmd += ['-filter_complex', ';'.join(filters), '-map', '0:v:0', '-map', '[out]']
        else:
            cmd += ['-f', 'lavfi', '-t', str(duration), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v:0', '-map', '1:a:0']
        cmd += ['-c:v', 'copy', '-c:a', 'libopus' if s['format'] == 'webm' else 'aac',
                '-ar', '48000', '-b:a', str(budget(s)[1]) if budget(s) else '192k']
        if s['format'] != 'webm': cmd += ['-movflags', '+faststart']
        progress = self.root / 'finalize-progress.txt'
        cmd += ['-progress',str(progress),'-nostats',str(output)]
        self.stage = 'Mixing audio / writing MP4'
        with self.lock:
            if self.cancelled: raise ValueError('Render cancelled')
            self.mux_process = subprocess.Popen(cmd, stderr=self.log)
        watch=FinalizationWatch(duration,time.monotonic())
        while self.mux_process.poll() is None:
            if self.cancelled: raise ValueError('Render cancelled')
            payload=''
            if progress.exists():
                with progress.open('rb') as handle:
                    handle.seek(max(0,progress.stat().st_size-65536))
                    payload=handle.read().decode(errors='replace')
            size = output.stat().st_size if output.exists() else 0
            for line in payload.splitlines():
                if line.startswith('out_time_us='):
                    try: self.final_seconds = max(self.final_seconds,int(line.split('=')[1]) / 1e6)
                    except ValueError: pass
            if self.final_seconds>=duration-.1:self.stage='Closing MP4 / preparing playback'
            try:watch.check(self.final_seconds,size,time.monotonic(),self.paused)
            except ValueError:
                self.mux_process.kill();self.mux_process.wait()
                raise
            time.sleep(.2)
        if self.mux_process.returncode: raise ValueError('Audio mix failed; check FFmpeg log')
        self.stage = 'Checking output frame count' 

    def cancel(self):
        with self.lock:
            self.cancelled = True
            for decoder in self.video_decoders.values(): decoder.close()
            if self.process and self.process.poll() is None:
                self.process.kill()
                self.process.wait()
            if self.mux_process and self.mux_process.poll() is None:
                self.mux_process.kill()
                self.mux_process.wait()
            self.log.close()
            shutil.rmtree(self.root, ignore_errors=True)
