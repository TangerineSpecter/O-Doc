import type {FishArtProfile} from './fishArtTypes';

// 每组均为鱼身、阴影、亮部、腹部、鱼鳍；轮廓与局部器官另由绘制器表达。
const palettes = {
    moss: ['#899576', '#536750', '#bdc49a', '#e4dfb9', '#9f865b'],
    silver: ['#9cb8bd', '#587f8d', '#d3e3db', '#f2ebd1', '#7fa6ad'],
    trout: ['#8caa96', '#536f67', '#c6d2a4', '#e5dcc5', '#c58e77'],
    rainbow: ['#a8a9bc', '#6a748c', '#d7d9dc', '#e6cfce', '#b88392'],
    jade: ['#5e9c87', '#345c62', '#a5d8bb', '#e0e8cf', '#76b47c'],
    mud: ['#9a8968', '#615b47', '#c6b990', '#ded2ac', '#887855'],
    marsh: ['#776e59', '#464c40', '#a9ac7b', '#c9c9a4', '#69806a'],
    sea: ['#7b9eb6', '#445e80', '#b6d1d8', '#e3e9dc', '#7197ae'],
    dark: ['#6e7b86', '#424c66', '#a2b6bd', '#ccd5cf', '#768598'],
    coral: ['#c08778', '#815e65', '#e4b49a', '#f0d9b6', '#d39560'],
    turquoise: ['#63a7a3', '#3e677b', '#a5d7bd', '#d9e4b8', '#de9b60'],
    violet: ['#8a8db8', '#52577f', '#bcc5de', '#d8dfd7', '#db9b74'],
    frost: ['#9fbaca', '#617c9e', '#e0eef0', '#f2eee0', '#b0d1d7'],
    char: ['#809baa', '#4c627d', '#b9ced2', '#edd5bf', '#ce8d7c'],
    amber: ['#bc915e', '#775c4a', '#e0c78d', '#f0dfb6', '#bd7456'],
    ember: ['#70645d', '#443c44', '#b6a16b', '#c8b486', '#bf6851'],
    abyss: ['#657b9d', '#343e64', '#9ebfd1', '#bbc9d1', '#6d9bad'],
    lantern: ['#697a9b', '#353e60', '#a4cfd6', '#c9d5db', '#78afc3'],
    royal_reef: ['#818eb7', '#454e79', '#b1ced2', '#e0dab4', '#df9963'],
    ayu: ['#8aa69a', '#526f65', '#d1daca', '#eee6c3', '#c3ad64'],
} satisfies Record<string, [string, string, string, string, string]>;

type Row = readonly [string, string, FishArtProfile['shape'], FishArtProfile['pattern'], keyof typeof palettes, Partial<Pick<FishArtProfile, 'king' | 'whiskers' | 'luminous' | 'crest'>>?];
const rows: Row[] = [
    ['stream_grouper', '溪石斑', 'grouper', 'marbled', 'moss'],
    ['ayu', '香鱼', 'ayu', 'gill_patch', 'ayu'],
    ['red_spotted_trout', '红点鳟', 'trout', 'red_spots', 'trout'],
    ['rainbow_trout', '虹鳟', 'trout', 'rainbow', 'rainbow'],
    ['stream_king', '翠脊溪王', 'trout', 'scales', 'jade', {king: true, crest: 'leaf'}],
    ['loach', '泥鳅', 'loach', 'spots', 'mud', {whiskers: true}],
    ['mud_carp', '鲮鱼', 'carp', 'scales', 'silver'],
    ['featherback', '弓背鱼', 'knifefish', 'pearls', 'marsh'],
    ['marsh_eel', '泽鳗', 'eel', 'shine', 'marsh'],
    ['wetland_king', '苍髯泽王', 'royal_catfish', 'marbled', 'marsh', {king: true, whiskers: true, crest: 'moss'}],
    ['mullet', '鲻鱼', 'mullet', 'lateral_lines', 'silver'],
    ['sea_bass', '海鲈', 'bass', 'shine', 'sea'],
    ['black_seabream', '黑鲷', 'deep', 'stripes', 'dark'],
    ['red_drum', '红鼓鱼', 'drum', 'tail_eye', 'coral'],
    ['bay_king', '潮冠鲷王', 'deep', 'scales', 'sea', {king: true, crest: 'wave'}],
    ['tuskfish', '青衣鱼', 'wrasse', 'pearls', 'turquoise'],
    ['spotted_grouper', '花斑石斑', 'grouper', 'spots', 'coral'],
    ['ornate_wrasse', '锦纹隆头鱼', 'wrasse', 'ribbons', 'violet'],
    ['redfin_snapper', '赤鳍笛鲷', 'deep', 'shine', 'coral'],
    ['reef_king', '斑斓礁王', 'royal_wrasse', 'ribbons', 'royal_reef', {king: true}],
    ['ice_whitefish', '冰湖白鲑', 'whitefish', 'shine', 'frost'],
    ['northern_char', '北境红点鲑', 'trout', 'red_spots', 'char'],
    ['silver_grayling', '银纹茴鱼', 'grayling', 'pearls', 'silver'],
    ['frost_cod', '寒湖鳕', 'burbot', 'marbled', 'frost'],
    ['frost_king', '霜冠鲑王', 'trout', 'spots', 'frost', {king: true, crest: 'ice'}],
    ['spring_crucian', '暖泉鲫', 'round', 'scales', 'amber'],
    ['redfin_barb', '赤鳍鲃', 'round', 'stripes', 'coral'],
    ['amber_trout', '琥珀鳟', 'trout', 'red_spots', 'amber'],
    ['obsidian_eel', '玄纹鳗', 'eel', 'marbled', 'ember'],
    ['spring_king', '赤曜泉王', 'royal_eel', 'embers', 'ember', {king: true}],
    ['blue_lanternfish', '蓝灯鱼', 'lanternfish', 'shine', 'lantern', {luminous: true}],
    ['abyss_cod', '幽蓝鳕', 'cod', 'pearls', 'abyss'],
    ['longnose_chimaera', '长吻银鲛', 'chimaera', 'shine', 'silver'],
    ['abyss_angler', '深渊鮟鱇', 'angler', 'spots', 'abyss', {luminous: true}],
    ['trench_king', '星灯渊王', 'royal_angler', 'pearls', 'lantern', {king: true, luminous: true}],
];

export const expansionFishNames: Record<string, string> = Object.fromEntries(rows.map(([id, name]) => [name, id]));
export const expansionFishProfiles: Record<string, FishArtProfile> = Object.fromEntries(rows.map(([id, , shape, pattern, palette, features]) => {
    const [color, shadow, light, belly, fin] = palettes[palette];
    return [id.replace(/_/g, ''), {color, shadow, light, belly, fin, shape, pattern, ...features}];
}));
