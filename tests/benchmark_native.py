import sys,time,json,tempfile,subprocess
from pathlib import Path
sys.path[:0]=[str(Path(__file__).resolve().parents[1]),str(Path(__file__).resolve().parent)]
from test_native_render import fixture
from native_render import NativeJob
with tempfile.TemporaryDirectory() as folder:
 root=Path(folder)
 print('Preparing 10-minute 720p source with audio…',flush=True)
 session=fixture(root,duration=600,width=1280,height=720)
 print('Source bytes',session.sources['main'].stat().st_size,flush=True)
 began=time.monotonic();job=NativeJob(session,root/'long.mp4')
 while job.thread.is_alive():
  job.thread.join(15)
  print(json.dumps(job.snapshot()),flush=True)
 elapsed=time.monotonic()-began
 print('RESULT',json.dumps(dict(state=job.state,error=job.error,frames=job.frame,elapsed=elapsed,speed=600/elapsed)),flush=True)
 if job.state!='Complete':print((session.root/'ffmpeg.log').read_text(),flush=True)
 else:
  check=subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(job.output),'-f','null','-'],capture_output=True,text=True)
  print('Full output decode exit',check.returncode,check.stderr,flush=True)
 session.cancel()
