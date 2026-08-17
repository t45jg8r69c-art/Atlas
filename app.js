const tabs=[['home','Home'],['wealth','Wealth'],['alpha','Alpha'],['coach','Coach']];
const markets=[
  ['YM=F','Dow Jones Future','Dow Jones Future'],['NQ=F','Nasdaq 100 Future','Nasdaq 100 Future'],['ES=F','S&P 500 Future','S&P 500 Future'],['RTY=F','Russell 2000 Future','Russell 2000 Future'],['FDAX.EX','DAX Future','DAX Future'],['GC=F','Gold Future','Gold Future'],['SI=F','Silber Future','Silber Future'],['HG=F','Kupfer Future','Kupfer Future'],['CL=F','WTI Öl Future','WTI Öl Future'],['BZ=F','Brent Öl Future','Brent Öl Future'],['DX=F','US Dollar Index Future','US Dollar Index Future'],['EURUSD=X','EUR/USD','EUR/USD'],['BTC-USD','Bitcoin','Bitcoin'],['CUSTOM','Benutzerdefiniert','']
];
const MARKET_IDENTITIES={
  'YM=F':{code:'30',className:'dow',title:'Dow Jones'},
  'NQ=F':{code:'100',className:'nasdaq',title:'Nasdaq 100'},
  'ES=F':{code:'500',className:'sp500',title:'S&P 500'},
  'RTY=F':{code:'2K',className:'russell',title:'Russell 2000'},
  'FDAX.EX':{code:'DAX',className:'dax',title:'DAX'},
  'GC=F':{code:'Au',className:'gold',title:'Gold'},
  'SI=F':{code:'Ag',className:'silver',title:'Silber'},
  'HG=F':{code:'Cu',className:'copper',title:'Kupfer'},
  'CL=F':{code:'WTI',className:'wti',title:'WTI Öl'},
  'BZ=F':{code:'B',className:'brent',title:'Brent Öl'},
  'DX=F':{code:'$',className:'dxy',title:'US Dollar Index'},
  'EURUSD=X':{code:'€',className:'eurusd',title:'EUR/USD'},
  'BTC-USD':{code:'₿',className:'bitcoin',title:'Bitcoin'},
  'CUSTOM':{code:'•',className:'custom',title:'Benutzerdefiniert'}
};
function directionLabel(direction){return direction==='Short'?'Short':'Long'}
function marketIdentity(trade){
  const key=String(trade?.symbol||'CUSTOM');
  return MARKET_IDENTITIES[key]||{
    code:String(trade?.market||'?').trim().slice(0,3).toUpperCase()||'•',
    className:'custom',
    title:String(trade?.market||'Benutzerdefiniert')
  };
}
function marketIconHtml(trade,size='normal'){
  const identity=marketIdentity(trade);
  return `<span class="marketIdentity ${size}" title="${escapeHtml(identity.title)}"><img src="market-icons/${escapeHtml(identity.className)}.png?v=5810-icons-centered-loginfix-1" alt="${escapeHtml(identity.title)}"></span>`;
}
const CHALLENGE_BOX_VALUE=20000;
const CHALLENGE_BOXES=50;
const CHALLENGE_TARGET=CHALLENGE_BOX_VALUE*CHALLENGE_BOXES;
const MARKET_REFRESH_MS=30000;
const MARKET_TIMEOUT_MS=9000;
const LIVE_FRESH_MS=120000;
const LIVE_STALE_MS=600000;
const LIVE_ERROR_THRESHOLD=3;
const tradeTemplate={brokerAccount:'Nicht zugeordnet',market:'Dow Jones Future',symbol:'YM=F',direction:'Long',positionStatus:'active',contracts:1,pointValue:1,entry:52900,target:54045,stop:52380,current:52988,previousPrice:null,lastPrice:null,liveUpdatedAt:null,dataSource:null,entryTriggerSide:null,entryTriggeredAt:null,brainState:'waiting',mentorState:null,originalPlan:null,deviations:[],zone:53500,why:'Laufende blaue Welle (v)\nEinstieg auf relevantem Fib-Niveau der Subwelle (ii)',rule:'Triff keine neue Entscheidung. Überprüfe zuerst deine ursprüngliche Entscheidung.',hkcm:'',tv:'',createdAt:null,updatedAt:null};
const defaultWealthSetup={
  strategy:{
    reserveMonths:6,
    alphaMax:30000,
    milestone:20000,
    cashoutPercent:90,
    betaRole:'primary',
    metalsTarget:10,
    metalsTolerance:2,
    allocation:'dynamic',
    betaToAlphaLocked:true,
    changedAt:null
  },
  accounts:[],
  tracking:{startDate:null,createdAt:null},
  goal:{target:1000000,milestone:20000,changedAt:null},
  ruleHistory:[]
};
const defaultState={
  plan:{...tradeTemplate},
  activeTrades:[],
  trades:[],
  challenge:[],
  settings:{autoYahoo:false,accountStart:0},
  wealthSetup:structuredClone(defaultWealthSetup),
  updatedAt:null
};
let state=structuredClone(defaultState), user=null, unsub=null, saving=false, saveQueued=false, savePromise=Promise.resolve(), saveTimer=null, cloudReady=false, selectedTradeId=null, lastLiveById={}, marketTimer=null, marketBusy=false, formDraft=null, formDirty=false, formMode='none', imageJobs={hkcm:null,tv:null};
let currentScreen='home', navigationHistory=[];
let monthlyReviewCache={month:null,statements:{},decisions:{},loading:false};
let latestWealthValues={};
let editingAccountId=null;
const $=id=>document.getElementById(id);
function fmt(n){const x=Number(n);return Number.isFinite(x)?x.toLocaleString('de-DE',{maximumFractionDigits:2}):'-'}
function num(v){return Number(String(v??'').replace(',','.'))}
function pts(n){return (n>=0?'+':'')+fmt(n)+'P'}
function dist(a,b){return Math.round(Math.abs(num(a)-num(b)))}
function euroShort(n){return Number(n||0).toLocaleString('de-DE',{maximumFractionDigits:0})+' €'}
function uid(){return 't_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function tradePnlEuro(t){if(t&&Number.isFinite(Number(t.pnl)))return Number(t.pnl);const r=Number(t?.result)||0;const c=Number(t?.contracts)||1;const pv=Number(t?.pointValue)||1;return r*c*pv}
function journalPnl(){return (state.trades||[]).reduce((sum,t)=>sum+tradePnlEuro(t),0)}
function accountStart(){return Number(state.settings?.accountStart)||0}
function accountBalance(){return accountStart()+journalPnl()}
function challengeSnapshot(){const balance=Math.max(0,accountBalance());const done=Math.min(CHALLENGE_BOXES,Math.floor(balance/CHALLENGE_BOX_VALUE));const pct=Math.min(100,Math.round(balance/CHALLENGE_TARGET*100));const open=Math.max(0,CHALLENGE_TARGET-balance);const next=Math.min(CHALLENGE_TARGET,(done+1)*CHALLENGE_BOX_VALUE);return{balance,done,pct,open,next,pnl:journalPnl()}}
function imageSignature(src){
  const value=String(src||'');
  if(!value)return'';
  return `${value.length}:${value.slice(0,48)}:${value.slice(-48)}`;
}
function planSnapshot(p){return{
  brokerAccount:p.brokerAccount||'Nicht zugeordnet',market:p.market,symbol:p.symbol,direction:p.direction,
  positionStatus:p.positionStatus,contracts:p.contracts,pointValue:p.pointValue,entry:p.entry,stop:p.stop,target:p.target,
  zone:p.zone,why:p.why,rule:p.rule,
  hkcmPresent:!!p.hkcm,hkcmSignature:imageSignature(p.hkcm),
  tvPresent:!!p.tv,tvSignature:imageSignature(p.tv),
  createdAt:p.createdAt||new Date().toISOString()
}}
function compactOriginalPlan(original,trade=null){
  if(!original)return trade?planSnapshot(trade):null;
  const clean={...original};
  const hkcmRaw=String(clean.hkcm||'');
  const tvRaw=String(clean.tv||'');
  clean.hkcmPresent=clean.hkcmPresent??!!hkcmRaw;
  clean.tvPresent=clean.tvPresent??!!tvRaw;
  clean.hkcmSignature=clean.hkcmSignature||imageSignature(hkcmRaw);
  clean.tvSignature=clean.tvSignature||imageSignature(tvRaw);
  delete clean.hkcm;
  delete clean.tv;
  return clean;
}
function compactDeviationHistory(deviations){
  return (Array.isArray(deviations)?deviations:[]).map(d=>({
    ...d,
    changes:(Array.isArray(d.changes)?d.changes:[]).map(c=>{
      if(c?.field!=='hkcm'&&c?.field!=='tv')return c;
      const before=String(c.before||'');
      const after=String(c.after||'');
      return {...c,before:before.startsWith('data:image')?'Vorhanden':before,after:after.startsWith('data:image')?'Geändert / vorhanden':after};
    })
  }));
}
function prepareStateForCloud(sourceState){
  const payload=structuredClone(sourceState);
  // state.plan is a legacy mirror of activeTrades[0] and must not duplicate screenshots.
  delete payload.plan;
  payload.activeTrades=(payload.activeTrades||[]).map(t=>({
    ...t,
    originalPlan:compactOriginalPlan(t.originalPlan,t),
    deviations:compactDeviationHistory(t.deviations)
  }));
  payload.trades=(payload.trades||[]).map(t=>({
    ...t,
    originalPlan:compactOriginalPlan(t.originalPlan,null),
    deviations:compactDeviationHistory(t.deviations)
  }));
  return payload;
}
function cloudPayloadSize(payload){
  try{return new Blob([JSON.stringify(payload)]).size}catch{return JSON.stringify(payload).length}
}
function normalizedComparable(v){
  if(v===null||v===undefined)return'';
  if(typeof v==='number')return Number(v);
  const asNum=num(v);
  return String(v).trim()!==''&&Number.isFinite(asNum)&&!isNaN(asNum)?asNum:String(v).trim();
}
function detectPlanChanges(original,current){
  if(!original)return[];
  const fields=[
    ['brokerAccount','Brokerkonto'],['market','Markt'],['symbol','Symbol'],['direction','Richtung'],
    ['positionStatus','Status'],['contracts','Kontrakte'],['pointValue','Punktwert'],
    ['entry','Einstieg'],['stop','Stop-Loss'],['target','Take-Profit'],
    ['zone','Prüfzone'],['why','Begründung'],['rule','Mentor-Regel'],
    ['hkcm','HKCM-Screenshot'],['tv','TradingView-Screenshot']
  ];
  return fields.flatMap(([key,label])=>{
    if(key==='hkcm'||key==='tv'){
      const beforeRaw=String(original[key]||''); // legacy snapshots
      const beforePresent=original[key+'Present']??!!beforeRaw;
      const beforeSignature=String(original[key+'Signature']||imageSignature(beforeRaw));
      const afterRaw=String(current[key]||'');
      const afterPresent=!!afterRaw;
      const afterSignature=imageSignature(afterRaw);
      if(beforePresent===afterPresent&&beforeSignature===afterSignature)return[];
      return[{field:key,label,before:beforePresent?'Vorhanden':'Nicht vorhanden',after:afterPresent?'Geändert / vorhanden':'Entfernt'}];
    }
    const before=normalizedComparable(original[key]);
    const after=normalizedComparable(current[key]);
    if(before===after)return[];
    return[{field:key,label,before,after}];
  });
}
function formatDeviationValue(change,value){
  if(['entry','stop','target','zone','contracts','pointValue'].includes(change.field))return fmt(value);
  if(['hkcm','tv'].includes(change.field))return String(value||'Nicht vorhanden');
  return String(value||'–');
}
function pendingDeviationChanges(){
  const editing=currentTrade();
  if(!editing||!editing.originalPlan)return[];
  const draft={
    ...editing,
    brokerAccount:$('fBrokerAccount')?.value.trim()||'Nicht zugeordnet',
    market:$('fMarket').value.trim(),
    symbol:$('fSymbol').value.trim(),
    direction:$('fDirection').value,
    positionStatus:$('fPositionStatus').value,
    contracts:num($('fContracts').value)||1,
    pointValue:num($('fPointValue').value)||1,
    entry:num($('fEntry').value),
    stop:num($('fStop').value),
    target:num($('fTarget').value),
    zone:num($('fZone').value),
    why:$('fWhy').value,
    rule:$('fRule').value,
    hkcm:formDraft?.hkcm??editing.hkcm,
    tv:formDraft?.tv??editing.tv
  };
  return detectPlanChanges(editing.originalPlan,draft);
}
function renderDeviationPanel(){
  const panel=$('deviationPanel');
  if(!panel)return;
  const changes=pendingDeviationChanges();
  const editing=!!currentTrade();
  panel.classList.toggle('hidden',!editing||changes.length===0);
  if(changes.length){
    $('deviationSummary').innerHTML=`Atlas hat <b>${changes.length}</b> Abweichung${changes.length===1?'':'en'} erkannt:<div class="deviationChanges">${changes.map(c=>`<div class="deviationChange"><b>${c.label}</b><br>${formatDeviationValue(c,c.before)} → ${formatDeviationValue(c,c.after)}</div>`).join('')}</div>`;
  }else{
    $('deviationSummary').textContent='Keine Abweichung erkannt.';
  }
  return changes;
}
function recordDeviation(p,changes,reason,note){
  if(!Array.isArray(p.deviations))p.deviations=[];
  p.deviations.unshift({
    id:'d_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),
    createdAt:new Date().toISOString(),
    reason,
    note:note||'',
    changes
  });
}
function renderDeviationInfo(p){
  const card=$('planDeviationCard');
  if(!card)return;
  const arr=Array.isArray(p.deviations)?p.deviations:[];
  card.classList.toggle('hidden',arr.length===0);
  if(!arr.length)return;
  $('deviationCount').textContent=`${arr.length} dokumentiert`;
  const latest=arr[0];
  const labels=(latest.changes||[]).map(c=>c.label).join(', ');
  $('deviationLatest').textContent=`Letzte Änderung: ${labels||'Plan geändert'} · Grund: ${latest.reason}${latest.note?' · '+latest.note:''}`;
}

function setDataPill(text,kind=''){const el=$('dataPill');if(!el)return;el.textContent=text;el.className='statusPill'+(kind?' data-'+kind:'')}
function withTimeout(url,ms=MARKET_TIMEOUT_MS){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);return fetch(url,{signal:controller.signal,cache:'no-store'}).finally(()=>clearTimeout(timer))}
function yahooUrls(symbol){const endpoint=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=true`;const endpoint2=endpoint.replace('query1.','query2.');return[
{name:'Yahoo direkt',url:endpoint},
{name:'Yahoo direkt 2',url:endpoint2},
{name:'CORS Proxy',url:`https://corsproxy.io/?url=${encodeURIComponent(endpoint)}`},
{name:'AllOrigins',url:`https://api.allorigins.win/raw?url=${encodeURIComponent(endpoint)}`},
{name:'Isomorphic Proxy',url:`https://cors.isomorphic-git.org/${endpoint}`}
]}
function parseYahoo(data){const result=data?.chart?.result?.[0];if(!result)throw new Error(data?.chart?.error?.description||'Keine Yahoo-Daten');const meta=result.meta||{};let price=Number(meta.regularMarketPrice);if(!Number.isFinite(price)){const closes=result.indicators?.quote?.[0]?.close||[];price=Number([...closes].reverse().find(Number.isFinite))}if(!Number.isFinite(price))throw new Error('Kein gültiger Kurs');const prev=Number(meta.chartPreviousClose??meta.previousClose??price);return{price,prev,change:prev?((price-prev)/prev*100):0}}
function entryReached(p,price,previous){const entry=num(p.entry);if(!Number.isFinite(entry))return false;if(!p.entryTriggerSide){p.entryTriggerSide=price>entry?'down':'up'}if(p.entryTriggerSide==='down')return price<=entry||(Number.isFinite(previous)&&previous>entry&&price<=entry);return price>=entry||(Number.isFinite(previous)&&previous<entry&&price>=entry)}
function archiveAutomaticTrade(p,mode){const exit=mode==='target'?num(p.target):num(p.stop);const dir=p.direction==='Long'?1:-1;const points=(exit-num(p.entry))*dir;const contracts=num(p.contracts)||1;const pointValue=num(p.pointValue)||1;const pnl=Math.round(points*contracts*pointValue);state.trades.unshift({date:new Date().toLocaleDateString('de-DE'),createdAt:new Date().toISOString(),brokerAccount:p.brokerAccount||'Nicht zugeordnet',market:p.market,direction:p.direction,result:Math.round(points),pnl,contracts,pointValue,entry:p.entry,target:p.target,stop:p.stop,exit,closeType:mode==='target'?'Take-Profit':'Stop-Loss',planDeviation:false,note:'Automatisch durch Live-Kurs erkannt',symbol:p.symbol,sourceTradeId:p.id,brainState:mode==='target'?'target_hit':'stop_hit',originalPlan:p.originalPlan||planSnapshot(p),deviations:Array.isArray(p.deviations)?p.deviations:[]});removeActiveTrade(p.id)}
function optionalNumber(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const parsed=num(value);
  return Number.isFinite(parsed)?parsed:null;
}
function priceInsidePlanRange(p,price){
  if(!Number.isFinite(price))return false;
  const target=optionalNumber(p.target);
  const stop=optionalNumber(p.stop);
  if(!Number.isFinite(target)||!Number.isFinite(stop))return false;
  const low=Math.min(stop,target);
  const high=Math.max(stop,target);
  return price>low&&price<high;
}
function crossedExitLevel(p,previous,current,source){
  if(!Number.isFinite(previous)||!Number.isFinite(current))return null;
  if((p.positionStatus||'active')!=='active')return null;
  if(!p.autoExitArmed)return null;
  // A provider switch can briefly mix quotes with different freshness/basis.
  // Never auto-close across two different data providers.
  if(p.previousDataSource&&source&&p.previousDataSource!==source)return null;

  const target=optionalNumber(p.target);
  const stop=optionalNumber(p.stop);
  const isLong=p.direction==='Long';

  if(Number.isFinite(target)){
    const targetCrossed=isLong
      ? previous<target&&current>=target
      : previous>target&&current<=target;
    if(targetCrossed)return'target';
  }
  if(Number.isFinite(stop)){
    const stopCrossed=isLong
      ? previous>stop&&current<=stop
      : previous<stop&&current>=stop;
    if(stopCrossed)return'stop';
  }
  return null;
}
function applyLivePrice(p,quote,source){
  // A blank current price must not be treated as 0. The first quote only
  // establishes the live baseline and must never auto-close a new trade.
  const previous=optionalNumber(p.current);
  const previousSource=p.dataSource||null;
  p.previousPrice=previous;
  p.previousDataSource=previousSource;
  p.lastPrice=quote.price;
  p.current=quote.price;
  p.liveUpdatedAt=new Date().toISOString();
  p.dataSource=source;
  p.liveChange=quote.change;
  lastLiveById[p.id]={price:quote.price,change:quote.change,source,at:p.liveUpdatedAt};

  if(!p.originalPlan)p.originalPlan=planSnapshot(p);

  if((p.positionStatus||'active')!=='active'&&entryReached(p,quote.price,previous)){
    p.positionStatus='active';
    p.entryTriggeredAt=new Date().toISOString();
  }

  // Auto-exit is armed only after Atlas has actually seen a valid live quote
  // inside the trade's stop/target corridor. This prevents a newly created
  // trade from disappearing because Yahoo and the broker use different price
  // bases or because proxy providers return quotes with different freshness.
  if(priceInsidePlanRange(p,quote.price))p.autoExitArmed=true;

  const automaticClose=crossedExitLevel(p,previous,quote.price,source);
  if(automaticClose){
    archiveAutomaticTrade(p,automaticClose);
    return'closed';
  }

  const nextState=tradeState(p,quote.price);
  p.brainState=nextState.key;
  mentorFor(p,nextState);
  p.updatedAt=new Date().toISOString();
  return'updated';
}
function tradeState(p,current){const dir=p.direction==='Long'?1:-1;const entry=num(p.entry),stop=num(p.stop),target=num(p.target);const risk=Math.max(Math.abs(entry-stop),0.000001);const reward=Math.max(Math.abs(target-entry),0.000001);const active=(p.positionStatus||'active')==='active';if(!active){const d=Math.abs(current-entry);return d<=risk*.10?{key:'entry_approaching',phase:'Einstieg naht',priority:2,headline:'Einstieg nähert sich',text:`Noch ${fmt(d)} Punkte bis zum Einstieg. Warte auf die Ausführung.`}:{key:'waiting',phase:'Warten auf Einstieg',priority:1,headline:'Keine Handlung erforderlich',text:`Noch ${fmt(d)} Punkte bis zum geplanten Einstieg.`}}const close=brokerCloseStatus(p,current);if(close.mode==='stop')return{key:'stop_hit',phase:'Stop-Loss erreicht',priority:5,headline:'Stop-Loss erreicht',text:'Der Trade wird automatisch zum Stopkurs ins Journal übernommen.'};if(close.mode==='target')return{key:'target_hit',phase:'Take-Profit erreicht',priority:5,headline:'Take-Profit erreicht',text:'Der Trade wird automatisch zum Zielkurs ins Journal übernommen.'};const pnl=(current-entry)*dir;const stopDistance=Math.abs(current-stop);const targetDistance=Math.abs(target-current);if(stopDistance<=risk*.18)return{key:'stop_approaching',phase:'Stopnähe',priority:4,headline:'Stop-Loss nähert sich',text:'Nicht verschieben. Die vorher definierte Invalidierung zählt.'};if(targetDistance<=reward*.12)return{key:'target_approaching',phase:'Take-Profit Nähe',priority:3,headline:'Take-Profit nähert sich',text:'Lass die Order arbeiten. Keine vorzeitige Entscheidung.'};if(Math.abs(pnl)<=risk*.05)return{key:'breakeven',phase:'Nahe Einstieg',priority:2,headline:'Ruhe bewahren',text:'Der Markt befindet sich nahe am Einstieg. Keine neue Entscheidung nötig.'};if(pnl<0)return{key:'risk',phase:'Im Risiko',priority:2,headline:'Plan bleibt gültig',text:`Der Stop-Loss ist ${fmt(stopDistance)} Punkte entfernt. Nicht aus Angst handeln.`};return{key:'profit',phase:'Im Gewinn',priority:1,headline:'Keine Handlung erforderlich',text:`Noch ${fmt(targetDistance)} Punkte bis zum Take-Profit.`}}

const MENTOR_LIBRARY={
  waiting:[
    {key:'wait_plan',headline:'Keine Handlung erforderlich',text:'Der Markt hat deinen Einstieg noch nicht erreicht.',action:'Warte auf deinen geplanten Preis.',tone:'calm'},
    {key:'wait_no_chase',headline:'Geduld ist Teil des Plans',text:'Ein nicht ausgelöster Trade ist kein verpasster Trade.',action:'Nicht hinterherlaufen.',tone:'calm'},
    {key:'wait_order',headline:'Order arbeiten lassen',text:'Du hast Einstieg, Stop-Loss und Take-Profit vorab definiert.',action:'Keine spontane Anpassung.',tone:'calm'}
  ],
  entry_approaching:[
    {key:'entry_close',headline:'Einstieg nähert sich',text:'Der Markt kommt in deinen geplanten Bereich.',action:'Warte auf die tatsächliche Ausführung.',tone:'watch'},
    {key:'entry_patience',headline:'Jetzt zählt Geduld',text:'Die Nähe zum Einstieg ist noch kein Einstieg.',action:'Nicht vorwegnehmen.',tone:'watch'}
  ],
  breakeven:[
    {key:'be_quiet',headline:'Ruhe bewahren',text:'Der Markt bewegt sich nahe am Einstieg.',action:'Keine neue Entscheidung nötig.',tone:'calm'},
    {key:'be_plan',headline:'Plan bleibt unverändert',text:'Kleine Bewegungen um den Einstieg gehören zum Trade.',action:'Stop und Ziel nicht verändern.',tone:'calm'}
  ],
  risk:[
    {key:'risk_defined',headline:'Das Risiko ist definiert',text:'Der Stop-Loss begrenzt den Verlust bereits.',action:'Nicht aus Angst handeln.',tone:'calm'},
    {key:'risk_hold',headline:'Plan bleibt gültig',text:'Ein Trade darf gegen dich laufen, ohne falsch zu sein.',action:'Nur die Invalidierung zählt.',tone:'calm'},
    {key:'risk_no_move',headline:'Keine Reaktion auf Unbehagen',text:'Unbehagen ist kein objektives Ausstiegssignal.',action:'Stop-Loss nicht verschieben.',tone:'watch'}
  ],
  profit:[
    {key:'profit_hold',headline:'Keine Handlung erforderlich',text:'Der Trade bewegt sich in Richtung Take-Profit.',action:'Lass den Plan arbeiten.',tone:'calm'},
    {key:'profit_no_fear',headline:'Gewinne brauchen Raum',text:'Ein offener Gewinn ist kein Grund für einen frühen Ausstieg.',action:'Nicht aus Verlustangst schließen.',tone:'calm'},
    {key:'profit_target',headline:'Ziel bleibt das Ziel',text:'Der ursprüngliche Take-Profit ist weiterhin gültig.',action:'Keine Euphorie-Entscheidung.',tone:'calm'}
  ],
  stop_approaching:[
    {key:'stop_near',headline:'Stop-Loss nähert sich',text:'Die kritische Zone ist erreicht.',action:'Nicht verschieben. Invalidierung akzeptieren.',tone:'critical'},
    {key:'stop_control',headline:'Jetzt nur den Plan prüfen',text:'Angst darf den vorab definierten Stop nicht verändern.',action:'Keine Rettungsaktion starten.',tone:'critical'}
  ],
  target_approaching:[
    {key:'target_near',headline:'Take-Profit nähert sich',text:'Kurz vor dem Ziel entstehen häufig unnötige Eingriffe.',action:'Lass die Limit-Order arbeiten.',tone:'watch'},
    {key:'target_discipline',headline:'Disziplin bis zum Ende',text:'Der Trade ist noch nicht abgeschlossen.',action:'Nicht vorzeitig schließen.',tone:'watch'}
  ],
  stop_hit:[
    {key:'stop_done',headline:'Stop-Loss erreicht',text:'Der Verlust wurde gemäß Plan begrenzt.',action:'Akzeptieren und ins Journal übernehmen.',tone:'critical'}
  ],
  target_hit:[
    {key:'target_done',headline:'Take-Profit erreicht',text:'Der Gewinn wurde gemäß Plan realisiert.',action:'Abschluss dokumentieren. Keine neue Entscheidung.',tone:'calm'}
  ]
};

function mentorBucket(p,key){
  const seed=String(p.id||p.symbol||'atlas')+':'+key;
  let hash=0;
  for(let i=0;i<seed.length;i++) hash=((hash<<5)-hash)+seed.charCodeAt(i)|0;
  // Switch at most every 10 minutes, so the mentor does not feel restless.
  const timeBucket=Math.floor(Date.now()/600000);
  return Math.abs(hash+timeBucket);
}

function mentorFor(p,tradeStateResult){
  const key=tradeStateResult.key;
  const list=MENTOR_LIBRARY[key]||MENTOR_LIBRARY.waiting;
  const existing=p.mentorState||{};
  const phaseChanged=existing.phaseKey!==key;
  let messageKey=existing.messageKey;

  if(phaseChanged || !list.some(x=>x.key===messageKey)){
    messageKey=list[mentorBucket(p,key)%list.length].key;
  }

  const message=list.find(x=>x.key===messageKey)||list[0];
  const now=new Date().toISOString();

  p.mentorState={
    phaseKey:key,
    messageKey:message.key,
    phaseEnteredAt:phaseChanged?now:(existing.phaseEnteredAt||now),
    lastUpdatedAt:now
  };

  return {
    ...message,
    phase:tradeStateResult.phase,
    priority:tradeStateResult.priority,
    technicalText:tradeStateResult.text
  };
}

function normalizeState(data={}){
  const hasActiveTradesField=Object.prototype.hasOwnProperty.call(data,'activeTrades');
  let s={...structuredClone(defaultState),...data,settings:{...defaultState.settings,...(data.settings||{})}};
  const incomingSetup=data.wealthSetup||{};
  s.wealthSetup={
    ...structuredClone(defaultWealthSetup),
    ...incomingSetup,
    strategy:{...defaultWealthSetup.strategy,...(incomingSetup.strategy||{})},
    goal:{...defaultWealthSetup.goal,...(incomingSetup.goal||{})},
    accounts:Array.isArray(incomingSetup.accounts)?incomingSetup.accounts:[],
    ruleHistory:Array.isArray(incomingSetup.ruleHistory)?incomingSetup.ruleHistory:[]
  };
  if(!Array.isArray(s.activeTrades))s.activeTrades=[];
  if(!Array.isArray(s.trades))s.trades=[];
  if(!Array.isArray(s.challenge))s.challenge=[];

  // Nur echte Altbestände ohne activeTrades-Feld migrieren.
  // Ein absichtlich leerer Trading Desk darf niemals aus data.plan wiederbelebt werden.
  if(!hasActiveTradesField&&data.plan&&data.plan.createdAt){
    const migrated={...tradeTemplate,...data.plan,id:data.plan.id||uid(),createdAt:data.plan.createdAt||new Date().toISOString(),updatedAt:data.plan.updatedAt||new Date().toISOString()};
    migrated.originalPlan=compactOriginalPlan(migrated.originalPlan,migrated);
    s.activeTrades=[migrated];
  }

  if(s.activeTrades.length>0){
    s.activeTrades=s.activeTrades.map(t=>{
      const n={...tradeTemplate,...t,id:t.id||uid()};
      n.originalPlan=compactOriginalPlan(n.originalPlan,n);
      n.deviations=compactDeviationHistory(n.deviations);
      return n;
    });
    s.plan=s.activeTrades[0];
  }else{
    s.plan={...tradeTemplate};
  }
  return s;
}
function currentTrade(){return (state.activeTrades||[]).find(t=>t.id===selectedTradeId)||null}
function isCreateScreenActive(){return $('create')?.classList.contains('active')}
function collectFormDraft(){
  const active=formMode==='edit'?currentTrade():null;
  const base=formDraft||active||(formMode==='new'?emptyTradeDraft():{});
  return{
    ...base,
    id:base.id||uid(),
    brokerAccount:$('fBrokerAccount')?.value.trim()||'Nicht zugeordnet',
    market:$('fMarket').value,
    symbol:$('fSymbol').value,
    direction:$('fDirection').value,
    positionStatus:$('fPositionStatus').value,
    contracts:$('fContracts').value,
    pointValue:$('fPointValue').value,
    entry:$('fEntry').value,
    stop:$('fStop').value,
    target:$('fTarget').value,
    zone:$('fZone').value,
    why:$('fWhy').value,
    rule:$('fRule').value,
    hkcm:base.hkcm||'',
    tv:base.tv||''
  };
}
function markFormDirty(){
  if(!isCreateScreenActive())return;
  formDirty=true;
  formDraft=collectFormDraft();
  if($('saveMsg'))$('saveMsg').textContent='Ungespeicherter Entwurf – Cloud-Updates überschreiben diese Eingaben nicht.';
}
function clearFormDraft(){
  formDraft=null;
  formDirty=false;
  formMode='none';
  imageJobs={hkcm:null,tv:null};
  clearFileInputs();
}
function safeRenderAll(){
  renderDesk();
  if(!(isCreateScreenActive()&&formDirty))loadForm();
  renderPlan();
  renderTrades();
  renderChallenge();
}

function upsertTrade(trade){const arr=state.activeTrades||[];const i=arr.findIndex(t=>t.id===trade.id);if(i>=0)arr[i]=trade;else arr.unshift(trade);state.activeTrades=arr;state.plan={...tradeTemplate,id:trade.id,market:trade.market,symbol:trade.symbol};selectedTradeId=trade.id}
function removeActiveTrade(id){state.activeTrades=(state.activeTrades||[]).filter(t=>t.id!==id);if(selectedTradeId===id)selectedTradeId=null;const first=state.activeTrades[0];state.plan=first?{...tradeTemplate,id:first.id,market:first.market,symbol:first.symbol}:{...tradeTemplate};}
function mainSectionFor(id){return ['plan','create','journal','challenge'].includes(id)?'alpha':id}
function accountEffectiveValue(account){
  const live=latestWealthValues?.[account.id];
  const openingDate=String(account.openingDate||'');
  if(live&&live.value!=null&&(!openingDate||String(live.date||'')>=openingDate))return Number(live.value)||0;
  return Number(account.openingBalance)||0;
}
function accountEffectiveMeta(account){
  const live=latestWealthValues?.[account.id];
  const openingDate=String(account.openingDate||'');
  if(live&&live.value!=null&&(!openingDate||String(live.date||'')>=openingDate))return{value:Number(live.value)||0,date:live.date||'',source:'PDF'};
  return{value:Number(account.openingBalance)||0,date:openingDate,source:'Startwert'};
}

function wealthTrackingStartDate(){
  const ws=wealthSetup();
  const explicit=String(ws.tracking?.startDate||'');
  if(explicit)return explicit;
  const dates=(ws.accounts||[]).filter(a=>a.status!=='archived'&&a.role!=='ALPHA'&&a.openingDate).map(a=>String(a.openingDate)).sort();
  return dates[0]||'';
}
function accountValueAtTrackingStart(account,startDate){
  const openingDate=String(account.openingDate||'');
  if(!startDate)return Number(account.openingBalance)||0;
  // Opening balances are baselines. They count at the global start only if their stated date is not after it.
  if(openingDate&&openingDate<=startDate)return Number(account.openingBalance)||0;
  return 0;
}
function wealthBaselineSnapshot(){
  const accounts=(state.wealthSetup?.accounts||[]).filter(a=>a.status!=='archived');
  const startDate=wealthTrackingStartDate();
  const alpha=accountBalance();
  const nonAlpha=accounts.filter(a=>a.role!=='ALPHA').reduce((sum,a)=>sum+accountValueAtTrackingStart(a,startDate),0);
  return{date:startDate,value:alpha+nonAlpha,alpha,nonAlpha};
}
function wealthCurrentSnapshot(){
  const accounts=(state.wealthSetup?.accounts||[]).filter(a=>a.status!=='archived');
  const alpha=accountBalance();
  const nonAlpha=accounts.filter(a=>a.role!=='ALPHA').reduce((sum,a)=>sum+accountEffectiveValue(a),0);
  return{value:alpha+nonAlpha,alpha,nonAlpha};
}

function refreshWealthShell(){
  const alpha=accountBalance(), pnl=journalPnl(), snap=challengeSnapshot();
  const accounts=(state.wealthSetup?.accounts||[]).filter(a=>a.status!=='archived');
  const roleTotal=role=>accounts.filter(a=>a.role===role).reduce((sum,a)=>sum+accountEffectiveValue(a),0);
  const beta=roleTotal('BETA'), reserve=roleTotal('RESERVE'), cash=roleTotal('CASH'), assets=roleTotal('ASSET');
  const hasWealthSetup=accounts.length>0;
  // ALPHA is sourced from the native ATLAS trading state, never double-counted from an account opening value.
  const netWorth=alpha+beta+reserve+cash+assets;
  if($('homeAlpha'))$('homeAlpha').textContent=euroShort(alpha);
  if($('homeBeta'))$('homeBeta').textContent=hasWealthSetup?euroShort(beta):'–';
  if($('homeReserve'))$('homeReserve').textContent=hasWealthSetup?euroShort(reserve):'–';
  if($('homeCashAssets'))$('homeCashAssets').textContent=hasWealthSetup?euroShort(cash+assets):'–';
  if($('wealthAlpha'))$('wealthAlpha').textContent=euroShort(alpha);
  if($('wealthBeta'))$('wealthBeta').textContent=hasWealthSetup?euroShort(beta):'–';
  if($('wealthReserve'))$('wealthReserve').textContent=hasWealthSetup?euroShort(reserve):'–';
  if($('wealthAssets'))$('wealthAssets').textContent=hasWealthSetup?euroShort(assets):'–';
  if($('wealthCash'))$('wealthCash').textContent=hasWealthSetup?euroShort(cash):'–';
  if(hasWealthSetup){
    if($('homeNetWorth'))$('homeNetWorth').textContent=euroShort(netWorth);
    if($('wealthNetWorth'))$('wealthNetWorth').textContent=euroShort(netWorth);
    if($('homeNetWorthChange')){
      const base=wealthBaselineSnapshot(), cur=wealthCurrentSnapshot();
      if(base.date&&base.value!==0){
        const diff=cur.value-base.value, pct=(diff/base.value)*100;
        $('homeNetWorthChange').textContent=`${diff>=0?'+':''}${pct.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})} % seit Start · ${base.date}`;
      }else $('homeNetWorthChange').textContent='Startstichtag im Financial Setup festlegen.';
    }
    if($('homeSignalTitle'))$('homeSignalTitle').textContent='Monatsreview bereit.';
    if($('homeSignalText'))$('homeSignalText').textContent='ATLAS nutzt je Konto automatisch den jüngsten bestätigten Wert.';
    if($('homeSignalAction')){ $('homeSignalAction').textContent='Coach öffnen'; $('homeSignalAction').dataset.mainTarget='coach'; }
  }else{
    if($('homeNetWorth'))$('homeNetWorth').textContent=euroShort(alpha);
    if($('wealthNetWorth'))$('wealthNetWorth').textContent=euroShort(alpha);
    if($('homeSignalTitle'))$('homeSignalTitle').textContent='Financial Setup einrichten.';
    if($('homeSignalText'))$('homeSignalText').textContent='Lege Regeln, Konten und dein Vermögensziel zentral fest.';
    if($('homeSignalAction')){ $('homeSignalAction').textContent='Setup öffnen'; $('homeSignalAction').dataset.mainTarget='setup'; }
  }
  if($('alphaCapital'))$('alphaCapital').textContent=euroShort(alpha);
  if($('alphaLifetime'))$('alphaLifetime').textContent=euroShort(pnl);
  if($('alphaChallenge'))$('alphaChallenge').textContent=snap.done+' / '+CHALLENGE_BOXES;
}
async function loadLatestWealthValues(){
  if(!user)return;
  try{
    const snap=await atlasFirebase.db.collection('users').doc(user.uid).collection('atlas').where('month','>=','0000-00').get();
    const docs=[]; snap.forEach(d=>{const x=d.data();if(x&&x.month&&x.statements)docs.push(x)});
    docs.sort((a,b)=>String(b.month).localeCompare(String(a.month)));
    const next={};
    for(const doc of docs){
      for(const account of (state.wealthSetup?.accounts||[])){
        if(account.role==='ALPHA'||next[account.id]||!doc.statements?.[account.id])continue;
        const analysis=analyzeStatement(doc.statements[account.id],account);
        if(analysis?.closing!=null){
          const st=doc.statements[account.id];
          const date=(String(st.text||'').match(/(?:Stichtag|Stand(?:\s+per)?|Kontoauszug\s+vom)\s*(?:am|zum)?\s*(\d{1,2}[.\s][A-Za-zäöüÄÖÜ]+\s+\d{4}|\d{2}\.\d{2}\.\d{4})/i)||[])[1]||doc.month+'-28';
          next[account.id]={value:analysis.closing,date:normalizeWealthDate(date,doc.month),source:'PDF',month:doc.month,fileName:st.fileName||''};
        }
      }
    }
    latestWealthValues=next; refreshWealthShell(); renderAccountList();
  }catch(e){console.error('Latest wealth values load failed',e);refreshWealthShell();}
}
function normalizeWealthDate(raw,fallbackMonth){
  const x=String(raw||'').trim();
  const m=x.match(/(\d{2})\.(\d{2})\.(\d{4})/);if(m)return`${m[3]}-${m[2]}-${m[1]}`;
  const months={januar:'01',februar:'02',märz:'03',april:'04',mai:'05',juni:'06',juli:'07',august:'08',september:'09',oktober:'10',november:'11',dezember:'12'};
  const w=x.toLowerCase().match(/(\d{1,2})[.\s]+([a-zäöü]+)\s+(\d{4})/);if(w&&months[w[2]])return`${w[3]}-${months[w[2]]}-${String(w[1]).padStart(2,'0')}`;
  return String(fallbackMonth||'')+'-28';
}
function makeNav(){
  const html=tabs.map((t,i)=>`<button data-tab="${t[0]}" class="${i?'':'active'}">${t[1]}</button>`).join('');
  $('nav').innerHTML=html;$('bottom').innerHTML=html;
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.tab)));
  document.querySelectorAll('[data-alpha-target]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.alphaTarget)));
  document.querySelectorAll('[data-main-target]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.mainTarget)));
  document.querySelectorAll('[data-atlas-back]').forEach(b=>b.addEventListener('click',goBack));
  if($('reviewMonth'))$('reviewMonth').addEventListener('change',()=>{monthlyReviewCache={month:null,statements:{},decisions:{},loading:false};renderMonthlyReview();});
}
function show(id,options={}){
  const next=$(id)?id:'home';
  const track=options.track!==false;
  if(track&&next!==currentScreen){
    navigationHistory.push(currentScreen);
    if(navigationHistory.length>30)navigationHistory.shift();
  }
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const target=$(next)||$('home'); target.classList.add('active');
  currentScreen=next;
  const main=mainSectionFor(next);
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===main));
  if(next==='create'){if(!formDraft){formMode='new';formDraft=emptyTradeDraft();formDirty=false;clearFileInputs()}loadForm(formDraft);}
  if(next==='setup')renderFinancialSetup();
  if(next==='coach')renderMonthlyReview();
  refreshWealthShell();
  scrollTo(0,0);
}
function goBack(){
  let previous=navigationHistory.pop();
  while(previous===currentScreen&&navigationHistory.length)previous=navigationHistory.pop();
  show(previous||'home',{track:false});
}
function wealthSetup(){return state.wealthSetup||structuredClone(defaultWealthSetup)}
function setupNumber(id,fallback=0){const el=$(id);const v=Number(el?.value);return Number.isFinite(v)?v:fallback}
function strategySummaryChanged(before,after){return JSON.stringify(before)!==JSON.stringify(after)}
function renderFinancialSetup(){
  if(!$('ruleReserveMonths'))return;
  const ws=wealthSetup(), r=ws.strategy||defaultWealthSetup.strategy, g=ws.goal||defaultWealthSetup.goal;
  $('ruleReserveMonths').value=r.reserveMonths??6;
  $('ruleAlphaMax').value=r.alphaMax??30000;
  $('ruleMilestone').value=r.milestone??20000;
  $('ruleCashout').value=r.cashoutPercent??90;
  $('ruleMetalsTarget').value=r.metalsTarget??10;
  $('ruleMetalsTolerance').value=r.metalsTolerance??2;
  $('goalTarget').value=g.target??1000000;
  $('goalMilestone').value=g.milestone??20000;
  renderAccountList();
  const tracking=ws.tracking||{};
  if($('wealthTrackingStart'))$('wealthTrackingStart').value=tracking.startDate||wealthTrackingStartDate()||new Date().toISOString().slice(0,10);
  renderWealthBaselineSummary();
  updateGoalMilestones();
}

function renderWealthBaselineSummary(){
  if(!$('wealthBaselineSummary'))return;
  const base=wealthBaselineSnapshot(), cur=wealthCurrentSnapshot();
  const diff=cur.value-base.value;
  const pct=base.value?diff/base.value*100:null;
  $('wealthBaselineSummary').innerHTML=`<div><span>Startvermögen</span><b>${euroExact(base.value)}</b><small>${base.date?`Stichtag ${escapeHtml(base.date)}`:'Noch kein Startstichtag'}</small></div><div><span>Aktuell</span><b>${euroExact(cur.value)}</b><small>Jüngster bestätigter Wert je Konto</small></div><div><span>Veränderung</span><b>${pct==null?'–':`${diff>=0?'+':''}${pct.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})} %`}</b><small>${pct==null?'Baseline fehlt':`${diff>=0?'+':''}${euroExact(diff)}`}</small></div>`;
}
function saveWealthTracking(){
  const ws=wealthSetup();
  const date=$('wealthTrackingStart')?.value||'';
  if(!date){if($('wealthTrackingMsg'))$('wealthTrackingMsg').textContent='Bitte einen Startstichtag wählen.';return;}
  ws.tracking={...(ws.tracking||{}),startDate:date,createdAt:ws.tracking?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.wealthSetup=ws;
  if($('wealthTrackingMsg'))$('wealthTrackingMsg').textContent='Startstichtag gespeichert.';
  renderWealthBaselineSummary();refreshWealthShell();scheduleSave();
}

function saveStrategy(){
  const ws=wealthSetup(), before={...(ws.strategy||defaultWealthSetup.strategy)};
  const after={
    ...before,
    reserveMonths:Math.max(1,setupNumber('ruleReserveMonths',6)),
    alphaMax:Math.max(0,setupNumber('ruleAlphaMax',30000)),
    milestone:Math.max(1000,setupNumber('ruleMilestone',20000)),
    cashoutPercent:Math.min(100,Math.max(0,setupNumber('ruleCashout',90))),
    betaRole:'primary',
    metalsTarget:Math.min(100,Math.max(0,setupNumber('ruleMetalsTarget',10))),
    metalsTolerance:Math.min(20,Math.max(0,setupNumber('ruleMetalsTolerance',2))),
    allocation:'dynamic',
    betaToAlphaLocked:true,
    changedAt:new Date().toISOString()
  };
  if(strategySummaryChanged(before,after)){
    ws.ruleHistory=[...(ws.ruleHistory||[]),{type:'strategy',validFrom:after.changedAt,previous:before,value:after}].slice(-100);
  }
  ws.strategy=after; state.wealthSetup=ws;
  $('strategyMsg').textContent='Strategie gespeichert.';
  $('strategySavedPill').textContent='Gespeichert';
  scheduleSave();
}
function accountRoleLabel(role){return({CASH:'Cash',RESERVE:'Reserve',ALPHA:'Alpha',BETA:'Beta',ASSET:'Asset'})[role]||role}
function renderAccountList(){
  if(!$('accountList'))return;
  const list=[...(wealthSetup().accounts||[])];
  if(!list.length){$('accountList').innerHTML='<div class="setupEmpty">Noch keine Konten eingerichtet.</div>';return;}
  const active=list.filter(a=>a.status!=='archived'), archived=list.filter(a=>a.status==='archived');
  const row=a=>{const freq=a.updateFrequency||'monthly';const freqLabel={monthly:'Monatlich',annual:'Jährlich',manual:'Manuell'}[freq]||'Monatlich';const meta=accountEffectiveMeta(a);const current=meta.date?`${euroExact(meta.value)} · ${meta.date} · ${meta.source}`:`${euroExact(meta.value)} · ${meta.source}`;return `<div class="setupAccountRow ${a.status==='archived'?'archived':''}"><div><b>${escapeHtml(a.name||'Konto')}</b><span>${escapeHtml(a.provider||'')} · ${escapeHtml(accountRoleLabel(a.role))}${a.identifier?' · ••••'+escapeHtml(String(a.identifier).slice(-4)):''} · ${freqLabel}</span><small>Start: ${euroExact(Number(a.openingBalance)||0)}${a.openingDate?' · '+escapeHtml(a.openingDate):''} · Aktuell: ${escapeHtml(current)}</small></div><div class="setupAccountActions"><button class="smallBtn" data-account-edit="${escapeHtml(a.id)}" type="button">Bearbeiten</button><button class="smallBtn" data-account-frequency="${escapeHtml(a.id)}" type="button">${freqLabel}</button><button class="smallBtn" data-account-toggle="${escapeHtml(a.id)}" type="button">${a.status==='archived'?'Reaktivieren':'Archivieren'}</button></div></div>`};
  $('accountList').innerHTML=active.map(row).join('')+(archived.length?`<div class="setupArchivedLabel">Archiviert</div>${archived.map(row).join('')}`:'');
  document.querySelectorAll('[data-account-toggle]').forEach(b=>b.onclick=()=>toggleAccountStatus(b.dataset.accountToggle));
  document.querySelectorAll('[data-account-frequency]').forEach(b=>b.onclick=()=>cycleAccountFrequency(b.dataset.accountFrequency));
  document.querySelectorAll('[data-account-edit]').forEach(b=>b.onclick=()=>editAccount(b.dataset.accountEdit));
}
function editAccount(id){
  const a=(wealthSetup().accounts||[]).find(x=>x.id===id);if(!a)return;editingAccountId=id;toggleAccountForm(true);
  $('accountName').value=a.name||'';$('accountProvider').value=a.provider||'';$('accountRole').value=a.role||'CASH';$('accountFrequency').value=a.updateFrequency||'monthly';$('accountIdentifier').value=a.identifier||'';$('accountOpeningBalance').value=Number(a.openingBalance)||0;$('accountOpeningDate').value=a.openingDate||new Date().toISOString().slice(0,10);
  if($('btnAddAccount'))$('btnAddAccount').textContent='Änderungen speichern';
}
function toggleAccountForm(showForm=true){
  const form=$('accountForm'); if(!form)return;
  form.classList.toggle('hidden',!showForm);
  if(showForm&&$('accountOpeningDate')&&!$('accountOpeningDate').value)$('accountOpeningDate').value=new Date().toISOString().slice(0,10);
  if(!showForm&&$('setupAccountMsg'))$('setupAccountMsg').textContent='';
}
function clearAccountForm(){
  editingAccountId=null;if($('btnAddAccount'))$('btnAddAccount').textContent='Konto speichern';
  ['accountName','accountProvider','accountIdentifier','accountOpeningBalance'].forEach(id=>{if($(id))$(id).value=''});
  if($('accountRole'))$('accountRole').value='CASH';
  if($('accountFrequency'))$('accountFrequency').value='monthly';
  if($('accountOpeningDate'))$('accountOpeningDate').value=new Date().toISOString().slice(0,10);
}
function addAccount(){
  const name=String($('accountName')?.value||'').trim();
  if(!name){$('setupAccountMsg').textContent='Bitte einen Kontonamen angeben.';return;}
  const ws=wealthSetup();
  const values={name,provider:String($('accountProvider')?.value||'').trim(),role:$('accountRole')?.value||'CASH',identifier:String($('accountIdentifier')?.value||'').trim(),openingBalance:setupNumber('accountOpeningBalance',0),openingDate:$('accountOpeningDate')?.value||new Date().toISOString().slice(0,10),updateFrequency:$('accountFrequency')?.value||'monthly',updatedAt:new Date().toISOString()};
  if(editingAccountId){ws.accounts=(ws.accounts||[]).map(a=>a.id===editingAccountId?{...a,...values}:a);}else{ws.accounts=[...(ws.accounts||[]),{id:'acc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),...values,status:'active',createdAt:new Date().toISOString()}];}
  state.wealthSetup=ws; clearAccountForm(); toggleAccountForm(false); renderAccountList(); refreshWealthShell(); renderWealthBaselineSummary(); scheduleSave();
}

function cycleAccountFrequency(id){
  const ws=wealthSetup(), order=['monthly','annual','manual'];
  ws.accounts=(ws.accounts||[]).map(a=>{if(a.id!==id)return a;const cur=a.updateFrequency||'monthly';return{...a,updateFrequency:order[(order.indexOf(cur)+1)%order.length],updatedAt:new Date().toISOString()};});
  state.wealthSetup=ws; renderAccountList(); scheduleSave(); renderMonthlyReview();
}
function accountFrequencyLabel(freq){return({monthly:'Monatlich',annual:'Jährlich',manual:'Manuell'})[freq||'monthly']||'Monatlich'}

function toggleAccountStatus(id){
  const ws=wealthSetup(), now=new Date().toISOString();
  ws.accounts=(ws.accounts||[]).map(a=>a.id===id?{...a,status:a.status==='archived'?'active':'archived',statusChangedAt:now}:a);
  state.wealthSetup=ws; renderAccountList(); scheduleSave();
}
function updateGoalMilestones(){
  if(!$('goalMilestones'))return;
  const target=Math.max(0,setupNumber('goalTarget',1000000)), step=Math.max(1,setupNumber('goalMilestone',20000));
  const count=Math.ceil(target/step); $('goalMilestones').textContent=count+' Meilensteine';
}
function saveGoal(){
  const ws=wealthSetup(), target=Math.max(0,setupNumber('goalTarget',1000000)), milestone=Math.max(1000,setupNumber('goalMilestone',20000));
  ws.goal={target,milestone,changedAt:new Date().toISOString()}; state.wealthSetup=ws;
  $('goalMsg').textContent='Ziel gespeichert.'; updateGoalMilestones(); scheduleSave();
}

function currentMonthKey(){
  const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function reviewDocRef(month){return atlasFirebase.db.collection('users').doc(user.uid).collection('atlas').doc('monthly_'+month)}
function pdfWorkerReady(){
  if(!window.pdfjsLib)return false;
  if(!pdfjsLib.GlobalWorkerOptions.workerSrc)pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return true;
}
async function pdfTextFromFile(file){
  if(!file||file.type!=='application/pdf')throw new Error('Bitte eine PDF-Datei auswählen.');
  if(file.size>12*1024*1024)throw new Error('PDF ist zu groß. Maximal 12 MB pro Kontoauszug.');
  if(!pdfWorkerReady())throw new Error('PDF-Modul konnte nicht geladen werden.');
  const data=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    const text=content.items.map(item=>String(item.str||'')).join(' ').replace(/\s+/g,' ').trim();
    pages.push(text);
  }
  const text=pages.join('\n').trim();
  if(!text)throw new Error('In dieser PDF wurde kein lesbarer Text gefunden. Bitte einen digitalen Kontoauszug verwenden.');
  if(text.length>160000)throw new Error('Der Kontoauszug enthält zu viele Textdaten für einen einzelnen Import. Bitte einen kompakteren Monatsauszug verwenden.');
  return{text,pages:pdf.numPages};
}
async function statementHash(file){
  try{
    if(!crypto?.subtle)return `${file.name}:${file.size}:${file.lastModified}`;
    const buf=await file.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',buf);
    return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch{return `${file.name}:${file.size}:${file.lastModified}`;}
}
async function loadMonthlyReview(month){
  if(!user)return{};
  monthlyReviewCache={month,statements:{},decisions:{},loading:true};
  try{
    const snap=await reviewDocRef(month).get();
    const data=snap.exists?snap.data()||{}:{};
    const docs=data.statements||{}, decisions=data.decisions||{};
    monthlyReviewCache={month,statements:docs,decisions,loading:false};
    return docs;
  }catch(e){
    console.error('Monthly review load failed',e);
    monthlyReviewCache={month,statements:{},decisions:{},loading:false,error:e};
    return{};
  }
}
function reviewActiveAccounts(){return (state.wealthSetup?.accounts||[]).filter(a=>a.status!=='archived')}
function reviewRoleHint(role){return({CASH:'Cashflow',RESERVE:'Sicherheitsreserve',ALPHA:'ATLAS verbunden',BETA:'Langfristdepot',ASSET:'Vermögenswert'})[role]||role}
function formatFileSize(bytes){const n=Number(bytes)||0;return n<1024*1024?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1024/1024).toFixed(1).replace('.',',')} MB`}

function parseStatementMoney(raw){
  if(raw==null)return null;
  let s=String(raw).replace(/\s/g,'').replace(/EUR|€/gi,'');
  const neg=/^-/.test(s)||/-$/.test(s)||/\bS$/i.test(s);
  s=s.replace(/[+\-]/g,'').replace(/[HS]$/i,'');
  if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(','))s=s.replace(',','.');
  else if((s.match(/\./g)||[]).length>1)s=s.replace(/\./g,'');
  const n=Number(s.replace(/[^0-9.]/g,''));
  return Number.isFinite(n)?(neg?-n:n):null;
}
function firstMoneyMatch(text,patterns){
  for(const pattern of patterns){
    const m=String(text||'').match(pattern);
    if(m){const v=parseStatementMoney(m[1]);if(v!=null)return v;}
  }
  return null;
}
function detectStatementType(text,account){
  const t=String(text||'');
  if(/Wertaufstellung\s+Edelmetalle|GESAMTLAGERWERT/i.test(t))return'metals';
  if(/Depotübersicht|Depotwert\s+gesamt|Assetname\s+ISIN/i.test(t))return'depot';
  if(/Visa|Mastercard|Kreditkarte/i.test(t)&&/Umsatzaufstellung|Zahlungsrahmen/i.test(t))return'creditcard';
  if(/Kontoauszug|alter\s+Kontostand|neuer\s+Kontostand/i.test(t))return'bank';
  return String(account?.role||'').toLowerCase();
}
function statementSnippet(text,max=110){
  return String(text||'').replace(/\s+/g,' ').trim().slice(0,max);
}
function extractBankTransactions(text){
  const src=String(text||''); const out=[]; const starts=[];
  const startRe=/(?:^|\s)(\d{2}\.\d{2}\.)\s+\d{2}\.\d{2}\.\s+/g; let sm;
  while((sm=startRe.exec(src)))starts.push({index:sm.index,date:sm[1]});
  for(let i=0;i<starts.length;i++){
    const seg=src.slice(starts[i].index,i+1<starts.length?starts[i+1].index:Math.min(src.length,starts[i].index+900));
    const money=seg.match(/([\d.]+,\d{2})\s*([HS])(?=\s|$)/); if(!money)continue;
    const value=parseStatementMoney(money[1]); if(value==null)continue;
    // Der komplette Buchungsblock bleibt erhalten, weil Banken Empfänger/Verwendungszweck häufig erst NACH dem Betrag ausgeben.
    out.push({date:starts[i].date,description:statementSnippet(seg,420),amount:Math.abs(value),direction:money[2]});
  }
  return out;
}
const CASHFLOW_CATEGORIES={
  HOUSING:'Wohnen',FOOD:'Lebensmittel',MOBILITY:'Mobilität',INSURANCE:'Versicherungen',LIFESTYLE:'Freizeit / Lifestyle',TRAVEL:'Reisen',OTHER:'Sonstiges',INVESTMENT:'Investment',TAX:'Steuern',INCOME:'Einkommen',TRANSFER:'Transfer'
};
function normalizeMerchant(desc){
  return String(desc||'').toUpperCase().replace(/\b(PN|EREF|MREF|CRED|IBAN|BIC|DEU|EUR)[:\s].*$/i,'').replace(/\d{2}\.\d{2}\.?/g,' ').replace(/[^A-ZÄÖÜß0-9 ]/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
}
function learnedCategory(desc){
  const rules=wealthSetup().categoryRules||{}; const n=normalizeMerchant(desc);
  let best=null;
  Object.entries(rules).forEach(([key,val])=>{if(key&&n.includes(key)&&(!best||key.length>best.key.length))best={key,...val};});
  return best?.category||null;
}
function autoExpenseCategory(desc){
  const d=String(desc||''); const learned=learnedCategory(d); if(learned)return learned;
  if(/REWE|LIDL|E-CENTER|EDEKA|ALDI|PLODINE|INTERSPAR|SUPERMARKET|ROSSMANN|FAMILIA|MARE TRGOVINA/i.test(d))return'FOOD';
  if(/MIETE|NEBENKOSTEN|STROM|GAS|WASSER|HAUSVERWALT|TELEKOM|INTERNET/i.test(d))return'HOUSING';
  if(/ASFINAG|TANK|SHELL|ARAL|INA BP|BAHN|DB VERTRIEB|PARK|TAXI|UBER/i.test(d))return'MOBILITY';
  if(/VERSICHER|ALLIANZ|HUK|AXA|DEVK|ERGO/i.test(d))return'INSURANCE';
  if(/BOOKING|AIRBNB|LUFTHANSA|RYANAIR|JADROLINIJA|HOTEL|FLUG/i.test(d))return'TRAVEL';
  if(/BURGER KING|FITNESS|WELLUNDFIT|YOUTUBE|OPENAI|CHATGPT|AMAZON|KINO|NETFLIX|SPOTIFY/i.test(d))return'LIFESTYLE';
  return'OTHER';
}
function isNecessaryCategory(category){return['HOUSING','FOOD','MOBILITY','INSURANCE'].includes(category)}
function reviewItemId(accountId,item){return `${accountId}|${item.date||''}|${item.direction||''}|${Number(item.amount||0).toFixed(2)}|${normalizeMerchant(item.description||item.label||'').slice(0,28)}`}
function decisionLabel(v){return({income:'Einkommen',transfer:'Transfer',exceptional:'Sondereffekt',tax:'Steuern'})[v]||v}

function classifyBankTransaction(tx){
  const d=String(tx?.description||'');
  const learned=learnedCategory(d);
  if(learned==='TRANSFER')return{kind:'transfer',reason:'Gelernter Transfer'};
  if(learned==='TAX')return{kind:'exceptional',reason:'Gelernte Steuerbuchung'};
  if(learned==='INCOME')return{kind:'income',reason:'',category:'INCOME'};
  if(learned==='OTHER')return{kind:tx.direction==='H'?'income':'expense',reason:'',category:'OTHER'};
  // Interne Vermögensverschiebungen / Investments. Diese dürfen den Konsum-Cashflow nicht doppelt belasten.
  if(/Master\/Visacard|VISA\s+Abrechnung|Kreditkartensaldo/i.test(d))return{kind:'transfer',reason:'Kreditkarten-Ausgleich'};
  if(/Rücklage|Tagesgeld|Sparkonto/i.test(d))return{kind:'transfer',reason:'Rücklage'};
  if(/Union\s+Investment|Smartbroker|Depot|Wertpapier|ETF|Sparplan/i.test(d))return{kind:'transfer',reason:'Investment'};
  // Kettner-Auszahlungen gehören in den vorliegenden Daten zum Edelmetall-/Asset-Bereich.
  if(/Kettner|Life\s+Coaching\s+Finance/i.test(d))return{kind:'transfer',reason:'Asset-Investment'};
  // Bareinzahlungen haben ohne Gegenkonto keine sichere Herkunft und werden daher nicht als Einkommen angenommen.
  if(/\bEinzahlung\b/i.test(d)&&tx.direction==='H')return{kind:'review',reason:'Herkunft der Einzahlung prüfen'};
  // Steuerzahlungen/-erstattungen sind echte Geldflüsse, aber für die spätere Allokation typischerweise außergewöhnlich.
  if(/Finanzamt|Finanzkasse|Steuer|UMS\.ST|Einkommensteuer/i.test(d))return{kind:'exceptional',reason:'Steuer / außergewöhnlicher Geldfluss'};
  return tx.direction==='H'?{kind:'income',reason:'',category:'INCOME'}:{kind:'expense',reason:'',category:autoExpenseCategory(d)};
}
function analyzeBankStatement(text){
  const opening=firstMoneyMatch(text,[/alter\s+Kontostand(?:\s+vom\s+\d{2}\.\d{2}\.\d{4})?\s+([\d.]+,\d{2}\s*[HS]?)/i,/Anfangssaldo[^\d]{0,40}([\d.]+,\d{2}\s*[HS]?)/i]);
  const closing=firstMoneyMatch(text,[/neuer\s+Kontostand(?:\s+vom\s+\d{2}\.\d{2}\.\d{4})?\s+([\d.]+,\d{2}\s*[HS]?)/i,/Endsaldo[^\d]{0,40}([\d.]+,\d{2}\s*[HS]?)/i]);
  let income=0,expenses=0,incomeCount=0,expenseCount=0,transferHits=0;
  const reviewItems=[], categorized=[];
  const transactions=extractBankTransactions(text);
  for(const tx of transactions){
    const c=classifyBankTransaction(tx);
    if(c.kind==='transfer'){transferHits++;categorized.push({...tx,kind:'transfer',category:'TRANSFER'});continue;}
    if(c.kind==='review'){
      reviewItems.push({label:c.reason,amount:tx.amount,direction:tx.direction,description:tx.description,date:tx.date,suggested:'transfer'});
      categorized.push({...tx,kind:'review',category:null}); continue;
    }
    if(c.kind==='exceptional'){
      reviewItems.push({label:c.reason,amount:tx.amount,direction:tx.direction,description:tx.description,date:tx.date,suggested:'tax'});
      categorized.push({...tx,kind:'exceptional',category:'TAX'});
    }else categorized.push({...tx,kind:c.kind,category:c.category||null});
    if(tx.direction==='H'){income+=tx.amount;incomeCount++;}else{expenses+=tx.amount;expenseCount++;}
  }
  return{opening,closing,income:incomeCount?income:null,expenses:expenseCount?expenses:null,transferHits,reviewItems,transactions:categorized,confidence:closing!=null?'high':'medium'};
}
function analyzeCreditCard(text){
  const opening=firstMoneyMatch(text,[/Saldo\s+Vormonat\s+([\d.]+,\d{2})\s*-/i]);
  let closing=firstMoneyMatch(text,[/(?:^|\s)Saldo\s+([\d.]+,\d{2})\s*-/i,/Zwischensaldo\s+([\d.]+,\d{2})\s*-/i]);
  if(closing!=null)closing=-Math.abs(closing);
  let expenses=0,count=0; const transactions=[];
  const re=/(\d{2}\.\d{2}\.)\s+\d{2}\.\d{2}\.\s+(.{1,160}?)\s+([\d.]+,\d{2})([+\-])/g;
  let m;while((m=re.exec(text))){
    if(m[4]==='-'&&!/Saldo\s+Vormonat/i.test(m[2])){const amount=Math.abs(parseStatementMoney(m[3])||0);expenses+=amount;count++;transactions.push({date:m[1],description:m[2],amount,direction:'S',kind:'expense',category:autoExpenseCategory(m[2])});}
  }
  return{opening:opening==null?null:-Math.abs(opening),closing,income:null,expenses:count?expenses:(closing!=null?Math.abs(closing):null),transferHits:(text.match(/Ausgleich\s+Kreditkartensaldo/gi)||[]).length,reviewItems:[],transactions,confidence:closing!=null?'high':'medium'};
}
function analyzeDepot(text){
  let closing=firstMoneyMatch(text,[/Depotwert\s+gesamt\s+([\d.]+,\d{2})\s*€/i,/Gesamtdepot\s+in\s+EUR\s+([\d.]+,\d{2})\s*€/i]);
  if(closing==null){
    // Smartbroker/PDF.js kann Tabellenköpfe in anderer Lesereihenfolge liefern. Im Kopfbereich vor "Assetname"
    // stehen Depotwert und Gesamt-G/V; der größte positive EUR-Wert ist dort der Gesamtdepotwert.
    const header=String(text||'').split(/Assetname/i)[0].slice(0,1800);
    const vals=[]; const re=/([+\-]?[\d.]+,\d{2})\s*€/g; let m;
    while((m=re.exec(header))){const v=parseStatementMoney(m[1]);if(v!=null&&v>0)vals.push(v);}
    if(vals.length)closing=Math.max(...vals);
  }
  return{opening:null,closing,income:null,expenses:null,transferHits:0,reviewItems:[],transactions:[],confidence:closing!=null?'high':'low'};
}
function analyzeMetals(text){
  const closing=firstMoneyMatch(text,[/GESAMT\s*LAGERWERT\s+([\d.]+,\d{2})\s*€/i,/Gesamtlagerwert\s+([\d.]+,\d{2})\s*€/i,/Gesamt\s+\d+\s+[\d.,]+\s*g\s+([\d.]+,\d{2})\s*€/i]);
  return{opening:null,closing,income:null,expenses:null,transferHits:0,reviewItems:[],transactions:[],confidence:closing!=null?'high':'low'};
}
function analyzeStatement(doc,account){
  const text=String(doc?.text||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const type=detectStatementType(text,account);
  let result;
  if(type==='bank')result=analyzeBankStatement(text);
  else if(type==='creditcard')result=analyzeCreditCard(text);
  else if(type==='depot')result=analyzeDepot(text);
  else if(type==='metals')result=analyzeMetals(text);
  else result={opening:null,closing:null,income:null,expenses:null,transferHits:0,reviewItems:[],transactions:[],confidence:'low'};
  return{...result,type};
}
function euroExact(v){return v==null?'–':Number(v).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'}
function effectiveDecision(accountId,item){return monthlyReviewCache.decisions?.[reviewItemId(accountId,item)]||null}
function transactionWithDecision(accountId,tx){
  if(tx.kind!=='review'&&tx.kind!=='exceptional')return tx;
  const item={...tx,label:tx.kind==='review'?'Herkunft der Einzahlung prüfen':'Steuer / außergewöhnlicher Geldfluss'};
  const decision=effectiveDecision(accountId,item);
  if(!decision)return tx;
  if(decision.type==='transfer')return{...tx,kind:'transfer',category:'TRANSFER'};
  if(decision.type==='income')return{...tx,kind:'income',category:'INCOME',direction:'H'};
  if(decision.type==='tax')return{...tx,kind:'exceptional',category:'TAX'};
  if(decision.type==='exceptional')return{...tx,kind:'exceptional',category:'OTHER'};
  return tx;
}
function categoryTotals(rows){
  const totals={}; let necessary=0;
  rows.forEach(r=>(r.analysis.transactions||[]).forEach(raw=>{
    const tx=transactionWithDecision(r.account.id,raw);
    if(tx.direction!=='S'||['transfer','review'].includes(tx.kind))return;
    const cat=tx.category||'OTHER'; totals[cat]=(totals[cat]||0)+Number(tx.amount||0);
    if(isNecessaryCategory(cat))necessary+=Number(tx.amount||0);
  }));
  return{totals,necessary};
}
function cashflowTotals(rows){
  let income=0,expenses=0,incomeCount=0,expenseCount=0,transfers=0;
  rows.forEach(r=>{let txTransfers=0;(r.analysis.transactions||[]).forEach(raw=>{
    const tx=transactionWithDecision(r.account.id,raw);
    if(tx.kind==='transfer'){transfers++;txTransfers++;return;}
    if(tx.kind==='review')return;
    if(tx.direction==='H'){income+=Number(tx.amount||0);incomeCount++;}
    else if(tx.direction==='S'){expenses+=Number(tx.amount||0);expenseCount++;}
  });transfers+=Math.max(0,Number(r.analysis.transferHits||0)-txTransfers);});
  return{income,expenses,transfers,incomeCount,expenseCount};
}
function unresolvedReviewItems(rows){
  const items=[];
  rows.forEach(r=>(r.analysis.reviewItems||[]).forEach(item=>{
    const id=reviewItemId(r.account.id,item); if(monthlyReviewCache.decisions?.[id])return;
    items.push({...item,id,accountId:r.account.id,account:r.account.name,suggested:item.suggested||'exceptional'});
  }));
  return items;
}
function renderCategorySummary(rows){
  const box=$('reviewCategorySummary'); if(!box)return;
  const {totals,necessary}=categoryTotals(rows); const entries=Object.entries(totals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){box.classList.add('hidden');box.innerHTML='';return;}
  const months=Number(wealthSetup().strategy?.reserveMonths||6);
  box.classList.remove('hidden');
  box.innerHTML=`<div class="reviewMiniHead"><div><span>Kategorien</span><b>Ausgaben verstanden</b></div><div class="reserveBasis"><span>Notwendige Ausgaben</span><b>${euroExact(necessary)}</b><small>Reservebasis aktuell: ${euroExact(necessary*months)} · ${months} Monate</small></div></div><div class="categoryChips">${entries.map(([cat,val])=>`<div><span>${escapeHtml(CASHFLOW_CATEGORIES[cat]||cat)}</span><b>${euroExact(val)}</b></div>`).join('')}</div><p class="reviewAnalysisHint">Die Reservebasis nutzt aktuell diesen Review. Mit mehreren abgeschlossenen Monaten kann ATLAS später einen stabileren Durchschnitt bilden.</p>`;
}
function renderReviewChecks(rows){
  const box=$('reviewChecks'); if(!box)return; const items=unresolvedReviewItems(rows);
  if(!items.length){box.classList.add('hidden');box.innerHTML='';return;}
  box.classList.remove('hidden');
  box.innerHTML=`<div class="reviewChecksHead"><div><span>Prüfung</span><b>${items.length} ${items.length===1?'Buchung':'Buchungen'} kurz bestätigen</b></div></div>`+items.slice(0,6).map(item=>{
    const suggestion=item.suggested==='tax'?'Steuern':item.suggested==='transfer'?'Transfer':'Sondereffekt';
    return `<div class="reviewCheckRow"><div class="reviewCheckInfo"><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.account)} · ${item.direction==='H'?'+':'−'}${euroExact(item.amount)}</span><small>${escapeHtml(statementSnippet(item.description,115))}</small></div><div class="reviewDecisionButtons"><button class="smallBtn ${item.suggested==='tax'?'recommended':''}" data-review-decision="${escapeHtml(item.id)}" data-review-type="tax" data-review-account="${escapeHtml(item.accountId)}" type="button">Steuern</button><button class="smallBtn ${item.suggested==='transfer'?'recommended':''}" data-review-decision="${escapeHtml(item.id)}" data-review-type="transfer" data-review-account="${escapeHtml(item.accountId)}" type="button">Transfer</button><button class="smallBtn" data-review-decision="${escapeHtml(item.id)}" data-review-type="income" data-review-account="${escapeHtml(item.accountId)}" type="button">Einkommen</button><button class="smallBtn" data-review-decision="${escapeHtml(item.id)}" data-review-type="exceptional" data-review-account="${escapeHtml(item.accountId)}" type="button">Sondereffekt</button></div></div>`;
  }).join('');
  document.querySelectorAll('[data-review-decision]').forEach(btn=>btn.onclick=()=>saveReviewDecision(btn.dataset.reviewDecision,btn.dataset.reviewType,btn.dataset.reviewAccount));
}
async function saveReviewDecision(id,type,accountId){
  if(!user||!id)return; const month=$('reviewMonth')?.value||currentMonthKey();
  const decisions={...(monthlyReviewCache.decisions||{}),[id]:{type,decidedAt:new Date().toISOString()}};
  monthlyReviewCache.decisions=decisions;
  try{
    await reviewDocRef(month).set({month,statements:monthlyReviewCache.statements||{},decisions,updatedAt:new Date().toISOString()},{merge:true});
    // Merchant-Lernregel nur speichern, wenn aus der Buchung ein brauchbarer Gegenpart ableitbar ist.
    const rows=reviewActiveAccounts().filter(a=>a.role!=='ALPHA'&&monthlyReviewCache.statements?.[a.id]).map(a=>({account:a,analysis:analyzeStatement(monthlyReviewCache.statements[a.id],a)}));
    const item=rows.flatMap(r=>(r.analysis.reviewItems||[]).map(x=>({...x,accountId:r.account.id}))).find(x=>reviewItemId(x.accountId,x)===id);
    if(item){const key=normalizeMerchant(item.description);if(key.length>=5&&!/^EINZAHLUNG/.test(key)){const ws=wealthSetup();ws.categoryRules={...(ws.categoryRules||{}),[key]:{category:type==='tax'?'TAX':type==='transfer'?'TRANSFER':type==='income'?'INCOME':'OTHER',updatedAt:new Date().toISOString()}};state.wealthSetup=ws;scheduleSave();}}
    paintMonthlyReview(month,monthlyReviewCache.statements||{});
  }catch(e){console.error(e);if($('reviewMsg'))$('reviewMsg').textContent='Entscheidung konnte nicht gespeichert werden.';}
}
function renderFinancialIntelligence(docs={}){
  const card=$('reviewAnalysis'),grid=$('reviewAnalysisGrid'),hint=$('reviewAnalysisHint'),pill=$('analysisConfidence'); if(!card||!grid)return;
  const accounts=reviewActiveAccounts().filter(a=>a.role!=='ALPHA'&&docs[a.id]);
  if(!accounts.length){card.classList.add('hidden');return;}
  card.classList.remove('hidden');
  const rows=accounts.map(a=>({account:a,analysis:analyzeStatement(docs[a.id],a)}));
  const cf=cashflowTotals(rows), cashflow=(cf.incomeCount&&cf.expenseCount)?cf.income-cf.expenses:null;
  const unresolved=unresolvedReviewItems(rows), lows=rows.filter(r=>r.analysis.confidence==='low').length;
  grid.innerHTML=`<div><span>Einnahmen</span><b>${cf.incomeCount?euroExact(cf.income):'Noch nicht erkannt'}</b></div><div><span>Ausgaben</span><b>${cf.expenseCount?euroExact(cf.expenses):'Noch nicht erkannt'}</b></div><div><span>${unresolved.length?'Überschuss · vorläufig':'Überschuss'}</span><b>${cashflow!=null?euroExact(cashflow):'Noch offen'}</b></div><div><span>Interne Transfers</span><b>${cf.transfers||'Keine erkannt'}</b></div>`+rows.map(r=>`<div class="analysisAccount"><span>${escapeHtml(r.account.name)}</span><b>${r.analysis.closing!=null?euroExact(r.analysis.closing):'Wert nicht sicher erkannt'}</b><small>${r.analysis.opening!=null?'Start '+euroExact(r.analysis.opening)+' · ':''}${r.analysis.confidence==='high'?'hohe':r.analysis.confidence==='medium'?'mittlere':'geringe'} Erkennung</small></div>`).join('');
  if(pill)pill.textContent=lows?'Prüfung nötig':unresolved.length?`${unresolved.length} Prüfung${unresolved.length===1?'':'en'}`:'Geprüft ✓';
  if(hint){
    if(lows)hint.textContent='ATLAS zeigt nur Werte, die im Auszug eindeutig gefunden wurden. Nicht sicher erkannte Werte werden bewusst nicht geschätzt.';
    else if(unresolved.length)hint.textContent=`${cf.transfers} interne Transfer${cf.transfers===1?'':'s'} wurden herausgerechnet. Bestätige nur die ${unresolved.length} ungewöhnlichen Buchung${unresolved.length===1?'':'en'} unten.`;
    else hint.textContent=`Monat geprüft. ${cf.transfers?`${cf.transfers} interne Transfer${cf.transfers===1?'':'s'} wurden aus dem Cashflow herausgerechnet.`:'Keine internen Transfers erkannt.'}`;
  }
  renderCategorySummary(rows); renderReviewChecks(rows);
}
function accountRequiredThisMonth(a){return a.role==='ALPHA'||(a.updateFrequency||'monthly')==='monthly'}
function paintMonthlyReview(month,docs={}){
  const listEl=$('reviewAccountList'); if(!listEl)return;
  const accounts=reviewActiveAccounts();
  if(!accounts.length){
    listEl.innerHTML='<div class="setupEmpty">Noch keine Konten eingerichtet. Richte zuerst deine Finanzwelt im Financial Setup ein.</div>';
    if($('reviewProgressText'))$('reviewProgressText').textContent='0 / 0'; if($('reviewProgressHint'))$('reviewProgressHint').textContent='Keine Konten'; if($('reviewProgressBar'))$('reviewProgressBar').style.width='0%'; return;
  }
  const required=accounts.filter(accountRequiredThisMonth); const done=required.filter(a=>a.role==='ALPHA'||docs[a.id]).length; const pct=required.length?Math.round(done/required.length*100):100;
  if($('reviewProgressText'))$('reviewProgressText').textContent=`${done} / ${required.length}`;
  if($('reviewProgressHint'))$('reviewProgressHint').textContent=done===required.length?'Monatsdaten vollständig':'Konten aktualisiert';
  if($('reviewProgressBar'))$('reviewProgressBar').style.width=pct+'%';
  listEl.innerHTML=accounts.map(a=>{
    const doc=docs[a.id], alpha=a.role==='ALPHA', freq=a.updateFrequency||'monthly', requiredNow=accountRequiredThisMonth(a);
    const detail=alpha?'Tradingdaten direkt aus ATLAS':doc?`${escapeHtml(doc.fileName||'PDF')} · ${formatFileSize(doc.fileSize)}`:`${escapeHtml(a.provider||accountRoleLabel(a.role))} · ${accountFrequencyLabel(freq)}`;
    const passive=!requiredNow&&!doc;
    const action=alpha?'<span class="reviewAuto">✓ automatisch</span>':`<label class="secondary reviewUploadBtn">${doc?'PDF ersetzen':passive?'Optional aktualisieren':'PDF hinzufügen'}<input type="file" accept="application/pdf,.pdf" data-statement-account="${escapeHtml(a.id)}"></label>${doc?`<button class="reviewRemove" type="button" data-statement-remove="${escapeHtml(a.id)}">Entfernen</button>`:''}`;
    const stateLabel=alpha||doc?'Aktuell':passive?accountFrequencyLabel(freq):'Fehlt';
    return `<div class="reviewAccountRow"><div class="reviewAccountInfo"><b>${escapeHtml(a.name||'Konto')}</b><span class="reviewFileName">${detail}</span></div><div class="reviewAccountActions"><span class="reviewState ${alpha||doc||passive?'done':''}">${stateLabel}</span>${action}</div></div>`;
  }).join('');
  document.querySelectorAll('[data-statement-account]').forEach(input=>input.onchange=e=>handleStatementUpload(input.dataset.statementAccount,e.target.files?.[0]));
  document.querySelectorAll('[data-statement-remove]').forEach(btn=>btn.onclick=()=>removeStatement(btn.dataset.statementRemove));
  const missing=Math.max(0,required.length-done);
  if($('coachSignalTitle')&&$('coachSignalText')){
    if(done===required.length){$('coachSignalTitle').textContent='Monatsdaten vollständig ✓';$('coachSignalText').textContent='Alle für diesen Monat vorgesehenen Datenquellen sind aktuell.';}
    else{$('coachSignalTitle').textContent=`Noch ${missing} ${missing===1?'Konto':'Konten'} offen.`;$('coachSignalText').textContent='Nur monatlich geführte Konten sind für den Review verpflichtend.';}
  }
  if(month===currentMonthKey()&&$('homeSignalTitle')){
    if(done===required.length){$('homeSignalTitle').textContent='Alles aktuell ✓';$('homeSignalText').textContent='Deine Finanzdaten für diesen Monat sind vollständig.';}
    else{$('homeSignalTitle').textContent='Monatsreview offen.';$('homeSignalText').textContent=`Noch ${missing} ${missing===1?'Datenquelle':'Datenquellen'} aktualisieren.`;}
  }
  renderFinancialIntelligence(docs);
}
async function renderMonthlyReview(){
  const input=$('reviewMonth'); if(!input||!user)return;
  if(!input.value)input.value=currentMonthKey();
  const month=input.value;
  if(monthlyReviewCache.month===month&&!monthlyReviewCache.loading){paintMonthlyReview(month,monthlyReviewCache.statements||{});return;}
  if($('reviewAccountList'))$('reviewAccountList').innerHTML='<div class="setupEmpty">Monatsdaten werden geladen…</div>';
  const docs=await loadMonthlyReview(month); paintMonthlyReview(month,docs);
}
async function handleStatementUpload(accountId,file){
  if(!file||!user)return;
  const month=$('reviewMonth')?.value||currentMonthKey(); const account=reviewActiveAccounts().find(a=>a.id===accountId); if(!account)return;
  const msg=$('reviewMsg'); if(msg)msg.textContent=`${account.name}: PDF wird gelesen…`;
  try{
    const [{text,pages},hash]=await Promise.all([pdfTextFromFile(file),statementHash(file)]);
    const identifier=String(account.identifier||'').replace(/\s/g,'');
    const identifierMatch=!identifier||text.replace(/\s/g,'').includes(identifier.slice(-4));
    const payload={accountId,accountName:account.name||'Konto',accountRole:account.role||'',provider:account.provider||'',month,fileName:file.name,fileSize:file.size,fileModified:file.lastModified||null,pages,text,hash,identifierMatch,importedAt:new Date().toISOString(),parserVersion:'5951-wealth-foundation-v1'};
    const nextStatements={...(monthlyReviewCache.month===month?monthlyReviewCache.statements:{}),[accountId]:payload};
    await reviewDocRef(month).set({month,statements:nextStatements,decisions:monthlyReviewCache.decisions||{},updatedAt:new Date().toISOString()},{merge:true});
    monthlyReviewCache.month=month; monthlyReviewCache.statements=nextStatements; monthlyReviewCache.loading=false;
    if(msg)msg.textContent=identifierMatch?'PDF übernommen.':'PDF übernommen. Hinweis: Die hinterlegte Konto-Kennung wurde im Dokument nicht eindeutig erkannt.';
    paintMonthlyReview(month,monthlyReviewCache.statements);
  }catch(e){console.error(e);if(msg)msg.textContent=e?.message||'PDF konnte nicht verarbeitet werden.';paintMonthlyReview(month,monthlyReviewCache.statements||{});}
}
async function removeStatement(accountId){
  if(!user)return; const month=$('reviewMonth')?.value||currentMonthKey();
  try{const nextStatements={...(monthlyReviewCache.statements||{})};delete nextStatements[accountId];await reviewDocRef(month).set({month,statements:nextStatements,decisions:monthlyReviewCache.decisions||{},updatedAt:new Date().toISOString()},{merge:true});monthlyReviewCache.statements=nextStatements;if($('reviewMsg'))$('reviewMsg').textContent='Kontoauszug entfernt.';paintMonthlyReview(month,nextStatements);loadLatestWealthValues();}catch(e){console.error(e);if($('reviewMsg'))$('reviewMsg').textContent='Kontoauszug konnte nicht entfernt werden.';}
}
function cloudMsg(t){
  if($('cloudState'))$('cloudState').textContent=t;
  if($('syncPill')){
    const quiet=t==='Speichert...'?'Cloud':t==='Cloud wird geladen...'?'Cloud lädt':t==='Cloud verbunden'?'Cloud':t;
    $('syncPill').textContent=quiet;
  }
}
function stateRef(){return atlasFirebase.db.collection('users').doc(user.uid).collection('atlas').doc('state')}
function scheduleSave(){
  if(!user||!cloudReady)return;
  cloudMsg('Speichert...');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{saveCloud().catch(console.error)},450);
}
async function saveCloud(){
  if(!user||!cloudReady)return false;
  saveQueued=true;
  if(saving)return savePromise;

  saving=true;
  savePromise=(async()=>{
    try{
      while(saveQueued){
        saveQueued=false;
        const savedAt=new Date().toISOString();
        state.updatedAt=savedAt;
        const payload=prepareStateForCloud(state);
        payload.updatedAt=savedAt;
        const bytes=cloudPayloadSize(payload);
        if(bytes>900000)throw new Error(`Atlas-Datenbestand ist mit ${Math.round(bytes/1024)} KB zu groß. Bitte alte Screenshots reduzieren.`);
        // Vollständigen, bereinigten State atomar ersetzen. Legacy-Duplikate werden entfernt.
        await stateRef().set(payload);
      }
      cloudMsg('Cloud synchronisiert');
      return true;
    }catch(e){
      cloudMsg('Cloud Fehler');
      console.error('Atlas cloud save failed',e);
      throw e;
    }finally{
      saving=false;
    }
  })();
  return savePromise;
}
async function startCloud(uidVal){
  if(unsub){unsub();unsub=null}
  cloudReady=false;
  stopMarketEngine();
  clearTimeout(saveTimer);
  cloudMsg('Cloud wird geladen...');

  const ref=stateRef();
  try{
    const first=await ref.get();
    if(first.exists){
      state=normalizeState(first.data());
    }else{
      state=normalizeState(structuredClone(defaultState));
      state.updatedAt=new Date().toISOString();
      await ref.set(structuredClone(state));
    }

    if(selectedTradeId && !(state.activeTrades||[]).some(t=>t.id===selectedTradeId))selectedTradeId=null;
    cloudReady=true;
    renderAll();
    cloudMsg('Cloud synchronisiert');

    unsub=ref.onSnapshot({includeMetadataChanges:true},snap=>{
      if(!snap.exists||!cloudReady)return;
      // Lokale Schreib-Echos nicht erneut als externen Zustand einspielen.
      if(snap.metadata&&snap.metadata.hasPendingWrites)return;
      const incoming=snap.data();
      const remoteTime=String(incoming?.updatedAt||'');
      const localTime=String(state?.updatedAt||'');
      // Während noch lokale Änderungen gespeichert werden, darf kein älterer Snapshot den State überschreiben.
      if((saving||saveQueued)&&remoteTime&&localTime&&remoteTime<localTime)return;
      state=normalizeState(incoming);
      if(selectedTradeId && !(state.activeTrades||[]).some(t=>t.id===selectedTradeId))selectedTradeId=null;
      renderAll();
      cloudMsg('Cloud synchronisiert');
    },err=>{console.error(err);cloudMsg('Cloud Fehler')});

    startMarketEngine();
  }catch(err){
    console.error('Atlas initial cloud load failed',err);
    cloudReady=false;
    cloudMsg('Cloud Fehler – Daten nicht überschrieben');
  }
}
async function login(){try{await atlasFirebase.auth.signInWithEmailAndPassword($('authEmail').value.trim(),$('authPassword').value);$('authMsg').textContent=''}catch(e){$('authMsg').textContent=authError(e)}}
async function register(){try{await atlasFirebase.auth.createUserWithEmailAndPassword($('authEmail').value.trim(),$('authPassword').value);$('authMsg').textContent=''}catch(e){$('authMsg').textContent=authError(e)}}
function authError(e){console.error(e);if(e.code==='auth/email-already-in-use')return 'Diese E-Mail ist bereits registriert. Bitte anmelden.';if(e.code==='auth/invalid-credential'||e.code==='auth/wrong-password')return 'Anmeldung fehlgeschlagen. E-Mail oder Passwort prüfen.';if(e.code==='auth/weak-password')return 'Passwort muss mindestens 6 Zeichen haben.';return 'Fehler: '+(e.message||e.code)}
atlasFirebase.auth.onAuthStateChanged(u=>{user=u;if(u){$('authScreen').classList.add('hidden');$('app').classList.remove('hidden');cloudMsg('Cloud verbunden');startCloud(u.uid)}else{cloudReady=false;saveQueued=false;clearTimeout(saveTimer);$('authScreen').classList.remove('hidden');$('app').classList.add('hidden');if(unsub){unsub();unsub=null}stopMarketEngine()}});
function renderAll(){safeRenderAll();renderFinancialSetup();refreshWealthShell();setTimeout(loadLatestWealthValues,0)}
function blankTrade(){return {...tradeTemplate,id:uid(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
function emptyTradeDraft(){
  const now=new Date().toISOString();
  return{
    ...tradeTemplate,
    id:uid(),
    brokerAccount:'Nicht zugeordnet',
    market:'Dow Jones Future',
    symbol:'YM=F',
    direction:'Long',
    positionStatus:'planned',
    contracts:1,
    pointValue:1,
    entry:'',
    target:'',
    stop:'',
    current:'',
    zone:'',
    why:'',
    rule:'Triff keine neue Entscheidung. Überprüfe zuerst deine ursprüngliche Entscheidung.',
    hkcm:'',
    tv:'',
    createdAt:now,
    updatedAt:now,
    originalPlan:null,
    deviations:[],
    mentorState:null,
    brainState:'waiting'
  };
}
function clearFileInputs(){
  if($('hkcmFile'))$('hkcmFile').value='';
  if($('tvFile'))$('tvFile').value='';
}

function startNewTrade(){
  selectedTradeId=null;
  formMode='new';
  formDraft=emptyTradeDraft();
  formDirty=false;
  clearFileInputs();
  loadForm(formDraft);
  $('saveMsg').textContent='Neuen Trade erfassen.';
  show('create');
}
function editSelectedTrade(){
  const p=currentTrade();
  if(!p)return;
  formMode='edit';
  formDraft=structuredClone(p);
  formDirty=false;
  clearFileInputs();
  loadForm(formDraft);
  show('create');
}
async function selectTrade(id){selectedTradeId=id;renderPlan();scrollTo(0,0);const p=currentTrade();if(!p||!p.symbol||p.symbol==='CUSTOM')return;if($('liveMsg'))$('liveMsg').textContent='Letzter gespeicherter Live-Kurs wird angezeigt. Aktualisierung läuft im Hintergrund.';const ok=await fetchMarketDataForTrade(p,{silent:true});renderAll();updateGlobalMarketPill()}
function renderDesk(){
  const arr=state.activeTrades||[];
  if(!arr.length){
    $('activeTradeList').innerHTML=`<div class="emptyDesk"><h2>Noch keine Position oder Order</h2><p>Lege einen Trade an. Atlas trennt aktive Positionen und offene Orders direkt nach Brokerkonto.</p></div>`;
  }else{
    const groups=new Map();
    arr.forEach(t=>{
      const account=(t.brokerAccount||'Nicht zugeordnet').trim()||'Nicht zugeordnet';
      if(!groups.has(account))groups.set(account,[]);
      groups.get(account).push(t);
    });
    const sorted=[...groups.entries()].sort(([a],[b])=>a==='Nicht zugeordnet'?1:b==='Nicht zugeordnet'?-1:a.localeCompare(b,'de'));
    $('activeTradeList').innerHTML=sorted.map(([account,trades])=>{
      const positions=trades.filter(t=>(t.positionStatus||'active')==='active');
      const orders=trades.filter(t=>(t.positionStatus||'active')!=='active');
      const section=(title,type,items)=>items.length?`<div class="brokerTradeSection ${type}"><div class="brokerTradeSectionHeader"><div><span class="sectionStatusDot"></span><b>${title}</b></div><small>${items.length}</small></div><div class="brokerAccountTrades">${items.map(t=>tradeDeskCard(t)).join('')}</div></div>`:'';
      return `<section class="brokerAccountGroup"><div class="brokerAccountHeader"><div><span>Brokerkonto</span><b>${escapeHtml(account)}</b></div><small>${trades.length} ${trades.length===1?'Eintrag':'Einträge'}</small></div>${section('Aktive Positionen','positions',positions)}${section('Offene Orders','orders',orders)}</section>`;
    }).join('');
  }
  document.querySelectorAll('[data-selecttrade]').forEach(b=>b.addEventListener('click',()=>selectTrade(b.dataset.selecttrade)));
  if($('tradeDetail'))$('tradeDetail').classList.toggle('hidden',!currentTrade());
}
function tradeLiveStatus(t){
  if(!t||!t.symbol||t.symbol==='CUSTOM')return{key:'none',label:'Manuell',detail:'Keine Live-Daten'};
  if(!t.liveUpdatedAt){
    if((t.liveErrorCount||0)>=LIVE_ERROR_THRESHOLD)return{key:'error',label:'Keine Daten',detail:'Verbindung prüfen'};
    return{key:'stale',label:'Noch offen',detail:'Warte auf ersten Kurs'};
  }
  const age=Math.max(0,Date.now()-new Date(t.liveUpdatedAt).getTime());
  if(!Number.isFinite(age))return{key:'stale',label:'Veraltet',detail:'Zeit unbekannt'};
  if(age<=LIVE_FRESH_MS)return{key:'live',label:'Aktuell',detail:`${Math.max(0,Math.round(age/60_000))} Min. alt`};
  if(age<=LIVE_STALE_MS)return{key:'stale',label:'Veraltet',detail:`${Math.max(1,Math.round(age/60_000))} Min. alt`};
  if((t.liveErrorCount||0)>=LIVE_ERROR_THRESHOLD)return{key:'error',label:'Keine Daten',detail:`seit ${Math.max(1,Math.round(age/60_000))} Min.`};
  return{key:'stale',label:'Veraltet',detail:`${Math.max(1,Math.round(age/60_000))} Min. alt`};
}
function tradeDeskCard(t){
  const current=optionalNumber(t.current)??num(t.entry);
  const s=tradeState(t,current);
  const isOrder=(t.positionStatus||'active')!=='active';
  const close=brokerCloseStatus(t,current);
  const lampClass=isOrder?'order':(close.mode==='stop'||s.key==='stop_approaching'?'red':(close.mode==='target'||s.key==='target_approaching'?'yellow':''));
  const side=directionLabel(t.direction);
  const focus=deskFocus(t,current,s);
  const live=tradeLiveStatus(t);
  const typeLabel=isOrder?'Order':'Position';
  return `<button class="activeTradeCard ${isOrder?'orderCard':'positionCard'}" data-state="${s.key}" data-selecttrade="${t.id}"><div class="marketIconCell">${marketIconHtml(t)}</div><div class="tradeCardMain"><div class="tradeCardTitleLine"><b>${escapeHtml(t.market)}</b><span class="tradeTypeBadge ${isOrder?'order':'position'}">${typeLabel}</span></div><span>${side} · ${fmt(t.contracts)} Kontrakt(e)</span><em class="tradeAccountTag">${escapeHtml(t.brokerAccount||'Nicht zugeordnet')}</em></div><div class="deskMeta"><strong>${s.phase}</strong><span>${focus}</span></div><div class="tradeLiveState ${live.key}"><i></i><div><b>${live.label}</b><span>${live.detail}</span></div></div></button>`;
}
function deskFocus(p,current,s){if((p.positionStatus||'active')!=='active')return `${fmt(dist(current,p.entry))}P bis Einstieg`;if(s.key==='stop_hit')return 'Stop erreicht';if(s.key==='target_hit')return 'TP erreicht';if(s.key==='stop_approaching')return `${fmt(dist(current,p.stop))}P bis SL`;return `${fmt(dist(p.target,current))}P bis TP`}
function loadForm(source=null){const p=source||((isCreateScreenActive()&&formDraft)?formDraft:(currentTrade()||state.plan||blankTrade()));$('formTitle').textContent=formMode==='edit'?'Trade bearbeiten':'Trade anlegen';$('btnSavePlan').textContent=formMode==='edit'?'Trade aktualisieren':'Neuen Trade speichern';if($('fBrokerAccount'))$('fBrokerAccount').value=p.brokerAccount||'Nicht zugeordnet';if($('brokerAccountList')){const accounts=[...new Set([...(state.activeTrades||[]).map(t=>t.brokerAccount),...(state.trades||[]).map(t=>t.brokerAccount)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));$('brokerAccountList').innerHTML=accounts.map(a=>`<option value="${String(a).replace(/"/g,'&quot;')}"></option>`).join('')} $('fMarketSelect').innerHTML=markets.map(m=>`<option value="${m[0]}">${m[1]}</option>`).join('');$('fMarketSelect').value=markets.some(m=>m[0]===p.symbol)?p.symbol:'CUSTOM';$('fMarket').value=p.market;$('fSymbol').value=p.symbol;$('fDirection').value=p.direction;$('fPositionStatus').value=p.positionStatus||'active';$('fContracts').value=p.contracts;$('fPointValue').value=p.pointValue;$('fEntry').value=p.entry;$('fTarget').value=p.target;$('fStop').value=p.stop;$('fZone').value=p.zone;$('fWhy').value=p.why;$('fRule').value=p.rule;$('hkcmPreview').innerHTML=imgHtml(p.hkcm);$('tvPreview').innerHTML=imgHtml(p.tv);if($('accountStart'))$('accountStart').value=state.settings.accountStart||'';setTimeout(renderDeviationPanel,0)}
function renderPlan(){renderDesk();const p=currentTrade();if(!p){$('tradeDetail').classList.add('hidden');return}$('tradeDetail').classList.remove('hidden');const current=num(p.current)||num(p.entry);$('marketTitle').textContent=`${p.market} · ${directionLabel(p.direction)}`;$('directionLine').textContent=`${p.contracts} Kontrakt(e) · ${p.symbol} · ${p.brokerAccount||'Nicht zugeordnet'}`;$('sStop').textContent=fmt(p.stop);$('sEntry').textContent=fmt(p.entry);$('sTarget').textContent=fmt(p.target);$('whyList').innerHTML=String(p.why||'').split('\n').filter(Boolean).map(x=>`<div class="pill">✓ ${x}</div>`).join('')||'<p>Keine Analyse hinterlegt.</p>';$('bar').style.width=progressPct(p,current)+'%';$('hkcmView').innerHTML=imgHtml(p.hkcm);$('tvView').innerHTML=imgHtml(p.tv);const k=tradeState(p,current);const mentor=mentorFor(p,k);renderBrain(p,current,k,mentor);renderBrokerCard(p,current,k);renderClosePanel(p,current);renderDeviationInfo(p);const last=lastLiveById[p.id]||(p.liveUpdatedAt?{price:current,change:Number(p.liveChange),source:p.dataSource,at:p.liveUpdatedAt}:null);if(last){$('livePrice').textContent=fmt(last.price);$('liveChange').textContent=Number.isFinite(Number(last.change))?((Number(last.change)>=0?'+':'')+fmt(last.change)+'%'):'-';if($('liveMsg'))$('liveMsg').textContent=`Live-Kurs aktualisiert${last.source?' · '+last.source:''}${last.at?' · '+new Date(last.at).toLocaleTimeString('de-DE'):''}`}else{$('livePrice').textContent=fmt(current);$('liveChange').textContent='-';if($('liveMsg'))$('liveMsg').textContent='Live-Daten werden automatisch geladen.'}}
function renderBrokerCard(p,current,k){const side=directionLabel(p.direction);$('brokerSide').textContent=side;$('brokerSide').classList.toggle('sell',p.direction==='Short');$('brokerContracts').textContent=fmt(p.contracts);$('brokerEntry').textContent=fmt(p.entry);$('brokerCurrent').textContent=fmt(current);$('brokerStop').textContent=fmt(p.stop);$('brokerTarget').textContent=fmt(p.target);$('brokerPhase').textContent=k.phase;$('brokerRelevantDistance').textContent=k.headline;$('brokerRelevantText').textContent=k.text}
function progressPct(p,c){const stop=num(p.stop),target=num(p.target);if(target===stop)return 0;return Math.min(100,Math.max(0,(c-stop)/(target-stop)*100))}
function renderBrain(p,current,k,mentor){
  const lamp=$('riskLamp');
  lamp.className='lamp';

  let main='✓ PLAN LÄUFT';
  if(k.key==='stop_approaching') main='⚠ STOP-LOSS NÄHERT SICH';
  if(k.key==='stop_hit') main='STOP-LOSS ERREICHT';
  if(k.key==='target_hit') main='TAKE-PROFIT ERREICHT';

  if(['entry_approaching','target_approaching'].includes(k.key)){
    lamp.classList.add('yellow','brainPulse');
  }
  if(['stop_approaching','stop_hit'].includes(k.key)){
    lamp.classList.add('red','brainPulse');
  }
  if(k.key==='target_hit') lamp.classList.add('yellow');

  $('mainStatus').textContent=main;
  $('mainPhase').textContent=mentor.headline;
  $('brainText').textContent=mentor.text;

  const action=$('mentorAction');
  if(action){
    action.textContent=mentor.action;
    action.className='mentorAction '+mentor.tone;
  }

  const quote=p.rule||'Triff keine neue Entscheidung. Überprüfe zuerst deine ursprüngliche Entscheidung.';
  $('brainQuote').textContent='„'+quote+'“';
  $('decision').classList.toggle('hidden',!['entry_approaching','stop_approaching','target_approaching'].includes(k.key));
}
function imgHtml(src){return src?`<img src="${src}" class="zoomable">`:`<div class="emptyShot">Noch kein Screenshot<br>über Eingabe hinzufügen</div>`}
function readFileDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Bilddatei konnte nicht gelesen werden'));
    reader.onload=()=>resolve(String(reader.result||''));
    reader.readAsDataURL(file);
  });
}

async function canvasDataFromBitmap(bitmap){
  const max=900;
  let w=bitmap.width;
  let h=bitmap.height;
  if(!w||!h)throw new Error('Ungültige Bildgröße');
  if(w>max||h>max){
    const scale=Math.min(max/w,max/h);
    w=Math.max(1,Math.round(w*scale));
    h=Math.max(1,Math.round(h*scale));
  }
  const canvas=document.createElement('canvas');
  canvas.width=w;
  canvas.height=h;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas nicht verfügbar');
  ctx.drawImage(bitmap,0,0,w,h);
  return canvas.toDataURL('image/jpeg',.68);
}

async function compressImage(file){
  if(!file)throw new Error('Keine Datei ausgewählt');
  const originalData=await readFileDataUrl(file);

  // Modern browsers and newer iPhones.
  if(typeof createImageBitmap==='function'){
    try{
      const bitmap=await createImageBitmap(file);
      const result=await canvasDataFromBitmap(bitmap);
      if(typeof bitmap.close==='function')bitmap.close();
      return result;
    }catch(error){
      console.warn('createImageBitmap fallback',error);
    }
  }

  // Safari/browser fallback.
  try{
    const img=await new Promise((resolve,reject)=>{
      const el=new Image();
      el.onload=()=>resolve(el);
      el.onerror=()=>reject(new Error('Bildformat konnte nicht dekodiert werden'));
      el.src=originalData;
    });
    return await canvasDataFromBitmap(img);
  }catch(error){
    console.warn('Image decode fallback',error);
  }

  // Last fallback: original image, provided it is small enough for the cloud document.
  if(originalData.length<=850000)return originalData;
  throw new Error('Bild ist zu groß oder das Format wird nicht unterstützt');
}

async function handleImage(e,type){
  const input=e.currentTarget||e.target;
  const file=input?.files?.[0];
  if(!file)return;
  const preview=$(type+'Preview');
  const saveBtn=$('btnSavePlan');

  const job=(async()=>{
    try{
      if(saveBtn)saveBtn.disabled=true;
      if($('saveMsg'))$('saveMsg').textContent='Screenshot wird verarbeitet. Bitte kurz warten...';

      const immediate=await readFileDataUrl(file);
      if(preview)preview.innerHTML=imgHtml(immediate);
      const image=await compressImage(file);

      if(!formDraft){
        formDraft=formMode==='edit'&&currentTrade()?structuredClone(currentTrade()):emptyTradeDraft();
      }
      // collectFormDraft preserves all text fields currently visible in the form.
      formDraft={...collectFormDraft(),[type]:image};
      formDirty=true;
      if(preview)preview.innerHTML=imgHtml(image);
      if($('saveMsg'))$('saveMsg').textContent='Screenshot fertig verarbeitet und im Entwurf gesichert.';
      renderDeviationPanel();
      return image;
    }catch(error){
      console.error('Screenshot processing failed',error);
      if(preview)preview.innerHTML='<div class="emptyShot">Screenshot konnte nicht geladen werden.</div>';
      if($('saveMsg'))$('saveMsg').textContent='Screenshot konnte nicht verarbeitet werden. Bitte JPG oder PNG verwenden.';
      throw error;
    }finally{
      if(input)input.value='';
    }
  })();

  imageJobs[type]=job;
  try{await job}catch{}finally{
    if(imageJobs[type]===job)imageJobs[type]=null;
    if(saveBtn&&!imageJobs.hkcm&&!imageJobs.tv)saveBtn.disabled=false;
  }
}

async function waitForImageJobs(){
  const pending=[imageJobs.hkcm,imageJobs.tv].filter(Boolean);
  if(!pending.length)return;
  if($('saveMsg'))$('saveMsg').textContent='Warte auf die Verarbeitung der Screenshots...';
  const results=await Promise.allSettled(pending);
  const failed=results.find(r=>r.status==='rejected');
  if(failed)throw failed.reason||new Error('Screenshot-Verarbeitung fehlgeschlagen');
}

async function savePlan(){
  const saveBtn=$('btnSavePlan');
  const originalButtonText=saveBtn?.textContent||'Trade speichern';
  const previousState=structuredClone(state);
  const previousSelected=selectedTradeId;

  try{
    if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Wird gespeichert...'}
    await waitForImageJobs();

    const editingTrade=formMode==='edit'?(currentTrade()||state.activeTrades.find(t=>t.id===formDraft?.id)):null;
    const isNew=formMode==='new'||!editingTrade;
    const deviationChanges=!isNew?pendingDeviationChanges():[];
    const p=editingTrade?{...editingTrade}:{...emptyTradeDraft(),id:formDraft?.id||uid(),createdAt:formDraft?.createdAt||new Date().toISOString()};

    p.brokerAccount=$('fBrokerAccount')?.value.trim()||'Nicht zugeordnet';
    p.market=$('fMarket').value.trim()||'Unbenannter Trade';
    p.symbol=$('fSymbol').value.trim()||'CUSTOM';
    p.direction=$('fDirection').value;
    p.positionStatus=$('fPositionStatus').value;
    p.contracts=num($('fContracts').value)||1;
    p.pointValue=num($('fPointValue').value)||1;
    p.entry=num($('fEntry').value);
    p.target=num($('fTarget').value);
    p.stop=num($('fStop').value);
    p.zone=num($('fZone').value);
    p.why=$('fWhy').value;
    p.rule=$('fRule').value;
    p.hkcm=String(formDraft?.hkcm??editingTrade?.hkcm??'');
    p.tv=String(formDraft?.tv??editingTrade?.tv??'');
    p.updatedAt=new Date().toISOString();

    if(isNew){
      p.current='';p.previousPrice=null;p.lastPrice=null;p.liveUpdatedAt=null;p.dataSource=null;
      p.previousDataSource=null;p.liveChange=null;p.liveStatus='pending';p.liveErrorCount=0;p.liveErrorAt=null;p.autoExitArmed=false;
      p.originalPlan=planSnapshot(p);
    }else{
      p.originalPlan=compactOriginalPlan(p.originalPlan,p);
    }

    if(!isNew&&deviationChanges.length){
      const reason=$('deviationReason').value;
      const note=$('deviationNote').value.trim();
      if(!reason){$('saveMsg').textContent='Bitte zuerst den Grund für die Planabweichung auswählen.';$('deviationReason').focus();return}
      if(reason==='Sonstiges'&&!note){$('saveMsg').textContent='Bitte die Planabweichung kurz erläutern.';$('deviationNote').focus();return}
      recordDeviation(p,deviationChanges,reason,note);
      p.deviations=compactDeviationHistory(p.deviations);
    }

    if(!Array.isArray(state.activeTrades))state.activeTrades=[];
    upsertTrade(p);
    if(isNew)selectedTradeId=null;
    $('saveMsg').textContent='Speichere dauerhaft in der Cloud...';

    // Important: do not clear the draft or leave the form before Firestore confirms the write.
    await saveCloud();

    if($('deviationReason'))$('deviationReason').value='';
    if($('deviationNote'))$('deviationNote').value='';
    clearFormDraft();
    if($('hkcmPreview'))$('hkcmPreview').innerHTML=imgHtml('');
    if($('tvPreview'))$('tvPreview').innerHTML=imgHtml('');
    renderAll();
    show('plan');
    cloudMsg('Cloud synchronisiert');

    // Live data refresh is local only; it must not re-save the whole Atlas document.
    if(p.symbol&&p.symbol!=='CUSTOM')setTimeout(()=>fetchMarketDataForTrade(p,{silent:true}).then(()=>renderAll()),500);
  }catch(error){
    console.error('Trade save failed',error);
    state=normalizeState(previousState);
    selectedTradeId=previousSelected;
    renderDesk();renderPlan();renderTrades();renderChallenge();
    if($('saveMsg'))$('saveMsg').textContent='Speichern fehlgeschlagen. Deine Eingaben und Screenshots bleiben im Entwurf erhalten. Bitte erneut versuchen.';
  }finally{
    if(saveBtn){saveBtn.disabled=!!(imageJobs.hkcm||imageJobs.tv);saveBtn.textContent=originalButtonText}
  }
}
async function fetchMarketDataForTrade(p,{silent=false}={}){
  if(!p||!p.symbol||p.symbol==='CUSTOM')return false;
  p.liveStatus='loading';
  p.liveErrorAt=null;
  renderDesk();
  const providers=yahooUrls(p.symbol);
  try{
    const winner=await Promise.any(providers.map(async provider=>{
      const res=await withTimeout(provider.url,7000);
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const quote=parseYahoo(await res.json());
      return{provider,quote};
    }));
    applyLivePrice(p,winner.quote,winner.provider.name);
    p.liveStatus='live';
    p.liveErrorCount=0;
    p.liveErrorAt=null;
    if(!silent&&currentTrade()?.id===p.id)$('liveMsg').textContent=`Live-Kurs aktualisiert · ${winner.provider.name} · ${new Date().toLocaleTimeString('de-DE')}`;
    return true;
  }catch(error){
    console.warn('All market providers failed',p.symbol,error);
    p.liveErrorCount=(Number(p.liveErrorCount)||0)+1;
    p.liveStatus=p.liveUpdatedAt?'live':'pending';
    p.liveErrorAt=new Date().toISOString();
    if(!silent&&currentTrade()?.id===p.id)$('liveMsg').textContent='Live-Daten konnten nicht geladen werden. Atlas versucht es automatisch erneut.';
    return false;
  }finally{
    renderDesk();
  }
}
async function fetchYahoo(){const p=currentTrade();if(!p)return;$('liveMsg').textContent='Live-Kurs wird geladen...';updateGlobalMarketPill();const ok=await fetchMarketDataForTrade(p);setDataPill(ok?'Marktdaten live':'Marktdaten gestört',ok?'ok':'error');renderAll()}
function updateGlobalMarketPill(){
  const trades=(state.activeTrades||[]).filter(t=>t.symbol&&t.symbol!=='CUSTOM');
  if(!trades.length){setDataPill('Keine Live-Märkte','');return}
  const statuses=trades.map(tradeLiveStatus);
  const fresh=statuses.filter(x=>x.key==='live').length;
  const problems=statuses.filter(x=>x.key==='error').length;
  if(problems>0)setDataPill(`${problems} Datenproblem${problems===1?'':'e'}`,'error');
  else if(fresh===trades.length)setDataPill('Marktdaten aktuell','ok');
  else setDataPill('Marktdaten aktiv','warn');
}

async function refreshAllMarketData(){
  if(marketBusy||!user||!cloudReady||document.hidden)return;
  marketBusy=true;
  updateGlobalMarketPill();
  try{
    let ok=0,failed=0;
    const trades=[...(state.activeTrades||[])];
    for(const trade of trades){
      if(!(state.activeTrades||[]).some(t=>t.id===trade.id))continue;
      const success=await fetchMarketDataForTrade(trade,{silent:true});
      success?ok++:failed++;
    }
    renderAll();
    setDataPill(failed&&ok?`${ok} live · ${failed} offen`:failed?'Marktdaten gestört':`${ok} Trade${ok===1?'':'s'} live`,failed?'error':'ok');
  }catch(error){
    console.error('Market refresh failed',error);
    updateGlobalMarketPill();
  }finally{
    marketBusy=false;
  }
}
function startMarketEngine(){if(!cloudReady)return;stopMarketEngine();updateGlobalMarketPill();setTimeout(refreshAllMarketData,1200);marketTimer=setInterval(refreshAllMarketData,MARKET_REFRESH_MS)}
function stopMarketEngine(){if(marketTimer)clearInterval(marketTimer);marketTimer=null;marketBusy=false}
function renderTrades(){const arr=state.trades||[];$('tradeList').innerHTML=arr.map((t,i)=>{const pnl=tradePnlEuro(t);return `<div class="tradeRow"><div class="journalMarketIcon">${marketIconHtml(t,'small')}</div><div><b>${t.date} · ${t.market}</b><br><span class="journalAccountTag">${escapeHtml(t.brokerAccount||'Nicht zugeordnet')}</span><br>${directionLabel(t.direction)} · ${t.closeType||'Abschluss'}${t.planDeviation?' · Planabweichung':''}${(t.deviations||[]).length?' · '+t.deviations.length+' dokumentierte Änderung(en)':''} · ${t.note||''}<br><small>Entry ${fmt(t.entry)} · Exit ${fmt(t.exit)} · ${t.result||0}P · ${t.contracts||1} Kontrakt(e) · ${euroShort(t.pointValue||1)}/P</small></div><div class="${pnl>=0?'plus':'minus'}">${euroShort(pnl)}</div><button data-deltrade="${i}">Löschen</button></div>`}).join('')||'<p>Noch keine beendeten Trades.</p>';document.querySelectorAll('[data-deltrade]').forEach(b=>b.addEventListener('click',()=>{state.trades.splice(Number(b.dataset.deltrade),1);renderTrades();renderChallenge();scheduleSave()}))}
function brokerCloseStatus(p,current){if((p.positionStatus||'active')!=='active')return{mode:'pending',label:'Order geplant',exit:current,deviation:false};const dir=p.direction==='Long'?1:-1;const targetHit=dir===1?current>=num(p.target):current<=num(p.target);const stopHit=dir===1?current<=num(p.stop):current>=num(p.stop);if(targetHit)return{mode:'target',label:'Take-Profit erreicht',exit:num(p.target),deviation:false};if(stopHit)return{mode:'stop',label:'Stop-Loss erreicht',exit:num(p.stop),deviation:false};return{mode:'manual',label:'Trade läuft noch',exit:current,deviation:false}}
function selectedCloseStatus(){const p=currentTrade();if(!p)return{mode:'manual',label:'Kein Trade',exit:0,deviation:false};const current=num(p.current)||num(p.entry);const auto=brokerCloseStatus(p,current);const mode=$('closeMode')?.value||'auto';if(mode==='auto')return auto;if(mode==='target')return{mode:'target',label:'Take-Profit erreicht',exit:num(p.target),deviation:false};if(mode==='stop')return{mode:'stop',label:'Stop-Loss erreicht',exit:num(p.stop),deviation:false};const manualExit=num($('closePrice')?.value);return{mode:'manual',label:'Manuell geschlossen / Planabweichung',exit:Number.isFinite(manualExit)?manualExit:current,deviation:true}}
function closePreview(){const p=currentTrade();if(!p)return{points:0,pnl:0};const status=selectedCloseStatus();const dir=p.direction==='Long'?1:-1;const points=(num(status.exit)-num(p.entry))*dir;const contracts=num(p.contracts)||1;const pointValue=num(p.pointValue)||1;const pnl=Math.round(points*contracts*pointValue);return{...status,points,pnl,contracts,pointValue}}
function renderClosePanel(p,current){if(!$('closeInfo'))return;const auto=brokerCloseStatus(p,current);const mode=$('closeMode')?.value||'auto';if(auto.mode==='pending')$('closeInfo').textContent='Die Order ist noch nicht als aktive Position markiert. Stelle den Status in der Eingabe auf „Position aktiv“, sobald der Einstieg ausgeführt wurde.';else $('closeInfo').textContent=auto.mode==='target'?'Take-Profit wurde erreicht. Atlas übernimmt den Zielkurs automatisch ins Journal.':auto.mode==='stop'?'Stop-Loss wurde erreicht. Atlas übernimmt den Stopkurs automatisch ins Journal.':'Position läuft. Bei manuellem Abbruch bitte Schlusskurs und Grund dokumentieren.';if($('closePrice')){const needsManualPrice=mode==='manual'||(mode==='auto'&&auto.mode==='manual');$('closePrice').classList.toggle('hidden',!needsManualPrice);if(!needsManualPrice)$('closePrice').value=''}const prev=closePreview();$('closeCalc').textContent=auto.mode==='pending'?'Kein Abschluss möglich, solange die Order nur geplant ist.':`Vorschau: ${prev.label} · Exit ${fmt(prev.exit)} · ${pts(Math.round(prev.points))} · ${euroShort(prev.pnl)}`;if($('btnCloseTrade')){$('btnCloseTrade').disabled=auto.mode==='pending'&&mode==='auto';$('btnCloseTrade').textContent=auto.mode==='target'?'Take-Profit ins Journal übernehmen':auto.mode==='stop'?'Stop-Loss ins Journal übernehmen':'Trade gemäß Broker-Logik ins Journal übernehmen'}}
async function closeTrade(){
  const p=currentTrade();
  if(!p)return;

  if((p.positionStatus||'active')!=='active'&&($('closeMode')?.value||'auto')==='auto'){
    $('closeCalc').textContent='Diese Order ist noch nicht aktiv. Bitte zuerst in der Eingabe auf Position aktiv stellen oder manuell schließen.';
    return;
  }

  const prev=closePreview();
  if(prev.mode==='manual'&&!String($('closePrice').value||'').trim()){
    $('closeCalc').textContent='Bitte beim manuellen Ausstieg den tatsächlichen Schlusskurs eintragen.';
    return;
  }
  if(prev.mode==='manual'&&!String($('closeNote').value||'').trim()){
    $('closeCalc').textContent='Bitte beim manuellen Ausstieg kurz begründen, warum vom Plan abgewichen wurde.';
    return;
  }

  const btn=$('btnCloseTrade');
  const originalButtonText=btn?.textContent||'Trade ins Journal übernehmen';
  if(btn){btn.disabled=true;btn.textContent='Wird ins Journal übernommen...'}

  // Snapshot für Rollback, falls die Cloud-Speicherung fehlschlägt.
  const previousState=structuredClone(state);
  const tradeId=p.id;
  const exit=prev.exit;
  const result=Math.round(prev.points);
  const pnl=prev.pnl;
  const closeType=prev.mode==='target'?'Take-Profit':prev.mode==='stop'?'Stop-Loss':'Manuell';
  const note=$('closeNote').value||closeType;

  const journalEntry={
    date:new Date().toLocaleDateString('de-DE'),
    createdAt:new Date().toISOString(),
    brokerAccount:p.brokerAccount||'Nicht zugeordnet',
    market:p.market,
    direction:p.direction,
    result,
    pnl,
    contracts:prev.contracts,
    pointValue:prev.pointValue,
    entry:p.entry,
    target:p.target,
    stop:p.stop,
    exit,
    closeType,
    planDeviation:prev.deviation,
    note,
    symbol:p.symbol,
    sourceTradeId:p.id,
    originalPlan:p.originalPlan||planSnapshot(p),
    deviations:Array.isArray(p.deviations)?p.deviations:[],
    brainState:p.brainState||null
  };

  if(!Array.isArray(state.trades))state.trades=[];
  state.trades.unshift(journalEntry);
  removeActiveTrade(tradeId);
  delete lastLiveById[tradeId];
  renderAll();
  updateGlobalMarketPill();

  try{
    // Sofortige, vollständige Cloud-Speicherung: Journal-Eintrag und Entfernen
    // des aktiven Trades bleiben dadurch ein konsistenter gemeinsamer Zustand.
    await saveCloud();

    if($('closeMode'))$('closeMode').value='auto';
    if($('closePrice'))$('closePrice').value='';
    if($('closeNote'))$('closeNote').value='';
    selectedTradeId=null;
    renderAll();
    show('journal');
    cloudMsg('Cloud synchronisiert');
  }catch(error){
    console.error('Trade journal close failed',error);
    state=normalizeState(previousState);
    selectedTradeId=tradeId;
    renderAll();
    $('closeCalc').textContent='Der Trade konnte nicht dauerhaft ins Journal übernommen werden. Bitte Internetverbindung prüfen und erneut versuchen.';
    if(btn){btn.disabled=false;btn.textContent=originalButtonText}
  }
}
async function deleteActiveTrade(){
  const p=currentTrade();
  if(!p)return;
  const confirmed=window.confirm(`„${p.market}“ wirklich löschen?\n\nDer Trade wird dauerhaft entfernt und NICHT ins Journal eingetragen.`);
  if(!confirmed)return;
  const id=p.id;
  removeActiveTrade(id);
  delete lastLiveById[id];
  renderAll();
  updateGlobalMarketPill();
  try{
    await saveCloud();
    selectedTradeId=null;
    renderAll();
    cloudMsg('Cloud synchronisiert');
  }catch(error){
    console.error('Active trade delete failed',error);
    alert('Der Trade konnte nicht dauerhaft gespeichert werden. Bitte Internetverbindung prüfen und erneut versuchen.');
  }
}

function exportJournal(){const txt=(state.trades||[]).map(t=>`${t.date}; ${t.market}; ${t.direction}; ${t.result||0}P; ${euroShort(tradePnlEuro(t))}; ${t.note||''}`).join('\n');const blob=new Blob([txt],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='atlas-journal.txt';a.click();URL.revokeObjectURL(a.href)}
function saveAccountBase(){state.settings.accountStart=num($('accountStart').value)||0;$('accountMsg').textContent='Kontostand-Basis gespeichert. Challenge wird aus Journal neu berechnet.';renderChallenge();scheduleSave()}
function milestoneDates(done){const trades=[...(state.trades||[])].reverse();let bal=accountStart();const dates={};for(let i=1;i<=done;i++){if(bal>=i*CHALLENGE_BOX_VALUE)dates[i]='Start'}for(const t of trades){bal+=tradePnlEuro(t);for(let i=1;i<=done;i++){if(!dates[i]&&bal>=i*CHALLENGE_BOX_VALUE)dates[i]=t.date||new Date(t.createdAt||Date.now()).toLocaleDateString('de-DE')}}return dates}
function renderChallenge(){const snap=challengeSnapshot();if($('accountStart'))$('accountStart').value=state.settings.accountStart||'';$('accountBalance').textContent=euroShort(snap.balance);$('journalProfit').textContent=euroShort(snap.pnl);$('wealthNow').textContent=snap.done+' / '+CHALLENGE_BOXES;$('wealthPct').textContent=snap.pct+'%';$('wealthOpen').textContent=euroShort(snap.open);$('nextMilestone').textContent=snap.done>=CHALLENGE_BOXES?'Ziel erreicht':euroShort(snap.next);const bar=$('wealthBar');if(bar)bar.style.width=snap.pct+'%';const dates=milestoneDates(snap.done);$('boxes').innerHTML=Array.from({length:CHALLENGE_BOXES},(_,i)=>{const n=i+1, amount=n*CHALLENGE_BOX_VALUE, done=n<=snap.done;return `<div class="box ${done?'done':''}"><b>${n}</b><span>${euroShort(amount)}</span><small>${done?(dates[n]||'erreicht'):''}</small></div>`}).join('')}
function marketSelect(){const val=$('fMarketSelect').value;const m=markets.find(x=>x[0]===val);if(!m)return;if(val!=='CUSTOM'){$('fSymbol').value=m[0];$('fMarket').value=m[2]}}
function clock(){$('clockPill').textContent=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}
function boot(){makeNav();if($('btnSaveWealthTracking'))$('btnSaveWealthTracking').onclick=saveWealthTracking;if($('btnSaveStrategy'))$('btnSaveStrategy').onclick=saveStrategy;if($('btnToggleAccountForm'))$('btnToggleAccountForm').onclick=()=>toggleAccountForm(true);if($('btnCancelAccount'))$('btnCancelAccount').onclick=()=>toggleAccountForm(false);if($('btnAddAccount'))$('btnAddAccount').onclick=addAccount;if($('btnSaveGoal'))$('btnSaveGoal').onclick=saveGoal;if($('goalTarget'))$('goalTarget').addEventListener('input',updateGoalMilestones);if($('goalMilestone'))$('goalMilestone').addEventListener('input',updateGoalMilestones);$('btnLogin').onclick=login;$('btnRegister').onclick=register;$('btnLogout').onclick=()=>atlasFirebase.auth.signOut();$('btnSavePlan').onclick=savePlan;$('btnYahoo').onclick=fetchYahoo;$('btnCloseTrade').onclick=closeTrade;$('btnNewTrade').onclick=startNewTrade;$('btnBackDesk').onclick=()=>{selectedTradeId=null;renderPlan();scrollTo(0,0)};$('btnEditTrade').onclick=editSelectedTrade;if($('btnDeleteActiveTrade'))$('btnDeleteActiveTrade').onclick=deleteActiveTrade;if($('closeMode'))$('closeMode').onchange=()=>renderPlan();if($('closePrice'))$('closePrice').oninput=()=>renderPlan();$('btnExportJournal').onclick=exportJournal;if($('btnSaveAccount'))$('btnSaveAccount').onclick=saveAccountBase;$('fMarketSelect').onchange=()=>{marketSelect();markFormDirty();renderDeviationPanel()};
  ['fBrokerAccount','fMarket','fSymbol','fDirection','fPositionStatus','fContracts','fPointValue','fEntry','fStop','fTarget','fZone','fWhy','fRule'].forEach(id=>{
    const el=$(id);if(!el)return;
    el.addEventListener('input',()=>{markFormDirty();renderDeviationPanel()});
    el.addEventListener('change',()=>{markFormDirty();renderDeviationPanel()});
  });$('hkcmFile').addEventListener('change',e=>handleImage(e,'hkcm'));$('tvFile').addEventListener('change',e=>handleImage(e,'tv'));$('modalClose').onclick=()=>$('imgModal').classList.remove('show');$('imgModal').onclick=e=>{if(e.target.id==='imgModal')$('imgModal').classList.remove('show')};document.addEventListener('click',e=>{if(e.target.classList.contains('zoomable')){$('modalImg').src=e.target.src;$('imgModal').classList.add('show')}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user&&cloudReady)refreshAllMarketData()});clock();setInterval(clock,30000);renderAll()}
boot();
