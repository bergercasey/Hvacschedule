(function(){
  const DAYS=['Mon','Tue','Wed','Thu','Fri']; const pad2=n=>String(n).padStart(2,'0');
  function isoWeekKey(d=new Date()){
    const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
    x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));
    const y0=new Date(Date.UTC(x.getUTCFullYear(),0,1));
    const wk=Math.ceil((((x - y0)/86400000)+1)/7);
    return `${x.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
  }
  function collectWeekFlat(){
    const out={}, jobs=document.querySelectorAll('.job-input'),
    helpers=document.querySelectorAll('.helper-input'),
    crewPTO=document.querySelectorAll('.pto-box'),
    helperPTO=document.querySelectorAll('.helper-pto-box');
    for(let i=0;i<jobs.length;i++){
      const row=Math.floor(i/5)+1, day=DAYS[i%5], r=pad2(row), base=`${day}:${r}`;
      if(jobs[i]?.value) out[`${base}:job`]=jobs[i].value;
      if(helpers[i]?.value) out[`${base}:helper`]=helpers[i].value;
      if(crewPTO[i]?.checked) out[`${base}:pto`]=true;
      if(helperPTO[i]?.checked) out[`${base}:helperPto`]=true;
    }
    return out;
  }
  function applyWeek(data){
    const jobs=document.querySelectorAll('.job-input'),
    helpers=document.querySelectorAll('.helper-input'),
    crewPTO=document.querySelectorAll('.pto-box'),
    helperPTO=document.querySelectorAll('.helper-pto-box');
    Object.entries(data||{}).forEach(([k,v])=>{
      const m=k.match(/^(Mon|Tue|Wed|Thu|Fri):(\d{2}):(job|helper|pto|helperPto)$/);
      if(!m) return;
      const dayIdx=DAYS.indexOf(m[1]); const row=parseInt(m[2],10)-1; const idx=row*5+dayIdx;
      if(m[3]==='job'&&jobs[idx]) jobs[idx].value=String(v);
      if(m[3]==='helper'&&helpers[idx]) helpers[idx].value=String(v);
      if(m[3]==='pto'&&crewPTO[idx]) crewPTO[idx].checked=!!v;
      if(m[3]==='helperPto'&&helperPTO[idx]) helperPTO[idx].checked=!!v;
    });
  }
  async function saveNow(){
    const weekKey=isoWeekKey();
    const res=await fetch('/api/save-week',{method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ weekKey, data: collectWeekFlat() })});
    const txt=await res.text().catch(()=> '');
    if(!res.ok) console.log('save-week failed', res.status, txt);
    else console.log('save-week ok', res.status);
  }
  async function loadNow(){
    const weekKey=isoWeekKey();
    const res=await fetch(`/api/load-week?weekKey=${encodeURIComponent(weekKey)}`);
    const json=await res.json().catch(()=> ({}));
    if(json && json.ok) applyWeek(json.data||{});
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', loadNow, {once:true}); }
  else { loadNow(); }
  let t=null;
  document.addEventListener('input', (e)=>{
    if(e.target.matches('.job-input,.helper-input')){ clearTimeout(t); t=setTimeout(saveNow, 900); }
  }, {passive:true});
  document.addEventListener('change', (e)=>{
    if(e.target.matches('.pto-box,.helper-pto-box')){ clearTimeout(t); t=setTimeout(saveNow, 900); }
  }, {passive:true});
  window.saveNow = saveNow; window.loadNow = loadNow;
})();