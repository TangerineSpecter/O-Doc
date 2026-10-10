# 战斗内容配置设计包

版本：design-0.1；状态：design_only；更新日期：2026-10-10。

这是配合 [系统规划](../../agents/Agent迷宫探索与战斗系统规划.md) 的可校验配置草案，**尚未接入生产启动、数据库、Agent 日程或 WebDAV**。生产启动器必须拒绝安装 design_only 包。发布版本须增加固定发布时间、兼容版本和迁移说明，不使用本机启动时间决定版本优先级。

## 生成与校验

在项目根目录执行：

```sh
.venv/bin/python scripts/combat_design/catalog.py
.venv/bin/python scripts/combat_design/validate.py
.venv/bin/python scripts/combat_design/evaluate.py
```

生成器从规划中的职业成长与技能表读取部分数据，其余显式数值位于 catalog.py；不能假设修改任意一段自然语言就会自动修改配置。调整设计时同步两处，重新生成、校验和评估。固定技能编号由显式顺序映射维护，新增末尾分配编号，重命名必须保留旧编号；不得按名字重新认领物品、职业或居民。

manifest.json 包含全部 CSV 的 SHA-256、行数、版本及结构版本。校验拒绝缺表、多余 CSV、哈希不符、重复 ID、未知效果码、外键缺失、越界等级和职业树错误。配置均为 UTF-8；金额用十进制文本，概率用 0～1 比率，不是百分数；1.5 倍暴击不是 1.5%。不存在 CSV 内可执行表达式。

## 文件与实际列

以下表头是当前设计包的实际字段，取代规划第 12 节的逻辑字段示例。所有文件都有稳定字符串 id。带 enabled 的表仅接受 0/1；未提供 enabled 的关联/规则表随不可变目录版本整体生效，停用应发布新版本，不就地删除历史。

| 文件 | 行数 | 用途 | 实际列 |
| --- | ---: | --- | --- |
| professions.csv | 29 | 职业树及最终每级六维、固定 HP/MP 成长 | id、name、parent_id、stage、required_level、hp_growth、mp_growth、enabled、strength_growth、dexterity_growth、intelligence_growth、vitality_growth、spirit_growth、luck_growth |
| skills.csv | 70 | 玩家与怪物技能身份及归属 | id、name、profession_id、learn_level、kind、enabled |
| skill_levels.csv | 190 | 自动学习、升级、耗蓝及冷却 | id、skill_id、rank、required_level、cost_base、cost_per_level、cost_rank_factor、cooldown_rounds、description、enabled |
| skill_effects.csv | 263 | 每级技能的可执行数字效果 | id、skill_level_id、code、stat、value、duration、target、damage_type、group、hits、chance |
| dungeons.csv | 6 | 地牢范围及唯一 Boss 概率参数 | id、name、recommended_level_min、recommended_level_max、boss_id、boss_level_min、boss_level_max、boss_start_kills、boss_probability_step、boss_probability_cap、enabled |
| monsters.csv | 24 | 怪物等级、品阶与成长档案 | id、name、rank、profile、level_min、level_max、enabled |
| dungeon_monsters.csv | 18 | 非 Boss 遭遇权重与区域关联 | id、dungeon_id、monster_id、level_min、level_max、encounter_weight、drop_table_id、enabled |
| monster_actions.csv | 53 | 普攻/技能权重和条件码 | id、monster_id、action_kind、skill_id、weight、condition |
| materials.csv | 24 | 固定材料等级和商店回收价格 | id、name、level、sale_price、enabled |
| drops.csv | 48 | 各怪物的材料和普通装备池来源 | id、monster_id、item_kind、item_id、weight、quantity_min、quantity_max |
| equipment_templates.csv | 17 | 装备部位、等级成长与 Boss 专属标记 | id、name、slot、root_job、level_min、level_max、physical_attack_base、physical_attack_growth、magic_attack_base、magic_attack_growth、hp_base、hp_growth、mp_base、mp_growth、physical_defense_base、physical_defense_growth、magic_defense_base、magic_defense_growth、healing_base、healing_growth、evasion、boss_only、enabled |
| boss_drops.csv | 6 | Boss 专属护符及概率 | id、monster_id、equipment_id、exclusive_probability |
| affixes.csv | 17 | 随机词条范围及单位 | id、stat、min_base、min_growth、max_base、max_growth、unit、enabled |
| affix_slots.csv | 68 | 词条适用槽位 | id、affix_id、slot |
| equipment_professions.csv | 359 | 装备职业权限 | id、equipment_id、profession_id |
| equipment_affixes.csv | 203 | 各装备可抽词条与权重 | id、equipment_id、affix_id、weight |
| equipment_pools.csv | 66 | 区域普通装备池 | id、pool_id、equipment_id、weight |
| potions.csv | 8 | 常驻补给的购买条件、价格和恢复量 | id、name、kind、restore_value、required_level、purchase_price、shared_cooldown_rounds、enabled |
| styles.csv | 5 | 五种风格的动作参数 | id、name、attack_weight、skill_weight、heal_threshold、mana_threshold、defend_factor、enabled |
| level_experience.csv | 99 | 1～99 级升级需求，99 级下一等级需求为 0 | id、level、experience_to_next |
| monster_profiles.csv | 4 | 怪物属性多项式、属性倍率及普攻类型 | id、hp_constant、hp_linear、hp_quadratic、mp_constant、mp_linear、attack_constant、attack_linear、attack_quadratic、defense_constant、defense_linear、hp_multiplier、attack_multiplier、physical_defense_multiplier、magic_defense_multiplier、accuracy、evasion、critical、critical_damage、damage_type |
| monster_ranks.csv | 3 | 普通/精英/Boss 属性和经验倍数 | id、hp_multiplier、attack_multiplier、defense_multiplier、experience_multiplier |
| qualities.csv | 3 | 白/蓝/金词条数、回收倍率与各怪物品阶权重 | id、affix_count、sale_multiplier、normal_weight、elite_weight、boss_weight |
| rules.csv | 63 | 已注册全局数值参数 | id、value |


## 关联与数值语义

- professions 的 growth 已是当前职业最终每级成长，不再叠加父职业；累计成长按每次实际升级时的职业保存。父职业关联同时用于继承已学技能与装备权限。
- skill_levels 中 cost_rank_factor 已包含技能等级倍率，实际耗蓝为 ceil((cost_base + cost_per_level × 角色等级) × cost_rank_factor × 节流系数)，至少 1 MP。被动技能不耗蓝。
- skill_effects.value 已包含该技能等级增幅，执行时不再乘一遍成长系数。modifier 的 accuracy/evasion/reduction/damage_taken 为比率加减，attack/defense/physical_defense/magic_defense 为原值百分比变化；attack/defense 同时作用物理与魔法。damage 的 hits 是独立段数；shared_hit 使混合伤害共享同次判定。group 标识非叠加状态，空值代表无持续状态。
- passive_percent 对指定属性按百分比增益；passive_flat 是比率或数值直接相加；passive_cost 降耗蓝；passive_conversion 按 strength_to_magic/spirit_to_magic 转换；passive_low_hp 在 HP 低于 30% 生效；passive_damage 按 burn/poison/contract/elite_boss 增伤；passive_duration 仅延长指定攻击和防御减益。六维被动先算，再派生属性，不循环回流。
- monster_profiles 的 HP 为 floor((constant + linear×L + quadratic×L²) × profile_multiplier × rank_multiplier)，攻击/防御同理；MP 只用线性公式。普攻类型由 damage_type 指定，怪物伤害技能必须有相应攻击来源。等级抽样与 Boss 规则见规划，不在 CSV 执行字符串公式。
- monster_actions.condition 只接受 always、hp_below_50、not_active；后两者分别要求生命低于 50%、技能自己的同组效果当前不存在。法力、冷却和目标过滤后再归一化剩余权重；普攻是兜底。
- dungeon_monsters.drop_table_id 是兼容逻辑别名 drop.{怪物键}，实际 drops 以 monster_id 连接，不建立第二套重复掉落表。
- drops.weight 只表示**对应来源池内部**的选择权重，不能把材料行与装备池行直接归一化成 50%/50%。奖励大类先由全局 20% 装备规则/特殊 Boss 规则和时间额度决定，再抽该大类的来源行。
- Boss 首次物品机会在有装备额度时优先装备；boss_drops 的 50% 只决定专属护符或通用池。两次物品机会仍最多一件装备。Boss 专属模板不出现在普通 equipment_pools。
- 通用装备等级在区域下限到 min(实际怪物等级,区域上限) 抽样。专属护符还需限制到模板 level_min，最低不高于 Boss 实际等级；不以 99 级模板上限直接生成高等级奖励。
- affixes 的整数范围为 min_base + ceil(min_growth×L) 到 max_base + ceil(max_growth×L)；ratio 无等级增长时按万分点均匀抽样。装备抽不同词条 ID，不能用重复词条凑金装三条。equipment_affixes 和 equipment_professions 为最终权限关系，不再仅按 root_job 推断。
- materials.sale_price 已固化模板等级价格。装备价值在实例生成时按品质与词条质量均值计算、按分四舍五入，不随日后配置改变；无耐久、强化、穿透、经验或现金词条。
- styles 中概率需要当回合真实 HP/MP、威胁与合法动作重算。无药剂、无技能或冷却中对应权重为 0，风格没有固定动作概率，也没有随机逃跑动作。
- level_experience 99 级的 0 表示停止积累升级经验，不可解释成免费循环升级。怪物经验按等级差与越级基础上限结算。
- rules 中 normal/elite/boss_gold_chance 是对 qualities 的一致性提示参数，不能叠加品质权重再次抽金装。equipment_per_hour_limit 是长期额度速率摘要，不是额外第二层任意滚动小时锁。

## 同步与安装边界

目录文件是随应用发布的来源；安装后的不可变目录、实际实例、成长、回合、奖励、物资消耗、日程与事件均属于同步业务事实。导入锁、调度租约和未提交计算是本机状态。目录安装必须全包校验后事务提交，不覆盖历史实例，不降级更高已同步版本，进行中探索绑定旧版本。同版本不同哈希拒绝安装；没有兼容效果码的引擎停止新探索并提示升级。

本包只验证设计数据和数值子模型。完整引擎、事务、真实模型决策、页面、升级迁移及同步恢复仍按规划验收，不能用本包校验通过代替生产测试。
