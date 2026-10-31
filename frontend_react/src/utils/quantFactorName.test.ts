import assert from 'node:assert/strict';
import test from 'node:test';
import {factorName} from './quantFactorName';

test('generated bilingual names keep the original algorithm identifier intact', () => {
    assert.deepEqual(factorName('异常阻尼释放（IAKF_Damping_Released）'), {title:'异常阻尼释放', identifier:'IAKF_Damping_Released'});
    assert.deepEqual(factorName('RSI 强弱指标 (RSI_14)'), {title:'RSI 强弱指标', identifier:'RSI_14'});
});
test('curated Chinese names preserve legacy identifiers without altering ordinary names', () => {
    assert.deepEqual(factorName('异常阻尼释放','IAKF_Damping_Released'), {title:'异常阻尼释放', identifier:'IAKF_Damping_Released'});
    assert.deepEqual(factorName('相对强弱（14日）'), {title:'相对强弱（14日）', identifier:''});
    assert.deepEqual(factorName('原始英文','中文名称（Original_Name）'), {title:'原始英文', identifier:'Original_Name'});
});
