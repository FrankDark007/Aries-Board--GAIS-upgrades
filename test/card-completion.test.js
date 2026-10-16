import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import worker from '../src/index.js'
import { CARD_HTML } from '../src/card-ui.js'

const UI_ORIGIN = 'https://aries.flood.doctor'
const SNAPSHOT_AT = '2020-01-01T10:00:00.000Z'
const BASE_ITEM = Object.freeze({ id: 41, title: 'TEST: review the next step', status: 'open', assignee: 'Frank' })

function fixture(t, items = [BASE_ITEM]) {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  t.after(() => db.close())
  let beforeInsert = null
  const execute = (sql, values, mode) => {
    if (/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+command_queue/i.test(sql) && beforeInsert) {
      const hook = beforeInsert
      beforeInsert = null
      hook()
    }
    const statement = db.prepare(sql)
    if (mode === 'all') return { results: statement.all(...values), success: true }
    if (mode === 'first') return statement.get(...values) ?? null
    const result = statement.run(...values)
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
  }
  const env = {
    ALLOWED_EMAILS: 'frank@example.test',
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor',
    PUBLISHER_TOKEN: 'TEST-only-publisher',
    STALE_AFTER_SECONDS: '300',
    DB: {
      prepare(sql) {
        return {
          values: [],
          bind(...values) { this.values = values; return this },
          async all() { return execute(sql, this.values, 'all') },
          async first() { return execute(sql, this.values, 'first') },
          async run() { return execute(sql, this.values, 'run') },
        }
      },
      async batch(statements) { const out = []; for (const statement of statements) out.push(await statement.run()); return out },
    },
  }
  const call = (path, body, options = {}) => {
    const headers = new Headers({
      'Cf-Access-Authenticated-User-Email': 'frank@example.test',
      Origin: UI_ORIGIN,
      'Content-Type': 'application/json',
      ...options.headers,
    })
    for (const header of options.omitHeaders || []) headers.delete(header)
    return worker.fetch(new Request((options.origin || UI_ORIGIN) + path, {
      method: options.method || (body === undefined ? 'GET' : 'POST'),
      headers,
      ...(body === undefined ? {} : { body: options.raw ? body : JSON.stringify(body) }),
    }), env, {})
  }
  const snapshot = (nextItems, publishedAt = SNAPSHOT_AT) => {
    db.prepare(`INSERT INTO board_snapshot (singleton_id, snapshot_json, published_at)
      VALUES (1, ?, ?) ON CONFLICT(singleton_id) DO UPDATE SET
      snapshot_json = excluded.snapshot_json, published_at = excluded.published_at`)
      .run(JSON.stringify({ items: nextItems }), publishedAt)
  }
  const command = (operation, options = {}) => {
    const result = db.prepare(`INSERT INTO command_queue
      (operation, item_id, note, value, actor_email, state, created_at, acked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      operation, options.itemId ?? 41, options.note ?? null, options.value ?? null,
      options.actor ?? 'mark@flood.doctor', options.state ?? 'queued',
      options.createdAt ?? '2020-01-01T11:00:00.000Z', options.ackedAt ?? null,
    )
    return Number(result.lastInsertRowid)
  }
  const card = async (id = 41) => {
    const response = await call('/api/card?id=' + id)
    assert.equal(response.status, 200)
    return response.json()
  }
  const done = (revision, id = 41, options = {}) => call('/api/card/done', { id, revision }, options)
  const rows = () => db.prepare('SELECT * FROM command_queue ORDER BY id').all()
  snapshot(items)
  return { db, call, card, done, snapshot, command, rows, beforeInsert(hook) { beforeInsert = hook } }
}

test('card page and API are authenticated, host-restricted and not unlocked by publisher bearer tokens', async (t) => {
  const f = fixture(t)
  for (const path of ['/card?id=41', '/api/card?id=41', '/api/card/done']) {
    const body = path.endsWith('/done') ? { id: 41, revision: 'untrusted' } : undefined
    for (const email of ['', 'outsider@evil.test', 'staff@flood.doctor.evil.test']) {
      assert.equal((await f.call(path, body, { headers: { 'Cf-Access-Authenticated-User-Email': email } })).status, 403)
    }
    assert.equal((await f.call(path, body, {
      omitHeaders: ['Cf-Access-Authenticated-User-Email'],
      headers: { Authorization: 'Bearer TEST-only-publisher' },
    })).status, 403)
    for (const origin of ['https://aries-publish.flood.doctor', 'https://attacker.example']) {
      assert.equal((await f.call(path, body, { origin })).status, 404)
    }
  }
  assert.equal((await f.call('/card?id=41', undefined, { headers: { 'Cf-Access-Authenticated-User-Email': 'staff@flood.doctor' } })).status, 200)
  assert.equal((await f.call('/api/card?id=41', undefined, { headers: { 'Cf-Access-Authenticated-User-Email': 'staff@flood.doctor' } })).status, 200)
  assert.equal(f.rows().length, 0)
})

test('scanner GET, prefetch and reload never complete a card', async (t) => {
  const f = fixture(t)
  const initial = f.db.prepare('SELECT * FROM board_snapshot').get()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const page = await f.call('/card?id=41&done=true', undefined, { headers: { Purpose: 'prefetch', 'Sec-Purpose': 'prefetch' } })
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type'), /text\/html/)
    assert.equal(page.headers.get('cache-control'), 'no-store')
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(page.headers.get('x-frame-options'), 'DENY')
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    assert.equal((await f.card()).state, 'open')
    const scanner = await f.call('/api/card/done?id=41')
    assert.equal(scanner.status, 405)
    assert.equal(scanner.headers.get('allow'), 'POST')
  }
  assert.equal(f.rows().length, 0)
  assert.deepEqual(f.db.prepare('SELECT * FROM board_snapshot').get(), initial)
})

test('card reads return only the selected card and an opaque revision without changing the snapshot', async (t) => {
  const f = fixture(t, [BASE_ITEM, { id: 42, title: 'TEST: a different card', status: 'open' }])
  const response = await f.call('/api/card?id=41')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.item.id, 41)
  assert.equal(payload.item.title, BASE_ITEM.title)
  assert.equal(payload.state, 'open')
  assert.equal(typeof payload.revision, 'string')
  assert.ok(payload.revision.length)
  assert.equal(payload.items, undefined)
  assert.equal((await f.card()).revision, payload.revision)
  assert.equal(f.rows().length, 0)
})

test('card reads refuse invalid, missing and unknown identifiers', async (t) => {
  const f = fixture(t)
  for (const id of ['', '0', '-1', '1.5', '1e2', '41junk', '9007199254740992', '../41']) {
    assert.equal((await f.call('/api/card?id=' + encodeURIComponent(id))).status, 400, id)
  }
  assert.equal((await f.call('/api/card')).status, 400)
  assert.equal((await f.call('/api/card?id=999')).status, 404)
  f.db.exec('DELETE FROM board_snapshot')
  assert.equal((await f.call('/api/card?id=41')).status, 404)
  assert.equal(f.rows().length, 0)
})

test('completion requires an explicit same-origin JSON POST', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  for (const origin of ['', 'null', 'https://evil.test', 'https://aries.flood.doctor.evil.test', 'http://aries.flood.doctor']) {
    assert.equal((await f.done(revision, 41, { headers: { Origin: origin } })).status, 403, origin)
  }
  assert.equal((await f.done(revision, 41, { omitHeaders: ['Origin'] })).status, 403)
  for (const contentType of ['', 'text/plain', 'application/x-www-form-urlencoded']) {
    assert.equal((await f.done(revision, 41, { headers: { 'Content-Type': contentType } })).status, 415)
  }
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    assert.equal((await f.done(revision, 41, { method })).status, 405)
  }
  for (const method of ['HEAD', 'OPTIONS']) {
    assert.equal((await f.call('/api/card/done?id=41', undefined, { method })).status, 405)
  }
  assert.equal(f.rows().length, 0)
})

test('completion payload shape is exact and cannot inject actor, timestamp or operation', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  const invalid = [
    null, [], {}, { id: 41 }, { revision }, { id: '41', revision }, { id: 0, revision },
    { id: -1, revision }, { id: 1.5, revision }, { id: Number.MAX_SAFE_INTEGER + 1, revision },
    { id: 41, revision: null }, { id: 41, revision: 12 }, { id: 41, revision: '' },
    { id: 41, revision, actor_email: 'attacker@example.test' },
    { id: 41, revision, created_at: '1900-01-01T00:00:00Z' },
    { id: 41, revision, operation: 'delete' },
  ]
  for (const body of invalid) {
    assert.equal((await f.call('/api/card/done', body)).status, 400, JSON.stringify(body))
  }
  assert.equal((await f.call('/api/card/done', '{invalid', { raw: true })).status, 400)
  assert.equal(f.rows().length, 0)
})

test('successful completion records authenticated actor and server time durably and shows Done immediately', async (t) => {
  const f = fixture(t)
  const { revision } = await f.card()
  const original = f.db.prepare('SELECT * FROM board_snapshot').get()
  const before = Date.now()
  const response = await f.done(revision, 41, { headers: { 'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor', 'Content-Type': 'application/json; charset=UTF-8' } })
  assert.equal(response.status, 202)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.saved, true)
  assert.equal(payload.existing, false)
  assert.equal(payload.state, 'done')
  const [row] = f.rows()
  assert.equal(f.rows().length, 1)
  assert.equal(row.operation, 'done')
  assert.equal(row.item_id, 41)
  assert.equal(row.actor_email, 'dom@flood.doctor')
  assert.equal(row.state, 'queued')
  assert.equal(row.note, null)
  assert.equal(row.value, null)
  assert.ok(Date.parse(row.created_at) >= before)
  assert.ok(Date.parse(row.created_at) <= Date.now())
  assert.deepEqual(payload.command, {
    id: row.id, operation: 'done', item_id: 41,
    actor_email: row.actor_email, created_at: row.created_at,
  })
  assert.deepEqual(f.db.prepare('SELECT * FROM board_snapshot').get(), original)
  assert.equal((await f.card()).state, 'done')
  const board = await (await f.call('/api/board')).json()
  assert.equal(board.items.find(item => item.id === 41).status, 'done')
})
