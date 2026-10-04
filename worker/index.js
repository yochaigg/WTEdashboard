/* Serves the dashboard files, plus one small API:
   /api/carbon-price  -> latest EU ETS allowance (EUA) price in EUR per tCO2e.
   Source: SendeCO2 monthly EUA average for the current month. Cached for 6 hours. */
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_EN=['January','February','March','April','May','June','July','August','September','October','November','December'];
const SRC='https://www.sendeco2.com/es/precios-co2';
const TTL=6*3600;

export function parseSendeco2(html,now=new Date()){
  const text=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&euro;|&#8364;/g,'€').replace(/\s+/g,' ');
  const re=new RegExp('('+MONTHS.join('|')+')\\s*:?\\s*([\\d.]+,\\d+)\\s*€','g');
  const clean=h=>h.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&euro;|&#8364;/g,'€').replace(/\s+/g,' ');
  for(const y of [now.getFullYear(),now.getFullYear()-1]){
    let src=text,at=-1;
    const tab=html.indexOf('brcm-sendeco-tab-'+y+'"',html.indexOf('tab_container'));
    if(tab>=0){const end=html.indexOf('</table>',tab);src=clean(html.slice(tab,end>0?end:tab+20000));at=0;}
    else at=text.search(new RegExp('\\b'+y+'\\b[\\s\\S]{0,400}?Enero'));
    if(at<0)continue;
    re.lastIndex=at;let m,seen=0,best=null;
    while(seen<12&&(m=re.exec(src))){
      seen++;const v=parseFloat(m[2].replace(/\./g,'').replace(',','.'));
      if(v>5&&v<500)best={price:v,month:MONTHS_EN[MONTHS.indexOf(m[1])]+' '+y};
      if(m[1]==='Diciembre')break;
    }
    if(best)return best;
  }
  return null;
}

async function carbonPrice(ctx,debug){
  const cache=caches.default,key=new Request('https://cache.local/carbon-price-v1');
  const hit=debug?null:await cache.match(key);if(hit)return hit;
  let body,status=200;
  try{
    const r=await fetch(SRC,{headers:{'User-Agent':'Mozilla/5.0 (plant dashboard price check)','Accept':'text/html'},cf:{cacheTtl:TTL}});
    if(!r.ok)throw new Error('source answered '+r.status);
    const html=await r.text();const p=parseSendeco2(html);
    if(!p)throw new Error('price not found on the source page'+(debug?': '+(()=>{const h=html.replace(/\s+/g,' ');const i=h.indexOf('Enero');return i+' | '+h.slice(Math.max(0,i-900),i+1500);})():''));
    body={ok:true,price:p.price,currency:'EUR',unit:'tCO2e',market:'EU ETS allowance (EUA)',basis:'monthly average, '+p.month,source:'SendeCO2',sourceUrl:SRC,fetchedAt:new Date().toISOString()};
  }catch(e){body={ok:false,error:String(e.message||e)};status=503;}
  const res=new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json','Cache-Control':status===200?'public, max-age='+TTL:'no-store','Access-Control-Allow-Origin':'*'}});
  if(status===200)ctx.waitUntil(cache.put(key,res.clone()));
  return res;
}

/* /api/fx -> euro exchange rates. Source: European Central Bank reference rates via Frankfurter,
   with open.er-api.com as a backup. Cached for 6 hours. */
const FX_SYMS=['USD','GBP'];
async function fxRates(ctx,debug){
  const cache=caches.default,key=new Request('https://cache.local/fx-v1');
  const hit=debug?null:await cache.match(key);if(hit)return hit;
  let body,errs=[];
  try{
    const r=await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols='+FX_SYMS.join(','),{headers:{'Accept':'application/json'}});
    if(!r.ok)throw new Error('Frankfurter answered '+r.status);
    const j=await r.json();if(!j.rates||!FX_SYMS.every(c=>j.rates[c]>0))throw new Error('Frankfurter: rates missing');
    body={ok:true,base:'EUR',date:j.date,rates:{EUR:1,...j.rates},source:'European Central Bank reference rate',fetchedAt:new Date().toISOString()};
  }catch(e){errs.push(String(e.message||e));}
  if(!body)try{
    const r=await fetch('https://open.er-api.com/v6/latest/EUR');
    if(!r.ok)throw new Error('open.er-api answered '+r.status);
    const j=await r.json();if(j.result!=='success'||!FX_SYMS.every(c=>j.rates&&j.rates[c]>0))throw new Error('open.er-api: rates missing');
    const rates={EUR:1};FX_SYMS.forEach(c=>rates[c]=j.rates[c]);
    body={ok:true,base:'EUR',date:new Date(j.time_last_update_unix*1000).toISOString().slice(0,10),rates,source:'open.er-api.com',fetchedAt:new Date().toISOString()};
  }catch(e){errs.push(String(e.message||e));}
  if(!body)body={ok:false,error:errs.join('; ')};
  const res=new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json','Cache-Control':body.ok?'public, max-age='+TTL:'no-store','Access-Control-Allow-Origin':'*'}});
  if(body.ok)ctx.waitUntil(cache.put(key,res.clone()));
  return res;
}

/* shared: try sources in order, cache the first good answer */
const UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36','Accept':'text/html,application/json;q=0.9,*/*;q=0.8','Accept-Language':'en-US,en;q=0.9'};
async function firstGood(ctx,cacheKey,sources,debug){
  const cache=caches.default,key=new Request('https://cache.local/'+cacheKey);
  const hit=debug?null:await cache.match(key);if(hit)return hit;
  let body=null;const errs=[];
  for(const [name,fn] of sources){try{const v=await fn(debug);body={ok:true,...v,source:v.source||name,fetchedAt:new Date().toISOString()};break;}catch(e){errs.push(name+': '+String(e.message||e).slice(0,debug?2000:200));}}
  if(!body)body={ok:false,error:errs.join(' | ')};else if(debug)body.tried=errs;
  const res=new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json','Cache-Control':body.ok?'public, max-age='+TTL:'no-store','Access-Control-Allow-Origin':'*'}});
  if(body.ok&&!debug)ctx.waitUntil(cache.put(key,res.clone()));
  return res;
}
const getText=async(url,h)=>{const r=await fetch(url,{headers:{...UA,...(h||{})}});if(!r.ok)throw new Error('HTTP '+r.status);return r.text();};
const stripHtml=h=>h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');

/* /api/nj-power -> New Jersey average retail electricity price, US cents per kWh, by sector (EIA) */
const NJ_SECTORS=['residential','commercial','industrial','transportation','all'];
export function parseEiaTable(html){
  const text=stripHtml(html);
  const i=text.indexOf('New Jersey');if(i<0)throw new Error('New Jersey row not found');
  const nums=(text.slice(i+10,i+260).match(/-?\d+(?:\.\d+)?|NM|--|W/g)||[]).slice(0,10);
  if(nums.length<10)throw new Error('row too short: '+text.slice(i,i+200));
  const v=k=>{const x=parseFloat(nums[k]);return isFinite(x)?x:null;};
  const cents={residential:v(0),commercial:v(2),industrial:v(4),transportation:v(6),all:v(8)};
  if(!(cents.all>3&&cents.all<80))throw new Error('implausible price '+cents.all);
  const m=text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d\d)/);
  return {cents,month:m?m[1]+' '+m[2]:''};
}
async function njPower(ctx,debug){
  return firstGood(ctx,'nj-power-v1',[
    ['EIA Electric Power Monthly, table 5.6.A',async()=>{const h=await getText('https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a');const p=parseEiaTable(h);return {state:'New Jersey',unit:'US cents per kWh',...p,source:'U.S. EIA Electric Power Monthly'};}],
    ['EIA API',async()=>{const r=await fetch('https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=DEMO_KEY&frequency=monthly&data[0]=price&facets[stateid][]=NJ&sort[0][column]=period&sort[0][direction]=desc&length=12');if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();const rows=(j.response&&j.response.data)||[];if(!rows.length)throw new Error('no rows');
      const per=rows[0].period,map={RES:'residential',COM:'commercial',IND:'industrial',TRA:'transportation',ALL:'all'},cents={};rows.filter(x=>x.period===per).forEach(x=>{if(map[x.sectorid])cents[map[x.sectorid]]=+x.price;});
      if(!(cents.all>3))throw new Error('no all-sector price');const d=new Date(per+'-01T00:00:00Z');return {state:'New Jersey',unit:'US cents per kWh',cents,month:d.toLocaleString('en-US',{month:'long',year:'numeric',timeZone:'UTC'}),source:'U.S. EIA'};}],
  ],debug);
}

/* /api/gas-price -> European natural gas market price (Dutch TTF front month), EUR per MWh */
async function gasPrice(ctx,debug){
  return firstGood(ctx,'gas-price-v1',[
    ['Yahoo Finance TTF=F',async()=>{for(const host of ['query1','query2']){try{const r=await fetch('https://'+host+'.finance.yahoo.com/v8/finance/chart/TTF=F?range=5d&interval=1d',{headers:UA});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();const m=j.chart.result[0].meta;const v=+m.regularMarketPrice;if(!(v>3&&v<500))throw new Error('bad price '+v);
      return {market:'Dutch TTF natural gas, front month',eurPerMwh:v,currency:m.currency||'EUR',asOf:new Date((m.regularMarketTime||Date.now()/1000)*1000).toISOString().slice(0,10),source:'ICE Endex TTF via Yahoo Finance'};}catch(e){if(host==='query2')throw e;}}}],
    ['Trading Economics',async()=>{const t=stripHtml(await getText('https://tradingeconomics.com/commodity/eu-natural-gas'));
      const m=t.match(/(?:TTF|EU Natural Gas)[^.]{0,200}?(?:to|at|reached|traded)\s+(?:around\s+)?(?:€|EUR\s*)?(\d{1,3}(?:\.\d+)?)\s*(?:EUR|€)?\s*(?:per|\/)\s*MWh/i);if(!m)throw new Error('price not found: '+t.slice(0,300));
      return {market:'Dutch TTF natural gas',eurPerMwh:+m[1],currency:'EUR',asOf:new Date().toISOString().slice(0,10),source:'Trading Economics'};}],
  ],debug);
}

export default{
  async fetch(req,env,ctx){
    const u=new URL(req.url);
    if(u.pathname==='/api/carbon-price')return carbonPrice(ctx,u.searchParams.has('debug'));
    if(u.pathname==='/api/fx')return fxRates(ctx,u.searchParams.has('debug'));
    if(u.pathname==='/api/nj-power')return njPower(ctx,u.searchParams.has('debug'));
    if(u.pathname==='/api/gas-price')return gasPrice(ctx,u.searchParams.has('debug'));
    return env.ASSETS.fetch(req);
  }
};
