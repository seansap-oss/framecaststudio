"""Client for an owner-controlled online licensing service.

The editor and renderer stay on the PC. A packaged customer app needs a live
license check; the server's UTC clock and seat registry decide access.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from licensing import machine_code

PRODUCT = 'poknapham-editing-suite'

def endpoint(config_file):
    try:
        url=json.loads(Path(config_file).read_text(encoding='utf-8-sig'))['url'].rstrip('/')
    except (OSError, ValueError, KeyError, TypeError):
        raise ValueError('License server is not configured in this build') from None
    parsed=urlparse(url)
    if parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('127.0.0.1','localhost')):
        raise ValueError('License server must use HTTPS')
    if parsed.username or parsed.password or parsed.query or parsed.fragment or not parsed.hostname:
        raise ValueError('Invalid license server URL')
    return url

def remote(config_file, action, serial, device=None):
    if action not in ('activate','check'):
        raise ValueError('Invalid licensing action')
    if not isinstance(serial,str) or not re.fullmatch(r'PES-[A-F0-9]{64}',serial.strip()):
        raise ValueError('Enter the full Poknapham serial number')
    device=device or machine_code()
    data=json.dumps({'product':PRODUCT,'serial':serial.strip(),'device':device}).encode()
    req=Request(endpoint(config_file)+'/v1/'+action,data=data,
                headers={'Content-Type':'application/json'},method='POST')
    try:
        with urlopen(req,timeout=6) as response:
            payload=json.load(response)
    except HTTPError as exc:
        if exc.code == 403:
            raise ValueError('Serial expired, revoked, or assigned to another PC') from exc
        raise ValueError('License service is unavailable; try again when it is online') from exc
    except (URLError,TimeoutError,OSError) as exc:
        raise ValueError('Cannot reach the license service; internet access is required') from exc
    if not isinstance(payload,dict) or payload.get('active') is not True or payload.get('device')!=device:
        raise ValueError('The license service did not confirm this PC')
    return payload

def activate(serial, license_file, config_file, device=None):
    info=remote(config_file,'activate',serial,device)
    path=Path(license_file)
    path.parent.mkdir(parents=True,exist_ok=True)
    staged=path.with_suffix('.tmp')
    staged.write_text(serial.strip()+'\n',encoding='utf-8')
    os.replace(staged,path)
    return info

def status(license_file,config_file,device=None):
    try:
        return remote(config_file,'check',Path(license_file).read_text(encoding='utf-8').strip(),device)
    except (ValueError,OSError):
        return None
