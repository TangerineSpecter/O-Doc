"""Generate the project's original pixel sprite atlas. No external art assets."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / 'frontend_react/public/farm'
FRAMES = []
PALETTES = ['#e87c52', '#659bb3', '#889957', '#aa7eaa']


def sprite(name, draw, size=32):
    im = Image.new('RGBA', (size, size))
    draw(ImageDraw.Draw(im))
    FRAMES.append((name, im))


def person(d, style, palette, direction, frame, work=''):
    outline, skin, hair = '#493e40', '#f0c29b', ['#5d443d', '#d8ab59', '#342f40', '#a85f3f'][style]
    y = 1 if frame in (1, 3) else 0
    leg = 1 if frame == 1 else -1 if frame == 3 else 0
    d.rectangle((9, 27, 23, 29), fill='#00000022')
    d.rectangle((11, 20+y, 14, 26+leg), fill='#454e65'); d.rectangle((18, 20+y, 21, 26-leg), fill='#454e65')
    d.rectangle((10, 26+leg, 14, 28+leg), fill=outline); d.rectangle((18, 26-leg, 23, 28-leg), fill=outline)
    d.rectangle((9, 13+y, 23, 21+y), fill=outline); d.rectangle((10, 14+y, 22, 20+y), fill=PALETTES[palette])
    d.rectangle((13, 17+y, 19, 21+y), fill='#ead6b1'); d.rectangle((14, 18+y, 18, 20+y), fill='#bea78b')
    d.rectangle((7, 15+y, 9, 21+y), fill=skin); d.rectangle((23, 15+y, 25, 21+y), fill=skin)
    d.rectangle((10, 4+y, 22, 13+y), fill=outline); d.rectangle((11, 5+y, 21, 12+y), fill=skin)
    d.rectangle((10, 3+y, 22, 6+y), fill=hair); d.rectangle((9, 6+y, 11, 10+y), fill=hair)
    if style in (1, 3):
        d.rectangle((21, 5+y, 23, 14+y), fill=hair)
    if direction != 'up':
        xs = (13, 19) if direction == 'down' else (19,) if direction == 'right' else (12,)
        for x in xs:
            d.rectangle((x, 8+y, x+1, 9+y), fill=outline)
        d.rectangle((15, 11+y, 17, 11+y), fill='#cf947e')
    else:
        d.rectangle((11, 5+y, 21, 11+y), fill=hair)
    if style == 0:
        d.rectangle((8, 3+y, 24, 5+y), fill='#d8ad59'); d.rectangle((11, 0+y, 21, 3+y), fill='#ecc975')
    if style == 2:
        d.rectangle((10, 1+y, 22, 4+y), fill='#679f82')
    if work:
        x = 25 if frame % 2 else 23
        d.line((x, 12, x-2, 27), fill='#795637', width=2)
        if work == 'water':
            d.rectangle((x-3, 18, x+3, 23), fill='#7daeb6'); d.rectangle((x+2, 19, 31, 20), fill='#cee9e0')
        elif work == 'harvest':
            d.rectangle((x-2, 11, x+4, 13), fill='#c8d6bb')
        elif work == 'feed':
            d.rectangle((22, 19, 29, 25), fill='#ddb971'); d.point((27, 27), fill='#f8db94')
        else:
            d.rectangle((x-2, 23, x+2, 27), fill='#79836b')


for style in range(4):
    for palette in range(4):
        for direction in ('down', 'left', 'right', 'up'):
            for frame in range(4):
                sprite(f'person-{style}-{palette}-{direction}-{frame}', lambda d, s=style, p=palette, a=direction, f=frame: person(d, s, p, a, f))
        for action in ('plant', 'water', 'harvest', 'feed'):
            for frame in range(4):
                sprite(f'person-{style}-{palette}-{action}-{frame}', lambda d, s=style, p=palette, a=action, f=frame: person(d, s, p, 'down', f, a))


def animal(d, kind, action, frame):
    shift = frame % 2 if action == 'walk' else 0
    outline = '#685948'; cream = '#efe5ca'
    d.rectangle((5, 25, 26, 27), fill='#00000020')
    if kind == 'chicken':
        d.rectangle((12, 23, 13, 26+shift), fill='#d6a34f'); d.rectangle((19, 23, 20, 26-shift), fill='#d6a34f')
        d.rectangle((10, 13+shift, 23, 22+shift), fill=outline); d.rectangle((11, 14+shift, 22, 21+shift), fill=cream)
        d.rectangle((8, 12+shift, 12, 18+shift), fill='#faf0d6'); d.rectangle((15, 16+shift, 20, 19+shift), fill='#d2c29e')
        x, y = (22, 19) if action == 'eat' else (21, 9+shift)
        d.rectangle((x-2, y, x+3, y+7), fill=cream); d.rectangle((x, y-2, x+2, y), fill='#c56353')
        d.rectangle((x+4, y+3, x+6, y+4), fill='#e7ac52'); d.point((x+2, y+2), fill=outline)
    else:
        for x in (7, 13, 21, 25):
            d.rectangle((x, 21, x+2, 26+(shift if x < 15 else -shift)), fill=outline)
        d.rectangle((5, 12+shift, 26, 22+shift), fill=outline)
        d.rectangle((6, 13+shift, 25, 21+shift), fill=cream)
        if kind == 'cow':
            d.rectangle((9, 13+shift, 14, 18+shift), fill='#716253'); d.rectangle((19, 17+shift, 24, 21+shift), fill='#716253')
        else:
            for x,y in ((7,11),(12,10),(17,11),(22,10),(5,16),(10,20),(16,20),(21,20)):
                d.rectangle((x,y+shift,x+5,y+4+shift), fill='#faf3df')
                d.point((x+1,y+shift), fill='#c8c0a3')
        y = 19 if action == 'eat' else 12+shift
        d.rectangle((23,y,30,y+8), fill='#bfaf8d' if kind == 'sheep' else '#eee2c9')
        d.rectangle((26,y+6,31,y+9), fill='#a89177'); d.point((28,y+3), fill=outline)
        d.rectangle((22,y-2,24,y), fill=outline); d.rectangle((28,y-2,30,y), fill=outline)


for kind in ('chicken','cow','sheep'):
    for action in ('idle','walk','eat'):
        for frame in range(4):
            sprite(f'{kind}-{action}-{frame}', lambda d,k=kind,a=action,f=frame: animal(d,k,a,f))


def crop(d, kind, phase):
    d.rectangle((15, 19, 16, 29), fill='#557847')
    for box in ((9,22,15,25),(17,18,23,21),(11,16,15,19)):
        d.rectangle(box, fill='#83a45d')
    if phase > 0:
        d.rectangle((7,13,14,17), fill='#a0b86b'); d.rectangle((18,10,24,15), fill='#6a934d')
    if phase == 2:
        if kind == 'radish':
            d.rectangle((11,22,21,28), fill='#eadbbf'); d.rectangle((13,28,18,30), fill='#c3ad89'); d.rectangle((11,22,21,24), fill='#c77772')
        elif kind == 'potato':
            for x,y in ((9,23),(17,25),(14,19)):
                d.rectangle((x,y,x+5,y+4), fill='#c49b68'); d.point((x+2,y+2), fill='#957446')
        else:
            d.rectangle((17,13,21,24), fill='#e6ba57'); d.rectangle((18,14,19,22), fill='#ffdc81')


for kind in ('radish','potato','corn'):
    for phase in range(3):
        sprite(f'{kind}-{phase}', lambda d,k=kind,p=phase: crop(d,k,p))


def house(d, kind, level):
    wall = '#e3ca97' if kind == 'coop' else '#b77457'
    d.rectangle((7,26,58,59), fill='#493f35'); d.rectangle((9,27,56,57), fill=wall)
    for y in range(31,58,7):
        d.line((10,y,55,y),fill='#b4936d' if kind == 'coop' else '#9d5d49')
    for i in range(16):
        d.rectangle((4+i,24-i,60-i,26-i),fill='#aa6255' if kind == 'coop' else '#647f81')
    for y in (15,20,25):
        d.line((18 if y==15 else 10,y,49 if y==15 else 56,y),fill='#cf8570' if kind == 'coop' else '#8ba29b')
    d.rectangle((26,35,40,58),fill='#654c39'); d.rectangle((29,38,37,57),fill='#866343'); d.point((35,48),fill='#efcb73')
    d.rectangle((13,34,21,43),fill='#594f42'); d.rectangle((14,35,20,41),fill='#91b6b1'); d.line((17,35,17,41),fill='#e4d4aa')
    if level >= 2:
        d.rectangle((45,33,53,43),fill='#4f564d'); d.rectangle((46,34,52,41),fill='#a3bfaf')
        d.rectangle((10,48,23,51),fill='#7c9c5c'); d.rectangle((12,47,14,49),fill='#ead7aa')
    if level == 3:
        d.rectangle((46,6,51,16),fill='#77614a'); d.rectangle((45,4,52,6),fill='#c8b78b')
        d.rectangle((28,27,38,30),fill='#dfb958'); d.rectangle((31,26,35,31),fill='#f4d77d')


for kind in ('coop','barn'):
    for level in range(1,4):
        sprite(f'{kind}-{level}', lambda d,k=kind,l=level: house(d,k,l),64)


def tree(d):
    d.rectangle((28,39,34,60),fill='#735840'); d.rectangle((30,40,32,58),fill='#957150')
    for box,color in [((18,6,45,19),'#607e50'),((11,16,51,36),'#607e50'),((8,28,54,44),'#607e50'),((16,13,43,22),'#8fab66'),((13,24,48,32),'#819f5d'),((19,35,43,43),'#73934f')]:
        d.rectangle(box,fill=color)
    for x,y in ((22,20),(36,30),(17,36)):
        d.rectangle((x,y,x+3,y+3),fill='#dc9c57')

sprite('tree',tree,64)
def item_icon(d, kind, gold=False):
    dark = '#8c6e38' if gold else '#697365'
    light = '#f2cf67' if gold else '#eee6cd'
    if kind == 'chicken':
        d.rectangle((11,5,21,8),fill=dark);d.rectangle((8,9,24,23),fill=dark);d.rectangle((10,7,22,25),fill=dark)
        d.rectangle((11,8,21,23),fill=light);d.rectangle((9,11,23,21),fill=light);d.rectangle((12,9,14,14),fill='#fff0b5' if gold else '#fff8e6')
    elif kind == 'cow':
        d.rectangle((12,3,20,6),fill=dark);d.rectangle((11,7,21,10),fill=dark);d.rectangle((8,11,24,28),fill=dark)
        d.rectangle((10,12,22,26),fill=light);d.rectangle((10,17,22,22),fill='#dda847' if gold else '#a3c3bd');d.rectangle((14,3,18,5),fill='#b1a186')
    elif kind == 'sheep':
        for x,y in ((6,12),(11,7),(16,10),(19,15),(9,20),(15,21)):
            d.rectangle((x,y,x+8,y+7),fill=dark);d.rectangle((x+1,y+1,x+7,y+6),fill=light)
    else:
        d.rectangle((8,9,24,28),fill='#8a6543');d.rectangle((9,8,23,10),fill='#d9ba7d');d.rectangle((10,12,22,25),fill='#c8a16b')
        d.rectangle((13,15,19,21),fill='#e8d3a4');d.rectangle((15,13,17,23),fill='#ba945f')
    if gold:
        d.rectangle((25,3,27,9),fill='#ffe488');d.rectangle((23,5,29,7),fill='#ffe488')

for kind in ('chicken','cow','sheep'):
    for quality in ('normal','gold'):
        sprite(f'item-product.{kind}.{quality}',lambda d,k=kind,q=quality:item_icon(d,k,q=='gold'))
sprite('item-feed',lambda d:item_icon(d,'feed'))
for kind in ('radish','potato','corn'):
    sprite(f'item-crop.{kind}',lambda d,k=kind:crop(d,k,2))
    sprite(f'item-seed.{kind}',lambda d:item_icon(d,'seed'))

ROOT.mkdir(parents=True,exist_ok=True)
atlas=Image.new('RGBA',(1024,((len(FRAMES)+15)//16)*64))
manifest={}
for i,(name,im) in enumerate(FRAMES):
    x,y=i%16*64,i//16*64
    if name.startswith('item-'):
        (ROOT/'items').mkdir(exist_ok=True)
        im.save(ROOT/'items'/f'{name[5:]}.png')
    if name in ('chicken-idle-0', 'cow-idle-0', 'sheep-idle-0'):
        # 市场直接复用农场动物静止帧，不维护另一套动物画法。
        (ROOT/'items').mkdir(exist_ok=True)
        im.save(ROOT/'items'/f'animal.{name.split("-")[0]}.png')
    atlas.paste(im,(x,y)); manifest[name]={'x':x,'y':y,'width':im.width,'height':im.height}
atlas.save(ROOT/'sprites.png',optimize=True)
(ROOT/'sprites.json').write_text(json.dumps(manifest,separators=(',',':')))
print(f'{len(FRAMES)} original frames generated')
