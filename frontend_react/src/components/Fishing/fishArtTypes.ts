export interface FishArtProfile {
    color: string; shadow: string; light: string; belly: string; fin: string;
    shape: 'round' | 'long' | 'catfish' | 'deep' | 'eel' | 'trout' | 'wrasse' | 'angler' | 'chimaera'
        | 'loach' | 'knifefish' | 'snakehead' | 'noodlefish' | 'cod' | 'burbot' | 'grouper' | 'drum'
        | 'grayling' | 'royal_angler' | 'royal_wrasse' | 'royal_eel' | 'royal_carp' | 'royal_catfish'
        | 'carp' | 'ayu' | 'mullet' | 'bass' | 'bream' | 'whitefish' | 'lanternfish' | 'mandarin' | 'pike';
    pattern: 'scales' | 'stripes' | 'spots' | 'shine' | 'rainbow' | 'red_spots' | 'tail_eye'
        | 'marbled' | 'ribbons' | 'embers' | 'gill_patch' | 'lateral_lines' | 'pearls' | 'moon';
    whiskers?: boolean; king?: boolean; luminous?: boolean;
    crest?: 'leaf' | 'wave' | 'ice' | 'moss' | 'ribbon';
}
