"""Fixed-frame local renderer. Frames arrive in timeline order; FFmpeg never watches the UI clock."""
import json
import math
import os
import shutil
import struct
import subprocess
import threading
from pathlib import Path


class VideoFrameSource:
    """Keep one sequential FFmpeg decoder alive instead of seeking Chrome per frame."""
    def __init__(self, path, fps, log):
        self.path, self.fps, self.log = path, fps, log
        self.process = None
        self.origin = 0
        self.index = -1
        self.pending = b''
        self.last = None
        self.lock = threading.Lock()

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
             '-ss', f'{target:.8f}', '-i', str(self.path), '-an',
             '-vf', f'fps={self.fps}', '-f', 'image2pipe', '-vcodec', 'png', '-pix_fmt', 'rgb24', 'pipe:1'],
            stdout=subprocess.PIPE, stderr=self.log)

    def read_exact(self, count):
        data = bytearray()
        while len(data) < count:
            block = os.read(self.process.stdout.fileno(), count - len(data))
            if not block: raise ValueError('FFmpeg ended before a complete source frame was decoded')
            data.extend(block)
        return bytes(data)

    def next_png(self):
        signature = self.read_exact(8)
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
            if not self.process or target < self.origin - .25 / self.fps or target - self.origin > 20:
                self.restart(target)
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
                    self.last = self.next_png()
                    self.index += 1
                return self.last
            except (OSError, ValueError) as error:
                if expired.is_set():
                    raise ValueError(f'Source decoder stalled at {target:.3f}s for 30 seconds. Source: {self.path.name}') from error
                raise ValueError(f'Source decode failed at {target:.3f}s: {error}') from error
            finally:
                timer.cancel()


def video_options(fmt, preset, codec, encoder, speed='Balanced'):
    quality = {'h264': (29, 23, 18), 'hevc': (30, 25, 20), 'av1': (38, 30, 24), 'vp9': (38, 32, 26)}[codec][('Small', 'Balanced', 'High').index(preset)]
    args = ['-c:v', encoder, '-crf', str(quality), '-pix_fmt', 'yuv420p', '-threads', '2']
    if speed not in ('Fast','Balanced','Quality'):raise ValueError('Invalid encoding speed')
    if codec == 'h264': args += ['-preset', {'Fast':'veryfast','Balanced':'medium','Quality':'slow'}[speed]]
    elif codec == 'hevc': args += ['-preset', {'Fast':'fast','Balanced':'medium','Quality':'slow'}[speed], '-x265-params', 'pools=2:frame-threads=2:log-level=error', '-tag:v', 'hvc1']
    elif encoder == 'libsvtav1': args += ['-preset', {'Fast':'10','Balanced':'8','Quality':'6'}[speed], '-svtav1-params', 'lp=2']
    elif codec == 'av1': args += ['-b:v', '0', '-cpu-used', {'Fast':'8','Balanced':'6','Quality':'4'}[speed]]
    else: args += ['-b:v', '0', '-deadline', 'good', '-cpu-used', {'Fast':'6','Balanced':'4','Quality':'2'}[speed]]
    return args


class FixedFrameRender:
    def __init__(self, root, settings, encoder):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.settings = settings
        self.encoder = encoder
        self.total = math.ceil((settings['end'] - settings['start']) * settings['fps'] - 1e-8)
        self.count = 0
        self.sources = {}
        self.video_decoders = {}
        self.process = None
        self.mux_process = None
        self.lock = threading.Lock()
        self.cancelled = False
        self.silent = self.root / 'silent.mkv'
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
               '-an', *video_options(s['format'], s['quality'], s['codec'], self.encoder,s.get('speed','Balanced')), str(self.silent)]
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
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
            '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', str(output)]))
        actual = int(probe['streams'][0]['nb_read_frames'])
        if actual != self.total:
            output.unlink(missing_ok=True)
            raise ValueError(f'Frame verification failed: expected {self.total}, found {actual}')
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
                    '-show_entries', 'stream=index', '-of', 'json', str(path)]))['streams']
            except (subprocess.CalledProcessError, ValueError): streams = []
            if streams: active.append((entry, path))
        cmd = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(self.silent)]
        for _, path in active: cmd += ['-i', str(path)]
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
            filters.append(last+','.join(effects)+f',apad,atrim=duration={duration:.6f}[out]')
            cmd += ['-filter_complex', ';'.join(filters), '-map', '0:v:0', '-map', '[out]']
        else:
            cmd += ['-f', 'lavfi', '-t', str(duration), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v:0', '-map', '1:a:0']
        cmd += ['-c:v', 'copy', '-c:a', 'libopus' if s['format'] == 'webm' else 'aac',
                '-ar', '48000', '-b:a', '192k', '-t', str(duration)]
        if s['format'] != 'webm': cmd += ['-movflags', '+faststart']
        cmd += [str(output)]
        with self.lock:
            if self.cancelled: raise ValueError('Render cancelled')
            self.mux_process = subprocess.Popen(cmd, stderr=self.log)
        if self.mux_process.wait(): raise ValueError('Audio mix failed; check FFmpeg log')

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
