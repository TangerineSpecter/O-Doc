import json
import math
import re
import subprocess
import sys

from utils.web_parser import _fetch_resource, WebParserError
from .storage import MAX_DURATION, VideoError, check_space, runtime_root


def platform_segments(info, source):
    tracks = {**(info.get('automatic_captions') or {}), **(info.get('subtitles') or {})}
    for lang in sorted(tracks, key=lambda key: not key.lower().startswith(('zh', 'ai-zh'))):
        if lang == 'danmaku':
            continue
        for track in tracks[lang]:
            if track.get('ext') not in {'srt', 'vtt'}:
                continue
            data = track.get('data')
            if not data and track.get('url'):
                try:
                    data = _fetch_resource(track['url'], referer=source, max_bytes=2**20).content.decode('utf-8-sig')
                except (WebParserError, UnicodeError):
                    continue
            segments = []
            for block in re.split(r'\n\s*\n', (data or '').replace('\r', '')):
                match = re.search(r'(?m)^([\d:,\.]+) --> ([\d:,\.]+)[^\n]*\n([\s\S]+)', block)
                if not match:
                    continue
                def seconds(stamp):
                    total = 0.
                    for part in stamp.replace(',', '.').split(':'):
                        total = total * 60 + float(part)
                    return total
                try:
                    start, end = seconds(match[1]), seconds(match[2])
                except ValueError:
                    continue
                text = re.sub(r'<[^>]*>', '', match[3]).strip()
                if text and 0 <= start < end <= MAX_DURATION:
                    segments.append([start, end, text])
            if segments:
                return segments
    return []


# Restrict demuxers as well as protocols: a local playlist must never open other files.
INPUT_OPTIONS = ['-protocol_whitelist', 'file', '-format_whitelist',
                 'mov,matroska,webm,flv,mp3,aac,wav,ogg,mpegts,avi']


def duration(path):
    try:
        run = subprocess.run(['ffprobe', '-v', 'error', *INPUT_OPTIONS, '-show_entries', 'format=duration',
                              '-of', 'csv=p=0', str(path)], capture_output=True, check=True, timeout=20)
        length = float(run.stdout.strip())
    except FileNotFoundError:
        raise VideoError('处理设备需要安装 FFmpeg 和 ffprobe') from None
    except (ValueError, subprocess.SubprocessError):
        raise VideoError('无法读取媒体，请上传有效的 MP4、MOV 或 WebM 视频') from None
    if not math.isfinite(length) or not 0 < length <= MAX_DURATION:
        raise VideoError('视频时长无效或超过 3 小时')
    return length


def transcribe(path, work, length):
    from .asr_models import resolved_model
    model_dir = runtime_root() / 'models'
    model = resolved_model()
    if not model:
        raise VideoError('转写模型尚未就绪，请管理员到系统设置 → AI 模型接入下载视频转写模型后重试')
    check_space(work, int(length * 32000))
    wav = work / 'audio.wav'
    try:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *INPUT_OPTIONS, '-i', str(path),
                        '-vn', '-t', str(length), '-ar', '16000', '-ac', '1', str(wav)],
                       capture_output=True, check=True, timeout=300)
        run = subprocess.run([sys.executable, '-m', 'article.video_notes.asr', model, str(model_dir), str(wav)],
                             capture_output=True, timeout=5400)
    except subprocess.TimeoutExpired:
        raise VideoError('音频处理超时，请缩短视频后重试') from None
    except subprocess.CalledProcessError:
        raise VideoError('没有可读取的音轨，请检查上传的视频') from None
    if run.returncode == 2:
        raise VideoError('转写模型加载失败，请管理员在系统设置 → AI 模型接入检查模型状态和服务器依赖')
    if run.returncode:
        raise VideoError('本机转写失败，请检查模型与可用内存')
    return json.loads(run.stdout)
