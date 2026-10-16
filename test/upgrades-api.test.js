import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'
import { SqliteD1 } from './sqlite-d1.js'

const envFor = db => ({DB:db, ALLOWED_EMAILS:'reviewer@example.test', PUBLISHER_TOKEN:'test-only',MISSION_TOKEN:'test-mission-only',STALE_AFTER_SECONDS:'300'})
function call(db,path,{body,auth=true,host='aries.flood.doctor',bearer}={}) {
  return worker.fetch(new Request('https://'+host+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{'Cf-Access-Authenticated-User-Email':'reviewer@example.test'}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body?{body:JSON.stringify(body)}:{})}),envFor(db),{})
}

test('operational health requires identity and separates stale data from worker availability',async()=>{
  const db=new SqliteD1()
  assert.deepEqual(await (await call(db,'/healthz',{auth:false})).json(),{ok:true})
  const missing=await (await call(db,'/healthz')).json()
  assert.equal(missing.operational.status,'degraded')
  assert.ok(missing.operational.sources.every(s=>s.status==='unknown'))
  const now=new Date().toISOString()
  for(const [table] of [['board_snapshot'],['todo_catalogue'],['worklist_snapshot']]) db.raw.prepare(`INSERT INTO ${table} VALUES(1,?,?)`).run('{"items":[]}',now)
  const healthy=await (await call(db,'/healthz',{auth:false,bearer:'test-mission-only',host:'aries-publish.flood.doctor'})).json()
  assert.equal(healthy.operational.status,'healthy')
  db.raw.exec("UPDATE board_snapshot SET published_at='2000-01-01T00:00:00Z'")
  const stale=await (await call(db,'/healthz')).json()
  assert.equal(stale.operational.status,'degraded')
  assert.equal(stale.operational.sources.find(s=>s.name==='board').status,'stale')
  db.close()
})

test('board validates the actual stored email subject and keeps structured evidence',async()=>{
  const db=new SqliteD1()
  const now=new Date().toISOString()
  db.raw.prepare('INSERT INTO board_snapshot VALUES(1,?,?)').run(JSON.stringify({items:[{id:4342,title:'PetSmart promotional newsletter',assignee:'mark',identity:{claim_id:'CLAIM-42'},financials:[{type:'payment_issued',amount_minor:0,currency:'USD',source:'Carrier notice',date:'2026-10-10'}]}]}),now)
  db.raw.prepare('INSERT INTO board_threads VALUES(?,?,?)').run(4342,JSON.stringify({subject:'Work Authorisation routing',messages:[{body:'Review required'}]}),now)
  const result=await (await call(db,'/api/board')).json()
  const item=result.items[0]
  assert.ok(item.quality.issues.some(i=>i.code==='title_subject_mismatch'))
  assert.equal(item.financials[0].amount_minor,0)
  assert.equal(item.responsibility.owner,'mark')
  assert.equal(Object.hasOwn(item,'source_subject'),false)
  db.close()
})

test('retry endpoint requires teammate identity and explicit confirmation and records the actor',async()=>{
  const db=new SqliteD1()
  const now=new Date().toISOString()
  db.raw.prepare("INSERT INTO command_queue(operation,item_id,value,actor_email,state,created_at) VALUES('assign',81,'mark','original@example.test','failed',?)").run(now)
  assert.equal((await call(db,'/api/commands/1/retry',{auth:false,body:{confirm:true}})).status,403)
  assert.equal((await call(db,'/api/commands/1/retry',{body:{}})).status,400)
  const response=await call(db,'/api/commands/1/retry',{body:{confirm:true}})
  assert.equal(response.status,202)
  assert.equal((await response.json()).receipt.state,'queued')
  const history=db.raw.prepare("SELECT operation,actor_email,item_id,value FROM activity_log").get()
  assert.deepEqual({...history},{operation:'retry',actor_email:'reviewer@example.test',item_id:'81',value:'1'})
  assert.equal((await call(db,'/api/commands/1/retry',{body:{confirm:true}})).status,409)
  db.close()
})
