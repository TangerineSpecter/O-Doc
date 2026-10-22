/* Read-only catalogue snapshot: 2026-10-22. Visual descriptions are not battle rules. */
(() => {
  const shared = ['闪白、回震与恢复 · 共用版', '原色像素炸开，碎片落地保留'];
  window.MeadowMonsters = {
    bat: { id:'monster.cave_bat', name:'洞穴蝙蝠', english:'CAVE BAT', level:'10–14', index:'01', rank:'普通魔物',
      color:'#9163a5', pale:'#f7f0fb', material:'绒紫身体 · 粉色耳膜', attack:'物理普攻 · 俯冲扑咬', role:'风 · 普通型',
      description:'大耳朵捕捉着洞窟里的回声。双翼从肩部轻轻振动，短暂收势后俯冲；闪身时留下淡紫色残影。',
      hints:['双翼起伏，耳尖轻摆','振翅前行，悬浮升降','收势蓄力，俯冲扑咬',...shared], effect:['#ead9fa','#b48bc9','#71518f'], skills:['evasion'] },
    lizard: { id:'monster.cave_crystal_lizard', name:'洞穴晶蜥', english:'CRYSTAL LIZARD', level:'12–16', index:'02', rank:'普通魔物',
      color:'#308b94', pale:'#edf8f7', material:'灰白岩鳞 · 青蓝晶簇', attack:'物理普攻 · 短距扑咬', role:'土 · 普通型',
      description:'晶簇从覆苔的石鳞间长出。贴地爬行时短足交替、尾尖轻摆；发现目标就压低身体，迅速向前扑咬。',
      hints:['轻呼吸，晶尾缓慢摇摆','短足交替，低姿爬行','压低头部，短距扑咬',...shared], effect:['#c5f5f3','#6bbfc6','#448f95'], skills:['crystal'], skillNote:'已确认技能：晶棘突袭（土属性单体攻击），已接入图鉴与冒险。' },
    beast: { id:'monster.moss_beast', name:'苔石兽', english:'MOSS BEAST', level:'13–17', index:'03', rank:'精英魔物',
      color:'#6d8351', pale:'#f2f6e9', material:'厚重岩甲 · 苔藓背冠', attack:'物理普攻 · 肩甲冲撞', role:'土 · 精英型',
      description:'宽厚肩甲托起一整片小小苔原。四足重步，蓄力后以肩甲撞向前方；护体时岩石棱面在身前合拢。',
      hints:['警戒呼吸，重心微沉','四足重步，落脚带起尘屑','沉肩蓄力，厚甲冲撞',...shared], effect:['#e1e8ba','#b3c389','#778f61'], skills:['guard'] },
    king: { id:'monster.moss_king', name:'苔冠巨兽', english:'MOSS-CROWN SOVEREIGN', level:'15–20', index:'04', rank:'洞窟首领',
      color:'#9d8548', pale:'#fbf7e9', material:'枝状石角 · 悬浮青玉冠', attack:'物理普攻 · 鹿角突进', role:'土 · 首领型',
      description:'远古石鹿缓步守护着洞窟。冠石独立悬浮，苔披肩随身体起伏；重击抬起前蹄再踏下，激起一圈碎石。',
      hints:['缓慢呼吸，冠石悬浮','长足交替，稳步巡视','低首蓄力，鹿角突进',...shared], effect:['#f2e5b8','#bbd6a3','#759e89'], skills:['strike','guard'] }
  };
  window.CaveSkillDescriptions = {
    bat:{evasion:'收翼闪避 → 侧后方掠移 → 淡紫残影消散。'},
    lizard:{crystal:'背部晶簇蓄光 → 能量沿地面向前传递 → 三段晶棘依次刺出。土属性单次攻击，不附加控制或增益。'},
    beast:{guard:'压低重心 → 厚岩甲片从地面升起 → 苔绿符纹点亮，环护身体后落回地面。'},
    king:{guard:'冠石聚光 → 青玉护片环绕升起 → 金色符纹流转，形成分层护罩。', strike:'前蹄蓄势抬起 → 猛踏地面 → 冲击环与岩裂向前展开，碎岩和尘浪随后落下。'}
  };
  window.CaveSkillLabels = {evasion:'闪身', guard:'护体', strike:'重击', crystal:'晶棘突袭'};
})();
