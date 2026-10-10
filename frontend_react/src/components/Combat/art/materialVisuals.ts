export const materialArtProfiles = {
    'material.moss_cave.1':{shape:'slime',color:'#67b6ce',shadow:'#337a8a',light:'#c4f4f8'},
    'material.moss_cave.2':{shape:'wing',color:'#9673a4',shadow:'#584862',light:'#ceb0c9'},
    'material.moss_cave.3':{shape:'moss',color:'#8c9e92',shadow:'#516863',light:'#c8d7b1'},
    'material.moss_cave.4':{shape:'seal',glyph:'leaf',color:'#8dab8c',shadow:'#466c59',light:'#dde5b2'},
    'material.abandoned_mine.1':{shape:'pelt',color:'#b6a082',shadow:'#655b54',light:'#e0ceae'},
    'material.abandoned_mine.2':{shape:'ore',color:'#8c9ba5',shadow:'#485965',light:'#c7d9d8'},
    'material.abandoned_mine.3':{shape:'core',color:'#dbaa66',shadow:'#776748',light:'#ffedb2'},
    'material.abandoned_mine.4':{shape:'seal',glyph:'pick',color:'#99a8ae',shadow:'#4d6570',light:'#ebd49a'},
    'material.mist_forest.1':{shape:'spore',color:'#97b885',shadow:'#56744c',light:'#dae6b3'},
    'material.mist_forest.2':{shape:'fang',color:'#e6d9bc',shadow:'#8e8272',light:'#fff5db'},
    'material.mist_forest.3':{shape:'resin',color:'#d4a458',shadow:'#956334',light:'#ffe0a0'},
    'material.mist_forest.4':{shape:'seal',glyph:'tree',color:'#b4a078',shadow:'#665c46',light:'#cce0a6'},
    'material.sunken_ruins.1':{shape:'bone',color:'#dbd1b9',shadow:'#8a8676',light:'#fff1d3'},
    'material.sunken_ruins.2':{shape:'water',color:'#72bdd0',shadow:'#367c99',light:'#d0f6f3'},
    'material.sunken_ruins.3':{shape:'shards',color:'#88b8d3',shadow:'#526c98',light:'#d5e7f6'},
    'material.sunken_ruins.4':{shape:'seal',glyph:'wave',color:'#83b4b5',shadow:'#416d78',light:'#def0d9'},
    'material.ember_fortress.1':{shape:'ash',color:'#a69284',shadow:'#675b58',light:'#ddc8ac'},
    'material.ember_fortress.2':{shape:'magma',color:'#a66c59',shadow:'#524c4c',light:'#f8b16b'},
    'material.ember_fortress.3':{shape:'flamecore',color:'#db885a',shadow:'#9b554f',light:'#ffe5a1'},
    'material.ember_fortress.4':{shape:'seal',glyph:'flame',color:'#a27b6c',shadow:'#654d4b',light:'#f7c589'},
    'material.star_rift.1':{shape:'dust',color:'#b0a5d3',shadow:'#706795',light:'#eee2ff'},
    'material.star_rift.2':{shape:'starcrystal',color:'#9b8ec5',shadow:'#524c7d',light:'#bfe5ec'},
    'material.star_rift.3':{shape:'broken_core',color:'#ad93bb',shadow:'#615175',light:'#e7c9e3'},
    'material.star_rift.4':{shape:'seal',glyph:'star',color:'#9c95bb',shadow:'#565079',light:'#ece0b9'},
} as const;
export type MaterialArtId=keyof typeof materialArtProfiles;
export type MaterialArtProfile=typeof materialArtProfiles[MaterialArtId];
export function isMaterialArt(id:string):id is MaterialArtId {return id in materialArtProfiles;}
