/* Cave movement is local. Hit/defeat use the approved meadow sampler unchanged,
   with only the bat's hovering anchor adapted. */
(() => {
  const shared = window.MeadowMotion;
  const clamp = n => Math.max(0, Math.min(1, n));
  function sample(key, action, elapsed, time, facing, poke) {
    const p = shared.sample(key === 'bat' ? 'glowbug' : key, action, elapsed, time, facing, poke);
    if (action === 'hit' || action === 'defeat') return p;
    const t = Math.floor(elapsed * 24) / 24;
    const airborne = key === 'bat';
    Object.assign(p, {x:0, y:airborne ? -19 + Math.sin(time * 3.5) * 2 : Math.sin(time * 2.1) * .6,
      sx:1, sy:1, tilt:0, walk:0, action, elapsed});
    if (action === 'move') {
      p.x = Math.sin(t * 1.7) * 26 * facing;
      p.walk = 1;
      p.y += airborne ? Math.sin(t * 4) * 4 : -Math.abs(Math.sin(t * 9)) * (key === 'king' ? 1 : 1.5);
    } else if (action === 'strike') {
      const charge = clamp(t / .65), drop = clamp((t - .65) / .23), settle = clamp((t - .88) / .65);
      p.walk = 0; p.y = 0; p.sx = 1; p.sy = 1;
      p.foreLift = 16 * charge * (1 - drop);
      p.tilt = -2 * facing * charge * (1 - drop);
      if (t > .88) p.y = Math.sin(settle * Math.PI) * 2.5 * (1-settle);
    } else if (action === 'crystal') {
      const charge = clamp(t/.6), recover = clamp((t-1.1)/.8);
      p.sy = 1 - .045 * charge * (1-recover); p.tilt = -2 * facing * charge * (1-recover);
      p.x = -4 * facing * charge * (1-recover);
    } else if (action === 'attack') {
      const charge = clamp(t / .30), release = clamp((t - .30) / .3), recover = clamp((t - .65) / .6);
      if (t < .30) {
        p.x = -charge * 5 * facing; p.tilt = -charge * 5 * facing;
        p.sy = 1 - charge * .035; p.y += charge * 2;
      } else {
        p.x = (airborne ? 53 : key === 'lizard' ? 38 : 35) * Math.sin(release * Math.PI / 2) * (1-recover) * facing;
        p.y += airborne ? Math.sin(release * Math.PI) * 13 * (1-recover) : -Math.sin(release * Math.PI) * 3 * (1-recover);
        p.tilt = 4 * (1-recover) * facing; p.walk = Math.sin(release * Math.PI) * (1-recover);
      }
    } else if (action === 'evasion') {
      const pulse = Math.sin(clamp(t / 1.25) * Math.PI);
      p.x = -45 * pulse * facing; p.y -= pulse * 12; p.tilt = -pulse * 6 * facing;
    } else if (action === 'guard') {
      const pulse = Math.sin(clamp(t / 3.0) * Math.PI);
      p.y += pulse * 2; p.sy = 1 - pulse * .025;
    }
    return p;
  }
  window.MeadowMotion = {sample, shatterAt:shared.shatterAt,
    durations:{...shared.durations, attack:1.5, evasion:1.25, guard:3.0, strike:2.35, crystal:2.5}};
})();
