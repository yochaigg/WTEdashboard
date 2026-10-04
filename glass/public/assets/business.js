'use strict';
/* ================= Business pages (gas version): finance, what-if, gas sales, impact =================
   The plant sells cleaned syngas to a glass factory, where it replaces natural gas in the furnace.
   Basis: 1 t of waste gives 1,000 Nm3 of syngas; at the design LHV of 13,400 kJ/Nm3 that is 12.7 MMBtu per 1,000 Nm3,
   priced per MMBtu at a discount to the natural gas price. */

const FIN=Object.assign({
  ng:21.5,          /* market gas price, EUR per MMBtu (Dutch TTF; Auto updates it, Manual keeps the typed value) */
  mmbtu:12.7,       /* MMBtu per 1,000 Nm3 of syngas: 13,400 kJ/Nm3 x 1,000 / 1,055,056 kJ per MMBtu */
  disc:25,          /* syngas discount against natural gas, % */
  gate:45,          /* gate fee, EUR per tonne of waste received */
  elec:0.15,        /* electricity the plant buys, EUR per kWh */
  capex:75,         /* project cost, EUR million */
  opexPct:7,        /* operating cost per year, % of project cost */
  own:0             /* kept for shared code: no electricity is generated in this version */
},lsGet('wtg_fin3',{}));
const saveFin=()=>{lsSet('wtg_fin3',FIN);};
SALE_MMBTU=FIN.mmbtu;
const mmbtuOf=kwh=>kwh/KWH_PER_MMBTU;
const opexYear=()=>FIN.capex*1e6*FIN.opexPct/100;
const gasPrice=()=>refPrice()*(1-FIN.disc/100);          /* EUR per MMBtu of syngas: the discount below the market gas price */

/* ---------- market gas price source ----------
   Auto: Dutch TTF front-month natural gas price (EUR per MWh), converted to EUR per MMBtu. Manual: the price typed in. */
if(!FIN.ngMode)FIN.ngMode='auto';
if(FIN.ngMan==null)FIN.ngMan=FIN.ng;
const GASP={data:lsGet('wtg_gasp',null),err:'',busy:false};
const MWH_PER_MMBTU=0.293071;
function applyGasPrice(){
  if(FIN.ngMode==='auto'){const v=GASP.data&&GASP.data.eurPerMwh;if(v>0)FIN.ng=Math.round(v*MWH_PER_MMBTU*100)/100;}
  else FIN.ng=FIN.ngMan;
}
function gasStatus(){
  if(FIN.ngMode!=='auto')return 'Manual market gas price: '+cs(FIN.ng,2)+' per MMBtu ('+cs(FIN.ng/MWH_PER_MMBTU,2)+' per MWh).';
  const d=GASP.data;
  if(GASP.busy&&!d)return 'Getting the market gas price...';
  if(!d)return `Couldn't reach the price feed${GASP.err?' ('+GASP.err+')':''}. Using ${cs(FIN.ng,2)} per MMBtu until it answers.`;
  return `Dutch TTF natural gas, front month: €${fmt(d.eurPerMwh,2)} per MWh = €${fmt(d.eurPerMwh*MWH_PER_MMBTU,2)} per MMBtu (${d.asOf?fd(Date.parse(d.asOf+'T12:00:00')):'latest'}, ${d.source}). Syngas at ${fmt(FIN.disc)} % below: ${cs(gasPrice(),2)} per MMBtu.`+(GASP.err?' Last check failed, showing the last price received.':'');
}
async function gasFetch(){
  GASP.busy=true;
  try{const r=await fetch('/api/gas-price',{cache:'no-store'});const j=await r.json().catch(()=>({ok:false,error:'no price service on this address'}));if(!j.ok)throw new Error(j.error||'error');GASP.data=j;GASP.err='';lsSet('wtg_gasp',j);}
  catch(e){GASP.err=String(e.message||e).slice(0,120);}
  GASP.busy=false;applyGasPrice();saveFin();tick(true);
}
applyGasPrice();setTimeout(gasFetch,300);setInterval(gasFetch,6*3600*1000);
function gasSrcPaint(){
  const auto=FIN.ngMode==='auto';
  document.querySelectorAll('.ngSrc button').forEach(b=>{const on=b.dataset.v===FIN.ngMode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);b.disabled=!can('edit');});
  document.querySelectorAll('.ngStat').forEach(e=>{e.textContent=gasStatus();e.classList.toggle('bad',auto&&!!GASP.err&&!GASP.data);});
  document.querySelectorAll('input[data-f="ng"]').forEach(i=>{i.readOnly=auto;i.classList.toggle('ro',auto);if(document.activeElement!==i)i.value=curVal(FIN.ng);});
}
document.addEventListener('click',e=>{const b=e.target.closest('.ngSrc button[data-v]');if(!b||!can('edit')||b.dataset.v===FIN.ngMode)return;FIN.ngMode=b.dataset.v;applyGasPrice();saveFin();addOp('Market gas price set to '+(FIN.ngMode==='auto'?'automatic (TTF)':'manual'));if(FIN.ngMode==='auto')gasFetch();tick(true);});
const NG_SRC_HTML='<div class="psrc"><span>Market gas price</span><div class="seg ngSrc" role="group" aria-label="Market gas price source"><button type="button" data-v="auto">Auto, TTF</button><button type="button" data-v="manual">Manual</button></div></div><div class="pstat ngStat"></div>';
const bandCache=new Map();                            /* kept for shared code */
function bucketEnd(b,i,bk,P){return i<bk.length-1?bk[i+1].t:P.now;}

/* ---------- money for an accumulator ---------- */
/* HYBRID: the bottle factory furnace takes what it can burn; the surplus gas runs J620 engines.
   Engine power covers the plant's own use first and the rest is exported. */
const FAC=Object.assign({glass:425,gj:4.5,blend:100,
  eng:false,        /* engines for surplus gas: not built yet, so surplus gas is shown as not used */
 sur:0,elecSell:0.20,gridF:0.70,
  fuel:'bio',       /* fuel the syngas replaces at the furnace: 'bio' = biomethane, 'ng' = natural gas */
  bio:36.48         /* biomethane price, EUR per MMBtu (Italian incentive tariff 124.48 EUR/MWh = 36.48 EUR/MMBtu) */
},lsGet('wtg_fac4',{}));
const saveFac=()=>lsSet('wtg_fac4',FAC);
const refPrice=()=>FIN.ng;   /* market gas price the syngas is priced against, EUR per MMBtu */
const fuelName=()=>FAC.fuel==='bio'?'biomethane':'natural gas';
const demandMMh=()=>FAC.glass*FAC.gj/1.055056/24*FAC.blend/100;   /* MMBtu per hour of syngas the furnace can take */
function applyHybrid(){
  HYB.demKw=demandMMh()*KWH_PER_MMBTU;HYB.toEngines=!!FAC.eng;
  const nom=TPD/24*1000*saleKwhPerNm3(),surKw=Math.max(0,nom-HYB.demKw);
  HYB.engines=surKw>0?Math.max(1,Math.ceil(surKw*HYB.eff*1.03/HYB.engKw)):0;
  resetSim();alertCache={k:0,eps:[]};
}
const hk=(acc,k)=>avgOf(acc,k)*acc.h;   /* kWh over the accumulator */
function split(acc){
  const mm=mmbtuOf(acc.s.kwh),sold=mmbtuOf(hk(acc,'facKw')),engFuel=mmbtuOf(hk(acc,'engFuelKw')),spare=mmbtuOf(hk(acc,'spareKw'));
  return {mm,sold,engFuel,sur:spare,engKwh:hk(acc,'engKw'),expKwh:hk(acc,'expKw'),buyKwh:hk(acc,'buyKw'),ownKwh:hk(acc,'ownKw'),cap:demandMMh()*acc.h};
}
/* credits: natural gas replaced at the furnace, grid power replaced by the engines, less the fossil part of the CO2 burned */
function credits(a){
  const sp=split(a),gasUsed=sp.sold+(FAC.sur>0?sp.sur:0),usedK=gasUsed*KWH_PER_MMBTU,burned=sp.mm?(gasUsed+sp.engFuel)/sp.mm:0;
  const land=a.s.waste*cfg.land,disp=FAC.fuel==='bio'?0:usedK*cfg.disp/1000,dispE=sp.engKwh*FAC.gridF/1000,ded=a.s.co2*burned/1000*cfg.fossil/100;
  return {waste:a.s.waste,mwh:usedK/1000,elecMwh:sp.engKwh/1000,co2t:a.s.co2*burned/1000,land,disp,dispE,ded,net:land+disp+dispE-ded};
}
function money(acc,_unused,hours){
  const c=credits(acc),sp=split(acc),mwh=acc.s.kwh/1000;
  const rev={gas:sp.sold*gasPrice(),power:sp.expKwh*FAC.elecSell,sur:sp.sur*FAC.sur,gate:acc.s.waste*FIN.gate,carbon:c.net*cfg.price};
  const cost={opex:opexYear()*hours/8760,elec:sp.buyKwh*FIN.elec};
  const R=rev.gas+rev.power+rev.sur+rev.gate+rev.carbon,C=cost.opex+cost.elec;
  return {rev,cost,R,C,E:R-C,mwh,mm:sp.mm,sold:sp.sold,sur:sp.sur,engFuel:sp.engFuel,engKwh:sp.engKwh,expKwh:sp.expKwh,ownKwh:sp.buyKwh,save:sp.sold*refPrice()*FIN.disc/100,c};
}
function bandsBetween(){return null;}

/* =====================================================================
   Finance
   ===================================================================== */
function finData(){
  const {bk}=D;
  const rows=bk.map(b=>b.acc?money(b.acc,null,b.acc.h):null);
  const tot={rev:{gas:0,power:0,sur:0,gate:0,carbon:0},cost:{opex:0,elec:0},R:0,C:0,E:0,mwh:0,mm:0,sold:0,sur:0,engFuel:0,engKwh:0,expKwh:0,ownKwh:0,save:0};
  rows.forEach(m=>{if(!m)return;for(const k in m.rev)tot.rev[k]+=m.rev[k];for(const k in m.cost)tot.cost[k]+=m.cost[k];['R','C','E','mwh','mm','sold','sur','engFuel','engKwh','expKwh','ownKwh','save'].forEach(k=>tot[k]+=m[k]);});
  return {rows,tot};
}
function renderFinance(){
  if(onceEl('pg_finance',`<p class="lead">Revenue from syngas sold to the glass factory, gate fees and carbon credits, less operating costs and the electricity the plant buys, for the selected period. Every price and cost below is an assumption you can change.</p>
    <div class="kpis" id="finK"></div>
    <div class="grid2 mt"><div class="card"><h3>Revenue and costs <span id="finU"></span></h3><canvas id="c_fin" class="tall"></canvas><div class="legend"></div></div>
    <div class="card"><h3>Profit and loss <span id="finP"></span></h3><div id="finPL"></div></div></div>
    <div class="card mt"><h3>Prices and costs <span>assumptions, saved in this browser</span></h3>${NG_SRC_HTML}<div class="fgrid mt" id="finF"></div>
    <div class="note">EBITDA means earnings before interest, tax, depreciation and amortisation. Operating cost is a yearly amount, a percentage of the project cost, spread evenly over every hour of the year. Carbon credit price and factors are set on the Carbon credits page.</div></div>`)){
    attachTip($('#c_fin'));
    const F=[['ng','Market gas price (EUR per MMBtu)',0.01],['disc','Syngas discount to market gas price (%)',1],['mmbtu','MMBtu sold per 1,000 Nm³ of syngas',0.5],['gate','Gate fee (EUR per t waste)',1],['elec','Electricity bought (EUR per kWh)',0.01],['capex','Project cost (EUR million)',1],['opexPct','Operating cost (% of project cost a year)',0.5]];
    $('#finF').innerHTML=F.map(f=>`<label class="field">${f[1]}<input type="number" step="${f[2]}" min="0" data-f="${f[0]}" value="${FIN[f[0]]}" ${can('edit')?'':'disabled'}></label>`).join('');
    wireMoney($('#finF'),i=>FIN[i.dataset.f]);
    $('#finF').addEventListener('change',e=>{const k=e.target.dataset.f;if(!k)return;const v=parseFloat(e.target.value);if(v>=0){if(k==='ng'){if(FIN.ngMode==='auto'){e.target.value=FIN.ng;return;}FIN.ngMan=v;}FIN[k]=v;saveFin();if(k==='mmbtu')applyMmbtu();tick(true);}});
  }
  applyGasPrice();gasSrcPaint();
  const {P,bk}=D,f=finData(),t=f.tot,hrs=D.total.h||1;
  renderKpis($('#finK'),[
    {l:'Syngas sales',u:'EUR',v:t.rev.gas+t.rev.sur,d:0,s:fmt(t.sold)+' MMBtu × '+cs(gasPrice(),2),c:'var(--gas)'},
    ...(FAC.eng?[{l:'Electricity sales',u:'EUR',v:t.rev.power,d:0,s:fmt(t.expKwh)+' kWh × '+cs(FAC.elecSell,2),c:'var(--power)'}]:[]),
    {l:'Gate fees',u:'EUR',v:t.rev.gate,d:0,s:fmt(D.total.s.waste,1)+' t × '+cs(FIN.gate),c:'var(--waste)'},
    {l:'Carbon credits',u:'EUR',v:t.rev.carbon,d:0,s:fmt(credits(D.total).net,1)+' tCO2e × '+cs(cfg.price),c:'var(--carbon)'},
    {l:'Total revenue',u:'EUR',v:t.R,d:0,s:FAC.eng?'syngas, electricity, gate fees and credits':'syngas, gate fees and credits',c:'var(--money)'},
    {l:'Operating costs',u:'EUR',v:t.C,d:0,s:fmt(FIN.opexPct,1)+' % of '+cs(FIN.capex)+' M a year, plus electricity'},
    {l:'EBITDA',u:'EUR',v:t.E,d:0,s:'margin '+fmt(t.R?t.E/t.R*100:0,1)+' %',c:t.E>=0?'var(--money)':'var(--red)'},
    {l:'Factory saving',u:'EUR',v:t.save,d:0,s:fmt(FIN.disc)+' % below the market gas price'},
    {l:'Annual run rate',u:'EUR',v:t.E/hrs*24*365,d:0,s:'EBITDA at this rate for a year'}
  ]);
  $('#finU').textContent=curCode()+' '+UNIT_PER[state.mode];$('#finP').textContent='('+P.label.toLowerCase()+')';
  drawChart($('#c_fin'),{labels:bk.map(b=>b.label),series:[
    {name:'Syngas sales',color:'#8ccbe0',type:'bar',data:f.rows.map(m=>m&&(m.rev.gas)*curRate()),dec:0},
    {name:'Gate fees',color:'#c4ad86',type:'bar',data:f.rows.map(m=>m&&(m.rev.gate)*curRate()),dec:0},
    {name:'Carbon credits',color:'#86c99a',type:'bar',data:f.rows.map(m=>m&&(m.rev.carbon)*curRate()),dec:0},
    {name:'Costs',color:'#5d6a77',type:'bar',data:f.rows.map(m=>m&&(-m.C)*curRate()),dec:0},
    {name:'EBITDA',color:'#d9c46a',type:'line',data:f.rows.map(m=>m&&(m.E)*curRate()),dec:0}]});
  const L=(a,b,c)=>`<tr><td>${a}</td><td class="r muted">${b}</td><td class="r num">${c}</td></tr>`;
  $('#finPL').innerHTML='<table>'+
    L('Syngas to the bottle factory',fmt(t.sold)+' MMBtu × '+cs(gasPrice(),2),eur(t.rev.gas))+(FAC.eng?L('Electricity from the engines, exported',fmt(t.expKwh)+' kWh × '+cs(FAC.elecSell,2),eur(t.rev.power)):'')+(t.sur>0.5?L('Gas not used',fmt(t.sur)+' MMBtu, no buyer yet',eur(t.rev.sur)):'')+L('Gate fees',fmt(D.total.s.waste,1)+' t × '+cs(FIN.gate),eur(t.rev.gate))+L('Carbon credits',fmt(credits(D.total).net,1)+' tCO2e × '+cs(cfg.price),eur(t.rev.carbon))+
    L('<b>Revenue</b>','','<b>'+eur(t.R)+'</b>')+
    L('Operating cost',fmt(FIN.opexPct,1)+' % × '+cs(FIN.capex)+' M a year, '+(hrs<48?fmt(hrs,1)+' h':fmt(hrs/24,1)+' days'),'-'+eur(t.cost.opex))+
    L('Electricity bought',(t.ownKwh<1?'none, the engines cover the plant':fmt(t.ownKwh)+' kWh × '+cs(FIN.elec,2)),'-'+eur(t.cost.elec))+
    L('<b>Operating costs</b>','','<b>-'+eur(t.C)+'</b>')+L('<b>EBITDA</b>','','<b class="'+(t.E>=0?'pos':'neg')+'">'+eur(t.E)+'</b>')+'</table>';
}
PAGES.finance={title:'Finance',period:true,render:renderFinance,csv:()=>{const f=finData();const rows=metaRows([['Report','Profit and loss'],['Period',D.P.label+' ('+D.P.range+')'],['Market gas price EUR/MMBtu ('+(FIN.ngMode==='auto'?'auto, TTF':'manual')+')',FIN.ng],['Syngas discount %',FIN.disc],['Syngas price EUR/MMBtu',r1(gasPrice(),2)],['MMBtu per 1000 Nm3',FIN.mmbtu],['Gate fee EUR/t',FIN.gate],['Electricity bought EUR/kWh',FIN.elec],['Project cost EUR million',FIN.capex],['Operating cost % of project cost a year',FIN.opexPct],['Credit price EUR/tCO2e',cfg.price]]);
  rows.push(['Period','Energy sold MMBtu','Syngas sales EUR','Gate fees EUR','Carbon credits EUR','Revenue EUR','Operating cost EUR','Electricity bought EUR','EBITDA EUR']);
  D.bk.forEach((b,i)=>{const m=f.rows[i];if(m)rows.push([tsf(b.t),r1(m.mm,1),r1(m.rev.gas,0),r1(m.rev.gate,0),r1(m.rev.carbon,0),r1(m.R,0),r1(m.cost.opex,0),r1(m.cost.elec,0),r1(m.E,0)]);});
  const t=f.tot;rows.push(['TOTAL',r1(t.mm,1),r1(t.rev.gas,0),r1(t.rev.gate,0),r1(t.rev.carbon,0),r1(t.R,0),r1(t.cost.opex,0),r1(t.cost.elec,0),r1(t.E,0)]);return {name:'profit-and-loss_'+fileTag()+'_'+slug(D.P.label)+'.csv',text:csvText(rows)};}};

/* =====================================================================
   What-if simulator
   ===================================================================== */
function wiBase(){return {tpd:TPD,days:360,h2:50,ng:refPrice(),disc:FIN.disc,gate:FIN.gate,cprice:cfg.price,capex:FIN.capex,opex:FIN.opexPct,blend:FAC.blend};}
let WI=Object.assign(wiBase(),lsGet('wtg_wi6',{}));
const WI_SL=[
  ['tpd','Waste throughput','t/day',50,600,10,0],['days','Operating days','days per year',300,365,1,0],['h2','Hydrogen in syngas','%',35,60,0.5,1],
  ['ng','Market gas price','EUR per MMBtu',3,60,0.5,1],['disc','Syngas discount to market gas','%',0,60,1,0],['gate','Gate fee','EUR per t',0,150,1,0],['cprice','Carbon credit price','EUR per tCO2e',0,150,1,0],
  ['blend','Syngas share of the furnace fuel','%',10,100,5,0],['capex','Project cost','EUR million',10,200,1,0],['opex','Operating cost','% of project cost a year',2,15,0.5,1]];
function wiModel(x){
  const lhv=(35*12.63+x.h2*10.78+10*35.8)/100;        /* MJ/Nm3, same gas model as the plant */
  const waste=x.tpd*x.days,gas=waste*1000;              /* 1,000 Nm3 per t of waste */
  const mm=gas/1000*FIN.mmbtu*lhv/LHV_REF,mwh=mm*KWH_PER_MMBTU/1000;
  const co2=gas*((35+10+0.3)/100)*1.963/1000;          /* t CO2 when the syngas is burned */
  const dem=FAC.glass*FAC.gj/1.055056*(x.blend==null?FAC.blend:x.blend)/100;   /* MMBtu a day the furnace takes */
  const sold=Math.min(mm/x.days,dem)*x.days,rest=mm-sold;
  const engFuel=FAC.eng?rest:0,sur=rest-engFuel,engKwh=engFuel*KWH_PER_MMBTU*HYB.eff,ownKwh=165*x.tpd/30*24*x.days;
  const expKwh=Math.max(0,engKwh-ownKwh),buyKwh=Math.max(0,ownKwh-engKwh);
  const used=sold+(FAC.sur>0?sur:0),uf=mm?(used+engFuel)/mm:0;
  const cr=waste*cfg.land+(FAC.fuel==='bio'?0:used*KWH_PER_MMBTU/1000*cfg.disp)+engKwh/1000*FAC.gridF-co2*uf*cfg.fossil/100;
  const price=x.ng*(1-x.disc/100);
  const rev={gas:sold*price+sur*FAC.sur,power:expKwh*FAC.elecSell,gate:waste*x.gate,carbon:cr*x.cprice};
  const cost={opex:x.capex*1e6*x.opex/100,elec:buyKwh*FIN.elec};
  const R=rev.gas+rev.power+rev.gate+rev.carbon,C=cost.opex+cost.elec,E=R-C;
  const mw=mwh/(x.days*24);
  return {waste,mwh,mm,sold,sur,engKwh,expKwh,cr,rev,cost,R,C,E,price,save:sold*x.ng*x.disc/100,ng:sold*KWH_PER_MMBTU/NG_KWH,payback:E>0?x.capex*1e6/E:Infinity,mw};
}
function renderWhatif(){
  if(onceEl('pg_whatif',`<p class="lead">Move the sliders to see a full year of the plant under different conditions. The plant model is the same one the dashboard runs on. Each tonne of waste gives 1,000 Nm³ of syngas, sold as ${fmt(FIN.mmbtu,1)} MMBtu per 1,000 Nm³ at a discount to the natural gas price.</p>
    <div class="grid2"><div class="card"><h3>Scenario</h3><div id="wiS"></div><div class="mact"><button class="btn" id="wiReset">Reset to current plant</button><button class="btn pri" id="wiSave">Save scenario</button></div></div>
    <div class="stack"><div class="card"><h3>Payback</h3><div class="payback" id="wiPay"></div><div class="muted" id="wiPayS"></div></div>
    <div class="card"><h3>One year <span>compared with the current plant settings</span></h3><div class="bigres" id="wiR"></div></div>
    <div class="card"><h3>Cumulative cash over 15 years <span><span class="curc">EUR</span> million, before financing and tax</span></h3><canvas id="c_wi"></canvas><div class="legend"></div></div></div></div>
    <div class="card mt"><h3>Saved scenarios</h3><div class="scrollx" id="wiList"></div></div>`)){
    $('#wiS').innerHTML=WI_SL.map(s=>`<div class="sl"><label for="wi_${s[0]}">${s[1]} <span class="muted">${s[2].replace(/^EUR/,'<span class="curc">EUR</span>')}</span></label><output id="wo_${s[0]}"></output><input type="range" id="wi_${s[0]}" data-k="${s[0]}" min="${s[3]}" max="${s[4]}" step="${s[5]}"></div>`).join('');
    $('#wiS').addEventListener('input',e=>{const k=e.target.dataset.k;if(!k)return;WI[k]=parseFloat(e.target.value);lsSet('wtg_wi6',WI);renderWhatif();});
    $('#wiReset').addEventListener('click',()=>{WI=wiBase();lsSet('wtg_wi6',WI);renderWhatif();});
    $('#wiSave').addEventListener('click',()=>{const L=lsGet('wtg_wi_list',[]);L.push({name:'Scenario '+(L.length+1),x:Object.assign({},WI),t:Date.now()});lsSet('wtg_wi_list',L.slice(-8));renderWhatif();});
    $('#wiList').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const L=lsGet('wtg_wi_list',[]);const i=+b.dataset.i;if(b.dataset.a==='load'&&L[i]){WI=Object.assign({},L[i].x);lsSet('wtg_wi6',WI);}if(b.dataset.a==='del'){L.splice(i,1);lsSet('wtg_wi_list',L);}renderWhatif();});
    attachTip($('#c_wi'));
  }
  WI_SL.forEach(s=>{const i=$('#wi_'+s[0]);if(+i.value!==WI[s[0]])i.value=WI[s[0]];$('#wo_'+s[0]).textContent=fmt(WI[s[0]]*(/^EUR/.test(s[2])?curRate():1),s[6]);});
  const m=wiModel(WI),b=wiModel(wiBase());
  const dl=(v,bv,f)=>{const d=v-bv;return Math.abs(d)<1e-9?'<small>same as now</small>':'<small class="'+(d>0?'pos':'neg')+'">'+(d>0?'+':'-')+f(Math.abs(d))+' vs now</small>';};
  $('#wiPay').innerHTML=isFinite(m.payback)?fmt(m.payback,1)+'<small>years</small>':'Never<small>EBITDA is negative</small>';
  $('#wiPayS').textContent=cs(WI.capex)+' million project cost divided by '+eurK(m.E)+' EBITDA a year. Syngas sells at '+cs(m.price,2)+' per MMBtu, and the factory saves '+eurK(m.save)+' a year.';
  const R=[['Sold to the factory',fmt(m.sold/1e3)+' k MMBtu',m.sold,b.sold,v=>fmt(v/1e3)+' k MMBtu'],['Electricity exported',fmt(m.expKwh/1e6,1)+' GWh',m.expKwh,b.expKwh,v=>fmt(v/1e6,1)+' GWh'],['Natural gas replaced',fmt(m.ng/1e6,1)+' M Nm³',m.ng,b.ng,v=>fmt(v/1e6,1)+' M Nm³'],['Net carbon credits',fmt(m.cr)+' tCO2e',m.cr,b.cr,v=>fmt(v)+' t'],
    ['Revenue',eurK(m.R),m.R,b.R,eurK],['Operating costs',eurK(m.C),m.C,b.C,eurK],['EBITDA',eurK(m.E),m.E,b.E,eurK]];
  $('#wiR').innerHTML=R.map(r=>`<div><span>${r[0]}</span><b>${r[1]}</b>${dl(r[2],r[3],r[4])}</div>`).join('');
  const yrs=[...Array(16).keys()],cum=yrs.map(y=>(-WI.capex*1e6+m.E*y)/1e6*curRate()),cumB=yrs.map(y=>(-wiBase().capex*1e6+b.E*y)/1e6*curRate());
  drawChart($('#c_wi'),{labels:yrs.map(y=>'Year '+y),series:[{name:'This scenario',color:'#d9c46a',type:'line',data:cum,dec:1},{name:'Current plant',color:'#5d6a77',type:'line',data:cumB,dec:1}],limits:[{v:0,color:'#8a97a4',label:'break-even'}]});
  const L=lsGet('wtg_wi_list',[]);
  $('#wiList').innerHTML=L.length?'<table><tr><th>Name</th><th class="r">t/day</th><th class="r">Days</th><th class="r">H₂ %</th><th class="r">Gas price</th><th class="r">Discount</th><th class="r">Gate fee</th><th class="r">EBITDA a year</th><th class="r">Payback</th><th></th></tr>'+L.map((s,i)=>{const r=wiModel(s.x);return `<tr><td>${esch(s.name)}</td><td class="r">${fmt(s.x.tpd)}</td><td class="r">${s.x.days}</td><td class="r">${fmt(s.x.h2,1)}</td><td class="r">${fmt(s.x.ng*curRate(),2)}</td><td class="r">${fmt(s.x.disc)} %</td><td class="r">${fmt(s.x.gate*curRate())}</td><td class="r">${eurK(r.E)}</td><td class="r">${isFinite(r.payback)?fmt(r.payback,1)+' years':'never'}</td><td class="r nw"><button class="btn sm" data-a="load" data-i="${i}">Load</button> <button class="btn sm" data-a="del" data-i="${i}">Delete</button></td></tr>`;}).join('')+'</table>':'<div class="empty">Save a scenario to compare it here.</div>';
}
PAGES.whatif={title:'What-if',period:false,still:true,render:renderWhatif,sub:()=>'A full year under the conditions you set'};

/* =====================================================================
   Gas sales to the glass factory
   ===================================================================== */
function renderGrid(){
  if(onceEl('pg_grid',`<p class="lead">The glass furnace takes the syngas it can burn in place of the fuel it burns today, priced per MMBtu at a discount below the market gas price (Dutch TTF, automatic or typed in below). Gas engines for the surplus are an option for later: switch them on in the settings to see the hybrid case. The furnace keeps its natural gas burners for planned shutdown days and any drop in delivery.</p>
    <div class="kpis" id="grK"></div>
    <div class="grid2 mt"><div class="card"><h3>Where the gas goes <span id="grU"></span></h3><canvas id="c_gr" class="tall"></canvas><div class="legend"></div></div>
    <div class="card"><h3>Furnace demand and supply <span id="grDs"></span></h3><div id="grDem"></div></div></div>
    <div class="grid2 mt"><div class="card"><h3>Price and earnings <span id="grP"></span></h3><div id="grT"></div></div>
    <div class="card"><h3>Factory and gas contract <span>saved in this browser</span></h3>${NG_SRC_HTML}<div class="fgrid mt" id="grF"></div><div class="note">Syngas is sold per MMBtu, on the basis of 1,000 Nm³ = ${fmt(FIN.mmbtu,1)} MMBtu (design gas, LHV 13,400 kJ/Nm³). Its heating value is about a third of natural gas and it is half hydrogen, so the factory burners must be made for it; many furnaces start with a blend. The engines are sized automatically to burn the surplus at full output.</div></div></div>`)){
    attachTip($('#c_gr'));
    const F=[['eng','Engines for surplus gas',0,FAC],['fuel','Fuel the syngas replaces (for carbon credits)',0,FAC],['glass','Factory output (t of glass a day)',5,FAC],['gj','Furnace energy (GJ per t of glass)',0.1,FAC],['blend','Syngas share of the furnace fuel (%)',5,FAC],['elecSell','Electricity export price (EUR per kWh)',0.01,FAC],['gridF','Grid emission factor (kg CO2 per kWh)',0.01,FAC],['ng','Market gas price (EUR per MMBtu)',0.01,FIN],['disc','Syngas discount to market (%)',1,FIN],['mmbtu','MMBtu per 1,000 Nm³',0.5,FIN]];
    $('#grF').innerHTML=F.map(f=>f[0]==='eng'?`<label class="field">${f[1]}<select data-f="eng" data-o="fac" ${can('edit')?'':'disabled'}><option value="0"${FAC.eng?'':' selected'}>Not built, gas only</option><option value="1"${FAC.eng?' selected':''}>Built, surplus makes power</option></select></label>`:f[0]==='fuel'?`<label class="field">${f[1]}<select data-f="fuel" data-o="fac" ${can('edit')?'':'disabled'}><option value="bio"${FAC.fuel==='bio'?' selected':''}>Biomethane</option><option value="ng"${FAC.fuel==='ng'?' selected':''}>Natural gas</option></select></label>`:`<label class="field">${f[1]}<input type="number" min="0" step="${f[2]}" data-f="${f[0]}" data-o="${f[3]===FAC?'fac':'fin'}" value="${f[3][f[0]]}" ${can('edit')?'':'disabled'}></label>`).join('');
    wireMoney($('#grF'),i=>(i.dataset.o==='fac'?FAC:FIN)[i.dataset.f]);
    $('#grF').addEventListener('change',e=>{const k=e.target.dataset.f;if(!k)return;if(k==='fuel'){FAC.fuel=e.target.value;saveFac();tick(true);return;}if(k==='eng'){FAC.eng=e.target.value==='1';saveFac();applyHybrid();gotoScreen('grid');return;}const v=parseFloat(e.target.value);if(!(v>=0))return;
      if(e.target.dataset.o==='fac'){FAC[k]=k==='blend'?Math.min(100,v):v;saveFac();applyHybrid();}else{if(k==='ng'){if(FIN.ngMode==='auto'){e.target.value=FIN.ng;return;}FIN.ngMan=v;}FIN[k]=v;saveFin();if(k==='mmbtu')applyMmbtu();}tick(true);});
  }
  applyGasPrice();gasSrcPaint();
  const {P,bk}=D,sp=split(D.total),price=gasPrice(),hrs=D.total.h||1;
  const dayDem=demandMMh()*24,daySup=TPD*FIN.mmbtu,match=dayDem/FIN.mmbtu;
  renderKpis($('#grK'),[
    {l:'Sold to the factory',u:'MMBtu',v:sp.sold,d:0,s:''+cs(sp.sold*price)+' at '+cs(price,2),c:'var(--gas)'},
    ...(FAC.eng?[{l:'Gas to the engines',u:'MMBtu',v:sp.engFuel,d:0,s:HYB.engines+' × J620, '+fmt(sp.engKwh)+' kWh made',c:'var(--power)'},
    {l:'Electricity exported',u:'kWh',v:sp.expKwh,d:0,s:''+cs(sp.expKwh*FAC.elecSell)+' at '+cs(FAC.elecSell,2)+', after '+fmt(sp.ownKwh-sp.buyKwh)+' kWh own use',c:'var(--power)'}]:[]),
    {l:'Factory saving',u:'EUR',v:sp.sold*refPrice()*FIN.disc/100,d:0,s:fmt(FIN.disc)+' % below the market gas price, '+cs(refPrice(),2)+' per MMBtu'},
    {l:'Gas not used',u:'MMBtu',v:sp.sur,d:0,s:sp.sur>0.5?(FAC.eng?'engines full':'no buyer yet, engines not built'):'none',c:sp.sur>0.5?'var(--amber)':'var(--line2)'}]);
  $('#grU').textContent='MMBtu '+UNIT_PER[state.mode];$('#grP').textContent='('+P.label.toLowerCase()+')';$('#grDs').textContent='MMBtu a day';
  const sps=bk.map(b=>b.acc?split(b.acc):null);
  drawChart($('#c_gr'),{labels:bk.map(b=>b.label),series:[{name:'To the factory',color:'#8ccbe0',type:'bar',data:sps.map(x=>x&&x.sold),dec:0},...(FAC.eng?[{name:'To the engines',color:'#ff8f45',type:'bar',data:sps.map(x=>x&&x.engFuel),dec:0}]:[]),{name:'Not used',color:'#e8b13e',type:'bar',data:sps.map(x=>x&&x.sur),dec:0}]});
  const L=(a,b,c)=>`<tr><td>${a}</td><td class="r muted">${b}</td><td class="r num">${c}</td></tr>`;
  const surDay=Math.max(0,daySup-dayDem),engKwhDay=surDay*KWH_PER_MMBTU*HYB.eff;
  $('#grDem').innerHTML='<table>'+L('Plant supply, running day',fmt(TPD)+' t waste × '+fmt(FIN.mmbtu,1)+' MMBtu',fmt(daySup)+' MMBtu')+L('Furnace takes',fmt(FAC.glass)+' t glass × '+fmt(FAC.gj,1)+' GJ × '+fmt(FAC.blend)+' %',fmt(Math.min(dayDem,daySup))+' MMBtu')+
    (FAC.eng?L('<b>Surplus to the engines</b>','','<b>'+fmt(surDay)+' MMBtu</b>')+L('Electricity made',fmt(HYB.eff*100)+' % efficiency',fmt(engKwhDay/1000,1)+' MWh')+L('Plant own use','',fmt(165*S()*24/1000,1)+' MWh')+L('<b>Exported</b>','','<b>'+fmt(Math.max(0,engKwhDay-165*S()*24)/1000,1)+' MWh</b>'):L('<b>Surplus, not sold</b>','','<b>'+fmt(surDay)+' MMBtu</b>')+L('Share of the gas not sold','',fmt(daySup?surDay/daySup*100:0)+' %'))+'</table>'+
    `<div class="note">${FAC.eng?HYB.engines+' × INNIO Jenbacher J620 (3 MW each) burn the surplus.':'The engines are not built yet, so the surplus has no buyer: revenue counts only the gas the furnace takes. Switch them on below to see the hybrid case.'} To sell all the gas to the furnace, the plant would process about <b>${fmt(match)} t of waste a day</b>. Energy per tonne of glass is a typical value for container glass: use the factory's meter readings.</div>`;
  $('#grT').innerHTML='<table>'+L('Market gas price'+(FIN.ngMode==='auto'?' (TTF, auto)':' (manual)'),'',cs(refPrice(),2)+' per MMBtu')+L('Discount','',fmt(FIN.disc)+' %')+L('<b>Syngas price</b>','','<b>'+cs(price,2)+' per MMBtu</b>')+L('Sold to the factory',fmt(sp.sold)+' MMBtu × '+cs(price,2),eur(sp.sold*price))+(FAC.eng?L('Electricity exported',fmt(sp.expKwh)+' kWh × '+cs(FAC.elecSell,2),eur(sp.expKwh*FAC.elecSell))+L('Electricity not bought',fmt(sp.ownKwh-sp.buyKwh)+' kWh × '+cs(FIN.elec,2),eur((sp.ownKwh-sp.buyKwh)*FIN.elec)):'')+L('<b>Factory saving</b>',fmt(sp.sold)+' MMBtu × '+cs(FIN.ng*FIN.disc/100,2),'<b class="pos">'+eur(sp.sold*refPrice()*FIN.disc/100)+'</b>')+'</table>'+
    '<div class="note">Syngas is priced at '+fmt(FIN.disc)+' % below the market gas price. Auto uses the Dutch TTF front-month price, the European benchmark, checked every 6 hours and converted at 1 MMBtu = 0.293 MWh. Manual uses the price you type, for example the factory\'s delivered contract price.'+(FAC.fuel==='bio'?' The furnace burns biomethane today, so replacing it earns no fuel-switch carbon credit: credits come from landfill avoidance.':'')+'</div>';
}
PAGES.grid={title:'Gas sales',period:true,render:renderGrid,csv:()=>{const {P,bk}=D;const rows=metaRows([['Report','Gas sales to the bottle factory'],['Period',P.label+' ('+P.range+')'],['Market gas price EUR/MMBtu ('+(FIN.ngMode==='auto'?'auto, TTF':'manual')+')',FIN.ng],['Discount %',FIN.disc],['Syngas price EUR/MMBtu',r1(gasPrice(),2)],['MMBtu per 1000 Nm3',FIN.mmbtu],['Factory output t glass/day',FAC.glass],['Furnace GJ per t glass',FAC.gj],['Syngas share limit %',FAC.blend],['Engines',HYB.engines+' x J620'],['Electricity export price EUR/kWh',FAC.elecSell]]);rows.push(['Period','Syngas Nm3','Produced MMBtu','Sold to factory MMBtu','To engines MMBtu','Not used MMBtu','Electricity made kWh','Exported kWh','Syngas sales EUR','Electricity sales EUR','Factory saving EUR']);bk.forEach(b=>{if(!b.acc)return;const x=split(b.acc);rows.push([tsf(b.t),r1(b.acc.s.toGen,0),r1(x.mm,1),r1(x.sold,1),r1(x.engFuel,1),r1(x.sur,1),r1(x.engKwh,0),r1(x.expKwh,0),r1(x.sold*gasPrice(),0),r1(x.expKwh*FAC.elecSell,0),r1(x.sold*refPrice()*FIN.disc/100,0)]);});return {name:'gas-sales_'+fileTag()+'_'+slug(P.label)+'.csv',text:csvText(rows)};}};

/* =====================================================================
   Impact (ESG)
   ===================================================================== */
const ESG=Object.assign({home:11000,car:4.6,dens:0.9},lsGet('wtg_esg',{}));
function impactData(){
  const c=credits(D.total),hrs=D.total.h||1,kwh=c.mwh*1000;   /* only gas actually burned in place of natural gas */
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
  $('#imH').innerHTML=[[ICO.flame,fmtB(x.ngNm3),'Nm³ of '+fuelName()+' the glass furnace did not burn'],[ICO.home,fmt(x.homes),'homes, the same yearly gas use, at this rate for a year'],[ICO.car,fmt(x.cars),'cars off the road for a year, from '+fmt(x.c.net,0)+' tCO2e of net credits'],[ICO.fill,fmt(x.m3),'m³ of landfill space saved by '+fmt(x.c.waste,0)+' t of waste']].map(r=>`<div class="ih">${r[0]}<div><b>${r[1]}</b><span>${r[2]}</span></div></div>`).join('');
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

function applyMmbtu(){SALE_MMBTU=FIN.mmbtu;RATED_KW=contractKw();applyHybrid();}
applyMmbtu();applyHybrid();
