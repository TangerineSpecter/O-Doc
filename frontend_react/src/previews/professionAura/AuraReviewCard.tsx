import {auraNames, getProfessionAura} from '../../components/Combat/art/professionAuras';
import type {outfitArts} from '../../components/Combat/animation/playerAppearance/layeredPlayerArt';
import {useAuraReview} from './useAuraReview';
type Outfit = typeof outfitArts[number];

export function AuraReviewCard({outfit, paused}: {outfit: Outfit; paused: boolean}) {
    const {canvas, error, ready} = useAuraReview(outfit.id, paused);
    const name = auraNames[getProfessionAura(outfit.id)].split(' · ')[1];
    return <article className={`aura-review-card family-${outfit.family}`}>
        <div className="aura-review-art"><canvas ref={canvas} role="img" aria-label={`${outfit.name} · ${name}动态职业效果`}/>
            {!ready && <span className="aura-review-loading">{error || '正在装配形象…'}</span>}
        </div>
        <div className="aura-review-caption"><div><h2>{outfit.name}</h2><p>{name}</p></div><a href={`/player-layered-preview.html?job=${outfit.id}`} aria-label={`单独查看${outfit.name}`}>↗</a></div>
    </article>;
}
