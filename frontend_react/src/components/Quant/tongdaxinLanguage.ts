import {StreamLanguage} from '@codemirror/language';
const builtins = new Set('OPEN HIGH LOW CLOSE VOL V O H L C REF REFX MA SMA EMA SUM STDP STD HHV LLV COUNT BARSCOUNT ISLASTBAR DRAWNULL IF ABS LN MIN MAX'.split(' '));
export const tongdaxinLanguage = StreamLanguage.define({
    name: 'tongdaxin', startState: () => ({comment: false}),
    token(stream, state) {
        if (state.comment) {while (!stream.eol()) if (stream.next() === '}') {state.comment = false; break;} return 'comment';}
        if (stream.eatSpace()) return null;
        if (stream.eat('{')) {state.comment = true; return 'comment';}
        if (stream.match('//')) {stream.skipToEnd(); return 'comment';}
        if (stream.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)) return 'number';
        if (stream.match(/"[^"\n]*"|'[^'\n]*'/)) return 'string';
        const found = stream.match(/[A-Za-z_][\w]*/);
        if (Array.isArray(found)) {
            const word = found[0].toUpperCase();
            return ['AND', 'OR', 'NOT'].includes(word) ? 'keyword' : builtins.has(word) ? 'variableName.standard' : 'variableName';
        }
        if (stream.match(/[:=+\-*/<>]+/)) return 'operator';
        stream.next(); return null;
    }, languageData: {commentTokens: {block: {open: '{', close: '}'}}},
});
