"""Structural validation of music state inside existing signed combat snapshots."""
from math import isfinite


def validate_unit(unit: dict) -> None:
    if not isinstance(unit,dict):
        raise ValueError('战斗单位结构无效')
    music=unit.get('bard')
    if music is not None:
        if not isinstance(music,dict) or set(music)-{'beats','melody'}:
            raise ValueError('音律状态结构无效')
        beats=music.get('beats',0)
        if type(beats) is not int or not 0<=beats<=3:
            raise ValueError('节拍层数无效')
        melody=music.get('melody')
        if melody is not None and (not isinstance(melody,dict) or
            set(melody)!={'skill_id','expires','extended'} or melody['skill_id'] not in
            {'skill.player.081','skill.player.082','skill.player.087'} or
            type(melody['expires']) is not int or melody['expires']<0 or type(melody['extended']) is not bool):
            raise ValueError('主旋律状态无效')
    for state in unit.get('states',[]):
        if not state.get('music'):
            continue
        if (state.get('code') not in {'modifier','bard_resonance','bard_silence','bard_silence_immunity'} or
            type(state.get('expires')) is not int or state['expires']<0 or
            type(state.get('value')) not in (int,float) or not isfinite(state['value']) or
            not isinstance(state.get('name'),str) or not isinstance(state.get('group'),str)):
            raise ValueError('音律持续效果无效')
        if state['code']=='bard_resonance' and (type(state['value']) is not int or
                not 1<=state['value']<=3 or not isinstance(state.get('source_id'),str)):
            raise ValueError('共振层数或来源无效')
        if state['code']=='modifier' and (state.get('stat') not in
                {'attack','accuracy','critical','reduction','outgoing_reduction'} or not -1<=state['value']<=1):
            raise ValueError('音律增益数值无效')
