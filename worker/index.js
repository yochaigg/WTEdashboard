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

export default{
  async fetch(req,env,ctx){
    const u=new URL(req.url);
    if(u.pathname==='/api/carbon-price')return carbonPrice(ctx,u.searchParams.has('debug'));
    if(u.pathname==='/api/fx')return fxRates(ctx,u.searchParams.has('debug'));
    return env.ASSETS.fetch(req);
  }
};
