import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from offline_render import FixedFrameRender, verify_video

class FinalizationTests(unittest.TestCase):
    def test_stalled_finalizer_is_killed_and_reported(self):
        with tempfile.TemporaryDirectory() as folder:
            session=FixedFrameRender(Path(folder)/'job',dict(start=0,end=1,fps=30,format='mp4',audio=[]),'libx264')
            process=Mock();process.poll.return_value=None
            try:
                with patch('offline_render.subprocess.Popen',return_value=process), patch('offline_render.time.monotonic',side_effect=[0,0,121]):
                    with self.assertRaisesRegex(ValueError,'no progress'):
                        session.mux(Path(folder)/'out.mp4')
                process.kill.assert_called_once()
                process.wait.assert_called_once()
            finally: session.log.close()

    def test_structural_check_still_rejects_missing_frame(self):
        with patch('offline_render.subprocess.check_output',return_value=b'{"streams":[{"nb_frames":"601"}]}'):
            with self.assertRaisesRegex(ValueError,'expected 602 frames, got 601'):
                verify_video('unused.mp4',602)
