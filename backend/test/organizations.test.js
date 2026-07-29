import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasOrganizationRole,
  organizationSlug,
  validateOrganizationInput,
  validateOrganizationPolicy,
} from '../lib/organizations.js';

test('organization roles enforce the expected viewer-to-owner hierarchy', () => {
  assert.equal(hasOrganizationRole('owner', 'admin'), true);
  assert.equal(hasOrganizationRole('admin', 'builder'), true);
  assert.equal(hasOrganizationRole('builder', 'viewer'), true);
  assert.equal(hasOrganizationRole('viewer', 'builder'), false);
  assert.equal(hasOrganizationRole('unknown', 'viewer'), false);
});

test('organization slugs are stable, bounded, and URL safe', () => {
  assert.equal(organizationSlug('  Démo Operations  '), 'demo-operations');
  assert.equal(organizationSlug('Acme!', 'A1-B2'), 'acme-a1b2');
  assert.match(organizationSlug('---', '9f'), /^workspace-9f$/);
  assert(organizationSlug('x'.repeat(200), 'abc').length <= 68);
});

test('organization metadata validation normalizes safe values', () => {
  const valid = validateOrganizationInput({
    name:'  Acme Operations ',
    description:' Team automation control plane ',
  });
  assert.deepEqual(valid.errors, []);
  assert.deepEqual(valid.value, {
    name:'Acme Operations',
    description:'Team automation control plane',
  });
  assert(validateOrganizationInput({ name:'x', description:'' }).errors.length > 0);
});

test('governance policies validate execution, approvals, and retention', () => {
  const valid = validateOrganizationPolicy({
    execution_enabled:true,
    allowed_models:['claude-sonnet-4-6'],
    max_model_calls_per_run:20,
    max_estimated_cost_usd:'2.50',
    approval_mode:'sensitive',
    minimum_approvers:2,
    audit_retention_days:365,
    immutable_audit:true,
    compliance_export_enabled:true,
  });
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.value.max_estimated_cost_usd, 2.5);
  assert.equal(valid.value.minimum_approvers, 2);

  const invalid = validateOrganizationPolicy({
    execution_enabled:true,
    allowed_models:['unknown-model'],
    max_model_calls_per_run:0,
    max_estimated_cost_usd:-1,
    approval_mode:'sometimes',
    minimum_approvers:0,
    audit_retention_days:7,
  });
  assert.equal(invalid.errors.length, 6);
});
