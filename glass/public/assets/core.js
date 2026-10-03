'use strict';
/* ================= UI ================= */
(function(){const d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(Element.prototype,'innerHTML',{get:d.get,set(v){if(this._h===v)return;this._h=v;d.set.call(this,v);},configurable:true});})();
const $=s=>document.querySelector(s);
const fmt=(v,d=0)=>(v==null||isNaN(v))?'-':v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtB=(v,d=0)=>Math.abs(v)>=1e7?fmt(v/1e6,1)+' M':fmt(v,d);
const pad=n=>String(n).padStart(2,'0');
const hhmm=t=>{const d=new Date(t);return pad(d.getHours())+':'+pad(d.getMinutes());};
const hhmmss=t=>{const d=new Date(t);return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());};
const dt=t=>{const d=new Date(t),td=new Date();return (d.toDateString()===td.toDateString()?'':d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' ')+hhmm(t);};
const dur=ms=>{const m=Math.round(ms/MIN);return m<60?m+' min':Math.floor(m/60)+' h '+pad(m%60)+' min';};
function lsGet(k,def){try{const v=localStorage.getItem(k);return v==null?def:JSON.parse(v);}catch(e){return def;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

/* page registry: every page registers {title, render, period, csv, roles} */
const PAGES={};
function pageOf(h){const m=/^#\/([\w-]+)/.exec(h||'');const id=m?m[1]:'plant';return PAGES[id]?id:'plant';}
const state={mode:'live',anchor:new Date(),screen:'plant'};
let acked=new Set(lsGet('wtg_ack',[]));
const cfg=Object.assign({land:0.5,disp:0.202,fossil:30,price:70},lsGet('wtg_carbon2',{}));
/* display currency: inputs stay in EUR, everything shown on screen is converted at the latest rate.
   CSV files and audit packages stay in EUR. */
const CURS={EUR:'€',USD:'$',GBP:'£'};
const CUR=Object.assign({code:'EUR',rates:{EUR:1},date:'',src:''},lsGet('wtg_cur',{}));
const curCode=()=>CUR.rates[CUR.code]>0?CUR.code:'EUR';
const curRate=()=>CUR.rates[curCode()]||1;
const cs=(v,d=0)=>(v<0?'-':'')+CURS[curCode()]+fmt(Math.abs(v)*curRate(),d);

/* ---------- charts ---------- */
const axisFmt=(v,step)=>{const d=step>=1?0:step>=0.1?1:2;return v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});};
function drawChart(cv,o){
  const lg=cv.parentElement.querySelector('.legend');
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;if(!W)return;
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
  const L=54,R=10,T=8,B=22,pw=W-L-R,ph=H-T-B,n=o.labels.length;
  const bars=o.series.filter(s=>s.type==='bar'),lines=o.series.filter(s=>s.type!=='bar');
  let lo=Infinity,hi=-Infinity;
  lines.forEach(s=>s.data.forEach(v=>{if(v!=null){lo=Math.min(lo,v);hi=Math.max(hi,v);}}));
  if(bars.length){for(let i=0;i<n;i++){let pos=0,neg=0;bars.forEach(s=>{const v=s.data[i];if(v!=null){if(v>=0)pos+=v;else neg+=v;}});hi=Math.max(hi,pos);lo=Math.min(lo,neg,0);}}
  (o.limits||[]).forEach(l=>{lo=Math.min(lo,l.v);hi=Math.max(hi,l.v);});
  if(!isFinite(lo)){lo=0;hi=1;}
  if(hi===lo)hi=lo+1;
  if(!bars.length&&o.yMin==null)lo-=(hi-lo)*0.1;
  hi+=(hi-lo)*0.08;
  if(o.yMin!=null)lo=o.yMin;if(o.yMax!=null)hi=o.yMax;
  const X=i=>L+(bars.length?(i+0.5)/n:(n>1?i/(n-1):0.5))*pw,Y=v=>T+ph-(v-lo)/(hi-lo)*ph;
  c.font='11px system-ui';c.lineWidth=1;
  for(let g=0;g<=4;g++){const v=lo+(hi-lo)*g/4,y=Y(v);c.strokeStyle='#1f2c3b';c.beginPath();c.moveTo(L,y);c.lineTo(W-R,y);c.stroke();c.fillStyle='#7f93a8';c.textAlign='right';c.fillText(axisFmt(v,(hi-lo)/4),L-6,y+4);}
  c.textAlign='center';c.fillStyle='#7f93a8';
  const every=Math.max(1,Math.ceil(n/Math.max(2,Math.floor(pw/62))));
  for(let i=0;i<n;i+=every)c.fillText(o.labels[i],X(i),H-6);
  (o.bands||[]).forEach(b=>{c.fillStyle=b.color||'rgba(245,185,66,.12)';const x0=X(b.i0),x1=X(b.i1);c.fillRect(Math.min(x0,x1),T,Math.max(3,Math.abs(x1-x0)),ph);});
  (o.limits||[]).forEach(l=>{c.strokeStyle=l.color;c.setLineDash([5,4]);c.beginPath();c.moveTo(L,Y(l.v));c.lineTo(W-R,Y(l.v));c.stroke();c.setLineDash([]);c.fillStyle=l.color;c.textAlign='left';c.fillText(l.label,L+4,Y(l.v)-3);});
  if(bars.length){
    const bw=Math.max(2,pw/n*0.7);
    for(let i=0;i<n;i++){let pos=0,neg=0;bars.forEach(s=>{const v=s.data[i];if(v==null)return;c.fillStyle=s.color;const a=Y(v>=0?pos:neg),b=Y(v>=0?pos+v:neg+v);c.fillRect(X(i)-bw/2,Math.min(a,b),bw,Math.abs(b-a));if(v>=0)pos+=v;else neg+=v;});}
  }
  lines.forEach(s=>{
    const pts=[];s.data.forEach((v,i)=>{if(v!=null)pts.push([X(i),Y(v)]);});
    if(pts.length>1&&!bars.length){
      const g=c.createLinearGradient(0,T,0,T+ph);g.addColorStop(0,s.color+'40');g.addColorStop(1,s.color+'00');
      c.fillStyle=g;c.beginPath();c.moveTo(pts[0][0],T+ph);pts.forEach(p=>c.lineTo(p[0],p[1]));c.lineTo(pts[pts.length-1][0],T+ph);c.closePath();c.fill();
    }
    c.save();c.shadowColor=s.color;c.shadowBlur=10;c.strokeStyle=s.color;c.lineWidth=2;c.lineJoin='round';c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();
    if(n<=40){c.fillStyle=s.color;pts.forEach(p=>{c.beginPath();c.arc(p[0],p[1],2.6,0,6.283);c.fill();});}
    c.restore();
  });
  const hits=[];
  (o.marks||[]).forEach(m=>{const x=X(m.i),y=T+11;c.save();c.strokeStyle='rgba(239,91,91,.55)';c.setLineDash([3,3]);c.beginPath();c.moveTo(x,T+19);c.lineTo(x,T+ph);c.stroke();c.setLineDash([]);c.shadowColor='#ef5b5b';c.shadowBlur=8;c.fillStyle='#ef5b5b';c.beginPath();c.arc(x,y,8,0,6.283);c.fill();c.restore();c.fillStyle='#fff';c.font='bold 11px system-ui';c.textAlign='center';c.fillText(m.count>1?String(m.count):'!',x,y+4);hits.push({x,y,m});});
  lg.innerHTML=o.series.map(s=>`<span><i style="background:${s.color}"></i>${s.name}</span>`).join('');
  cv._o={o,X,n,hits};
}
function attachTip(cv){
  const tip=$('#tip');
  const hitAt=(e)=>{const m=cv._o;if(!m||!m.hits)return null;const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;return m.hits.find(h=>Math.hypot(h.x-x,h.y-y)<=11)||null;};
  const idxAt=(e)=>{const m=cv._o,r=cv.getBoundingClientRect(),x=e.clientX-r.left;let bi=0,bd=1e9;for(let i=0;i<m.n;i++){const d=Math.abs(m.X(i)-x);if(d<bd){bd=d;bi=i;}}return bi;};
  cv.addEventListener('mousemove',e=>{
    const m=cv._o;if(!m)return;
    const h=hitAt(e);
    cv.style.cursor=h?'pointer':(m.o.pointClick?'crosshair':'default');
    if(h){tip.innerHTML='<b>'+h.m.text+'</b><br>Click to analyze';}
    else{const bi=idxAt(e);tip.innerHTML='<b>'+m.o.labels[bi]+'</b><br>'+m.o.series.map(s=>`<i style="background:${s.color}"></i>${s.name}: ${s.data[bi]==null?'-':fmt(s.data[bi],s.dec||0)}`).join('<br>')+(m.o.pointClick?'<br><span class="muted">Click to analyze this time</span>':'');}
    tip.style.display='block';tip.style.left=Math.min(e.clientX+14,innerWidth-190)+'px';tip.style.top=(e.clientY+14)+'px';
  });
  cv.addEventListener('click',e=>{const m=cv._o;if(!m)return;const h=hitAt(e);if(h){if(m.o.onMark)m.o.onMark(h.m);return;}if(m.o.pointClick)m.o.pointClick(idxAt(e));});
  cv.addEventListener('mouseleave',()=>{tip.style.display='none';});
}
function makeCards(host,list){
  host.innerHTML=list.map(([id,title,unit])=>`<div class="card"><h3>${title}<span>${unit}</span></h3><canvas id="${id}"></canvas><div class="legend"></div></div>`).join('');
  list.forEach(([id])=>attachTip(document.getElementById(id)));
}

/* ---------- period and data (rolling windows ending now) ---------- */
const fd=t=>new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
function period(){
  const now=Date.now(),m=state.mode,nd=new Date(now);let t0,label,range;
  if(m==='live'){t0=dayInfo(now).start;label='Today so far';}
  else if(m==='day'){t0=Math.floor(now/HOUR)*HOUR-23*HOUR;label='Last 24 hours';}
  else if(m==='month'){t0=new Date(nd.getFullYear(),nd.getMonth(),nd.getDate()-29).getTime();label='Last 30 days';}
  else{t0=new Date(nd.getFullYear(),nd.getMonth()-11,1).getTime();label='Last 12 months';}
  range=(m==='live'||m==='day')?dt(t0)+' to '+hhmm(now):fd(t0)+' to '+fd(now);
  return {m,t0,tEnd:now,t1:now,label,range,now};
}
function getBuckets(P){
  const out=[],now=P.now,m=P.m;
  if(m==='live'){
    /* live: running totals since midnight, in 30-minute bars; the last bar grows every second */
    for(let a=P.t0;a<now;a+=30*MIN)out.push({t:a,label:hhmm(a),acc:integrate(a,Math.min(a+30*MIN,now))});
    if(!out.length)out.push({t:P.t0,label:hhmm(P.t0),acc:integrate(P.t0,now)});
  }else if(m==='day'){
    for(let i=0;i<24;i++){const a=P.t0+i*HOUR;out.push({t:a,label:pad(new Date(a).getHours())+':00',acc:a<now?integrate(a,Math.min(a+HOUR,now)):null});}
  }else if(m==='month'){
    const d0=new Date(P.t0);
    for(let i=0;i<30;i++){const a=new Date(d0.getFullYear(),d0.getMonth(),d0.getDate()+i);out.push({t:a.getTime(),label:a.getDate()+'/'+(a.getMonth()+1),acc:dayAcc(a.getTime(),now)});}
  }else{
    const nd=new Date(now);
    for(let i=0;i<12;i++){const d=new Date(nd.getFullYear(),nd.getMonth()-11+i,1);out.push({t:d.getTime(),label:d.toLocaleDateString('en-GB',{month:'short'})+(d.getMonth()===0||i===0?' '+String(d.getFullYear()).slice(2):''),acc:monthAcc(d.getFullYear(),d.getMonth(),now)});}
  }
  return out;
}
let D=null,lastKey='',alertCache={k:0,eps:[]};
function buildData(){
  const P=period(),bk=getBuckets(P),total=newAcc();
  bk.forEach(b=>b.acc&&mergeAcc(total,b.acc));
  let snaps=null,cur;
  if(state.mode==='live'){snaps=[];for(let i=180;i>=0;i--){const t=P.now-i*10000;snaps.push({t,p:plant(t)});}cur=snaps[snaps.length-1].p;}
  else{cur={};WKEYS.forEach(k=>cur[k]=avgOf(total,k));}
  const k5=Math.floor(P.now/5000);
  if(alertCache.k!==k5){alertCache={k:k5,eps:scanAlerts(P.now,24)};if(typeof onAlertsScanned==='function')onAlertsScanned(alertCache.eps);}
  const ytd=newAcc(),y=new Date(P.now).getFullYear();
  for(let mo=0;mo<12;mo++){const a=monthAcc(y,mo,P.now);if(a)mergeAcc(ytd,a);}
  return {P,bk,total,snaps,cur,eps:alertCache.eps,ytd};
}
const UNIT_PER={live:'per 30 min',day:'per hour',month:'per day',year:'per month'};
function kpiColor(l,v){l=l.toLowerCase();
  if(/alert/.test(l))return v>0?'var(--amber)':'var(--line2)';
  if(/credit|co2e|landfill|fossil|carbon/.test(l)&&!/generator/.test(l))return 'var(--carbon)';
  if(/eur|revenue|value|profit|ebitda|cost/.test(l))return 'var(--money)';
  if(/power|kwh|mwh|export|electric/.test(l))return 'var(--power)';
  if(/gas|syngas/.test(l))return 'var(--gas)';
  if(/ash/.test(l))return 'var(--ash)';
  if(/waste|truck|briquet/.test(l))return 'var(--waste)';
  return 'var(--line2)';}
function renderKpis(host,list){
  if(host._n!==list.length){host.innerHTML=list.map(()=>'<div class="kpi"><div class="l"></div><div class="v"><b></b><small></small></div><div class="s"></div></div>').join('');host._h=null;host._n=list.length;}
  list.forEach((k,i)=>{
    if(typeof k.u==='string'&&/^EUR\b/.test(k.u)&&curCode()!=='EUR')k={...k,v:k.v*curRate(),u:k.u.replace(/^EUR/,curCode())};
    /* live: show running totals with enough decimals to tick every second, without flashing */
    if(state.mode==='live'&&!/waste|truck|alert|site|year|\brate\b|per |price|efficien/i.test(k.l)){const ld={MWh:3,t:3,tCO2e:3,MMBtu:2,EUR:2,USD:2,GBP:2}[k.u];if(ld!=null&&Math.abs(k.v)<1e7&&k.d<ld)k={...k,d:ld,nf:true};}
    const el=host.children[i],b=el.querySelector('b'),txt=fmtB(k.v,k.d);
    el.style.setProperty('--kc',k.c||kpiColor(k.l,k.v));el.querySelector('.l').textContent=k.l;el.querySelector('small').textContent=k.u;el.querySelector('.s').textContent=k.s;
    if(b.textContent!==txt){const had=b.textContent!==''&&!k.nf;b.textContent=txt;if(had){b.classList.remove('flash');void b.offsetWidth;b.classList.add('flash');}}
  });
}
function renderFlow(nodes){
  const host=$('#flow');
  if(host._n!==nodes.length){host.innerHTML=nodes.map((n,i)=>'<div class="node"><span class="d"></span><h4></h4><div class="m"></div><div class="s"></div></div>'+(i<nodes.length-1?'<div class="arrow"><i></i></div>':'')).join('');host._h=null;host._n=nodes.length;}
  const els=host.querySelectorAll('.node');
  nodes.forEach((n,i)=>{const e=els[i];e.querySelector('h4').textContent=n[1];e.querySelector('.d').className='d '+statusFor(n[0]);const m=e.querySelector('.m');if(m.textContent!==n[2]){m.textContent=n[2];}e.querySelector('.s').textContent=n[3]||'\u00a0';});
}

/* ---------- plant screen ---------- */
const MAIN_CARDS=[['c_reactor','Reactor temperature','°C'],['c_train','Scrubber, corona, cooling temperature','°C'],['c_gas','Gas flow: reactor out vs to the factory','Nm³/h'],['c_power','Heat delivered to the glass factory','kW thermal'],['c_anal','Gas analyzer','% vol'],['c_o2','Syngas oxygen','% vol'],['c_emis','Heating value of the gas delivered','MJ/Nm³'],['c_feed','Briquet feed and ash','t/h'],['c_waste','Waste in at truck scale','t per bucket']];
function labelsAndSeries(){
  const live=state.mode==='live';
  return {labels:live?D.snaps.map(s=>hhmmss(s.t)):D.bk.map(b=>b.label),
    sv:k=>live?D.snaps.map(s=>s.p[k]):D.bk.map(b=>b.acc?avgOf(b.acc,k):null)};
}
function statusFor(node){
  let s='ok';D.eps.filter(e=>e.end==null&&e.rule.node===node).forEach(e=>{if(e.sev==='crit')s='crit';else if(s!=='crit')s='warn';});return s;
}
function renderMain(){
  const {P,total,cur,eps,bk}=D,live=state.mode==='live',rw=live?'now':'avg';
  /* Live: running totals since midnight that count up every second, like the plant's own totalisers */
  const TA=live?integrate(dayInfo(P.now).start,P.now):total,T=TA.s;
  D.todayS=live?T:null;
  const lastTk=live?trucksBetween(P.now-DAY,P.now+1).filter(k=>k.t<=P.now).pop():null;
  const nTr=T.trucks,active=eps.filter(e=>e.end==null),unack=active.filter(e=>!acked.has(e.key));
  const K=[
    ['Waste in (truck scale)','t',T.waste,1,live?'today, last truck '+(lastTk?hhmm(lastTk.t):'-'):P.label],
    ['Trucks weighed','',nTr,0,(live?'today, ':'')+'avg '+fmt(nTr?T.waste/nTr:0,2)+' t per truck'],
    ['Briquets to reactor','t',T.briq/1000,1,rw+' '+fmt(cur.briqRate/1000,2)+' t/h',1],
    ['Syngas out of reactor','Nm³',T.gas,0,rw+' '+fmt(cur.gasRate)+' Nm³/h',1],
    ['Gas to the factory','Nm³',T.toGen,0,rw+' '+fmt(cur.genRate)+' Nm³/h',1],
    ['Energy delivered','MMBtu',T.kwh/KWH_PER_MMBTU,0,rw+' '+fmt(cur.kw/KWH_PER_MMBTU,1)+' MMBtu/h',1],
    [(typeof FAC!=='undefined'&&FAC.fuel==='bio'?'Biomethane replaced':'Natural gas replaced'),'Nm³',avgOf(TA,'facKw')*TA.h/NG_KWH,0,'at '+fmt(NG_KWH,1)+' kWh per Nm³',1],
    ['Ash produced','t',T.ash/1000,1,fmt(T.briq?T.ash/T.briq*100:0,1)+' % of feed',1],
    ...(typeof FAC!=='undefined'&&FAC.eng?[['Electricity from the engines','kWh',avgOf(TA,'engKw')*TA.h,0,rw+' '+fmt(cur.engKw)+' kW, '+fmt(cur.expKw)+' kW exported',1]]:[]),
    ['CO₂ at the furnace','t',T.co2/1000,1,rw+' '+fmt(cur.co2Rate/1000,2)+' t/h, mostly biogenic',1],
    ['Active alerts','',active.length,0,unack.length+' not acknowledged']
  ];
  renderKpis($('#kpis'),K.map(k=>({l:k[0]+(live&&k[5]?', today':''),u:k[1],v:k[2],d:k[3],s:k[4],nf:live&&k[5]})));
  renderSchematic([
    ['scale','Truck scale',fmt(total.s.waste,1)+' t',fmt(nTr)+' trucks'],
    ['belt','Conveyor belt',fmt(total.s.briq/1000,1)+' t',rw+' '+fmt(cur.briqRate/1000,2)+' t/h'],
    ['reactor','Reactor',fmt(cur.reactor)+' °C',fmt(cur.gasRate)+' Nm³/h out'],
    ['scrubber','Scrubber',fmt(cur.scrubber)+' °C',''],
    ['corona','Corona',fmt(cur.corona)+' °C',fmt(cur.kv,1)+' kV'],
    ['cooling','Cooling',fmt(cur.cooling)+' °C',''],
    ['gen','Glass factory',fmt(cur.kw/KWH_PER_MMBTU,1)+' MMBtu/h','']
  ]);

  const {labels,sv}=labelsAndSeries();
  const times=live?D.snaps.map(x=>x.t):bk.map(b=>b.t);
  const drops=dropsBetween(P.t0,P.t1),marks=dropMarks(drops,times);
  const onMark=m=>openAnalysis(m.list.map(dropToAna),m.worstIdx);
  const pointClick=live?(i=>{const t=times[i];if(t==null)return;openAnalysis([{t0:t-3*MIN,t1:t+3*MIN,title:'Selected time '+hhmmss(t),kind:'point'}],0);}):state.mode==='day'?(i=>{const t=times[i];if(t==null)return;openAnalysis([{t0:t,t1:t+HOUR,title:'Selected hour '+hhmm(t),kind:'point'}],0);}):null;
  const C=(id,o)=>drawChart(document.getElementById(id),Object.assign({labels,pointClick,onMark},['c_reactor','c_gas','c_power','c_feed'].includes(id)?{marks}:{},o));
  C('c_reactor',{series:[{name:'Reactor',color:'#f97316',type:'line',data:sv('reactor'),dec:0}],limits:[{v:900,color:'#f5b942',label:'low warning 900'}]});
  C('c_train',{series:[{name:'Scrubber',color:'#f5b942',type:'line',data:sv('scrubber'),dec:1},{name:'Corona',color:'#5aa9ff',type:'line',data:sv('corona'),dec:1},{name:'Cooling',color:'#2dd4bf',type:'line',data:sv('cooling'),dec:1}],limits:[{v:180,color:'#ef5b5b',label:'scrubber high 180'}]});
  C('c_gas',{series:[{name:'Reactor out',color:'#a78bfa',type:'line',data:sv('gasRate'),dec:0},{name:'To the factory',color:'#4ade80',type:'line',data:sv('genRate'),dec:0}]});
  C('c_power',{series:[{name:'Heat delivered',color:'#ff8f45',type:'line',data:sv('kw'),dec:0}],limits:[{v:RATED_KW,color:'#7f93a8',label:'contract capacity '+fmt(RATED_KW)}]});
  C('c_anal',{series:[{name:'CO',color:'#f97316',type:'line',data:sv('CO'),dec:1},{name:'H₂',color:'#5aa9ff',type:'line',data:sv('H2'),dec:1},{name:'CH₄',color:'#4ade80',type:'line',data:sv('CH4'),dec:2},{name:'CO₂',color:'#a78bfa',type:'line',data:sv('CO2'),dec:1}]});
  C('c_o2',{series:[{name:'O₂',color:'#ef5b5b',type:'line',data:sv('O2'),dec:2}],limits:[{v:1.0,color:'#f5b942',label:'warning 1.0'},{v:1.5,color:'#ef5b5b',label:'critical 1.5'}]});
  C('c_emis',{series:[{name:'Heating value',color:'#8ccbe0',type:'line',data:sv('lhv'),dec:2}],limits:[{v:12.6,color:'#f5b942',label:'low warning 12.6'}]});
  C('c_feed',{series:[{name:'Briquets',color:'#f5b942',type:'line',data:sv('briqRate').map(v=>v==null?null:v/1000),dec:2},{name:'Ash',color:'#7f93a8',type:'line',data:sv('ashRate').map(v=>v==null?null:v/1000),dec:2}]});
  $('#c_waste').parentElement.querySelector('h3 span').textContent='t '+UNIT_PER[state.mode];
  drawChart($('#c_waste'),{labels:bk.map(b=>b.label),series:[{name:'Waste in (t)',color:'#2dd4bf',type:'bar',data:bk.map(b=>b.acc?b.acc.s.waste:null),dec:1}]});

  $('#alertBadge').className='badge '+(unack.some(e=>e.sev==='crit')?'crit':unack.length?'warn':'ok');
  $('#alertBadge').textContent=unack.length?unack.length+' active alert'+(unack.length>1?'s':''):'No active alerts';
  const list=[...eps].sort((a,b)=>b.start-a.start).slice(0,14);
  $('#alertList').innerHTML=list.length?list.map(e=>{
    const act=e.end==null,r=e.rule;
    return `<div class="alert ${e.sev} ${act?'active':'done'}"><span class="dot"></span><div class="t"><b>${r.name}</b><div>${act?'since '+dt(e.start)+' ('+dur(P.now-e.start)+')':dt(e.start)+', '+dur(e.end-e.start)}, ${r.dir==='min'?'low':'peak'} ${fmt(e.peak,r.dec)} ${r.unit}</div></div>${act&&!acked.has(e.key)&&can('ack')?`<button data-ack="${e.key}">Ack</button>`:''}</div>`;}).join(''):'<div class="empty">No alerts in the last 24 h</div>';

  $('#anLbl').textContent='('+rw+')';$('#emLbl').textContent='('+rw+')';$('#phLbl').textContent='('+rw+')';
  const chip=(v,warn,crit)=>`<span class="pill ${v>crit?'crit':v>warn?'warn':'ok'}">${v>crit?'high':v>warn?'watch':'ok'}</span>`;
  $('#analyzer').innerHTML='<table>'+[['CO','%',cur.CO,1],['H₂','%',cur.H2,1],['CH₄','%',cur.CH4,2],['CO₂','%',cur.CO2,1],['O₂','%',cur.O2,2],['N₂ (balance)','%',cur.N2,1],['Heating value','MJ/Nm³',cur.lhv,2],['Heating value','kWh/Nm³',cur.lhvKwh,2],['Tar after corona','mg/Nm³',cur.tar,0]].map(r=>`<tr><td>${r[0]}</td><td class="r">${fmt(r[2],r[3])} ${r[1]}</td><td class="r">${r[0]==='O₂'?chip(r[2],1.0,1.5):r[0].startsWith('Tar')?chip(r[2],50,80):''}</td></tr>`).join('')+'</table>';
  const lo=(v,w,c)=>`<span class="pill ${v<c?'crit':v<w?'warn':'ok'}">${v<c?'low':v<w?'watch':'ok'}</span>`;
  $('#emis').innerHTML='<table>'+[['Heating value',fmt(cur.lhv,2)+' MJ/Nm³',lo(cur.lhv,12.6,12.0)],['Heating value',fmt(cur.lhvKwh,2)+' kWh/Nm³',''],['Hydrogen',fmt(cur.H2,1)+' %',''],['Tar',fmt(cur.tar)+' mg/Nm³',chip(cur.tar,50,80)],['Oxygen',fmt(cur.O2,2)+' %',chip(cur.O2,1.0,1.5)],['Gas temperature',fmt(cur.cooling)+' °C','']].map(r=>`<tr><td>${r[0]}</td><td class="r">${r[1]}</td><td class="r">${r[2]}</td></tr>`).join('')+'</table><div class="note">Measured where the gas leaves the plant for the glass factory.</div>';
  const sy=total.s.briq?total.s.gas/total.s.briq:0,kpt=total.s.briq?total.s.kwh/(total.s.briq/1000):0,own=avgOf(total,'ownKw')*total.h;
  $('#eff').innerHTML='<table>'+[['Syngas yield',fmt(sy*1000)+' Nm³/t briquet'],['Energy delivered',fmt(total.s.waste?total.s.kwh/KWH_PER_MMBTU/total.s.waste:0,1)+' MMBtu/t waste'],['Electricity bought',fmt(total.s.waste?own/total.s.waste:0)+' kWh/t waste'],['Use of contract capacity',fmt(avgOf(total,'kw')/RATED_KW*100,0)+' %']].map(r=>`<tr><td>${r[0]}</td><td class="r">${r[1]}</td></tr>`).join('')+'</table>';
  $('#genLbl').textContent='('+rw+')';
  $('#gens').innerHTML='<table>'+[['Gas flow to the factory',fmt(cur.genRate)+' Nm³/h'],['Energy delivered',fmt(cur.kw/KWH_PER_MMBTU,1)+' MMBtu/h'],['Contract capacity',fmt(RATED_KW/KWH_PER_MMBTU,0)+' MMBtu/h'],['Use of capacity',fmt(cur.kw/RATED_KW*100)+' %'],['Natural gas replaced',fmt(cur.kw/NG_KWH)+' Nm³/h'],['Booster blowers',ENGINES+' running']].map(r=>`<tr><td>${r[0]}</td><td class="r">${r[1]}</td></tr>`).join('')+'</table><div class="note">The furnace keeps natural gas burners ready: they take over on planned shutdown days and during any gas delivery drop.</div>';
  $('#health').innerHTML='<table>'+[['Reactor pressure',fmt(cur.press,1)+' mbar'],['Scrubber water pH',fmt(cur.ph,2)],['Scrubber water level',fmt(cur.level)+' %'],['Corona voltage',fmt(cur.kv,1)+' kV']].map(r=>`<tr><td>${r[0]}</td><td class="r">${r[1]}</td></tr>`).join('')+'</table>';
  renderDrops(drops,P);
  const tk=[...trucksBetween(P.t1-2*DAY,P.t1)].filter(k=>k.t<=P.now).sort((a,b)=>b.t-a.t).slice(0,8);TKLIST=tk;
  $('#tickets').innerHTML=tk.length?'<table><tr><th>Weighed</th><th>Plate (LPR)</th><th>Offload</th><th class="r">Net t</th></tr>'+tk.map((k,i)=>`<tr class="clk" data-tk="${i}"><td>${dt(k.t)}</td><td><span class="plate">${k.plate}</span></td><td>${P.now<k.offStart?'waiting':P.now<k.offEnd?'offloading':k.offMin+' min'}</td><td class="r">${fmt(k.tons,2)}</td></tr>`).join('')+'</table><div class="note">Click a row for LPR and camera details.</div>':'<div class="empty">No tickets yet</div>';
}

/* ---------- carbon screen ---------- */
const CARBON_CARDS=[['c_cc1','Credits per period','tCO2e'],['c_cc2','Cumulative net credits','tCO2e'],['c_cc3','Waste diverted from landfill','t']];
function credits(a){
  const land=a.s.waste*cfg.land,disp=a.s.kwh*cfg.disp/1000,ded=a.s.co2/1000*cfg.fossil/100;
  return {waste:a.s.waste,mwh:a.s.kwh/1000,co2t:a.s.co2/1000,land,disp,ded,net:land+disp-ded};
}
function renderCarbon(){
  const {P,total,bk,ytd}=D,c=credits(total),y=credits(ytd);
  const K=[['Net credits','tCO2e',c.net,1,P.label],['9.1 Landfill avoidance','tCO2e',c.land,1,fmt(c.waste,1)+' t waste diverted'],[(typeof FAC!=='undefined'&&FAC.fuel==='bio'?'9.2 Biomethane replaced':'9.2 Natural gas replaced'),'tCO2e',c.disp,1,fmt(c.mwh,1)+' MWh of heat delivered'+(typeof FAC!=='undefined'&&FAC.fuel==='bio'?', no credit (already renewable)':'')],...(typeof FAC!=='undefined'&&FAC.eng?[['9.2 Grid power replaced','tCO2e',c.dispE||0,1,fmt(c.elecMwh||0,1)+' MWh from the engines']]:[]),['Project emissions deducted','tCO2e',-c.ded,1,cfg.fossil+' % of '+fmt(c.co2t,1)+' t CO₂ from syngas'],['Estimated value','EUR',c.net*cfg.price,0,'at '+cs(cfg.price,2)+' per tCO2e'],['Year to date net','tCO2e',y.net,1,fmt(y.waste,0)+' t waste, '+fmt(y.mwh,0)+' MWh']];
  renderKpis($('#ckpis'),K.map(k=>({l:k[0],u:k[1],v:k[2],d:k[3],s:k[4]})));
  const per=bk.map(b=>b.acc?credits(b.acc):null);let run=0;
  const cum=per.map(p=>{if(!p)return null;run+=p.net;return run;});
  const labels=bk.map(b=>b.label);
  drawChart($('#c_cc1'),{labels,series:[{name:'9.1 Landfill avoidance',color:'#4ade80',type:'bar',data:per.map(p=>p&&p.land),dec:2},{name:'9.2 Natural gas replaced',color:'#5aa9ff',type:'bar',data:per.map(p=>p&&p.disp),dec:2},{name:'Net after deductions',color:'#f5b942',type:'line',data:per.map(p=>p&&p.net),dec:2}]});
  drawChart($('#c_cc2'),{labels,series:[{name:'Cumulative net',color:'#2dd4bf',type:'line',data:cum,dec:1}]});
  drawChart($('#c_cc3'),{labels,series:[{name:'Waste diverted (t)',color:'#4ade80',type:'bar',data:per.map(p=>p&&p.waste),dec:1}]});
  $('#cbLbl').textContent='('+P.label+')';
  const chs=document.querySelectorAll('#carbonCharts .card h3 span');chs[0].textContent='tCO2e '+UNIT_PER[state.mode];chs[1].textContent='tCO2e, running total';chs[2].textContent='t '+UNIT_PER[state.mode];
  $('#breakdown').innerHTML='<table>'+[
    ['Waste diverted',fmt(c.waste,1)+' t × '+fmt(cfg.land,2),'= '+fmt(c.land,1)+' tCO2e'],
    ['Natural gas replaced',fmt(c.mwh,1)+' MWh × '+fmt(cfg.disp,3)+' kg/kWh','= '+fmt(c.disp,1)+' tCO2e'],
    ...(typeof FAC!=='undefined'&&FAC.eng?[['Grid power replaced',fmt(c.elecMwh||0,1)+' MWh × '+fmt(typeof FAC!=='undefined'?FAC.gridF:0,2)+' kg/kWh','= '+fmt(c.dispE||0,1)+' tCO2e']]:[]),
    ['CO₂ from burning syngas',fmt(c.co2t,1)+' t × '+cfg.fossil+' % fossil','= -'+fmt(c.ded,1)+' tCO2e'],
    ['<b>Net credits</b>','','<b>'+fmt(c.net,1)+' tCO2e</b>'],
    ['Value',fmt(c.net,1)+' × '+cs(cfg.price,2),'= '+cs(c.net*cfg.price)]
  ].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td class="r">${r[2]}</td></tr>`).join('')+'</table>';
}

/* ---------- control ---------- */
function route(){
  let sc=state.screen;
  if(!PAGES[sc]||!canSee(sc)){sc=state.screen=firstPage();}
  const pg=PAGES[sc];
  document.querySelectorAll('section.page').forEach(x=>x.hidden=x.dataset.page!==sc);
  document.querySelectorAll('#rail a[data-p]').forEach(a=>{a.classList.toggle('on',a.dataset.p===sc);a.hidden=!canSee(a.dataset.p);if(a.dataset.p===sc)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  document.querySelectorAll('#rail .ng').forEach(g=>{g.hidden=![...g.querySelectorAll('a[data-p]')].some(a=>!a.hidden);});
  $('#pgTitle').textContent=pg.title;document.title=pg.title+' | Central Orbit';
  $('#modes').hidden=!pg.period;$('#btnCsv').hidden=!pg.csv;
  document.body.dataset.page=sc;document.body.classList.remove('railopen');
  if(pg.enter)try{pg.enter();}catch(e){showErr(e);}
  tick(true);
}
function showErr(e){console.error(e);$('#err').hidden=false;$('#err').textContent='Display error: '+e.message;}
function tick(force){
  const now=Date.now();
  $('#clock').textContent=new Date(now).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' '+hhmmss(now);
  document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.m===state.mode));
  const pg=PAGES[state.screen]||{},live=state.mode==='live';
  const key=state.mode+'|'+state.screen+'|'+Math.floor(now/(live?1000:15000));
  if(!force&&(key===lastKey||pg.still))return;
  lastKey=key;
  try{
    D=buildData();
    $('#plabel').textContent=pg.period?D.P.label+', '+D.P.range:(pg.sub?pg.sub():'');
    if(pg.render)pg.render();
    if(typeof afterTick==='function')afterTick();
    $('#err').hidden=true;
  }catch(e){showErr(e);}
}
document.querySelectorAll('#modes button').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.m;tick(true);}));
$('#alertList').addEventListener('click',e=>{const k=e.target.dataset&&e.target.dataset.ack;if(k&&can('ack')){acked.add(k);lsSet('wtg_ack',[...acked]);addOp('Alert acknowledged ('+k.split('@')[0]+')');tick(true);}});
makeCards($('#mainCharts'),MAIN_CARDS);makeCards($('#carbonCharts'),CARBON_CARDS);
/* assumptions form */
const F={land:$('#fLand'),disp:$('#fDisp'),fossil:$('#fFossil'),price:$('#fPrice')};
function syncForm(){F.land.value=cfg.land;F.disp.value=cfg.disp;F.fossil.value=cfg.fossil;F.price.value=cfg.price;
  const sel=$('#fPreset');sel.value=[...sel.options].some(o=>o.value&&+o.value===+cfg.disp)?String(cfg.disp.toFixed(2)):'';}
Object.keys(F).forEach(k=>F[k].addEventListener('input',()=>{if(k==='price'&&cfg.priceMode==='auto')return;const v=parseFloat(F[k].value);cfg[k]=isNaN(v)?0:v;if(k==='price')cfg.manualPrice=cfg.price;lsSet('wtg_carbon2',cfg);if(k==='disp')syncPreset();tick(true);}));
function syncPreset(){const sel=$('#fPreset');sel.value=[...sel.options].some(o=>o.value&&+o.value===+cfg.disp)?[...sel.options].find(o=>o.value&&+o.value===+cfg.disp).value:'';}
$('#fPreset').addEventListener('change',e=>{if(e.target.value){cfg.disp=parseFloat(e.target.value);F.disp.value=cfg.disp;lsSet('wtg_carbon2',cfg);tick(true);}});
syncForm();syncPreset();
/* credit price: automatic (EU ETS market price from the plant server) or manual */
if(!cfg.priceMode)cfg.priceMode='auto';
const PM={busy:false,err:''};
function pmPaint(){
  $('#fPriceMode').querySelectorAll('button').forEach(b=>{const on=b.dataset.v===cfg.priceMode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
  const auto=cfg.priceMode==='auto';F.price.readOnly=auto;F.price.classList.toggle('ro',auto);F.price.value=cfg.price;
  let t;
  if(!auto)t='Manual price, typed in.';
  else if(PM.busy)t='Getting the latest market price...';
  else if(cfg.autoAt&&!PM.err)t=`EU ETS allowance (EUA), ${cfg.autoBasis||'latest'}. Source ${cfg.autoSrc||'SendeCO2'}, checked ${fd(cfg.autoAt)} ${hhmm(cfg.autoAt)}.`;
  else if(cfg.autoAt)t=`Couldn't reach the price feed (${PM.err}). Using the last market price from ${fd(cfg.autoAt)}.`;
  else t=`Couldn't reach the price feed${PM.err?' ('+PM.err+')':''}. Using ${fmt(cfg.price,2)} EUR until it answers.`;
  $('#fPriceStat').textContent=t;$('#fPriceStat').classList.toggle('bad',auto&&!!PM.err);
}
async function pmFetch(){
  if(cfg.priceMode!=='auto')return;PM.busy=true;pmPaint();
  try{const r=await fetch('/api/carbon-price',{cache:'no-store'});const j=await r.json().catch(()=>({ok:false,error:'no price service on this address'}));
    if(!j.ok)throw new Error(j.error||('error '+r.status));
    cfg.price=Math.round(j.price*100)/100;cfg.autoAt=Date.parse(j.fetchedAt)||Date.now();cfg.autoBasis=j.basis;cfg.autoSrc=j.source;PM.err='';lsSet('wtg_carbon2',cfg);tick(true);
  }catch(e){PM.err=String(e.message||e).replace(/^TypeError: /,'');}
  PM.busy=false;pmPaint();
}
$('#fPriceMode').addEventListener('click',e=>{const v=e.target.dataset&&e.target.dataset.v;if(!v||v===cfg.priceMode)return;cfg.priceMode=v;if(v==='manual'&&cfg.manualPrice!=null){cfg.price=cfg.manualPrice;tick(true);}lsSet('wtg_carbon2',cfg);if(typeof addOp==='function')addOp('Credit price set to '+(v==='auto'?'automatic':'manual'));pmPaint();if(v==='auto')pmFetch();});
F.price.addEventListener('input',()=>{if(cfg.priceMode==='auto'){F.price.value=cfg.price;}});
pmPaint();pmFetch();setInterval(pmFetch,6*3600*1000);
/* currency toggle */
function curPaint(){
  const code=curCode();
  $('#curSel').querySelectorAll('button').forEach(b=>{const v=b.dataset.c,ok=v==='EUR'||CUR.rates[v]>0;b.classList.toggle('on',v===code);b.setAttribute('aria-pressed',v===code);b.disabled=!ok;
    b.title=v==='EUR'?'Euro, the currency the plant reports in':ok?`1 EUR = ${fmt(CUR.rates[v],4)} ${v}, ${CUR.src||'market rate'}${CUR.date?' of '+fd(Date.parse(CUR.date)):''}`:'Exchange rate not available yet';});
  document.querySelectorAll('.curc').forEach(e=>e.textContent=code);
}
async function curFetch(){
  try{const r=await fetch('/api/fx',{cache:'no-store'});const j=await r.json();if(!j.ok)throw new Error(j.error);
    CUR.rates=j.rates;CUR.date=j.date;CUR.src=j.source;lsSet('wtg_cur',CUR);tick(true);}catch(e){}
  curPaint();
}
$('#curSel').addEventListener('click',e=>{const b=e.target.closest('button[data-c]');if(!b||b.disabled)return;CUR.code=b.dataset.c;lsSet('wtg_cur',CUR);curPaint();tick(true);});
curPaint();curFetch();setInterval(curFetch,6*3600*1000);

/* ---------- CSV export and data package ---------- */
let DATA_SOURCE='SIMULATED';   /* change to 'MEASURED' when real plant data is connected */
const SIM_NOTE='SIMULATED DEMO DATA. Not measured. Do not submit to a registry or buyer.';
const esc=v=>{const s=String(v==null?'':v);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const csvText=rows=>rows.map(r=>r.map(esc).join(',')).join('\r\n');
const tsf=t=>{const d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());};
const r1=(v,d=2)=>{const f=Math.pow(10,d);return Math.round(v*f)/f;};
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function download(name,text,mime){
  const blob=new Blob(['﻿'+text],{type:mime||'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},800);
}
function metaRows(extra){
  const rows=[['Report','Waste to Energy Monitor export'],['Data source',DATA_SOURCE+(DATA_SOURCE==='SIMULATED'?' (demo data, not measured)':'')],['Generated',tsf(Date.now())],['Throughput setting (t/day)',TPD],['Gas customer','Glass factory furnace, contract capacity '+fmt(RATED_KW/1000,1)+' MW thermal']];
  return rows.concat(extra||[],[[]]);
}
function fileTag(){return (DATA_SOURCE==='SIMULATED'?'SIMULATED_':'')+tsf(Date.now()).slice(0,10);}
function plantCsv(){
  const {P,bk,total}=D;
  const head=['Period start','Waste in (t)','Trucks','Briquets (kg)','Syngas out (Nm3)','Gas to factory (Nm3)','Heat delivered (kWh thermal)','Ash (kg)','CO2 at furnace (kg)','Avg heat delivered (kW)','Reactor (C)','Scrubber (C)','Corona (C)','Cooling (C)','CO (%)','H2 (%)','CH4 (%)','CO2 (%)','O2 (%)','Heating value (MJ/Nm3)','Emission CO (mg/Nm3)','Emission NOx (mg/Nm3)','Emission SO2 (mg/Nm3)','Particulates (mg/Nm3)'];
  const line=(l,a)=>[l,r1(a.s.waste,2),a.s.trucks,r1(a.s.briq,0),r1(a.s.gas,0),r1(a.s.toGen,0),r1(a.s.kwh,0),r1(a.s.ash,0),r1(a.s.co2,0),r1(avgOf(a,'kw'),0),r1(avgOf(a,'reactor'),0),r1(avgOf(a,'scrubber'),0),r1(avgOf(a,'corona'),0),r1(avgOf(a,'cooling'),0),r1(avgOf(a,'CO'),2),r1(avgOf(a,'H2'),2),r1(avgOf(a,'CH4'),2),r1(avgOf(a,'CO2'),2),r1(avgOf(a,'O2'),2),r1(avgOf(a,'lhv'),2),r1(avgOf(a,'emCO'),0),r1(avgOf(a,'emNOx'),0),r1(avgOf(a,'emSO2'),0),r1(avgOf(a,'emPM'),1)];
  const rows=metaRows([['Period',P.label+' ('+P.range+')'],['Row size',{live:'5 minutes',day:'1 hour',month:'1 day',year:'1 month'}[state.mode]],['Note','Totals are summed, temperatures, gas and emissions are averages']]);
  rows.push(head);bk.filter(b=>b.acc).forEach(b=>rows.push(line(tsf(b.t),b.acc)));
  rows.push(line('TOTAL / AVERAGE',total));
  return {name:'wte-plant-data_'+fileTag()+'_'+slug(P.label)+'.csv',text:csvText(rows)};
}
function pkgData(sel){
  const now=Date.now();
  if(!sel||sel==='view')return {label:D.P.label,range:D.P.range,rows:D.bk.filter(b=>b.acc).map(b=>({t:b.t,acc:b.acc})),total:D.total,unit:{live:'5 minutes',day:'1 hour',month:'1 day',year:'1 month'}[state.mode]};
  const [y,mo]=sel.split('-').map(Number),dim=new Date(y,mo+1,0).getDate(),rows=[],total=newAcc();
  for(let d=1;d<=dim;d++){const ts=new Date(y,mo,d).getTime();if(ts>=now)break;const acc=dayAcc(ts,now);rows.push({t:ts,acc});mergeAcc(total,acc);}
  const lab=new Date(y,mo,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const last=rows.length?rows[rows.length-1].t:now;
  return {label:lab+(new Date(y,mo+1,1).getTime()>now?' (to date)':''),range:fd(new Date(y,mo,1).getTime())+' to '+fd(last),rows,total,unit:'1 day'};
}
function carbonCsv(pk,who,fac){
  const head=['Period start','Waste diverted (t)','Trucks','Heat delivered replacing natural gas (MWh)','CO2 from syngas (t)','Landfill avoidance (tCO2e)','Fossil fuel replaced (tCO2e)','Project emissions deducted (tCO2e)','Net credits (tCO2e)','Indicative value (EUR)'];
  const line=(l,a)=>{const c=credits(a);return [l,r1(c.waste,2),a.s.trucks,r1(c.mwh,2),r1(c.co2t,2),r1(c.land,2),r1(c.disp,2),r1(c.ded,2),r1(c.net,2),r1(c.net*cfg.price,0)];};
  const rows=metaRows([['Purpose','Carbon credit data package'],['Facility',fac||''],['Methodology',PK.meth||''],['Project reference',PK.pid||''],['Prepared for',who||''],['Period',pk.label+' ('+pk.range+')'],['Row size',pk.unit],['Landfill avoidance factor (tCO2e per t waste)',cfg.land],['Natural gas emission factor (kg CO2 per kWh)',cfg.disp],['Fossil share of syngas CO2 (%)',cfg.fossil],['Credit price (EUR per tCO2e)',cfg.price],['Credit price source',cfg.priceMode==='auto'?'Automatic: EU ETS allowance (EUA), '+(cfg.autoBasis||'')+', '+(cfg.autoSrc||'SendeCO2'):'Manual'],['Factor status','Placeholder factors, confirm against the methodology before submission']]);
  rows.push(head);pk.rows.forEach(r=>rows.push(line(tsf(r.t),r.acc)));
  rows.push(line('TOTAL',pk.total));
  return {name:'carbon-credit-data_'+fileTag()+'_'+slug(pk.label)+'.csv',text:csvText(rows)};
}
function exportCsv(){
  if(!D)return;
  const pg=PAGES[state.screen];if(!pg||!pg.csv)return;const f=pg.csv();if(!f)return;
  download(f.name,f.text);
}
/* data package, sending and monthly automation */
const PK=Object.assign({name:'TÜV SÜD',mail:'',fac:'Central Orbit gasification plant',per:(n=>n.getFullYear()+'-'+n.getMonth())(new Date(new Date().getFullYear(),new Date().getMonth()-1,1)),meth:'AMS-III.E (to be confirmed)',pid:''},lsGet('wtg_pkg3',{}));
const ST=Object.assign({op:'',hook:'',auto:false,day:1,log:[]},lsGet('wtg_auto3',{}));
const saveST=()=>{ST.log=ST.log.slice(-40);lsSet('wtg_auto3',ST);};
const emails=s=>String(s||'').split(/[;,\s]+/).map(x=>x.trim()).filter(Boolean);
const okMail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const escH=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mkey=d=>d.getFullYear()+'-'+d.getMonth();
const mname=d=>d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
const DONE=['sent','dry','draft'];
const STATUS_TXT={sent:'sent to webhook',dry:'dry run, simulated data, nothing sent',draft:'email draft opened',failed:'failed'};
let autoPending=null;const triedAuto=new Set();

function pkgMessage(pk,greet){
  const c=credits(pk.total),n=(v,d=1)=>fmt(v,d),g=greet===undefined?PK.name:greet;
  const L=[
    g?'Hello '+g+' team,':'Hello,','',
    'Please find the carbon credit monitoring data for '+(PK.fac||'the facility')+', '+pk.label+' ('+pk.range+').','',
    'Methodology: '+(PK.meth||'-')+(PK.pid?'   Reference: '+PK.pid:''),'',
    'Waste diverted from landfill: '+n(c.waste)+' t ('+n(pk.total.s.trucks,0)+' truck loads)',
    'Landfill avoidance: '+n(c.land)+' tCO2e (factor '+n(cfg.land,2)+' tCO2e per t)',
    'Syngas heat delivered to the glass furnace: '+n(c.mwh)+' MWh, replacing natural gas',
    'Natural gas replaced: '+n(c.disp)+' tCO2e (factor '+n(cfg.disp,3)+' kg CO2 per kWh)',
    'Project emissions deducted: '+n(c.ded)+' tCO2e ('+n(cfg.fossil,0)+' % of '+n(c.co2t)+' t CO2 from burning syngas)',
    'Net credits: '+n(c.net)+' tCO2e',
    'Indicative value at '+n(cfg.price,2)+' EUR: '+n(c.net*cfg.price,0)+' EUR','',
    'The monitoring data file with one row per '+pk.unit+' is attached (CSV). The figures are submitted for verification.'
  ];
  if(DATA_SOURCE==='SIMULATED')L.push('','NOTE: '+SIM_NOTE);
  L.push('','Regards,','Yochai, Central Orbit');
  return L.join('\n');
}
function buildReport(pk,to,cc,greet,msg){
  const c=credits(pk.total),f=carbonCsv(pk,PK.name,PK.fac);
  return {event:'carbon_credit_report',source:'wte-dashboard',dataSource:DATA_SOURCE,simulated:DATA_SOURCE==='SIMULATED',facility:PK.fac,methodology:PK.meth,projectRef:PK.pid,period:pk.label,range:pk.range,to,cc,
    subject:'Carbon credit data, '+pk.label+', '+(PK.fac||'facility')+(DATA_SOURCE==='SIMULATED'?' (SIMULATED)':''),
    message:msg||pkgMessage(pk,greet),
    summary:{wasteT:r1(c.waste,2),trucks:pk.total.s.trucks,heatDeliveredMWh:r1(c.mwh,2),landfillAvoidanceTCO2e:r1(c.land,2),fossilReplacedTCO2e:r1(c.disp,2),projectEmissionsTCO2e:r1(c.ded,2),netCreditsTCO2e:r1(c.net,2),indicativeValueEUR:r1(c.net*cfg.price,0)},
    attachment:{filename:f.name,mime:'text/csv',text:f.text}};
}
function openMail(to,cc,subject,body){
  const a=document.createElement('a');
  a.href='mailto:'+to.map(encodeURIComponent).join(',')+'?'+(cc.length?'cc='+cc.map(encodeURIComponent).join(',')+'&':'')+'subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  document.body.appendChild(a);a.click();a.remove();
}
async function pushReport(rep,kind,key){
  const e={t:Date.now(),kind,key,period:rep.period,to:rep.to.join(', ')+(rep.cc.length?' (cc '+rep.cc.join(', ')+')':'')};
  if(ST.hook){
    try{
      await fetch(ST.hook,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(rep)});
      e.status='sent';e.note='request delivered to the webhook, delivery to the inbox is not confirmed';
    }catch(err){e.status='failed';e.note=String(err&&err.message||err);}
  }else{
    download(rep.attachment.filename,rep.attachment.text);
    openMail(rep.to,rep.cc,rep.subject,rep.message);
    e.status='draft';e.note='no webhook set, email draft opened and CSV downloaded';
  }
  ST.log.push(e);saveST();renderLog();renderAutoBar();
  return e;
}
const say=(t,bad)=>{const el=$('#pkgStatus');el.textContent=t;el.style.color=bad?'var(--red)':'var(--green)';};
async function doPush(kind){
  if(DATA_SOURCE==='SIMULATED'&&!$('#pkgOk').checked){say('Tick the box first: this is simulated demo data.',true);return;}
  const other=kind==='other',to=other?emails($('#pkgOther').value):emails(PK.mail),cc=other?[]:emails(ST.op);
  if(!to.length||[...to,...cc].some(x=>!okMail(x))){say(other?'Enter a valid email address.':'Enter a valid verifier email, and check the site operator email.',true);return;}
  const pk=pkgData(PK.per);let msg=$('#pkgMsg').value;if(other)msg=msg.replace(/^Hello[^\n]*/,'Hello,');
  const e=await pushReport(buildReport(pk,to,cc,other?'':PK.name,msg),'manual');
  say(e.status==='sent'?'Sent to the webhook for '+to.join(', ')+(cc.length?' (copy '+cc.join(', ')+')':'')+'. The browser cannot confirm delivery, check the inbox.':e.status==='draft'?'No webhook set: email draft opened and CSV downloaded. Attach the CSV and send.':'Failed: '+e.note,e.status==='failed');
}
function prevMonth(now){return new Date(now.getFullYear(),now.getMonth()-1,1);}
function autoDone(key){return ST.log.some(x=>x.kind==='auto'&&x.key===key&&DONE.includes(x.status));}
async function processAuto(){
  if(!ST.auto)return;
  const now=new Date(),d=Math.min(28,+ST.day||1);if(now.getDate()<d)return;
  const key=mkey(prevMonth(now));if(autoDone(key)||triedAuto.has(key))return;
  triedAuto.add(key);
  const pk=pkgData(key);
  if(DATA_SOURCE==='SIMULATED'){ST.log.push({t:Date.now(),kind:'auto',key,period:pk.label,to:'-',status:'dry',note:'simulated data, nothing sent'});saveST();renderLog();renderAutoBar();return;}
  const to=emails(PK.mail),cc=emails(ST.op);
  if(!to.length||[...to,...cc].some(x=>!okMail(x))){ST.log.push({t:Date.now(),kind:'auto',key,period:pk.label,to:'-',status:'failed',note:'verifier email missing or invalid'});saveST();renderLog();renderAutoBar();return;}
  if(!ST.hook){autoPending=key;renderAutoBar();return;}
  await pushReport(buildReport(pk,to,cc),'auto',key);
}
async function sendPending(){
  if(!autoPending)return;const key=autoPending,pk=pkgData(key),to=emails(PK.mail),cc=emails(ST.op);
  if(!to.length||[...to,...cc].some(x=>!okMail(x))){pkgOpen();say('Enter a valid verifier email first.',true);return;}
  autoPending=null;await pushReport(buildReport(pk,to,cc),'auto',key);
}
function nextRunText(){
  if(!ST.auto)return 'automation is off';
  const now=new Date(),d=Math.min(28,+ST.day||1),due=now.getDate()>=d&&!autoDone(mkey(prevMonth(now)));
  const when=due?now:new Date(now.getFullYear(),now.getMonth()+(now.getDate()>=d?1:0),d);
  return (due?'due now':fd(when.getTime()))+' for '+mname(new Date(when.getFullYear(),when.getMonth()-1,1));
}
function lastText(){const x=ST.log[ST.log.length-1];return x?tsf(x.t)+', '+x.kind+', '+(x.period||'')+', '+(STATUS_TXT[x.status]||x.status):'none yet';}
function renderAutoBar(){
  const el=$('#autoBar');if(!el)return;
  el.innerHTML='<b>Monthly report to '+escH(PK.name||'verifier')+'</b><span class="pillx '+(ST.auto?'on':'off')+'">'+(ST.auto?'AUTO ON':'AUTO OFF')+'</span><span>Next: '+escH(nextRunText())+'</span><span>Last: '+escH(lastText())+'</span>'+(autoPending?'<button class="btn pri" data-a="send">Send '+escH(pkgData(autoPending).label)+' now</button>':'')+'<button class="btn" data-a="open">Report settings</button>';
}
function renderLog(){
  const rows=ST.log.slice(-6).reverse();
  $('#pkgLog').innerHTML=rows.length?'<table><tr><th>When</th><th>Type</th><th>Period</th><th>To</th><th>Result</th></tr>'+rows.map(x=>'<tr><td>'+tsf(x.t)+'</td><td>'+escH(x.kind)+'</td><td>'+escH(x.period)+'</td><td>'+escH(x.to||'-')+'</td><td>'+escH(STATUS_TXT[x.status]||x.status)+'</td></tr>').join('')+'</table>':'<div class="empty">Nothing sent yet</div>';
}
function labels(){const n=PK.name||'verifier';$('#btnPkg').textContent='Prepare for audit';$('#pkgPush').textContent='Push to '+n;}
function pkgRender(){
  const pk=pkgData(PK.per),c=credits(pk.total);
  const sim=DATA_SOURCE==='SIMULATED';
  $('#pkgWarn').style.display=sim?'block':'none';
  $('#pkgWarn').textContent='';$('#pkgWarn').hidden=true;
  $('#pkgOkWrap').style.display=sim?'flex':'none';
  const rows=[['Reporting period',pk.label],['Waste diverted',fmt(c.waste,1)+' t'],['Trucks weighed',fmt(pk.total.s.trucks)],['Landfill avoidance (9.1)',fmt(c.land,1)+' tCO2e'],['Heat delivered to the furnace',fmt(c.mwh,1)+' MWh'],['Natural gas replaced (9.2)',fmt(c.disp,1)+' tCO2e'],['Project emissions deducted','-'+fmt(c.ded,1)+' tCO2e'],['<b>Net credits</b>','<b>'+fmt(c.net,1)+' tCO2e</b>'],['Indicative value at '+fmt(cfg.price,2)+' EUR',fmt(c.net*cfg.price)+' EUR'],['Data rows in CSV',pk.rows.length+' (one per '+pk.unit+')']];
  $('#pkgSum').innerHTML='<table>'+rows.map(r=>'<tr><td>'+r[0]+'</td><td class="r">'+r[1]+'</td></tr>').join('')+'</table>';
  $('#pkgMsg').value=pkgMessage(pk);
  $('#pkgNote').textContent='Attach separately, not generated here: weighbridge tickets, flow meter and gas analyzer calibration records, gas flow and heating value readings at the factory delivery point, the methodology reference and the landfill baseline study.';
  renderLog();labels();return pk;
}
function pkgOpen(){
  const sel=$('#pkgPer'),now=new Date();
  sel.innerHTML='<option value="view">Current view: '+D.P.label+'</option>'+Array.from({length:12},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-i,1);return '<option value="'+d.getFullYear()+'-'+d.getMonth()+'">'+mname(d)+(i===0?' (to date)':'')+'</option>';}).join('');
  if(![...sel.options].some(o=>o.value===PK.per))PK.per='view';
  $('#pkgDay').innerHTML=Array.from({length:28},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('');
  sel.value=PK.per;$('#pkgName').value=PK.name;$('#pkgMail').value=PK.mail;$('#pkgFac').value=PK.fac;$('#pkgMeth').value=PK.meth;$('#pkgPid').value=PK.pid;
  $('#pkgOp').value=ST.op;$('#pkgHook').value=ST.hook;$('#pkgAuto').checked=!!ST.auto;$('#pkgDay').value=String(Math.min(28,+ST.day||1));
  $('#pkgStatus').textContent='';$('#pkg').hidden=false;pkgRender();
}
function pkgSave(){
  PK.name=$('#pkgName').value;PK.mail=$('#pkgMail').value;PK.fac=$('#pkgFac').value;PK.meth=$('#pkgMeth').value;PK.pid=$('#pkgPid').value;PK.per=$('#pkgPer').value;
  ST.op=$('#pkgOp').value;ST.hook=$('#pkgHook').value.trim();ST.auto=$('#pkgAuto').checked;ST.day=+$('#pkgDay').value||1;
  lsSet('wtg_pkg3',PK);saveST();labels();renderAutoBar();
}
['pkgName','pkgMail','pkgOp','pkgFac','pkgMeth','pkgPid','pkgPer','pkgHook','pkgDay'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{pkgSave();pkgRender();}));
$('#pkgAuto').addEventListener('change',()=>{pkgSave();pkgRender();if(ST.auto)processAuto();});
$('#btnPkg').addEventListener('click',()=>{if(D)pkgOpen();});
$('#autoBar').addEventListener('click',e=>{const a=e.target.dataset&&e.target.dataset.a;if(a==='open'&&D)pkgOpen();if(a==='send')sendPending();});
$('#pkgX').addEventListener('click',()=>{$('#pkg').hidden=true;});
$('#pkg').addEventListener('click',e=>{if(e.target.id==='pkg')$('#pkg').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#pkg').hidden=true;});
$('#pkgPush').addEventListener('click',()=>doPush('verifier'));
$('#pkgPushOther').addEventListener('click',()=>doPush('other'));
$('#pkgCsv').addEventListener('click',()=>{const pk=pkgData(PK.per),f=carbonCsv(pk,PK.name,PK.fac);download(f.name,f.text);});
$('#pkgTxt').addEventListener('click',()=>{const pk=pkgData(PK.per);download('carbon-credit-summary_'+fileTag()+'_'+slug(pk.label)+'.txt',$('#pkgMsg').value,'text/plain;charset=utf-8');});
$('#pkgCopy').addEventListener('click',async()=>{const t=$('#pkgMsg');try{await navigator.clipboard.writeText(t.value);$('#pkgCopy').textContent='Copied';}catch(e){t.focus();t.select();$('#pkgCopy').textContent='Press Ctrl+C';}setTimeout(()=>{$('#pkgCopy').textContent='Copy message';},1800);});
$('#pkgMailBtn').addEventListener('click',()=>{const pk=pkgData(PK.per);openMail(emails(PK.mail),emails(ST.op),'Carbon credit data, '+pk.label+(DATA_SOURCE==='SIMULATED'?' (SIMULATED)':''),$('#pkgMsg').value);});
$('#btnCsv').addEventListener('click',exportCsv);
labels();renderAutoBar();setTimeout(processAuto,1500);setInterval(processAuto,60000);


/* ================= v9 UI: drop analysis, events page, truck LPR and camera ================= */
const TYPE_TXT={alert:'Alert',drop:'Output drop',truck:'Truck',op:'Operator'};
const evSecs=t=>new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' '+hhmmss(t);
const tsfs=t=>tsf(t)+':'+pad(new Date(t).getSeconds());
const sgn=(v,d=0)=>(v>0?'+':v<0?'-':'')+fmt(Math.abs(v),d);
let DROPLIST=[],TKLIST=[];

/* ---- drops on charts and in the side list ---- */
function idxOfTime(times,t){let lo=0,hi=times.length-1,r=-1;while(lo<=hi){const m=(lo+hi)>>1;if(times[m]<=t){r=m;lo=m+1;}else hi=m-1;}return r;}
function dropToAna(x){return {t0:x.t0,t1:x.t1,title:'Output drop at '+dt(x.t0),kind:'drop',drop:x};}
function alertToAna(a){return {t0:a.start,t1:a.end!=null?a.end:Date.now(),title:'Alert: '+a.rule.name,kind:'alert',alert:a};}
function dropMarks(drops,times){
  const g=new Map();
  drops.forEach(d=>{const i=idxOfTime(times,d.tMin);if(i<0)return;if(!g.has(i))g.set(i,[]);g.get(i).push(d);});
  return [...g.entries()].map(([i,list])=>{
    list.sort((a,b)=>a.t0-b.t0);let w=0;list.forEach((d,j)=>{if(d.depth>list[w].depth)w=j;});
    const wd=list[w];
    return {i,count:list.length,list,worstIdx:w,text:list.length>1?list.length+' delivery drops here, worst -'+Math.round(wd.depth*100)+' % at '+dt(wd.tMin):'Gas delivery drop at '+hhmm(wd.tMin)+': heat -'+Math.round(wd.depth*100)+' %, '+Math.round(wd.durMin)+' min'};
  });
}
function renderDrops(drops,P){
  $('#dropLbl').textContent='('+P.label.toLowerCase()+')';
  DROPLIST=[...drops].sort((a,b)=>b.t0-a.t0);
  const top=DROPLIST.slice(0,6);
  $('#drops').innerHTML=top.length?top.map((d,i)=>'<div class="dr"><div><b>-'+Math.round(d.depth*100)+' %</b> heat delivered, '+Math.round(d.durMin)+' min<div class="muted">'+dt(d.t0)+'</div></div><button class="btn sm" data-di="'+i+'">Analyze</button></div>').join('')+'<div class="note">'+(DROPLIST.length>6?DROPLIST.length+' drops in this period. <a href="#/events" style="color:var(--teal)">Open the event log</a>. ':'')+'A drop is heat delivered at least '+Math.round(DROP_PCT*100)+' % below its own 3 hour average. You can also click the red markers on the charts.</div>':'<div class="empty">No output drops in this period</div>';
}

/* ---- analysis window ---- */
const AN={scope:[],idx:0,res:null};
function openAnalysis(scope,idx){
  if(!scope||!scope.length)return;
  AN.scope=scope;AN.idx=Math.min(Math.max(idx||0,0),scope.length-1);
  $('#ana').hidden=false;renderAnalysis();
}
function onsetTxt(x){if(x.onset==null)return '-';if(Math.abs(x.onset)<3)return 'at the start';return Math.round(Math.abs(x.onset))+' min '+(x.onset<0?'before':'after')+' the start';}
function renderAnalysis(){
  const ev=AN.scope[AN.idx],r=analyzeEvent(ev);AN.res=r;
  const I=r.impact,R=r.R,cr=I.lostKwh*cfg.disp/1000;
  $('#anaTitle').textContent=ev.kind==='drop'?'Output drop analysis':ev.kind==='alert'?'Alert analysis':'Analysis of the selected time';
  $('#anaSub').textContent=ev.title+', '+dt(ev.t0)+' to '+hhmm(r.ev.t1);
  const sel=$('#anaSel');
  if(AN.scope.length>1){
    sel.parentElement.style.display='';
    sel.innerHTML=AN.scope.map((x,i)=>'<option value="'+i+'">'+escH(x.kind==='drop'?dt(x.drop.t0)+',  -'+Math.round(x.drop.depth*100)+' %,  '+Math.round(x.drop.durMin)+' min':x.title)+'</option>').join('');
    sel.value=String(AN.idx);
  }else sel.parentElement.style.display='none';
  renderKpis($('#anaK'),[
    {l:'Duration',u:'min',v:I.durMin,d:0,s:dt(ev.t0)+' to '+hhmm(r.ev.t1)},
    {l:'Lowest heat delivery',u:'kW',v:I.kwMin,d:0,s:'normal '+fmt(I.kwBase)+' kW'},
    {l:'Heat delivery change',u:'%',v:R.kw.rel*100,d:0,s:'at the worst point'},
    {l:'Heat not delivered',u:'kWh',v:I.lostKwh,d:0,s:fmt(I.briqLostKg/1000,2)+' t briquets not fed'},
    {l:'Credits not earned',u:'tCO2e',v:cr,d:1,s:'natural gas replacement part'},
    {l:'Value',u:'EUR',v:cr*cfg.price,d:0,s:'at '+cs(cfg.price,2)+' per tCO2e'}
  ]);
  drawChart($('#anaChart'),{labels:r.labels,series:r.series,limits:[{v:100,color:'#7f93a8',label:'normal level'}],bands:[{i0:r.i0,i1:r.i1,color:'rgba(239,91,91,.16)'}]});
  const L=[];
  if(ev.kind==='drop')L.push('Heat delivered to the factory fell '+Math.round(-R.kw.rel*100)+' % from '+fmt(I.kwBase)+' kW to '+fmt(I.kwMin)+' kW and was back to normal by '+hhmm(r.ev.t1)+' ('+Math.round(I.durMin)+' min).');
  else if(R.kw.moved)L.push('Heat delivered changed by '+sgn(R.kw.rel*100,0)+' % (lowest '+fmt(I.kwMin)+' kW against a normal '+fmt(I.kwBase)+' kW).');
  else L.push('Heat delivered stayed within its normal range in this window.');
  if(r.mv.length)L.push('Parameters that moved, earliest first: '+r.mv.slice(0,5).map(x=>x.label+' ('+(Math.abs(x.rel)<5?sgn(x.rel*100,0)+' %':sgn(x.change,x.dec)+' '+x.unit)+', '+onsetTxt(x)+')').join('; ')+'.');
  if(I.lostKwh>1)L.push('About '+fmt(I.lostKwh)+' kWh of heat was not delivered, so the furnace burned natural gas instead. That is '+fmt(cr,1)+' tCO2e of credits not earned ('+cs(cr*cfg.price)+').');
  r.hints.forEach(x=>L.push(x));
  $('#anaText').innerHTML='<ul>'+L.map(x=>'<li>'+escH(x)+'</li>').join('')+'</ul><div class="note">Hints are pattern based and use simulated data. They show where to look, they are not a diagnosis.</div>';
  $('#anaTable').innerHTML='<table><tr><th>Parameter</th><th class="r">Normal</th><th class="r">At worst</th><th class="r">Change</th><th class="r">Starts moving</th></tr>'+[...r.mv,...r.still].map(x=>'<tr class="'+(x.moved?'':'dim')+'"><td>'+x.label+'</td><td class="r">'+fmt(x.base,x.dec)+' '+x.unit+'</td><td class="r">'+fmt(x.ext,x.dec)+' '+x.unit+'</td><td class="r">'+(x.moved?sgn(x.change,x.dec)+' '+x.unit+' ('+sgn(x.rel*100,0)+' %)':'no change')+'</td><td class="r">'+(x.moved?onsetTxt(x):'-')+'</td></tr>').join('')+'</table>';
  const C=[];
  C.push(r.alerts.length?'<b>Alerts in this window:</b> '+r.alerts.map(a=>escH(a.rule.name)+' ('+(a.sev==='crit'?'critical':'warning')+', '+dt(a.start)+')').join('; ')+'.':'No alerts in this window.');
  C.push(r.before?'Last truck to finish offloading before the event: <span class="mono">'+escH(r.before.plate)+'</span> at '+hhmm(r.before.offEnd)+', '+Math.round((r.ev.t0-r.before.offEnd)/MIN)+' min before. <button class="btn sm" data-trk="b">Camera</button>':'No truck offloaded before the event in the data.');
  C.push(r.during.length?'Trucks offloading in this window: '+r.during.length+'. '+r.during.slice(0,6).map((k,i)=>'<span class="mono">'+escH(k.plate)+'</span> '+hhmm(k.offStart)+' <button class="btn sm" data-trk="'+i+'">Camera</button>').join(' ')+(r.during.length>6?' ...':''):'No truck offloading in this window.');
  $('#anaCtx').innerHTML='<ul>'+C.map(x=>'<li>'+x+'</li>').join('')+'</ul><div class="note">Context only. Trucks are listed so you can check them against the offloading camera.</div>';
}
$('#anaSel').addEventListener('change',()=>{AN.idx=+$('#anaSel').value||0;renderAnalysis();});
$('#anaX').addEventListener('click',()=>{$('#ana').hidden=true;});
$('#ana').addEventListener('click',e=>{if(e.target.id==='ana')$('#ana').hidden=true;});
$('#anaCtx').addEventListener('click',e=>{const b=e.target.closest('button[data-trk]');if(!b||!AN.res)return;const k=b.dataset.trk==='b'?AN.res.before:AN.res.during[+b.dataset.trk];if(k)openTruck(k);});
$('#anaLog').addEventListener('click',()=>{$('#ana').hidden=true;gotoScreen('events');});
$('#anaCsv').addEventListener('click',()=>{
  const r=AN.res;if(!r)return;const ev=r.ev;
  const rows=metaRows([['Analysis',ev.title],['Event start',tsf(ev.t0)],['Event end',tsf(ev.t1)],['Row size','2 minutes'],['Normal level','average from 90 to 15 minutes before the event start']]);
  rows.push(['Time','In event'].concat(AN_PARAMS.map(a=>a[1]+' ('+a[2]+')')));
  r.P.forEach((p,i)=>rows.push([tsf(r.ts[i]),i>=r.i0&&i<=r.i1?'yes':''].concat(AN_PARAMS.map(a=>r1(p[a[0]]*(a[4]||1),a[3]+1)))));
  rows.push([]);rows.push(['Normal level',''].concat(AN_PARAMS.map(a=>r1(r.R[a[0]].base,a[3]+1))));
  rows.push(['Worst value',''].concat(AN_PARAMS.map(a=>r1(r.R[a[0]].ext,a[3]+1))));
  download('wte-analysis_'+fileTag()+'_'+slug(hhmm(ev.t0))+'.csv',csvText(rows));
});

/* ---- truck, LPR and offloading camera ---- */
const EVD={k:null,gate:null,off:null};
const camLink=(tpl,cam,from,to,plate)=>tpl.replace(/\{(\w+)\}/g,(m,key)=>{
  const v={cam:encodeURIComponent(cam),plate:encodeURIComponent(plate),from:encodeURIComponent(new Date(from).toISOString()),to:encodeURIComponent(new Date(to).toISOString()),fromMs:Math.round(from),toMs:Math.round(to),fromS:Math.floor(from/1000),toS:Math.floor(to/1000)}[key];
  return v===undefined?m:v;});
function truckState(k,now){return now<k.offStart?'Waiting at the scale':now<k.offEnd?'Offloading now':'Offloading done';}
function camMsg(t,bad){const el=$('#camMsg');if(!el)return;el.textContent=t;el.style.color=bad?'var(--red)':'var(--green)';}
function openTruck(k){
  EVD.k=k;EVD.gate={cam:k.lprCam,from:k.t-30000,to:k.t+60000};EVD.off={cam:k.offCam,from:k.offStart-30000,to:k.offEnd+30000};
  const now=Date.now(),tpl=lsGet('wtg_camtpl',''),row=(l,v)=>'<tr><td>'+l+'</td><td class="r">'+v+'</td></tr>';
  $('#evdBody').innerHTML='<div class="trkh"><div class="plate">'+escH(k.plate)+'</div><div><div class="muted">LPR read at the gate, confidence '+k.conf.toFixed(1)+' %</div><div><b>'+escH(k.supplier)+'</b>, ticket '+escH(k.id)+'</div><div class="muted">'+truckState(k,now)+'</div></div></div>'
   +'<table>'+row('Net weight',fmt(k.tons,2)+' t')+row('LPR read and weighbridge in',tsfs(k.t))+row('Offloading started, bay '+k.bay,k.offStart<=now?tsfs(k.offStart):'not yet')+row('Offloading finished',k.offEnd<=now?tsfs(k.offEnd):'in progress or waiting')+row('Time offloading',k.offEnd<=now?k.offMin+' min':'-')+row('Left the scale',k.exit<=now?tsfs(k.exit):'-')+'</table>'
   +'<h4 class="lh">Cameras</h4><div class="camgrid"><div class="camph"><b>'+k.lprCam+'</b><span>Gate and LPR camera</span><span>'+tsfs(k.t)+'</span><span>No camera connected (simulated)</span></div><div class="camph"><b>'+k.offCam+'</b><span>Offloading camera, bay '+k.bay+'</span><span>'+tsfs(k.offStart)+' to '+hhmmss(k.offEnd)+'</span><span>No camera connected (simulated)</span></div></div>'
   +'<div class="mact"><button class="btn pri" data-open="off">Open offloading camera clip</button><button class="btn" data-open="gate">Open gate camera clip</button><button class="btn" data-copy="off">Copy link</button><button class="btn" data-copy="range">Copy times</button></div>'
   +'<label class="ta">Camera playback link. Paste the link format of your camera system and mark where the camera and times go with {cam}, {from} and {to}.<input id="camTpl" value="'+escH(tpl)+'" placeholder="https://nvr.example.local/playback?cam={cam}&amp;from={from}&amp;to={to}"></label>'
   +'<div class="note">Also available: {plate}, {fromMs} and {toMs} (milliseconds), {fromS} and {toS} (seconds). {from} and {to} are UTC ISO times. The clip starts 30 seconds before and ends 30 seconds after the event. No LPR or camera system is connected in this demo, the plate and camera names are simulated.</div><div id="camMsg" class="status"></div>';
  $('#evd').hidden=false;updateCam();
}
function updateCam(){
  const el=$('#camTpl');if(!el)return;const tpl=el.value.trim();lsSet('wtg_camtpl',tpl);
  document.querySelectorAll('#evdBody [data-open],#evdBody [data-copy="off"]').forEach(b=>{b.disabled=!tpl;});
  camMsg(tpl?'':'Paste your camera playback link below to enable the camera buttons.',false);
}
async function copyText(t,done){try{await navigator.clipboard.writeText(t);camMsg(done,false);}catch(e){camMsg('The browser blocked copying. Copy this by hand: '+t,true);}}
$('#evdBody').addEventListener('input',e=>{if(e.target.id==='camTpl')updateCam();});
$('#evdBody').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!EVD.k)return;
  const tpl=$('#camTpl').value.trim(),k=EVD.k,c=b.dataset.open==='gate'?EVD.gate:EVD.off;
  if(b.dataset.open){
    if(!tpl)return;const url=camLink(tpl,c.cam,c.from,c.to,k.plate);
    if(!/^https?:\/\//i.test(url)){camMsg('The link must start with http:// or https://',true);return;}
    window.open(url,'_blank','noopener');camMsg('Opened the '+c.cam+' clip link.',false);
  }else if(b.dataset.copy==='off'){
    if(!tpl)return;copyText(camLink(tpl,EVD.off.cam,EVD.off.from,EVD.off.to,k.plate),'Link copied.');
  }else if(b.dataset.copy==='range'){
    copyText(EVD.off.cam+', '+tsfs(k.offStart)+' to '+tsfs(k.offEnd)+', plate '+k.plate+', ticket '+k.id+'; gate '+EVD.gate.cam+' at '+tsfs(k.t),'Times copied.');
  }
});
$('#evdX').addEventListener('click',()=>{$('#evd').hidden=true;});
$('#evd').addEventListener('click',e=>{if(e.target.id==='evd')$('#evd').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#ana').hidden=true;$('#evd').hidden=true;}});
$('#tickets').addEventListener('click',e=>{const tr=e.target.closest('tr[data-tk]');if(tr&&TKLIST[+tr.dataset.tk])openTruck(TKLIST[+tr.dataset.tk]);});
$('#drops').addEventListener('click',e=>{const b=e.target.closest('button[data-di]');if(!b)return;openAnalysis(DROPLIST.slice(0,60).map(dropToAna),+b.dataset.di);});

/* ---- operator log and events page ---- */
const OPS_KEY='wtg_ops';
function addOp(text){const a=lsGet(OPS_KEY,[]);a.push({t:Date.now(),text});lsSet(OPS_KEY,a.slice(-300));}
const EV={types:{alert:true,drop:true,truck:true,op:true},q:'',page:0,per:50,key:'',all:[],pageRows:[],mode:''};
function evPeriod(){
  const P=period();
  if(state.mode==='live'){return {t0:P.now-6*HOUR,t1:P.now,label:'Last 6 hours',range:dt(P.now-6*HOUR)+' to '+hhmm(P.now)};}
  return {t0:P.t0,t1:P.t1,label:P.label,range:P.range};
}
function opEvents(t0,t1){
  const out=[];
  lsGet(OPS_KEY,[]).forEach((o,i)=>{if(o.t>=t0&&o.t<t1)out.push({id:'op'+i+':'+o.t,t:o.t,type:'op',kind:'operator',sev:'info',title:o.text,detail:'operator action'});});
  ST.log.forEach((x,i)=>{if(x.t>=t0&&x.t<t1)out.push({id:'rep'+i+':'+x.t,t:x.t,type:'op',kind:'report',sev:x.status==='failed'?'warn':'info',title:'Carbon report ('+x.kind+'): '+(x.period||'')+', '+(STATUS_TXT[x.status]||x.status),detail:x.to||'-'});});
  return out;
}
function evBuild(){
  const p=evPeriod(),now=Date.now();
  const k=state.mode+'|'+Math.floor(now/(state.mode==='live'?5000:15000))+'|'+lsGet(OPS_KEY,[]).length+'|'+ST.log.length;
  if(EV.key!==k){EV.all=eventsBetween(p.t0,p.t1).concat(opEvents(p.t0,p.t1)).sort((a,b)=>b.t-a.t);EV.key=k;}
  if(EV.mode!==state.mode){EV.mode=state.mode;EV.page=0;}
  return p;
}
function evFiltered(){
  const q=EV.q.trim().toLowerCase();
  return EV.all.filter(e=>EV.types[e.type]&&(!q||(e.title+' '+e.detail+' '+(e.truck?e.truck.plate+' '+e.truck.id:'')).toLowerCase().includes(q)));
}
function renderEvents(){
  const p=evBuild();
  $('#plabel').textContent=p.label+', '+p.range;
  const cnt={alert:0,drop:0,truck:0,op:0};EV.all.forEach(e=>cnt[e.type]++);
  $('#evChips').innerHTML=[['alert','Alerts'],['drop','Output drops'],['truck','Trucks, LPR and offloading'],['op','Operator and reports']].map(([t,l])=>'<button data-t="'+t+'" class="'+(EV.types[t]?'on':'')+'">'+l+' ('+fmt(cnt[t])+')</button>').join('');
  const rows=evFiltered(),pages=Math.max(1,Math.ceil(rows.length/EV.per));
  if(EV.page>=pages)EV.page=pages-1;
  EV.pageRows=rows.slice(EV.page*EV.per,(EV.page+1)*EV.per);
  $('#evTable').innerHTML=EV.pageRows.length?'<table><tr><th>Time</th><th>Type</th><th>Event</th><th>Details</th><th></th></tr>'+EV.pageRows.map((e,i)=>'<tr><td class="nw">'+evSecs(e.t)+'</td><td><span class="tchip '+e.type+'">'+TYPE_TXT[e.type]+'</span></td><td><i class="sv '+e.sev+'"></i>'+escH(e.title)+'</td><td class="muted">'+escH(e.detail)+'</td><td class="r nw">'+(e.type==='truck'?'<button class="btn sm" data-i="'+i+'">Camera</button>':e.type==='drop'||e.type==='alert'?'<button class="btn sm" data-i="'+i+'">Analyze</button>':'')+'</td></tr>').join('')+'</table>':'<div class="empty">No events match</div>';
  $('#evPager').innerHTML='<button class="btn sm" data-p="-1"'+(EV.page<=0?' disabled':'')+'>Previous</button><span>Page '+(EV.page+1)+' of '+pages+', '+fmt(rows.length)+' events</span><button class="btn sm" data-p="1"'+(EV.page>=pages-1?' disabled':'')+'>Next</button>';
}
function evAna(e){return e.type==='drop'?dropToAna(e.drop):alertToAna(e.alert);}
$('#evTable').addEventListener('click',e=>{
  const b=e.target.closest('button[data-i]');if(!b)return;const ev=EV.pageRows[+b.dataset.i];if(!ev)return;
  if(ev.type==='truck')openTruck(ev.truck);else openAnalysis([evAna(ev)],0);
});
$('#evChips').addEventListener('click',e=>{const b=e.target.closest('button[data-t]');if(!b)return;EV.types[b.dataset.t]=!EV.types[b.dataset.t];EV.page=0;renderEvents();});
$('#evSearch').addEventListener('input',e=>{EV.q=e.target.value;EV.page=0;renderEvents();});
$('#evPager').addEventListener('click',e=>{const b=e.target.closest('button[data-p]');if(!b||b.disabled)return;EV.page+=+b.dataset.p;renderEvents();});
function eventsCsv(){
  const p=evPeriod(),list=evFiltered(),rows=metaRows([['Report','Event log'],['Period',p.label+' ('+p.range+')'],['Events',list.length]]);
  rows.push(['Time','Type','Severity','Event','Details','Plate (LPR)','Ticket','Offloading start','Offloading end','Offloading minutes','Offloading camera']);
  list.forEach(e=>{const k=e.truck;rows.push([tsfs(e.t),TYPE_TXT[e.type],e.sev,e.title,e.detail,k?k.plate:'',k?k.id:'',k?tsfs(k.offStart):'',k?tsfs(k.offEnd):'',k?k.offMin:'',k?k.offCam:'']);});
  return {name:'wte-event-log_'+fileTag()+'_'+slug(p.label)+'.csv',text:csvText(rows)};
}
function gotoScreen(sc,q){state.screen=sc;try{history.pushState(null,'','#/'+sc+(q?'?'+q:''));}catch(x){}route();window.scrollTo(0,0);}

function applyTpd(v,save){v=Math.round(v);if(!(v>=1))v=200;TPD=Math.min(5000,v);ENGINES=enginesNeeded();RATED_KW=contractKw();resetSim();if(typeof applyHybrid==='function')applyHybrid();alertCache={k:0,eps:[]};if(save)lsSet('wtg_tpd',TPD);}
applyTpd(lsGet('wtg_tpd',200),false);$('#tpd').value=TPD;
$('#tpd').addEventListener('input',e=>{const v=parseFloat(e.target.value);if(v>=1){applyTpd(v,true);tick(true);}});
$('#tpd').addEventListener('change',e=>{applyTpd(parseFloat(e.target.value),true);addOp('Throughput set to '+TPD+' t/day');e.target.value=TPD;tick(true);});
window.addEventListener('popstate',()=>{state.screen=pageOf(location.hash);route();});
window.addEventListener('hashchange',()=>{const p=pageOf(location.hash);if(p!==state.screen){state.screen=p;route();}});
window.addEventListener('resize',()=>tick(true));

