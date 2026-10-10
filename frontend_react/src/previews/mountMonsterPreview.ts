interface PreviewScene<A extends string> {
    init(): Promise<void>;
    readonly isPaused: boolean;
    play(action: A): void;
    setFacing(facing: -1 | 1): void;
    setBackdrop(backdrop: 'cave' | 'plain'): void;
    setSmall(small: boolean): void;
    togglePaused(): boolean;
    dispose(): void;
}
interface PreviewOptions<A extends string> {
    name: string;
    hostSelector: string;
    basicActions: readonly A[];
    labels: Record<A, string>;
    createScene(host: HTMLElement, onAction: (action: A) => void): PreviewScene<A>;
}

/** Creature previews share controls, shortcuts and teardown, not creature motion. */
export function mountMonsterPreview<A extends string>(options: PreviewOptions<A>) {
    const host = document.querySelector<HTMLElement>(options.hostSelector)!;
    const stateLabel = document.querySelector<HTMLElement>('#scene-state')!;
    const loadMessage = document.querySelector<HTMLElement>('#load-message')!;
    const pauseButton = document.querySelector<HTMLButtonElement>('#pause')!;
    const fallback = document.querySelector<HTMLElement>('#preview-fallback');
    const controls = document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input');
    const subscription = new AbortController();
    const listenerOptions = {signal: subscription.signal};
    let currentAction = options.basicActions[0];
    let ready = false;
    let alive = true;

    function updateStatus() {
        stateLabel.textContent = scene.isPaused ? '已暂停' : options.labels[currentAction];
        pauseButton.textContent = scene.isPaused ? '▷ 继续动画' : 'Ⅱ 暂停动画';
        pauseButton.setAttribute('aria-pressed', String(scene.isPaused));
    }
    function selectAction(action: A) {
        currentAction = action;
        document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.action === action));
        });
        updateStatus();
    }
    const scene = options.createScene(host, selectAction);
    function play(action: A) {
        if (!ready) return;
        scene.play(action);
        selectAction(action);
    }
    controls.forEach(control => { control.disabled = true; });
    void scene.init().then(() => {
        if (!alive) return;
        ready = true;
        loadMessage.hidden = true;
        if (fallback) fallback.hidden = true;
        controls.forEach(control => { control.disabled = false; });
        updateStatus();
    }).catch(() => {
        scene.dispose();
        if (!alive) return;
        loadMessage.textContent = `${options.name}动画加载失败，保留静态形象，请刷新重试。`;
        loadMessage.setAttribute('role', 'alert');
        stateLabel.textContent = '暂不可用';
    });
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action!;
            if (Object.prototype.hasOwnProperty.call(options.labels, action)) play(action as A);
        }, listenerOptions);
    });
    function bindSegments(attribute: 'facing' | 'backdrop', onChange: (value: string) => void) {
        const buttons = document.querySelectorAll<HTMLButtonElement>(`[data-${attribute}]`);
        buttons.forEach(button => button.addEventListener('click', () => {
            onChange(button.dataset[attribute]!);
            buttons.forEach(sibling => sibling.setAttribute('aria-pressed', String(sibling === button)));
        }, listenerOptions));
    }
    bindSegments('facing', value => scene.setFacing(value === '-1' ? -1 : 1));
    bindSegments('backdrop', value => {
        const cave = value === 'cave';
        scene.setBackdrop(cave ? 'cave' : 'plain');
        document.querySelector<HTMLElement>('.habitat')!.textContent = cave ? '苔石洞窟' : '素色舞台';
        document.querySelector<HTMLElement>('.habitat-en')!.textContent = cave ? 'MOSS CAVE' : 'PORTRAIT STAGE';
    });
    document.querySelector<HTMLInputElement>('#small-size')!.addEventListener('change', event => {
        scene.setSmall((event.target as HTMLInputElement).checked);
    }, listenerOptions);
    pauseButton.addEventListener('click', () => { scene.togglePaused(); updateStatus(); }, listenerOptions);
    document.addEventListener('keydown', event => {
        if (!ready || event.altKey || event.metaKey || event.ctrlKey || event.repeat) return;
        if ((event.target as HTMLElement).closest('input, textarea, [contenteditable=true]')) return;
        const number = Number(event.key);
        if (number >= 1 && number <= options.basicActions.length) play(options.basicActions[number - 1]);
        if (event.code === 'Space' && !(event.target as HTMLElement).closest('button')) {
            event.preventDefault(); scene.togglePaused(); updateStatus();
        }
    }, listenerOptions);
    function cleanup() {
        alive = false; ready = false;
        subscription.abort();
        scene.dispose();
    }
    window.addEventListener('pagehide', cleanup, {once: true, ...listenerOptions});
    return cleanup;
}
