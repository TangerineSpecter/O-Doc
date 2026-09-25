type EscapeDismissal = () => boolean | void;

interface EscapeDismissalEntry {
    id: number;
    dismiss: EscapeDismissal;
}

const dismissals: EscapeDismissalEntry[] = [];
let nextId = 0;

export function hasActiveEscapeDismissal(): boolean {
    return dismissals.length > 0;
}

function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;

    const topmost = dismissals[dismissals.length - 1];
    if (!topmost) return;

    // A dismissal may decline when an inner, non-modal layer owns Escape.
    if (topmost.dismiss() === false) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}

export function registerEscapeDismissal(dismiss: EscapeDismissal): () => void {
    const entry = {id: ++nextId, dismiss};
    dismissals.push(entry);

    if (dismissals.length === 1 && typeof window !== 'undefined') {
        // Run after target/document handlers so an open input menu can consume Esc first.
        window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
        const index = dismissals.findIndex(candidate => candidate.id === entry.id);
        if (index === -1) return;

        dismissals.splice(index, 1);
        if (dismissals.length === 0 && typeof window !== 'undefined') {
            window.removeEventListener('keydown', handleKeyDown);
        }
    };
}
