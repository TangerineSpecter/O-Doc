"""Accept single public share URLs and fetch only direct audio/video tracks."""
import importlib.util
import json
import re
import subprocess
import sys
import time
from urllib.parse import parse_qs, urljoin, urlsplit

import requests

from utils.web_parser import _validate_connected_peer, _validate_fetch_url, WebParserError
from .storage import MAX_BYTES, MAX_DURATION, UploadNeeded, VideoError, check_space


def share_url(text):
    pasted = str(text)[:5000].replace(r'\://', '://')
    match = re.search(r'https?://[^\s<>"，。！？]+', pasted)
    if not match:
        raise VideoError('请粘贴 B 站或抖音的单条视频分享链接')
    return normalize(match[0].rstrip('.,);）】'))


def normalize(value):
    try:
        url = urlsplit(value)
        if url.scheme not in ('http', 'https') or url.port is not None or url.username or url.password:
            raise ValueError
    except ValueError:
        raise VideoError('视频链接格式无效') from None
    host = url.hostname
    if host in {'b23.tv', 'v.douyin.com'} and re.fullmatch(r'/[\w-]{1,100}/?', url.path, re.ASCII):
        return f'https://{host}{url.path}'
    if host in {'bilibili.com', 'www.bilibili.com', 'm.bilibili.com'}:
        video = re.fullmatch(r'/video/(BV[0-9A-Za-z]{10}|av\d{1,20})/?', url.path)
        part = parse_qs(url.query).get('p', ['1'])[0]
        if video and re.fullmatch(r'[1-9]\d{0,3}', part):
            return f'https://www.bilibili.com/video/{video[1]}/?p={part}'
    if host in {'douyin.com', 'www.douyin.com', 'www.iesdouyin.com'}:
        video = re.fullmatch(r'/(?:share/)?video/(\d{1,22})/?', url.path)
        if video:
            return f'https://www.douyin.com/video/{video[1]}'
    raise VideoError('仅支持 B 站、抖音的单条视频链接')


def resolve_share(url):
    with requests.Session() as client:
        # Validate the origin socket itself, including on hosts with a loopback HTTP proxy.
        client.trust_env = False
        for _ in range(4):
            if urlsplit(url).hostname not in {'b23.tv', 'v.douyin.com'}:
                return url
            with client.get(_validate_fetch_url(url), allow_redirects=False, stream=True, timeout=12) as res:
                _validate_connected_peer(res)
                if not res.is_redirect or not res.headers.get('Location'):
                    raise UploadNeeded('短链接未指向单条视频，请上传视频继续')
                url = normalize(urljoin(url, res.headers['Location']))
    raise UploadNeeded('短链接未能解析，请上传对应的视频')


def metadata(url):
    if importlib.util.find_spec('yt_dlp') is None:
        raise VideoError('处理设备缺少 yt-dlp，请安装项目依赖后重试')
    args = [sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-playlist', '--no-cache-dir',
            '--simulate', '--ignore-no-formats-error', '--write-subs', '--sub-langs', 'all,-danmaku', '--retries', '0',
            '--socket-timeout', '12', '--dump-single-json', url]
    try:
        run = subprocess.run(args, capture_output=True, timeout=90, check=True)
        info = json.loads(run.stdout)
    except (ValueError, subprocess.SubprocessError):
        raise UploadNeeded('平台未提供可访问的视频，可能需要登录或验证。可以上传视频继续。') from None
    if info.get('_type') == 'playlist' or info.get('is_live'):
        raise UploadNeeded('请选择一个已发布的单条视频')
    if (info.get('duration') or 0) > MAX_DURATION:
        raise VideoError('单次最多处理 3 小时视频')
    return info


def download(url, target, headers, limit):
    if limit <= 0:
        raise VideoError('视频大小超过单任务上限')
    check_space(target.parent, limit)
    deadline = time.monotonic() + 600
    try:
        with requests.Session() as client:
            client.trust_env = False
            for _ in range(5):
                with client.get(_validate_fetch_url(url, max_length=16384), headers=headers,
                                  stream=True, allow_redirects=False, timeout=(10, 25)) as res:
                    _validate_connected_peer(res)
                    if res.is_redirect:
                        url = urljoin(url, res.headers['Location'])
                        continue
                    res.raise_for_status()
                    if int(res.headers.get('Content-Length') or 0) > limit:
                        raise VideoError('视频大小超过单任务上限')
                    if res.status_code == 206:
                        byte_range = re.fullmatch(r'bytes 0-(\d+)/(\d+)', res.headers.get('Content-Range', ''))
                        if not byte_range or int(byte_range[1]) + 1 != int(byte_range[2]):
                            raise UploadNeeded('平台返回的媒体不完整，请上传视频继续')
                    size = 0
                    with target.open('wb') as out:
                        for chunk in res.iter_content(128 * 1024):
                            size += len(chunk)
                            if size > limit or time.monotonic() > deadline:
                                raise VideoError('视频超过下载大小或时长上限')
                            out.write(chunk)
                    if size:
                        return target
                    break
    except (requests.RequestException, WebParserError, ValueError):
        pass
    raise UploadNeeded('平台媒体暂不可读，请上传本地视频继续')


def fetch_tracks(info, work, source, has_text):
    formats = [f for f in info.get('formats', []) if f.get('protocol') in ('http', 'https')
               and not f.get('has_drm') and not f.get('fragments')]
    video = [f for f in formats if f.get('vcodec') != 'none']
    audio = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') != 'none']
    # Prefer a legible 720p slide at modest bandwidth over the largest format.
    video.sort(key=lambda f: (abs((f.get('height') or 720) - 720), f.get('tbr') or 0))
    visual = sound = None
    limit = MAX_BYTES
    for track in video[:2]:
        try:
            visual = download(track['url'], work / 'picture', track_headers(info, track, source), limit)
        except VideoError:
            (work / 'picture').unlink(missing_ok=True)
            continue
        limit -= visual.stat().st_size
        if track.get('acodec') != 'none':
            sound = visual
        break
    if not has_text and not sound and audio:
        track = audio[0]
        sound = download(track['url'], work / 'sound', track_headers(info, track, source), limit)
    if not has_text and not sound:
        raise UploadNeeded('无法取得完整音轨，请上传本地视频继续')
    return visual, sound


def track_headers(info, track, source):
    headers = {**info.get('http_headers', {}), **track.get('http_headers', {})}
    return {'User-Agent': headers.get('User-Agent') or 'Mozilla/5.0',
            'Referer': source, 'Range': 'bytes=0-'}
