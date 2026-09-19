import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOemIntakeHashes, stableStringify } from './oem-intake'

test('stableStringify sorts object keys but preserves array order', () => {
    assert.equal(stableStringify({ b: 2, a: [3, 1] }), '{"a":[3,1],"b":2}')
})

test('OEM intake digests are deterministic and do not expose raw values', () => {
    const first = buildOemIntakeHashes({ email: 'ignored@example.com', selected: ['x'] }, 'Test@Example.com', '127.0.0.1', 'test-secret')
    const second = buildOemIntakeHashes({ selected: ['x'], email: 'ignored@example.com' }, 'test@example.com', '127.0.0.1', 'test-secret')
    assert.deepEqual(first, second)
    assert.notEqual(first.emailHash, 'test@example.com')
    assert.match(first.emailHash, /^[0-9a-f]{64}$/)
})
