import type {StreamChar} from './types';

/** A FIFO of Unicode characters that does not shift the backing array per character. */
export class SmoothStreamQueue {
    private items: StreamChar[] = [];
    private head = 0;

    get length() {
        return this.items.length - this.head;
    }

    append(conversationKey: string, content: string) {
        for (const value of content) this.items.push({conversationKey, value});
    }

    take(): {conversationKey: string; text: string} {
        const length = this.length;
        if (!length) return {conversationKey: '', text: ''};
        const count = length > 180 ? 16 : length > 90 ? 10 : length > 36 ? 6 : length > 8 ? 4 : 2;
        const conversationKey = this.items[this.head].conversationKey;
        const chars: string[] = [];
        while (chars.length < count && this.head < this.items.length
            && this.items[this.head].conversationKey === conversationKey) {
            chars.push(this.items[this.head++].value);
        }
        if (this.head === this.items.length) {
            this.clear();
        } else if (this.head >= 4096 && this.head * 2 >= this.items.length) {
            this.items = this.items.slice(this.head);
            this.head = 0;
        }
        return {conversationKey, text: chars.join('')};
    }

    remainingText() {
        return this.items.slice(this.head).map(char => char.value).join('');
    }

    clear() {
        this.items = [];
        this.head = 0;
    }
}
