import json
import requests

from utils.web_parser import WebParserError
from .frames import choose_frames
from .sources import fetch_tracks, metadata, resolve_share
from .storage import UploadNeeded, VideoError
from .transcript import duration, platform_segments, transcribe
from .writing import write_note


def generate(job, work, progress):
    uploaded = work.parent / 'upload'
    source, title = job.source_url, job.title
    segments = []
    expected_duration = 0
    canonical = work.parent / 'canonical.txt'
    if uploaded.is_file():
        if canonical.is_file():
            source = canonical.read_text()
        video = audio = uploaded
    else:
        progress('解析平台与字幕')
        try:
            source = resolve_share(source)
        except (requests.RequestException, WebParserError, VideoError):
            raise UploadNeeded('无法访问分享链接，可以上传视频继续') from None
        canonical.write_text(source)
        info = metadata(source)
        expected_duration = info.get('duration') or 0
        title = (info.get('title') or '视频笔记')[:240]
        progress('获取视频与音轨', title=title)
        segments = platform_segments(info, source)
        video, audio = fetch_tracks(info, work, source, bool(segments))
    length = 0
    if video:
        try:
            length = duration(video)
        except VideoError:
            if not segments:
                raise
            video = None
    if not segments:
        progress('本机 CPU 转写音频')
        cache = work.parent / 'transcript.json'
        if cache.is_file():
            segments = json.loads(cache.read_text())
        else:
            audio_duration = duration(audio)
            if expected_duration and audio_duration + max(3, expected_duration * .02) < expected_duration:
                raise UploadNeeded('平台只返回了部分音轨，请上传完整视频继续')
            segments = transcribe(audio, work, audio_duration)
            tmp = cache.with_suffix('.tmp')
            tmp.write_text(json.dumps(segments, ensure_ascii=False))
            tmp.replace(cache)
    if not segments:
        raise VideoError('没有识别到语音或字幕，请确认视频内容')
    overview, notes = write_note(segments, progress)
    progress('选择关键截图')
    if video:
        frames, warning = choose_frames(video, work, notes, segments, length)
    else:
        frames, warning = {}, '' if video else '仅取得字幕或音频，已生成文字笔记'
    return title or '视频笔记', source, overview, notes, segments, frames, warning
