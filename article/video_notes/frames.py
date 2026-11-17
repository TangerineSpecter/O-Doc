import base64
import json
import subprocess

from PIL import Image, ImageFilter, ImageStat

from utils.ai_service import AIService
from .transcript import INPUT_OPTIONS


def candidates(video, work, number, start, end, duration, seen):
    candidates = []
    # Take a stable frame mid-explanation and another after a nearby scene change.
    midpoint = min((start + end) / 2, duration - .15)
    for index, (at, scene) in enumerate([(midpoint, False), (start, True), (min(end + 1, duration - .2), False)]):
        path = work / f'frame-{number}-{index}.jpg'
        filters = 'scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2'
        if scene:
            filters = "select='gt(scene,0.12)'," + filters
        run = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(max(0, at)),
                        *INPUT_OPTIONS, '-t', '5', '-i', str(video), '-vf', filters,
                        '-frames:v', '1', '-q:v', '3', str(path)], capture_output=True, timeout=25)
        if run.returncode or not path.is_file() or not path.stat().st_size:
            continue
        with Image.open(path) as image:
            gray = image.convert('L')
            if ImageStat.Stat(gray).stddev[0] < 14 or ImageStat.Stat(gray.filter(ImageFilter.FIND_EDGES)).stddev[0] < 9:
                continue
            thumb = gray.resize((17, 16))
            pixels = list(thumb.getdata())
            fingerprint = sum((pixels[i] > pixels[i + 1]) << i for i in range(271) if i % 17 != 16)
        if any((fingerprint ^ old).bit_count() < 9 for old in [*seen, *(row[1] for row in candidates)]):
            continue
        candidates.append((path, fingerprint))
    return candidates


def chapter_candidates(notes):
    # Include late demonstrations even when a long lecture suggests many illustrations.
    order = sorted(range(len(notes)), key=lambda i: notes[i]['segment'])
    hinted = [i for i in order if notes[i]['visual']]
    remaining = [i for i in order if not notes[i]['visual']]
    preferred = hinted if len(hinted) >= 8 else hinted + remaining
    if len(preferred) <= 8:
        return preferred
    indices = [round(i * (len(preferred) - 1) / 7) for i in range(8)]
    primary = [preferred[i] for i in indices]
    return primary + [i for i in hinted + remaining if i not in primary][:4]


def choose_frames(video, work, notes, segments, duration):
    selected, seen = {}, []
    try:
        config = AIService.get_default_image_client_config()
        for index in chapter_candidates(notes):
            if len(selected) == 8:
                break
            note = notes[index]
            start, end, _ = segments[note['segment']]
            if start >= duration:
                continue
            frames = candidates(video, work, index, start, end, duration, seen)
            if not frames:
                continue
            content = [{'type': 'text', 'text': '从下列原视频画面中选一张有助理解主题的图表、步骤或参数。'
                        '纯口播、模糊、无关返回 0。仅返回 JSON {"frame":序号}，首图编号 1。主题：'
                        + note['heading'] + '。关注：' + (note['visual'] or note['body'][:300])}]
            for path, _ in frames:
                encoded = base64.b64encode(path.read_bytes()).decode()
                content.append({'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + encoded}})
            answer = AIService.chat_completion_messages([{'role': 'user', 'content': content}], config['model_id'])
            index_chosen = json.loads(answer.strip().removeprefix('```json').removesuffix('```'))['frame']
            if type(index_chosen) is int and 1 <= index_chosen <= len(frames):
                path, fingerprint = frames[index_chosen - 1]
                selected[index] = path
                seen.append(fingerprint)
    except Exception:
        return selected, '部分画面未能提取或识别，已保留文字笔记'
    return selected, ''
