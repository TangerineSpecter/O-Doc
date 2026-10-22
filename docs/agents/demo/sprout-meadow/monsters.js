/* Current IDs, levels and attack types follow combat/data/{monsters,monster_actions}.csv.
   The descriptions below are visual directions, not added battle mechanics. */
window.MeadowMonsters = {
  slime: {
    id: 'monster.slime', name: '软泥怪', english: 'DEWDROP SLIME', level: '1–5', index: '01',
    color: '#348baf', pale: '#edf8fc', material: '水滴轮廓 · 晶亮水蓝果冻', attack: '物理普攻 · 弹跳撞击', role: '水 · 普通型',
    description: '一团亮晶晶的水蓝色果冻。晨光沿着身体滑过，小气泡慢慢上浮，连呼吸都带着细碎闪光。',
    hints: ['呼吸、气泡上浮与星芒闪亮', '弹跳前进，落地回弹', '蓄力跃击，溅起水滴', '闪白、后退与弹性震荡', '闪白震裂，炸成像素碎片'],
    palette: ['#edfefe', '#b8f3f6', '#83dce8', '#4bb5d0', '#338ea9'], outline: '#285e72',
    effect: ['#d3fdff', '#80d5e9', '#459cc5']
  },
  rabbit: {
    id: 'monster.fuzzy_ear_rabbit', name: '绒耳兔', english: 'FUZZY-EAR RABBIT', level: '1–7', index: '02',
    color: '#b8744a', pale: '#fff5e9', material: '分层绒毛 · 垂耳与蓬松毛领', attack: '物理普攻 · 轻快扑撞', role: '无元素 · 敏捷型',
    description: '暖棕色长耳垂在奶油色毛领两侧。细密的毛束随呼吸轻动，蹬地时，圆尾巴也跟着轻轻晃动。',
    hints: ['轻呼吸、耳尖与绒尾轻摆', '后腿蹬地，长耳延迟回摆', '低伏蓄力，向前轻快扑撞', '身体缩起，耳尖轻轻颤动', '闪白震裂，炸成像素碎片'],
    palette: ['#fff4d8', '#f8d6a9', '#e4ac77', '#c47f50', '#965333'], outline: '#603f32',
    effect: ['#fff3d6', '#efce9d', '#ce9e73']
  },
  beetle: {
    id: 'monster.leafshell_beetle', name: '叶壳甲虫', english: 'LEAFSHELL BEETLE', level: '5–10', index: '03',
    color: '#66864b', pale: '#f0f6e6', material: '叠叶背甲 · 叶脉与分节短足', attack: '物理普攻 · 甲壳顶撞', role: '土 · 防守型',
    description: '把嫩叶当作自己的小盔甲。六只短脚稳稳地踩过草叶，亮晶晶的触角先替它探路。',
    hints: ['触角探路，叶壳微微起伏', '六足交替，稳稳向前爬行', '压低重心，带着叶壳顶撞', '硬壳震颤，迸出细碎火星', '闪白震裂，炸成像素碎片'],
    palette: ['#e7f0aa', '#c0d880', '#91b45e', '#688d48', '#48663c'], outline: '#3f4f32',
    effect: ['#e0ed9c', '#a6c766', '#668f4c']
  },
  glowbug: {
    id: 'monster.dawnfire_glowbug', name: '晨光萤', english: 'DAWNFIRE GLOWBUG', level: '10–15', index: '04',
    color: '#bb8a2b', pale: '#fff8df', material: '薄纱双翼 · 暖金发光腹部', attack: '魔法普攻 · 远程光弹', role: '光 · 魔法型',
    description: '把第一缕晨光藏在尾巴里。薄翅轻振，洒下星星点点的金粉，像一盏迷路的小灯。',
    hints: ['悬浮呼吸，薄翼振动与尾光', '轻盈漂移，留下点点金粉', '尾部聚光，向前发出光弹', '光晕忽闪，短暂失去平衡', '闪白震裂，炸成像素碎片'],
    palette: ['#fff8ca', '#ffea8b', '#f4ca4e', '#dfa42d', '#b47926'], outline: '#72502b',
    effect: ['#fff7c2', '#ffe47d', '#eebc44']
  }
};
