/** Display-only palettes and silhouettes, keyed by the existing catalog identity. */
export const elementMaterialArtProfiles = {
    'material.element.water.bubble_crab': {shape:'bubble_shell',color:'#8bc7cf',shadow:'#456d82',light:'#e1f5e8'},
    'material.element.water.little_spirit': {shape:'tidal_drop',color:'#66b5cf',shadow:'#426e98',light:'#d4f5f4'},
    'material.element.water.reef_guard': {shape:'coral_plate',color:'#d8939e',shadow:'#885e7d',light:'#f9d6c5'},
    'material.element.water.tide_crown': {shape:'tide_crown',color:'#74bfc4',shadow:'#4b708d',light:'#d6f1df'},
    'material.element.earth.mole': {shape:'sand_shards',color:'#d9b978',shadow:'#887052',light:'#ffebba'},
    'material.element.earth.snail': {shape:'rockbud_grain',color:'#adb67e',shadow:'#6a775e',light:'#e9e5b6'},
    'material.element.earth.armored': {shape:'amber_plate',color:'#ce985b',shadow:'#80604d',light:'#f7d69a'},
    'material.element.earth.dragon': {shape:'dragon_scale',color:'#c5a16d',shadow:'#776052',light:'#f5dfaa'},
    'material.element.wind.cloudbird': {shape:'cloud_plume',color:'#c3d9d7',shadow:'#728e9c',light:'#f5f4dd'},
    'material.element.wind.bell': {shape:'chime_fragment',color:'#87b8ac',shadow:'#527d81',light:'#d9eee0'},
    'material.element.wind.falcon': {shape:'gale_plume',color:'#87b8c3',shadow:'#526e8f',light:'#dfefdf'},
    'material.element.wind.griffin': {shape:'crown_plume',color:'#c4ccad',shadow:'#778d87',light:'#fff1c8'},
    'material.element.fire.lizard': {shape:'ember_scale',color:'#cf8361',shadow:'#805357',light:'#f9c788'},
    'material.element.fire.turtle': {shape:'charcoal_shell',color:'#797279',shadow:'#494a56',light:'#b3a3a0'},
    'material.element.fire.horn': {shape:'molten_horn',color:'#b57c59',shadow:'#654e50',light:'#ffd08a'},
    'material.element.fire.firebird': {shape:'flame_plume',color:'#df9565',shadow:'#965c59',light:'#ffe2a0'},
} as const;
export type ElementMaterialArtProfile = typeof elementMaterialArtProfiles[keyof typeof elementMaterialArtProfiles];
