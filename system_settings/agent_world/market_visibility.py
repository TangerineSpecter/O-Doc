"""Resident observations omit the world's fertilizer pricing configuration."""
import copy


def visible_supply(quote: dict) -> dict:
    return {key: quote[key] for key in ('id', 'sku', 'name', 'kind', 'price', 'quality_bonus', 'yield_percentage', 'version') if key in quote}


def visible_farm_state(state: dict) -> dict:
    result = copy.deepcopy({key: state[key] for key in ('plots', 'buildings', 'animals')})
    for plot in result['plots']:
        crop = plot.get('crop')
        if not crop:
            continue
        if crop.get('fertilizer'):
            crop['fertilizer'] = {key: value for key, value in crop['fertilizer'].items() if key not in ('base_price', 'fluctuation')}
        if 'fertilizer_rules' in crop:
            crop['fertilizer_rules'] = {kind: {key: value for key, value in rule.items() if key not in ('base_price', 'fluctuation')}
                                      for kind, rule in crop['fertilizer_rules'].items()}
    return result
