"""Local service tests. No provider sign-in or external upload is performed."""
import http.client
import importlib.util
import json
import io
import struct
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest

spec = importlib.util.spec_from_file_location('framecast_server', Path(__file__).resolve().parents[1] / 'server.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.cfg = {}  # Never connect real accounts during tests.
        cls.httpd = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        cls.worker = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def request(self, method, path, host='localhost:4173', origin=None, payload=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port, timeout=5)
        headers = {'Host': host}
        if origin:
            headers['Origin'] = origin
        conn.request(method, path, body=payload, headers=headers)
        response = conn.getresponse()
        result = (response.status, json.loads(response.read()))
        conn.close()
        return result

    def test_health_identifies_the_local_bridge(self):
        code, data = self.request('GET', '/api/health')
        self.assertEqual(code, 200)
        self.assertEqual(data['service'], 'framecast-local')
        self.assertEqual(data['version'], '0.12.1')
        self.assertTrue(data['fixedFrames'])
        self.assertIsInstance(data['ffmpeg'], bool)

    def test_many_requests_reuse_one_connection(self):
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port, timeout=5)
        original = None
        for index in range(1200):
            conn.request('GET','/api/health',headers={'Host':'localhost:4173'})
            response = conn.getresponse()
            self.assertEqual(response.status,200)
            response.read()
            self.assertFalse(response.will_close)
            if original is None: original = conn.sock
            self.assertIs(conn.sock,original)
        conn.close()

    def test_invalid_codec_format_is_rejected(self):
        with self.assertRaises(ValueError):
            app.resolve_codec('webm','hevc')
        with self.assertRaises(ValueError):
            app.resolve_codec('mov','av1')
        with self.assertRaises(ValueError):
            app.resolve_codec('mp4','unknown')

    def test_local_credentials_are_not_served(self):
        self.assertEqual(self.request('GET', '/publish-settings.json')[0], 404)

    def test_foreign_origin_cannot_start_oauth(self):
        self.assertEqual(self.request('POST', '/api/connect/google', origin='https://example.org')[0], 403)

    def test_missing_credentials_return_actionable_error(self):
        code, data = self.request('POST', '/api/connect/google', origin=app.ORIGIN)
        self.assertEqual(code, 400)
        self.assertIn('publish-settings.json', data['error'])

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Install FFmpeg to test rendering')
    def test_fixed_frame_pipeline_preserves_frame_count_and_audio(self):
        from offline_render import FixedFrameRender
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            png = root / 'frame.png'
            wav = root / 'tone.wav'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=red:s=160x90',
                '-frames:v','1',str(png)],check=True)
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
                '-t','1','-c:a','pcm_s16le',str(wav)],check=True)
            settings = {'start':0,'end':1,'fps':30,'format':'mp4','quality':'Balanced','codec':'h264',
                'audio':[{'id':'tone','start':0,'end':1,'sourceIn':0,'volume':80,'bus':'clip'}], 'visual':[],
                'bed':100,'clip':100,'master':100,'bass':0,'equalizer':0,'treble':0,
                'hum':0,'noise':0,'compress':False}
            job = FixedFrameRender(root/'job',settings,'libx264')
            sound = wav.read_bytes()
            job.source('tone',io.BytesIO(sound),len(sound))
            frame = png.read_bytes()
            payload = (struct.pack('>I',len(frame))+frame)*30
            self.assertEqual(job.frames(io.BytesIO(payload),len(payload)),30)
            output = root/'out.mp4'
            self.assertGreater(job.finish(output),1000)
            streams = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(output)]))['streams']
            self.assertEqual([s['codec_type'] for s in streams],['video','audio'])
            self.assertEqual(streams[0]['nb_frames'],'30')
            self.assertEqual(streams[0]['avg_frame_rate'],'30/1')
            job.cancel()

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Install FFmpeg to test rendering')
    def test_fixed_frame_local_api_streams_sources_and_verifies_output(self):
        with tempfile.TemporaryDirectory() as folder:
            wav = Path(folder)/'tone.wav'
            png = Path(folder)/'frame.png'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440',
                '-t','0.2',str(wav)],check=True)
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=s=160x90',
                '-frames:v','1',str(png)],check=True)
            settings = dict(start=0,end=.2,fps=30,format='mp4',quality='Balanced',codec='h264',
                audio=[dict(id='clip1',start=0,end=.2,sourceIn=0,volume=100,bus='clip')],visual=[],
                clip=100,bed=100,master=100,bass=0,equalizer=0,treble=0,hum=0,noise=0,compress=False)
            code, state = self.request('POST','/api/render/start',origin=app.ORIGIN,
                payload=json.dumps(settings).encode())
            self.assertEqual(code,200)
            ident = state['id']
            self.assertEqual(state['frames'],6)
            self.assertEqual(self.request('POST',f'/api/render/source/{ident}/clip1',origin=app.ORIGIN,
                payload=wav.read_bytes())[0],200)
            frame = png.read_bytes()
            batch = (struct.pack('>I',len(frame))+frame)*6
            self.assertEqual(self.request('POST',f'/api/render/frames/{ident}',origin=app.ORIGIN,
                payload=batch)[1]['received'],6)
            code, finished = self.request('POST',f'/api/render/finish/{ident}',origin=app.ORIGIN,payload=b'{}')
            self.assertEqual(code,200)
            self.assertEqual(finished['frames'],6)
            self.assertGreater(finished['bytes'],1000)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Install FFmpeg to test fast export')
    def test_fast_export_composites_overlay_and_preserves_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            video=Path(folder)/'source.mp4';overlay=Path(folder)/'overlay.png'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=30',
                '-f','lavfi','-i','sine=frequency=440','-t','1','-c:v','libx264','-c:a','aac',str(video)],check=True)
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=red@0.5:s=160x90',
                '-frames:v','1','-pix_fmt','rgba',str(overlay)],check=True)
            settings=dict(start=0,end=1,fps=30,format='mp4',quality='High',speed='Fast',codec='h264',
                audio=[],visual=[dict(id='main')],width=160,height=90,sourceIn=0)
            code,data=self.request('POST','/api/render/start',origin=app.ORIGIN,payload=json.dumps(settings).encode())
            self.assertEqual(code,200,data);ident=data['id']
            self.assertEqual(self.request('POST',f'/api/render/source/{ident}/main',origin=app.ORIGIN,payload=video.read_bytes())[0],200)
            self.assertEqual(self.request('POST',f'/api/render/fast-overlay/{ident}',origin=app.ORIGIN,payload=overlay.read_bytes())[0],200)
            code,data=self.request('POST',f'/api/render/fast-finish/{ident}',origin=app.ORIGIN,payload=b'{}')
            self.assertEqual(code,200,data)
            self.assertEqual(data['frames'],30)
            streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(app.renders[ident])]))['streams']
            self.assertEqual({item['codec_type'] for item in streams},{'video','audio'})
            pixels=subprocess.check_output(['ffmpeg','-v','error','-i',str(app.renders[ident]),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
            center=(45*160+80)*3
            self.assertGreater(pixels[center],pixels[center+1])

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Install FFmpeg to test video decoding')
    def test_video_frames_decode_sequentially_without_browser_seeking(self):
        with tempfile.TemporaryDirectory() as folder:
            video = Path(folder)/'variable.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=30',
                '-t','2','-c:v','libx264','-pix_fmt','yuv420p',str(video)],check=True)
            settings = dict(start=0,end=1,fps=30,format='mp4',quality='Balanced',codec='h264',
                audio=[],visual=[dict(id='visual1')])
            code, state = self.request('POST','/api/render/start',origin=app.ORIGIN,
                payload=json.dumps(settings).encode())
            self.assertEqual(code,200)
            ident=state['id']
            self.assertEqual(self.request('POST',f'/api/render/source/{ident}/visual1',origin=app.ORIGIN,
                payload=video.read_bytes())[0],200)
            def frame(at):
                conn=http.client.HTTPConnection('127.0.0.1',self.httpd.server_port,timeout=10)
                conn.request('GET',f'/api/render/video/{ident}/visual1?t={at}',headers={'Host':'localhost:4173'})
                response=conn.getresponse();body=response.read();status=response.status;conn.close()
                self.assertEqual(status,200,body)
                self.assertTrue(body.startswith(b'\x89PNG\r\n\x1a\n'))
                subprocess.run(['ffmpeg','-v','error','-f','image2pipe','-i','pipe:0',
                    '-frames:v','1','-f','null','-'],input=body,check=True)
                return body
            first=frame(0)
            self.assertEqual(frame(0),first)
            self.assertNotEqual(frame(0.5),first)
            self.assertNotEqual(frame(0.1),first)
            self.assertEqual(self.request('POST',f'/api/render/cancel/{ident}',origin=app.ORIGIN,payload=b'{}')[0],200)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Install FFmpeg to test encoding')
    def test_all_three_containers_include_video_and_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'sample.webm'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30',
                '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1',
                '-c:v', 'libvpx', '-c:a', 'libopus', str(source)], check=True)
            for extension, video, audio in [('mp4','h264','aac'), ('mov','h264','aac'), ('webm','vp9','opus'), ('mp4','hevc','aac'), ('mov','hevc','aac'), ('mp4','av1','aac'), ('webm','av1','opus')]:
                if video not in app.available_encoders():
                    continue
                with self.subTest(format=extension):
                    target = Path(folder) / ('output.' + extension)
                    app.encode(source, target, extension, 'Balanced',60,video)
                    data = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(target)]))
                    codecs = {s['codec_type']: s['codec_name'] for s in data['streams']}
                    self.assertEqual(codecs, {'video':video, 'audio':audio})
                    video_stream = next(s for s in data['streams'] if s['codec_type'] == 'video')
                    self.assertEqual(video_stream['avg_frame_rate'], '60/1')
                    self.assertGreater(target.stat().st_size, 1000)

if __name__ == '__main__':
    unittest.main()
