'use strict';
/* ================= Business pages (gas version): finance, what-if, gas sales, impact =================
   The plant sells cleaned syngas to a glass factory, where it replaces natural gas in the furnace.
   Basis from the plant owner: 1 t of waste gives 1,000 Nm3 of syngas, sold as 40 MMBtu per 1,000 Nm3,
   priced per MMBtu at a discount to the natural gas price. */

const FIN=Object.assign({
  ng:21.5,          /* natural gas price, EUR per MMBtu (EU gas 73.3 EUR/MWh on 2 Oct 2026 = 21.5 EUR/MMBtu) */
  mmbtu:40,         /* MMBtu sold per 1,000 Nm3 of syngas */
  disc:25,          /* syngas discount against natural gas, % */
  gate:45,          /* gate fee, EUR per tonne of waste received */
  elec:0.15,        /* electricity the plant buys, EUR per kWh */
  capex:75,         /* project cost, EUR million */
  opexPct:7,        /* operating cost per year, % of project cost */
  own:0             /* kept for shared code: no electricity is generated in this version */
},lsGet('wtg_fin2',{}));
const saveFin=()=>{lsSet('wtg_fin2',FIN);};
SALE_MMBTU=FIN.mmbtu;
const mmbtuOf=kwh=>kwh/KWH_PER_MMBTU;
const opexYear=()=>FIN.capex*1e6*FIN.opexPct/100;
const gasPrice=()=>FIN.ng*(1-FIN.disc/100);          /* EUR per MMBtu of syngas */
const bandCache=new Map();                            /* kept for shared code */
function bucketEnd(b,i,bk,P){return i<bk.length-1?bk[i+1].t:P.now;}

/* ---------- money for an accumulator ---------- */
function money(acc,_unused,hours){
  const c=credits(acc),mwh=acc.s.kwh/1000,mm=mmbtuOf(acc.s.kwh),ownKwh=avgOf(acc,'ownKw')*acc.h;
  const rev={gas:mm*gasPrice(),gate:acc.s.waste*FIN.gate,carbon:c.net*cfg.price};
  const cost={opex:opexYear()*hours/8760,elec:ownKwh*FIN.elec};
  const R=rev.gas+rev.gate+rev.carbon,C=cost.opex+cost.elec;
  return {rev,cost,R,C,E:R-C,mwh,mm,ownKwh,save:mm*FIN.ng*FIN.disc/100,c};
}
function bandsBetween(){return null;}

/* =====================================================================
   Finance
   ===================================================================== */
function finData(){
  const {bk}=D;
  const rows=bk.map(b=>b.acc?money(b.acc,null,b.acc.h):null);
  const tot={rev:{gas:0,gate:0,carbon:0},cost:{opex:0,elec:0},R:0,C:0,E:0,mwh:0,mm:0,ownKwh:0,save:0};
  rows.forEach(m=>{if(!m)return;for(const k in m.rev)tot.rev[k]+=m.rev[k];for(const k in m.cost)tot.cost[k]+=m.cost[k];['R','C','E','mwh','mm','ownKwh','save'].forEach(k=>tot[k]+=m[k]);});
  return {rows,tot};
}
function renderFinance(){
  if(onceEl('pg_finance',`<p class="lead">Revenue from syngas sold to the glass factory, gate fees and carbon credits, less operating costs and the electricity the plant buys, for the selected period. Every price and cost below is an assumption you can change.</p>
    <div class="kpis" id="finK"></div>
    <div class="grid2 mt"><div class="card"><h3>Revenue and costs <span id="finU"></span></h3><canvas id="c_fin" class="tall"></canvas><div class="legend"></div></div>
    <div class="card"><h3>Profit and loss <span id="finP"></span></h3><div id="finPL"></div></div></div>
    <div class="card mt"><h3>Prices and costs <span>assumptions, saved in this browser</span></h3><div class="fgrid" id="finF"></div>
    <div class="note">EBITDA means earnings before interest, tax, depreciation and amortisation. Operating cost is a yearly amount, a percentage of the project cost, spread evenly over every hour of the year. Carbon credit price and factors are set on the Carbon credits page.</div></div>`)){
    attachTip($('#c_fin'));
    const F=[['ng','Natural gas price (EUR per MMBtu)',0.1],['disc','Syngas discount to natural gas (%)',1],['mmbtu','MMBtu sold per 1,000 Nm³ of syngas',0.5],['gate','Gate fee (EUR per t waste)',1],['elec','Electricity bought (EUR per kWh)',0.01],['capex','Project cost (EUR million)',1],['opexPct','Operating cost (% of project cost a year)',0.5]];
    $('#finF').innerHTML=F.map(f=>`<label class="field">${f[1]}<input type="number" step="${f[2]}" min="0" data-f="${f[0]}" value="${FIN[f[0]]}" ${can('edit')?'':'disabled'}></label>`).join('');
    $('#finF').addEventListener('change',e=>{const k=e.target.dataset.f;if(!k)return;const v=parseFloat(e.target.value);if(v>=0){FIN[k]=v;saveFin();if(k==='mmbtu')applyMmbtu();tick(true);}});
  }
  const {P,bk}=D,f=finData(),t=f.tot,hrs=D.total.h||1;
  renderKpis($('#finK'),[
    {l:'Revenue',u:'EUR',v:t.R,d:0,s:'syngas, gate fees, credits'},
    {l:'Operating costs',u:'EUR',v:t.C,d:0,s:fmt(FIN.opexPct,1)+' % of €'+fmt(FIN.capex)+' M a year, plus electricity'},
    {l:'EBITDA',u:'EUR',v:t.E,d:0,s:'margin '+fmt(t.R?t.E/t.R*100:0,1)+' %',c:t.E>=0?'var(--money)':'var(--red)'},
    {l:'Factory saving',u:'EUR',v:t.save,d:0,s:fmt(FIN.disc)+' % below its natural gas bill'},
    {l:'Annual run rate',u:'EUR',v:t.E/hrs*24*365,d:0,s:'EBITDA at this rate for a year'}
  ]);
  $('#finU').textContent='EUR '+UNIT_PER[state.mode];$('#finP').textContent='('+P.label.toLowerCase()+')';
  drawChart($('#c_fin'),{labels:bk.map(b=>b.label),series:[
    {name:'Syngas sales',color:'#8ccbe0',type:'bar',data:f.rows.map(m=>m&&m.rev.gas),dec:0},
    {name:'Gate fees',color:'#c4ad86',type:'bar',data:f.rows.map(m=>m&&m.rev.gate),dec:0},
    {name:'Carbon credits',color:'#86c99a',type:'bar',data:f.rows.map(m=>m&&m.rev.carbon),dec:0},
    {name:'Costs',color:'#5d6a77',type:'bar',data:f.rows.map(m=>m&&-m.C),dec:0},
    {name:'EBITDA',color:'#d9c46a',type:'line',data:f.rows.map(m=>m&&m.E),dec:0}]});
  const L=(a,b,c)=>`<tr><td>${a}</td><td class="r muted">${b}</td><td class="r num">${c}</td></tr>`;
  $('#finPL').innerHTML='<table>'+
    L('Syngas to the glass factory',fmt(t.mm)+' MMBtu × €'+fmt(gasPrice(),2),eur(t.rev.gas))+L('Gate fees',fmt(D.total.s.waste,1)+' t × €'+fmt(FIN.gate),eur(t.rev.gate))+L('Carbon credits',fmt(credits(D.total).net,1)+' tCO2e × €'+fmt(cfg.price),eur(t.rev.carbon))+
    L('<b>Revenue</b>','','<b>'+eur(t.R)+'</b>')+
    L('Operating cost',fmt(FIN.opexPct,1)+' % × €'+fmt(FIN.capex)+' M a year, '+(hrs<48?fmt(hrs,1)+' h':fmt(hrs/24,1)+' days'),'-'+eur(t.cost.opex))+
    L('Electricity bought',fmt(t.ownKwh)+' kWh × €'+fmt(FIN.elec,2),'-'+eur(t.cost.elec))+
    L('<b>Operating costs</b>','','<b>-'+eur(t.C)+'</b>')+L('<b>EBITDA</b>','','<b class="'+(t.E>=0?'pos':'neg')+'">'+eur(t.E)+'</b>')+'</table>';
}
PAGES.finance={title:'Finance',period:true,render:renderFinance,csv:()=>{const f=finData();const rows=metaRows([['Report','Profit and loss'],['Period',D.P.label+' ('+D.P.range+')'],['Natural gas price EUR/MMBtu',FIN.ng],['Syngas discount %',FIN.disc],['Syngas price EUR/MMBtu',r1(gasPrice(),2)],['MMBtu per 1000 Nm3',FIN.mmbtu],['Gate fee EUR/t',FIN.gate],['Electricity bought EUR/kWh',FIN.elec],['Project cost EUR million',FIN.capex],['Operating cost % of project cost a year',FIN.opexPct],['Credit price EUR/tCO2e',cfg.price]]);
  rows.push(['Period','Energy sold MMBtu','Syngas sales EUR','Gate fees EUR','Carbon credits EUR','Revenue EUR','Operating cost EUR','Electricity bought EUR','EBITDA EUR']);
  D.bk.forEach((b,i)=>{const m=f.rows[i];if(m)rows.push([tsf(b.t),r1(m.mm,1),r1(m.rev.gas,0),r1(m.rev.gate,0),r1(m.rev.carbon,0),r1(m.R,0),r1(m.cost.opex,0),r1(m.cost.elec,0),r1(m.E,0)]);});
  const t=f.tot;rows.push(['TOTAL',r1(t.mm,1),r1(t.rev.gas,0),r1(t.rev.gate,0),r1(t.rev.carbon,0),r1(t.R,0),r1(t.cost.opex,0),r1(t.cost.elec,0),r1(t.E,0)]);return {name:'profit-and-loss_'+fileTag()+'_'+slug(D.P.label)+'.csv',text:csvText(rows)};}};

/* =====================================================================
   What-if simulator
   ===================================================================== */
function wiBase(){return {tpd:TPD,days:360,h2:50,ng:FIN.ng,disc:FIN.disc,gate:FIN.gate,cprice:cfg.price,capex:FIN.capex,opex:FIN.opexPct};}
let WI=Object.assign(wiBase(),lsGet('wtg_wi2',{}));
const WI_SL=[
  ['tpd','Waste throughput','t/day',50,600,10,0],['days','Operating days','days per year',300,365,1,0],['h2','Hydrogen in syngas','%',35,60,0.5,1],
  ['ng','Natural gas price','EUR per MMBtu',3,50,0.5,1],['disc','Syngas discount to natural gas','%',0,60,1,0],['gate','Gate fee','EUR per t',0,150,1,0],['cprice','Carbon credit price','EUR per tCO2e',0,150,1,0],
  ['capex','Project cost','EUR million',10,200,1,0],['opex','Operating cost','% of project cost a year',2,15,0.5,1]];
function wiModel(x){
  const lhv=(35*12.63+x.h2*10.78+10*35.8)/100;        /* MJ/Nm3, same gas model as the plant */
  const waste=x.tpd*x.days,gas=waste*1000;              /* 1,000 Nm3 per t of waste */
  const mm=gas/1000*FIN.mmbtu*lhv/LHV_REF,mwh=mm*KWH_PER_MMBTU/1000;
  const co2=gas*((35+10+0.3)/100)*1.963/1000;          /* t CO2 when the syngas is burned */
  const cr=waste*cfg.land+mwh*cfg.disp-co2*cfg.fossil/100;
  const price=x.ng*(1-x.disc/100);
  const ownKwh=165*x.tpd/30*24*x.days;
  const rev={gas:mm*price,gate:waste*x.gate,carbon:cr*x.cprice};
  const cost={opex:x.capex*1e6*x.opex/100,elec:ownKwh*FIN.elec};
  const R=rev.gas+rev.gate+rev.carbon,C=cost.opex+cost.elec,E=R-C;
  const mw=mwh/(x.days*24);
  return {waste,mwh,mm,cr,rev,cost,R,C,E,price,save:mm*x.ng*x.disc/100,ng:mwh*1000/NG_KWH,payback:E>0?x.capex*1e6/E:Infinity,mw};
}
function renderWhatif(){
  if(onceEl('pg_whatif',`<p class="lead">Move the sliders to see a full year of the plant under different conditions. The plant model is the same one the dashboard runs on. Each tonne of waste gives 1,000 Nm³ of syngas, sold as ${fmt(FIN.mmbtu)} MMBtu per 1,000 Nm³ at a discount to the natural gas price.</p>
    <div class="grid2"><div class="card"><h3>Scenario</h3><div id="wiS"></div><div class="mact"><button class="btn" id="wiReset">Reset to current plant</button><button class="btn pri" id="wiSave">Save scenario</button></div></div>
    <div class="stack"><div class="card"><h3>Payback</h3><div class="payback" id="wiPay"></div><div class="muted" id="wiPayS"></div></div>
    <div class="card"><h3>One year <span>compared with the current plant settings</span></h3><div class="bigres" id="wiR"></div></div>
    <div class="card"><h3>Cumulative cash over 15 years <span>EUR million, before financing and tax</span></h3><canvas id="c_wi"></canvas><div class="legend"></div></div></div></div>
    <div class="card mt"><h3>Saved scenarios</h3><div class="scrollx" id="wiList"></div></div>`)){
    $('#wiS').innerHTML=WI_SL.map(s=>`<div class="sl"><label for="wi_${s[0]}">${s[1]} <span class="muted">${s[2]}</span></label><output id="wo_${s[0]}"></output><input type="range" id="wi_${s[0]}" data-k="${s[0]}" min="${s[3]}" max="${s[4]}" step="${s[5]}"></div>`).join('');
    $('#wiS').addEventListener('input',e=>{const k=e.target.dataset.k;if(!k)return;WI[k]=parseFloat(e.target.value);lsSet('wtg_wi2',WI);renderWhatif();});
    $('#wiReset').addEventListener('click',()=>{WI=wiBase();lsSet('wtg_wi2',WI);renderWhatif();});
    $('#wiSave').addEventListener('click',()=>{const L=lsGet('wtg_wi_list',[]);L.push({name:'Scenario '+(L.length+1),x:Object.assign({},WI),t:Date.now()});lsSet('wtg_wi_list',L.slice(-8));renderWhatif();});
    $('#wiList').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const L=lsGet('wtg_wi_list',[]);const i=+b.dataset.i;if(b.dataset.a==='load'&&L[i]){WI=Object.assign({},L[i].x);lsSet('wtg_wi2',WI);}if(b.dataset.a==='del'){L.splice(i,1);lsSet('wtg_wi_list',L);}renderWhatif();});
    attachTip($('#c_wi'));
  }
  WI_SL.forEach(s=>{const i=$('#wi_'+s[0]);if(+i.value!==WI[s[0]])i.value=WI[s[0]];$('#wo_'+s[0]).textContent=fmt(WI[s[0]],s[6]);});
  const m=wiModel(WI),b=wiModel(wiBase());
  const dl=(v,bv,f)=>{const d=v-bv;return Math.abs(d)<1e-9?'<small>same as now</small>':'<small class="'+(d>0?'pos':'neg')+'">'+(d>0?'+':'-')+f(Math.abs(d))+' vs now</small>';};
  $('#wiPay').innerHTML=isFinite(m.payback)?fmt(m.payback,1)+'<small>years</small>':'Never<small>EBITDA is negative</small>';
  $('#wiPayS').textContent='EUR '+fmt(WI.capex)+' million project cost divided by '+eurK(m.E)+' EBITDA a year. Syngas sells at €'+fmt(m.price,2)+' per MMBtu, and the factory saves '+eurK(m.save)+' a year.';
  const R=[['Energy sold',fmt(m.mm/1e6,2)+' M MMBtu',m.mm,b.mm,v=>fmt(v/1e6,2)+' M MMBtu'],['Natural gas replaced',fmt(m.ng/1e6,1)+' M Nm³',m.ng,b.ng,v=>fmt(v/1e6,1)+' M Nm³'],['Net carbon credits',fmt(m.cr)+' tCO2e',m.cr,b.cr,v=>fmt(v)+' t'],
    ['Revenue',eurK(m.R),m.R,b.R,eurK],['Operating costs',eurK(m.C),m.C,b.C,eurK],['EBITDA',eurK(m.E),m.E,b.E,eurK]];
  $('#wiR').innerHTML=R.map(r=>`<div><span>${r[0]}</span><b>${r[1]}</b>${dl(r[2],r[3],r[4])}</div>`).join('');
  const yrs=[...Array(16).keys()],cum=yrs.map(y=>(-WI.capex*1e6+m.E*y)/1e6),cumB=yrs.map(y=>(-wiBase().capex*1e6+b.E*y)/1e6);
  drawChart($('#c_wi'),{labels:yrs.map(y=>'Year '+y),series:[{name:'This scenario',color:'#d9c46a',type:'line',data:cum,dec:1},{name:'Current plant',color:'#5d6a77',type:'line',data:cumB,dec:1}],limits:[{v:0,color:'#8a97a4',label:'break-even'}]});
  const L=lsGet('wtg_wi_list',[]);
  $('#wiList').innerHTML=L.length?'<table><tr><th>Name</th><th class="r">t/day</th><th class="r">Days</th><th class="r">H₂ %</th><th class="r">Gas price</th><th class="r">Discount</th><th class="r">Gate fee</th><th class="r">EBITDA a year</th><th class="r">Payback</th><th></th></tr>'+L.map((s,i)=>{const r=wiModel(s.x);return `<tr><td>${esch(s.name)}</td><td class="r">${fmt(s.x.tpd)}</td><td class="r">${s.x.days}</td><td class="r">${fmt(s.x.h2,1)}</td><td class="r">${fmt(s.x.ng)}</td><td class="r">${fmt(s.x.disc)} %</td><td class="r">${fmt(s.x.gate)}</td><td class="r">${eurK(r.E)}</td><td class="r">${isFinite(r.payback)?fmt(r.payback,1)+' years':'never'}</td><td class="r nw"><button class="btn sm" data-a="load" data-i="${i}">Load</button> <button class="btn sm" data-a="del" data-i="${i}">Delete</button></td></tr>`;}).join('')+'</table>':'<div class="empty">Save a scenario to compare it here.</div>';
}
PAGES.whatif={title:'What-if',period:false,still:true,render:renderWhatif,sub:()=>'A full year under the conditions you set'};

/* =====================================================================
   Gas sales to the glass factory
   ===================================================================== */
function renderGrid(){
  if(onceEl('pg_grid',`<p class="lead">Heat delivered to the glass factory as cleaned syngas, the natural gas it replaces and what it earns. The furnace keeps its natural gas burners: they cover planned shutdown days and any drop in delivery.</p>
    <div class="kpis" id="grK"></div>
    <div class="grid2 mt"><div class="card"><h3>Heat delivered <span id="grU"></span></h3><canvas id="c_gr" class="tall"></canvas><div class="legend"></div></div>
    <div class="card"><h3>Delivery through the day <span>average kW of heat by hour, against contract capacity</span></h3><canvas id="c_grh" class="tall"></canvas><div class="legend"></div></div></div>
    <div class="grid2 mt"><div class="card"><h3>Price and earnings <span id="grP"></span></h3><div id="grT"></div></div>
    <div class="card"><h3>Gas supply contract <span>saved in this browser</span></h3><div class="fgrid" id="grF"></div><div class="note">Syngas is sold per MMBtu, on the basis of 1,000 Nm³ = ${fmt(FIN.mmbtu)} MMBtu. Check this basis: the design gas in the composition table (LHV 13,400 kJ/Nm³) holds about 12.7 MMBtu per 1,000 Nm³. Its heating value is about a third of natural gas, so the factory burners must be made for low calorific gas.</div></div></div>`)){
    attachTip($('#c_gr'));attachTip($('#c_grh'));
    const F=[['ng','Natural gas price (EUR per MMBtu)',0.1],['disc','Syngas discount (%)',1],['mmbtu','MMBtu sold per 1,000 Nm³',0.5]];
    $('#grF').innerHTML=F.map(f=>`<label class="field">${f[1]}<input type="number" min="0" step="${f[2]}" data-f="${f[0]}" value="${FIN[f[0]]}" ${can('edit')?'':'disabled'}></label>`).join('');
    $('#grF').addEventListener('change',e=>{const k=e.target.dataset.f;if(!k)return;const v=parseFloat(e.target.value);if(v>=0){FIN[k]=v;saveFin();if(k==='mmbtu')applyMmbtu();tick(true);}});
  }
  const {P,bk}=D,mwh=D.total.s.kwh/1000,mm=mmbtuOf(D.total.s.kwh),hrs=D.total.h||1,price=gasPrice();
  renderKpis($('#grK'),[{l:'Energy sold',u:'MMBtu',v:mm,d:0,s:fmt(D.total.s.toGen)+' Nm³ of syngas'},{l:'Natural gas replaced',u:'Nm³',v:mwh*1000/NG_KWH,d:0,s:'at '+fmt(NG_KWH,1)+' kWh per Nm³'},{l:'Syngas sales',u:'EUR',v:mm*price,d:0,s:'at €'+fmt(price,2)+' per MMBtu'},{l:'Factory saving',u:'EUR',v:mm*FIN.ng*FIN.disc/100,d:0,s:'against €'+fmt(FIN.ng,2)+' per MMBtu natural gas'},{l:'Use of contract capacity',u:'%',v:avgOf(D.total,'kw')/RATED_KW*100,d:0,s:fmt(RATED_KW/KWH_PER_MMBTU,0)+' MMBtu/h contracted'}]);
  $('#grU').textContent='MMBtu '+UNIT_PER[state.mode];$('#grP').textContent='('+P.label.toLowerCase()+')';
  drawChart($('#c_gr'),{labels:bk.map(b=>b.label),series:[{name:'Energy sold (MMBtu)',color:'#8ccbe0',type:'bar',data:bk.map(b=>b.acc?mmbtuOf(b.acc.s.kwh):null),dec:0}]});
  const now=Date.now(),hk=[...Array(24)].map(()=>[0,0]);const span=Math.max(DAY,Math.min(P.now-P.t0,7*DAY));
  for(let t=Math.floor((now-span)/(30*MIN))*30*MIN;t<now;t+=30*MIN){const h=new Date(t).getHours();hk[h][0]+=plant(t).kw;hk[h][1]++;}
  drawChart($('#c_grh'),{labels:[...Array(24).keys()].map(h=>pad(h)+':00'),series:[{name:'Heat kW',color:'#ff8f45',type:'line',data:hk.map(x=>x[1]?x[0]/x[1]:null),dec:0}],limits:[{v:RATED_KW,color:'#8a97a4',label:'contract capacity'}]});
  const L=(a,b,c)=>`<tr><td>${a}</td><td class="r muted">${b}</td><td class="r num">${c}</td></tr>`;
  $('#grT').innerHTML='<table>'+L('Natural gas price','','€'+fmt(FIN.ng,2)+' per MMBtu')+L('Discount','',fmt(FIN.disc)+' %')+L('<b>Syngas price</b>','','<b>€'+fmt(price,2)+' per MMBtu</b>')+L('Syngas sold',fmt(mm)+' MMBtu × €'+fmt(price,2),eur(mm*price))+L('Same energy as natural gas',fmt(mm)+' MMBtu × €'+fmt(FIN.ng,2),eur(mm*FIN.ng))+L('<b>Factory saving</b>','','<b class="pos">'+eur(mm*FIN.ng*FIN.disc/100)+'</b>')+'</table>'+
    '<div class="note">Natural gas price: EU gas at €73.32 per MWh on 2 Oct 2026 (Trading Economics), which is €21.5 per MMBtu. Use the price the factory actually pays, delivered, which is usually higher.</div>';
}
PAGES.grid={title:'Gas sales',period:true,render:renderGrid,csv:()=>{const {P,bk}=D;const rows=metaRows([['Report','Gas sales to the glass factory'],['Period',P.label+' ('+P.range+')'],['Natural gas price EUR/MMBtu',FIN.ng],['Discount %',FIN.disc],['Syngas price EUR/MMBtu',r1(gasPrice(),2)],['MMBtu per 1000 Nm3',FIN.mmbtu]]);rows.push(['Period','Syngas Nm3','Energy sold MMBtu','Natural gas replaced Nm3','Syngas sales EUR','Factory saving EUR']);bk.forEach(b=>{if(!b.acc)return;const m=mmbtuOf(b.acc.s.kwh);rows.push([tsf(b.t),r1(b.acc.s.toGen,0),r1(m,1),r1(b.acc.s.kwh/NG_KWH,0),r1(m*gasPrice(),0),r1(m*FIN.ng*FIN.disc/100,0)]);});return {name:'gas-sales_'+fileTag()+'_'+slug(P.label)+'.csv',text:csvText(rows)};}};

/* =====================================================================
   Impact (ESG)
   ===================================================================== */
const ESG=Object.assign({home:11000,car:4.6,dens:0.9},lsGet('wtg_esg',{}));
function impactData(){
  const c=credits(D.total),hrs=D.total.h||1,kwh=D.total.s.kwh;
  return {c,ngNm3:kwh/NG_KWH,homes:kwh/(ESG.home*hrs/8760),cars:c.net/ESG.car,m3:c.waste/ESG.dens};
}
const ICO={flame:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#8ccbe0" stroke-width="1.6"><path d="M12 3c3 4 5 6.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.2 1.3.8 2 1.6 2.3-.4-2.6.4-5 1.4-7.8z"/></svg>',home:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ff8f45" stroke-width="1.6"><path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-6h4v6"/></svg>',car:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#86c99a" stroke-width="1.6"><path d="M3 15l2-6h14l2 6v4H3z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></svg>',fill:'<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c4ad86" stroke-width="1.6"><path d="M2 20l6-9 4 5 3-3 7 7z"/></svg>'};
function renderImpact(){
  if(onceEl('pg_impact',`<p class="lead">What the plant's output means in everyday terms, for reports, investors and the community. Each comparison uses a stated factor you can change.</p>
    <div class="impact-hero" id="imH"></div>
    <div class="sharecard mt" id="imCard"></div>
    <div class="mact"><button class="btn pri" id="imCopy">Copy summary</button><button class="btn" id="imPng">Download as image</button><span class="status" id="imMsg"></span></div>
    <div class="card mt"><h3>Comparison factors <span>saved in this browser</span></h3><div class="fgrid">
      <label class="field">Gas used by a home (kWh per year)<input type="number" data-e="home" step="500"></label>
      <label class="field">CO₂ per car (t per year)<input type="number" data-e="car" step="0.1"></label>
      <label class="field">Landfill density (t per m³)<input type="number" data-e="dens" step="0.05"></label></div>
      <div class="note">Defaults: 11,000 kWh of gas per home a year (typical gas-heated European home), 4.6 t CO₂ per passenger car a year (US EPA figure), compacted landfill waste at 0.9 t per m³, natural gas at ${fmt(NG_KWH,1)} kWh per Nm³. Credits use the factors on the Carbon credits page.</div></div>`)){
    document.querySelectorAll('#pg_impact input[data-e]').forEach(i=>{i.value=ESG[i.dataset.e];i.addEventListener('change',()=>{const v=parseFloat(i.value);if(v>0){ESG[i.dataset.e]=v;lsSet('wtg_esg',ESG);tick(true);}});});
    $('#imCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(impactText());$('#imMsg').textContent='Summary copied.';}catch(e){$('#imMsg').textContent='Copy is blocked by the browser.';}});
    $('#imPng').addEventListener('click',impactPng);
  }
  const x=impactData(),P=D.P;
  $('#imH').innerHTML=[[ICO.flame,fmtB(x.ngNm3),'Nm³ of natural gas the glass furnace did not burn'],[ICO.home,fmt(x.homes),'homes, the same yearly gas use, at this rate for a year'],[ICO.car,fmt(x.cars),'cars off the road for a year, from '+fmt(x.c.net,0)+' tCO2e of net credits'],[ICO.fill,fmt(x.m3),'m³ of landfill space saved by '+fmt(x.c.waste,0)+' t of waste']].map(r=>`<div class="ih">${r[0]}<div><b>${r[1]}</b><span>${r[2]}</span></div></div>`).join('');
  $('#imCard').innerHTML=`<h3>Central Orbit, ${P.label.toLowerCase()}</h3><p>Turned ${fmt(x.c.waste,0)} tonnes of waste into ${fmt(D.total.s.kwh/1000,0)} MWh of heat for a glass furnace.</p><p class="muted">That replaced ${fmtB(x.ngNm3)} Nm³ of natural gas and kept ${fmt(x.c.net,0)} tCO2e out of the air, the same as taking ${fmt(x.cars)} cars off the road for a year.</p>`;
}
function impactText(){const x=impactData(),P=D.P;return `Central Orbit waste to gas, ${P.label.toLowerCase()} (${P.range}):\n- ${fmt(x.c.waste,0)} t of waste kept out of landfill (${fmt(x.m3)} m³ of space)\n- ${fmt(D.total.s.kwh/1000,0)} MWh of heat delivered to a glass furnace\n- ${fmtB(x.ngNm3)} Nm³ of natural gas replaced\n- ${fmt(x.c.net,0)} tCO2e net, like ${fmt(x.cars)} cars off the road for a year`;}
function impactPng(){
  const x=impactData(),P=D.P,cv=document.createElement('canvas');cv.width=1200;cv.height=630;const c=cv.getContext('2d');
  const g=c.createLinearGradient(0,0,1200,630);g.addColorStop(0,'#1e2a24');g.addColorStop(1,'#151c23');c.fillStyle=g;c.fillRect(0,0,1200,630);
  c.fillStyle='#ff8f45';c.beginPath();c.arc(84,84,22,0,7);c.fill();
  c.fillStyle='#e5ebf0';c.font='600 34px "Barlow Semi Condensed",sans-serif';c.fillText('Central Orbit',124,96);
  c.fillStyle='#8a97a4';c.font='400 24px Barlow,sans-serif';c.fillText('Waste to gas for glass making, '+P.label.toLowerCase(),60,170);
  const st=[[fmt(x.c.waste,0)+' t','waste kept out of landfill'],[fmt(D.total.s.kwh/1000,0)+' MWh','heat for the glass furnace'],[fmtB(x.ngNm3)+' Nm³','natural gas replaced'],[fmt(x.c.net,0)+' tCO2e','net carbon credits']];
  st.forEach((s,i)=>{const X=60+(i%2)*560,Y=280+Math.floor(i/2)*170;c.fillStyle='#e5ebf0';c.font='600 72px "Barlow Semi Condensed",sans-serif';c.fillText(s[0],X,Y);c.fillStyle='#8a97a4';c.font='400 26px Barlow,sans-serif';c.fillText(s[1],X,Y+42);});
  c.fillStyle='#5d6a77';c.font='400 18px Barlow,sans-serif';c.fillText(P.range,60,600);
  cv.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='central-orbit-gas-impact_'+slug(P.label)+'.png';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);});
}
PAGES.impact={title:'Impact',period:true,render:renderImpact,csv:()=>{const x=impactData();const rows=metaRows([['Report','Impact summary'],['Period',D.P.label+' ('+D.P.range+')']]);rows.push(['Measure','Value','Factor']);[['Natural gas replaced Nm3',r1(x.ngNm3,0),NG_KWH+' kWh per Nm3'],['Homes, same yearly gas use (annualised)',r1(x.homes,0),ESG.home+' kWh per home a year'],['Cars off the road for a year',r1(x.cars,0),ESG.car+' t CO2 per car a year'],['Landfill space saved m3',r1(x.m3,0),ESG.dens+' t per m3'],['Net carbon credits tCO2e',r1(x.c.net,1),'Carbon credits page']].forEach(r=>rows.push(r));return {name:'impact_'+fileTag()+'_'+slug(D.P.label)+'.csv',text:csvText(rows)};}};

function applyMmbtu(){SALE_MMBTU=FIN.mmbtu;RATED_KW=contractKw();resetSim();alertCache={k:0,eps:[]};}
applyMmbtu();
