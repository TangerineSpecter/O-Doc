"""Encode existing cave artwork for this preview only; no application writes."""
import importlib.util
import json
import base64
from PIL import Image
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('meadow_encoder', HERE.parent / 'sprout-meadow/build-sprites.py')
encoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(encoder)
SOURCES = {
    'bat': ('monster-cave-bat-v1.png', -1),
    'lizard': ('monster-cave-crystal-lizard-v1.png', -1),
    'beast': ('monster-moss-beast-v2.png', -1),
    'king': ('monster-moss-king-v1.png', -1),
}
def encode_king_detail() -> dict:
    """Preserve the source silhouette in a 256px runtime texture; never edit source art."""
    source = Image.open(encoder.ASSETS / SOURCES['king'][0]).convert('RGBA')
    bounds = source.getchannel('A').point(lambda v: 255 if v > 127 else 0).getbbox()
    source = source.crop(bounds)
    scale = min(240 / source.width, 232 / source.height)
    size = (round(source.width * scale), round(source.height * scale))
    source = source.resize(size, Image.Resampling.NEAREST)
    canvas = Image.new('RGBA', (256, 256))
    canvas.paste(source, ((256-size[0])//2, 238-size[1]))
    rgba = list(canvas.get_flattened_data())
    occupied = [px[:3] for px in rgba if px[3] >= 128]
    strip = Image.new('RGB', (len(occupied), 1)); strip.putdata(occupied)
    indexed = strip.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    raw = indexed.getpalette()
    palette = ['#%02x%02x%02x' % tuple(raw[i:i+3]) for i in range(0, 96*3, 3)]
    indices = iter(indexed.get_flattened_data())
    pixels = bytes(next(indices)+1 if px[3]>=128 else 0 for px in rgba)
    return {'width':256, 'height':256, 'sourceFacing':-1, 'palette':palette,
            'pixels':base64.b64encode(pixels).decode('ascii')}


if __name__ == '__main__':
    data = {key: encoder.encode_sprite(*source) for key, source in SOURCES.items()}
    (HERE / 'sprite-data.js').write_text('/* Existing approved art; generated for this preview only. */\nwindow.MeadowSpriteData = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    (HERE / 'king-detail-data.js').write_text('/* Generated runtime texture; original PNG unchanged. */\nwindow.CaveKingData = ' + json.dumps(encode_king_detail(), separators=(',', ':')) + ';\n')
    print('Encoded four cave sprites and 256px king detail; application assets unchanged.')
