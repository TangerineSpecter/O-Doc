import {HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import {tags} from '@lezer/highlight';

// Use one readable palette across editable source and generated previews.
// The default CodeMirror palette leaves several Pine built-ins/functions uncolored.
export const quantCodeHighlight = syntaxHighlighting(HighlightStyle.define([
    {tag: tags.keyword, color: '#7c3aed'},
    {tag: tags.comment, color: '#527553'},
    {tag: [tags.string, tags.special(tags.string)], color: '#a33d26'},
    {tag: [tags.number, tags.bool], color: '#98580d'},
    {tag: [tags.typeName, tags.className], color: '#0f766e'},
    {tag: tags.function(tags.variableName), color: '#1d4ed8'},
    {tag: tags.standard(tags.variableName), color: '#036980'},
    {tag: [tags.operator, tags.punctuation], color: '#475569'},
    {tag: tags.meta, color: '#7c3aed'},
]));
