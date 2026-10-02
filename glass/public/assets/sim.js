'use strict';
'use strict';
/* ================= SIMULATOR (deterministic: same time gives same data) ================= */
const MIN=60000, HOUR=3600000, DAY=86400000;
const SUPPLIERS=['Municipal Collection','EcoHaul','GreenRoute','City Services','AgroTrans'];
let TPD=200;                       /* waste processed per day, tons (editable in header) */
const S=()=>TPD/30;                 /* scale vs the 30 t/day base model */
/* GAS VERSION: cleaned syngas is piped to a glass factory and burned in its furnace instead of natural gas.
   p.kw is the heat delivered to the factory in kW (thermal), p.ownKw the electricity the plant buys for itself. */
let RATED_KW=38000;                 /* delivery capacity in the gas supply contract, kW thermal */
/* gas basis: 1 t of waste gives 1,000 Nm3 of syngas; 1,000 Nm3 at 13,400 kJ/Nm3 holds 12.7 MMBtu */
let SALE_MMBTU=12.7;
const KWH_PER_MMBTU=293.071;
const LHV_REF=13.40;                /* MJ/Nm3 for the design gas: CO 35, H2 50, CH4 10, N2 5 (mol %) */
const saleKwhPerNm3=()=>SALE_MMBTU*KWH_PER_MMBTU/1000;
function contractKw(){return Math.ceil(TPD/24*1000*saleKwhPerNm3()*1.15/1000)*1000;}
const ENG_KW=0;let ENGINES=2;       /* two gas booster blowers push the syngas to the factory */
function enginesNeeded(){return 2;}
const NG_KWH=10.0;
/* HYBRID: the glass furnace takes what it can burn (HYB.demKw); the surplus runs gas engines (INNIO Jenbacher J620,
   3 MW electrical each, about 34 % efficient). Their power covers the plant's own use first, the rest is exported. */
const HYB={demKw:Infinity,engines:1,engKw:3000,eff:0.34,toEngines:true};                  /* heating value of natural gas, kWh per Nm3 (LHV), used for natural gas equivalents */
function resetSim(){truckCache.clear();dayCache.clear();monthCache.clear();dropCache.clear();alertDayCache.clear();}

function hash(n){const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);}
function noise(m,seed){return (Math.sin(m/37+seed*1.3)+0.6*Math.sin(m/11.3+seed*2.1)+0.4*Math.sin(m/4.7+seed*0.7))/2;}

function dayInfo(ms){
  const d=new Date(ms);d.setHours(0,0,0,0);
  const n=new Date(d);n.setDate(n.getDate()+1);
  return {start:d.getTime(),end:n.getTime(),ord:Math.round(d.getTime()/DAY)};
}
const SHUT_EVERY=73,SHUT_OFF=17; /* 5 planned shutdown days per year, plant runs 360 days */
const isShutdown=ord=>((ord+SHUT_OFF)%SHUT_EVERY+SHUT_EVERY)%SHUT_EVERY===0;
function dayFactor(ord){return isShutdown(ord)?0:0.95+0.10*hash(ord*1.7+0.5);}

const truckCache=new Map();
function trucksOfDay(ms){
  const di=dayInfo(ms);
  if(truckCache.has(di.start))return truckCache.get(di.start);
  const o=di.ord,f=dayFactor(o);
  const n=f===0?0:Math.max(1,Math.round((TPD/200)*(20+Math.floor(hash(o*1.1+0.3)*9))));   /* about 24 trucks a day at 200 t/day, more trucks at higher throughput */
  const raw=[],times=[];
  for(let i=0;i<n;i++){raw.push(0.7+0.6*hash(o*3.1+i));times.push(24*(i+0.5+0.5*(hash(o*5.3+i*1.37)-0.5))/n);}
  times.sort((a,b)=>a-b);
  const sum=raw.reduce((a,b)=>a+b,0),total=TPD*f;
  const list=times.map((h,i)=>{
    const tons=total*raw[i]/sum,t=di.start+h*HOUR;
    const q=3+Math.floor(hash(o*2.9+i*1.7)*8),dur=Math.round(5+tons*0.8+hash(o*4.3+i*2.2)*5),bay=1+Math.floor(hash(o*6.1+i*3.3)*BAYS);
    const offStart=t+q*MIN,offEnd=offStart+dur*MIN;
    return {t,tons,supplier:SUPPLIERS[Math.floor(hash(o*7.7+i*2.3)*SUPPLIERS.length)],id:'TK-'+String(o%100000).padStart(5,'0')+'-'+(i+1),
      plate:plateFor(o,i),conf:91+8.9*hash(o*8.9+i*0.7),bay,offStart,offEnd,offMin:dur,exit:offEnd+4*MIN,lprCam:LPR_CAM,offCam:'CAM-OFF-'+bay};
  });
  truckCache.set(di.start,list);
  return list;
}
function trucksBetween(t0,t1){
  const out=[];
  for(let d=dayInfo(t0).start;d<t1;d=dayInfo(d+30*HOUR).start){
    trucksOfDay(d).forEach(k=>{if(k.t>=t0&&k.t<t1)out.push(k);});
  }
  return out;
}

/* disturbances: every 4h block has a chance of a short event of one of 4 types */
function disturbance(m){
  const blk=Math.floor(m/240);let best={d:0,type:0};
  for(let b=blk-1;b<=blk;b++){
    if(hash(b*9.13+2)<0.45){
      const c=b*240+20+hash(b*3.7+1)*190,w=Math.abs(m-c)/9;
      if(w<1){const d=0.5*(1+Math.cos(Math.PI*w));if(d>best.d)best={d,type:Math.floor(hash(b*5.1+4)*4)};}
    }
  }
  return best;
}

function plant(t){
  const m=t/MIN,o=Math.round(dayInfo(t).start/DAY),f=dayFactor(o);
  const ev=disturbance(m),d=ev.d,ty=ev.type;
  const d0=ty===0?d:0,d1=ty===1?d:0,d2=ty===2?d:0,d3=ty===3?d:0;
  const p={t};
  p.briqRate=1100*S()*f*(1+0.04*noise(m,1))*(1-0.35*d0);
  const yieldNm3=1000/(0.88*0.97*1000)*(1+0.05*noise(m,2));   /* 1,000 Nm3 delivered per t of waste */
  p.gasRate=p.briqRate*yieldNm3*(1-0.25*d0);
  p.genRate=p.gasRate*0.97;
  p.reactor=950+16*noise(m,3)-110*d0;
  p.scrubber=160+7*noise(m,4)+45*d3;
  p.corona=95+5*noise(m,5)+8*d3;
  p.cooling=35+3*noise(m,6)+3*d3;
  p.CO=35+1.5*noise(m,7)-3*d0;
  p.H2=50+1.5*noise(m,8)-4*d0;
  p.CH4=10+0.4*noise(m,9);
  p.CO2=0.3+0.2*noise(m,10)+2*d0;
  p.O2=0.4+0.1*noise(m,11)+1.6*d1;
  p.N2=100-p.CO-p.H2-p.CH4-p.CO2-p.O2;
  p.tar=18+4*noise(m,18)+40*d3;
  p.lhv=(p.CO*12.63+p.H2*10.78+p.CH4*35.8)/100;   /* MJ/Nm3 */
  p.lhvKwh=p.lhv/3.6;
  p.eff=1;
  p.kw=Math.min(RATED_KW,p.genRate*saleKwhPerNm3()*p.lhv/LHV_REF);   /* energy delivered on the sales basis, kW; follows gas quality */
  p.ownKw=165*S()*(1+0.03*noise(m,23));             /* electricity bought for shredder, press, blowers and pumps */
  p.emCO=220+30*noise(m,13)+320*d2;
  p.emNOx=170+20*noise(m,14)+60*d2;
  p.emSO2=18+4*noise(m,15);
  p.emPM=4+1*noise(m,16);
  p.co2Rate=p.genRate*((p.CO+p.CH4+p.CO2)/100)*1.963;  /* kg/h */
  p.ashRate=p.briqRate*0.11*(1+0.05*noise(m,17));
  p.press=-8+1.5*noise(m,19);
  p.ph=7.2+0.2*noise(m,20);
  p.kv=42+1.5*noise(m,21)-3*d3;
  p.level=72+3*noise(m,22);
  if(f===0){ /* planned shutdown day */
    Object.assign(p,{shutdown:true,briqRate:0,gasRate:0,genRate:0,kw:0,co2Rate:0,ashRate:0,ownKw:25*S(),reactor:60+3*noise(m,3),scrubber:30+2*noise(m,4),corona:25+noise(m,5),cooling:22+noise(m,6),
      CO:0,H2:0,CH4:0,CO2:0.04,O2:20.9,N2:79.06,tar:0,lhv:0,lhvKwh:0,eff:0,emCO:0,emNOx:0,emSO2:0,emPM:0,kv:0,press:0});
  }
  /* split the gas between the furnace and the engines */
  p.facKw=Math.min(p.kw,HYB.demKw);
  const sur=p.kw-p.facKw;
  const fuel=HYB.toEngines?Math.min(sur,HYB.engines*HYB.engKw/HYB.eff):0;
  p.engFuelKw=fuel;p.engKw=fuel*HYB.eff;p.spareKw=sur-fuel;
  p.expKw=Math.max(0,p.engKw-p.ownKw);p.buyKw=Math.max(0,p.ownKw-p.engKw);
  return p;
}

const WKEYS=['reactor','scrubber','corona','cooling','CO','H2','CH4','CO2','O2','N2','tar','lhv','lhvKwh','kw','eff','emCO','emNOx','emSO2','emPM','briqRate','gasRate','genRate','ashRate','co2Rate','press','ph','kv','level','ownKw','facKw','engFuelKw','engKw','spareKw','expKw','buyKw'];
function newAcc(){const a={h:0,s:{waste:0,trucks:0,briq:0,gas:0,toGen:0,kwh:0,ash:0,co2:0},w:{}};WKEYS.forEach(k=>a.w[k]=0);return a;}
function addStep(a,p,h){
  a.h+=h;a.s.briq+=p.briqRate*h;a.s.gas+=p.gasRate*h;a.s.toGen+=p.genRate*h;a.s.kwh+=p.kw*h;a.s.ash+=p.ashRate*h;a.s.co2+=p.co2Rate*h;
  WKEYS.forEach(k=>a.w[k]+=p[k]*h);
}
function mergeAcc(a,b){a.h+=b.h;for(const k in a.s)a.s[k]+=b.s[k];WKEYS.forEach(k=>a.w[k]+=b.w[k]);return a;}
function avgOf(a,k){return a&&a.h?a.w[k]/a.h:0;}
function integrate(t0,t1){
  const a=newAcc(),step=15*MIN;
  for(let t=t0;t<t1;){const len=Math.min(step,t1-t);addStep(a,plant(t+len/2),len/HOUR);t+=len;}
  const tk=trucksBetween(t0,t1);a.s.waste=tk.reduce((s,k)=>s+k.tons,0);a.s.trucks=tk.length;
  return a;
}
const dayCache=new Map(),monthCache=new Map();
function dayAcc(ms,now){
  const di=dayInfo(ms);
  if(di.end<=now){if(!dayCache.has(di.start))dayCache.set(di.start,integrate(di.start,di.end));return dayCache.get(di.start);}
  return integrate(di.start,now);
}
function monthAcc(y,mo,now){
  const s=new Date(y,mo,1).getTime(),e=new Date(y,mo+1,1).getTime();
  if(s>=now)return null;
  const key=y*12+mo;
  if(e<=now&&monthCache.has(key))return monthCache.get(key);
  const a=newAcc(),dim=new Date(y,mo+1,0).getDate();
  for(let i=1;i<=dim;i++){const ds=new Date(y,mo,i).getTime();if(ds<now)mergeAcc(a,dayAcc(ds,now));}
  if(e<=now)monthCache.set(key,a);
  return a;
}

/* ================= ALERT RULES (placeholder limits, edit freely) ================= */
const RULES=[
 {id:'rtLow',name:'Reactor temperature low',unit:'°C',dec:0,get:p=>p.reactor,dir:'min',warn:900,crit:850,node:'reactor'},
 {id:'o2High',name:'Syngas O2 high (air ingress)',unit:'%',dec:2,get:p=>p.O2,dir:'max',warn:1.0,crit:1.5,node:'reactor'},
 {id:'scrHigh',name:'Scrubber temperature high',unit:'°C',dec:0,get:p=>p.scrubber,dir:'max',warn:180,crit:200,node:'scrubber'},
 {id:'tarHigh',name:'Tar after corona high',unit:'mg/Nm³',dec:0,get:p=>p.tar,dir:'max',warn:50,crit:80,node:'corona'},
 {id:'genGas',name:'Gas flow to the factory low',unit:'Nm³/h',dec:0,get:p=>p.genRate,dir:'min',warn:6000,crit:null,node:'gen',perTpd:true},
 {id:'lhvLow',name:'Gas heating value low',unit:'MJ/Nm³',dec:2,get:p=>p.lhv,dir:'min',warn:12.6,crit:12.0,node:'gen'}
];
/* thresholds are editable on the Alarm rules page; perTpd limits are quoted at 200 t/day and scale with throughput */
function ruleLim(r,k){const v=r[k];return v==null?null:(r.perTpd?v*TPD/200:v);}
function ruleSev(r,v){const w=ruleLim(r,'warn'),c=ruleLim(r,'crit');
  if(r.dir==='min'){if(c!=null&&v<c)return 'crit';if(w!=null&&v<w)return 'warn';}
  else{if(c!=null&&v>c)return 'crit';if(w!=null&&v>w)return 'warn';}
  return null;}
RULES.forEach(r=>{r.def={warn:r.warn,crit:r.crit};r.on=true;r.test=v=>r.on?ruleSev(r,v):null;});
function scanAlerts(now,hours){
  const step=MIN,base=Math.floor(now/step)*step,eps=[],open={};
  for(let t=base-hours*HOUR;t<=base;t+=step){
    const p=plant(t);
    if(p.shutdown){for(const id in open){open[id].end=t;delete open[id];}continue;}
    for(const r of RULES){
      const v=r.get(p),sev=r.test(v),o=open[r.id];
      if(sev){
        if(!o){const e={key:r.id+'@'+(t/MIN),rule:r,start:t,end:null,sev,peak:v};open[r.id]=e;eps.push(e);}
        else{if(sev==='crit')o.sev='crit';o.peak=r.dir==='min'?Math.min(o.peak,v):Math.max(o.peak,v);}
      }else if(o){o.end=t;delete open[r.id];}
    }
  }
  return eps;
}

/* ================= v9: LPR trucks, history, drops, analysis ================= */
const PLATE_L='ABCDEFGHJKLMNPRSTUVWXYZ',LPR_CAM='CAM-LPR-01',BAYS=2;
function plateFor(o,i){const r=k=>hash(o*13.7+i*5.1+k),L=k=>PLATE_L[Math.floor(r(k)*PLATE_L.length)];return L(1)+L(2)+L(3)+' '+String(1000+Math.floor(r(4)*9000));}

/* alert history. With ALERT_FASTSCAN only minutes with a plant disturbance are evaluated, which is exact while normal values cannot reach an alert limit (checked by a test) */
let ALERT_FASTSCAN=true;   /* exact while limits are at defaults (alerts only happen during disturbances); turned off when limits are edited */
const alertDayCache=new Map();
function scanRange(s,e){
  const eps=[],open={},step=MIN;
  for(let t=Math.ceil(s/step)*step;t<=e;t+=step){
    if(ALERT_FASTSCAN&&disturbance(t/MIN).d===0){for(const id in open){open[id].end=t;delete open[id];}continue;}
    const p=plant(t);
    if(p.shutdown){for(const id in open){open[id].end=t;delete open[id];}continue;}
    for(const r of RULES){
      const v=r.get(p),sev=r.test(v),o=open[r.id];
      if(sev){
        if(!o){const ep={key:r.id+'@'+(t/MIN),rule:r,start:t,end:null,sev,peak:v};open[r.id]=ep;eps.push(ep);}
        else{if(sev==='crit')o.sev='crit';o.peak=r.dir==='min'?Math.min(o.peak,v):Math.max(o.peak,v);}
      }else if(o){o.end=t;delete open[r.id];}
    }
  }
  return eps;
}
function alertsOfDay(ds){
  const di=dayInfo(ds),now=Date.now();
  if(alertDayCache.has(di.start))return alertDayCache.get(di.start);
  const eps=scanRange(di.start-HOUR,Math.min(di.end+HOUR,now)).filter(x=>x.start>=di.start&&x.start<di.end);
  if(di.end+HOUR<=now)alertDayCache.set(di.start,eps);
  return eps;
}

/* output drops: heat delivered at least DROP_PCT below its own 3 hour average (sampled every 5 minutes) */
const DROP_STEP=5*MIN,DROP_PCT=0.12;
const dropCache=new Map();
function detectDrops(t0,t1){
  const step=DROP_STEP,now=Date.now(),s=Math.floor((t0-3*HOUR)/step)*step,end=Math.min(t1+HOUR,now),n=Math.floor((end-s)/step)+1;
  if(n<50)return [];
  const kw=new Float64Array(n),sd=new Int32Array(n+1);for(let i=0;i<n;i++){const q=plant(s+i*step);kw[i]=q.kw;sd[i+1]=sd[i]+(q.shutdown?1:0);}
  const ps=new Float64Array(n+1);for(let i=0;i<n;i++)ps[i+1]=ps[i]+kw[i];
  const L=36,G=6,out=[];let cur=null;
  const fin=c=>{
    const ev={t0:s+c.i0*step,t1:s+(c.i1+1)*step,tMin:s+c.minI*step,minKw:c.min,baseKw:c.base,depth:1-c.min/c.base};
    ev.durMin=(ev.t1-ev.t0)/MIN;let lost=0;for(let k=c.i0;k<=c.i1;k++)lost+=Math.max(0,c.base-kw[k]);
    ev.lostKwh=lost*step/HOUR;ev.id='DROP-'+Math.round(ev.t0/MIN);
    if(c.i1>c.i0||ev.depth>=0.2)out.push(ev);
  };
  for(let i=L;i<n;i++){
    const a=i-L,b=i-G,base=(ps[b]-ps[a])/(b-a);
    if(sd[i+1]-sd[a]>0){if(cur){fin(cur);cur=null;}continue;}
    if(kw[i]<(1-DROP_PCT)*base){
      if(!cur)cur={i0:i,i1:i,minI:i,min:kw[i],base};
      else{cur.i1=i;if(kw[i]<cur.min){cur.min=kw[i];cur.minI=i;}cur.base=Math.max(cur.base,base);}
    }else if(cur&&i-cur.i1>2){fin(cur);cur=null;}
  }
  if(cur)fin(cur);
  return out;
}
function dropsOfDay(ds){
  const di=dayInfo(ds),now=Date.now();
  if(dropCache.has(di.start))return dropCache.get(di.start);
  const r=detectDrops(di.start,di.end).filter(e=>e.t0>=di.start&&e.t0<di.end);
  if(di.end+HOUR<=now)dropCache.set(di.start,r);
  return r;
}
function dropsBetween(t0,t1){
  const out=[];
  for(let d=dayInfo(t0).start;d<t1;d=dayInfo(d+30*HOUR).start)dropsOfDay(d).forEach(e=>{if(e.t0>=t0&&e.t0<t1)out.push(e);});
  return out;
}

/* event log */
function eventsBetween(t0,t1){
  const now=Date.now(),hi=Math.min(t1,now+1),ev=[];
  for(let d=dayInfo(t0).start;d<hi;d=dayInfo(d+30*HOUR).start){
    const di=dayInfo(d);
    if(isShutdown(di.ord)){
      if(di.start>=t0&&di.start<hi)ev.push({id:'SHUT-'+di.ord+':on',t:di.start,type:'op',kind:'shutdown',sev:'warn',title:'Planned shutdown started',detail:'maintenance day, no feed, no gas to the factory (furnace on natural gas), no trucks'});
      if(di.end>=t0&&di.end<hi)ev.push({id:'SHUT-'+di.ord+':off',t:di.end,type:'op',kind:'restart',sev:'ok',title:'Plant restarted after planned shutdown',detail:'back to normal operation'});
    }
    trucksOfDay(d).forEach(k=>{
      const add=(t,kind,title,detail)=>{if(t>=t0&&t<hi)ev.push({id:k.id+':'+kind,t,type:'truck',kind,sev:'info',title,detail,truck:k});};
      add(k.t,'lpr','LPR read at gate: '+k.plate,'confidence '+k.conf.toFixed(1)+' %, ticket '+k.id+', '+k.supplier+', camera '+k.lprCam);
      add(k.offStart,'offstart','Offloading started at bay '+k.bay,k.plate+', ticket '+k.id+', camera '+k.offCam);
      add(k.offEnd,'offend','Offloading finished: '+k.tons.toFixed(2)+' t in '+k.offMin+' min',k.plate+', bay '+k.bay+', camera '+k.offCam);
    });
    alertsOfDay(d).forEach(a=>{
      if(a.start>=t0&&a.start<hi)ev.push({id:a.key+':on',t:a.start,type:'alert',kind:'raised',sev:a.sev,title:a.rule.name,detail:'alert raised, '+(a.sev==='crit'?'critical':'warning'),alert:a});
      if(a.end!=null&&a.end>=t0&&a.end<hi)ev.push({id:a.key+':off',t:a.end,type:'alert',kind:'cleared',sev:'ok',title:a.rule.name+' cleared',detail:'lasted '+Math.round((a.end-a.start)/MIN)+' min, peak '+a.peak.toFixed(a.rule.dec)+' '+a.rule.unit,alert:a});
    });
    dropsOfDay(d).forEach(x=>{
      const pct=Math.round(x.depth*100);
      if(x.t0>=t0&&x.t0<hi)ev.push({id:x.id+':on',t:x.t0,type:'drop',kind:'drop',sev:x.depth>=0.3?'crit':'warn',title:'Gas delivery drop: heat -'+pct+' %',detail:Math.round(x.baseKw)+' kW to '+Math.round(x.minKw)+' kW, '+Math.round(x.durMin)+' min',drop:x});
      if(x.t1>=t0&&x.t1<hi)ev.push({id:x.id+':off',t:x.t1,type:'drop',kind:'recover',sev:'ok',title:'Output recovered',detail:'after '+Math.round(x.durMin)+' min, lowest '+Math.round(x.minKw)+' kW',drop:x});
    });
  }
  ev.sort((a,b)=>b.t-a.t);
  return ev;
}

/* drill-down analysis of one event window */
const AN_PARAMS=[['kw','Heat delivered','kW',0],['briqRate','Briquet feed','kg/h',0],['gasRate','Gas out of reactor','Nm³/h',0],['genRate','Gas to the factory','Nm³/h',0],['reactor','Reactor temperature','°C',0],['scrubber','Scrubber temperature','°C',0],['corona','Corona temperature','°C',0],['cooling','Cooling temperature','°C',0],['O2','Syngas O₂','%',2],['CO','Syngas CO','%',1],['H2','Syngas H₂','%',1],['lhv','Heating value','MJ/Nm³',2],['tar','Tar after corona','mg/Nm³',0],['press','Reactor pressure','mbar',1]];
function analyzeEvent(evIn){
  const now=Date.now(),ev=Object.assign({},evIn);
  ev.t1=Math.min(Math.max(ev.t1,ev.t0+MIN),now);
  const step=2*MIN,s=Math.floor((ev.t0-90*MIN)/step)*step,e=Math.min(ev.t1+90*MIN,now);
  const n=Math.floor((e-s)/step)+1,ts=[],P=[];
  for(let i=0;i<n;i++){ts.push(s+i*step);P.push(plant(s+i*step));}
  const bEnd=ev.t0-15*MIN;let nb=0;while(nb<n&&ts[nb]<bEnd)nb++;
  let i0=0;while(i0<n-1&&ts[i0]<ev.t0)i0++;
  let i1=n-1;while(i1>i0&&ts[i1]>ev.t1)i1--;
  const rows=AN_PARAMS.map(([k,label,unit,dec])=>{
    let sum=0;for(let i=0;i<nb;i++)sum+=P[i][k];
    const base=nb?sum/nb:P[0][k];
    let v2=0;for(let i=0;i<nb;i++)v2+=Math.pow(P[i][k]-base,2);
    const sd=nb>1?Math.sqrt(v2/(nb-1)):0,thr=Math.max(3*sd,0.01*Math.abs(base),1e-9);
    let ext=P[i0][k],edx=0;
    for(let i=i0;i<=i1;i++){const d=P[i][k]-base;if(Math.abs(d)>edx){edx=Math.abs(d);ext=P[i][k];}}
    const change=ext-base,moved=Math.abs(change)>thr;
    let onset=null;
    for(let i=Math.max(0,nb-3);i<=i1;i++){
      if(ts[i]<ev.t0-60*MIN)continue;
      if(Math.abs(P[i][k]-base)>thr&&(i+1>i1||Math.abs(P[i+1][k]-base)>thr)){onset=(ts[i]-ev.t0)/MIN;break;}
    }
    return {key:k,label,unit,dec,base,ext,change,rel:base?change/Math.abs(base):0,moved,onset,thr};
  });
  const R={};rows.forEach(r=>{R[r.key]=r;});
  const bin=o=>o==null?1e9:Math.round(o/4);
  const mv=rows.filter(r=>r.moved).sort((a,b)=>(bin(a.onset)-bin(b.onset))||(Math.abs(b.rel)-Math.abs(a.rel)));
  const still=rows.filter(r=>!r.moved);
  let lost=0,briqLost=0,kwMin=Infinity;
  for(let i=i0;i<=i1;i++){lost+=Math.max(0,R.kw.base-P[i].kw);briqLost+=Math.max(0,R.briqRate.base-P[i].briqRate);kwMin=Math.min(kwMin,P[i].kw);}
  const impact={durMin:(ev.t1-ev.t0)/MIN,kwBase:R.kw.base,kwMin,lostKwh:lost*step/HOUR,briqLostKg:briqLost*step/HOUR};
  const hints=[],pc=k=>Math.round(Math.abs(R[k].rel)*100);
  if(R.briqRate.moved&&R.briqRate.rel<-0.15&&R.reactor.moved&&R.reactor.change<-30)hints.push('Feed interruption pattern: briquet feed fell '+pc('briqRate')+' %, the reactor cooled by '+Math.round(-R.reactor.change)+' °C, then gas flow and heat to the factory followed. Check the conveyor and feeder, the briquet hopper (bridging or a jam) and briquet supply.');
  else if(R.reactor.moved&&R.reactor.change<-30)hints.push('Reactor cooling without a feed change: check air or steam supply, bed condition and ash removal.');
  if(R.O2.moved&&R.O2.change>0.5)hints.push('Oxygen rise pattern: possible air ingress at seals, the feeder lock or ash discharge, or an analyzer sampling problem.');
  if((R.scrubber.moved&&R.scrubber.change>15)||(R.tar.moved&&R.tar.change>15))hints.push('Gas cleaning pattern: scrubber temperature or tar rose. Check scrubber water flow and temperature, and the corona unit.');
  if(R.lhv&&R.lhv.moved&&R.lhv.rel<-0.04)hints.push('Gas quality pattern: heating value fell '+pc('lhv')+' %. The furnace burners need more gas for the same heat, so check the glass factory burner control and the hydrogen and CO content.');
  if(!hints.length)hints.push(mv.length?'No known pattern matched. Compare the parameters in the table.':'No parameter moved beyond its normal noise in this window.');
  const alerts=[],trucks=[];
  for(let d=dayInfo(s).start;d<e;d=dayInfo(d+30*HOUR).start){
    alertsOfDay(d).forEach(a=>{if(a.start<=e&&(a.end==null||a.end>=s))alerts.push(a);});
    trucksOfDay(d).forEach(k=>trucks.push(k));
  }
  const during=trucks.filter(k=>k.offEnd>=s&&k.offStart<=e).sort((a,b)=>a.offStart-b.offStart);
  const before=trucks.filter(k=>k.offEnd<ev.t0).sort((a,b)=>b.offEnd-a.offEnd)[0]||null;
  const hm=t=>{const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
  const norm=k=>P.map(p=>R[k].base?p[k]/R[k].base*100:100);
  const series=[{name:'Heat delivered',color:'#2dd4bf',type:'line',data:norm('kw'),dec:1},{name:'Briquet feed',color:'#f5b942',type:'line',data:norm('briqRate'),dec:1},{name:'Gas out of reactor',color:'#a78bfa',type:'line',data:norm('gasRate'),dec:1},{name:'Reactor temperature',color:'#f97316',type:'line',data:norm('reactor'),dec:1}];
  return {ev,s,e,n,ts,P,rows,R,mv,still,impact,hints,alerts,during,before,series,labels:ts.map(hm),i0,i1};
}

