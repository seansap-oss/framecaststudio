"""Regression for v0.12.4: ceil(end*fps) required 602, duration cutoff encoded 601."""
import io
import json
import struct
import subprocess
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

from native_render import NativeJob
from offline_render import FixedFrameRender, output_frames
from test_native_render import fixture


def verify_output(path, expected, fps):
    data=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0',
        '-show_frames','-show_streams','-show_entries',
        'frame=best_effort_timestamp:stream=avg_frame_rate,time_base,duration',
        '-of','json',str(path)]))
    frames=data['frames'];stream=data['streams'][0]
    assert len(frames)==expected,(len(frames),expected)
    assert Fraction(stream['avg_frame_rate'])==fps,stream
    base=Fraction(stream['time_base'])
    times=[int(f['best_effort_timestamp'])*base for f in frames]
    assert times[0]==0,times[0]
    assert all(t==Fraction(i,fps) for i,t in enumerate(times)), 'Uneven frame timestamps'
    if 'duration' in stream:assert abs(float(stream['duration'])-expected/fps)<0.00001
    subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(path),'-f','null','-'],check=True,
        stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)


class FrameTimingTests(unittest.TestCase):
    def test_fractional_ranges_keep_every_frame_through_encode_and_audio_mix(self):
        cases=[(60,0,10.017,602),(60,0,10.020,602),(60,0,10.025,602),
               (60,0,10.033333333333,602),(60,0,10,600),(60,0,.001,1),
               (30,0,10.001,301),(30,0,10.034,302),(30,0,.001,1),
               (60,1.123,2.141,62),(30,1.123,2.141,31)]
        for fps,start,end,expected in cases:
            with self.subTest(fps=fps,start=start,end=end),tempfile.TemporaryDirectory() as folder:
                root=Path(folder)
                session=fixture(root,duration=11,render_start=start,render_end=end,fps=fps,source_in=start)
                job=NativeJob(session,root/'result.mp4');job.thread.join(30)
                try:
                    self.assertEqual(session.total,expected)
                    self.assertEqual(job.state,'Complete',(job.snapshot(),(session.root/'ffmpeg.log').read_text()))
                    verify_output(session.silent,expected,fps)
                    verify_output(job.output,expected,fps)
                finally:session.cancel()

    def test_fixed_frame_formats_preserve_frame_count_and_timestamp_spacing(self):
        # The shared intermediate format must also work with every existing codec.
        import test_server
        encoders=test_server.app.available_encoders()
        pairs=[('mp4','h264'),('mov','h264'),('mp4','hevc'),('mov','hevc'),
               ('mp4','av1'),('webm','av1'),('webm','vp9')]
        for fmt,codec in pairs:
            if codec not in encoders:continue
            with self.subTest(format=fmt,codec=codec),tempfile.TemporaryDirectory() as folder:
                root=Path(folder)
                settings=dict(start=0,end=.12,fps=60,format=fmt,quality='Balanced',speed='Fast',codec=codec,audio=[],visual=[])
                session=FixedFrameRender(root/'job',settings,encoders[codec])
                try:
                    png=subprocess.check_output(['ffmpeg','-v','error','-f','lavfi','-i','color=s=160x96:c=red',
                        '-frames:v','1','-f','image2pipe','-c:v','png','pipe:1'])
                    payload=(struct.pack('>I',len(png))+png)*session.total
                    session.frames(io.BytesIO(payload),len(payload))
                    output=root/('out.'+fmt);session.finish(output)
                    # WebM has millisecond granularity; intermediate and MP4/MOV retain exact timing.
                    verify_output(session.silent,8,60)
                    if fmt!='webm':verify_output(output,8,60)
                finally:session.cancel()

    def test_frame_plan_ignores_only_floating_point_noise(self):
        self.assertEqual(output_frames(dict(start=0,end=10.02,fps=60)),602)
        self.assertEqual(output_frames(dict(start=0,end=10+1e-12,fps=60)),600)
        self.assertEqual(output_frames(dict(start=0,end=10+1e-5,fps=60)),601)
