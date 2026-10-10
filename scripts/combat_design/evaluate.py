"""Seeded design submodel evaluation; deliberately not a complete combat engine."""
from __future__ import annotations

import csv
import hashlib
import json
import math
import random
import shutil
import tempfile
from dataclasses import asdict, dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from validate import DIRECTORY, require, validate

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'docs/agents/combat-evaluation'
REPORT = ROOT / 'docs/agents/Agent战斗系统数值模拟评估.md'


def clamp(value: float, low: float = 0, high: float = 1) -> float:
    return max(low, min(high, value))


def probabilities(style: dict, hp: float, mp: float, threat: float = 0,
                  potions: bool = True, skill: bool = True) -> dict[str, float]:
    """One available damage skill; no healing/protection skills in this fixture."""
    critical = clamp((.35 - hp) / .35)
    q = 1.3 if style['id'] == 'style.assault' else 1
    if style['id'] == 'style.economy':
        q *= clamp(.35 + .65 * threat, .35, 1) * (.5 + .5 * mp)
    heal, mana = float(style['heal_threshold']), float(style['mana_threshold'])
    weights = {
        'attack': float(style['attack_weight']),
        'skill': float(style['skill_weight']) * q if skill and mp > 0 else 0,
        'heal': 150 * clamp((heal - hp) / heal) * (1 + threat + critical) if potions else 0,
        'mana': 100 * clamp((mana - mp) / mana) if potions and skill else 0,
        'defend': 20 * float(style['defend_factor']) * (.2 + threat) * (.3 + critical),
    }
    total = sum(weights.values())
    return {key: value / total for key, value in weights.items()}


@dataclass
class Budget:
    seconds: int = 0
    loot: int = 0
    equipment: int = 0
    truncated_loot: int = 0
    truncated_equipment: int = 0

    def advance(self, seconds: int) -> None:
        require(seconds >= 0, 'Cannot reverse submitted time')
        new = self.seconds + seconds
        loot = new // 300 - self.seconds // 300
        equipment = new // 1800 - self.seconds // 1800
        self.truncated_loot += max(0, self.loot + loot - 2)
        self.truncated_equipment += max(0, self.equipment + equipment - 1)
        self.loot = min(2, self.loot + loot)
        self.equipment = min(1, self.equipment + equipment)
        self.seconds = new


def boss_chance(kills: int) -> float:
    return min(.25, .01 * (kills - 11)) if kills >= 12 else 0


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def xp(monster: int, actor: int, multiplier: int = 1) -> int:
    base = math.floor(10 + 3 * monster + .3 * monster ** 2)
    cap = math.floor(1.25 * math.floor(10 + 3 * actor + .3 * actor ** 2))
    delta = monster - actor
    if -3 <= delta <= 3:
        factor = 1
    elif -9 <= delta <= -4:
        factor = 1 + .1 * (delta + 3)
    elif -19 <= delta <= -10:
        factor = .1
    elif delta <= -20:
        factor = .02
    else:
        factor = 1 + min(.2, .04 * (delta - 3))
    return max(1, math.floor(min(base, cap) * multiplier * factor))


def write_csv(name: str, rows: list[dict]) -> None:
    with (OUTPUT / (name + '.csv')).open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def budget_sample(tables: dict, dungeon: dict, duration: int, kill_seconds: int, seed: int) -> dict:
    """Synthetic guaranteed kills. No HP, MP, combat skills, potion costs or defeats."""
    rng = random.Random(seed)
    monsters = {m['id']: m for m in tables['monsters']}
    materials = {m['id']: m for m in tables['materials']}
    drops = {r['monster_id']: materials[r['item_id']] for r in tables['drops'] if r['item_kind'] == 'material'}
    pool = [r for r in tables['dungeon_monsters'] if r['dungeon_id'] == dungeon['id']]
    qualities = tables['qualities']
    actor = int(dungeon['recommended_level_max'])
    budget = Budget()
    result = dict(kills=0, boss=0, equipment=0, materials=0, value=Decimal(0))
    ordinary_kills = 0
    boss_encountered = False
    for elapsed in range(kill_seconds, duration * 60, kill_seconds):
        budget.advance(elapsed - budget.seconds)
        is_boss = not boss_encountered and rng.random() < boss_chance(ordinary_kills)
        if is_boss:
            boss_encountered = True
            monster = monsters[dungeon['boss_id']]
            level = int(dungeon['boss_level_max'])
            result['boss'] += 1
        else:
            encounter = rng.choices(pool, [float(p['encounter_weight']) for p in pool])[0]
            monster = monsters[encounter['monster_id']]
            level = int(clamp(actor + rng.randint(-2, 2), int(encounter['level_min']), int(encounter['level_max'])))
            ordinary_kills += 1
        result['kills'] += 1
        opportunities = min(budget.loot, 2 if is_boss else 1)
        budget.loot -= opportunities
        for index in range(opportunities):
            wanted = index == 0 if is_boss else rng.random() < .2
            if wanted and budget.equipment:
                budget.equipment -= 1
                quality = rng.choices(qualities, [float(q[monster['rank'] + '_weight']) for q in qualities])[0]
                exclusive = is_boss and rng.random() < .5
                low = int(dungeon['boss_level_min'] if exclusive else dungeon['recommended_level_min'])
                gear_level = rng.randint(low, level)
                # Independent random affix positions; rank averages, not perfect affixes.
                q = sum(rng.random() for _ in range(int(quality['affix_count']))) / int(quality['affix_count'])
                result['value'] += money((Decimal(10) + Decimal('.5') * gear_level) * Decimal(quality['sale_multiplier']) * (1 + Decimal('.1') * Decimal(str(q))))
                result['equipment'] += 1
            else:
                quantity = rng.randint(1, 2)
                result['materials'] += quantity
                result['value'] += Decimal(drops[monster['id']]['sale_price']) * quantity
        require(result['equipment'] <= budget.seconds // 1800, 'Equipment inflation')
        require(result['materials'] <= 2 * (budget.seconds // 300), 'Material inflation')
    budget.advance(duration * 60 - budget.seconds)
    return result


def growth_rows(tables: dict) -> list[dict]:
    jobs = {j['id']: j for j in tables['professions']}
    stats = ('strength', 'dexterity', 'intelligence', 'vitality', 'spirit', 'luck')
    rows = []
    for job in jobs.values():
        level = (1, 29, 69, 99)[int(job['stage'])]
        path = [job]
        while path[-1]['parent_id']:
            path.append(jobs[path[-1]['parent_id']])
        path.reverse()
        values = dict.fromkeys(stats, 5)
        fixed_hp = fixed_mp = 0
        for old_level in range(1, level):
            active = next(j for j in reversed(path) if int(j['required_level']) <= old_level)
            for stat in stats:
                values[stat] += int(active[stat + '_growth'])
            fixed_hp += int(active['hp_growth'])
            fixed_mp += int(active['mp_growth'])
        rows.append(dict(profession_id=job['id'], name=job['name'], level=level,
                         **values, fixed_hp=fixed_hp, fixed_mp=fixed_mp,
                         hp=44 + fixed_hp + 12 * values['vitality'],
                         mp=12 + fixed_mp + 6 * values['intelligence'] + 4 * values['spirit']))
    return rows


def boundary_checks(tables: dict) -> list[str]:
    checks = []
    whole, split = Budget(), Budget()
    for tick in range(480):
        whole.advance(15)
        split.advance(15)  # Run boundaries intentionally do not reconstruct resident budget.
        for current in (whole, split):
            if current.loot:
                current.loot -= 1
            if current.equipment:
                current.equipment -= 1
        if tick in (119, 239, 359):
            split = Budget(**asdict(split))  # Persist/reload at 30-minute run boundaries.
    require(whole == split, 'Split/reset mismatch')
    carry = Budget()
    carry.advance(7200)
    require((carry.loot, carry.equipment, carry.truncated_loot, carry.truncated_equipment) == (2, 1, 22, 3), 'Carry cap accounting')
    checks.append('连续/拆分累计、跨日不清零、饱和额度截断记账一致')
    for style in tables['styles']:
        for hp in (0, .2, .5, .8, 1):
            for mp in (0, .2, 1):
                probs = probabilities(style, hp, mp, potions=False, skill=False)
                require(probs['heal'] == probs['mana'] == probs['skill'] == 0, 'Illegal action')
                require(math.isclose(sum(probs.values()), 1), 'Probability sum')
    checks.append('无药剂/无技能过滤，所有五种风格概率归一化')
    require([boss_chance(n) for n in (0, 11, 12, 20, 30, 40, 99)] == [0, 0, .01, .09, .19, .25, .25], 'Boss curve')
    require(xp(1, 99) < xp(99, 99) and xp(99, 1) <= math.floor(1.25 * 13 * 1.2), 'XP anti farming')
    # Exact rational damage example from the specification.
    from fractions import Fraction
    damage = Fraction(100 * 3, 2) * Fraction(120, 180)
    require(int(damage) == 100 and int(damage * Fraction(65, 100)) == 65, 'Damage rounding')
    checks.append('Boss 起点及上限、经验反低级刷取与越级上限、伤害 100/65 精确取整')
    for mutation, message in (('duplicate', 'Duplicate ID'), ('reference', 'Broken'), ('hash', 'Hash mismatch')):
        with tempfile.TemporaryDirectory(prefix='combat-design-check-') as temp:
            test_dir = Path(temp) / 'catalog'
            shutil.copytree(DIRECTORY, test_dir)
            manifest = json.loads((test_dir / 'manifest.json').read_text())
            path = test_dir / 'professions.csv'
            rows = [dict(r) for r in tables['professions']]
            if mutation == 'duplicate':
                rows[1]['id'] = rows[0]['id']
            elif mutation == 'reference':
                rows[1]['parent_id'] = 'job.missing'
            else:
                rows[0]['name'] = 'changed-without-manifest'
            with path.open('w', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            if mutation != 'hash':
                manifest['files']['professions.csv']['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
                (test_dir / 'manifest.json').write_text(json.dumps(manifest))
            try:
                validate(test_dir)
            except ValueError as error:
                require(message in str(error), f'Wrong rejection: {error}')
            else:
                raise ValueError(f'Invalid {mutation} bundle was accepted')
    checks.append('损坏包反例：哈希篡改、重复 ID、缺失职业父引用均被拒绝')
    return checks


def main() -> None:
    tables = validate()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checks = boundary_checks(tables)
    styles = []
    for style in tables['styles']:
        for hp in (.8, .5, .2):
            probs = probabilities(style, hp, .8)
            styles.append(dict(style=style['name'], hp_ratio=hp, mp_ratio=.8,
                               **{key: round(value, 6) for key, value in probs.items()}))
    write_csv('style_probabilities', styles)
    growth = growth_rows(tables)
    write_csv('profession_growth', growth)
    rewards = []
    samples = 500
    for dungeon in tables['dungeons']:
        for duration in (30, 60, 120):
            for kill_seconds in (45, 90, 180):
                runs = [budget_sample(tables, dungeon, duration, kill_seconds, 20261010 + seed) for seed in range(samples)]
                rewards.append(dict(dungeon=dungeon['name'], minutes=duration, kill_seconds=kill_seconds,
                                    samples=samples, **{key: round(sum(float(r[key]) for r in runs) / samples, 4) for key in runs[0]},
                                    max_equipment=max(r['equipment'] for r in runs),
                                    max_materials=max(r['materials'] for r in runs)))
    write_csv('reward_budget', rewards)
    experience = []
    total_hours = 0
    costs = {int(r['level']): int(r['experience_to_next']) for r in tables['level_experience']}
    for level in range(1, 99):
        total_hours += costs[level] / (40 * xp(level, level))
        if level + 1 in (10, 30, 70, 99):
            experience.append(dict(level=level + 1, hours=round(total_hours, 1), days_at_2h=math.ceil(total_hours / 2)))
    write_csv('level_pace', experience)
    manifest = json.loads((DIRECTORY / 'manifest.json').read_text())
    metadata = {'version': manifest['version'], 'seed_start': 20261010,
                'samples': len(rewards) * samples,
                'manifest_sha256': hashlib.sha256((DIRECTORY / 'manifest.json').read_bytes()).hexdigest(),
                'document_sha256': hashlib.sha256((ROOT / 'docs/agents/Agent迷宫探索与战斗系统规划.md').read_bytes()).hexdigest(),
                'evaluation_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'csv_hashes': {name: row['sha256'] for name, row in manifest['files'].items()}}
    (OUTPUT / 'inputs.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    text = '''# Agent 战斗系统数值子模型评估

日期：2026-10-10；目录版本：design-0.1；固定种子起点：20261010。

这份评估验证配置、动作权重、成长、经验曲线、Boss 概率及掉落预算，**不是完整战斗模拟或生产验收**。不包含真实模型选择、技能连招/持续效果、装备最优组合、实际存活率、药剂消耗和净收入；因此不能据此宣布职业或地牢已经平衡。

## 配置与边界校验

'''
    text += f'24 张 CSV、{sum(map(len, tables.values())):,} 条记录通过哈希、ID、外键、职业树、技能等级、效果码、权限、掉落与数值范围校验。\n\n'
    text += ''.join('- ' + c + '。\n' for c in checks)
    text += '''
## 风格实际概率

条件为 HP 50%、MP 80%、同级怪物、携带可用治疗药剂、一个可用伤害技能，没有治疗/防护技能；不同技能可用性会改变这些结果。强攻伤害技能 q 有 1.3 倍加成，节约按当前威胁和 MP 调低耗蓝技能 q。

| 风格 | 普攻 | 技能 | 治疗药剂 | 防御 |
| --- | ---: | ---: | ---: | ---: |
'''
    for row in styles:
        if row['hp_ratio'] == .5:
            text += f"| {row['style']} | {row['attack']:.1%} | {row['skill']:.1%} | {row['heal']:.1%} | {row['defend']:.1%} |\n"
    text += '''
强攻在 50% 血量时尚未达到用药阈值，治疗权重为 0；谨慎提前用药，技能偏好仍只是提高技能概率。无药剂的用药概率严格为 0；满蓝或无耗蓝技能不喝回蓝药剂。具体 CSV 保留 15 组状态样例。

## 升级节奏

以下只是假设每小时持续击败 40 只同级普通怪的基准，逐级累计，不包含精英、Boss、跨级经验、停机、失败和补给时间。角色不一定能达到该击杀速度；不能把小时数承诺给用户。

| 到达等级 | 累计有效小时 | 每天 2 小时的理论天数 |
| --- | ---: | ---: |
'''
    for row in experience:
        text += f"| {row['level']} | {row['hours']} | {row['days_at_2h']} |\n"
    text += '''
99 级停止积累升级经验。所有 29 个职业的永久基础成长已按历史分段计算：到达 10/30/70 后转职，下一次升级才使用新成长，不能将 99 级当前职业的每级成长乘 98。对已有历史成长不补差。CSV 展示各职业阶段末、及时转职情况下的裸基础 HP/MP，未加装备与被动。

## Boss 概率

每次生成新遭遇时检查一次；击败 12、20、30、40 只普通/精英怪后，对应下一次遭遇概率为 1%、9%、19%、25%。这不是整场累计概率。假设持续击败全部遭遇，第一次达门槛后的连续抽样中，到 20 次普通击杀后的那次抽样累计约 37.2%，到 30 次约 86.9%，到 40 次约 99.1%；一次探索最多遭遇一次 Boss，持续增加击杀不重复发 Boss 奖励。精确值由相应独立不命中概率连乘计算，实际还受战斗时间和失败影响。

## 掉落与价值抽样

6 个地牢 × 3 种时长 × 3 种击杀间隔 × 500 个固定种子，共 27,000 次抽样。所有场景从零掉落额度开始，角色等级为该地牢推荐上限；假设每 45/90/180 秒按时击败怪物，Boss 也使用同样间隔。此模型故意不实现战斗伤害，因此是**产出预算压力测试**，较快间隔不是实际职业效率结论。

| 地牢 | 60 分钟、90 秒击杀的平均装备数 | 平均材料数 | 平均回收参考价值 |
| --- | ---: | ---: | ---: |
'''
    for row in rewards:
        if row['minutes'] == 60 and row['kill_seconds'] == 90:
            text += f"| {row['dungeon']} | {row['equipment']:.2f} | {row['materials']:.2f} | {row['value']:.2f} |\n"
    text += '''
回收参考价值只是全部出售的估值，没有写现金账本，也没有减药剂费用。高效率不突破按有效时长授予的掉落额度。零额度开始的首个 30 分钟探索没有随机装备：30 分钟装备额度在终点获得并保留，终点不再额外战斗；下一次探索击杀才可消费。零额度 60 分钟也最多消耗 1 件装备额度，120 分钟最多 3 件，末端新额度留待下次。这属于「达到时长后，在下次击杀抽奖」规则，界面必须说明，不能宣称每半小时必得一件装备。

99 级长期极宽松价值上界为每小时 433.20：两件顶级满词条金装 314.16，加 24 件材料 119.04；由于装备和材料竞争同一物品机会，该上界实际更宽松。若仍担心 NPC 买入造成货币增长，优先根据完整战斗的存活、消耗与现有生活收入实测校准价格；不应直接把这一上界当作平均现金收入。

## 复核结论与实施验收

本轮修正了旧稿中运气影响掉落、跨日清空额度、整段均匀抽怪等级、随机逃跑和机制仍待定等冲突。明确了 Boss 优先奖励与来源权重区别、专属装备等级限制、首轮与截止时间、转职补给、默认不自动出售、六槽权限、技能的数值效果、药剂常驻供应和单后端执行边界。

玩法基线已经补齐。实际开发仍须实现并验证全部主动/被动效果、回合冷却和状态时序、HP/MP 动态恢复、日程与体力争用、回合及奖励事务、模型准备/转职、用户展示和 WebDAV 恢复。随后用完整引擎对 29 个职业、装备品质和五种风格验证存活率、净消耗、击杀/小时及 Boss 难度；这属于实现及平衡验收，不是留空的玩法规则。

复现入口为 scripts/combat_design/evaluate.py；输出 CSV 见本目录 combat-evaluation。规则或目录哈希变更后必须重跑，不沿用旧报告。inputs.json 保存本次文档、目录清单、各 CSV 和评估脚本哈希。此次输入清单版本为 ''' + manifest['version'] + '，共 ' + str(len(manifest['files'])) + ' 张表。\n'
    # Calculate actual cumulative Boss odds; keep prose exact to its stated checks.
    for n, placeholder in ((20, '37.2%'), (30, '86.9%'), (40, '99.1%')):
        chance = 1 - math.prod(1 - boss_chance(k) for k in range(12, n + 1))
        text = text.replace(placeholder, f'{chance:.1%}')
    REPORT.write_text(text)
    print(json.dumps({'status': 'submodels_passed', 'samples': len(rewards) * samples,
                      'tables': len(tables), 'report': str(REPORT)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
