"""Music actions and persistent round state. Pure snapshots; no models or model calls."""
from . import effects


def identity(unit: dict) -> str:
    return str(unit.get('id') or unit['name'])


def passive(unit: dict, code: str) -> float:
    return sum(float(fx['value']) for fx in unit.get('passives', []) if fx['code'] == code)


def duration(unit: dict, base: int) -> int:
    return base + int(passive(unit, 'passive_music_duration')) if base > 0 else 0


def living(units: dict) -> list[dict]:
    return sorted((u for u in units.values() if u['hp'] > 0), key=identity)


def music_row(catalog, sid, rank):
    return next((fx for fx in catalog.skill(sid, rank)[1] if fx['code'] == 'bard_music'), None)


def silenced(unit: dict, tick: int) -> bool:
    return any(s['code'] == 'bard_silence' and s['expires'] > tick for s in unit['states'])


def prepare(units: dict, tick: int) -> None:
    for unit in units.values():
        unit['states'] = [s for s in unit['states'] if not s.get('music') or s['expires'] > tick]
        melody = unit.get('bard', {}).get('melody')
        if melody and melody['expires'] <= tick:
            unit['bard'].pop('melody', None)


def resonance(caster: dict, target: dict, tick: int):
    return next((s for s in target['states'] if s['code'] == 'bard_resonance' and
                 s.get('source_id') == identity(caster) and s['expires'] > tick), None)


def event(caster, target, name, kind='modifier', **extra):
    return {'actor': caster['name'], 'actor_id': identity(caster), 'target': target['name'],
            'target_id': identity(target), 'action': name, 'kind': kind, 'music': True, **extra}


def modifier(caster, target, name, stat, amount, group, expires, *, melody=False):
    state = {'code': 'modifier', 'stat': stat, 'value': amount, 'group': group+':'+identity(caster),
             'expires': expires, 'name': name, 'source_id': identity(caster), 'music': True,
             'melody': melody}
    effects.status(target, state)
    return event(caster, target, name, value=amount, stat=stat, expires=expires)


def score(catalog, caster, enemy, sid, rank, tick, friends=None, enemies=None):
    fx = music_row(catalog, sid, rank)
    if not fx:
        return None
    action = fx['group']
    friends = friends or {identity(caster): caster}
    if action in ('encourage', 'melody_attack', 'melody_guard'):
        targets = living(friends)
        stat = 'reduction' if action == 'melody_guard' else 'attack'
        amount = float(fx['value']) * (1+passive(caster, 'passive_melody_power') if action.startswith('melody_') else 1)
        prefix = 'bard_guard:' if stat == 'reduction' else 'bard_attack:'
        if not any(max((s['value'] for s in u['states'] if s['group'].startswith(prefix) and s['expires'] > tick+1), default=0) < amount for u in targets):
            return 0
        if action == 'melody_guard':
            return 4 if min(u['hp']/u['stats']['hp_max'] for u in targets) < .5 else .25
        return 3 if action == 'melody_attack' else .6
    if action == 'requiem':
        return 2 if any(not any(s.get('source_id') == identity(caster) and s['group'].startswith('bard_requiem:') and s['expires'] > tick+1 for s in u['states']) for u in living(enemies or {identity(enemy):enemy})) else 0
    if action == 'beat_finisher':
        return 3 if caster.get('bard', {}).get('beats', 0) >= 3 else .15
    if action == 'resonance_finisher':
        stack = resonance(caster, enemy, tick)
        return 3 if stack and stack['value'] >= 3 else .15
    if action == 'silence' and any(s['code'] == 'bard_silence_immunity' and s['expires'] > tick for s in enemy['states']):
        return .3
    return 1


def cast(catalog, caster, target, friends, enemies, sid, rank, tick, rng):
    from .engine import cost
    row, _ = catalog.skill(sid, rank)
    fx = music_row(catalog, sid, rank)
    if not fx or caster.get('skills',{}).get(sid,0) < rank or caster['hp'] <= 0 or silenced(caster, tick) or tick < caster['cooldowns'].get(sid,0):
        return []
    price = cost(catalog, caster, sid, rank)
    if caster['mp'] < price:
        return []
    caster['mp'] -= price
    caster['cooldowns'][sid] = tick+int(row['cooldown_rounds'])
    name = catalog.row('skills',sid)['name']
    action, amount = fx['group'], float(fx['value'])
    length = duration(caster, int(fx['duration']))
    bard = caster.setdefault('bard', {})
    events = []
    if action in ('encourage','melody_attack','melody_guard'):
        targets = living(friends)
        if action == 'encourage':
            targets = sorted(targets,key=lambda u:(max((s['value'] for s in u['states'] if s['group'].startswith('bard_attack:') and s['expires'] > tick),default=0),identity(u)))[:1]
        else:
            for unit in friends.values():
                unit['states'] = [s for s in unit['states'] if not(s.get('melody') and s.get('source_id') == identity(caster))]
            bard['melody'] = {'skill_id':sid,'expires':tick+length,'extended':False}
            amount *= 1+passive(caster,'passive_melody_power')
        guard = action == 'melody_guard'
        for unit in targets:
            events.append(modifier(caster,unit,name,'reduction' if guard else 'attack',amount,
                                   'bard_guard' if guard else 'bard_attack_single' if action=='encourage' else 'bard_attack',tick+length,melody=action!='encourage'))
        return events
    if action == 'requiem':
        for unit in living(enemies):
            value = amount * (.5 if unit.get('rank') == 'boss' else 1)
            events.append(modifier(caster,unit,name,'attack',-value,'bard_requiem',tick+length))
            sanctuary = passive(caster,'passive_bard_sanctuary')
            if sanctuary:
                events.append(modifier(caster,unit,name,'outgoing_reduction',sanctuary,'bard_sanctuary',tick+length))
        return events
    stacks = resonance(caster,target,tick)
    consumed = int(stacks['value']) if stacks else 0
    if action == 'beat_finisher' and bard.get('beats',0) >= 3:
        amount = (4,4.5,5)[rank-1]
    if action == 'resonance_finisher':
        amount += consumed*(.5,.6,.7)[rank-1]
    damage = {**fx,'code':'damage','value':amount}
    events = effects.apply(catalog,caster,target,[damage],name,tick,rng,allies=friends)
    hit = any(e['kind']=='damage' and e.get('hit') for e in events)
    if not hit:
        return events
    if action == 'beats':
        bard['beats'] = min(3,bard.get('beats',0)+1)
        events.append(event(caster,caster,name,kind='bard_beats',stacks=bard['beats']))
    if action == 'beat_finisher' and bard.get('beats',0) >= 3:
        bard['beats'] = 0
    if action == 'resonance_finisher' and stacks:
        target['states'].remove(stacks)
    if action == 'resonance' and target['hp'] > 0:
        if stacks:
            stacks['value'] = min(3,stacks['value']+1)
            stacks['expires'] = tick+length
        else:
            target['states'].append({'code':'bard_resonance','group':'bard_resonance:'+identity(caster),
                'value':1,'source_id':identity(caster),'expires':tick+length,'name':name,'music':True})
        events.append(event(caster,target,name,kind='bard_resonance',stacks=1 if not stacks else stacks['value']))
    if action == 'extend_melody':
        melody = bard.get('melody')
        if melody and melody['expires'] > tick and not melody['extended']:
            melody['expires'] += 1
            melody['extended'] = True
            for unit in friends.values():
                for state in unit['states']:
                    if state.get('melody') and state.get('source_id') == identity(caster):
                        state['expires'] += 1
            events.append(event(caster,caster,name,kind='bard_melody_extend',duration=1))
    if target['hp'] <= 0:
        return events
    if action == 'accuracy_break':
        events.append(modifier(caster,target,name,'accuracy',-(.05,.075,.10)[rank-1],'bard_accuracy',tick+length))
    if action == 'silence':
        immune = any(s['code']=='bard_silence_immunity' and s['expires'] > tick for s in target['states'])
        if not immune and (target.get('rank')!='boss' or rng.random() < .5):
            target['states'].extend([
                {'code':'bard_silence','group':'bard_silence','value':1,'expires':tick+length,'source_id':identity(caster),'name':name,'music':True},
                {'code':'bard_silence_immunity','group':'bard_silence_immunity','value':1,'expires':tick+length+1,'name':name,'music':True},
            ])
            events.append(event(caster,target,name,kind='bard_silence',duration=length))
    # Sanctuary also follows the caster's other enemy music debuffs.
    if action in ('accuracy_break','silence') and passive(caster,'passive_bard_sanctuary'):
        events.append(modifier(caster,target,name,'outgoing_reduction',passive(caster,'passive_bard_sanctuary'),'bard_sanctuary',tick+length))
    return events


def echo(catalog, caster, allies, dealt, tick, rng):
    probability = passive(caster,'passive_bard_echo')
    if dealt <= 0 or caster['hp'] <= 0 or probability <= 0 or rng.random() >= probability:
        return []
    targets = [u for u in living(allies or {}) if identity(u) != identity(caster)] or [caster]
    target = targets[rng.randrange(len(targets))]
    stat,amount = (('attack',.08),('accuracy',.05),('critical',.03))[rng.randrange(3)]
    target['states'] = [s for s in target['states'] if not(s.get('echo') and s.get('source_id') == identity(caster))]
    result = modifier(caster,target,'余音馈赠','attack' if stat=='attack' else stat,amount,
                      'bard_attack_echo' if stat=='attack' else 'bard_echo_'+stat,tick+duration(caster,2))
    state = next(s for s in target['states'] if s.get('source_id')==identity(caster) and s['group']==('bard_attack_echo' if stat=='attack' else 'bard_echo_'+stat)+':'+identity(caster))
    state['echo'] = True
    return [result]
