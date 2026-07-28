import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptSecret,
  encryptSecret,
  maskCredential,
  testCredentialConnection,
  validateCredentialInput,
} from '../lib/credential-vault.js';

process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-only-agentforge-vault-key-with-entropy';
process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION = 'test-v1';

test('credential encryption round trips with authenticated context', () => {
  const encrypted = encryptSecret('agentforge-secret-value', 'credential:user:id:1');
  assert.notEqual(encrypted.ciphertext, 'agentforge-secret-value');
  assert.equal(
    decryptSecret(encrypted, 'credential:user:id:1'),
    'agentforge-secret-value',
  );
  assert.throws(
    () => decryptSecret(encrypted, 'credential:user:other:1'),
    /could not be decrypted/,
  );
});

test('credential metadata is redacted and validated', () => {
  const { errors, value } = validateCredentialInput({
    name: 'Production key',
    provider: 'generic',
    secret: 'secret-value-1234',
    metadata: { environment: 'production' },
  });
  assert.deepEqual(errors, []);
  assert.equal(value.name, 'Production key');
  assert.equal(maskCredential('1234'), '••••1234');
  assert.ok(!JSON.stringify({ ...value, secret: undefined }).includes('secret-value'));
});

test('generic connection test verifies vault integrity without network access', async () => {
  assert.deepEqual(
    await testCredentialConnection('generic', 'secret-value'),
    { passed: true, message: 'Encryption and decryption integrity verified' },
  );
});

