import { isAutoResolvedCandidate, isStaleCard, cardExceptions, matchesBoardFilters, commandReceiptText, bulkActionPlan, bulkUndoPayload, reconcileBoardItems } from './board-ui-state.js'

export const BOARD_UPGRADE_CSS = `
    .summary-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 0; margin: 14px 0 18px; }
    .metric { padding: 12px 16px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
    .metric-value { font-size: 22px; font-variant-numeric: tabular-nums; }
    .ready-banner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding: 12px 16px; border: 1px solid #a7f3d0; border-radius: 10px; background: linear-gradient(90deg, #ecfdf5 0%, #f0fdf4 100%); color: #065f46; }
    .ready-banner-copy { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; font-size: 13.5px; }
    .ready-banner-copy strong { font-size: 14px; font-weight: 750; color: #064e3b; }
    .ready-banner-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .ready-btn { min-height: 36px; padding: 6px 12px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer; border: 1px solid #6ee7b7; background: white; color: #065f46; }
    .ready-btn.primary { background: #059669; border-color: #059669; color: white; }
    .ready-btn.primary:hover { background: #047857; }
    .quick-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
    .qf-pill { min-height: 34px; padding: 5px 11px; border: 1px solid var(--line); border-radius: 7px; background: #f8fafc; color: var(--muted); font-size: 12.5px; font-weight: 650; font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap; transition: background .14s ease, color .14s ease, border-color .14s ease; }
    .qf-pill:hover { background: #f1f5f9; color: var(--ink); border-color: #cbd5e1; }
    .qf-pill[aria-pressed="true"] { background: var(--ink); color: white; border-color: var(--ink); }
    .qf-pill.qf-ready[aria-pressed="false"] { color: #065f46; background: #ecfdf5; border-color: #a7f3d0; }
    .qf-pill.qf-stale[aria-pressed="false"] { color: #9a3412; background: #fff7ed; border-color: #fed7aa; }
    .board-controls { display: grid; gap: 10px; margin-bottom: 16px; padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
    .board-filters { display: grid; grid-template-columns: minmax(180px, 2fr) repeat(4, minmax(115px, 1fr)); gap: 8px; }
    .board-filters label, .bulk-fields label { display: grid; gap: 4px; min-width: 0; color: var(--muted); font-size: 11.5px; font-weight: 650; }
    .board-filters input, .board-filters select, .owner-select, .bulk-fields input, .bulk-fields select { min-width: 0; width: 100%; min-height: 36px; padding: 6px 9px; border: 1px solid #cbd5e1; border-radius: 7px; background: white; color: var(--ink); font: inherit; font-size: 13px; }
    .board-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .board-tools button, .detail-actions button { min-height: 36px; padding: 6px 12px; font-size: 12.5px; }
    .compact-table-wrap { overflow-x:auto; max-width:100%; border:1px solid var(--line); border-radius:10px; background:white; }
    .compact-table { width:100%; border-collapse:collapse; min-width:720px; font-size:13px; font-variant-numeric: tabular-nums; }
    .compact-table caption { padding:10px 12px; text-align:left; color:var(--muted); font-size:12px; }
    .compact-table th,.compact-table td { padding:9px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    .compact-table th { font-size:11.5px; color:var(--muted); font-weight:650; background:#f8fafc; }
    .compact-table .table-task { min-width:200px; max-width:440px; overflow-wrap:anywhere; }
    .compact-table input { width:16px; height:16px; margin:4px; }
    .compact-table button { min-height:32px; padding:4px 10px; font-size:12px; }
    .scope-count { margin: 0; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    .card-select { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; font-size: 12px; color: var(--muted); cursor: pointer; }
    .card-select input { width: 15px; height: 15px; margin: 0; }
    .receipt, .exception-summary { margin: 6px 0 0; padding: 5px 8px; border-radius: 6px; font-size: 11.5px; overflow-wrap: anywhere; }
    .receipt { background: #f1f5f9; color: #334155; }
    .receipt[data-state="failed"], .exception-summary { background: #fff7ed; color: #9a3412; }
    .receipt[data-state="applied"] { background: var(--green-soft); color: #065f46; }
    .board[data-density="compact"] { display: block; }
    .board[data-density="compact"] .claim-card { margin-bottom: 8px; padding: 10px; }
    .board[data-density="compact"] .claim-head { display: flex; flex-wrap: wrap; gap: 5px 14px; align-items: baseline; }
    .board[data-density="compact"] .claim-head h3 { font-size: 15px; }
    .board[data-density="compact"] .card { margin-bottom: 6px; min-height: 0; padding: 10px 14px; box-shadow: none; }
    #detail-dialog { width: min(900px, calc(100% - 24px)); max-height: 90vh; }
    #detail-content { display: grid; gap: 14px; }
    .detail-section { border-top: 1px solid var(--line); padding-top: 12px; min-width: 0; }
    .detail-section h3 { margin: 0 0 8px; font-size: 15px; }
    .detail-section p, .detail-section li { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
    .detail-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .detail-section a { overflow-wrap: anywhere; }
    .bulk-fields { display: grid; gap: 10px; margin: 12px 0; }
    #bulk-preview { max-height: 35vh; overflow: auto; padding-left: 22px; }
    .focus-target { outline: 3px solid var(--blue); outline-offset: 4px; }
    @media(max-width:860px) { .summary-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } .board-filters { grid-template-columns: repeat(2,minmax(0,1fr)); } .board-filters label:first-child { grid-column:1 / -1; } }
    @media(max-width:680px) { .board[data-density="compact"] .card[data-collapsed="true"] { display:block; } .todo-toolbar { flex-wrap:wrap; } .owner-row { align-items:stretch; } }
`

export const BOARD_UPGRADE_CONTROLS = `
        <div id="ready-close-banner" class="ready-banner" hidden>
          <div class="ready-banner-copy">
            <strong id="ready-close-title">⚡ Ready to Close (0)</strong>
            <span>Aries detected these threads were already replied to or marked complete in email.</span>
          </div>
          <div class="ready-banner-actions">
            <button id="filter-ready-close" class="ready-btn" type="button">View Ready to Close</button>
            <button id="close-all-handled" class="ready-btn primary" type="button">Close All Handled (0)</button>
          </div>
        </div>
        <div class="board-controls" aria-label="Board filters and triage">
          <div class="quick-filters" role="group" aria-label="Quick filters">
            <button id="qf-all" class="qf-pill" data-quick="" type="button" aria-pressed="true">All</button>
            <button id="qf-mine" class="qf-pill" data-quick="mine" type="button" aria-pressed="false" hidden>My Cards</button>
            <button id="qf-ready" class="qf-pill qf-ready" data-quick="ready" type="button" aria-pressed="false">⚡ Ready to Close (0)</button>
            <button id="qf-urgent" class="qf-pill" data-quick="urgent" type="button" aria-pressed="false">Urgent (0)</button>
            <button id="qf-unassigned" class="qf-pill" data-quick="unassigned" type="button" aria-pressed="false">Unassigned (0)</button>
            <button id="qf-stale" class="qf-pill qf-stale" data-quick="stale" type="button" aria-pressed="false">Stale &gt; 7d (0)</button>
          </div>
          <div class="board-filters">
            <label>Search cards<input id="board-search" type="search" placeholder="Task, client, address, claim or #id" autocomplete="off"></label>
            <label>Owner<select id="board-owner"><option value="">All owners</option><option value="unassigned">Unassigned</option></select></label>
            <label>Client<input id="board-client" type="search" placeholder="Client name or ID"></label>
            <label>Claim or invoice<input id="board-claim" type="search" placeholder="Number or ID"></label>
            <label>Urgency<select id="board-urgency"><option value="">Any urgency</option><option value="urgent">Urgent</option><option value="normal">Normal</option></select></label>
            <label>Due<select id="board-due"><option value="">Any date</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="upcoming">Upcoming</option><option value="undated">No date</option></select></label>
            <label>Status<select id="board-status"><option value="">Active board</option><option value="open">Open</option><option value="snoozed">Snoozed</option><option value="done">Done</option></select></label>
            <label>Sort by<select id="board-sort"><option value="urgent">Urgent</option><option value="created">Date Created</option><option value="assignee">Assignee</option></select></label>
            <label>Layout<select id="board-density"><option value="cards">Cards</option><option value="compact">Compact table</option></select></label>
          </div>
          <div class="board-tools"><button id="board-clear" class="refresh-button" type="button">Clear filters</button><button id="select-visible" class="refresh-button" type="button">Select shown</button><button id="clear-selected" class="refresh-button" type="button">Clear selection</button><button id="bulk-done-now" class="refresh-button" type="button" disabled>✓ Done selected (0)</button><button id="bulk-open" class="refresh-button" type="button" disabled>Review bulk action (0)</button><button id="bulk-undo" class="refresh-button" type="button" hidden>Review undo</button></div>
          <p id="board-scope" class="scope-count" aria-live="polite"></p>
          <p id="bulk-status" class="scope-count" aria-live="polite"></p>
        </div>
`

export const BOARD_UPGRADE_DIALOGS = `
  <dialog id="detail-dialog" aria-labelledby="detail-title"><div class="dialog-body"><h2 id="detail-title">Card details</h2><p id="detail-meta"></p><div id="detail-content"></div><div class="dialog-actions"><button id="detail-close" class="dialog-action" type="button">Close details</button></div></div></dialog>
  <dialog id="bulk-dialog" aria-labelledby="bulk-title"><div class="dialog-body"><h2 id="bulk-title">Review bulk action</h2><p>Only the listed cards will change. Each command keeps its own receipt.</p><div class="bulk-fields"><label>Action<select id="bulk-operation"><option value="done">Mark done</option><option value="assign">Assign owner</option><option value="snooze">Snooze</option><option value="duplicate-review">Request duplicate review</option></select></label><label id="bulk-owner-label" hidden>New owner<select id="bulk-owner"></select></label><label id="bulk-date-label" hidden>Return date<input id="bulk-date" type="date"></label></div><ol id="bulk-preview"></ol><p id="bulk-help"></p><div class="dialog-actions"><button id="bulk-cancel" class="dialog-action" type="button">Cancel</button><button id="bulk-confirm" class="dialog-action primary" type="button">Queue these changes</button></div></div></dialog>
`

export const BOARD_UPGRADE_SCRIPT = [isAutoResolvedCandidate, isStaleCard, cardExceptions, matchesBoardFilters, commandReceiptText, bulkActionPlan, bulkUndoPayload, reconcileBoardItems].map(fn => fn.toString()).join('\n') + String.raw`
    const filters = { query:'', owner:'', client:'', claim:'', urgency:'', due:'', status:'', quick:'', sort:'urgent' };
    const selectedCards = new Set();
    const cardNodes = new Map();
    const groupNodes = new Map();
    let currentReceipts = [];
    let bulkPlan = [];
    let bulkLast = [];
    let bulkUndoMode = false;
    let detailId = null;
    let detailGeneration = 0;
    let deepLinkHandled = false;
    const detailDialog = document.querySelector('#detail-dialog');
    const bulkDialog = document.querySelector('#bulk-dialog');
    function boardScope(item) {
      if (filters.status) return (item.status || 'open') === filters.status;
      return onBoard(item);
    }
    function filteredBoardItem(item) {
      return matchesBoardFilters(item, filters, todayIso()) && (activeView !== 'exceptions' || cardExceptions(item).length > 0);
    }
    function visibleBoardItems() { return boardItems.filter(boardScope).filter(inView).filter(filteredBoardItem); }
    function reconcileChildren(parent, nodes) {
      const wanted = new Set(nodes);
      nodes.forEach(function (node, index) { if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] || null); });
      Array.from(parent.children).forEach(function (node) { if (!wanted.has(node)) node.remove(); });
    }
    let compactTable = null;
    const compactRows = new Map();
    function renderCompactTable(items) {
      if(!compactTable){compactTable=document.createElement('div');compactTable.className='compact-table-wrap';compactTable.setAttribute('role','region');compactTable.setAttribute('aria-label','Compact card table, scroll horizontally for more columns');compactTable.tabIndex=0;const table=document.createElement('table');table.className='compact-table';const caption=document.createElement('caption');caption.textContent='Curated operational cards. Open details for source evidence and actions.';const head=document.createElement('thead');const row=document.createElement('tr');['Select','Card and next action','Owner / next actor','Due / status','Latest command','Details'].forEach(function(text){const th=document.createElement('th');th.scope='col';th.textContent=text;row.append(th);});head.append(row);table.append(caption,head,document.createElement('tbody'));compactTable.append(table);}
      const rows=items.map(function(item){let row=compactRows.get(String(item.id));if(!row){row=document.createElement('tr');row.dataset.id=String(item.id);for(let n=0;n<6;n++)row.append(document.createElement('td'));row.children[1].className='table-task';const select=document.createElement('input');select.type='checkbox';select.setAttribute('aria-label','Select card #'+item.id);select.addEventListener('change',function(){if(select.checked)selectedCards.add(String(item.id));else selectedCards.delete(String(item.id));updateUpgradeChrome();});row.children[0].append(select);const open=document.createElement('button');open.type='button';open.className='card-action';open.textContent='Open #'+item.id;open.addEventListener('click',function(){openCardDetail(item.id);});row.children[5].append(open);compactRows.set(String(item.id),row);}row.children[0].querySelector('input').checked=selectedCards.has(String(item.id));row.children[1].textContent='#'+item.id+' · '+cardTitle(item)+' — '+((item.brief||{}).next_step||item.summary||'Next action unknown');row.children[2].textContent=nameOf((item.responsibility||{}).owner||item.assignee)||'Unassigned';if((item.responsibility||{}).next_actor)row.children[2].textContent+=' / '+item.responsibility.next_actor;row.children[3].textContent=(item.due?formatDue(item.due):'No date')+' · '+(item.status||'open')+(item.pending?' (requested)':'');row.children[4].textContent=commandReceiptText(item.command_receipt);return row;});reconcileChildren(compactTable.querySelector('tbody'),rows);return compactTable;
    }
    function rememberFocus() {
      const focused = document.activeElement;
      const start = focused && typeof focused.selectionStart === 'number' ? focused.selectionStart : null;
      const end = focused && typeof focused.selectionEnd === 'number' ? focused.selectionEnd : null;
      const x = window.scrollX, y = window.scrollY;
      return function () {
        if (focused && focused.isConnected && document.activeElement !== focused) { focused.focus({preventScroll:true}); if (start !== null && typeof focused.setSelectionRange === 'function') focused.setSelectionRange(start,end); }
        if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x,y);
      };
    }
    function receiptFor(entry) { if(!entry.command_id)return null;const receipt=currentReceipts.find(function (receipt) { return String(receipt.id) === String(entry.command_id); }) || (boardItems.find(function (item) { return item.id === entry.id; }) || {}).command_receipt;return receipt && String(receipt.id)===String(entry.command_id)?receipt:null; }
    function updateUpgradeChrome() {
      const shown = visibleBoardItems();
      const activeOpen = boardItems.filter(onBoard);
      const today = todayIso();
      const readyList = activeOpen.filter(isAutoResolvedCandidate);
      const staleList = activeOpen.filter(function(item){ return isStaleCard(item, today); });
      const urgentList = activeOpen.filter(isUrgent);
      const unassignedList = activeOpen.filter(function(item){ return !String(item.assignee || '').trim(); });
      document.querySelector('#board-scope').textContent = shown.length + ' cards shown of ' + boardItems.length + ' published cards. ' + (activeView === 'exceptions' ? 'Exceptions require source or runner review.' : 'Board is the curated operational collection. To-Do and Full list have separate scopes.');
      const banner = document.querySelector('#ready-close-banner');
      if (banner) {
        banner.hidden = readyList.length === 0;
        document.querySelector('#ready-close-title').textContent = '⚡ Ready to Close (' + readyList.length + ')';
        document.querySelector('#close-all-handled').textContent = 'Close All Handled (' + readyList.length + ')';
        document.querySelector('#filter-ready-close').textContent = filters.quick === 'ready' ? 'Showing Ready to Close' : 'View Ready to Close (' + readyList.length + ')';
      }
      const qfReady = document.querySelector('#qf-ready');
      if (qfReady) qfReady.textContent = '⚡ Ready to Close (' + readyList.length + ')';
      const qfUrgent = document.querySelector('#qf-urgent');
      if (qfUrgent) qfUrgent.textContent = 'Urgent (' + urgentList.length + ')';
      const qfUnassigned = document.querySelector('#qf-unassigned');
      if (qfUnassigned) qfUnassigned.textContent = 'Unassigned (' + unassignedList.length + ')';
      const qfStale = document.querySelector('#qf-stale');
      if (qfStale) qfStale.textContent = 'Stale > 7d (' + staleList.length + ')';
      const qfMine = document.querySelector('#qf-mine');
      if (qfMine) {
        qfMine.hidden = !me;
        if (me) qfMine.textContent = 'My Cards (' + activeOpen.filter(function(item){ return String(item.assignee || '').toLowerCase() === me.key; }).length + ')';
      }
      document.querySelectorAll('.quick-filters [data-quick]').forEach(function(btn){
        const val = btn.dataset.quick || '';
        const pressed = val === 'mine' ? boardFilter === 'mine' : (boardFilter !== 'mine' && filters.quick === val);
        btn.setAttribute('aria-pressed', String(pressed));
      });
      const bulkButton = document.querySelector('#bulk-open');
      bulkButton.textContent = 'Review bulk action (' + selectedCards.size + ')';
      bulkButton.disabled = !selectedCards.size;
      const bulkDoneBtn = document.querySelector('#bulk-done-now');
      if (bulkDoneBtn) {
        bulkDoneBtn.textContent = '✓ Done selected (' + selectedCards.size + ')';
        bulkDoneBtn.disabled = !selectedCards.size;
      }
      const applied = bulkLast.filter(function (entry) { return (receiptFor(entry) || {}).state === 'applied'; }).length;
      const failed = bulkLast.filter(function (entry) { return (receiptFor(entry) || {}).state === 'failed' || entry.error; }).length;
      if (bulkLast.length) document.querySelector('#bulk-status').textContent = 'Last bulk action: ' + applied + ' applied, ' + failed + ' failed, ' + (bulkLast.length-applied-failed) + ' awaiting confirmation.' + bulkLast.filter(function(entry){return entry.error;}).map(function(entry){return ' #'+entry.id+': '+entry.error;}).join('') + (bulkLast.some(function(entry){return entry.operation==='snooze' && (entry.before.status!=='snoozed' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.before.due||''));}) ? ' Undo is unavailable for new snoozes because the previous due date cannot be restored.' : '');
      document.querySelector('#bulk-undo').hidden = !bulkLast.some(function (entry) { return bulkUndoPayload(entry,boardItems.find(function (item) { return item.id===entry.id; }),receiptFor(entry)); });
      document.querySelector('#show-exceptions').textContent = 'Exceptions (' + activeOpen.filter(function(item){return cardExceptions(item).length;}).length + ')';
      const ownerSelect = document.querySelector('#board-owner');
      const signature = JSON.stringify(teamList);
      if (ownerSelect.dataset.team !== signature) {
        ownerSelect.dataset.team=signature;
        const previous=ownerSelect.value;
        ownerSelect.replaceChildren(new Option('All owners',''),new Option('Unassigned','unassigned'));
        teamList.concat([{key:'aries',name:'Aries'}]).forEach(function(person){ownerSelect.append(new Option(person.name,person.key));});
        ownerSelect.value=previous;
      }
    }
    function decorateCard(card,item) {
      let tools=card.querySelector('.card-selection');
      if(!tools){
        tools=document.createElement('div');tools.className='card-selection board-tools';
        const label=document.createElement('label');label.className='card-select';
        const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','Select card #'+item.id);
        check.addEventListener('change',function(){if(check.checked)selectedCards.add(String(item.id));else selectedCards.delete(String(item.id));updateUpgradeChrome();});
        label.append(check,document.createTextNode('Select'));
        const detail=document.createElement('button');detail.type='button';detail.className='card-action';detail.textContent='Open details';detail.addEventListener('click',function(){openCardDetail(item.id);});
        tools.append(label,detail);card.append(tools);
        const receipt=document.createElement('p');receipt.className='receipt';receipt.setAttribute('aria-live','polite');card.append(receipt);
        const exception=document.createElement('p');exception.className='exception-summary';card.append(exception);
      }
      tools.querySelector('input').checked=selectedCards.has(String(item.id));
      const receipt=card.querySelector('.receipt');receipt.hidden=!item.command_receipt;receipt.dataset.state=(item.command_receipt||{}).state||'';receipt.textContent=commandReceiptText(item.command_receipt)+(item.pending?' · Requested values; awaiting application.':'');
      const issues=cardExceptions(item);const notice=card.querySelector('.exception-summary');notice.hidden=!issues.length;notice.textContent=issues.length?'Review: '+issues[0].message+(issues.length>1?' (+'+(issues.length-1)+' more)':''):'';
      if(item.responsibility){const role=item.responsibility;card.querySelector('.card-owner-line').textContent='Owner: '+(role.owner?nameOf(role.owner):'Unassigned')+' · Next actor: '+(role.next_actor||'Unknown')+' · Waiting on: '+(role.waiting_on||'Unknown');}
      const facts=card.querySelector('.facts');
      facts.querySelectorAll('[data-financial]').forEach(function(node){node.remove();});
      if(item.financials && item.financials.length){
        const legacy=facts.querySelectorAll('span');if(legacy.length>2)legacy[2].remove();
        item.financials.forEach(function(fact){const amount=document.createElement('span');amount.dataset.financial='true';amount.textContent=fact.type+': '+new Intl.NumberFormat('en-US',{style:'currency',currency:fact.currency}).format(fact.amount_minor/100);amount.title='Source: '+fact.source+(fact.date?' · '+fact.date:'');facts.append(amount);});
      } else if(item.financials){const legacy=facts.querySelectorAll('span');if(legacy.length>2){if(!legacy[2].textContent.endsWith(' (unverified)'))legacy[2].textContent+=' (unverified)';}}
    }
    function detailSection(title,lines){const section=document.createElement('section');section.className='detail-section';const heading=document.createElement('h3');heading.textContent=title;section.append(heading);lines.forEach(function(line){const p=document.createElement('p');p.textContent=line;section.append(p);});return section;}
    function safeDocumentUrl(value){if(!value)return null;try{const url=new URL(value,location.origin);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch(error){return null;}}
    async function openCardDetail(id){
      const item=boardItems.find(function(row){return String(row.id)===String(id);});if(!item)return;
      detailId=item.id;const generation=++detailGeneration;
      document.querySelector('#detail-title').textContent='#'+item.id+' · '+cardTitle(item);
      document.querySelector('#detail-meta').textContent='Owner: '+nameOf((item.responsibility||{}).owner||item.assignee)+' · '+commandReceiptText(item.command_receipt)+(item.pending?' · Requested values; awaiting application.':'');
      const content=document.querySelector('#detail-content');content.replaceChildren();
      const brief=item.brief||{};const roles=item.responsibility||{};
      const next=detailSection('Next action',[brief.next_step||brief.needs||item.summary||'No next action supplied.','Next actor: '+(roles.next_actor||'Unknown')+' · Waiting on: '+(roles.waiting_on||brief.waiting_on||'Unknown')]);
      const actions=document.createElement('div');actions.className='detail-actions';
      const note=document.createElement('button');note.type='button';note.className='card-action';note.textContent='Add correction or note';note.addEventListener('click',function(){noteItem=item;noteHost=cardNodes.get(String(item.id))||null;document.querySelector('#note-target').textContent='#'+item.id+' · '+cardTitle(item);noteText.value='';detailDialog.close();noteDialog.showModal();noteText.focus();});actions.append(note);
      if(item.command_receipt && item.command_receipt.state==='failed'){const retry=document.createElement('button');retry.type='button';retry.className='card-action';retry.textContent='Retry failed command';retry.addEventListener('click',async function(){if(!window.confirm('Retry this failed '+item.command_receipt.operation+' command for card #'+item.id+'?'))return;retry.disabled=true;try{const response=await fetch('/api/commands/'+item.command_receipt.id+'/retry',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({confirm:true})});const result=await response.json();if(!response.ok)throw new Error((result.error||'Retry failed')+(result.next_attempt_at?' Retry after '+formatTime(result.next_attempt_at):''));showToast('Retry queued. Wait for its receipt.',false);await loadBoard();openCardDetail(item.id);}catch(error){showToast(error.message,true);retry.disabled=false;}});actions.append(retry);}
      next.append(actions);content.append(next);
      const issues=cardExceptions(item);if(issues.length)content.append(detailSection('Exceptions and recovery',issues.map(function(issue){return issue.message+' '+issue.recovery;})));
      const identity=item.identity||{};content.append(detailSection('Identity and grouping',[['Claim',identity.claim_id],['Client',identity.client_id],['Invoice',identity.invoice_id]].map(function(pair){return pair[0]+': '+(pair[1]||'Unknown');}).concat((item.grouping||{}).reasons||[])));
      const financials=item.financials||[];content.append(detailSection('Financial facts',financials.length?financials.map(function(fact){return fact.type+': '+new Intl.NumberFormat('en-US',{style:'currency',currency:fact.currency}).format(fact.amount_minor/100)+' · '+fact.source+' · '+(fact.date||'Date unknown');}):['No verified financial facts supplied. Legacy amount text: '+(brief.amount||'Unknown')]));
      const relationships=item.relationships||{};const related=[];if(relationships.duplicate_of)related.push('Confirmed duplicate of #'+relationships.duplicate_of);if(relationships.superseded_by)related.push('Superseded by #'+relationships.superseded_by);(relationships.supersedes||[]).forEach(function(value){related.push('Supersedes #'+value);});(relationships.suggestions||[]).forEach(function(value){related.push('Review suggestion, card #'+value.card_id+': '+value.reason);});if(related.length)content.append(detailSection('Related cards',related));
      const prep=item.prep||{};content.append(detailSection('Prepared output',[prep.output||prep.result||prep.detail||'Preparation output is recorded in the notes below.','Preparation state: '+(prep.status||'No state supplied')]));
      content.append(detailSection('Notes',(item.notes||[]).length?item.notes.map(function(note){return (typeof note==='string'?note:note.text||'')+(note.by?' · '+note.by:'')+(note.at?' · '+formatTime(note.at):'')+(note.pending?' · Pending application':'');}):[item.note||'No notes supplied.']));
      const attachments=detailSection('Attachments',[]);const files=(item.attachments||[]).concat(prep.attachments||[]);if(!files.length)attachments.append(document.createTextNode('No attachments supplied. Check the source conversation for original documents.'));files.forEach(function(file){const p=document.createElement('p');const url=safeDocumentUrl(file.url||file.href||'');if(url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=file.name||file.filename||'Open document';p.append(link);}else p.textContent=file.name||file.filename||'Attachment location unavailable';attachments.append(p);});content.append(attachments);
      content.append(detailSection('History',(item.history||[]).length?item.history.map(function(entry){return formatTime(entry.at)+' · '+(entry.who||'')+' '+(entry.what||'');}):['No history supplied.']));
      const email=detailSection('Source email',[threadIds.has(item.id)?'Loading source conversation…':'No source conversation has been published for this card.']);content.append(email);
      if(!detailDialog.open)detailDialog.showModal();
      if(!threadIds.has(item.id))return;
      try{const response=await fetch('/api/thread?id='+encodeURIComponent(item.id),{headers:{accept:'application/json'},cache:'no-store'});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Email unavailable');if(generation!==detailGeneration||!detailDialog.open)return;email.querySelector('p').remove();(payload.messages||[]).forEach(function(message){email.append(detailSection([message.from,message.date].filter(Boolean).join(' · '),[message.body||'(No message text)',message.truncated?'Message shortened. Open the original mailbox for the rest.':'']));});}catch(error){if(generation===detailGeneration)email.querySelector('p').textContent=error.message;}
    }
    function refreshBulkPreview(){
      const operation=document.querySelector('#bulk-operation').value;const value=operation==='snooze'?document.querySelector('#bulk-date').value:operation==='assign'?document.querySelector('#bulk-owner').value:'';
      document.querySelector('#bulk-owner-label').hidden=operation!=='assign';document.querySelector('#bulk-date-label').hidden=operation!=='snooze';
      const list=document.querySelector('#bulk-preview');list.replaceChildren();
      try{bulkPlan=bulkUndoMode?bulkLast.filter(function(entry){return bulkUndoPayload(entry,boardItems.find(function(item){return item.id===entry.id;}),receiptFor(entry));}).map(function(entry){return Object.assign({},entry,{payload:bulkUndoPayload(entry,boardItems.find(function(item){return item.id===entry.id;}),receiptFor(entry))});}):bulkActionPlan(boardItems,selectedCards,operation,value);bulkPlan.forEach(function(entry){const row=document.createElement('li');row.textContent='#'+entry.id+' · '+entry.title+' → '+entry.payload.operation+(entry.payload.value?' '+entry.payload.value:'');list.append(row);});document.querySelector('#bulk-help').textContent=bulkUndoMode?'Only applied commands whose current value still matches are eligible. Undo is a new command.':operation==='duplicate-review'?'Adds a review note to each card. It does not merge, close or delete any card.':operation==='done'?'Marks every listed card done in one batch. Undo is available after Aries confirms application.':operation==='snooze'?'Review every affected card. Undo is available only when restoring a previous valid snooze date, after Aries confirms application.':'Review every affected card. Undo becomes available after Aries confirms application.';document.querySelector('#bulk-confirm').disabled=!bulkPlan.length;}catch(error){bulkPlan=[];document.querySelector('#bulk-help').textContent=error.message;document.querySelector('#bulk-confirm').disabled=true;}
    }
    function openBulk(undo, initialOperation){bulkUndoMode=undo;document.querySelector('#bulk-title').textContent=undo?'Review undo':'Review bulk action';document.querySelector('.bulk-fields').hidden=undo;document.querySelector('#bulk-confirm').textContent=undo?'Queue these reversals':'Queue these changes';const owner=document.querySelector('#bulk-owner');owner.replaceChildren(new Option('Unassigned',''));teamList.forEach(function(person){owner.append(new Option(person.name,person.key));});document.querySelector('#bulk-date').value=defaultSnoozeDate();if(initialOperation)document.querySelector('#bulk-operation').value=initialOperation;refreshBulkPreview();bulkDialog.showModal();}
    document.querySelector('#bulk-confirm').addEventListener('click',async function(){
      const button=this;button.disabled=true;const plan=bulkPlan.slice();const isUndo=bulkUndoMode;bulkDialog.close();const results=[];
      for(const entry of plan){try{const item=boardItems.find(function(row){return row.id===entry.id;});if(!item)throw new Error('Card no longer available');if(isUndo&&!bulkUndoPayload(entry,item,receiptFor(entry)))throw new Error('The card changed. Undo skipped.');const command=await postAction(entry.payload);if(entry.payload.operation==='done'){item.status='done';item.pending=false;}results.push(Object.assign({},entry,{command_id:command.id}));selectedCards.delete(String(entry.id));}catch(error){results.push(Object.assign({},entry,{error:error.message}));}}
      bulkLast=isUndo?[]:results;document.querySelector('#bulk-status').textContent=results.filter(function(entry){return entry.command_id;}).length+' commands queued. '+results.filter(function(entry){return entry.error;}).map(function(entry){return '#'+entry.id+': '+entry.error;}).join(' ');showToast(results.some(function(entry){return entry.command_id;})?'Bulk request queued. Check the per-card receipts for completion.':'No commands were queued. Review the errors.',!results.some(function(entry){return entry.command_id;}));await loadBoard();button.disabled=false;
    });
    document.querySelector('#bulk-open').addEventListener('click',function(){openBulk(false);});
    document.querySelector('#bulk-done-now').addEventListener('click',async function(){
      const button=this;button.disabled=true;
      try{
        const plan=bulkActionPlan(boardItems,selectedCards,'done','');
        const results=[];
        for(const entry of plan){
          try{const command=await postAction(entry.payload);const item=boardItems.find(function(r){return r.id===entry.id;});if(item){item.status='done';item.pending=false;}results.push(Object.assign({},entry,{command_id:command.id}));selectedCards.delete(String(entry.id));}
          catch(err){results.push(Object.assign({},entry,{error:err.message}));}
        }
        bulkLast=results;
        showToast('Marked '+results.filter(function(r){return r.command_id;}).length+' selected cards done.',false);
        render(boardItems);
        await loadBoard();
      }catch(error){showToast(error.message,true);}
      finally{button.disabled=false;}
    });
    document.querySelector('#bulk-undo').addEventListener('click',function(){openBulk(true);});document.querySelector('#bulk-cancel').addEventListener('click',function(){bulkDialog.close();});
    ['bulk-operation','bulk-owner','bulk-date'].forEach(function(id){document.querySelector('#'+id).addEventListener('change',refreshBulkPreview);});
    document.querySelector('#select-visible').addEventListener('click',function(){visibleBoardItems().filter(function(item){return item.status!=='done';}).forEach(function(item){selectedCards.add(String(item.id));});render(boardItems);});
    document.querySelector('#clear-selected').addEventListener('click',function(){selectedCards.clear();render(boardItems);});
    const filterFields={query:'board-search',owner:'board-owner',client:'board-client',claim:'board-claim',urgency:'board-urgency',due:'board-due',status:'board-status',sort:'board-sort'};
    Object.keys(filterFields).forEach(function(key){document.querySelector('#'+filterFields[key]).addEventListener('input',function(){filters[key]=this.value;render(boardItems);});});
    document.querySelector('#board-clear').addEventListener('click',function(){Object.keys(filterFields).forEach(function(key){filters[key]=key==='sort'?'urgent':'';document.querySelector('#'+filterFields[key]).value=filters[key];});filters.quick='';if(boardFilter==='mine')boardFilter='all';render(boardItems);});
    document.querySelectorAll('.quick-filters [data-quick]').forEach(function(btn){
      btn.addEventListener('click',function(){
        const q = btn.dataset.quick || '';
        if (q === 'mine') { switchView('mine'); return; }
        if (boardFilter === 'mine') { boardFilter = 'all'; showMineButton.setAttribute('aria-pressed','false'); showBoardButton.setAttribute('aria-pressed','true'); }
        filters.quick = (filters.quick === q && q !== '') ? '' : q;
        render(boardItems);
      });
    });
    document.querySelector('#filter-ready-close').addEventListener('click',function(){
      filters.quick = filters.quick === 'ready' ? '' : 'ready';
      render(boardItems);
    });
    document.querySelector('#close-all-handled').addEventListener('click',async function(){
      const button = this;
      const candidates = boardItems.filter(onBoard).filter(isAutoResolvedCandidate);
      if (!candidates.length) return;
      button.disabled = true;
      try {
        const response = await fetch('/api/board/auto-close-handled', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ ids: candidates.map(function(item){ return item.id; }) }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not auto-close handled cards');
        candidates.forEach(function(item){ item.status = 'done'; item.pending = false; });
        render(boardItems);
        renderChecked();
        showToast('Auto-closed ' + (result.closed_count || candidates.length) + ' handled email threads.', false);
        await loadBoard();
      } catch (error) {
        showToast(error.message || 'Auto-close failed', true);
      } finally {
        button.disabled = false;
      }
    });
    document.querySelector('#board-density').addEventListener('change',function(){board.dataset.density=this.value;render(boardItems);try{localStorage.setItem('aries-board-density',this.value);}catch(error){};});
    try{const density=localStorage.getItem('aries-board-density');if(density==='compact'){board.dataset.density=density;document.querySelector('#board-density').value=density;}}catch(error){}
    document.querySelector('#show-exceptions').addEventListener('click',function(){switchView('exceptions');});
    document.querySelector('#detail-close').addEventListener('click',function(){detailDialog.close();});detailDialog.addEventListener('close',function(){detailId=null;++detailGeneration;});
    function handleBoardLink(){if(deepLinkHandled)return;const params=new URLSearchParams(location.search);if(params.get('view')==='todos')return;const id=params.get('card');if(id){const item=boardItems.find(function(row){return String(row.id)===id;});deepLinkHandled=true;if(item)openCardDetail(item.id);else showToast('This card is not in the published board.',true);}}
    function handleTodoLink(){if(deepLinkHandled)return;const id=new URLSearchParams(location.search).get('task');if(!id)return;const row=Array.from(todoList.querySelectorAll('[data-task-id]')).find(function(node){return node.dataset.taskId===id;});deepLinkHandled=true;if(row){row.classList.add('focus-target');row.tabIndex=-1;row.focus();row.scrollIntoView({block:'center'});}else showToast('This task is not in the published To-Do catalogue.',true);}
`
