import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker from '../src/index.js'
import { parseOptions, taskFailure, taskState, taskCounts } from '../src/mission-state.js'
import { MISSION_HTML } from '../src/mission-ui.js'

function fixture() {
  const db=new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0010_mission.sql',import.meta.url),'utf8'))
  db.exec(readFileSync(new URL('../migrations/0011_mission_answers.sql',import.meta.url),'utf8'))
  db.exec(readFileSync(new URL('../migrations/0012_mission_answers_by.sql',import.meta.url),'utf8'))
  db.prepare('INSERT INTO mission_records VALUES(?,?,?,?)').run('decision','TEST-C33',JSON.stringify({options:'Later,Review (recommended)'}),'2026-10-01T10:00:00Z')
  db.prepare('INSERT INTO mission_records VALUES(?,?,?,?)').run('task','TEST-task',JSON.stringify({status:'running'}),'2026-10-01T10:00:00Z')
  const env={MISSION_TOKEN:'TEST-only',ALLOWED_EMAILS:'frank@example.test',ALLOWED_EMAIL_DOMAINS:'flood.doctor',DB:{prepare(sql){return {values:[],bind(...values){this.values=values;return this},async all(){return {results:db.prepare(sql).all(...this.values)}},async first(){return db.prepare(sql).get(...this.values)}}}}}
  const call=(path,body,headers={},method=body===undefined?'GET':'POST',host='aries.flood.doctor')=>worker.fetch(new Request('https://'+host+path,{method,headers:{'Cf-Access-Authenticated-User-Email':'frank@example.test',Origin:'https://aries.flood.doctor','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{})
  const answer=(body,headers={})=>call('/api/mission/answer',{card_id:'TEST-C33',...body},headers)
  const poll=(mode,by='TEST-session')=>call('/api/mission/answers',{mode,by},{Authorization:'Bearer TEST-only'},'POST','aries-publish.flood.doctor')
  return {db,call,answer,poll}
}
for (const [name,value] of Object.entries({comma:'Later,Review (recommended)',or:'Later or Review (recommended)',semicolon:'Later;Review (recommended)',newline:'Later\nReview (recommended)',array:['Later','Review (recommended)']})) {
  test('options parse '+name+' and put recommendation first',()=>assert.deepEqual(parseOptions(value),[{label:'Review',recommended:true},{label:'Later',recommended:false}]))
}
test('options trim blanks and ignore non-string items',()=>assert.deepEqual(parseOptions([' ; ',' Review (Recommended) ',null,' Later ']),[{label:'Review',recommended:true},{label:'Later',recommended:false}]))
test('answer writes and reads refuse missing or disallowed Access identity',async()=>{
  const f=fixture()
  for(const email of ['', 'other@evil.test','x@flood.doctor.evil.test']) {
    assert.equal((await f.answer({kind:'choice',choice:'Later'},{'Cf-Access-Authenticated-User-Email':email})).status,401)
    assert.equal((await f.call('/api/mission/answers',undefined,{'Cf-Access-Authenticated-User-Email':email})).status,401)
  }
  assert.equal((await f.answer({kind:'choice',choice:'Later'},{'Cf-Access-Authenticated-User-Email':'staff@flood.doctor'})).status,200)
  assert.equal((await f.poll('all')).status,200)
  assert.equal((await f.call('/api/mission/answers',{mode:'new'},{Authorization:'Bearer wrong'},'POST','aries-publish.flood.doctor')).status,401)
})
test('Mission script parses and includes accessible card controls and retained drafts',()=>{
  const script=MISSION_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]
  assert.doesNotThrow(()=>new Function(script))
  for(const text of ['aria-pressed','Your instructions','aria-live="polite"','font:16px','min-height:48px','sessionStorage.missionDrafts','AbortSignal.timeout(20000)','Received. Use Your instructions'])assert.ok(MISSION_HTML.includes(text),text)
})
