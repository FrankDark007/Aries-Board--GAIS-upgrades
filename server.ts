import express from 'express';
import { createServer as createViteServer } from 'vite';
import { FakeD1Database } from './test/fake-d1.js';
import worker from './src/index.js';

const db = new FakeD1Database();
const env: any = {
  DB: db,
  ALLOWED_EMAILS: 'darakhshan.farough@gmail.com,mark@flood.doctor,steve@restorationdoctors.com,katherine@restorationdoctors.com,shyon@restorationdoctors.com,dom@flood.doctor',
  ACTIVITY_OWNER_EMAILS: 'darakhshan.farough@gmail.com',
  PUBLISHER_TOKEN: 'local-preview-publisher-token',
  MISSION_TOKEN: 'local-preview-mission-token',
  ENVIRONMENT: 'production',
};

async function seedDatabase() {
  const now = new Date().toISOString();
  const snapshot = {
    published_at: now,
    items: [
      {
        id: 249,
        title: '[business] Re: Invoice 13275 - 1306 S Poe St water mitigation payout',
        status: 'open',
        priority: 1,
        urgent: 'yes',
        assignee: 'frank',
        due: '2026-10-16',
        created: '2026-10-01',
        updated: now,
        kind: 'collections',
        mailbox: 'frankd@flood.doctor',
        thread_id: 'thread-poe-13275',
        source_url: 'https://mail.google.com/mail/u/0/#inbox/thread-poe-13275',
        brief: {
          title: 'Confirm ACV check release for 1306 S Poe St',
          client: 'Thomas & Susan Badgett',
          claim: 'Invoice 13275',
          action: 'call',
          next_step: 'Call adjuster desk to confirm check #88412 was mailed to office.',
          waiting_on: 'Frank',
          deadline: '2026-10-16',
          deadline_note: 'Carrier promised check dispatch by Friday',
          last_theirs: { at: '2026-10-15T14:20:00Z', by: 'State Farm Adjuster', what: 'Please confirm W-9 on file for 1306 S Poe St.' },
          last_ours: { at: '2026-10-14T10:00:00Z', by: 'Frank', what: 'Sent final mitigation invoice #13275.' },
          generated_at: now,
        },
        history: [
          { at: '2026-10-15T14:20:00Z', who: 'Adjuster', what: 'Asked to confirm W-9 on file.', ours: false, kind: 'in' },
          { at: '2026-10-14T10:00:00Z', who: 'Frank', what: 'Sent mitigation invoice #13275.', ours: true, kind: 'out' },
        ],
      },
      {
        id: 242,
        title: '[steve] Fwd: 1306 S Poe Street - moisture mapping & drying logs',
        status: 'open',
        priority: 2,
        assignee: 'steve',
        created: '2026-09-28',
        updated: now,
        kind: 'documentation',
        mailbox: 'steve@restorationdoctors.com',
        thread_id: 'thread-poe-logs',
        brief: {
          title: 'Upload final drying logs for 1306 S Poe St',
          client: '',
          claim: '',
          action: 'file',
          next_step: 'Attach Matterport + moisture logs to claim folder.',
          waiting_on: 'Steve',
          generated_at: now,
        },
      },
      {
        id: 218,
        title: '[aries] Re: Badgett, Thomas - Certificate of Satisfaction signed',
        status: 'open',
        priority: 2,
        assignee: 'katherine',
        created: '2026-09-20',
        updated: now,
        kind: 'operations',
        mailbox: 'aries@flood.doctor',
        brief: {
          title: 'Archive signed COS for Badgett claim',
          client: 'Badgett, Tom',
          claim: '13275',
          action: 'close',
          looks_done: true,
          next_step: 'Signed COS received and archived in Drive.',
          waiting_on: 'Nobody',
          last_theirs: { at: '2026-10-10T11:00:00Z', by: 'Tom Badgett', what: 'Attached is the signed COS.' },
          last_ours: { at: '2026-10-12T15:30:00Z', by: 'Katherine', what: 'Thank you Tom, we have everything we need!' },
          generated_at: now,
        },
      },
      {
        id: 205,
        title: '[mark] Re: 4412 Chain Bridge Rd - Adjuster scope approval',
        status: 'open',
        priority: 2,
        assignee: 'mark',
        created: '2026-09-25',
        updated: now,
        kind: 'supplement',
        mailbox: 'mark@flood.doctor',
        brief: {
          title: 'Replied with revised Xactimate line items',
          client: 'Elena Rostova',
          claim: 'CLM-90411',
          action: 'reply',
          next_step: 'Sent revised Xactimate estimate; waiting on desk review.',
          waiting_on: 'Travelers Adjuster',
          last_theirs: { at: '2026-10-08T09:00:00Z', by: 'Travelers', what: 'Please send revised line items.' },
          last_ours: { at: '2026-10-11T16:45:00Z', by: 'Mark', what: 'Attached revised Xactimate PDF.' },
          generated_at: now,
        },
      },
      {
        id: 199,
        title: '[katherine] Unassigned intake: 8821 Leesburg Pike commercial water loss',
        status: 'open',
        priority: 2,
        assignee: '',
        created: '2026-09-29',
        updated: now,
        kind: 'intake',
        mailbox: 'katherine@restorationdoctors.com',
        brief: {
          title: 'Assign project manager for 8821 Leesburg Pike',
          client: 'Apex Medical Group',
          claim: 'Invoice 13301',
          action: 'decide',
          next_step: 'Assign lead PM and confirm commercial COI.',
          waiting_on: 'Us',
          generated_at: now,
        },
      },
    ],
  };

  await worker.fetch!(
    new Request('https://aries-publish.flood.doctor/api/sync/snapshot', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.PUBLISHER_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(snapshot),
    }),
    env
  );

  await worker.fetch!(
    new Request('https://aries-publish.flood.doctor/api/sync/threads', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.PUBLISHER_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threads: {
          '249': {
            subject: 'Re: Invoice 13275 - 1306 S Poe St water mitigation payout',
            messages: [
              { date: '2026-10-14T10:00:00Z', from: 'Frank <frankd@flood.doctor>', to: 'claims@statefarm.com', subject: 'Invoice 13275', body: 'Attached is final mitigation invoice #13275 for 1306 S Poe St.' },
              { date: '2026-10-15T14:20:00Z', from: 'State Farm Claims <claims@statefarm.com>', to: 'frankd@flood.doctor', subject: 'Re: Invoice 13275', body: 'Received. Please confirm W-9 on file so we can release ACV check #88412.' },
            ],
          },
        },
      }),
    }),
    env
  );

  const todoCatalogue = {
    published_at: now,
    items: [
      {
        id: 'task-10000000000001',
        text: 'URGENT: Follow up with State Farm on ACV check #88412',
        section: 'Robert Badgett',
        client: 'Robert Badgett',
        assignee: 'frank',
        seedDone: false,
        sourceAccount: 'frankd@',
        notificationDate: '2026-10-14',
      },
      {
        id: 'task-10000000000002',
        text: 'Upload final moisture map photos to Drive folder',
        section: 'Badgett, Robert',
        client: 'Badgett, Robert',
        assignee: 'steve',
        seedDone: false,
        sourceAccount: 'steve@',
        notificationDate: '2026-10-12',
      },
      {
        id: 'task-10000000000003',
        text: 'Verify mortgage endorsement signature with homeowner',
        section: 'Robert and Elizabeth Badgett',
        client: 'Robert and Elizabeth Badgett',
        assignee: 'katherine',
        seedDone: true,
        sourceAccount: 'katherine@',
        notificationDate: '2026-10-09',
      },
      {
        id: 'task-10000000000004',
        text: 'Send revised Xactimate roof & drywall supplement',
        section: 'Elena Rostova',
        client: 'Elena Rostova',
        assignee: 'mark',
        seedDone: false,
        sourceAccount: 'mark@',
        notificationDate: '2026-10-11',
      },
    ],
  };

  await worker.fetch!(
    new Request('https://aries-publish.flood.doctor/api/sync/todos/catalogue', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.PUBLISHER_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(todoCatalogue),
    }),
    env
  );
}

async function startServer() {
  await seedDatabase();

  const app = express();
  app.use('/api', express.raw({ type: '*/*', limit: '5mb' }));

  const isWorkerRoute = (pathname: string) =>
    pathname.startsWith('/api/') ||
    pathname === '/card' ||
    pathname === '/mission' ||
    pathname === '/activity' ||
    pathname === '/healthz';

  app.use(async (req, res, next) => {
    const pathname = (req.originalUrl || req.url).split('?')[0];
    if (!isWorkerRoute(pathname)) {
      return next();
    }
    try {
      const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
      const url = new URL(req.originalUrl || req.url, `${proto}://aries.flood.doctor`);
      const asUser = url.searchParams.get('as_email') || 'darakhshan.farough@gmail.com';
      url.searchParams.delete('as_email');

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(', '));
      }
      headers.set('host', 'aries.flood.doctor');
      if (!headers.has('cf-access-authenticated-user-email')) {
        headers.set('cf-access-authenticated-user-email', asUser);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        headers.set('origin', `${proto}://aries.flood.doctor`);
      }

      const body =
        req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : Buffer.isBuffer(req.body) && req.body.length > 0
            ? new Uint8Array(req.body)
            : undefined;

      const webReq = new Request(url.toString(), {
        method: req.method,
        headers,
        body,
      });

      const webRes = await worker.fetch!(webReq, env);
      res.status(webRes.status);
      webRes.headers.forEach((val, key) => {
        if (key.toLowerCase() === 'content-security-policy') return;
        res.setHeader(key, val);
      });
      const arrayBuffer = await webRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Internal Server Error' });
    }
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aries Cloud Dashboard running on http://localhost:${PORT}`);
  });
}

startServer();
