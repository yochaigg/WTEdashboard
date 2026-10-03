'use strict';
/* ================= Business pages: finance, what-if, grid export, impact ================= */

/* prices and costs, all placeholders until replaced with the plant's contracts */
const FIN=Object.assign({
  gate:45,          /* gate fee, EUR per tonne of waste received */
  own:8,            /* own electricity use, % of generation */
  peak:200,shoulder:200,off:200,    /* electricity price, EUR per MWh exported: fixed 0.20 EUR per kWh, same in every band */
  peakFrom:18,peakTo:22,offFrom:22,offTo:7,
  subsidy:0,        /* extra subsidy on top of the price, EUR per kWh exported (none: the 0.20 price already includes it) */
  capex:75,         /* project cost, EUR million */
  opexPct:7         /* operating cost per year, % of project cost (all in: staff, maintenance, consumables, insurance) */
},lsGet('wte_fin3',{}));
const saveFin=()=>lsSet('wte_fin3',FIN);
const opexYear=()=>FIN.capex*1e6*FIN.opexPct/100;

/* ---------- tariff bands ---------- */
function bandOf(h){const inR=(a,b)=>a<=b?(h>=a&&h<b):(h>=a||h<b);if(inR(FIN.peakFrom,FIN.peakTo))return 'peak';if(inR(FIN.offFrom,FIN.offTo))return 'off';return 'shoulder';}
const BAND_TXT={off:'Off-peak',shoulder:'Shoulder',peak:'Peak'};
const BAND_COL={off:'#5e7f99',shoulder:'#c98a4d',peak:'#ff8f45'};
const bandCache=new Map();
function bandDay(ds){   /* MWh exported per band for one day, cached once the day is over */
  const di=dayInfo(ds),now=Date.now(),key=di.start+'|'+FIN.peakFrom+FIN.peakTo+FIN.offFrom+FIN.offTo+'|'+FIN.own+'|'+TPD;
  if(bandCache.has(key))return bandCache.get(key);
  const r=bandRange(di.start,Math.min(di.end,now));if(di.end<=now)bandCache.set(key,r);return r;
}
function bandRange(t0,t1){
  const r={off:0,shoulder:0,peak:0,gen:0};const step=15*MIN;
  for(let t=t0;t<t1;){const len=Math.min(step,t1-t),p=plant(t+len/2),mwh=p.kw*len/HOUR/1000;r.gen+=mwh;r[bandOf(new Date(t+len/2).getHours())]+=mwh*(1-FIN.own/100);t+=len;}
  return r;
}
function bandsBetween(t0,t1){
  const r={off:0,shoulder:0,peak:0,gen:0};
  for(let d=dayInfo(t0).start;d<t1;d=dayInfo(d+30*HOUR).start){
    const di=dayInfo(d);const x=(di.start>=t0&&di.end<=t1)||(di.start>=t0&&di.end>Date.now()&&t1>=Date.now()-1000)?bandDay(d):bandRange(Math.max(t0,di.start),Math.min(t1,di.end));
    r.off+=x.off;r.shoulder+=x.shoulder;r.peak+=x.peak;r.gen+=x.gen;}
  return r;
}
const bandEur=b=>b.off*FIN.off+b.shoulder*FIN.shoulder+b.peak*FIN.peak;
function bucketEnd(b,i,bk,P){return i<bk.length-1?bk[i+1].t:P.now;}

/* ---------- money for an accumulator + its export bands ---------- */
function money(acc,bands,hours){
  const c=credits(acc),exp=bands.off+bands.shoulder+bands.peak;
  const rev={power:bandEur(bands),subsidy:exp*1000*FIN.subsidy,gate:acc.s.waste*FIN.gate,carbon:c.net*cfg.price};
  const cost={opex:opexYear()*hours/8760};
  const R=rev.power+rev.subsidy+rev.gate+rev.carbon,C=cost.opex;
  return {rev,cost,R,C,E:R-C,exp,c};
}

/* =====================================================================
   Finance
   ===================================================================== */
function finData(){
  const {P,bk}=D;
  const rows=bk.map((b,i)=>{if(!b.acc)return null;const t1=bucketEnd(b,i,bk,P);const bands=bandsBetween(b.t,t1);return money(b.acc,bands,b.acc.h);});
  const tot={rev:{power:0,subsidy:0,gate:0,carbon:0},cost:{opex:0},R:0,C:0,E:0,exp:0};
  rows.forEach(m=>{if(!m)return;for(const k in m.rev)tot.rev[k]+=m.rev[k];for(const k in m.cost)tot.cost[k]+=m.cost[k];tot.R+=m.R;tot.C+=m.C;tot.E+=m.E;tot.exp+=m.exp;});
  return {rows,tot};
}
function renderFinance(){
  const host=$('#pg_finance');
  if(onceEl('pg_finance',`<p class="lead">Revenue from electricity, gate fees and carbon credits, less operating costs, for the selected period. Electricity is sold at a fixed €0.20 per kWh; the price is set on the Grid export page. Every price and cost below is an assumption you can change.</p>
    <div class="kpis" id="finK"></div>
    <div class="grid2 mt"><div class="card"><h3>Revenue and costs <span id="finU"></span></h3><canvas id="c_fin" class="tall"></canvas><div class="legend"></div></div>
    <div class="card"><h3>Profit and loss <span id="finP"></span></h3><div id="finPL"></div></div></div>
    <div class="card mt"><h3>Prices and costs <span>assumptions, saved in this browser</span></h3><div class="fgrid" id="finF"></div>
    <div class="note">EBITDA means earnings before interest, tax, depreciation and amortisation. Operating cost is a yearly amount, a percentage of the project cost, spread evenly over every hour of the year, so a planned shutdown day still carries its share. Carbon credit price and factors are set on the Carbon credits page.</div></div>`)){
    attachTip($('#c_fin'));
    const F=[['gate','Gate fee (EUR per t waste)',1],['capex','Project cost (EUR million)',1],['opexPct','Operating cost (% of project cost a year)',0.5],['own','Own electricity use (%)',0.5]];
    $('#finF').innerHTML=F.map(f=>`<label class="field">${f[1]}<input type="number" step="${f[2]}" min="0" data-f="${f[0]}" value="${FIN[f[0]]}" ${can('edit')?'':'disabled'}></label>`).join('');
    $('#finF').addEventListener('change',e=>{const k=e.target.dataset.f;if(!k)return;const v=parseFloat(e.target.value);if(v>=0){FIN[k]=v;saveFin();bandCache.clear();tick(true);}});
  }
  const {P,bk}=D,f=finData(),t=f.tot,hrs=D.total.h||1;
  renderKpis($('#finK'),[
    {l:'Electricity sales',u:'EUR',v:t.rev.power+t.rev.subsidy,d:0,s:fmt(t.exp,1)+' MWh × '+cs(FIN.peak),c:'var(--power)'},
    {l:'Gate fees',u:'EUR',v:t.rev.gate,d:0,s:fmt(D.total.s.waste,1)+' t × '+cs(FIN.gate),c:'var(--waste)'},
    {l:'Carbon credits',u:'EUR',v:t.rev.carbon,d:0,s:fmt(credits(D.total).net,1)+' tCO2e × '+cs(cfg.price),c:'var(--carbon)'},
    {l:'Total revenue',u:'EUR',v:t.R,d:0,s:'electricity, gate fees and credits',c:'var(--money)'},
    {l:'Operating costs',u:'EUR',v:t.C,d:0,s:fmt(FIN.opexPct,1)+' % of '+cs(FIN.capex)+' M a year'},
    {l:'EBITDA',u:'EUR',v:t.E,d:0,s:'margin '+fmt(t.R?t.E/t.R*100:0,1)+' %',c:t.E>=0?'var(--money)':'var(--red)'},
    {l:'EBITDA per tonne',u:'EUR/t',v:D.total.s.waste?t.E/D.total.s.waste:0,d:1,s:fmt(D.total.s.waste,1)+' t processed'},
    {l:'Annual run rate',u:'EUR',v:t.E/hrs*24*360,d:0,s:'EBITDA at this rate for 360 days'}
  ]);
  $('#finU').textContent=curCode()+' '+UNIT_PER[state.mode];$('#finP').textContent='('+P.label.toLowerCase()+')';
  drawChart($('#c_fin'),{labels:bk.map(b=>b.label),series:[
    {name:'Electricity tariff',color:'#ff8f45',type:'bar',data:f.rows.map(m=>m&&(m.rev.power)*curRate()),dec:0},
    {name:'Gate fees',color:'#c4ad86',type:'bar',data:f.rows.map(m=>m&&(m.rev.gate)*curRate()),dec:0},
    {name:'Carbon credits',color:'#86c99a',type:'bar',data:f.rows.map(m=>m&&(m.rev.carbon)*curRate()),dec:0},
    {name:'Costs',color:'#5d6a77',type:'bar',data:f.rows.map(m=>m&&(-m.C)*curRate()),dec:0},
    {name:'EBITDA',color:'#d9c46a',type:'line',data:f.rows.map(m=>m&&(m.E)*curRate()),dec:0}]});
  const L=(a,b,c,cls)=>`<tr${cls?` class="${cls}"`:''}><td>${a}</td><td class="r muted">${b}</td><td class="r num">${c}</td></tr>`;
  $('#finPL').innerHTML='<table>'+
    L('Electricity',fmt(t.exp,1)+' MWh exported'+(FIN.peak===FIN.off&&FIN.off===FIN.shoulder?' × '+cs(FIN.peak):''),eur(t.rev.power))+(t.rev.subsidy?L('Electricity, subsidy',fmt(t.exp*1000)+' kWh × '+cs(FIN.subsidy,2),eur(t.rev.subsidy)):'')+L('Gate fees',fmt(D.total.s.waste,1)+' t × '+cs(FIN.gate),eur(t.rev.gate))+L('Carbon credits',fmt(credits(D.total).net,1)+' tCO2e × '+cs(cfg.price),eur(t.rev.carbon))+
    L('<b>Revenue</b>','','<b>'+eur(t.R)+'</b>')+
    L('<b>Operating costs</b>',fmt(FIN.opexPct,1)+' % × '+cs(FIN.capex)+' M a year, '+(hrs<48?fmt(hrs,1)+' h':fmt(hrs/24,1)+' days')+' of 365 days','<b>-'+eur(t.C)+'</b>')+L('<b>EBITDA</b>','','<b class="'+(t.E>=0?'pos':'neg')+'">'+eur(t.E)+'</b>')+'</table>';
}
PAGES.finance={title:'Finance',period:true,render:renderFinance,csv:()=>{const f=finData();const rows=metaRows([['Report','Profit and loss'],['Period',D.P.label+' ('+D.P.range+')'],['Gate fee EUR/t',FIN.gate],['Tariff EUR/MWh off-peak, shoulder, peak',FIN.off+', '+FIN.shoulder+', '+FIN.peak],['Subsidy EUR/kWh exported',FIN.subsidy],['Project cost EUR million',FIN.capex],['Operating cost % of project cost a year',FIN.opexPct],['Credit price EUR/tCO2e',cfg.price]]);
  rows.push(['Period','Electricity tariff EUR','Subsidy EUR','Gate fees EUR','Carbon credits EUR','Revenue EUR','Operating costs EUR','EBITDA EUR']);
  D.bk.forEach((b,i)=>{const m=f.rows[i];if(m)rows.push([tsf(b.t),r1(m.rev.power,0),r1(m.rev.subsidy,0),r1(m.rev.gate,0),r1(m.rev.carbon,0),r1(m.R,0),r1(m.C,0),r1(m.E,0)]);});
  const t=f.tot;rows.push(['TOTAL',r1(t.rev.power,0),r1(t.rev.subsidy,0),r1(t.rev.gate,0),r1(t.rev.carbon,0),r1(t.R,0),r1(t.C,0),r1(t.E,0)]);return {name:'profit-and-loss_'+fileTag()+'_'+slug(D.P.label)+'.csv',text:csvText(rows)};}};

/* =====================================================================
   What-if simulator
   ===================================================================== */
function avgTariff(){let s=0;for(let h=0;h<24;h++)s+=FIN[bandOf(h)];return s/24;}
function wiBase(){return {tpd:TPD,days:360,h2:40,eff:34,price:Math.round(avgTariff()),sub:FIN.subsidy,gate:FIN.gate,cprice:cfg.price,capex:FIN.capex,opex:FIN.opexPct};}
let WI=Object.assign(wiBase(),lsGet('wte_wi3',{}));
const WI_SL=[
  ['tpd','Waste throughput','t/day',50,600,10,0],['days','Operating days','days per year',300,365,1,0],['h2','Hydrogen in syngas','%',25,50,0.5,1],['eff','Engine electrical efficiency','%',28,42,0.5,1],
  ['price','Electricity price','EUR per MWh',40,300,1,0],['gate','Gate fee','EUR per t',0,150,1,0],['cprice','Carbon credit price','EUR per tCO2e',0,150,1,0],['capex','Project cost','EUR million',10,200,1,0],['opex','Operating cost','% of project cost a year',2,15,0.5,1]];
function wiModel(x){
  const briqPerT=0.88,gasPerKgBriq=2.0,toGen=0.97;
  const lhv=(22*12.63+x.h2*10.78+3*35.8)/100/3.6;      /* kWh per Nm3, same gas model as the plant */
  const waste=x.tpd*x.days,gas=waste*briqPerT*1000*gasPerKgBriq*toGen;
  const mwh=gas*lhv*(x.eff/100)/1000,exp=mwh*(1-FIN.own/100);
  const co2=gas*((22+3+14)/100)*1.963/1000;           /* t CO2 from the engines */
  const cr=waste*cfg.land+mwh*cfg.disp-co2*cfg.fossil/100;
  const rev={power:exp*x.price,subsidy:exp*1000*x.sub,gate:waste*x.gate,carbon:cr*x.cprice};
  const cost={opex:x.capex*1e6*x.opex/100};
  const R=rev.power+rev.subsidy+rev.gate+rev.carbon,C=cost.opex,E=R-C;
  const mw=x.tpd/24*briqPerT*1000*gasPerKgBriq*toGen*lhv*(x.eff/100)/1000;
  return {waste,mwh,exp,cr,rev,cost,R,C,E,payback:E>0?x.capex*1e6/E:Infinity,engines:Math.max(1,Math.ceil(mw*1.05/(ENG_KW/1000))),mw};
}
function renderWhatif(){
  if(onceEl('pg_whatif',`<p class="lead">Move the sliders to see a full year of the plant under different conditions. The plant model is the same one the dashboard runs on. Operating cost is a percentage of the project cost.</p>
    <div class="grid2"><div class="card"><h3>Scenario</h3><div id="wiS"></div><div class="mact"><button class="btn" id="wiReset">Reset to current plant</button><button class="btn pri" id="wiSave">Save scenario</button></div></div>
    <div class="stack"><div class="card"><h3>Payback</h3><div class="payback" id="wiPay"></div><div class="muted" id="wiPayS"></div></div>
    <div class="card"><h3>One year <span>compared with the current plant settings</span></h3><div class="bigres" id="wiR"></div></div>
    <div class="card"><h3>Cumulative cash over 15 years <span><span class="curc">EUR</span> million, before financing and tax</span></h3><canvas id="c_wi"></canvas><div class="legend"></div></div></div></div>
    <div class="card mt"><h3>Saved scenarios</h3><div class="scrollx" id="wiList"></div></div>`)){
    $('#wiS').innerHTML=WI_SL.map(s=>`<div class="sl"><label for="wi_${s[0]}">${s[1]} <span class="muted">${s[2]}</span></label><output id="wo_${s[0]}"></output><input type="range" id="wi_${s[0]}" data-k="${s[0]}" min="${s[3]}" max="${s[4]}" step="${s[5]}"></div>`).join('');
    $('#wiS').addEventListener('input',e=>{const k=e.target.dataset.k;if(!k)return;WI[k]=parseFloat(e.target.value);lsSet('wte_wi3',WI);renderWhatif();});
    $('#wiReset').addEventListener('click',()=>{WI=wiBase();lsSet('wte_wi3',WI);renderWhatif();});
    $('#wiSave').addEventListener('click',()=>{const L=lsGet('wte_wi_list',[]);const nm='Scenario '+(L.length+1);L.push({name:nm,x:Object.assign({},WI),t:Date.now()});lsSet('wte_wi_list',L.slice(-8));renderWhatif();});
    $('#wiList').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const L=lsGet('wte_wi_list',[]);const i=+b.dataset.i;if(b.dataset.a==='load'&&L[i]){WI=Object.assign({},L[i].x);lsSet('wte_wi3',WI);}if(b.dataset.a==='del'){L.splice(i,1);lsSet('wte_wi_list',L);}renderWhatif();});
    attachTip($('#c_wi'));
  }
  WI_SL.forEach(s=>{const i=$('#wi_'+s[0]);if(+i.value!==WI[s[0]])i.value=WI[s[0]];$('#wo_'+s[0]).textContent=fmt(WI[s[0]],s[6]);});
  const m=wiModel(WI),b=wiModel(wiBase());
  const dl=(v,bv,f)=>{const d=v-bv;return Math.abs(d)<1e-9?'<small>same as now</small>':'<small class="'+(d>0?'pos':'neg')+'">'+(d>0?'+':'-')+f(Math.abs(d))+' vs now</small>';};
  $('#wiPay').innerHTML=isFinite(m.payback)?fmt(m.payback,1)+'<small>years</small>':'Never<small>EBITDA is negative</small>';
  $('#wiPayS').textContent=cs(WI.capex)+' million project cost divided by '+eurK(m.E)+' EBITDA a year. '+m.engines+' × J620 needed for '+fmt(m.mw,1)+' MW.';
  const R=[['Waste processed',fmt(m.waste)+' t',m.waste,b.waste,v=>fmt(v)+' t'],['Electricity generated',fmt(m.mwh)+' MWh',m.mwh,b.mwh,v=>fmt(v)+' MWh'],['Net carbon credits',fmt(m.cr)+' tCO2e',m.cr,b.cr,v=>fmt(v)+' t'],
    ['Revenue',eurK(m.R),m.R,b.R,eurK],['Operating costs',eurK(m.C),m.C,b.C,eurK],['EBITDA',eurK(m.E),m.E,b.E,eurK]];
  $('#wiR').innerHTML=R.map(r=>`<div><span>${r[0]}</span><b>${r[1]}</b>${dl(r[2],r[3],r[4])}</div>`).join('');
  const yrs=[...Array(16).keys()],cum=yrs.map(y=>(-WI.capex*1e6+m.E*y)/1e6*curRate()),cumB=yrs.map(y=>(-wiBase().capex*1e6+b.E*y)/1e6*curRate());
  drawChart($('#c_wi'),{labels:yrs.map(y=>'Year '+y),series:[{name:'This scenario',color:'#d9c46a',type:'line',data:cum,dec:1},{name:'Current plant',color:'#5d6a77',type:'line',data:cumB,dec:1}],limits:[{v:0,color:'#8a97a4',label:'break-even'}]});
  const L=lsGet('wte_wi_list',[]);
  $('#wiList').innerHTML=L.length?'<table><tr><th>Name</th><th class="r">t/day</th><th class="r">Days</th><th class="r">H₂ %</th><th class="r">EUR/MWh</th><th class="r">Gate fee</th><th class="r">Credit price</th><th class="r">EBITDA a year</th><th class="r">Payback</th><th></th></tr>'+L.map((s,i)=>{const r=wiModel(s.x);return `<tr><td>${esch(s.name)}</td><td class="r">${fmt(s.x.tpd)}</td><td class="r">${s.x.days}</td><td class="r">${fmt(s.x.h2,1)}</td><td class="r">${fmt(s.x.price)}</td><td class="r">${fmt(s.x.gate)}</td><td class="r">${fmt(s.x.cprice)}</td><td class="r">${eurK(r.E)}</td><td class="r">${isFinite(r.payback)?fmt(r.payback,1)+' years':'never'}</td><td class="r nw"><button class="btn sm" data-a="load" data-i="${i}">Load</button> <button class="btn sm" data-a="del" data-i="${i}">Delete</button></td></tr>`;}).join('')+'</table>':'<div class="empty">Save a scenario to compare it here.</div>';
}
PAGES.whatif={title:'What-if',period:false,still:true,render:renderWhatif,sub:()=>'A full year under the conditions you set'};

/* =====================================================================
   Grid export
   ===================================================================== */
function renderGrid(){
  if(onceEl('pg_grid',`<p class="lead">Electricity generated, what the plant uses itself and what goes to the grid, and what it earns.</p>
    <div class="kpis" id="grK"></div>
    <div class="grid2 mt"><div class="card"><h3>Exported by tariff band <span id="grU"></span></h3><canvas id="c_gr" class="tall"></canvas><div class="legend"></div></div>
    <div class="card"><h3>Export through the day <span>average kW by hour, shaded by band</span></h3><canvas id="c_grh" class="tall"></canvas><div class="legend"></div></div></div>
    <div class="grid2 mt"><div class="card"><h3>Earnings by band <span id="grP"></span></h3><div id="grT"></div></div>
    <div class="card"><h3>Tariff <span>EUR per MWh, saved in this browser</span></h3><div class="fgrid" id="grF"></div><div class="note">Electricity is sold at a fixed €200 per MWh (€0.20 per kWh), so all three bands are set to 200. If a time-of-day tariff applies later, set different prices here. Hours not in peak or off-peak count as shoulder.</div></div></div>`)){
    attachTip($('#c_gr'));attachTip($('#c_grh'));
    const F=[['off','Off-peak price'],['shoulder','Shoulder price'],['peak','Peak price'],['peakFrom','Peak starts (hour)'],['peakTo','Peak ends (hour)'],['offFrom','Off-peak starts (hour)'],['offTo','Off-peak ends (hour)']];
    $('#grF').innerHTML=F.map(f=>`<label class="field">${f[1]}<input type="number" min="0" max="${/From|To/.test(f[0])?24:1000}" step="1" data-f="${f[0]}" value="${FIN[f[0]]}" ${can('edit')?'':'disabled'}></label>`).join('');
    $('#grF').addEventListener('change',e=>{const k=e.target.dataset.f;if(!k)return;const v=parseFloat(e.target.value);if(v>=0){FIN[k]=v;saveFin();bandCache.clear();tick(true);}});
  }
  const {P,bk}=D;
  const per=bk.map((b,i)=>b.acc?bandsBetween(b.t,bucketEnd(b,i,bk,P)):null);
  const tot={off:0,shoulder:0,peak:0,gen:0};per.forEach(x=>{if(x){tot.off+=x.off;tot.shoulder+=x.shoulder;tot.peak+=x.peak;tot.gen+=x.gen;}});
  const exp=tot.off+tot.shoulder+tot.peak,eurT=bandEur(tot),hrs=D.total.h||1;
  renderKpis($('#grK'),[{l:'Generated',u:'MWh',v:tot.gen,d:1,s:'average '+fmt(tot.gen/hrs,2)+' MW'},{l:'Own use',u:'MWh',v:tot.gen-exp,d:1,s:fmt(FIN.own,1)+' % of generation'},{l:'Exported to grid',u:'MWh',v:exp,d:1,s:'average '+fmt(exp/hrs,2)+' MW'},{l:'Export earnings',u:'EUR',v:eurT+exp*1000*FIN.subsidy,d:0,s:FIN.subsidy?eur(eurT)+' price plus '+eur(exp*1000*FIN.subsidy)+' subsidy':'at the price below'},{l:'Realised price',u:'EUR/MWh',v:exp?(eurT/exp+FIN.subsidy*1000):0,d:0,s:FIN.peak===FIN.off&&FIN.off===FIN.shoulder?'fixed price, same at every hour':'average over the bands'}]);
  $('#grU').textContent='MWh '+UNIT_PER[state.mode];$('#grP').textContent='('+P.label.toLowerCase()+')';
  drawChart($('#c_gr'),{labels:bk.map(b=>b.label),series:['off','shoulder','peak'].map(k=>({name:BAND_TXT[k],color:BAND_COL[k],type:'bar',data:per.map(x=>x&&x[k]),dec:2}))});
  const now=Date.now(),hk=[...Array(24)].map(()=>[0,0]);const span=Math.max(DAY,Math.min(P.now-P.t0,7*DAY));
  for(let t=Math.floor((now-span)/(30*MIN))*30*MIN;t<now;t+=30*MIN){const h=new Date(t).getHours();hk[h][0]+=plant(t).kw*(1-FIN.own/100);hk[h][1]++;}
  const prof=hk.map(x=>x[1]?x[0]/x[1]:null),bands=[];let s=0;for(let h=1;h<=24;h++){if(h===24||bandOf(h)!==bandOf(s)){bands.push({i0:s-0.5<0?0:s-0.5,i1:Math.min(23,h-0.5),color:bandOf(s)==='peak'?'rgba(255,143,69,.13)':bandOf(s)==='off'?'rgba(94,127,153,.12)':'rgba(201,138,77,.06)'});s=h;}}
  drawChart($('#c_grh'),{labels:[...Array(24).keys()].map(h=>pad(h)+':00'),series:[{name:'Export kW',color:'#ff8f45',type:'line',data:prof,dec:0}],bands});
  $('#grT').innerHTML='<table><tr><th>Band</th><th class="r">MWh</th><th class="r">EUR per MWh</th><th class="r">Earnings</th><th class="r">Share</th></tr>'+['off','shoulder','peak'].map(k=>`<tr><td><i class="sv" style="background:${BAND_COL[k]}"></i>${BAND_TXT[k]}</td><td class="r">${fmt(tot[k],1)}</td><td class="r">${fmt(FIN[k])}</td><td class="r">${eur(tot[k]*FIN[k])}</td><td class="r">${fmt(eurT?tot[k]*FIN[k]/eurT*100:0,0)} %</td></tr>`).join('')+`<tr><td>Tariff total</td><td class="r">${fmt(exp,1)}</td><td class="r">${fmt(exp?eurT/exp:0,1)}</td><td class="r">${eur(eurT)}</td><td></td></tr>${FIN.subsidy?`<tr><td>Subsidy</td><td class="r">${fmt(exp,1)}</td><td class="r">${fmt(FIN.subsidy*1000)}</td><td class="r">${eur(exp*1000*FIN.subsidy)}</td><td></td></tr>`:''}<tr><td><b>Total</b></td><td class="r"><b>${fmt(exp,1)}</b></td><td class="r">${fmt(exp?eurT/exp+FIN.subsidy*1000:0,1)}</td><td class="r"><b>${eur(eurT+exp*1000*FIN.subsidy)}</b></td><td></td></tr></table>`+
    (FIN.peak===FIN.off&&FIN.off===FIN.shoulder?'':`<div class="note">The engines run flat out around the clock, so each band earns in proportion to its hours. Holding gas in a buffer to run harder in the ${FIN.peakFrom}:00 to ${FIN.peakTo}:00 peak would raise the realised price.</div>`);
}
PAGES.grid={title:'Grid export',period:true,render:renderGrid,csv:()=>{const {P,bk}=D;const rows=metaRows([['Report','Grid export by tariff band'],['Period',P.label+' ('+P.range+')'],['Own use %',FIN.own],['Tariff EUR/MWh off, shoulder, peak',FIN.off+', '+FIN.shoulder+', '+FIN.peak]]);rows.push(['Period','Generated MWh','Off-peak MWh','Shoulder MWh','Peak MWh','Earnings EUR']);bk.forEach((b,i)=>{if(!b.acc)return;const x=bandsBetween(b.t,bucketEnd(b,i,bk,P));rows.push([tsf(b.t),r1(x.gen,3),r1(x.off,3),r1(x.shoulder,3),r1(x.peak,3),r1(bandEur(x),0)]);});return {name:'grid-export_'+fileTag()+'_'+slug(P.label)+'.csv',text:csvText(rows)};}};

/* =====================================================================
   Impact (ESG)
   ===================================================================== */
const ESG=Object.assign({home:3500,car:4.6,dens:0.9,dieselL:270},lsGet('wte_esg',{}));
function impactData(){
  const c=credits(D.total),hrs=D.total.h||1,exp=D.total.s.kwh*(1-FIN.own/100);
  return {c,homes:exp/(ESG.home*hrs/8760),cars:c.net/ESG.car,m3:c.waste/ESG.dens,diesel:D.total.s.kwh/1000*ESG.dieselL,exp};
}
const ICO={home:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ff8f45" stroke-width="1.6"><path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-6h4v6"/></svg>',car:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#86c99a" stroke-width="1.6"><path d="M3 15l2-6h14l2 6v4H3z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></svg>',fill:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c4ad86" stroke-width="1.6"><path d="M2 20l6-9 4 5 3-3 7 7z"/></svg>',drop:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#8ccbe0" stroke-width="1.6"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>'};
function renderImpact(){
  if(onceEl('pg_impact',`<p class="lead">What the plant's output means in everyday terms, for reports, investors and the community. Each comparison uses a stated factor you can change.</p>
    <div class="impact-hero" id="imH"></div>
    <div class="sharecard mt" id="imCard"></div>
    <div class="mact"><button class="btn pri" id="imCopy">Copy summary</button><button class="btn" id="imPng">Download as image</button><span class="status" id="imMsg"></span></div>
    <div class="card mt"><h3>Comparison factors <span>saved in this browser</span></h3><div class="fgrid">
      <label class="field">Electricity per home (kWh per year)<input type="number" data-e="home" step="100"></label>
      <label class="field">CO₂ per car (t per year)<input type="number" data-e="car" step="0.1"></label>
      <label class="field">Landfill density (t per m³)<input type="number" data-e="dens" step="0.05"></label>
      <label class="field">Diesel for a genset (litres per MWh)<input type="number" data-e="dieselL" step="5"></label></div>
      <div class="note">Defaults: 3,500 kWh per home a year (typical European household), 4.6 t CO₂ per passenger car a year (US EPA figure), compacted landfill waste at 0.9 t per m³, and 270 litres of diesel per MWh from a diesel generator. Credits use the factors on the Carbon credits page.</div></div>`)){
    document.querySelectorAll('#pg_impact input[data-e]').forEach(i=>{i.value=ESG[i.dataset.e];i.addEventListener('change',()=>{const v=parseFloat(i.value);if(v>0){ESG[i.dataset.e]=v;lsSet('wte_esg',ESG);tick(true);}});});
    $('#imCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(impactText());$('#imMsg').textContent='Summary copied.';}catch(e){$('#imMsg').textContent='Copy is blocked by the browser.';}});
    $('#imPng').addEventListener('click',impactPng);
  }
  const x=impactData(),P=D.P;
  $('#imH').innerHTML=[[ICO.home,fmt(x.homes),'homes supplied with electricity, at this rate for a year'],[ICO.car,fmt(x.cars),'cars off the road for a year, from '+fmt(x.c.net,0)+' tCO2e of net credits'],[ICO.fill,fmt(x.m3),'m³ of landfill space saved by '+fmt(x.c.waste,0)+' t of waste'],[ICO.drop,fmtB(x.diesel),'litres of diesel not burned for '+fmt(D.total.s.kwh/1000,0)+' MWh']].map(r=>`<div class="ih">${r[0]}<div><b>${r[1]}</b><span>${r[2]}</span></div></div>`).join('');
  $('#imCard').innerHTML=`<h3>Central Orbit, ${P.label.toLowerCase()}</h3><p>Turned ${fmt(x.c.waste,0)} tonnes of waste into ${fmt(D.total.s.kwh/1000,0)} MWh of electricity.</p><p class="muted">That is power for ${fmt(x.homes)} homes and ${fmt(x.c.net,0)} tCO2e kept out of the air, the same as taking ${fmt(x.cars)} cars off the road for a year.</p>`;
}
function impactText(){const x=impactData(),P=D.P;return `Central Orbit waste to energy, ${P.label.toLowerCase()} (${P.range}):\n- ${fmt(x.c.waste,0)} t of waste kept out of landfill (${fmt(x.m3)} m³ of space)\n- ${fmt(D.total.s.kwh/1000,0)} MWh of electricity, enough for ${fmt(x.homes)} homes\n- ${fmt(x.c.net,0)} tCO2e net, like ${fmt(x.cars)} cars off the road for a year\n- ${fmtB(x.diesel)} litres of diesel not burned`;}
function impactPng(){
  const x=impactData(),P=D.P,cv=document.createElement('canvas');cv.width=1200;cv.height=630;const c=cv.getContext('2d');
  const g=c.createLinearGradient(0,0,1200,630);g.addColorStop(0,'#1e2a24');g.addColorStop(1,'#151c23');c.fillStyle=g;c.fillRect(0,0,1200,630);
  c.fillStyle='#ff8f45';c.beginPath();c.arc(84,84,22,0,7);c.fill();
  c.fillStyle='#e5ebf0';c.font='600 34px "Barlow Semi Condensed",sans-serif';c.fillText('Central Orbit',124,96);
  c.fillStyle='#8a97a4';c.font='400 24px Barlow,sans-serif';c.fillText('Waste to energy, '+P.label.toLowerCase(),60,170);
  const st=[[fmt(x.c.waste,0)+' t','waste kept out of landfill'],[fmt(D.total.s.kwh/1000,0)+' MWh','electricity generated'],[fmt(x.homes),'homes supplied'],[fmt(x.c.net,0)+' tCO2e','net carbon credits']];
  st.forEach((s,i)=>{const X=60+(i%2)*560,Y=280+Math.floor(i/2)*170;c.fillStyle='#e5ebf0';c.font='600 72px "Barlow Semi Condensed",sans-serif';c.fillText(s[0],X,Y);c.fillStyle='#8a97a4';c.font='400 26px Barlow,sans-serif';c.fillText(s[1],X,Y+42);});
  c.fillStyle='#5d6a77';c.font='400 18px Barlow,sans-serif';c.fillText(P.range,60,600);
  cv.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='central-orbit-impact_'+slug(P.label)+'.png';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);});
}
PAGES.impact={title:'Impact',period:true,render:renderImpact,csv:()=>{const x=impactData();const rows=metaRows([['Report','Impact summary'],['Period',D.P.label+' ('+D.P.range+')']]);rows.push(['Measure','Value','Factor']);[['Homes supplied (annualised)',r1(x.homes,0),ESG.home+' kWh per home a year'],['Cars off the road for a year',r1(x.cars,0),ESG.car+' t CO2 per car a year'],['Landfill space saved m3',r1(x.m3,0),ESG.dens+' t per m3'],['Diesel not burned litres',r1(x.diesel,0),ESG.dieselL+' L per MWh'],['Net carbon credits tCO2e',r1(x.c.net,1),'Carbon credits page']].forEach(r=>rows.push(r));return {name:'impact_'+fileTag()+'_'+slug(D.P.label)+'.csv',text:csvText(rows)};}};
