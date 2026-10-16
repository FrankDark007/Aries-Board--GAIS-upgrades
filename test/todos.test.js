import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'
const TASK_ID = 'task-0123456789abcd'
const ADDED_ID = 'task-fedcba98765432'

function settings(db, overrides = {}) {
  return {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com,frankd@flooddoctorva.com,dom@flood.doctor,mark@flood.doctor,steve@restorationdoctors.com,katherine@restorationdoctors.com,shyon@restorationdoctors.com',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
    ...overrides,
  }
}

function ui(path, init = {}, email = 'mark@flood.doctor') {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: {
      'Cf-Access-Authenticated-User-Email': email,
      ...init.headers,
    },
  })
}

function sync(path, init = {}) {
  return new Request(`https://${SYNC_HOST}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-publisher-token',
      'content-type': 'application/json',
      ...init.headers,
    },
  })
}

function catalogueItem(overrides = {}) {
  return {
    id: TASK_ID,
    text: 'Confirm tomorrow\'s crew',
    details: 'Call before 4 PM.',
    client: 'Example Client',
    actionType: 'call',
    notificationDate: '2026-08-24',
    date: '2026-08-24',
    due: '2026-08-25',
    sourceUrl: 'https://mail.google.com/example',
    sourceMessageId: 'message-1',
    sourceAccount: 'shared@example.com',
    sourceRevision: 'rev-1',
    upstreamIds: ['gmail:message-1'],
    assignee: 'Dom',
    who: 'Shoghi',
    section: 'Today',
    seedDone: false,
    ...overrides,
  }
}

async function publishCatalogue(db, items = [catalogueItem()]) {
  return worker.fetch(sync('/api/sync/todos/catalogue', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }), settings(db), {})
}

test('publishes the curated v2 catalogue and serves a stale-aware effective list', async () => {
  const db = new FakeD1Database()
  const source = catalogueItem({ localPath: '/private/fd-todos/items.json' })
  const publish = await publishCatalogue(db, [source])

  assert.equal(publish.status, 200)
  const published = await publish.json()
  assert.equal(published.ok, true)
  assert.equal(published.item_count, 1)
  assert.match(published.published_at, /^\d{4}-\d{2}-\d{2}T/)

  const response = await worker.fetch(ui('/api/todos'), settings(db), {})
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.published_at, published.published_at)
  assert.equal(payload.stale.is_stale, false)
  assert.equal(payload.sequence, 0)
  assert.deepEqual(payload.items, [{
    ...catalogueItem(),
    done: false,
    attachments: [],
    snoozedUntil: null,
    archived: false,
  }])
  assert.equal(Object.hasOwn(payload.items[0], 'localPath'), false)
})

test('maps the Access identity server-side for any roster teammate and replays a durable UI action immediately', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const clientTs = '2026-08-24T12:00:00.000Z'
  for (const [email, expectedName, idx] of [
    ['mark@flood.doctor', 'Mark', 1],
    ['steve@restorationdoctors.com', 'Steve', 2],
    ['katherine@restorationdoctors.com', 'Katherine', 3],
    ['shyon@restorationdoctors.com', 'Shayan', 4],
    ['dom@flood.doctor', 'Dom', 5],
  ]) {
    const action = await worker.fetch(ui('/api/todo/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_id: `ui-0123456789abcde${idx}`,
        item_id: TASK_ID,
        operation: 'toggle',
        payload: { done: idx % 2 === 1 },
        client_ts: clientTs,
      }),
    }, email), settings(db), {})

    assert.equal(action.status, 202, email)
    const saved = await action.json()
    assert.equal(saved.accepted, true)
    assert.equal(saved.operation.actor_email, email)
    assert.equal(saved.operation.actor_name, expectedName)
  }
})

test('does not resurrect absent historical items by default, but includes them when ?include_history=1 is requested', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const missingId = 'task-11111111111111'
  const save = await worker.fetch(sync('/api/sync/todos/operations', {
    method: 'POST',
    body: JSON.stringify({ operations: [{
      event_id: 'event-completion-snapshot',
      item_id: missingId,
      operation: 'toggle',
      payload: {
        done: true,
        sourceRevision: 7,
        item: {
          id: missingId,
          text: 'Completed historical task',
          details: 'Retained for checked-off history.',
          client: 'Example Client',
          actionType: 'needs_review',
          notificationDate: null,
          sourceUrl: null,
          due: null,
          assignee: 'mark',
          attachments: [],
          sourceRevision: 7,
          historyVisible: true,
        },
      },
      actor_email: 'aries@flood.doctor',
      actor_name: 'Aries',
      client_ts: '2026-08-24T12:20:00.000Z',
    }] }),
  }), settings(db), {})
  assert.equal(save.status, 200)

  const defaultResponse = await worker.fetch(ui('/api/todos'), settings(db), {})
  const defaultPayload = await defaultResponse.json()
  assert.equal(defaultPayload.items.find((item) => item.id === missingId), undefined, 'absent historical items are not resurrected by default')

  const historyResponse = await worker.fetch(ui('/api/todos?include_history=1'), settings(db), {})
  const historyPayload = await historyResponse.json()
  const historical = historyPayload.items.find((item) => item.id === missingId)
  assert.equal(historical.done, true)
  assert.equal(historical.historyVisible, true)
})

test('strictly rejects malformed action envelopes and unknown actors', async () => {
  const db = new FakeD1Database()
  await publishCatalogue(db)
  const base = {
    event_id: 'ui-0123456789abcdef',
    item_id: TASK_ID,
    operation: 'toggle',
    payload: { done: true },
    client_ts: '2026-08-24T12:00:00.000Z',
  }
  const unknownActor = await worker.fetch(ui('/api/todo/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(base),
  }, 'newhire@flood.doctor'), settings(db, { ALLOWED_EMAILS: 'newhire@flood.doctor' }), {})
  assert.equal(unknownActor.status, 403)
})
