"""Bounded YouTube resumable upload. Never starts a second session on a lost PUT."""
import json
import time
from urllib.request import Request, urlopen
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError

class UploadUncertain(ValueError):
    pass

class ProgressReader:
    def __init__(self, stream, job, size):
        self.stream, self.job, self.size = stream, job, size
        self.sent = 0
    def read(self, amount=-1):
        block = self.stream.read(1024*1024 if amount < 0 else amount)
        self.sent += len(block)
        self.job.update(bytesSent=self.sent, totalBytes=self.size, percent=round(self.sent/self.size*100, 1))
        return block

def youtube_upload(path, session, token, job, opener=urlopen, sleep=time.sleep, chunk_size=8*1024*1024):
    parsed = urlparse(session)
    if parsed.scheme != 'https' or parsed.hostname not in ('www.googleapis.com', 'youtube.googleapis.com'):
        raise ValueError('Unexpected YouTube upload session host')
    size = path.stat().st_size
    offset, query, failures = 0, False, 0
    job.update(totalBytes=size, bytesSent=0, percent=0)
    with path.open('rb') as stream:
        while True:
            headers = {'Authorization': 'Bearer '+token(), 'Content-Type':'video/mp4'}
            if query:
                data=b'';headers['Content-Range']=f'bytes */{size}'
            else:
                stream.seek(offset);data=stream.read(min(chunk_size,size-offset))
                headers['Content-Range']=f'bytes {offset}-{offset+len(data)-1}/{size}'
            headers['Content-Length']=str(len(data))
            try:
                try:
                    with opener(Request(session,data=data,headers=headers,method='PUT'),timeout=90) as response:
                        code=response.status;response_headers=response.headers;body=response.read()
                except HTTPError as error:
                    code=error.code;response_headers=error.headers;body=error.read()
                if code in (200,201):
                    result=json.loads(body)
                    if not result.get('id'):raise UploadUncertain('YouTube returned no video ID. Check your channel before retrying.')
                    job.update(bytesSent=size,percent=100)
                    return result
                if code==308:
                    confirmed=response_headers.get('Range','')
                    next_offset=int(confirmed.rsplit('-',1)[1])+1 if confirmed else 0
                    if not 0<=next_offset<=size:raise UploadUncertain('Invalid YouTube upload offset')
                    if next_offset > offset: failures=0
                    else: failures+=1
                    offset=next_offset;query=offset==size
                    job.update(status='Uploading',bytesSent=offset,percent=round(offset/size*100,1))
                    if failures>5:raise UploadUncertain('YouTube upload made no progress. Check your channel before retrying.')
                    continue
                if code not in (401,408,429,500,502,503,504):
                    raise UploadUncertain(f'YouTube upload returned HTTP {code}. Check your channel before starting another upload.')
                if code==401:
                    # Caller refreshes an expired token; no new upload session is created.
                    job['detail']='Checking account authorization'
                retry=response_headers.get('Retry-After','')
                delay=min(60,int(retry)) if retry.isdigit() else min(30,2**failures)
            except (URLError, TimeoutError, OSError):
                delay=min(30,2**failures)
            failures+=1
            if failures>5:raise UploadUncertain('Upload connection interrupted after 5 recovery attempts. Check your YouTube channel before retrying.')
            job.update(status='Recovering upload',detail=f'Recovery attempt {failures}/5')
            sleep(delay);query=True

def youtube_processing(job, lookup, sleep=time.sleep, attempts=24):
    """An accepted upload remains accepted even if its status check loses connection."""
    job['status']='Processing on YouTube'
    for _ in range(attempts):
        try:
            items=lookup().get('items',[])
            video=items[0] if items else {}
            details=video.get('processingDetails',{})
            state=details.get('processingStatus')
            upload_state=video.get('status',{}).get('uploadStatus')
            if state=='failed' or upload_state in ('failed','rejected','deleted'):
                job.update(status='Failed',retryable=False,error='YouTube processing failed: '+str(details.get('processingFailureReason') or upload_state))
                return
            if state=='succeeded' or upload_state=='processed':
                job['status']='Processed on YouTube';return
            if state=='terminated':break
        except Exception:
            job['detail']='Status check unavailable; upload was accepted. Check YouTube Studio.'
            break
        sleep(5)
    job['status']='Uploaded · check processing in YouTube Studio'
