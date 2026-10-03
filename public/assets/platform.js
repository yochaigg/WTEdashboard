'use strict';
/* ================= Platform: roles, alarm rules and notifications, sites, ask the plant, app install ================= */

/* =====================================================================
   Roles
   ===================================================================== */
const ROLES={
  manager:{label:'Plant manager',desc:'Everything, including settings and audit reports',pages:'*',acts:['ack','rules','audit','maint','handover','edit','sites']},
  operator:{label:'Operator',desc:'Plant, alarms, maintenance and shift handover',pages:['plant','events','alarms','maint','shifts','suppliers','balance','grid','ask'],acts:['ack','maint','handover']},
  auditor:{label:'Auditor',desc:'Carbon data, event log and balances, read only',pages:['plant','events','carbon','balance','suppliers','impact','ask'],acts:['audit']},
  investor:{label:'Investor',desc:'Finance, what-if, impact and sites, read only',pages:['plant','finance','whatif','grid','carbon','impact','sites','ask'],acts:[]}
};
let USER=lsGet('wte_user',null);
function role(){return USER&&ROLES[USER.role]?ROLES[USER.role]:ROLES.manager;}
function can(act){return role().acts.includes(act);}
function canSee(p){const r=role();return r.pages==='*'||r.pages.includes(p);}
function firstPage(){return Object.keys(PAGES).find(canSee)||'plant';}
function applyRole(){
  const r=role(),nm=USER&&USER.name?USER.name:r.label;
  $('#whoName').textContent=nm;$('#whoRole').textContent=USER?r.label:'Choose a role';$('#whoInit').textContent=(nm||'?').trim().charAt(0).toUpperCase();
  $('#btnPkg').hidden=!can('audit');
  document.querySelectorAll('#screenCarbon input,#screenCarbon select,[data-page="carbon"] .form input,[data-page="carbon"] .form select,#fPriceMode button').forEach(i=>i.disabled=!can('edit'));
  $('#tpd').disabled=!can('edit');
  document.querySelectorAll('section.page [id^="pg_"]').forEach(el=>{el._built=false;});
}
const LG={sel:null};
function openLogin(closable){
  LG.sel=USER?USER.role:null;$('#loginName').value=USER&&USER.name||'';
  $('#roleList').innerHTML=Object.entries(ROLES).map(([k,r])=>`<button data-r="${k}" class="${LG.sel===k?'on':''}"><b>${r.label}</b><span>${r.desc}</span></button>`).join('');
  $('#loginX').hidden=!closable;$('#loginMsg').textContent='';$('#login').hidden=false;
}
$('#roleList').addEventListener('click',e=>{const b=e.target.closest('button[data-r]');if(!b)return;LG.sel=b.dataset.r;$('#roleList').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));});
$('#loginGo').addEventListener('click',()=>{
  if(!LG.sel){$('#loginMsg').textContent='Pick a role to continue.';$('#loginMsg').style.color='var(--amber)';return;}
  USER={role:LG.sel,name:$('#loginName').value.trim()};lsSet('wte_user',USER);$('#login').hidden=true;addOp('Signed in as '+ROLES[USER.role].label+(USER.name?' ('+USER.name+')':''));applyRole();route();});
$('#loginX').addEventListener('click',()=>{$('#login').hidden=true;});
$('#whoBtn').addEventListener('click',()=>openLogin(true));

/* =====================================================================
   Alarm rules and notifications
   ===================================================================== */
const NT=Object.assign({email:'',whatsapp:'',sms:'',hook:'',onlyCrit:false,device:false,log:[]},lsGet('wte_notify',{}));
const saveNT=()=>{NT.log=NT.log.slice(-60);lsSet('wte_notify',NT);};
function loadRules(){const c=lsGet('wte_rules',{});RULES.forEach(r=>{const x=c[r.id];if(x){if('warn' in x)r.warn=x.warn;if('crit' in x)r.crit=x.crit;if('on' in x)r.on=x.on;}r.notify=x&&'notify' in x?x.notify:true;});rulesChanged();}
function rulesChanged(){
  ALERT_FASTSCAN=RULES.every(r=>r.warn===r.def.warn&&r.crit===r.def.crit);
  alertDayCache.clear();dropCache.clear();alertCache={k:0,eps:[]};
}
function saveRules(){const c={};RULES.forEach(r=>{c[r.id]={warn:r.warn,crit:r.crit,on:r.on,notify:r.notify};});lsSet('wte_rules',c);}
const NSEEN=new Set();let nFirst=true;
function onAlertsScanned(eps){
  if(nFirst){eps.forEach(e=>NSEEN.add(e.key));nFirst=false;return;}
  eps.filter(e=>e.end==null&&!NSEEN.has(e.key)).forEach(e=>{NSEEN.add(e.key);notifyAlert(e,false);});
}
function notifyAlert(e,test){
  const r=e.rule;if(!test&&(!r.notify||(NT.onlyCrit&&e.sev!=='crit')))return;
  const txt=(e.sev==='crit'?'CRITICAL: ':'Warning: ')+r.name+', '+fmt(e.peak,r.dec)+' '+r.unit+' at '+hhmm(e.start);
  const to={email:emails(NT.email),whatsapp:emails(NT.whatsapp),sms:emails(NT.sms)};
  let status='logged';
  if(NT.device&&'Notification' in window&&Notification.permission==='granted'){try{new Notification('Central Orbit plant',{body:txt,icon:'assets/icon.svg',tag:e.key});status='shown on this device';}catch(x){}}
  if(NT.hook){
    if(DATA_SOURCE==='SIMULATED'&&!test)status+=', webhook dry run';
    else{fetch(NT.hook,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify({event:'plant_alert',test:!!test,severity:e.sev,rule:r.name,value:e.peak,unit:r.unit,time:new Date(e.start).toISOString(),message:txt,to})}).catch(()=>{});status+=', sent to webhook';}
  }
  NT.log.push({t:Date.now(),txt,status,test:!!test});saveNT();
  if(state.screen==='alarms')renderAlarms(true);
}
function renderAlarms(onlyLog){
  const host=$('#pg_alarms'),ed=can('rules');
  if(onlyLog&&host._built){$('#ntLog').innerHTML=ntLogHtml();return;}
  if(!host._built){
    host._h=null;host.innerHTML=`<p class="lead">Set the limits that raise alerts, and who hears about them. Warning and critical limits apply to the whole history, so the alert list, event log and analysis update as soon as you save.</p>
    <div class="card"><h3>Limits</h3><div class="scrollx" id="rtab"></div>
      <div class="mact">${ed?'<button class="btn pri" id="rSave">Save limits</button><button class="btn" id="rReset">Back to defaults</button>':''}<span class="status" id="rMsg"></span></div>
      ${ed?'':'<div class="note">Your role can see the limits. A plant manager can change them.</div>'}</div>
    <div class="grid2 mt"><div class="card"><h3>Who gets notified</h3><div class="fgrid">
      <label class="field">Email addresses<input id="ntEmail" placeholder="ops@plant.com, manager@plant.com"></label>
      <label class="field">WhatsApp numbers<input id="ntWa" placeholder="+598 99 123 456"></label>
      <label class="field">SMS numbers<input id="ntSms" placeholder="+598 99 123 456"></label>
      <label class="field">Webhook URL<input id="ntHook" placeholder="https://hook.eu1.make.com/..."></label></div>
      <label class="chk" style="color:var(--text)"><input type="checkbox" id="ntCrit"> Only critical alerts</label>
      <label class="chk" style="color:var(--text)"><input type="checkbox" id="ntDev"> Show alerts as notifications on this device</label>
      <div class="mact"><button class="btn" id="ntTest">Send a test alert</button><span class="status" id="ntMsg"></span></div>
      <div class="note">A web page cannot send WhatsApp, SMS or email by itself. The webhook passes each alert, with the recipients above, to Make, Zapier or n8n, which sends it through Twilio, WhatsApp Business or email. While the data is simulated, real alerts are logged as a dry run. The test button always sends.</div></div>
    <div class="card"><h3>Notification log</h3><div id="ntLog" class="nlog"></div></div></div>`;
    host._built=true;
    [['ntEmail','email'],['ntWa','whatsapp'],['ntSms','sms'],['ntHook','hook']].forEach(([id,k])=>{const i=$('#'+id);i.value=NT[k];i.disabled=!ed;i.addEventListener('change',()=>{NT[k]=i.value.trim();saveNT();});});
    $('#ntCrit').checked=NT.onlyCrit;$('#ntCrit').disabled=!ed;$('#ntCrit').addEventListener('change',e=>{NT.onlyCrit=e.target.checked;saveNT();});
    $('#ntDev').checked=NT.device;$('#ntDev').addEventListener('change',async e=>{
      if(e.target.checked&&'Notification' in window&&Notification.permission!=='granted'){const p=await Notification.requestPermission();if(p!=='granted'){e.target.checked=false;$('#ntMsg').textContent='Notifications are blocked for this site in the browser settings.';return;}}
      if(e.target.checked&&!('Notification' in window)){e.target.checked=false;$('#ntMsg').textContent='This browser does not support notifications.';return;}
      NT.device=e.target.checked;saveNT();$('#ntMsg').textContent=NT.device?'Alerts will show on this device while the console is open.':'';});
    $('#ntTest').addEventListener('click',()=>{const r=RULES[0];notifyAlert({key:'test'+Date.now(),rule:r,sev:'warn',peak:r.warn,start:Date.now(),end:null},true);$('#ntMsg').textContent=NT.hook?'Test sent to the webhook.':'Test logged. Add a webhook URL to send it on.';});
    if(ed){
      $('#rSave').addEventListener('click',()=>{const rows=host.querySelectorAll('tr[data-r]');let bad='';rows.forEach(tr=>{const r=RULES.find(x=>x.id===tr.dataset.r),w=tr.querySelector('[data-k=warn]').value,c=tr.querySelector('[data-k=crit]');
        const wv=w===''?null:parseFloat(w),cv=c&&c.value!==''?parseFloat(c.value):null;
        if(wv!=null&&cv!=null&&(r.dir==='max'?cv<wv:cv>wv))bad=r.name;
        r.warn=wv;r.crit=c?cv:r.crit;r.on=tr.querySelector('[data-k=on]').checked;r.notify=tr.querySelector('[data-k=notify]').checked;});
        if(bad){$('#rMsg').textContent='Check '+bad+': the critical limit must be beyond the warning limit.';$('#rMsg').style.color='var(--amber)';return;}
        saveRules();rulesChanged();addOp('Alarm limits changed'+(USER&&USER.name?' by '+USER.name:''));$('#rMsg').textContent='Saved. Alert history recalculated.';$('#rMsg').style.color='var(--green)';tick(true);});
      $('#rReset').addEventListener('click',()=>{RULES.forEach(r=>{r.warn=r.def.warn;r.crit=r.def.crit;r.on=true;r.notify=true;});saveRules();rulesChanged();addOp('Alarm limits reset to defaults');$('#rMsg').textContent='Defaults restored.';$('#rMsg').style.color='var(--green)';host._built=false;renderAlarms();});
    }
  }
  const cur=D?D.cur:plant(Date.now()),ed2=ed?'':'disabled';
  const tb=$('#rtab');
  if(!tb._built){
    tb._h=null;tb.innerHTML='<table class="rtable"><tr><th>On</th><th>Alert</th><th class="r">Now</th><th class="r">Warning at</th><th class="r">Critical at</th><th>Unit</th><th>Notify</th><th>Status</th></tr>'+RULES.map(r=>`<tr data-r="${r.id}"><td><input type="checkbox" data-k="on" ${r.on?'checked':''} ${ed2}></td><td>${r.name}<div class="muted" style="font-size:12px">${r.dir==='min'?'alerts when below':'alerts when above'}${r.perTpd?', limit quoted at 200 t/day and scaled to throughput':''}</div></td><td class="r num" data-now></td><td class="r"><input type="number" step="any" data-k="warn" value="${r.warn==null?'':r.warn}" ${ed2}></td><td class="r">${r.def.crit==null&&r.crit==null?'<span class="muted">none</span>':`<input type="number" step="any" data-k="crit" value="${r.crit==null?'':r.crit}" ${ed2}>`}</td><td>${r.unit}</td><td><input type="checkbox" data-k="notify" ${r.notify?'checked':''} ${ed2}></td><td data-st></td></tr>`).join('')+'</table>';
    tb._built=true;
  }
  RULES.forEach(r=>{const tr=tb.querySelector(`tr[data-r="${r.id}"]`);if(!tr)return;const v=r.get(cur),sv=r.on?ruleSev(r,v):null;tr.querySelector('[data-now]').textContent=fmt(v,r.dec);const st=tr.querySelector('[data-st]');const h0=r.on?`<span class="pill ${sv||'ok'}">${sv==='crit'?'critical':sv==='warn'?'warning':'normal'}</span>${r.warn!==r.def.warn||r.crit!==r.def.crit?' <span class="chg">changed</span>':''}`:'<span class="muted">off</span>';st.innerHTML=h0;});
  $('#ntLog').innerHTML=ntLogHtml();
}
function ntLogHtml(){return NT.log.length?[...NT.log].reverse().slice(0,25).map(x=>`<div><b>${dt(x.t)}</b> ${esch(x.txt)}<div class="muted">${x.test?'test, ':''}${esch(x.status)}</div></div>`).join(''):'<div class="empty">No notifications yet.</div>';}
PAGES.alarms={title:'Alarm rules',period:false,render:()=>renderAlarms(),enter:()=>{const h=$('#pg_alarms');h._built=false;},sub:()=>RULES.filter(r=>r.on).length+' of '+RULES.length+' rules on'};

/* =====================================================================
   Sites (portfolio)
   ===================================================================== */
const SITE_DEF=[
  {id:'s1',name:'Plant 1',place:'This plant',tpd:0,stage:'Operating',self:true},
  {id:'s2',name:'Plant 2',place:'Location to be set',tpd:150,stage:'Operating'},
  {id:'s3',name:'Plant 3',place:'Location to be set',tpd:300,stage:'Construction',cod:'2027'},
  {id:'s4',name:'Plant 4',place:'Location to be set',tpd:250,stage:'Development',cod:'2028'}];
let SITES=lsGet('wte_sites',SITE_DEF);
function siteDays(s,n){   /* daily MWh for the last n days; other sites are scaled from this plant */
  const now=Date.now(),out=[];const f=s.self?1:(s.tpd/TPD)*(0.9+0.12*hash(s.id.length*7.1+s.tpd*0.13));
  for(let i=n-1;i>=0;i--){const ds=dayInfo(now-i*DAY).start;const a=dayAcc(ds,now);const noise=s.self?1:1+0.06*(hash(ds/DAY*1.3+s.tpd)-0.5);out.push({t:ds,mwh:a.s.kwh/1000*f*noise,waste:a.s.waste*(s.self?1:s.tpd/TPD),cr:credits(a).net*f*noise});}
  return out;
}
function renderSites(){
  const host=$('#pg_sites'),ed=can('sites');
  const tpdOf=s=>s.self?TPD:s.tpd;
  const op=SITES.filter(s=>s.stage==='Operating'),totT=SITES.reduce((a,s)=>a+tpdOf(s),0),opT=op.reduce((a,s)=>a+tpdOf(s),0);
  const mwOf=t=>Math.max(1,Math.ceil((t/200)*10900*1.05/ENG_KW))*ENG_KW/1000;
  const stats=op.map(s=>{const d=siteDays(s,14),y=d.reduce((a,x)=>a+x.cr,0)/14*360;return {s,d,y};});
  const crY=stats.reduce((a,x)=>a+x.y,0);
  const stages=['Operating','Construction','Development'],scol={Operating:'var(--green)',Construction:'var(--amber)',Development:'var(--muted)'};
  host.innerHTML=`<p class="lead">All Central Orbit plants on one board. Plant 1 is this plant. The other plants are placeholders: their figures are scaled from Plant 1 by size until their own data is connected.</p>
  <div class="kpis" id="siK"></div>
  <div class="card mt"><h3>Capacity by stage <span>t/day</span></h3><div style="display:flex;height:30px;border-radius:8px;overflow:hidden;margin:6px 0 8px">${stages.map(st=>{const t=SITES.filter(s=>s.stage===st).reduce((a,s)=>a+tpdOf(s),0);return t?`<div title="${st}: ${fmt(t)} t/day" style="flex:${t};background:${scol[st]};opacity:.75"></div>`:'';}).join('')}</div>
  <div class="legend">${stages.map(st=>`<span><i style="background:${scol[st]}"></i>${st} ${fmt(SITES.filter(s=>s.stage===st).reduce((a,s)=>a+tpdOf(s),0))} t/day</span>`).join('')}</div></div>
  <div class="sites mt">${SITES.map((s,i)=>{const x=stats.find(z=>z.s===s);const today=x?x.d[x.d.length-1]:null;
    return `<div class="site${s.self?' this':''}"><h3><span>${esch(s.name)}</span><span class="stage${s.stage==='Operating'?' op':''}">${s.stage}${s.cod&&s.stage!=='Operating'?', '+esch(s.cod):''}</span></h3><div class="muted">${esch(s.place)}, ${fmt(tpdOf(s))} t/day, ${fmt(mwOf(tpdOf(s)),1)} MW installed</div>
    ${x?`<div class="row3"><div><span>Today, MWh</span><b>${fmt(today.mwh,1)}</b></div><div><span>Daily average, MWh</span><b>${fmt(x.d.reduce((a,z)=>a+z.mwh,0)/14,1)}</b></div><div><span>Credits a year, t</span><b>${fmt(x.y)}</b></div></div><canvas id="spark_${s.id}"></canvas>`:`<div class="muted">No production yet.</div>`}
    <div class="mact">${s.self?'<button class="btn sm" data-go="plant">Open plant</button>':''}${ed&&!s.self?`<button class="btn sm" data-ed="${i}">Edit</button><button class="btn sm" data-del="${i}">Remove</button>`:''}</div></div>`;}).join('')}</div>
  ${ed?'<div class="mact"><button class="btn" id="siAdd">Add a site</button><button class="btn" id="siReset">Reset the list</button></div>':''}
  <div class="card mt" id="siForm" hidden></div>`;
  renderKpis($('#siK'),[{l:'Sites',u:'',v:SITES.length,d:0,s:op.length+' operating'},{l:'Operating capacity',u:'t/day',v:opT,d:0,s:fmt(totT)+' t/day including pipeline',c:'var(--waste)'},{l:'Operating power',u:'MW',v:op.reduce((a,s)=>a+mwOf(tpdOf(s)),0),d:1,s:'installed engine capacity',c:'var(--power)'},{l:'Credits a year',u:'tCO2e',v:crY,d:0,s:'operating plants, 14-day run rate',c:'var(--carbon)'}]);
  stats.forEach(x=>{const cv=document.getElementById('spark_'+x.s.id);if(cv)drawSpark(cv,x.d.map(z=>z.mwh));});
}
function drawSpark(cv,vals){const dpr=devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;if(!W)return;cv.width=W*dpr;cv.height=H*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);
  const lo=Math.min(...vals)*0.9,hi=Math.max(...vals)*1.05||1,X=i=>i/(vals.length-1)*(W-4)+2,Y=v=>H-4-(v-lo)/(hi-lo||1)*(H-8);
  c.strokeStyle='#ff8f45';c.lineWidth=2;c.beginPath();vals.forEach((v,i)=>i?c.lineTo(X(i),Y(v)):c.moveTo(X(i),Y(v)));c.stroke();
  c.lineTo(X(vals.length-1),H);c.lineTo(X(0),H);c.closePath();c.fillStyle='rgba(255,143,69,.12)';c.fill();}
$('#pg_sites').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.go){gotoScreen(b.dataset.go);return;}
  if(b.id==='siReset'){SITES=JSON.parse(JSON.stringify(SITE_DEF));lsSet('wte_sites',SITES);renderSites();return;}
  if(b.dataset.del!=null){SITES.splice(+b.dataset.del,1);lsSet('wte_sites',SITES);renderSites();return;}
  if(b.id==='siAdd'||b.dataset.ed!=null){const i=b.dataset.ed!=null?+b.dataset.ed:-1,s=i>=0?SITES[i]:{name:'Plant '+(SITES.length+1),place:'',tpd:200,stage:'Development',cod:''};
    const f=$('#siForm');f.hidden=false;f.innerHTML=`<h3>${i>=0?'Edit site':'Add a site'}</h3><div class="fgrid"><label class="field">Name<input id="sfN" value="${esch(s.name)}"></label><label class="field">Location<input id="sfP" value="${esch(s.place)}"></label><label class="field">Capacity (t/day)<input id="sfT" type="number" min="1" value="${s.tpd}"></label><label class="field">Stage<select id="sfS">${['Operating','Construction','Development'].map(x=>`<option${x===s.stage?' selected':''}>${x}</option>`).join('')}</select></label><label class="field">Start of operation<input id="sfC" value="${esch(s.cod||'')}" placeholder="e.g. 2027 Q3"></label></div><div class="mact"><button class="btn pri" id="sfSave" data-i="${i}">Save site</button><button class="btn" id="sfX">Cancel</button></div>`;f.scrollIntoView({behavior:'smooth',block:'nearest'});return;}
  if(b.id==='sfX'){$('#siForm').hidden=true;return;}
  if(b.id==='sfSave'){const i=+b.dataset.i,s={id:i>=0?SITES[i].id:'s'+Date.now(),name:$('#sfN').value.trim()||'Unnamed site',place:$('#sfP').value.trim()||'Location to be set',tpd:Math.max(1,parseFloat($('#sfT').value)||100),stage:$('#sfS').value,cod:$('#sfC').value.trim()};if(i>=0)SITES[i]=Object.assign({},SITES[i],s);else SITES.push(s);lsSet('wte_sites',SITES);renderSites();}
});
PAGES.sites={title:'Sites',period:false,still:true,render:renderSites,sub:()=>SITES.length+' plants in the portfolio'};

/* =====================================================================
   Ask the plant
   ===================================================================== */
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const DAYS_W=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const METRICS=[
  {k:'power',re:/power|electric|kw\b|kwh|mwh|energy|generat|engine|output/,label:'power',rate:'kw',unit:'MW',sc:0.001,tot:a=>a.s.kwh/1000,totU:'MWh',dec:2},
  {k:'waste',re:/waste|tons?\b|tonnes?|truck|deliver|scale/,label:'waste received',tot:a=>a.s.waste,totU:'t',dec:1,trucks:true},
  {k:'gas',re:/syngas|\bgas\b|gas flow/,label:'syngas',rate:'gasRate',unit:'Nm³/h',tot:a=>a.s.gas,totU:'Nm³',dec:0},
  {k:'briq',re:/briquet|feed|conveyor|belt/,label:'briquet feed',rate:'briqRate',unit:'t/h',sc:0.001,tot:a=>a.s.briq/1000,totU:'t',dec:1},
  {k:'reactor',re:/reactor|gasifier/,label:'reactor temperature',rate:'reactor',unit:'°C',dec:0},
  {k:'scrubber',re:/scrubber/,label:'scrubber temperature',rate:'scrubber',unit:'°C',dec:0},
  {k:'h2',re:/hydrogen|\bh2\b/,label:'hydrogen in syngas',rate:'H2',unit:'%',dec:1},
  {k:'o2',re:/oxygen|\bo2\b/,label:'oxygen in syngas',rate:'O2',unit:'%',dec:2},
  {k:'tar',re:/\btar\b|corona/,label:'tar after the corona filter',rate:'tar',unit:'mg/Nm³',dec:0},
  {k:'ash',re:/\bash\b/,label:'ash',rate:'ashRate',unit:'t/h',sc:0.001,tot:a=>a.s.ash/1000,totU:'t',dec:2},
  {k:'credits',re:/credit|carbon|co2e/,label:'net carbon credits',tot:a=>credits(a).net,totU:'tCO2e',dec:1},
  {k:'money',re:/revenue|profit|money|ebitda|earn|income|euro|€/,label:'money',money:true},
  {k:'alerts',re:/alert|alarm/,label:'alerts',alerts:true}
];
function dayStart(t){return dayInfo(t).start;}
function parseWhen(q){
  const now=Date.now();let base=null,label='';
  let m;
  if(/yesterday/.test(q)&&!(/today/.test(q)&&/compare|vs|versus|than/.test(q))){base=dayStart(now-DAY);label='yesterday';}
  else if(/today|this morning|tonight/.test(q)){base=dayStart(now);label='today';}
  if((m=q.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/))||(m=q.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2})/))){
    const d=+(isNaN(+m[1])?m[2]:m[1]),mo=MONTHS.indexOf(isNaN(+m[1])?m[1]:m[2]);let dt0=new Date(new Date(now).getFullYear(),mo,d).getTime();if(dt0>now)dt0=new Date(new Date(now).getFullYear()-1,mo,d).getTime();base=dt0;label='on '+fd(dt0);}
  else if((m=q.match(/\b(\d{1,2})\/(\d{1,2})\b/))){let dt0=new Date(new Date(now).getFullYear(),+m[2]-1,+m[1]).getTime();if(dt0>now)dt0=new Date(new Date(now).getFullYear()-1,+m[2]-1,+m[1]).getTime();base=dt0;label='on '+fd(dt0);}
  else{const wi=DAYS_W.findIndex(d=>q.includes(d));if(wi>=0){let d=new Date(dayStart(now));while(d.getDay()!==wi||d.getTime()===dayStart(now))d.setDate(d.getDate()-1);base=d.getTime();label='on '+DAYS_W[wi][0].toUpperCase()+DAYS_W[wi].slice(1)+' '+fd(base);}}
  const tm=s=>{const x=s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);if(!x)return null;let h=+x[1];if(x[3]==='pm'&&h<12)h+=12;if(x[3]==='am'&&h===12)h=0;return h*HOUR+(+(x[2]||0))*MIN;};
  if((m=q.match(/between\s+([\d:apm\s]+?)\s+and\s+([\d:apm\s]+)/))){const a=tm(m[1]),b=tm(m[2]);if(a!=null&&b!=null){let b0=base!=null?base:dayStart(now);if(b0+a>now)b0-=DAY;return {t0:b0+a,t1:Math.min(now,b0+b),label:'between '+hhmm(b0+a)+' and '+hhmm(b0+b)+(label?' '+label:'')};}}
  if((m=q.match(/\b(?:at|around|about)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/))){const a=tm(m[1]);if(a!=null){let b0=base!=null?base:dayStart(now);if(b0+a>now)b0-=DAY;const t=b0+a;return {t0:t-30*MIN,t1:Math.min(now,t+30*MIN),label:'around '+hhmm(t)+(label?' '+label:b0<dayStart(now)?' yesterday':''),point:t};}}
  if(base!=null)return {t0:base,t1:Math.min(now,base+DAY),label};
  if((m=q.match(/last\s+(\d+)\s*(hour|day|week|month)/))){const n=+m[1],u={hour:HOUR,day:DAY,week:7*DAY,month:30*DAY}[m[2]];return {t0:now-n*u,t1:now,label:'in the last '+n+' '+m[2]+(n>1?'s':'')};}
  if(/last hour|past hour/.test(q))return {t0:now-HOUR,t1:now,label:'in the last hour'};
  if(/week/.test(q))return {t0:now-7*DAY,t1:now,label:'in the last 7 days'};
  if(/month/.test(q))return {t0:now-30*DAY,t1:now,label:'in the last 30 days'};
  if(/year/.test(q))return {t0:now-365*DAY,t1:now,label:'in the last 12 months'};
  if(/\bnow\b|right now|currently|at the moment/.test(q))return {t0:now-10*MIN,t1:now,label:'right now',now:true};
  return null;
}
function accRange(t0,t1){   /* uses cached whole days where possible */
  const a=newAcc();let t=t0;
  while(t<t1){const di=dayInfo(t);if(t===di.start&&di.end<=t1){mergeAcc(a,dayAcc(di.start,Date.now()));t=di.end;}else{const e=Math.min(t1,di.end);mergeAcc(a,integrate(t,e));t=e;}}
  return a;
}
function seriesFor(M,w){
  const n=48,step=(w.t1-w.t0)/n,labels=[],vals=[];const long=w.t1-w.t0>2*DAY;
  for(let i=0;i<n;i++){const t=w.t0+step*(i+0.5);labels.push(long?new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):hhmm(t));
    if(M.rate){if(long){const a=integrate(w.t0+step*i,w.t0+step*(i+1));vals.push(avgOf(a,M.rate)*(M.sc||1));}else vals.push(plant(t)[M.rate]*(M.sc||1));}
    else if(M.trucks)vals.push(trucksBetween(w.t0+step*i,w.t0+step*(i+1)).reduce((s,k)=>s+k.tons,0));
    else vals.push(null);}
  return {labels,vals};
}
function answer(qRaw){
  const q=qRaw.toLowerCase().trim(),now=Date.now();
  const M=METRICS.find(m=>m.re.test(q));
  const why=/why|what happened|cause|explain|wrong|problem|issue|drop|dip|low\b|fell|fall|trip/.test(q);
  const ext=/peak|max|highest|maximum|lowest|minimum|\bmin\b|best|worst/.test(q);
  const cmp=/compare|vs\.?|versus|compared|than/.test(q);
  const sup=Object.keys(SUP_BASE).find(s=>q.includes(s.toLowerCase())||q.includes(s.toLowerCase().split(' ')[0]));
  let w=parseWhen(q);const res={q:qRaw,html:'',chart:null,acts:[]};
  /* plant status */
  const statusQ=/status|how is|how are|how's|running|\bok\b|going|overview|summary/.test(q)||(w&&w.now);
  if(!M&&!why&&!sup&&!statusQ){res.html='I did not catch a measurement or a time in that. Try one of the suggestions above, or name what you want and when, for example <b>power yesterday</b> or <b>alerts this week</b>.';return res;}
  if(!M&&!why&&!sup&&statusQ){
    const p=plant(now),act=alertCache.eps.filter(e=>e.end==null),nx=nextShutdown(now);
    res.html=p.shutdown?'The plant is on a <b>planned shutdown</b> today and restarts at midnight.':`The plant is <b>running</b>: ${fmt(p.kw/1000,2)} MW from ${ENGINES} engines, reactor at ${fmt(p.reactor)} °C, ${fmt(p.briqRate/1000,2)} t/h of briquets going in. `+(act.length?`<b>${act.length} active alert${act.length>1?'s':''}</b>: ${act.map(e=>e.rule.name).join(', ')}.`:'No active alerts.')+(nx?` Next planned shutdown in ${daysTo(nx.start)} days.`:'');
    res.acts.push(['Open plant',()=>gotoScreen('plant')]);return res;}
  if(!w)w=why?{t0:now-DAY,t1:now,label:'in the last 24 hours'}:{t0:dayStart(now),t1:now,label:'today'};
  if(w.t1<=w.t0){res.html='That time has not happened yet. Try "yesterday" or a date.';return res;}
  /* supplier */
  if(sup){const name=Object.keys(SUP_BASE).find(s=>s===sup);const tk=trucksBetween(w.t0,w.t1).filter(k=>k.supplier===name&&k.t<=now);const t=tk.reduce((a,k)=>a+k.tons,0);
    res.html=`${esch(name)} delivered <b>${fmt(t,1)} t</b> in <b>${tk.length}</b> trucks ${w.label}`+(tk.length?`, ${fmt(t/tk.length,2)} t per truck on average, unloading in ${fmt(tk.reduce((a,k)=>a+k.offMin,0)/tk.length,1)} minutes.`:'.');
    res.acts.push(['Open suppliers',()=>gotoScreen('suppliers')]);return res;}
  /* why: look for drops and alerts in the window */
  if(why){
    const dr=dropsBetween(w.t0,w.t1),al=alertsBetween(w.t0,w.t1);
    const shutDay=(()=>{for(let d=dayStart(w.t0);d<w.t1;d=dayStart(d+30*HOUR))if(isShutdown(dayInfo(d).ord))return d;return null;})();
    if(shutDay!=null&&!dr.length){res.html=`${fd(shutDay)} was a <b>planned shutdown day</b>: no feed, no power, no trucks. The plant restarted at midnight.`;res.acts.push(['Open maintenance',()=>gotoScreen('maint')]);return res;}
    if(dr.length||al.length){
      const worst=dr.length?[...dr].sort((a,b)=>b.depth-a.depth)[0]:null;
      const ev=worst?dropToAna(worst):alertToAna(al[0]);const an=analyzeEvent(ev);
      const noDrop=!worst&&(!M||M.k==='power')?'No output drop '+w.label+'. ':'';
      const head=noDrop+(worst?`Power fell <b>${Math.round(worst.depth*100)} %</b> at ${dt(worst.t0)} for ${Math.round(worst.durMin)} minutes (from ${fmt(worst.baseKw)} kW to ${fmt(worst.minKw)} kW).`:`The main event was <b>${esch(al[0].rule.name)}</b> at ${dt(al[0].start)}.`);
      res.html=head+' '+(an.hints&&an.hints.length?esch(an.hints[0]):'No single cause stands out in the process data.')+(dr.length+al.length>1?` <span class="muted">There ${dr.length+al.length===2?'was one more event':'were '+(dr.length+al.length-1)+' more events'} ${w.label}.</span>`:'');
      const sc=[...dr.map(dropToAna),...al.map(alertToAna)].sort((a,b)=>a.t0-b.t0),wi=sc.findIndex(x=>x.t0===ev.t0);
      res.acts.push(['Open the full analysis',()=>openAnalysis(sc,Math.max(0,wi))]);
      const M2=M||METRICS[0];if(M2.rate)res.chart={...seriesFor(M2,{t0:ev.t0-3*HOUR,t1:Math.min(now,ev.t1+3*HOUR)}),name:M2.label+' around '+hhmm(ev.t0),unit:M2.unit};
      return res;}
    const M2=M||METRICS[0],a=accRange(w.t0,w.t1),prev=accRange(w.t0-(w.t1-w.t0),w.t0);const v=M2.rate?avgOf(a,M2.rate)*(M2.sc||1):0,pv=M2.rate?avgOf(prev,M2.rate)*(M2.sc||1):0;
    res.html=`Nothing unusual ${w.label}: no output drops and no alerts.`+(M2.rate?` ${M2.label[0].toUpperCase()+M2.label.slice(1)} averaged <b>${fmt(v,M2.dec)} ${M2.unit}</b>, ${pv?fmt(Math.abs(v-pv)/pv*100,1)+' % '+(v>=pv?'above':'below')+' the period before':''}.`:'');
    if(M2.rate)res.chart={...seriesFor(M2,w),name:M2.label,unit:M2.unit};return res;}
  const m=M||METRICS[0];
  /* alerts */
  if(m.alerts){const al=alertsBetween(w.t0,w.t1);const by={};al.forEach(a=>by[a.rule.name]=(by[a.rule.name]||0)+1);
    res.html=al.length?`<b>${al.length} alert${al.length>1?'s':''}</b> ${w.label}: ${Object.entries(by).map(([k,v])=>esch(k)+(v>1?' ×'+v:'')).join(', ')}. The longest lasted ${Math.round(Math.max(...al.map(a=>((a.end||now)-a.start)/MIN)))} minutes.`:`No alerts ${w.label}.`;
    if(al.length){const sc=al.map(alertToAna);res.acts.push(['Analyze them',()=>openAnalysis(sc,0)]);}res.acts.push(['Open event log',()=>gotoScreen('events')]);return res;}
  /* money */
  if(m.money){const a=accRange(w.t0,w.t1),mo=money(a,bandsBetween(w.t0,w.t1),a.h);
    res.html=`${w.label[0].toUpperCase()+w.label.slice(1)}: revenue <b>${eur(mo.R)}</b> (electricity ${eur(mo.rev.power)}${mo.rev.subsidy?', subsidy '+eur(mo.rev.subsidy):''}, gate fees ${eur(mo.rev.gate)}, carbon credits ${eur(mo.rev.carbon)}), operating costs ${eur(mo.C)}, EBITDA <b>${eur(mo.E)}</b>.`;
    res.acts.push(['Open finance',()=>gotoScreen('finance')]);return res;}
  /* compare with the period before */
  if(cmp){const len=w.t1-w.t0,sh=len<=DAY?DAY:len,a=accRange(w.t0,w.t1),b=accRange(w.t0-sh,w.t1-sh);
    const va=m.tot?m.tot(a):avgOf(a,m.rate)*(m.sc||1),vb=m.tot?m.tot(b):avgOf(b,m.rate)*(m.sc||1),u=m.tot?m.totU:m.unit;
    res.html=`${m.label[0].toUpperCase()+m.label.slice(1)} ${w.label}: <b>${fmt(va,m.dec)} ${u}</b>, against ${fmt(vb,m.dec)} ${u} ${sh===DAY?'over the same hours the day before':'in the period before'}. That is ${vb?fmt(Math.abs(va-vb)/Math.abs(vb)*100,1)+' % '+(va>=vb?'more':'less'):'a change from zero'}.`;
    if(m.rate)res.chart={...seriesFor(m,{t0:w.t0-sh,t1:w.t1}),name:m.label,unit:m.unit};return res;}
  /* peak or low */
  if(ext&&m.rate){const lowq=/lowest|minimum|\bmin\b|worst/.test(q);let best=null,bt=0;const step=Math.max(MIN,(w.t1-w.t0)/600);
    for(let t=w.t0;t<w.t1;t+=step){const v=plant(t)[m.rate]*(m.sc||1);if(best==null||(lowq?v<best:v>best)){best=v;bt=t;}}
    res.html=`The ${lowq?'lowest':'highest'} ${m.label} ${w.label} was <b>${fmt(best,m.dec)} ${m.unit}</b> at ${dt(bt)}.`;res.chart={...seriesFor(m,w),name:m.label,unit:m.unit};
    res.acts.push(['Analyze that moment',()=>openAnalysis([{t0:bt-5*MIN,t1:bt+5*MIN,title:(lowq?'Lowest ':'Highest ')+m.label,kind:'point'}],0)]);return res;}
  /* totals and averages */
  const a=accRange(w.t0,w.t1);
  if(w.point&&m.rate){const v=plant(w.point)[m.rate]*(m.sc||1);res.html=`${m.label[0].toUpperCase()+m.label.slice(1)} at ${hhmm(w.point)}${w.point<dayStart(now)?' on '+fd(w.point):''} was <b>${fmt(v,m.dec)} ${m.unit}</b>.`;}
  else if(m.tot){res.html=`${m.label[0].toUpperCase()+m.label.slice(1)} ${w.label}: <b>${fmt(m.tot(a),m.dec)} ${m.totU}</b>`+(m.rate?`, an average of ${fmt(avgOf(a,m.rate)*(m.sc||1),m.dec)} ${m.unit}`:'')+(m.trucks?` from ${a.s.trucks} trucks`:'')+'.';}
  else res.html=`${m.label[0].toUpperCase()+m.label.slice(1)} ${w.label} averaged <b>${fmt(avgOf(a,m.rate)*(m.sc||1),m.dec)} ${m.unit}</b>.`;
  if(m.rate||m.trucks)res.chart={...seriesFor(m,w),name:m.label+(m.trucks?' (t)':''),unit:m.unit||'t'};
  return res;
}
const ASK={hist:[]};
const SUGS=['How is the plant right now?','Why did power drop yesterday?','How much waste came in this week?','What was the reactor temperature at 3pm?','Compare power today vs yesterday','Highest scrubber temperature this month','Any alerts in the last 6 hours?','Revenue this month','How much did EcoHaul deliver this month?'];
function renderAsk(){
  const host=$('#pg_ask');
  if(!host._built){host._h=null;host.innerHTML=`<div class="askpage"><p class="lead">Ask about production, temperatures, alerts, suppliers or money in plain words. Answers come straight from the plant data, with a chart and a link to dig deeper.</p>
    <form class="askbig" id="askBig"><input id="askIn" placeholder="e.g. Why was power low yesterday at 3pm?" aria-label="Your question"><button class="btn pri">Ask</button></form>
    <div class="sugs" id="askSug">${SUGS.map(s=>`<button type="button">${esch(s)}</button>`).join('')}</div><div id="askOut"></div>
    <div class="note">This works with fixed patterns on this device, so it understands plant words, dates, times and comparisons but not every phrasing. Connecting a language model would let it answer anything.</div></div>`;host._built=true;
    $('#askBig').addEventListener('submit',e=>{e.preventDefault();doAsk($('#askIn').value);});
    $('#askSug').addEventListener('click',e=>{const b=e.target.closest('button');if(b){$('#askIn').value=b.textContent;doAsk(b.textContent);}});
    $('#askOut').addEventListener('click',e=>{const b=e.target.closest('button[data-ai]');if(!b)return;const r=ASK.hist[+b.dataset.h];if(r&&r.acts[+b.dataset.ai])r.acts[+b.dataset.ai][1]();});
  }
  const qp=new URLSearchParams((location.hash.split('?')[1]||''));const q=qp.get('q');if(q&&ASK.lastQ!==q){ASK.lastQ=q;$('#askIn').value=q;doAsk(q);}
}
function doAsk(q){
  if(!q||!q.trim())return;let r;
  try{r=answer(q);}catch(e){console.error(e);r={q,html:'I could not work that out. Try naming a measurement and a time, for example "power yesterday".',acts:[]};}
  ASK.hist.unshift(r);ASK.hist=ASK.hist.slice(0,8);
  $('#askOut').innerHTML=ASK.hist.map((x,h)=>`<div class="ans"><div class="q">${esch(x.q)}</div><div class="a">${x.html}</div>${x.chart?`<canvas id="askc${h}"></canvas><div class="legend"></div>`:''}${x.acts.length?`<div class="mact">${x.acts.map((a,i)=>`<button class="btn sm" data-h="${h}" data-ai="${i}">${a[0]}</button>`).join('')}</div>`:''}</div>`).join('');
  ASK.hist.forEach((x,h)=>{if(!x.chart)return;const cv=document.getElementById('askc'+h);attachTip(cv);drawChart(cv,{labels:x.chart.labels,series:[{name:x.chart.name[0].toUpperCase()+x.chart.name.slice(1)+(x.chart.unit?' ('+x.chart.unit+')':''),color:'#8ccbe0',type:'line',data:x.chart.vals,dec:x.chart.unit==='%'?2:0}]});});
}
PAGES.ask={title:'Ask the plant',period:false,still:true,render:renderAsk,enter:()=>{ASK.lastQ=null;}};
$('#askForm').addEventListener('submit',e=>{e.preventDefault();const q=$('#askQ').value.trim();if(!q)return;$('#askQ').value='';gotoScreen('ask','q='+encodeURIComponent(q));});

/* =====================================================================
   App install, phone layout, nav counter
   ===================================================================== */
let installEvt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;$('#btnInstall').hidden=false;});
$('#btnInstall').addEventListener('click',async()=>{if(!installEvt)return;installEvt.prompt();try{await installEvt.userChoice;}catch(x){}installEvt=null;$('#btnInstall').hidden=true;});
if('serviceWorker' in navigator&&/^https?:/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
$('#hamb').addEventListener('click',()=>document.body.classList.toggle('railopen'));
document.addEventListener('click',e=>{if(document.body.classList.contains('railopen')&&!e.target.closest('#rail')&&!e.target.closest('#hamb'))document.body.classList.remove('railopen');});
$('#rail').addEventListener('click',e=>{const a=e.target.closest('a[data-p]');if(!a)return;e.preventDefault();gotoScreen(a.dataset.p);});
function afterTick(){
  const n=alertCache.eps.filter(e=>e.end==null&&!acked.has(e.key)).length,el=$('#navAlarmCnt');
  el.hidden=!n;el.textContent=n;
}
