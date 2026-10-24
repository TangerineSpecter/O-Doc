(() => {
    const $ = id => document.getElementById(id), state = { action: 'idle', time: 0, playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, speed: 1, flip: false, ready: false };
    let renderer, last = 0;
    const actions = Object.entries(AnyaMotion.actions);
    function updatePlay() { $('play').textContent = state.playing ? '暂停' : '播放'; }
    function choose(key) { state.action = key; state.time = 0; $('actionName').textContent = AnyaMotion.actions[key].name; $('description').textContent = AnyaMotion.actions[key].description; if (state.ready)
        renderStrip(); document.querySelectorAll('[data-action]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.action === key))); }
    actions.forEach(([key, a], i) => { const b = document.createElement('button'); b.className = 'action'; b.dataset.action = key; b.innerHTML = `<em>0${i + 1}</em><span>${a.name}<small>${a.detail}</small></span>`; b.onclick = () => choose(key); $('actions').append(b); });
    $('play').onclick = () => { if (state.time >= AnyaMotion.actions[state.action].duration)
        state.time = 0; state.playing = !state.playing; updatePlay(); };
    $('timeline').oninput = e => { state.playing = false; state.time = Number(e.target.value) / 1000 * AnyaMotion.actions[state.action].duration; updatePlay(); };
    $('flip').onclick = () => { state.flip = !state.flip; $('flip').setAttribute('aria-pressed', String(state.flip)); };
    $('original').onchange = e => { $('reference').hidden = !e.target.checked; $('stage').style.visibility = e.target.checked ? 'hidden' : 'visible'; };
    document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { state.speed = Number(b.dataset.speed); document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    document.addEventListener('keydown', e => { if (['INPUT', 'BUTTON'].includes(document.activeElement.tagName))
        return; if (e.code === 'Space') {
        e.preventDefault();
        if (state.ready)
            $('play').click();
    } const i = Number(e.key) - 1; if (actions[i])
        choose(actions[i][0]); });
    function frame(now) { const delta = Math.min((now - last) / 1000, .05); last = now; if (renderer) {
        const duration = AnyaMotion.actions[state.action].duration;
        if (state.playing && !document.hidden) {
            state.time += delta * state.speed;
            if (state.time >= duration) {
                if ($('loop').checked)
                    state.time %= duration;
                else {
                    state.time = duration;
                    state.playing = false;
                    updatePlay();
                }
            }
        }
        renderer.render(state.action, state.time, { bones: $('bones').checked, spread: $('spread').checked, effects: $('effects').checked, flip: state.flip });
        $('timeline').value = state.time / duration * 1000;
        $('time').textContent = `${state.time.toFixed(2)} / ${duration.toFixed(2)} s`;
    } requestAnimationFrame(frame); }
    new ResizeObserver(() => { const canvas = $('stage'), ratio = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(canvas.clientWidth * ratio); canvas.height = Math.round(canvas.clientHeight * ratio); }).observe($('stage'));
    function renderStrip() { const holder = $('pose-strip'); holder.replaceChildren(); if (holder.hidden || !renderer)
        return; [0, .25, .45, .6, .8].forEach(p => { const cell = document.createElement('div'), canvas = document.createElement('canvas'), label = document.createElement('small'); canvas.width = 280; canvas.height = 340; new AnyaRenderer(canvas, renderer.image).render(state.action, p * AnyaMotion.actions[state.action].duration, { effects: false, bones: $('bones').checked }); label.textContent = Math.round(p * 100) + '%'; cell.append(canvas, label); holder.append(cell); }); }
    $('keyframes').onchange = e => { $('pose-strip').hidden = !e.target.checked; renderStrip(); };
    $('bones').addEventListener('change', renderStrip);
    choose('idle');
    updatePlay();
    const image = new Image();
    image.onload = () => { try {
        renderer = new AnyaRenderer($('stage'), image);
        state.ready = true;
        $('play').disabled = false;
        $('status').textContent = '姿态重建 · 连续关节 / 脚掌滚动';
        window.anyaPreview = { state, renderer, choose };
    }
    catch (e) {
        $('status').textContent = '素材解析失败，请通过本地 HTTP 服务打开';
        console.error(e);
    } };
    image.onerror = () => { $('status').textContent = '拆件素材加载失败，请检查 anya-rig/parts-v3.png'; };
    image.src = 'anya-rig/parts-v3.png';
    requestAnimationFrame(frame);
})();
