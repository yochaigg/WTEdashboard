'use strict';
/* ================= Operations pages: schematic, maintenance, shifts, suppliers, mass and energy ================= */

/* ---------- shared helpers ---------- */
const esch=s=>escH(s);
const eur=(v,d=0)=>(v<0?'-':'')+'€'+fmt(Math.abs(v),d);
const eurK=v=>Math.abs(v)>=1e6?(v<0?'-':'')+'€'+fmt(Math.abs(v)/1e6,2)+' M':Math.abs(v)>=1e4?(v<0?'-':'')+'€'+fmt(Math.abs(v)/1e3,0)+' k':eur(v);
function alertsBetween(t0,t1){const out=[];for(let d=dayInfo(t0).start;d<t1;d=dayInfo(d+30*HOUR).start)alertsOfDay(d).forEach(a=>{if(a.start<t1&&(a.end==null||a.end>t0))out.push(a);});return out;}
function nextShutdown(from){let d=dayInfo(from).start;for(let i=0;i<400;i++){const di=dayInfo(d);if(isShutdown(di.ord)&&di.end>from)return di;d=dayInfo(d+30*HOUR).start;}return null;}
function prevShutdown(from){let d=dayInfo(from).start;for(let i=0;i<400;i++){const di=dayInfo(d);if(isShutdown(di.ord)&&di.start<=from)return di;d=dayInfo(d-18*HOUR).start;}return null;}
const daysTo=t=>Math.ceil((t-Date.now())/DAY);
function onceEl(id,html){const el=document.getElementById(id);if(!el._built){el._h=null;el.innerHTML=html;el._built=true;return true;}return false;}

/* ---------- register the three existing pages ---------- */
PAGES.plant={title:'Plant',period:true,render:renderMain,csv:()=>plantCsv()};
PAGES.events={title:'Event log',period:true,render:()=>renderEvents(),csv:()=>eventsCsv()};
PAGES.carbon={title:'Carbon credits',period:true,render:()=>{renderCarbon();renderAutoBar();},csv:()=>carbonCsv(pkgData('view'),'','Central Orbit gasification plant')};

/* =====================================================================
   Animated plant schematic
   ===================================================================== */
const SCH={built:false,pop:null};
function schemSVG(){
  const W=1200,H=330;
  const t=(x,y,c,txt,id)=>`<text x="${x}" y="${y}" class="${c}"${id?` id="${id}"`:''}>${txt}</text>`;
  const unit=(id,label,inner,lx,ly)=>`<g class="unit" id="u_${id}" data-u="${id}" tabindex="0" role="button" aria-label="${label}">${inner}${t(lx,ly,'lb',label)}${t(lx,ly+22,'vl','-','v_'+id)}${t(lx,ly+40,'sb','','s_'+id)}</g>`;
  let engines='';
  for(let i=0;i<4;i++){const y=118+i*44;engines+=`<rect class="eq" x="905" y="${y}" width="92" height="34" rx="4"/><rect class="det" x="913" y="${y+8}" width="40" height="5" rx="2"/><rect class="det" x="913" y="${y+19}" width="40" height="5" rx="2"/><g class="fan" id="fan${i}"><circle cx="980" cy="${y+17}" r="10" fill="none" stroke="#5d6a77" stroke-width="1.5"/><path d="M980 ${y+8}v18M971 ${y+17}h18" stroke="#5d6a77" stroke-width="1.5"/></g>`;}
  return `<div class="state" id="schState"></div><div class="svscroll"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Plant process schematic">
  <defs>
    <radialGradient id="ember" cx="50%" cy="62%" r="60%"><stop offset="0" stop-color="#ffd27a"/><stop offset=".35" stop-color="#ff8f45"/><stop offset=".75" stop-color="#b8401f" stop-opacity=".55"/><stop offset="1" stop-color="#b8401f" stop-opacity="0"/></radialGradient>
    <linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#1f2933"/><stop offset=".5" stop-color="#2a3641"/><stop offset="1" stop-color="#1f2933"/></linearGradient>
    <clipPath id="rclip"><rect x="332" y="70" width="72" height="196" rx="30"/></clipPath>
  </defs>
  <!-- pipes -->
  <path class="pipe" d="M128 236H168"/><path class="pipe" d="M232 232L330 96"/>
  <path class="pipe" d="M404 104H474"/><path class="pipe" d="M500 262V282H600V226"/><path class="pipe" d="M690 170H760"/><path class="pipe" d="M824 170H880V135H905M880 170V179H905M880 170V223H905M880 170V267H905"/>
  <path class="pipe" d="M997 135H1040V200H1080M997 179H1040M997 223H1040M997 267H1040V200"/><path class="pipe" d="M368 266V300H300"/>
  <!-- flows -->
  <path class="fl waste" id="f_waste" d="M128 236H168"/><path class="fl waste" id="f_belt" d="M232 232L330 96"/>
  <path class="fl gas" id="f_gas1" d="M404 104H474"/><path class="fl gas" id="f_gas2" d="M500 262V282H600V226"/><path class="fl gas" id="f_gas3" d="M690 170H760"/><path class="fl gas" id="f_gas4" d="M824 170H880V135H905M880 170V179H905M880 170V223H905M880 170V267H905"/>
  <path class="fl power" id="f_pow" d="M997 135H1040V200H1080M997 179H1040M997 223H1040M997 267H1040V200"/><path class="fl ash" id="f_ash" d="M368 266V300H300"/>
  ${unit('scale','Truck scale',`<rect class="eq" x="18" y="246" width="118" height="10" rx="2"/><path class="eq" d="M28 206h64v36H28zM92 216h22l14 14v12H92z"/><circle cx="46" cy="246" r="7" fill="#2c3843" stroke="#5d6a77"/><circle cx="110" cy="246" r="7" fill="#2c3843" stroke="#5d6a77"/>`,20,62)}
  ${unit('belt','Briquetting and belt',`<path class="eq" d="M168 200h64l-10 44h-44z"/><rect class="det" x="182" y="214" width="36" height="6" rx="2"/>`,160,62)}
  ${unit('reactor','Reactor',`<rect x="332" y="70" width="72" height="196" rx="30" fill="url(#steel)" stroke="#4a5968" stroke-width="1.5" class="eq"/><g clip-path="url(#rclip)"><ellipse id="glow" class="glow" cx="368" cy="200" rx="44" ry="80" fill="url(#ember)"/></g>`,316,30)}
  ${unit('ash','Ash',`<path class="eq" d="M262 288h38v22h-38z"/>`,172,264)}
  ${unit('scrubber','Scrubber',`<rect class="eq" x="474" y="92" width="52" height="170" rx="10"/><path d="M482 130h36M482 160h36M482 190h36M482 220h36" stroke="#3a4855" stroke-dasharray="3 4"/>`,452,300)}
  ${unit('corona','Corona filter',`<rect class="eq" x="600" y="114" width="90" height="112" rx="6"/><path d="M618 124v92M636 124v92M654 124v92M672 124v92" stroke="#4a5968"/><path id="spark" d="M627 150l6 8-5 3 7 9" stroke="#8ccbe0" fill="none" stroke-width="1.5"/>`,600,62)}
  ${unit('cooling','Gas cooler',`<rect class="eq" x="760" y="140" width="64" height="60" rx="6"/><g class="fan" id="fanc"><circle cx="792" cy="170" r="16" fill="none" stroke="#5d6a77" stroke-width="1.5"/><path d="M792 154v32M776 170h32" stroke="#5d6a77" stroke-width="1.5"/></g>`,748,250)}
  ${unit('gen','Engines',`${engines}<text id="engMore" x="951" y="312" class="sb" text-anchor="middle"></text>`,905,62)}
  ${unit('grid','To the grid',`<path class="eq" d="M1080 176h46v48h-46z"/><path d="M1146 286l18-150 18 150M1152 236h24M1157 196h14M1150 160h28" stroke="#5d6a77" fill="none" stroke-width="1.5"/>`,1060,62)}
  </svg></div>
  <div class="legend2"><span><i style="background:var(--waste)"></i>Waste and briquets</span><span><i style="background:var(--gas)"></i>Syngas</span><span><i style="background:var(--power)"></i>Electricity</span><span><i style="background:var(--ash)"></i>Ash</span></div>`;
}
function setFlow(id,ratio){const el=document.getElementById(id);if(!el)return;const stop=!(ratio>0.02);el.classList.toggle('stop',stop);if(!stop){const d=(2.2/Math.max(.25,Math.min(2,ratio))).toFixed(2)+'s';if(el.style.animationDuration!==d)el.style.animationDuration=d;}}
function setTxt(id,v){const el=document.getElementById(id);if(el&&el.textContent!==v)el.textContent=v;}
function renderSchematic(){
  const host=$('#schem');if(!host)return;
  if(!SCH.built){host.innerHTML=schemSVG();SCH.built=true;}
  const {cur,total,P}=D,live=state.mode==='live',rw=live?'now':'avg';
  const nomBriq=1100*S(),nomGas=nomBriq*2.0;
  const own=(typeof FIN!=='undefined'?FIN.own:8)/100;
  setTxt('v_scale',fmt(total.s.waste,1)+' t');setTxt('s_scale',fmt(total.s.trucks)+' trucks, '+P.label.toLowerCase());
  setTxt('v_belt',fmt(cur.briqRate)+' kg/h');setTxt('s_belt',rw+' briquet feed');
  setTxt('v_reactor',fmt(cur.reactor)+' °C');setTxt('s_reactor',fmt(cur.gasRate)+' Nm³/h syngas out');
  setTxt('v_ash',fmt(cur.ashRate)+' kg/h');setTxt('s_ash','');
  setTxt('v_scrubber',fmt(cur.scrubber)+' °C');setTxt('s_scrubber','pH '+fmt(cur.ph,1)+', level '+fmt(cur.level)+' %');
  setTxt('v_corona',fmt(cur.corona)+' °C');setTxt('s_corona',fmt(cur.kv,1)+' kV, tar '+fmt(cur.tar)+' mg/Nm³');
  setTxt('v_cooling',fmt(cur.cooling)+' °C');setTxt('s_cooling',fmt(cur.genRate)+' Nm³/h to engines');
  setTxt('v_gen',fmt(cur.kw)+' kW');setTxt('s_gen',ENGINES+' × J620, '+fmt(cur.kw/RATED_KW*100)+' % load');
  setTxt('v_grid',fmt(cur.kw*(1-own))+' kW');setTxt('s_grid','after '+fmt(own*100)+' % own use');
  setTxt('engMore',ENGINES>4?'+ '+(ENGINES-4)+' more engines':'');
  for(let i=0;i<4;i++){const f=document.getElementById('fan'+i);if(f){f.style.opacity=i<ENGINES?1:.2;f.classList.toggle('stop',!(cur.kw>1)||i>=ENGINES);}}
  const fc=document.getElementById('fanc');if(fc)fc.classList.toggle('stop',!(cur.genRate>1));
  setFlow('f_waste',total.s.trucks?1:0.3);setFlow('f_belt',cur.briqRate/nomBriq);setFlow('f_ash',cur.ashRate/(nomBriq*0.11));
  ['f_gas1','f_gas2','f_gas3','f_gas4'].forEach(id=>setFlow(id,cur.gasRate/nomGas));setFlow('f_pow',cur.kw/(RATED_KW*0.9));
  const g=document.getElementById('glow');if(g){const k=Math.max(0,Math.min(1,(cur.reactor-150)/820));g.setAttribute('opacity',(0.15+0.85*k).toFixed(2));g.setAttribute('ry',(40+45*k).toFixed(0));}
  const sp=document.getElementById('spark');if(sp)sp.style.opacity=cur.kv>5?1:0;
  const st={reactor:statusFor('reactor'),scrubber:statusFor('scrubber'),corona:statusFor('corona'),gen:statusFor('gen')};
  if(typeof engineDueState==='function'){const m=engineDueState();if(m==='crit'&&st.gen!=='crit')st.gen='warn';}
  ['reactor','scrubber','corona','gen'].forEach(k=>{const u=document.getElementById('u_'+k);if(u)u.setAttribute('class','unit '+(st[k]||'ok'));});
  const shut=!!plant(P.now).shutdown;
  const nx=nextShutdown(P.now);
  $('#schState').innerHTML=shut?'<b>Planned shutdown today.</b> Restart at midnight.':'<b>Running</b>'+(nx?', next planned shutdown in '+daysTo(nx.start)+' days':'');
  if(SCH.pop)fillPop(SCH.pop);
}
const UNIT_INFO={
  scale:{t:'Truck scale',rows:c=>[['Waste in',fmt(D.total.s.waste,1)+' t'],['Trucks',fmt(D.total.s.trucks)],['Average load',fmt(D.total.s.trucks?D.total.s.waste/D.total.s.trucks:0,2)+' t']],go:[['Suppliers','suppliers'],['Event log','events']]},
  belt:{t:'Briquetting and belt',rows:c=>[['Briquet feed',fmt(c.briqRate)+' kg/h'],['Briquets in period',fmtB(D.total.s.briq)+' kg']],go:[['Mass and energy','balance']]},
  reactor:{t:'Reactor',rows:c=>[['Temperature',fmt(c.reactor)+' °C'],['Pressure',fmt(c.press,1)+' mbar'],['Syngas out',fmt(c.gasRate)+' Nm³/h'],['H₂ in syngas',fmt(c.H2,1)+' %'],['O₂ in syngas',fmt(c.O2,2)+' %']],ana:true,go:[['Alarm rules','alarms']]},
  ash:{t:'Ash',rows:c=>[['Ash rate',fmt(c.ashRate)+' kg/h'],['Ash in period',fmtB(D.total.s.ash)+' kg']],go:[['Mass and energy','balance']]},
  scrubber:{t:'Scrubber',rows:c=>[['Temperature',fmt(c.scrubber)+' °C'],['Water pH',fmt(c.ph,2)],['Water level',fmt(c.level)+' %']],ana:true,go:[['Maintenance','maint']]},
  corona:{t:'Corona filter',rows:c=>[['Temperature',fmt(c.corona)+' °C'],['Voltage',fmt(c.kv,1)+' kV'],['Tar after filter',fmt(c.tar)+' mg/Nm³']],ana:true,go:[['Maintenance','maint']]},
  cooling:{t:'Gas cooler',rows:c=>[['Gas temperature out',fmt(c.cooling)+' °C'],['Gas to engines',fmt(c.genRate)+' Nm³/h'],['Heating value',fmt(c.lhv,2)+' MJ/Nm³']]},
  gen:{t:'Engines, INNIO Jenbacher J620',rows:c=>[['Output',fmt(c.kw)+' kW'],['Engines',ENGINES+' × '+fmt(ENG_KW)+' kW'],['Load',fmt(c.kw/RATED_KW*100)+' %'],['CO in exhaust',fmt(c.emCO)+' mg/Nm³'],['NOx in exhaust',fmt(c.emNOx)+' mg/Nm³']],ana:true,go:[['Maintenance','maint'],['Grid export','grid']]},
  grid:{t:'To the grid',rows:c=>{const own=(typeof FIN!=='undefined'?FIN.own:8)/100;return [['Generated',fmt(c.kw)+' kW'],['Own use',fmt(c.kw*own)+' kW'],['Exported',fmt(c.kw*(1-own))+' kW']];},go:[['Grid export','grid'],['Finance','finance']]}
};
function fillPop(pop){const u=UNIT_INFO[pop.dataset.u];if(!u||!D)return;pop.querySelector('tbody').innerHTML=u.rows(D.cur).map(r=>`<tr><td>${r[0]}</td><td class="r num">${r[1]}</td></tr>`).join('');}
function openPop(id,anchor){
  closePop();const u=UNIT_INFO[id];if(!u)return;
  const host=$('#schem'),pop=document.createElement('div');pop.className='unitpop';pop.dataset.u=id;
  pop.innerHTML=`<h4>${u.t}</h4><table><tbody></tbody></table><div class="mact">${u.ana?'<button class="btn sm" data-a="ana">Analyze last 2 hours</button>':''}${u.go.map(g=>`<button class="btn sm" data-go="${g[1]}">${g[0]}</button>`).join('')}<button class="btn sm" data-a="x">Close</button></div>`;
  host.appendChild(pop);fillPop(pop);
  const hr=host.getBoundingClientRect(),ar=anchor.getBoundingClientRect();
  let x=ar.left-hr.left+ar.width/2-130,y=ar.bottom-hr.top+6;
  x=Math.max(8,Math.min(x,hr.width-pop.offsetWidth-8));if(y+pop.offsetHeight>hr.height)y=Math.max(8,ar.top-hr.top-pop.offsetHeight-6);
  pop.style.left=x+'px';pop.style.top=y+'px';SCH.pop=pop;
  pop.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.a==='x')closePop();
    if(b.dataset.a==='ana'){const now=Date.now();closePop();openAnalysis([{t0:now-20*MIN,t1:now,title:u.t+', last 2 hours',kind:'point'}],0);}
    if(b.dataset.go){closePop();gotoScreen(b.dataset.go);}
  });
}
function closePop(){if(SCH.pop){SCH.pop.remove();SCH.pop=null;}}
document.addEventListener('click',e=>{const g=e.target.closest&&e.target.closest('#schem g.unit');if(g){openPop(g.dataset.u,g);return;}if(SCH.pop&&!e.target.closest('.unitpop'))closePop();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePop();if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('#schem g.unit')){e.preventDefault();openPop(e.target.dataset.u,e.target);}});

/* =====================================================================
   Maintenance
   ===================================================================== */
const COMMISSIONED=new Date(2024,2,4).getTime();   /* assumed commissioning date for the simulation */
const MT=Object.assign({
  eng:[ {id:'oil',name:'Oil and filter change',every:2000},{id:'plug',name:'Spark plugs',every:4000},{id:'valve',name:'Valve clearance check',every:2000},{id:'top',name:'Top-end overhaul',every:30000,stop:true},{id:'major',name:'Major overhaul',every:60000,stop:true}],
  plant:[{id:'scrW',name:'Scrubber water change',days:14},{id:'corE',name:'Corona electrode cleaning',days:30},{id:'belt',name:'Conveyor belt inspection',days:7},{id:'gasCal',name:'Gas analyzer calibration',days:30},{id:'scale',name:'Truck scale calibration',days:365},{id:'refr',name:'Reactor refractory inspection',days:73,stop:true}]
},lsGet('wte_mt_cfg',{}));
const MDONE=lsGet('wte_mt_done',{});   /* key -> hours (engines) or time (plant) of last service */
function engHours(i,now){const h=(now-COMMISSIONED)/HOUR*0.975*(360/365)-i*410-hash(i*3.3)*600;return Math.max(0,h);}
function engTask(i,tk,now){
  const h=engHours(i,now),key='e'+i+'_'+tk.id;
  let last=MDONE[key];
  if(last==null){const due=Math.floor(h/tk.every)*tk.every;last=Math.max(0,due-(i===1&&tk.id==='oil'?tk.every*0.05:0));if(i===2&&tk.id==='plug')last=Math.max(0,h-tk.every*0.93);}
  const since=h-last,left=tk.every-since;return {h,last,since,left,frac:since/tk.every,key};
}
function plantTask(tk,now){
  const key='p_'+tk.id;let last=MDONE[key];
  if(last==null){last=now-(0.15+0.75*hash(tk.days*1.7))*tk.days*DAY;if(tk.id==='refr'){const ps=prevShutdown(now);last=ps?ps.start:last;}}
  const since=(now-last)/DAY,left=tk.days-since;return {last,since,left,frac:since/tk.days,key};
}
const sevOf=f=>f>=1?'crit':f>=0.9?'warn':'ok';
function engineDueState(){const now=Date.now();let s='ok';for(let i=0;i<ENGINES;i++)MT.eng.forEach(tk=>{const x=sevOf(engTask(i,tk,now).frac);if(x==='crit')s='crit';else if(x==='warn'&&s!=='crit')s='warn';});return s;}
function maintList(){
  const now=Date.now(),rows=[];
  for(let i=0;i<ENGINES;i++)MT.eng.forEach(tk=>{const r=engTask(i,tk,now);rows.push({what:'J620 #'+(i+1)+': '+tk.name,key:r.key,frac:r.frac,leftTxt:r.left>=0?fmt(r.left)+' h left':fmt(-r.left)+' h overdue',stop:tk.stop,kind:'eng',i,tk,r});});
  MT.plant.forEach(tk=>{const r=plantTask(tk,now);rows.push({what:tk.name,key:r.key,frac:r.frac,leftTxt:r.left>=0?fmt(r.left,0)+' days left':fmt(-r.left,0)+' days overdue',stop:tk.stop,kind:'plant',tk,r});});
  return rows;
}
function renderMaint(){
  const now=Date.now(),host=$('#pg_maint'),nx=nextShutdown(now),edit=can('maint');
  const rows=maintList(),due=rows.filter(r=>r.frac>=0.9).sort((a,b)=>b.frac-a.frac);
  const forShut=nx?rows.filter(r=>r.stop&&(r.kind==='eng'?r.r.left<(nx.start-now)/HOUR*0.975+2000:r.r.left<(nx.start-now)/DAY+73)):[];
  let h=`<p class="lead">Service status for the engines and the gas train. Engine hours follow the running time since commissioning. The intervals are indicative: set them from the INNIO Jenbacher maintenance schedule for your engines and from your own procedures.</p>
  <div class="grid3">
    <div class="card"><h3>Next planned shutdown</h3><div class="hours">${nx?daysTo(nx.start)+' days':'-'}</div><div class="muted">${nx?fd(nx.start)+'. Plan the jobs that need the plant stopped for this day.':''}</div></div>
    <div class="card"><h3>Due now or soon</h3><div class="hours">${due.length}</div><div class="muted">${due.filter(r=>r.frac>=1).length} overdue, ${due.filter(r=>r.frac<1).length} within 10 % of the interval</div></div>
    <div class="card"><h3>Jobs for the shutdown</h3>${forShut.length?forShut.slice(0,5).map(r=>`<div class="muted">${esch(r.what)}, ${r.leftTxt}</div>`).join(''):'<div class="muted">No stop-only jobs due before the following shutdown.</div>'}</div>
  </div>
  <h3 class="lh">Engines</h3><div class="eng">`;
  for(let i=0;i<ENGINES;i++){
    const hh=engHours(i,now);
    h+=`<div class="card"><h3><span>J620 #${i+1}</span><span class="muted">${fmt(ENG_KW)} kW</span></h3><div class="hours">${fmt(hh)} h</div><div class="muted" style="margin-bottom:8px">running hours</div>`+
      MT.eng.map(tk=>{const r=engTask(i,tk,now),sv=sevOf(r.frac);return `<div class="mrow c"><div><b>${tk.name}</b><div class="muted">every ${fmt(tk.every)} h${tk.stop?', needs a stop':''}</div></div>${edit?`<button class="btn sm" data-done="${r.key}">Mark done</button>`:'<span></span>'}<div class="w"><div class="bar"><i class="${sv}" style="width:${Math.max(2,Math.min(100,r.frac*100)).toFixed(0)}%"></i></div><div class="muted">${r.left>=0?fmt(r.left)+' h left':'<span class="neg">'+fmt(-r.left)+' h overdue</span>'}</div></div></div>`;}).join('')+`</div>`;
  }
  h+=`</div><h3 class="lh">Gas train and site</h3><div class="card">`+MT.plant.map(tk=>{const r=plantTask(tk,now),sv=sevOf(r.frac);return `<div class="mrow"><div><b>${tk.name}</b><div class="muted">every ${tk.days} days${tk.stop?', at a planned shutdown':''}, last ${fd(r.last)}</div></div><div><div class="bar"><i class="${sv}" style="width:${Math.min(100,r.frac*100).toFixed(0)}%"></i></div><div class="muted">${r.left>=0?fmt(r.left,0)+' days left':'<span class="neg">'+fmt(-r.left,0)+' days overdue</span>'}</div></div>${edit?`<button class="btn sm" data-done="${r.key}">Mark done</button>`:''}</div>`;}).join('')+`</div>
  <div class="note">Marking a job done records it in this browser and in the event log. ${edit?'':'Your role can view the plan but not mark jobs done.'}</div>`;
  host.innerHTML=h;
}
$('#pg_maint').addEventListener('click',e=>{const b=e.target.closest('button[data-done]');if(!b||!can('maint'))return;const k=b.dataset.done,now=Date.now();
  const row=maintList().find(r=>r.key===k);if(!row)return;
  MDONE[k]=row.kind==='eng'?engHours(row.i,now):now;lsSet('wte_mt_done',MDONE);addOp('Maintenance done: '+row.what+(typeof USER!=='undefined'&&USER.name?' ('+USER.name+')':''));renderMaint();});
PAGES.maint={title:'Maintenance',period:false,still:true,render:renderMaint,sub:()=>ENGINES+' engines, '+MT.plant.length+' site jobs',
  csv:()=>{const rows=metaRows([['Report','Maintenance status']]);rows.push(['Job','Status','Progress of interval (%)','Needs stop']);maintList().forEach(r=>rows.push([r.what,r.leftTxt,r1(r.frac*100,0),r.stop?'yes':'no']));return {name:'maintenance_'+fileTag()+'.csv',text:csvText(rows)};}};

/* =====================================================================
   Shift handover
   ===================================================================== */
const SHIFTS=[['Night',22],['Morning',6],['Afternoon',14]];
function shiftAt(t){const d=new Date(t),h=d.getHours();let s=new Date(d);let name;
  if(h>=6&&h<14){s.setHours(6,0,0,0);name='Morning';}else if(h>=14&&h<22){s.setHours(14,0,0,0);name='Afternoon';}else{if(h<6)s.setDate(s.getDate()-1);s.setHours(22,0,0,0);name='Night';}
  const t0=s.getTime();return {t0,t1:t0+8*HOUR,name,key:'sh'+t0};}
const SH={sel:null};
function shiftList(n){const out=[];let t=Date.now();for(let i=0;i<n;i++){const s=shiftAt(t);out.push(s);t=s.t0-1;}return out;}
function shiftSummary(s){
  const now=Date.now(),t1=Math.min(s.t1,now),a=integrate(s.t0,t1),hrs=(t1-s.t0)/HOUR;
  const al=alertsBetween(s.t0,t1),dr=dropsBetween(s.t0,t1),ops=lsGet(OPS_KEY,[]).filter(o=>o.t>=s.t0&&o.t<t1);
  const run=a.h?a.w.kw/a.h:0;
  return {a,hrs,al,dr,ops,run,t1,live:now<s.t1};
}
function renderShifts(){
  const host=$('#pg_shifts'),list=shiftList(9);if(!SH.sel||!list.some(s=>s.key===SH.sel))SH.sel=list[1].key;
  const s=list.find(x=>x.key===SH.sel),m=shiftSummary(s),notes=lsGet('wte_shift_notes',{}),n=notes[s.key]||{};
  const btns=list.map(x=>`<button data-sh="${x.key}" class="${x.key===SH.sel?'on':''}">${x.name}, ${new Date(x.t0).toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})}${x.t1>Date.now()?'<span class="now">now</span>':''}</button>`).join('');
  const top=[...m.al].sort((a,b)=>(b.sev==='crit')-(a.sev==='crit')||(b.start-a.start))[0];
  const sumTxt=shiftText(s,m,n);
  const html=`<p class="lead">One page per 8 hour shift. The outgoing lead checks the numbers, writes what the next shift needs to know and signs the handover.</p>
  <div class="shiftlist" id="shiftList">${btns}</div>
  <div class="kpis" id="shK"></div>
  <div class="grid2 mt">
    <div class="card"><h3>What happened <span>${hhmm(s.t0)} to ${hhmm(s.t1)}${m.live?', in progress':''}</span></h3>
      <table>
        <tr><td>Alerts raised</td><td class="r num">${m.al.length}${top?` <span class="muted">(worst: ${esch(top.rule.name)})</span>`:''}</td></tr>
        <tr><td>Output drops</td><td class="r num">${m.dr.length}${m.dr.length?` <span class="muted">(deepest ${Math.round(Math.max(...m.dr.map(d=>d.depth))*100)} %)</span>`:''}</td></tr>
        <tr><td>Operator actions logged</td><td class="r num">${m.ops.length}</td></tr>
        <tr><td>Gas to power efficiency</td><td class="r num">${fmt(avgOf(m.a,'eff')*100,1)} %</td></tr>
        <tr><td>Reactor average</td><td class="r num">${fmt(avgOf(m.a,'reactor'))} °C</td></tr>
      </table>
      ${m.al.length||m.dr.length?'<div class="mact"><button class="btn sm" id="shAna">Analyze this shift</button></div>':''}
    </div>
    <div class="card handover"><h3>Handover notes</h3>
      <textarea id="shNotes" class="field" style="width:100%;min-height:130px;background:var(--bg);border:1px solid var(--line2);color:var(--text);border-radius:8px;padding:9px;font:inherit" placeholder="Open issues, jobs in progress, anything the next shift must watch" ${can('handover')?'':'disabled'}>${esch(n.text||'')}</textarea>
      <div class="mact"><button class="btn pri" id="shSign" ${can('handover')?'':'disabled'}>${n.signed?'Sign again':'Sign handover'}</button><button class="btn" id="shCopy">Copy summary</button><button class="btn" id="shPrint">Print</button></div>
      <div class="status signed" id="shMsg">${n.signed?'Signed by '+esch(n.by||'unknown')+' at '+dt(n.signed):''}</div>
    </div>
  </div>
  <pre id="shText" hidden>${esch(sumTxt)}</pre>`;
  host.innerHTML=html;
  renderKpis($('#shK'),[{l:'Waste in',u:'t',v:m.a.s.waste,d:1,s:fmt(m.a.s.trucks)+' trucks'},{l:'Briquets to reactor',u:'kg',v:m.a.s.briq,d:0,s:''},{l:'Power generated',u:'kWh',v:m.a.s.kwh,d:0,s:'average '+fmt(m.run)+' kW'},{l:'Gas to generator',u:'Nm³',v:m.a.s.toGen,d:0,s:''},{l:'Ash produced',u:'kg',v:m.a.s.ash,d:0,s:''},{l:'Alerts',u:'',v:m.al.length,d:0,s:m.dr.length+' output drops'}]);
}
function shiftText(s,m,n){
  return ['Shift handover, '+s.name+' shift '+fd(s.t0)+' '+hhmm(s.t0)+' to '+hhmm(s.t1),
    'Waste in: '+fmt(m.a.s.waste,1)+' t ('+m.a.s.trucks+' trucks)','Power generated: '+fmt(m.a.s.kwh)+' kWh, average '+fmt(m.run)+' kW',
    'Briquets to reactor: '+fmt(m.a.s.briq)+' kg','Alerts: '+m.al.length+(m.al.length?' ('+[...new Set(m.al.map(a=>a.rule.name))].join(', ')+')':''),
    'Output drops: '+m.dr.length,'','Notes:',(n.text||'(none)'),'',n.signed?'Signed by '+(n.by||'')+' at '+tsf(n.signed):'Not signed yet'].join('\n');
}
$('#pg_shifts').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.sh){SH.sel=b.dataset.sh;renderShifts();return;}
  const s=shiftList(9).find(x=>x.key===SH.sel);if(!s)return;
  const notes=lsGet('wte_shift_notes',{});
  if(b.id==='shSign'&&can('handover')){const by=(typeof USER!=='undefined'&&USER.name)||'unknown';notes[s.key]={text:$('#shNotes').value,signed:Date.now(),by};lsSet('wte_shift_notes',notes);addOp('Shift handover signed: '+s.name+' '+fd(s.t0)+' by '+by);renderShifts();}
  if(b.id==='shCopy'){const n=notes[s.key]||{text:$('#shNotes').value};const txt=shiftText(s,shiftSummary(s),Object.assign({},n,{text:$('#shNotes').value}));try{await navigator.clipboard.writeText(txt);$('#shMsg').textContent='Summary copied.';}catch(x){$('#shMsg').textContent='Copy is blocked by the browser. Use Print instead.';}}
  if(b.id==='shPrint'){const n=Object.assign({},notes[s.key]||{},{text:$('#shNotes').value});const w=window.open('','_blank');if(w){w.document.write('<pre style="font:14px/1.5 system-ui;white-space:pre-wrap;padding:24px">'+esch(shiftText(s,shiftSummary(s),n))+'</pre>');w.document.close();w.print();}}
  if(b.id==='shAna'){const m=shiftSummary(s);const sc=[...m.dr.map(dropToAna),...m.al.map(alertToAna)].sort((a,b)=>a.t0-b.t0);openAnalysis(sc,0);}
});
$('#pg_shifts').addEventListener('input',e=>{if(e.target.id==='shNotes'){const notes=lsGet('wte_shift_notes',{});const k=SH.sel;notes[k]=Object.assign(notes[k]||{},{text:e.target.value});lsSet('wte_shift_notes',notes);}});
PAGES.shifts={title:'Shift handover',period:false,still:true,render:renderShifts,sub:()=>'Morning 06 to 14, afternoon 14 to 22, night 22 to 06'};

/* =====================================================================
   Suppliers
   ===================================================================== */
const SUP_BASE={'Municipal Collection':{m:31,c:4.2},'EcoHaul':{m:24,c:2.1},'GreenRoute':{m:21,c:1.6},'City Services':{m:29,c:3.6},'AgroTrans':{m:35,c:1.1}};
function truckQuality(k){const b=SUP_BASE[k.supplier]||{m:28,c:3},r=hash(k.t/MIN*0.37);return {moist:b.m+(r-0.5)*8,cont:Math.max(0.2,b.c+(hash(k.t/MIN*0.71)-0.5)*2.4)};}
const SUPS={sel:null};
function supplierStats(){
  const P=D.P,tk=trucksBetween(P.t0,P.t1).filter(k=>k.t<=P.now),by={};
  tk.forEach(k=>{const q=truckQuality(k),s=by[k.supplier]||(by[k.supplier]={name:k.supplier,n:0,t:0,off:0,queue:0,moist:0,cont:0,late:0,list:[]});
    s.n++;s.t+=k.tons;s.off+=k.offMin;const qm=(k.offStart-k.t)/MIN;s.queue+=qm;if(qm>8)s.late++;s.moist+=q.moist*k.tons;s.cont+=q.cont*k.tons;s.list.push(k);});
  return Object.values(by).map(s=>{s.avgT=s.t/s.n;s.avgOff=s.off/s.n;s.avgQ=s.queue/s.n;s.moist/=s.t;s.cont/=s.t;
    const sc=100-Math.max(0,s.moist-20)*2.2-s.cont*6-Math.max(0,s.avgOff-12)*1.5;s.score=sc;s.grade=sc>=80?'A':sc>=65?'B':'C';return s;}).sort((a,b)=>b.t-a.t);
}
function renderSuppliers(){
  const host=$('#pg_suppliers');
  if(onceEl('pg_suppliers',`<p class="lead">How each waste supplier performs: tonnage, how wet and how contaminated the loads are, and how long trucks take to unload. Wet or contaminated waste lowers the heating value and adds work at the briquetting line.</p>
    <div class="kpis" id="supK"></div>
    <div class="grid2 mt"><div class="card"><h3>Tonnage by supplier <span>t</span></h3><canvas id="c_sup"></canvas><div class="legend"></div></div>
    <div class="card"><h3>Moisture and contamination <span>% by weight, from load sampling</span></h3><canvas id="c_supq"></canvas><div class="legend"></div></div></div>
    <div class="card mt"><h3>Scorecard <span>click a supplier to see its trucks</span></h3><div class="scrollx" id="supT"></div></div>
    <div class="card mt" id="supTrucks" hidden></div>
    <div class="note">Moisture and contamination come from simulated load sampling. The score starts at 100 and loses points for moisture above 20 %, for contamination and for unloading slower than 12 minutes. A is 80 or more, B is 65 to 79.</div>`)){attachTip($('#c_sup'));attachTip($('#c_supq'));}
  const st=supplierStats(),tot=st.reduce((a,s)=>a+s.t,0),nT=st.reduce((a,s)=>a+s.n,0);
  const wm=tot?st.reduce((a,s)=>a+s.moist*s.t,0)/tot:0,wc=tot?st.reduce((a,s)=>a+s.cont*s.t,0)/tot:0;
  renderKpis($('#supK'),[{l:'Waste delivered',u:'t',v:tot,d:1,s:nT+' trucks, '+st.length+' suppliers'},{l:'Average moisture',u:'%',v:wm,d:1,s:'weighted by tonnage'},{l:'Average contamination',u:'%',v:wc,d:1,s:'plastics film, metal, inerts'},{l:'Average unloading',u:'min',v:nT?st.reduce((a,s)=>a+s.off,0)/nT:0,d:1,s:'from start to finish at the bay'}]);
  const labels=st.map(s=>s.name);
  drawChart($('#c_sup'),{labels,series:[{name:'Tonnage',color:'#c4ad86',type:'bar',data:st.map(s=>s.t),dec:1}]});
  drawChart($('#c_supq'),{labels,series:[{name:'Moisture %',color:'#8ccbe0',type:'bar',data:st.map(s=>s.moist),dec:1},{name:'Contamination %',color:'#e8b13e',type:'bar',data:st.map(s=>s.cont),dec:1}]});
  $('#supT').innerHTML='<table><tr><th>Supplier</th><th class="r">Trucks</th><th class="r">Tonnes</th><th class="r">Share</th><th class="r">Avg load t</th><th class="r">Moisture %</th><th class="r">Contamination %</th><th class="r">Unload min</th><th class="r">Waited over 8 min</th><th class="r">Grade</th></tr>'+
    st.map(s=>`<tr class="clk" data-sup="${esch(s.name)}"><td>${esch(s.name)}</td><td class="r">${s.n}</td><td class="r">${fmt(s.t,1)}</td><td class="r">${fmt(tot?s.t/tot*100:0,0)} %</td><td class="r">${fmt(s.avgT,2)}</td><td class="r">${fmt(s.moist,1)}</td><td class="r">${fmt(s.cont,1)}</td><td class="r">${fmt(s.avgOff,1)}</td><td class="r">${s.late}</td><td class="r"><span class="pill ${s.grade==='A'?'ok':s.grade==='B'?'warn':'crit'}">${s.grade} ${fmt(s.score)}</span></td></tr>`).join('')+'</table>';
  SUPS.stats=st;renderSupTrucks();
}
function renderSupTrucks(){
  const box=$('#supTrucks'),s=SUPS.stats&&SUPS.stats.find(x=>x.name===SUPS.sel);if(!s){box.hidden=true;return;}
  box.hidden=false;const list=[...s.list].sort((a,b)=>b.t-a.t).slice(0,40);SUPS.list=list;
  box.innerHTML=`<h3>${esch(s.name)} <span>latest ${list.length} trucks</span></h3><div class="scrollx"><table><tr><th>Weighed</th><th>Plate</th><th>Ticket</th><th class="r">Net t</th><th class="r">Moisture %</th><th class="r">Contamination %</th><th class="r">Unload min</th></tr>`+
    list.map((k,i)=>{const q=truckQuality(k);return `<tr class="clk" data-tki="${i}"><td>${dt(k.t)}</td><td><span class="plate" style="font-size:13px;padding:1px 8px;border-width:2px">${k.plate}</span></td><td>${k.id}</td><td class="r">${fmt(k.tons,2)}</td><td class="r">${fmt(q.moist,1)}</td><td class="r">${fmt(q.cont,1)}</td><td class="r">${k.offMin}</td></tr>`;}).join('')+'</table></div>';
}
$('#pg_suppliers').addEventListener('click',e=>{const r=e.target.closest('tr[data-sup]');if(r){SUPS.sel=SUPS.sel===r.dataset.sup?null:r.dataset.sup;renderSupTrucks();return;}const t=e.target.closest('tr[data-tki]');if(t&&SUPS.list)openTruck(SUPS.list[+t.dataset.tki]);});
PAGES.suppliers={title:'Suppliers',period:true,render:renderSuppliers,csv:()=>{const rows=metaRows([['Report','Supplier scorecard'],['Period',D.P.label+' ('+D.P.range+')']]);rows.push(['Supplier','Trucks','Tonnes','Avg load t','Moisture %','Contamination %','Unload min','Waited over 8 min','Score','Grade']);supplierStats().forEach(s=>rows.push([s.name,s.n,r1(s.t,2),r1(s.avgT,2),r1(s.moist,1),r1(s.cont,1),r1(s.avgOff,1),s.late,r1(s.score,0),s.grade]));return {name:'suppliers_'+fileTag()+'_'+slug(D.P.label)+'.csv',text:csvText(rows)};}};

/* =====================================================================
   Mass and energy balance (Sankey)
   ===================================================================== */
const BAL=Object.assign({feedMJ:21,gasDens:1.05,own:8},lsGet('wte_bal',{}));
function sankey(nodes,links,W,H,unit,dec){
  const cols=Math.max(...nodes.map(n=>n.col))+1,pad=18,nw=14,top=26;
  const byId={};nodes.forEach(n=>{n.in=0;n.out=0;byId[n.id]=n;});
  links.forEach(l=>{byId[l.s].out+=l.v;byId[l.t].in+=l.v;});
  nodes.forEach(n=>n.v=Math.max(n.in,n.out));
  const colN=[...Array(cols)].map((_,c)=>nodes.filter(n=>n.col===c));
  const k=Math.min(...colN.map(ns=>(H-top-10-pad*(ns.length-1))/Math.max(1e-9,ns.reduce((a,n)=>a+n.v,0))));
  const cx=c=>12+c*((W-24-nw-170)/(cols-1));
  colN.forEach((ns,c)=>{let y=top;ns.forEach(n=>{n.x=cx(c);n.y=y;n.h=Math.max(2,n.v*k);y+=n.h+pad;n.so=0;n.to=0;});});
  let svg='';
  links.forEach(l=>{const a=byId[l.s],b=byId[l.t],h=Math.max(1,l.v*k),y0=a.y+a.so,y1=b.y+b.to;a.so+=h;b.to+=h;const x0=a.x+nw,x1=b.x,mx=(x0+x1)/2;
    svg+=`<path class="lk" fill="${l.c||b.c}" d="M${x0} ${y0}C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}V${y1+h}C${mx} ${y1+h} ${mx} ${y0+h} ${x0} ${y0+h}Z"><title>${esch(a.label)} to ${esch(b.label)}: ${fmt(l.v,dec)} ${unit}</title></path>`;});
  nodes.forEach(n=>{const last=n.col===cols-1;svg+=`<rect class="nd" x="${n.x}" y="${n.y}" width="${nw}" height="${n.h}" fill="${n.c}"/>`;
    const tx=last?n.x+nw+8:n.x+nw+8,ty=n.y+Math.min(n.h/2,40)+4;
    svg+=`<text x="${tx}" y="${ty-7}">${esch(n.label)}</text><text class="v" x="${tx}" y="${ty+9}">${fmt(n.v,dec)} ${unit}</text>`;});
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${svg}</svg>`;
}
function balanceData(){
  const T=D.total.s,avgLhv=avgOf(D.total,'lhvKwh')||0;
  const waste=T.waste,briq=T.briq/1000,gasT=T.gas*BAL.gasDens/1000,ash=T.ash/1000;
  const prep=waste-briq,air=Math.max(0,gasT+ash-briq);
  const feedMWh=briq*BAL.feedMJ/3.6,synMWh=T.gas*avgLhv/1000,toGenMWh=T.toGen*avgLhv/1000,elec=T.kwh/1000,own=elec*BAL.own/100;
  return {waste,briq,gasT,ash,prep,air,feedMWh,synMWh,toGenMWh,elec,own,exp:elec-own,cge:feedMWh?synMWh/feedMWh:0,engEff:toGenMWh?elec/toGenMWh:0,overall:feedMWh?elec/feedMWh:0};
}
function renderBalance(){
  const host=$('#pg_balance');
  if(onceEl('pg_balance',`<p class="lead">Where the waste and its energy go. Widths are to scale for the selected period. Hover a band for its value.</p>
    <div class="kpis" id="balK"></div>
    <div class="card mt sankey"><h3>Mass balance <span>tonnes</span></h3><div id="skM"></div></div>
    <div class="card mt sankey"><h3>Energy balance <span>MWh</span></h3><div id="skE"></div></div>
    <div class="card mt"><h3>Assumptions <span>saved in this browser</span></h3><div class="fgrid">
      <label class="field">Briquet heating value (MJ/kg)<input type="number" step="0.5" min="5" max="35" data-b="feedMJ"></label>
      <label class="field">Syngas density (kg/Nm³)<input type="number" step="0.01" min="0.5" max="1.5" data-b="gasDens"></label>
      <label class="field">Own electricity use (% of generation)<input type="number" step="0.5" min="0" max="30" data-b="own"></label></div>
      <div class="note">Gasification air is calculated as the mass that closes the balance (syngas plus ash minus briquets). Losses in the energy balance are the difference between each stage, so they include heat to the scrubber, cooling water, exhaust and radiation.</div></div>`)){
    host.querySelectorAll('input[data-b]').forEach(i=>{i.value=BAL[i.dataset.b];i.addEventListener('change',()=>{const v=parseFloat(i.value);if(v>=0){BAL[i.dataset.b]=v;lsSet('wte_bal',BAL);if(i.dataset.b==='own'&&typeof FIN!=='undefined'){FIN.own=v;lsSet('wte_fin',FIN);}renderBalance();}});});}
  const b=balanceData(),W=Math.max(640,$('#skM').clientWidth||900);
  renderKpis($('#balK'),[{l:'Cold gas efficiency',u:'%',v:b.cge*100,d:1,s:'syngas energy over briquet energy',c:'var(--gas)'},{l:'Engine efficiency',u:'%',v:b.engEff*100,d:1,s:'electricity over syngas to engines',c:'var(--power)'},{l:'Waste to electricity',u:'%',v:b.overall*100,d:1,s:'overall, from briquet energy',c:'var(--power)'},{l:'Electricity per tonne of waste',u:'kWh/t',v:b.waste?b.elec*1000/b.waste:0,d:0,s:'gross generation'}]);
  if(!b.waste&&!b.briq){$('#skM').innerHTML=$('#skE').innerHTML='<div class="empty">No production in this period.</div>';return;}
  $('#skM').innerHTML=sankey([
    {id:'w',label:'Waste delivered',col:0,c:'#c4ad86'},{id:'a',label:'Gasification air',col:0,c:'#6f7d8a'},
    {id:'b',label:'Briquets',col:1,c:'#c4ad86'},{id:'p',label:'Moisture and rejects',col:1,c:'#5d6a77'},
    {id:'g',label:'Syngas',col:2,c:'#8ccbe0'},{id:'s',label:'Ash',col:2,c:'#a89f95'}],
    [{s:'w',t:'b',v:Math.min(b.waste,b.briq)},{s:'w',t:'p',v:Math.max(0,b.prep)},{s:'b',t:'g',v:Math.max(0,b.briq-b.ash)},{s:'b',t:'s',v:b.ash},{s:'a',t:'g',v:b.air}],W,300,'t',1);
  $('#skE').innerHTML=sankey([
    {id:'f',label:'Briquet energy',col:0,c:'#c4ad86'},
    {id:'y',label:'Syngas energy',col:1,c:'#8ccbe0'},{id:'lg',label:'Gasifier losses',col:1,c:'#5d6a77'},
    {id:'e',label:'Electricity',col:2,c:'#ff8f45'},{id:'le',label:'Engine heat and exhaust',col:2,c:'#5d6a77'},{id:'lc',label:'Gas cleaning losses',col:2,c:'#4a5968'},
    {id:'x',label:'Exported to grid',col:3,c:'#ff8f45'},{id:'o',label:'Own use',col:3,c:'#9a6a4a'}],
    [{s:'f',t:'y',v:Math.min(b.feedMWh,b.synMWh)},{s:'f',t:'lg',v:Math.max(0,b.feedMWh-b.synMWh)},{s:'y',t:'e',v:b.elec},{s:'y',t:'le',v:Math.max(0,b.toGenMWh-b.elec)},{s:'y',t:'lc',v:Math.max(0,b.synMWh-b.toGenMWh)},{s:'e',t:'x',v:b.exp},{s:'e',t:'o',v:b.own}],W,340,'MWh',1);
}
PAGES.balance={title:'Mass and energy',period:true,render:renderBalance,csv:()=>{const b=balanceData();const rows=metaRows([['Report','Mass and energy balance'],['Period',D.P.label+' ('+D.P.range+')'],['Briquet heating value MJ/kg',BAL.feedMJ],['Syngas density kg/Nm3',BAL.gasDens]]);rows.push(['Item','Value','Unit']);[['Waste delivered',b.waste,'t'],['Briquets',b.briq,'t'],['Moisture and rejects',b.prep,'t'],['Gasification air (closing term)',b.air,'t'],['Syngas',b.gasT,'t'],['Ash',b.ash,'t'],['Briquet energy',b.feedMWh,'MWh'],['Syngas energy',b.synMWh,'MWh'],['Syngas to engines',b.toGenMWh,'MWh'],['Electricity generated',b.elec,'MWh'],['Own use',b.own,'MWh'],['Exported',b.exp,'MWh'],['Cold gas efficiency',b.cge*100,'%'],['Engine efficiency',b.engEff*100,'%']].forEach(r=>rows.push([r[0],r1(r[1],2),r[2]]));return {name:'mass-energy-balance_'+fileTag()+'_'+slug(D.P.label)+'.csv',text:csvText(rows)};}};
