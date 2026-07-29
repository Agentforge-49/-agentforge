import assert from 'node:assert/strict';
import test from 'node:test';

import {
  scoreEvaluationOutput,
  validateEvaluationCases,
  weightedEvaluationScore,
} from '../lib/evaluations.js';

test('evaluation assertions score exact, contains, exclusion, and JSON output', () => {
  assert.deepEqual(scoreEvaluationOutput(' Hello   world ', 'Hello world', 'exact'), {
    passed:true,
    score:100,
  });
  assert.equal(scoreEvaluationOutput('Urgent refund', 'REFUND', 'contains').passed, true);
  assert.equal(scoreEvaluationOutput('safe response', 'password', 'not_contains').passed, true);
  assert.equal(scoreEvaluationOutput('{"b":2,"a":1}', '{"a":1,"b":2}', 'json_equals').passed, true);
  assert.equal(scoreEvaluationOutput('different', 'expected', 'exact').score, 0);
});

test('weighted evaluation scores respect case importance', () => {
  const cases = [{ id:'one', weight:1 }, { id:'two', weight:3 }];
  const score = weightedEvaluationScore([
    { case_id:'one', score:100 },
    { case_id:'two', score:0 },
  ], cases);
  assert.equal(score, 25);
});

test('evaluation dataset validation normalizes safe cases', () => {
  const result = validateEvaluationCases([{
    name:'Greeting',
    input_text:' Say hello ',
    expected_output:'hello',
    assertion_type:'contains',
    weight:2,
  }]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value[0].input_text, 'Say hello');
  assert.match(
    validateEvaluationCases([]).errors.join(' '),
    /between 1 and 25/,
  );
});
