export type ArmorFamily = 'cloth' | 'leather' | 'light' | 'plate' | 'heavy';
export interface EquipmentPalette {
    ink:string; deep:string; shade:string; base:string; lit:string; shine:string;
    gold:string; goldShade:string; goldLight:string; gem:string; gemShade:string; gemLight:string;
}
const colors: Record<ArmorFamily, readonly (readonly [string,string,string,string])[]> = {
    cloth: [['#35506f','#628fb0','#a6c9d8','#e4ecdf'],['#374f77','#597aa6','#a7bfd2','#e3e8e5'],['#493856','#7d659e','#baa3d0','#efe3ed'],['#1f5868','#348f9c','#8ccaca','#d6edda'],['#444269','#7a80ae','#c2c8e6','#f2ecdf']],
    leather: [['#523429','#92603b','#c18e55','#e2b47c'],['#493428','#795538','#b08652','#ddbc83'],['#354536','#65764b','#a2b36a','#d9d3a1'],['#322e45','#554665','#9480a6','#cbb2c6'],['#512e2c','#98513c','#c98657','#eabb83']],
    light: [['#23494b','#427e7c','#8ec0ac','#dce3c1'],['#294a3e','#468265','#9ac18a','#e0e6bb'],['#2c4263','#526f9d','#a1bdd1','#e4e8df'],['#3c3154','#6c588c','#ad9bc5','#e5d9e7']],
    plate: [['#384454','#7b91a3','#c6d7da','#faf1d6'],['#2c425c','#5f83a2','#b3d0d8','#f0f4dd'],['#3d3855','#76718e','#c3bed5','#f6eee5'],['#3f414a','#9a8472','#ddc6a0','#fff0cb']],
    heavy: [['#4e352e','#8e6745','#c5a170','#eed3a2'],['#343b47','#6c7887','#b3c1c8','#ecedda'],['#292e3e','#4c566e','#92a2b8','#d8dfe5'],['#2c4254','#65899d','#b0d4db','#f1f2d7'],['#4c3435','#926047','#d8ac76','#fff0bc']],
};
export function equipmentPalette(family:ArmorFamily, tier:number):EquipmentPalette {
    const [shade,base,lit,shine]=colors[family][Math.min(tier,colors[family].length-1)];
    const gems = family==='cloth' ? ['#39acbd','#45bac2','#a686d0','#51c7c2','#9cd5df'] : family==='leather' ? ['#7f9b65','#82a875','#b5bd72','#9b81c2','#e0a45f'] : ['#43aebb','#57bac6','#9d8dc8','#76bdb8','#e6b865'];
    return {ink:'#30262d',deep:'#40343b',shade,base,lit,shine,gold:'#c4974d',goldShade:'#795331',goldLight:'#f3d386',gem:gems[tier % gems.length],gemShade:'#285268',gemLight:'#d3f2df'};
}
