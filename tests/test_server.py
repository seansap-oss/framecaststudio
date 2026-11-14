"""Local service tests. No provider sign-in or external upload is performed."""
import http.client
import importlib.util
import json
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

    def request(self, method, path, host='localhost:4173', origin=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port, timeout=5)
        headers = {'Host': host}
        if origin:
            headers['Origin'] = origin
        conn.request(method, path, headers=headers)
        response = conn.getresponse()
        result = (response.status, json.loads(response.read()))
        conn.close()
        return result

    def test_health_identifies_the_local_bridge(self):
        code, data = self.request('GET', '/api/health')
        self.assertEqual(code, 200)
        self.assertEqual(data['service'], 'framecast-local')
        self.assertEqual(data['version'], '0.10.2')
        self.assertIsInstance(data['ffmpeg'], bool)

    def test_local_credentials_are_not_served(self):
        self.assertEqual(self.request('GET', '/publish-settings.json')[0], 404)

    def test_foreign_origin_cannot_start_oauth(self):
        self.assertEqual(self.request('POST', '/api/connect/google', origin='https://example.org')[0], 403)

    def test_missing_credentials_return_actionable_error(self):
        code, data = self.request('POST', '/api/connect/google', origin=app.ORIGIN)
        self.assertEqual(code, 400)
        self.assertIn('publish-settings.json', data['error'])

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Install FFmpeg to test encoding')
    def test_all_three_containers_include_video_and_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'sample.webm'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30',
                '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1',
                '-c:v', 'libvpx', '-c:a', 'libopus', str(source)], check=True)
            for extension, video, audio in [('mp4','h264','aac'), ('mov','h264','aac'), ('webm','vp9','opus')]:
                with self.subTest(format=extension):
                    target = Path(folder) / ('output.' + extension)
                    app.encode(source, target, extension, 'Balanced')
                    data = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(target)]))
                    codecs = {s['codec_type']: s['codec_name'] for s in data['streams']}
                    self.assertEqual(codecs, {'video':video, 'audio':audio})
                    self.assertGreater(target.stat().st_size, 1000)

if __name__ == '__main__':
    unittest.main()
