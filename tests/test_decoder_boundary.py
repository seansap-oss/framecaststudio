import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from offline_render import VideoFrameSource, CleanVideoEnd

class DecoderBoundaryTests(unittest.TestCase):
    def test_long_source_tail_with_audio_longer_than_picture(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'tail.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=64x48:r=30:d=525.4',
                '-f','lavfi','-i','sine=frequency=440:duration=525.49','-c:v','libx264','-preset','ultrafast',
                '-c:a','aac',str(source)],check=True)
            with (root/'log').open('wb') as log:
                decoder=VideoFrameSource(source,60,log)
                try:
                    self.assertAlmostEqual(decoder.video_end,525.4,places=2)
                    frame=None
                    for i in range(90):
                        frame=decoder.frame(524+i/60)
                        self.assertTrue(frame.startswith(b'\x89PNG'))
                    self.assertGreater(decoder.end_repeats,0)
                    with self.assertRaisesRegex(ValueError,'Unexpected end'):
                        decoder.frame(526)
                    # A range export can begin on the final container frame.
                    decoder.close()
                    self.assertTrue(decoder.frame(525.433).startswith(b'\x89PNG'))
                finally:decoder.close()

    def test_partial_frame_is_never_treated_as_clean_eof(self):
        decoder=object.__new__(VideoFrameSource)
        decoder.process=type('P',(),{'stdout':type('S',(),{'fileno':lambda s:0})()})()
        with patch('offline_render.os.read',side_effect=[b'\x89PNG',b'']):
            with self.assertRaisesRegex(ValueError,'incomplete'):
                decoder.next_png()
        with patch('offline_render.os.read',return_value=b''):
            with self.assertRaises(CleanVideoEnd):decoder.next_png()

    def test_sequential_decode_does_not_restart_every_twenty_seconds(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'seq.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=64x48:r=30:d=22',
                '-c:v','libx264','-preset','ultrafast',str(source)],check=True)
            with (root/'log').open('wb') as log:
                decoder=VideoFrameSource(source,60,log)
                try:
                    decoder.frame(0);pid=decoder.process.pid
                    for i in range(1,1320):decoder.frame(i/60)
                    self.assertEqual(decoder.process.pid,pid)
                finally:decoder.close()

if __name__=='__main__':unittest.main()
