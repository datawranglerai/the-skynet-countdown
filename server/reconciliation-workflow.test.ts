import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../n8n/Skynet Countdown - Reconcile Events.json', import.meta.url);

type WorkflowNode = {
  name: string;
  type: string;
  typeVersion: number;
  parameters: Record<string, unknown>;
  credentials?: unknown;
};

type Workflow = {
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>>;
};

async function loadWorkflow(): Promise<Workflow> {
  return JSON.parse(await readFile(workflowUrl, 'utf8')) as Workflow;
}

function node(workflow: Workflow, name: string): WorkflowNode {
  const result = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(result, `Missing workflow node: ${name}`);
  return result;
}

const evidenceLeft = 'OpenAI disclosed that the same September sandbox evaluation reached a private DNS endpoint.';
const evidenceRight = 'A second report says the September sandbox evaluation reached the identical private DNS endpoint.';

const pair = {
  left: {
    event_id: '41', public_id: 'SKYNET-2026-0041', slug: 'left-event-41', fingerprint: 'left-fingerprint',
    incident_date: '2026-09-25', evidence: evidenceLeft,
  },
  right: {
    event_id: '57', public_id: 'SKYNET-2026-0057', slug: 'right-event-57', fingerprint: 'right-fingerprint',
    incident_date: '2026-09-25', evidence: evidenceRight,
  },
};

const classification = {
  relation: 'same_event', confidence: 0.995,
  same_actor: true, same_action: true, same_occurrence: true, material_followup: false,
  evidence_left: 'same September sandbox evaluation reached a private DNS endpoint',
  evidence_right: 'September sandbox evaluation reached the identical private DNS endpoint',
  rationale: 'Both records describe the same actor, test, date, and DNS endpoint.',
};

async function executeValidator(output: unknown, candidatePairs: unknown[] = [pair], runIndex = 0) {
  return executeValidatorItem({ output }, candidatePairs, runIndex);
}

async function executeValidatorItem(input: unknown, candidatePairs: unknown[] = [pair], runIndex = 0) {
  const workflow = await loadWorkflow();
  const code = node(workflow, 'Validate and Rebind Pair').parameters.jsCode;
  if (typeof code !== 'string') throw new Error('Validator code is missing');

  const select = (name: string) => {
    if (name === 'Loop Over Candidate Pairs') {
      return {
        all: (outputIndex: number, requestedRunIndex: number) => {
          assert.equal(outputIndex, 1, 'Validator must read the loop output');
          const candidatePair = candidatePairs[requestedRunIndex];
          return candidatePair === undefined ? [] : [{ json: { pair: candidatePair } }];
        },
      };
    }
    if (name === 'Set: Reconciliation Configuration') {
      return { first: () => ({ json: { model: 'gpt-5.4', prompt_version: 'event-identity-1', auto_merge: true } }) };
    }
    throw new Error(`Unexpected node lookup: ${name}`);
  };

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>;
  const run = new AsyncFunction('$json', '$', '$execution', '$runIndex', code);
  return run(input, select, { id: 'n8n-execution-123' }, runIndex);
}

test('validator accepts the fenced output wrapper observed in n8n 2.13.2', async () => {
  const observed = {
    relation: 'same_event', confidence: 0.99,
    same_actor: true, same_action: true, same_occurrence: true, material_followup: false,
    evidence_left: 'Former OpenAI safety-report lead David Robinson resigned and publicly argued that the company’s safety culture is broken',
    evidence_right: 'Former OpenAI safety lead David Robinson resigned and said the company’s safety culture is broken.',
    rationale: 'Both records describe the same resignation by David Robinson and the same criticism of OpenAI’s safety culture, indicating a single shared event.',
  };
  const observedPair = {
    left: { ...pair.left, evidence: `Title: ${observed.evidence_left}` },
    right: { ...pair.right, evidence: `Title: ${observed.evidence_right}` },
  };
  const text = '```json\n' + JSON.stringify({ output: observed }, null, 2) + '\n```';
  const result = await executeValidatorItem({ text }, [observedPair]) as { json: { classification: unknown; pair: unknown } };
  assert.deepEqual(result.json.classification, observed);
  assert.deepEqual(result.json.pair, observedPair);
});

test('reconciliation workflow is an inactive, bounded sidecar with no AI database tools', async () => {
  const workflow = await loadWorkflow();
  assert.equal(workflow.name, 'Skynet Countdown - Reconcile Events');
  assert.equal(workflow.active, false);
  assert.ok(workflow.nodes.some((candidate) => candidate.type === 'n8n-nodes-base.manualTrigger'));
  assert.ok(workflow.nodes.some((candidate) => candidate.type === 'n8n-nodes-base.scheduleTrigger'));

  const config = node(workflow, 'Set: Reconciliation Configuration');
  const assignments = (config.parameters.assignments as { assignments: Array<{ name: string; value: unknown }> }).assignments;
  assert.deepEqual(Object.fromEntries(assignments.map(({ name, value }) => [name, value])), {
    candidate_limit: 20,
    date_window_days: 45,
    auto_merge: true,
    model: 'gpt-5.4',
    prompt_version: 'event-identity-1',
  });

  const loop = node(workflow, 'Loop Over Candidate Pairs');
  assert.equal(loop.parameters.batchSize, 1);
  assert.equal(workflow.connections['Loop Over Candidate Pairs'].main[1][0].node, 'Classify Event Identity');
  assert.equal(workflow.connections['Neon: Record Decision'].main[0][0].node, 'Loop Over Candidate Pairs');

  assert.equal(workflow.nodes.some((candidate) => candidate.type.includes('agent')), false);
  assert.equal(Object.values(workflow.connections).some((connection) => 'ai_tool' in connection), false);
  assert.deepEqual(node(workflow, 'OpenAI Identity Model').parameters.builtInTools, {});
  assert.equal(node(workflow, 'Validate and Rebind Pair').parameters.mode, 'runOnceForEachItem');
  const prompt = String(node(workflow, 'Classify Event Identity').parameters.text);
  assert.equal(node(workflow, 'Classify Event Identity').parameters.hasOutputParser, false);
  assert.equal(workflow.nodes.some((candidate) => candidate.type.endsWith('.outputParserStructured')), false);
  assert.equal(Object.values(workflow.connections).some((connection) => 'ai_outputParser' in connection), false);
  for (const field of Object.keys(classification)) assert.ok(prompt.includes(`- ${field}:`), `Prompt must describe ${field}`);
  assert.doesNotMatch(prompt, /event_id|public_id|fingerprint/i, 'The model must not receive database identity fields');
  assert.ok(workflow.nodes.every((candidate) => candidate.credentials === undefined), 'Export must not contain credential references');
});

test('reconciliation SQL uses bounded functions and query replacements', async () => {
  const workflow = await loadWorkflow();
  const fetch = node(workflow, 'Neon: Fetch Candidate Pairs');
  const record = node(workflow, 'Neon: Record Decision');
  assert.match(String(fetch.parameters.query), /skynet_dedup_candidates\(\$1::integer, \$2::integer\)/);
  assert.match(String((fetch.parameters.options as { queryReplacement: string }).queryReplacement), /candidate_limit.*date_window_days/);
  assert.match(String(record.parameters.query), /skynet_record_duplicate_decision/);
  assert.match(String(record.parameters.query), /\$1::jsonb[\s\S]*\$2::jsonb[\s\S]*\$3::jsonb/);
  assert.match(String((record.parameters.options as { queryReplacement: string }).queryReplacement), /JSON\.stringify\(\$json\.pair\)/);
});

test('validator restores database identity and emits the audited context', async () => {
  const result = await executeValidator(classification);
  const item = result as { json: Record<string, unknown> };
  assert.deepEqual(item.json.pair, pair);
  assert.deepEqual(item.json.classification, classification);
  assert.deepEqual(item.json.context, {
    execution_id: 'n8n-execution-123', model: 'gpt-5.4', prompt_version: 'event-identity-1', auto_merge: true,
  });
});

test('validator accepts plain and wrapped JSON without changing decision values', async () => {
  const uncertain = { ...classification, relation: 'uncertain', confidence: 0, same_actor: false };
  for (const input of [
    uncertain,
    { output: uncertain },
    { text: JSON.stringify(uncertain) },
    { text: JSON.stringify({ output: uncertain }) },
    { text: ['  ', '```json', JSON.stringify(uncertain), '```  '].join('\n') },
  ]) {
    const result = await executeValidatorItem(input) as { json: { classification: unknown } };
    assert.deepEqual(result.json.classification, uncertain);
  }
});

test('format handling does not salvage incomplete JSON, mixed prose, arrays or extra fields', async () => {
  const json = JSON.stringify(classification);
  for (const text of [
    json.slice(0, -1),
    `Here is the answer: ${json}`,
    ['```json', json, '```', '```json', json, '```'].join('\n'),
  ]) {
    await assert.rejects(executeValidatorItem({ text }), /not a complete JSON object/);
  }
  await assert.rejects(executeValidatorItem({ text: JSON.stringify([classification, classification]) }), /not an object/);
  await assert.rejects(executeValidatorItem({ text: JSON.stringify({ output: classification, event_id: '999' }) }), /unexpected: output, event_id/);
  await assert.rejects(executeValidatorItem({ output: { text: { output: { text: { output: classification } } } } }), /too many response wrappers/);
});

test('validator reports invalid fields and never supplies or coerces a decision', async () => {
  const { confidence: omitted, ...missingConfidence } = classification;
  assert.equal(omitted, 0.995);
  await assert.rejects(executeValidator(missingConfidence), /missing: confidence/);
  await assert.rejects(executeValidator({ ...classification, confidence: 99 }), /confidence is outside/);
  await assert.rejects(executeValidator({ ...classification, confidence: '0.99' }), /confidence is outside/);
  await assert.rejects(executeValidator({ ...classification, same_actor: 'true' }), /same_actor must be boolean/);
  await assert.rejects(executeValidator({ ...classification, relation: 'duplicate' }), /relation is invalid/);
  await assert.rejects(executeValidator({ ...classification, evidence_left: 'too short' }), /not a verbatim excerpt/);
  await assert.rejects(executeValidator({ ...classification, rationale: 'x'.repeat(1001) }), /rationale length/);
});

test('validator rebinds the pair from the current loop iteration', async () => {
  const nextPair = {
    left: { ...pair.left, event_id: '62', public_id: 'SKYNET-2026-0062', slug: 'left-event-62', fingerprint: 'left-fingerprint-62' },
    right: { ...pair.right, event_id: '63', public_id: 'SKYNET-2026-0063', slug: 'right-event-63', fingerprint: 'right-fingerprint-63' },
  };
  const first = await executeValidator(classification, [pair, nextPair], 0) as { json: { pair: unknown } };
  const second = await executeValidator(classification, [pair, nextPair], 1) as { json: { pair: unknown } };
  assert.deepEqual(first.json.pair, pair);
  assert.deepEqual(second.json.pair, nextPair);
  assert.notDeepEqual(second.json.pair, first.json.pair);
});

test('validator blocks invented evidence, extra fields, and malformed pairs', async () => {
  await assert.rejects(executeValidator({ ...classification, evidence_left: 'This quotation was invented by the model.' }), /verbatim excerpt/);
  await assert.rejects(executeValidator({ ...classification, event_id: '999' }), /fields do not match/);
  await assert.rejects(executeValidator(classification, [{ left: pair.left }]), /candidate pair is missing/);
});
