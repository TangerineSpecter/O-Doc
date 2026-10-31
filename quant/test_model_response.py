"""Provider wrappers and transcription mistakes must not discard valid research."""
import copy
import json
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.parameters.inventory import build
from quant.parameters.bindings import bind
from quant.test_parameter_bindings import parameter, source
from quant.workflows.model_response import decode_response, source_parameters, source_quotes, validation_detail


class ModelResponseTests(SimpleTestCase):
    def test_reasoning_and_fences_are_transport_not_algorithm_text(self):
        value = {'code': 'def compute(inputs, parameters=None):\n    return ["<think>literal</think>"]'}
        raw = '<think>reasoning\nwith {braces}</think>\n```json\n' + json.dumps(value) + '\n```'
        self.assertEqual(decode_response(raw), value)
        self.assertEqual(decode_response(json.dumps(value)), value)

    def test_truncated_or_malformed_code_is_not_silently_rewritten(self):
        for raw in ('<think>unfinished', '{"code":"bad\\q"}', '[1,2]'):
            with self.assertRaises(ValidationError):
                decode_response(raw)
        try:
            decode_response('{\n"code": broken}')
        except ValidationError as exc:
            self.assertIn('第 2 行', validation_detail(exc))

    def test_unique_source_default_replaces_model_transcription(self):
        inventory = build({'language': 'python', 'code': 'N=20\n'})
        value = {'parameters': [parameter('N', '999')], 'risks': 'example'}
        before = copy.deepcopy(value)
        corrected = source_parameters(value, {'normalize': {'parameter_inventory': inventory}})
        self.assertEqual(corrected['parameters'][0]['default_value'], '20')
        self.assertEqual(value, before)
        result = bind(corrected['parameters'], corrected['parameters'], inventory)
        self.assertEqual(result[0]['source_binding']['literal']['value'], 20)

    def test_ambiguous_source_name_is_not_guessed(self):
        inventory = build(source())
        value = {'parameters': [parameter('N', '999')]}
        self.assertEqual(source_parameters(value, {'normalize': {'parameter_inventory': inventory}}), value)

    def test_field_path_is_preserved_for_correction_and_support(self):
        detail = validation_detail(ValidationError({'factors': [{}, {'expression': ['invalid JSON escape']}]}))
        self.assertIn('factors[1].expression', detail)
        self.assertIn('invalid JSON escape', detail)

    def test_generated_numeric_output_cannot_be_dictionary_rows(self):
        from quant.algorithms.python_output import validate_generated_outputs
        code = 'def compute(inputs, parameters=None):\n    rows=[]\n    for x in inputs["close"]:\n        rows.append({"score":x,"price":x})\n    return rows'
        value = {'factors': [{'output_type':'numeric_series', 'expression':{'op':'python','code':code}}]}
        with self.assertRaisesRegex(ValidationError, '逐根字典'):
            validate_generated_outputs(value)
        value['factors'][0]['expression']['code'] = code.replace('return rows', 'return [row["score"] for row in rows]')
        validate_generated_outputs(value)

    def test_crlf_quotes_bind_exact_source_and_keep_grounded_evidence(self):
        value = {'factors':[{'evidence':[{'field':'code','quote':'x = close\ny = x * 2'},
            {'field':'code','quote':'a paraphrased comment'}]}]}
        source = {'code':'// heading\r\nx = close\r\ny = x * 2\r\n'}
        before = copy.deepcopy(value)
        fixed = source_quotes(value, source)
        self.assertEqual(fixed['factors'][0]['evidence'], [{'field':'code','quote':'x = close\r\ny = x * 2'}])
        self.assertEqual(value, before)
        from quant.factors.contracts import validate_evidence
        validate_evidence(fixed['factors'], source)
        ungrounded = {'factors':[{'evidence':[{'field':'code','quote':'x = volume'}]}]}
        with self.assertRaises(ValidationError):
            validate_evidence(source_quotes(ungrounded, source)['factors'], source)
