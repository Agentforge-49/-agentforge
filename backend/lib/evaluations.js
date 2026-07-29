function normalized(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stableJson(value[key])]),
    );
  }
  return value;
}

export function scoreEvaluationOutput(actual, expected, assertionType) {
  const actualText = normalized(actual);
  const expectedText = normalized(expected);
  let passed = false;
  if (assertionType === 'exact') passed = actualText === expectedText;
  else if (assertionType === 'contains') {
    passed = actualText.toLowerCase().includes(expectedText.toLowerCase());
  } else if (assertionType === 'not_contains') {
    passed = !actualText.toLowerCase().includes(expectedText.toLowerCase());
  } else if (assertionType === 'json_equals') {
    try {
      passed = JSON.stringify(stableJson(JSON.parse(actualText)))
        === JSON.stringify(stableJson(JSON.parse(expectedText)));
    } catch {
      passed = false;
    }
  } else {
    throw new Error(`Unsupported evaluation assertion: ${assertionType}`);
  }
  return { passed, score:passed ? 100 : 0 };
}

export function weightedEvaluationScore(results, cases) {
  const weightByCase = new Map(cases.map(item => [item.id, Number(item.weight) || 1]));
  let weighted = 0;
  let totalWeight = 0;
  for (const result of results) {
    const weight = weightByCase.get(result.case_id) || 1;
    weighted += Number(result.score) * weight;
    totalWeight += weight;
  }
  return totalWeight ? Number((weighted / totalWeight).toFixed(2)) : 0;
}

export function validateEvaluationCases(cases) {
  const errors = [];
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > 25) {
    return { errors:['An evaluation suite needs between 1 and 25 cases'] };
  }
  const allowed = new Set(['exact', 'contains', 'not_contains', 'json_equals']);
  const value = cases.map((item, index) => {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const inputText = typeof item?.input_text === 'string' ? item.input_text.trim() : '';
    const expectedOutput = typeof item?.expected_output === 'string'
      ? item.expected_output.trim() : '';
    const assertionType = item?.assertion_type || 'contains';
    const weight = Number(item?.weight ?? 1);
    if (!name || name.length > 100) errors.push(`Case ${index + 1} has an invalid name`);
    if (!inputText || inputText.length > 50000) errors.push(`Case ${index + 1} has invalid input`);
    if (!expectedOutput || expectedOutput.length > 50000) {
      errors.push(`Case ${index + 1} has invalid expected output`);
    }
    if (!allowed.has(assertionType)) errors.push(`Case ${index + 1} has an invalid assertion`);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      errors.push(`Case ${index + 1} has an invalid weight`);
    }
    return {
      name,
      input_text:inputText,
      expected_output:expectedOutput,
      assertion_type:assertionType,
      weight,
    };
  });
  return { errors, value:errors.length ? undefined : value };
}
