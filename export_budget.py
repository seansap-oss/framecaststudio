"""Explicit approximate file budgets, shared by native and frame renderers."""
import math

def budget(settings):
    target = settings.get('targetMB')
    if target is None: return None
    if isinstance(target, bool) or not isinstance(target, (int, float)) or not math.isfinite(target) or not 1 <= target <= 100000:
        raise ValueError('Target size must be between 1 and 100000 MB')
    if settings.get('codec') != 'h264':
        raise ValueError('Target file size currently requires H.264')
    seconds = settings['end'] - settings['start']
    audio = 128000
    # Reserve 3% for container overhead and rate-control variation; not a hard cap.
    video = int(target * 1000000 * 8 * .97 / seconds - audio)
    if video < 100000:
        raise ValueError('Target size is too small for this duration, including audio. Increase target MB.')
    return video, audio

def rate_options(settings, encoder):
    value = budget(settings)
    if value is None: return []
    video, _ = value
    options = ['-b:v', str(video), '-maxrate', str(int(video * 1.2)), '-bufsize', str(video * 2)]
    if encoder == 'h264_amf': options = ['-rc', 'vbr_peak'] + options
    return options
