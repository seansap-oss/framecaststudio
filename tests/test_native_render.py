import io
import json
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from offline_render import FixedFrameRender
from native_render import NativeJob


def fixture(root,duration=2,width=160,height=90,render_start=0,render_end=None,fps=60,source_in=0):
    video=root/'source.mp4'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i',f'testsrc2=s={width}x{height}:r=30:d={duration}',
        '-f','lavfi','-i',f'sine=frequency=440:duration={duration+.08}',
        '-c:v','libx264','-preset','ultrafast','-c:a','aac',str(video)],check=True)
    settings=dict(start=render_start,end=duration+.08 if render_end is None else render_end,fps=fps,format='mp4',quality='High',speed='Fast',codec='h264',
        audio=[dict(id='main',start=0,end=duration+.08,sourceIn=0,volume=80,bus='clip')],clip=100,bed=100,master=100,bass=0,equalizer=0,treble=0,hum=0,noise=0,compress=False,visual=[dict(id='main')],width=width,height=height,sourceIn=source_in,background='#123456',
        nativeLayers=[dict(kind='horizontal',x=0,y=height-20,width=width,height=20,start=0,end=duration+.08,
            direction='left',repeat=True,speed=width,textWidth=40),
            dict(kind='vertical',x=0,y=0,width=width,height=20,start=0,end=duration+.08,
            direction='up',repeat=True,count=2,travel=.3,hold=.3)])
    session=FixedFrameRender(root/'job',settings,'libx264')
    with video.open('rb') as f:session.source('main',f,video.stat().st_size)
    for name,size,color in [('graphic-0','40x20','red'),('background-0',f'{width}x20','black'),
        ('graphic-1',f'{width}x40','yellow'),('background-1',f'{width}x20','blue')]:
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i',f'color=c={color}:s={size}',
            '-frames:v','1',str(session.root/(name+'.png'))],check=True)
    return session

class NativeRenderTests(unittest.TestCase):
    def test_tickers_and_audio_export_with_tail_padding_and_verified_count(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);session=fixture(root);job=NativeJob(session,root/'result.mp4')
            job.thread.join(30)
            try:
                self.assertEqual(job.state,'Complete',(job.snapshot(),(session.root/'ffmpeg.log').read_text()))
                self.assertEqual(job.frame,125)
                data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(job.output)]))
                self.assertEqual([x['codec_type'] for x in data['streams']],['video','audio'])
                # Lower red ticker is visible after entering the box.
                pixels=subprocess.check_output(['ffmpeg','-v','error','-ss','0.75','-i',str(job.output),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
                pos=(80*160+50)*3
                self.assertGreater(pixels[pos],pixels[pos+2]+80)
            finally:session.cancel()

    def test_native_rejects_export_past_source_before_encoding(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);session=fixture(root);session.settings['end']=12
            job=NativeJob(session,root/'bad.mp4');job.thread.join(10)
            try:
                self.assertEqual(job.state,'Failed');self.assertIn('beyond',job.error);self.assertIsNone(job.process)
            finally:session.cancel()

if __name__=='__main__':unittest.main()

class NativeControlTests(unittest.TestCase):
    def test_pause_resume_and_cancel_a_running_job(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);session=fixture(root,duration=15,width=640,height=360)
            job=NativeJob(session,root/'control.mp4')
            deadline=time.monotonic()+10
            while job.process is None and job.thread.is_alive() and time.monotonic()<deadline:time.sleep(.005)
            try:
                job.pause(True)
                # Reader may drain an already-written progress line, but the encoder
                # process must remain suspended until resume.
                time.sleep(.05);first=job.frame;time.sleep(.1)
                self.assertEqual(job.frame,first);self.assertTrue(job.paused)
                job.pause(False);self.assertFalse(job.paused)
                session.cancel();job.thread.join(5)
                self.assertFalse(job.thread.is_alive());self.assertIsNotNone(job.process.poll())
            finally:
                if not session.cancelled:session.cancel()

class TargetSizeRenderTests(unittest.TestCase):
    def test_native_target_size_is_decodable_with_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);session=fixture(root,duration=10,width=640,height=360)
            session.settings['targetMB']=1
            job=NativeJob(session,root/'budget.mp4');job.thread.join(60)
            try:
                self.assertEqual(job.state,'Complete',(job.snapshot(),(session.root/'ffmpeg.log').read_text()))
                self.assertLess(job.output.stat().st_size,1500000)
                self.assertGreater(job.output.stat().st_size,100000)
                self.assertIn('Rendering',job.snapshot()['timings'])
                self.assertIn('Finalizing',job.snapshot()['timings'])
                self.assertIn('Verifying',job.snapshot()['timings'])
                subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(job.output),'-f','null','-'],check=True,timeout=30)
            finally:session.cancel()
