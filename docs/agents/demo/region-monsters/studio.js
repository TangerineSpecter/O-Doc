/* Preview orchestration: DOM, playback clock and local demonstration state. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const art = window.MeadowArt, monsters = window.MeadowMonsters, motion = window.MeadowMotion;
  const canvas = $('#arena'), ctx = canvas.getContext('2d');
  const frame = art.makeCanvas(art.width, art.height), frameCtx = frame.getContext('2d');
  const backgroundFrame = art.makeCanvas(art.width, art.height), backgroundCtx = backgroundFrame.getContext('2d');
  const effects = new window.MeadowEffects();
  const actions = ['idle', 'move', 'attack', 'hit', 'defeat', ...Object.keys(window.RegionPreview.labels)];
  const actionNames = ['待机', '移动', '普通攻击', '受击', '倒下', ...Object.values(window.RegionPreview.labels)];
  let demoSteps = [['idle', 1.6], ['move', 2.1], ['attack', 1.6], ['hit', 1], ['defeat', 3.0]];
  const state = { key: Object.keys(monsters)[0], action: 'idle', elapsed: 0, time: 0, speed: 1, facing: -1, health: 100,
    paused: matchMedia('(prefers-reduced-motion: reduce)').matches, pokeAt: -10, demoIndex: -1, demoElapsed: 0, fired: false,
    options: { dither: false, layers: false, grid: false, night: false, plain: false, atlas: false }, sound: false };
  let raf = 0, disposed = false;
  let last = performance.now(), fpsTime = last, fpsFrames = 0, audio = null;
  let view = { scale: 1, x: 0, y: 0 };

  function playSound(action) {
    if (!state.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ||= new Audio();
      if (audio.state === 'suspended') void audio.resume().catch(() => {});
      const now = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
      const high = action === 'attack' ? 620 : action === 'defeat' ? 180 : 430;
      osc.type = monsters[state.key].family === 'golem' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(high, now); osc.frequency.exponentialRampToValueAtTime(action === 'defeat' ? 70 : high / 2, now + .16);
      gain.gain.setValueAtTime(.045, now); gain.gain.exponentialRampToValueAtTime(.001, now + .2);
      osc.connect(gain).connect(audio.destination); osc.start(now); osc.stop(now + .21);
    } catch { state.sound = false; $('#sound').setAttribute('aria-pressed', 'false'); }
  }
  function syncHealth() {
    $('#health-fill').style.width = `${state.health}%`; $('#health-value').textContent = `${state.health}%`;
  }
  function syncStatus() {
    const index = actions.indexOf(state.action), mon = monsters[state.key];
    $('#status').textContent = state.paused ? '已暂停' : state.action === 'defeat' && state.elapsed > motion.shatterAt ? '已击败 · 像素爆裂粉碎' : `${actionNames[index]} · ${(mon.hints[index] || ('技能视觉演示')).split('，')[0].split('、')[0]}`;
    $('#interaction-tip').textContent = state.action === 'defeat' ? '碎片保留在地面 · 点击重置重新开始' : '轻触小家伙，看看它的反应';
    $('#arena').setAttribute('aria-label', `${mon.name}，${actionNames[index]}动作${state.paused ? '，已暂停' : ''}`);
  }
  function syncPause() {
    $('#pause').setAttribute('aria-label', state.paused ? '继续动画' : '暂停动画');
    $('#pause').textContent = state.paused ? '▷ 继续' : 'Ⅱ 暂停'; $('#pause').setAttribute('aria-pressed', String(state.paused)); syncStatus();
  }
  function stopDemo() { state.demoIndex = -1; $('#demo').setAttribute('aria-pressed', 'false'); }
  function setAction(action, fromDemo = false) {
    if (!actions.includes(action) || (actions.indexOf(action) > 4 && !monsters[state.key].skills.includes(action))) return;
    if (!fromDemo) stopDemo();
    const wasDefeated = state.action === 'defeat';
    state.action = action; state.elapsed = 0; state.fired = false; state.pokeAt = -10;
    effects.clear();
    if (wasDefeated && action !== 'defeat') state.health = 100;
    if (action === 'hit') state.health = Math.max(10, state.health - 20);
    if (action === 'defeat') state.health = 0;
    $$('[data-action]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.action === action)));
    $('#skill-caption').textContent = window.RegionSkills.monsterDescriptions?.[state.key]?.[action] || window.RegionSkills.descriptions[action] || '选择技能查看动作过程；演示不参与战斗结算。';
    syncHealth(); syncStatus(); playSound(action);
  }
  function selectMonster(key) {
    if (!Object.hasOwn(monsters, key)) return;
    state.key = key; state.health = 100; const mon = monsters[key];
    document.documentElement.style.setProperty('--accent', mon.color);
    document.documentElement.style.setProperty('--pale', state.options.night ? '#34483b' : mon.pale);
    $$('.monster-tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.monster === key)));
    $('#rank-name').textContent = mon.rank;
    $('#skill-note').textContent = mon.skillNote || (mon.skills.length ? `已有技能：${mon.skills.map(k => window.RegionPreview.labels[k]).join('、')}。点击下方按钮单独演示。` : '当前技能：仅普通攻击，暂无额外主动技能。');
    $('#skills').replaceChildren(...mon.skills.map(key => {
      const button = document.createElement('button'); button.className = 'skill-button';
      button.dataset.action = key; button.textContent = window.RegionPreview.labels[key];
      button.setAttribute('aria-pressed', 'false'); button.addEventListener('click', () => setAction(key)); return button;
    }));
    demoSteps = [['idle',1.6],['move',2.1],['attack',1.6],...mon.skills.map(key => [key,motion.durations[key]+.15]),['hit',1],['defeat',3]];
    $('#level').textContent = `Lv.${mon.level}`;
    $('#monster-index').textContent = `Nº ${mon.index}`;
    $('#monster-name').replaceChildren(document.createTextNode(mon.name + ' '), Object.assign(document.createElement('span'), { textContent: mon.english }));
    $('#monster-description').textContent = mon.description;
    $('#monster-material').textContent = mon.material; $('#monster-attack').textContent = mon.attack; $('#monster-role').textContent = mon.role;
    for (let n = 0; n < 5; n++) $(`#hint-${actions[n]}`).textContent = mon.hints[n];
    setAction('idle'); syncHealth();
  }
  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    // Contain preserves wings, antlers and attack travel on narrow screens.
    const scale = Math.min(canvas.width / art.width, canvas.height / art.height);
    view = { scale, x: (canvas.width - art.width * scale) / 2, y: (canvas.height - art.height * scale) / 2 };
    ctx.imageSmoothingEnabled = false;
  }
  function drawThumbnails() {
    for (const button of $$('.monster-tab')) {
      const thumb = button.querySelector('canvas'), tctx = thumb.getContext('2d');
      tctx.imageSmoothingEnabled = false;
      const source = art.drawSprite(button.dataset.monster, { facing: -1 }, 0);
      tctx.drawImage(source, 0, 0, 128, 128, 0, 0, 64, 64);
    }
  }
  function update(dt) {
    if (state.paused) return;
    state.time += dt; state.elapsed += dt;
    if (state.demoIndex >= 0) {
      state.demoElapsed += dt;
      if (state.demoElapsed >= demoSteps[state.demoIndex][1]) {
        state.demoIndex++; state.demoElapsed = 0;
        if (state.demoIndex >= demoSteps.length) stopDemo();
        else setAction(demoSteps[state.demoIndex][0], true);
      }
    }
    if (state.elapsed >= motion.durations[state.action]) setAction('idle', state.demoIndex >= 0);
    const trigger = state.action === 'attack' ? .60 : state.action === 'defeat' ? motion.shatterAt : Infinity;
    if (!state.fired && state.elapsed >= trigger) {
      state.fired = true;
      if (state.action === 'attack') effects.attack(state.key, state.facing);
      else {
        const pose = motion.sample(state.key, state.action, state.elapsed, state.time, state.facing, 0);
        effects.shatter(state.key, pose, state.options, state.time);
      }
    }
    effects.update(dt);
  }
  function render() {
    canvas.dataset.monster = state.key; canvas.dataset.action = state.action; canvas.dataset.elapsed = state.elapsed.toFixed(3);
    const resolution = monsters[state.key].scale > 1 ? 2 : 1;
    if (frame.width !== art.width * resolution) {
      frame.width = art.width * resolution; frame.height = art.height * resolution;
    }
    frameCtx.setTransform(resolution,0,0,resolution,0,0);
    frameCtx.imageSmoothingEnabled = false;
    // Preserve the existing background's 320px texture while retaining the boss's finer sprite.
    art.drawBackground(backgroundCtx, state.options, state.time);
    frameCtx.drawImage(backgroundFrame,0,0);
    effects.draw(frameCtx, false);
    const poke = state.time - state.pokeAt;
    const pose = motion.sample(state.key, state.action, state.elapsed, state.time, state.facing, poke < .8 ? poke : 0);
    art.drawCharacter(frameCtx, state.key, pose, state.time, state.options);
    effects.draw(frameCtx, true);
    ctx.fillStyle = state.options.night ? '#263f3c' : '#e8efde'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingEnabled = false;
    const skillShake = window.RegionSkills.camera(pose);
    const shake = {x:effects.camera.x + skillShake.x, y:effects.camera.y + skillShake.y};
    ctx.drawImage(frame, view.x + shake.x * view.scale, view.y + shake.y * view.scale, art.width * view.scale, art.height * view.scale);
    if (state.options.grid) {
      ctx.strokeStyle = state.options.night ? '#ffffff13' : '#25462e16'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x <= art.width; x++) { ctx.moveTo(view.x + x * view.scale, 0); ctx.lineTo(view.x + x * view.scale, canvas.height); }
      for (let y = 0; y <= art.height; y++) { ctx.moveTo(0, view.y + y * view.scale); ctx.lineTo(canvas.width, view.y + y * view.scale); }
      ctx.stroke();
    }
  }
  function loop(now) {
    if (disposed || document.hidden) { raf = 0; return; }
    const dt = Math.min(.05, (now - last) / 1000) * state.speed; last = now;
    update(dt); render(); fpsFrames++;
    if (now - fpsTime > 600) { $('#fps').textContent = String(Math.round(fpsFrames * 1000 / (now - fpsTime))); fpsTime = now; fpsFrames = 0; syncStatus(); }
    raf = requestAnimationFrame(loop);
  }
  function toggleOption(id, option) {
    $(id).addEventListener('click', () => {
      state.options[option] = !state.options[option]; $(id).setAttribute('aria-pressed', String(state.options[option]));
      if ((option === 'atlas' || option === 'layers') && state.action === 'defeat') setAction('idle');
      if (option === 'layers') $('#layer-legend').hidden = !state.options.layers;
      if (option === 'night') {
        document.body.classList.toggle('night', state.options.night);
        document.documentElement.style.setProperty('--pale', state.options.night ? '#34483b' : monsters[state.key].pale);
        $('.weather').textContent = state.options.night ? '暗光 · ' + window.RegionPreview.weather : window.RegionPreview.weather;
      }
    });
  }
  $$('.monster-tab').forEach(b => b.addEventListener('click', () => selectMonster(b.dataset.monster)));
  $$('.action').forEach(b => b.addEventListener('click', () => setAction(b.dataset.action)));
  $$('[data-speed]').forEach(b => b.addEventListener('click', () => {
    state.speed = Number(b.dataset.speed); $$('[data-speed]').forEach(s => s.setAttribute('aria-pressed', String(s === b)));
  }));
  $('#pause').addEventListener('click', () => { state.paused = !state.paused; syncPause(); });
  $('#reset').addEventListener('click', () => { state.health = 100; state.paused = false; setAction('idle'); syncPause(); });
  $('#demo').addEventListener('click', () => {
    if (state.demoIndex >= 0) { stopDemo(); return; }
    state.health = 100; state.paused = false; state.demoIndex = 0; state.demoElapsed = 0;
    setAction('idle', true); $('#demo').setAttribute('aria-pressed', 'true'); syncPause();
  });
  $('#flip').addEventListener('click', () => {
    if (state.action === 'defeat') setAction('idle');
    state.facing *= -1; $('#flip').textContent = `⇄ 朝向：${state.facing > 0 ? '右' : '左'}`; $('#flip').setAttribute('aria-pressed', String(state.facing < 0));
  });
  for (const [id, option] of [['#background', 'plain'], ['#atlas', 'atlas'], ['#grid', 'grid'], ['#layers', 'layers'], ['#night', 'night']]) toggleOption(id, option);
  $('#sound').addEventListener('click', () => { state.sound = !state.sound; $('#sound').setAttribute('aria-pressed', String(state.sound)); playSound('idle'); });
  canvas.addEventListener('pointerdown', e => {
    if (state.paused || state.action === 'defeat') return;
    const r = canvas.getBoundingClientRect(), ratio = canvas.width / r.width;
    const x = ((e.clientX - r.left) * ratio - view.x) / view.scale, y = ((e.clientY - r.top) * ratio - view.y) / view.scale;
    const p = motion.sample(state.key, state.action, state.elapsed, state.time, state.facing, 0), size = (state.options.atlas ? 25 : 60) * art.monsterScale(state.key);
    if (Math.abs(x - 160 - p.x) < size && y > window.RegionPreview.floor + p.y - size * 2 && y < window.RegionPreview.floor + 4 + p.y) {
      state.pokeAt = state.time; effects.burst(x, y, monsters[state.key].effect, 8, .45, 20); playSound('idle');
    }
  });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.target.closest('input, textarea, button, [contenteditable]')) return;
    if (e.key >= '1' && e.key <= '5') { e.preventDefault(); setAction(actions[Number(e.key) - 1]); }
    if (e.code === 'Space') { e.preventDefault(); state.paused = !state.paused; syncPause(); }
    if (e.key.toLowerCase() === 'r') $('#reset').click();
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { last = performance.now(); if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf && !disposed) raf = requestAnimationFrame(loop); });
  window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(raf); if (audio) void audio.close(); });
  window.addEventListener('pageshow', e => { if (e.persisted) { disposed = false; audio = null; last = performance.now(); raf = requestAnimationFrame(loop); } });
  drawThumbnails();
  const initial = new URLSearchParams(location.search).get('monster');
  selectMonster(initial && Object.hasOwn(monsters, initial) ? initial : Object.keys(monsters)[0]); syncPause(); resize(); raf = requestAnimationFrame(loop);
})();
