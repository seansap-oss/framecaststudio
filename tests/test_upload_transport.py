import io
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError
from upload_transport import youtube_upload, UploadUncertain, ProgressReader, youtube_processing
from export_budget import budget, rate_options
from offline_render import video_options

class Response:
    status=200
    headers={}
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self):return b'{"id":"video123"}'

class UploadTests(unittest.TestCase):
    def run_upload(self, script):
        requests=[]
        def opener(req,timeout):
            requests.append(req)
            action=script.pop(0)
            if isinstance(action,Exception):raise action
            return action
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'video.mp4';path.write_bytes(b'abcdefgh')
            job={};result=youtube_upload(path,'https://www.googleapis.com/upload/session',lambda:'token',job,opener,lambda _:None,4)
        return result,job,requests
    def test_disconnect_queries_confirmed_offset(self):
        script=[URLError('lost'),HTTPError('url',308,'resume',{'Range':'bytes=0-3'},io.BytesIO()),Response()]
        result,job,requests=self.run_upload(script)
        self.assertEqual(result['id'],'video123');self.assertEqual(job['percent'],100)
        self.assertEqual(requests[1].get_header('Content-range'),'bytes */8')
        self.assertEqual(requests[2].data,b'efgh')
        self.assertTrue(all(r.get_header('Authorization')=='Bearer token' for r in requests))
    def test_lost_final_response_does_not_upload_again(self):
        _,_,requests=self.run_upload([URLError('lost'),Response()])
        self.assertEqual(len(requests),2);self.assertEqual(requests[1].data,b'')
    def test_permanent_failure_does_not_retry(self):
        with self.assertRaisesRegex(UploadUncertain,'403'):
            self.run_upload([HTTPError('url',403,'forbidden',{},io.BytesIO())])
    def test_no_progress_is_bounded(self):
        with self.assertRaisesRegex(UploadUncertain,'no progress'):
            self.run_upload([HTTPError('url',308,'resume',{},io.BytesIO()) for _ in range(6)])
    def test_progress_reader(self):
        job={};reader=ProgressReader(io.BytesIO(b'1234'),job,4)
        self.assertEqual(reader.read(2),b'12');self.assertEqual(job['percent'],50)
        reader.read(2);self.assertEqual(job['percent'],100)

class BudgetTests(unittest.TestCase):
    def test_budget_includes_audio_and_overhead(self):
        s=dict(start=0,end=600,targetMB=40,codec='h264')
        video,audio=budget(s)
        self.assertAlmostEqual((video+audio)*600/8/1e6,38.8,places=3)
        options=video_options('mp4','Balanced','h264','libx264','Fast',s)
        self.assertNotIn('-crf',options);self.assertIn('-b:v',options)
        self.assertIn('vbr_peak',rate_options(s,'h264_amf'))
    def test_impossible_budget_rejected(self):
        with self.assertRaisesRegex(ValueError,'too small'):budget(dict(start=0,end=600,targetMB=10,codec='h264'))
    def test_invalid_budget_rejected(self):
        for v in [float('nan'),float('inf'),0,-1,True,'40']:
            with self.assertRaises(ValueError):budget(dict(start=0,end=600,targetMB=v,codec='h264'))
    def test_other_codec_rejected(self):
        with self.assertRaisesRegex(ValueError,'H.264'):budget(dict(start=0,end=60,targetMB=10,codec='av1'))

class ProcessingTests(unittest.TestCase):
    def test_processing_success(self):
        job={};youtube_processing(job,lambda:{'items':[{'processingDetails':{'processingStatus':'succeeded'}}]},lambda _:None)
        self.assertEqual(job['status'],'Processed on YouTube')
    def test_status_network_error_does_not_lose_accepted_upload(self):
        def lookup():raise OSError('network')
        job={'id':'existing'};youtube_processing(job,lookup,lambda _:None)
        self.assertEqual(job['id'],'existing');self.assertNotEqual(job['status'],'Failed')
    def test_processing_rejection_is_not_success(self):
        job={};youtube_processing(job,lambda:{'items':[{'status':{'uploadStatus':'rejected'}}]},lambda _:None)
        self.assertEqual(job['status'],'Failed');self.assertFalse(job['retryable'])
    def test_processing_wait_is_bounded(self):
        job={};calls=[]
        youtube_processing(job,lambda:{'items':[]},lambda seconds:calls.append(seconds),attempts=2)
        self.assertEqual(len(calls),2);self.assertIn('check processing',job['status'])
