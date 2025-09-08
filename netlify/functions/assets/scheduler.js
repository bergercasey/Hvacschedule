
/* HVAC Scheduler — minimal, clean controller
   How to use:
   1) Wrap ONLY your weekly grid (Mon–Fri cells) with: <div id="week-grid"> ... </div>
      Do NOT include Leads/Apprentices/Floaters/Todo inside this wrapper.
   2) Make sure inputs inside the grid use these classes:
      - job inputs:     .job-input  (or input[placeholder="Job"])
      - helper inputs:  .helper-input  (or input[placeholder="Helper"])
      - PTO checkboxes: .pto-box
      - Helper PTO:     .helper-pto-box
   3) Add one line before </body>:
      <script src="assets/scheduler.js" defer></script>
   4) Optional: calendar
      - <input type="date" id="calendar">
      - or clickable elements with data-date="YYYY-MM-DD"
*/

(function(){
  const LOG = (m,o)=> (window.addLog ? addLog(`${m}${o?` ${JSON.stringify(o)}`:''}`)
                                      : console.log(`[HVAC] ${m}`, o||''));

  const GRID_ID = 'week-grid'; // change if you prefer a different id
  const SELECTORS = {
    job:       '.job-input, input[placeholder="Job"]',
    helper:    '.helper-input, input[placeholder="Helper"]',
    pto:       '.pto-box',
    helperPto: '.helper-pto-box',
    lead:      '.lead-input',
    appr:      '.apprentice-input',
    floater:   '.floater-name',
    todo:      '.todo-job'
  };
  const DAYS=['Mon','Tue','Wed','Thu','Fri'];
  const pad2 = n => String(n).padStart(2,'0');

  function mondayOf(d){ const x=new Date(d); x.setHours(0,0,0,0); const wd=x.getDay(); const diff=(wd===0?-6:1-wd); x.setDate(x.getDate()+diff); return x; }
  function isoWeekKeyFromDate(d){
    const x=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));
    const y0=new Date(Date.UTC(x.getUTCFullYear(),0,1));
    const wk=Math.ceil((((x-y0)/86400000)+1)/7);
    return `${x.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
  }

  const state = {
    monday: (()=>{
      const s = localStorage.getItem('displayedMonday');
      return s ? new Date(s) : mondayOf(new Date());
    })(),
    setMonday(d){
      this.monday = mondayOf(d);
      localStorage.setItem('displayedMonday', this.monday.toISOString());
      loadWeekFor(this.monday);
    },
    weekKey(){ return isoWeekKeyFromDate(this.monday); }
  };
  window.hvacSetWeek = (input)=> { const d = input instanceof Date ? input : new Date(input); state.setMonday(d); };

  function getGrid(){
    return document.getElementById(GRID_ID) || document.querySelector('[data-week-grid]');
  }

  const Q = (root, sel) => Array.from(root.querySelectorAll(sel));

  function getGridEls(grid){
    return {
      jobs:   Q(grid, SELECTORS.job),
      helpers:Q(grid, SELECTORS.helper),
      pto:    Q(grid, SELECTORS.pto),
      hpto:   Q(grid, SELECTORS.helperPto)
    };
  }

  function collectWeekFlat(grid){
    const {jobs, helpers, pto, hpto} = getGridEls(grid);
    const out={}, max=Math.max(jobs.length, helpers.length, pto.length, hpto.length);
    for(let i=0;i<max;i++){
      const row=Math.floor(i/5)+1, day=DAYS[i%5], r=String(row).padStart(2,'0'), base=`${day}:${r}`;
      if(jobs[i]   && jobs[i].value)    out[`${base}:job`]       = jobs[i].value;
      if(helpers[i]&& helpers[i].value) out[`${base}:helper`]    = helpers[i].value;
      if(pto[i]    && pto[i].checked)   out[`${base}:pto`]       = true;
      if(hpto[i]   && hpto[i].checked)  out[`${base}:helperPto`] = true;
    }
    return out;
  }

  function clearWeekGrid(grid){
    const {jobs, helpers, pto, hpto} = getGridEls(grid);
    jobs.forEach(el=> el.value='');
    helpers.forEach(el=> el.value='');
    pto.forEach(el=> { const was=el.checked; el.checked=false; if(was) el.dispatchEvent(new Event('change',{bubbles:true})); });
    hpto.forEach(el=> { const was=el.checked; el.checked=false; if(was) el.dispatchEvent(new Event('change',{bubbles:true})); });
  }

  function applyWeekData(grid, data){
    clearWeekGrid(grid);
    const {jobs, helpers, pto, hpto} = getGridEls(grid);
    Object.entries(data||{}).forEach(([k,v])=>{
      const m=k.match(/^(Mon|Tue|Wed|Thu|Fri):(\d{2}):(job|helper|pto|helperPto)$/);
      if(!m) return;
      const dayIdx=['Mon','Tue','Wed','Thu','Fri'].indexOf(m[1]), row=parseInt(m[2],10)-1, idx=row*5+dayIdx;
      if(m[3]==='job'      && jobs[idx])   jobs[idx].value = String(v);
      if(m[3]==='helper'   && helpers[idx])helpers[idx].value = String(v);
      if(m[3]==='pto'      && pto[idx])   { pto[idx].checked = !!v;  pto[idx].dispatchEvent(new Event('change',{bubbles:true})); }
      if(m[3]==='helperPto'&& hpto[idx])  { hpto[idx].checked= !!v;  hpto[idx].dispatchEvent(new Event('change',{bubbles:true})); }
    });
  }

  async function apiLoadWeek(weekKey){
    const res = await fetch(`/.netlify/functions/load-week?weekKey=${encodeURIComponent(weekKey)}`);
    if (!res.ok) { LOG('load fail', {status:res.status}); return {}; }
    const json = await res.json().catch(()=>({}));
    return (json && json.ok) ? (json.data||{}) : {};
  }
  async function apiSaveWeek(weekKey, data){
    const res = await fetch('/.netlify/functions/save-week', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ weekKey, data })
    });
    const txt = await res.text().catch(()=>'');
    LOG('save', {status:res.status, ok:res.ok, body:txt.slice(0,150)});
    return res.ok;
  }
  async function apiWipeWeek(weekKey){
    const res = await fetch('/.netlify/functions/save-week', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ weekKey, wipe:true })
    });
    const txt = await res.text().catch(()=>'');
    LOG('wipe', {status:res.status, ok:res.ok, body:txt.slice(0,150)});
    return res.ok;
  }

  let applying=false, tWeek=null;
  function debounceSave(grid){
    clearTimeout(tWeek);
    tWeek = setTimeout(async ()=>{
      if (applying) return;
      const ok = await apiSaveWeek(state.weekKey(), collectWeekFlat(grid));
      if (!ok) LOG('autosave failed');
    }, 800);
  }

  function bindGrid(grid){
    // autosave on edits in the grid only
    grid.addEventListener('input', (e)=>{
      if (e.target.matches(SELECTORS.job) || e.target.matches(SELECTORS.helper)) debounceSave(grid);
    }, {passive:true});
    grid.addEventListener('change', (e)=>{
      if (e.target.matches(SELECTORS.pto) || e.target.matches(SELECTORS.helperPto)) debounceSave(grid);
    }, {passive:true});
  }

  async function loadWeekFor(dateLike){
    const grid = getGrid(); if (!grid) return;
    applying = true;
    const data = await apiLoadWeek(isoWeekKeyFromDate(dateLike));
    applyWeekData(grid, data);
    applying = false;
  }

  // Reset button only clears the grid and writes an empty week for *current* week
  function bindReset(grid){
    const btn = document.getElementById('resetBtn');
    if (!btn) return;
    btn.addEventListener('click', async (e)=>{
      e.preventDefault();
      clearWeekGrid(grid);
      await apiWipeWeek(state.weekKey());
    });
  }

  // Week nav (optional)
  function bindNav(){
    document.getElementById('prevWeekBtn')?.addEventListener('click', (e)=>{
      e.preventDefault(); const d=new Date(state.monday); d.setDate(d.getDate()-7); state.setMonday(d);
    });
    document.getElementById('nextWeekBtn')?.addEventListener('click', (e)=>{
      e.preventDefault(); const d=new Date(state.monday); d.setDate(d.getDate()+7); state.setMonday(d);
    });
    document.getElementById('todayBtn')?.addEventListener('click', (e)=>{
      e.preventDefault(); state.setMonday(new Date());
    });
  }

  // Calendar hookup (input#calendar or any [data-date="YYYY-MM-DD"])
  function bindCalendar(){
    const p = document.getElementById('calendar') || document.getElementById('weekPicker');
    if (p) p.addEventListener('change', e => window.hvacSetWeek(e.target.value));
    document.addEventListener('click', (e)=>{
      const cell = e.target.closest('[data-date]'); if (cell) window.hvacSetWeek(cell.getAttribute('data-date'));
    });
  }

  // Debug buttons (optional convenience)
  function addDebugButtons(grid){
    if (document.getElementById('dbg-tools')) return;
    const bar=document.querySelector('.toolbar')||document.body;
    const wrap=document.createElement('span'); wrap.id='dbg-tools'; wrap.style.marginLeft='8px';
    const b1=document.createElement('button'); b1.textContent='Save NOW';
    const b2=document.createElement('button'); b2.textContent='Load NOW'; b2.style.marginLeft='4px';
    wrap.appendChild(b1); wrap.appendChild(b2); bar.appendChild(wrap);
    b1.addEventListener('click', ()=> apiSaveWeek(state.weekKey(), collectWeekFlat(grid)));
    b2.addEventListener('click', ()=> loadWeekFor(state.monday));
  }

  // Boot
  document.addEventListener('DOMContentLoaded', ()=>{
    const grid = getGrid();
    if (!grid) { LOG('week grid not found — wrap your Mon–Fri grid in <div id="week-grid">'); return; }
    bindGrid(grid);
    bindReset(grid);
    bindNav();
    bindCalendar();
    addDebugButtons(grid);
    loadWeekFor(state.monday);
  });
})();
