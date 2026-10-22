import type {Graphics} from 'pixi.js';
import type {MeadowProfile} from './meadowTypes';

/** Illustrative hit feedback; aligned with the observation clock, never changes combat state. */
export function drawMeadowAttack(g: Graphics, profile: MeadowProfile, age: number, enemyX: number, heroX: number) {
    const impact = profile.ranged ? .9 : .65;
    if (profile.ranged && age >= .42 && age < impact) {
        const progress = (age - .42) / (impact - .42);
        const x = enemyX - 30 + (heroX - enemyX + 30) * progress, y = -100;
        g.rect(Math.round(x) - 10, y - 6, 18, 14).fill(0xe8be4a);
        g.rect(Math.round(x) - 6, y - 4, 12, 10).fill(0xfff4b2);
        g.rect(Math.round(x) - 2, y - 2, 6, 4).fill(0xfffde6);
        for (let n = 1; n < 5; n++) g.rect(Math.round(x + n * 10), y - 2, 4, 4).fill(n % 2 ? 0xf6db85 : 0xfff0b0);
    }
    const t = age - impact;
    if (t < 0 || t > .7) return;
    const count = profile.key === 'slime' ? 32 : profile.ranged ? 28 : 17;
    for (let n = 0; n < count; n++) {
        const angle = n * 2.399, speed = 35 + n % 7 * 12;
        const x = heroX + Math.cos(angle) * speed * t;
        const y = (profile.ranged ? -100 : -30) + (Math.sin(angle) * speed - 55) * t + (profile.ranged ? -8 : 65) * t * t;
        const size = n % 5 === 0 ? 5 : n % 2 ? 3 : 2;
        g.rect(Math.round(x), Math.round(y), size, size).fill({color: profile.colors[n % 3], alpha: Math.min(1, (.7 - t) * 3)});
    }
    if (!profile.ranged && t < .5) {
        for (let n = 0; n < 48; n++) {
            const a = n / 48 * Math.PI * 2, radius = 12 + t * 150;
            g.rect(Math.round(heroX + Math.cos(a) * radius), Math.round(Math.sin(a) * radius * .2), 3, 2);
        }
        g.fill({color: profile.colors[1], alpha: 1 - t / .5});
    }
}
