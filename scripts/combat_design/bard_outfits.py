"""Generate the seven layered bard torsos on the shared 4-unit pixel grid.

Run from the repository root. Heads, hands, boots and weapons remain separate.
"""
from pathlib import Path

PALETTES = [
    ('#294c40', '#4c7855', '#8ca572', '#c5d3a0', '#80603e'),
    ('#203552', '#365982', '#658db1', '#b4d6df', '#ddd7bb'),
    ('#332840', '#584260', '#876486', '#bea0b6', '#8a5267'),
    ('#512e34', '#853b43', '#b85b54', '#e49a75', '#e2bd71'),
    ('#203443', '#355667', '#608493', '#b3ced0', '#d6e3de'),
    ('#72614f', '#c1ad85', '#e2d2aa', '#fff0cc', '#618d8c'),
    ('#29243c', '#463654', '#715276', '#b18dab', '#6b929e'),
]
INK = '#30262e'
GOLD = '#bc8c4b'
BRIGHT = '#f0d494'
CREAM = '#eadbb6'


def torso(index):
    pixels = [[None] * 94 for _ in range(47)]
    dark, mid, light, shine, accent = PALETTES[index]

    def rect(x, y, w, h, color):
        for yy in range(max(0, y), min(47, y+h)):
            for xx in range(max(0, x), min(94, x+w)):
                pixels[yy][xx] = color

    def poly(coords, color):
        points = list(zip(coords[::2], coords[1::2]))
        for y in range(47):
            for x in range(94):
                inside = False
                for a, b in zip(points, points[1:]+points[:1]):
                    if (a[1] > y+.5) != (b[1] > y+.5):
                        cross = (b[0]-a[0])*(y+.5-a[1])/(b[1]-a[1])+a[0]
                        if x+.5 < cross:
                            inside = not inside
                if inside:
                    pixels[y][x] = color

    def jewel(x, y, color=accent):
        poly([x,y-3,x+4,y,x,y+4,x-4,y], INK)
        poly([x,y-2,x+3,y,x,y+3,x-3,y], GOLD)
        rect(x-1,y-1,2,3,color)
        rect(x-1,y-1,1,1,shine)

    # Separate rear cloth tails: silhouettes evolve by profession.
    tails = [
        [22,6,35,1,38,35,28,43,15,40],
        [24,5,66,5,77,41,64,45,30,44,17,40],
        [20,5,63,2,78,44,66,40,59,46,27,42,12,45],
        [20,3,72,3,86,43,74,46,62,43,26,46,10,42],
        [23,2,69,2,81,42,69,46,47,42,25,46,12,42],
        [23,4,70,4,83,39,73,45,62,42,28,45,13,40],
        [19,1,73,1,86,45,74,41,66,47,48,42,25,47,10,42],
    ]
    poly(tails[index], INK)
    poly([25,5,67,5,77,40,67,43,46,39,27,43,17,39], dark)
    for x in (23,69):
        poly([x,13,x+3,16,x+7,40,x+3,41], mid)
        rect(x+3,37,3,3,light)
    # Tailored inner tunic, shaded sleeves and flared split hem.
    poly([28,3,63,3,74,10,83,24,78,30,69,29,72,44,51,45,46,41,40,45,22,44,25,29,16,29,12,24,20,10],INK)
    poly([29,4,62,4,70,12,67,29,69,42,52,42,46,38,39,42,25,42,28,28,23,13],mid)
    poly([34,7,59,7,61,28,64,41,52,41,46,36,40,41,31,41,34,27],CREAM if index in (0,1,5) else light)
    poly([36,12,39,12,37,39,33,40], '#bba982' if index in (0,1,5) else mid)
    poly([51,12,57,10,57,38,52,40], shine)
    for x in (23,63):
        poly([x,10,x+7,12,x+10,23,x+7,28,x-2,26,x-5,22],dark)
        poly([x,12,x+4,13,x+7,22,x+5,24,x-1,22],light)
        rect(x,16,3,5,mid)
        poly([x-2,23,x+7,24,x+6,28,x-3,27],GOLD)
        rect(x-1,23,6,2,CREAM)
    # Front waist and leather pouch, physically separate from skirt.
    rect(28,28,37,5,INK); rect(29,29,35,3,'#795638')
    rect(30,29,33,1,'#af8251'); rect(45,28,7,5,GOLD)
    rect(47,29,3,2,dark); rect(45,28,6,1,BRIGHT)
    if index in (0,1,3):
        rect(29,31,10,9,INK); rect(30,32,8,6,'#805536')
        rect(30,32,8,2,'#ad7d4c');rect(33,34,2,2,BRIGHT)
    # Different upper constructions, rather than a shared recolored shirt.
    if index == 0:  # Traveller: asymmetric cape, leather jerkin and diagonal strap.
        poly([34,0,47,3,43,12,27,20,15,18,18,10,25,4],INK)
        poly([34,1,44,4,40,11,27,17,18,16,22,9],mid)
        poly([31,3,40,3,36,8,22,14,23,9],light)
        poly([18,16,27,17,40,11,39,14,27,20,17,18],accent)
        poly([57,2,62,3,41,29,36,29],INK)
        poly([58,3,61,4,40,28,38,28],'#a77748')
        for x,y in ((56,7),(51,13),(46,19)):rect(x,y,1,2,BRIGHT)
        jewel(44,6)
    elif index == 1:  # Musician: scalloped capelet and ivory cravat.
        poly([31,0,46,4,61,0,73,8,78,16,66,20,55,14,46,16,37,14,25,20,15,15,21,7],INK)
        poly([31,1,46,6,61,1,70,8,74,14,65,17,55,11,46,13,36,11,25,17,19,14,24,7],mid)
        poly([27,4,34,2,40,6,35,8,24,13,21,13],light)
        for x in (23,62):poly([x,14,x+8,16,x+5,18,x-3,16],BRIGHT)
        poly([40,3,46,7,53,3,50,12,46,10,42,13],CREAM)
        poly([44,12,49,12,52,24,47,26,42,23],shine)
        jewel(46,11)
        for y in (20,25):rect(57,y,2,2,GOLD)
    elif index == 2:  # Curse singer: overlapping diagonal panels and hanging seal.
        poly([29,0,45,5,61,0,71,5,79,16,66,15,56,23,34,14,16,20,20,9],INK)
        poly([30,1,45,7,61,2,70,6,74,13,65,12,56,19,35,11,20,16,24,8],mid)
        poly([30,2,44,7,38,10,22,14,25,8],light)
        poly([60,3,67,5,48,18,38,15],accent)
        poly([64,12,69,14,61,31,57,30],dark)
        for y in (21,27):jewel(63-(y-21)//3,y,shine)
        poly([51,32,61,32,59,43,55,40,51,44],accent)
    elif index == 3:  # Conductor: gold epaulettes, double breast and diagonal sash.
        for x in (18,61):
            poly([x,8,x+7,2,x+15,4,x+13,13,x+3,16,x-3,12],INK)
            poly([x,8,x+7,3,x+13,5,x+11,11,x+3,13,x-1,11],GOLD)
            rect(x+3,7,8,2,BRIGHT)
            for dx in (2,5,8):rect(x+dx,12,2,5,GOLD);rect(x+dx,12,1,3,BRIGHT)
        poly([35,1,45,7,56,1,56,16,49,13,46,18,38,13],dark)
        poly([38,2,45,6,53,2,48,10,43,10],CREAM)
        poly([58,8,63,10,38,28,32,27],GOLD)
        poly([58,9,60,10,36,27,34,26],BRIGHT)
        for y in (17,23):
            for x in (42,54):rect(x,y,2,2,BRIGHT)
        jewel(60,12,'#b94548')
        for x in (29,61):rect(x,36,2,6,GOLD)
    elif index == 4:  # Requiem: nested silver-edged mantle, long teal stole.
        for y,spread in ((11,0),(7,3),(3,5)):
            poly([30,y,46,y+5,62,y,74+spread,y+10,65,y+14,46,y+9,27,y+14,18-spread,y+10],INK)
            poly([31,y+1,46,y+7,61,y+1,71+spread,y+9,65,y+11,46,y+8,27,y+11,21-spread,y+9],mid)
            poly([23-spread,y+9,28,y+10,46,y+7,46,y+9,27,y+13,20-spread,y+10],shine)
        for x in (38,52):
            rect(x,18,5,23,dark);rect(x,18,1,23,shine)
            poly([x+2,34,x+4,37,x+2,40,x,37],light)
        jewel(46,10,shine)
        rect(45,14,2,6,GOLD);rect(43,19,6,2,BRIGHT)
    elif index == 5:  # Virtuoso: ivory layered lapels and long embroidered gold panels.
        poly([30,1,46,5,61,1,71,7,78,15,68,20,55,14,46,20,36,14,24,20,15,15,22,7],INK)
        poly([31,2,46,8,60,2,69,8,74,14,67,17,55,11,46,16,36,11,25,17,19,14,25,7],GOLD)
        poly([31,2,41,6,36,10,25,14,21,13,26,7],shine)
        poly([60,2,68,8,71,13,67,15,55,10,50,7],CREAM)
        poly([42,4,47,7,53,3,51,12,47,16,43,12],accent)
        for x in (36,55):
            rect(x,20,4,22,GOLD);rect(x+1,20,2,21,BRIGHT)
            for y in (23,30,37):rect(x+1,y,1,2,mid)
        jewel(47,12,accent)
        for x in (25,62):poly([x,37,x+4,40,x+2,42,x-1,40],BRIGHT)
    else:  # Sonomancer: pointed collar, split dark mantle, silver-violet runes.
        poly([23,0,37,3,46,10,57,3,70,0,74,12,83,19,68,22,57,16,47,22,35,16,21,22,10,18,20,11],INK)
        poly([25,2,36,5,46,13,58,5,68,2,71,12,78,18,68,19,57,13,47,19,35,13,22,19,15,17,23,11],mid)
        poly([25,2,29,4,24,14,18,17,22,12],light)
        poly([67,3,69,9,62,15,58,13],light)
        for x in (29,62):jewel(x,13,accent)
        for x in (34,55):
            poly([x,22,x+6,22,x+8,44,x+4,41,x,45],dark)
            rect(x+2,24,1,15,light)
            for y in (27,35):rect(x+1,y,4,1,shine)
        jewel(46,16,shine)
    # Run-length encode opaque pixels into crisp SVG rectangles.
    svg = [f'<g id="outfit-{index}" transform="translate({index*374}) scale(4)">']
    for y,row in enumerate(pixels):
        x=0
        while x < 94:
            color=row[x]; end=x+1
            while end < 94 and row[end] == color:end+=1
            if color:svg.append(f'<path fill="{color}" d="M{x} {y}h{end-x}v1H{x}z"/>')
            x=end
    return ''.join(svg)+'</g>'


if __name__ == '__main__':
    root=Path(__file__).resolve().parents[2]
    output=root/'frontend_react/src/assets/combat/player-bard-outfits-v1.svg'
    output.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="2618" height="190" viewBox="0 0 2618 190" shape-rendering="crispEdges">'+''.join(torso(i) for i in range(7))+'</svg>\n')
