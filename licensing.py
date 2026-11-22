"""Derive a stable PC code without exposing the Windows MachineGuid."""
import hashlib
import sys

PRODUCT = 'poknapham-editing-suite'

def machine_code():
    if sys.platform != 'win32':
        raise ValueError('Desktop activation requires Windows')
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Cryptography') as key:
            guid, _ = winreg.QueryValueEx(key, 'MachineGuid')
    except OSError as exc:
        raise ValueError('Cannot read Windows device identity') from exc
    if not isinstance(guid, str) or not guid.strip():
        raise ValueError('Windows device identity is missing')
    return hashlib.sha256((PRODUCT + ':' + guid.strip().lower()).encode()).hexdigest()[:32].upper()
