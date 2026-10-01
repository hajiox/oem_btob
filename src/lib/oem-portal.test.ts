import assert from 'node:assert/strict'
import test from 'node:test'
import { createPortalToken, portalExpiry, portalTokenHash } from './oem-portal-token'
import { portalOrderIsReorderable } from './oem-portal'

test('portal bearer is 32 random bytes and only its digest is used', () => {
  const pair = createPortalToken()
  assert.match(pair.token, /^[A-Za-z0-9_-]{43}$/)
  assert.match(pair.hash, /^[0-9a-f]{64}$/)
  assert.equal(portalTokenHash(pair.token), pair.hash)
  assert.equal(portalTokenHash('tampered'), null)
})

test('portal expiry is bounded to the post-order window', () => {
  const expiry = Date.parse(portalExpiry(90))
  assert.ok(expiry > Date.now())
  assert.ok(expiry <= Date.now() + 90 * 24 * 60 * 60 * 1000 + 1000)
})

test('only shipped or settled orders can show reorder CTA', () => {
  const base = { id: 'o', orderNumber: 'n', specification: '', selectedOptions: [], status: 'paid', amountKind: '', agreedAmount: 1, canReorder: false, receivedAmount: 1, outstandingAmount: 0, paymentState: '', productionDueDate: null, shipmentDueDate: null, plannedQuantity: null, quantityUnit: '', completedQuantity: null, completedOn: null, shippedOn: null, carrier: '', trackingNumber: '', settlementState: 'none', documents: [] }
  assert.equal(portalOrderIsReorderable(base), false)
  assert.equal(portalOrderIsReorderable({ ...base, status: 'shipped' }), true)
  assert.equal(portalOrderIsReorderable({ ...base, settlementState: 'settled' }), true)
  assert.equal(portalOrderIsReorderable({ ...base, settlementState: 'confirmed' }), false)
})
