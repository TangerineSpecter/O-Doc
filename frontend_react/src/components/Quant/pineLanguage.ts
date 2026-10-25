import { StreamLanguage } from '@codemirror/language';

const keywords = new Set(
    'if else for to by while switch break continue return import export as method type enum var varip const simple series and or not'.split(' '),
);
const types = new Set('int float bool string color array matrix map line label box table chart point polyline'.split(' '));
const builtins = new Set(
    'open high low close volume time time_close bar_index last_bar_index hl2 hlc3 ohlc4 hlcc4 syminfo timeframe barstate ta math str request input strategy indicator library plot plotshape plotchar plotarrow hline fill bgcolor barcolor alert alertcondition study security rsi sma ema stdev crossover crossunder highest lowest nz na abs max min'.split(' '),
);

// Pine has no bundled CodeMirror grammar. Tokenize locally for display only;
// this deliberately does not claim to compile or validate a script.
export const pineLanguage = StreamLanguage.define({
    name: 'pine',
    token(stream) {
        if (stream.eatSpace()) return null;
        if (stream.match('//')) {
            stream.skipToEnd();
            return 'comment';
        }
        const quote = stream.peek();
        if (quote === '"' || quote === "'") {
            stream.next();
            while (!stream.eol()) {
                const character = stream.next();
                if (character === '\\') stream.next();
                else if (character === quote) break;
            }
            return 'string';
        }
        if (stream.match(/#[\da-fA-F]{6}(?:[\da-fA-F]{2})?\b/)) return 'number';
        if (stream.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)) return 'number';
        const identifier = stream.match(/[a-zA-Z_][\w]*/);
        if (Array.isArray(identifier)) {
            const word = identifier[0];
            if (keywords.has(word)) return 'keyword';
            if (word === 'true' || word === 'false') return 'bool';
            if (types.has(word)) return 'typeName';
            if (stream.match(/^\s*\(/, false)) return 'variableName.function';
            if (builtins.has(word)) return 'variableName.standard';
            return 'variableName';
        }
        if (stream.match(/[:=+\-*/%<>!?&|]+/)) return 'operator';
        if (stream.match(/[()[\]{}]/)) return 'bracket';
        stream.next();
        return null;
    },
    languageData: { commentTokens: { line: '//' } },
});
