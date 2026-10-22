import type {Facing, MeadowKey, MeadowMotion, MeadowPose} from "./meadowTypes";
/* Time-based poses only. No HP, damage calculation, UI or particle ownership here. */

  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  export const meadowDurations = { idle: Infinity, move: Infinity, attack: 1.5, hit: .85, defeat: Infinity };
  export const meadowShatterAt = .26;
  export function sampleMeadowPose(key: MeadowKey, action: MeadowMotion, elapsed: number, time: number, facing: Facing, poke = 0): MeadowPose {
    // Quantizing the animation clock, rather than the RAF rate, keeps a gentle 16-bit cadence.
    const t = Math.floor(elapsed * 24) / 24, clock = Math.floor(time * 24) / 24;
    const breath = Math.sin(clock * 3);
    const p: MeadowPose = { x: 0, y: 0, sx: 1 + breath * .018, sy: 1 - breath * .018, sway: Math.sin(clock * 3 - .7) * 2.4,
      walk: 0, wobble: .15, blink: time % 4.3 > 4.13, hurt: false, flash: false, tilt: 0, fade: 0, hidden: false, facing, action, elapsed };
    if (key !== 'slime') { p.sx = 1; p.sy = 1; p.y = breath * .5; }
    if (key === 'glowbug') p.y = -17 + Math.sin(clock * 3.5) * 3;
    if (action === 'move') {
      const hop = Math.abs(Math.sin(t * (key === 'rabbit' ? 7 : 5)));
      p.x = Math.sin(t * 2.5) * 24 * facing;
      p.walk = Math.sin(t * 10);
      if (key === 'slime' || key === 'rabbit') {
        p.y = -hop * (key === 'rabbit' ? 21 : 16);
        p.sy = 1 + hop * .08; p.sx = 1 - hop * .05; p.sway += Math.sin(t * 7 - .8) * 6;
      } else if (key === 'beetle') { p.y = Math.sin(t * 15) * 1.5; p.sway *= 1.8; }
      else { p.y -= Math.sin(t * 5) * 5; p.tilt = Math.sin(t * 5) * 4; }
    } else if (action === 'attack') {
      const charge = clamp(t / .27), lunge = clamp((t - .27) / .36), recovery = clamp((t - .68) / .65);
      if (key === 'glowbug') {
        p.y -= Math.sin(clamp(t / 1.3) * Math.PI) * 8;
        p.tilt = -Math.sin(clamp(t / 1.2) * Math.PI) * 7 * facing;
        p.sway = Math.sin(t * 16) * 4 * (1 - recovery);
      } else if (t < .27) {
        p.sx = 1 + charge * .14; p.sy = 1 - charge * .16; p.sway -= charge * 7 * facing;
      } else {
        const distance = key === 'rabbit' ? 58 : key === 'beetle' ? 40 : 47;
        p.x = distance * lunge * (1 - recovery) * facing;
        p.y = -Math.sin(lunge * Math.PI) * (key === 'beetle' ? 3 : 27) * (1 - recovery);
        p.sx = 1 - Math.sin(lunge * Math.PI) * .07; p.sy = 1 + Math.sin(lunge * Math.PI) * .08;
        p.sway = (Math.sin(t * 13) * 5 + 6 * facing) * (1 - recovery); p.walk = Math.sin(t * 18);
        if (t > .6 && t < .8) { p.sx += .12; p.sy -= .1; }
      }
    } else if (action === 'hit') {
      const recoil = Math.sin(clamp(t / .85) * Math.PI) * Math.exp(-t * 2);
      p.x = -17 * recoil * facing; p.tilt = -14 * recoil * facing;
      p.sx = 1 + .15 * recoil; p.sy = 1 - .12 * recoil;
      p.flash = t < .09 || (t > .16 && t < .21); p.hurt = t < .58;
      p.sway = Math.sin(t * 23) * 10 * (1 - clamp(t / .8)); p.wobble = 1 - clamp(t / .8);
      if (key === 'glowbug') p.y += recoil * 18;
    } else if (action === 'defeat') {
      // Match the template: flash/crack for .26s, then explode at full body size.
      p.sx = 1; p.sy = 1; p.sway = 0; p.wobble = 0; p.tilt = 0;
      p.y = key === 'glowbug' ? -17 : 0;
      p.hurt = true; p.hidden = elapsed >= meadowShatterAt;
      if (!p.hidden) {
        const progress = elapsed / meadowShatterAt;
        p.x = Math.sin(elapsed * 140) * 4.5 * progress;
        p.flash = elapsed < .07 || Math.sin(elapsed * 95) > .35;
        p.fracture = progress;
      }
    }
    if (poke > 0 && action !== 'defeat') {
      const recoil = Math.sin(poke * 22) * Math.exp(-poke * 4);
      p.sx += recoil * .1; p.sy -= recoil * .1; p.sway += recoil * 8;
    }
    return p;
  }
