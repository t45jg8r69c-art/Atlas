const tabs=[['plan','Mein Plan'],['create','Eingabe'],['journal','Journal'],['challenge','Challenge']];
const markets=[
  ['YM=F','Dow Jones Future','Dow Jones Future'],['NQ=F','Nasdaq 100 Future','Nasdaq 100 Future'],['ES=F','S&P 500 Future','S&P 500 Future'],['RTY=F','Russell 2000 Future','Russell 2000 Future'],['FDAX.EX','DAX Future','DAX Future'],['GC=F','Gold Future','Gold Future'],['SI=F','Silber Future','Silber Future'],['HG=F','Kupfer Future','Kupfer Future'],['CL=F','WTI Öl Future','WTI Öl Future'],['BZ=F','Brent Öl Future','Brent Öl Future'],['DX=F','US Dollar Index Future','US Dollar Index Future'],['EURUSD=X','EUR/USD','EUR/USD'],['BTC-USD','Bitcoin','Bitcoin'],['CUSTOM','Benutzerdefiniert','']
];
const CHALLENGE_BOX_VALUE=20000;
const CHALLENGE_BOXES=50;
const CHALLENGE_TARGET=CHALLENGE_BOX_VALUE*CHALLENGE_BOXES;
const MARKET_REFRESH_MS=30000;
const MARKET_TIMEOUT_MS=9000;
const tradeTemplate={market:'Dow Jones Future',symbol:'YM=F',direction:'Long',positionStatus:'active',contracts:1,pointValue:1,entry:52900,target:54045,stop:52380,current:52988,previousPrice:null,lastPrice:null,liveUpdatedAt:null,dataSource:null,entryTriggerSide:null,entryTriggeredAt:null,brainState:'waiting',mentorState:null,originalPlan:null,deviations:[],zone:53500,why:'Laufende blaue Welle (v)\nEinstieg auf relevantem Fib-Niveau der Subwelle (ii)',rule:'Triff keine neue Entscheidung. Überprüfe zuerst deine ursprüngliche Entscheidung.',hkcm:'',tv:'',createdAt:null,updatedAt:null};
const defaultState={
  plan:{...tradeTemplate},
  activeTrades:[],
  trades:[],
  challenge:[],
  settings:{autoYahoo:false,accountStart:0},
  updatedAt:null
};
let state=structuredClone(defaultState), user=null, unsub=null, saving=false, saveTimer=null, selectedTradeId=null, lastLiveById={}, marketTimer=null, marketBusy=false, formDraft=null, formDirty=false, formMode='none';
const $=id=>document.getElementById(id);
function fmt(n){const x=Number(n);return Number.isFinite(x)?x.toLocaleString('de-DE',{maximumFractionDigits:2}):'-'}
function num(v){return Number(String(v??'').replace(',','.'))}
function pts(n){return (n>=0?'+':'')+fmt(n)+'P'}
function dist(a,b){return Math.round(Math.abs(num(a)-num(b)))}
function euroShort(n){return Number(n||0).toLocaleString('de-DE',{maximumFractionDigits:0})+' €'}
function uid(){return 't_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
function tradePnlEuro(t){if(t&&Number.isFinite(Number(t.pnl)))return Number(t.pnl);const r=Number(t?.result)||0;const c=Number(t?.contracts)||1;const pv=Number(t?.pointValue)||1;return r*c*pv}
function journalPnl(){return (state.trades||[]).reduce((sum,t)=>sum+tradePnlEuro(t),0)}
function accountStart(){return Number(state.settings?.accountStart)||0}
function accountBalance(){return accountStart()+journalPnl()}
function challengeSnapshot(){const balance=Math.max(0,accountBalance());const done=Math.min(CHALLENGE_BOXES,Math.floor(balance/CHALLENGE_BOX_VALUE));const pct=Math.min(100,Math.round(balance/CHALLENGE_TARGET*100));const open=Math.max(0,CHALLENGE_TARGET-balance);const next=Math.min(CHALLENGE_TARGET,(done+1)*CHALLENGE_BOX_VALUE);return{balance,done,pct,open,next,pnl:journalPnl()}}
function planSnapshot(p){return{market:p.market,symbol:p.symbol,direction:p.direction,positionStatus:p.positionStatus,contracts:p.contracts,pointValue:p.pointValue,entry:p.entry,stop:p.stop,target:p.target,zone:p.zone,why:p.why,rule:p.rule,hkcm:p.hkcm,tv:p.tv,createdAt:p.createdAt||new Date().toISOString()}}
function normalizedComparable(v){
  if(v===null||v===undefined)return'';
  if(typeof v==='number')return Number(v);
  const asNum=num(v);
  return String(v).trim()!==''&&Number.isFinite(asNum)&&!isNaN(asNum)?asNum:String(v).trim();
}
function detectPlanChanges(original,current){
  if(!original)return[];
  const fields=[
    ['market','Markt'],['symbol','Symbol'],['direction','Richtung'],
    ['positionStatus','Status'],['contracts','Kontrakte'],['pointValue','Punktwert'],
    ['entry','Einstieg'],['stop','Stop-Loss'],['target','Take-Profit'],
    ['zone','Prüfzone'],['why','Begründung'],['rule','Mentor-Regel'],
    ['hkcm','HKCM-Screenshot'],['tv','TradingView-Screenshot']
  ];
  return fields.flatMap(([key,label])=>{
    const before=normalizedComparable(original[key]);
    const after=normalizedComparable(current[key]);
    if(before===after)return[];
    return[{field:key,label,before,after}];
  });
}
function formatDeviationValue(change,value){
  if(['entry','stop','target','zone','contracts','pointValue'].includes(change.field))return fmt(value);
  if(['hkcm','tv'].includes(change.field))return value?'Vorhanden':'Nicht vorhanden';
  return String(value||'–');
}
function pendingDeviationChanges(){
  const editing=currentTrade();
  if(!editing||!editing.originalPlan)return[];
  const draft={
    ...editing,
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
function archiveAutomaticTrade(p,mode){const exit=mode==='target'?num(p.target):num(p.stop);const dir=p.direction==='Long'?1:-1;const points=(exit-num(p.entry))*dir;const contracts=num(p.contracts)||1;const pointValue=num(p.pointValue)||1;const pnl=Math.round(points*contracts*pointValue);state.trades.unshift({date:new Date().toLocaleDateString('de-DE'),createdAt:new Date().toISOString(),market:p.market,direction:p.direction,result:Math.round(points),pnl,contracts,pointValue,entry:p.entry,target:p.target,stop:p.stop,exit,closeType:mode==='target'?'Take-Profit':'Stop-Loss',planDeviation:false,note:'Automatisch durch Live-Kurs erkannt',symbol:p.symbol,sourceTradeId:p.id,brainState:mode==='target'?'target_hit':'stop_hit',originalPlan:p.originalPlan||planSnapshot(p),deviations:Array.isArray(p.deviations)?p.deviations:[]});removeActiveTrade(p.id)}
function applyLivePrice(p,quote,source){const previous=Number.isFinite(num(p.current))?num(p.current):null;p.previousPrice=previous;p.lastPrice=quote.price;p.current=quote.price;p.liveUpdatedAt=new Date().toISOString();p.dataSource=source;p.liveChange=quote.change;lastLiveById[p.id]={price:quote.price,change:quote.change,source,at:p.liveUpdatedAt};if((p.positionStatus||'active')!=='active'&&entryReached(p,quote.price,previous)){p.positionStatus='active';p.entryTriggeredAt=new Date().toISOString()}const close=brokerCloseStatus(p,quote.price);if(close.mode==='target'||close.mode==='stop'){archiveAutomaticTrade(p,close.mode);return'closed'}const nextState=tradeState(p,quote.price);p.brainState=nextState.key;mentorFor(p,nextState);p.updatedAt=new Date().toISOString();
  if(isNew||!p.originalPlan)p.originalPlan=planSnapshot(p);
  const initialState=tradeState(p,num(p.current)||num(p.entry));
  p.brainState=initialState.key;
  mentorFor(p,initialState);upsertTrade(p);return'updated'}
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

function normalizeState(data={}){let s={...structuredClone(defaultState),...data,settings:{...defaultState.settings,...(data.settings||{})}};if(!Array.isArray(s.activeTrades))s.activeTrades=[];if(!Array.isArray(s.trades))s.trades=[];if(!Array.isArray(s.challenge))s.challenge=[];if(s.activeTrades.length===0 && data.plan){const migrated={...tradeTemplate,...data.plan,id:uid(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};migrated.originalPlan=migrated.originalPlan||planSnapshot(migrated);s.activeTrades=[migrated];s.plan=migrated}else if(s.activeTrades.length>0){s.activeTrades=s.activeTrades.map(t=>{const n={...tradeTemplate,...t,id:t.id||uid()};n.originalPlan=n.originalPlan||planSnapshot(n);if(!Array.isArray(n.deviations))n.deviations=[];return n});s.plan=s.activeTrades[0]}return s}
function currentTrade(){return (state.activeTrades||[]).find(t=>t.id===selectedTradeId)||null}
function isCreateScreenActive(){return $('create')?.classList.contains('active')}
function collectFormDraft(){
  const active=formMode==='edit'?currentTrade():null;
  const base=formDraft||active||(formMode==='new'?emptyTradeDraft():{});
  return{
    ...base,
    id:base.id||uid(),
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
  clearFileInputs();
}
function safeRenderAll(){
  renderDesk();
  if(!(isCreateScreenActive()&&formDirty))loadForm();
  renderPlan();
  renderTrades();
  renderChallenge();
}

function upsertTrade(trade){const arr=state.activeTrades||[];const i=arr.findIndex(t=>t.id===trade.id);if(i>=0)arr[i]=trade;else arr.unshift(trade);state.activeTrades=arr;state.plan=trade;selectedTradeId=trade.id}
function removeActiveTrade(id){state.activeTrades=(state.activeTrades||[]).filter(t=>t.id!==id);if(selectedTradeId===id)selectedTradeId=null;state.plan=state.activeTrades[0]||{...tradeTemplate};}
function makeNav(){const html=tabs.map((t,i)=>`<button data-tab="${t[0]}" class="${i?'':'active'}">${t[1]}</button>`).join('');$('nav').innerHTML=html;$('bottom').innerHTML=html;document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.tab)))}
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  if(id==='create'){if(!formDraft){formMode='new';formDraft=emptyTradeDraft();formDirty=false;clearFileInputs()}loadForm(formDraft);}
  scrollTo(0,0);
}
function cloudMsg(t){$('cloudState').textContent=t;$('syncPill').textContent=t}
function stateRef(){return atlasFirebase.db.collection('users').doc(user.uid).collection('atlas').doc('state')}
function scheduleSave(){if(!user||saving)return;cloudMsg('Speichert...');clearTimeout(saveTimer);saveTimer=setTimeout(saveCloud,450)}
async function saveCloud(){if(!user)return;try{saving=true;state.updatedAt=new Date().toISOString();await stateRef().set(state,{merge:true});cloudMsg('Cloud synchronisiert')}catch(e){cloudMsg('Cloud Fehler');console.error(e)}finally{saving=false}}
function startCloud(uidVal){if(unsub)unsub();unsub=stateRef().onSnapshot(async snap=>{if(!snap.exists){state=normalizeState(state);await stateRef().set(state);return}const data=snap.data();state=normalizeState(data);if(selectedTradeId && !(state.activeTrades||[]).some(t=>t.id===selectedTradeId))selectedTradeId=null;renderAll();cloudMsg('Cloud synchronisiert')},err=>{console.error(err);cloudMsg('Cloud Fehler')})}
async function login(){try{await atlasFirebase.auth.signInWithEmailAndPassword($('authEmail').value.trim(),$('authPassword').value);$('authMsg').textContent=''}catch(e){$('authMsg').textContent=authError(e)}}
async function register(){try{await atlasFirebase.auth.createUserWithEmailAndPassword($('authEmail').value.trim(),$('authPassword').value);$('authMsg').textContent=''}catch(e){$('authMsg').textContent=authError(e)}}
function authError(e){console.error(e);if(e.code==='auth/email-already-in-use')return 'Diese E-Mail ist bereits registriert. Bitte anmelden.';if(e.code==='auth/invalid-credential'||e.code==='auth/wrong-password')return 'Anmeldung fehlgeschlagen. E-Mail oder Passwort prüfen.';if(e.code==='auth/weak-password')return 'Passwort muss mindestens 6 Zeichen haben.';return 'Fehler: '+(e.message||e.code)}
atlasFirebase.auth.onAuthStateChanged(u=>{user=u;if(u){$('authScreen').classList.add('hidden');$('app').classList.remove('hidden');cloudMsg('Cloud verbunden');startCloud(u.uid);startMarketEngine()}else{$('authScreen').classList.remove('hidden');$('app').classList.add('hidden');if(unsub)unsub();stopMarketEngine()}});
function renderAll(){safeRenderAll()}
function blankTrade(){return {...tradeTemplate,id:uid(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
function emptyTradeDraft(){
  const now=new Date().toISOString();
  return{
    ...tradeTemplate,
    id:uid(),
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
async function selectTrade(id){selectedTradeId=id;renderPlan();scrollTo(0,0);const p=currentTrade();if(!p||!p.symbol||p.symbol==='CUSTOM')return;if($('liveMsg'))$('liveMsg').textContent='Live-Kurs wird für diesen Trade geladen...';const ok=await fetchMarketDataForTrade(p);renderAll();if(ok){scheduleSave();setDataPill('Marktdaten live','ok')}else setDataPill('Marktdaten gestört','error')}
function renderDesk(){const arr=state.activeTrades||[];$('activeTradeList').innerHTML=arr.map(t=>tradeDeskCard(t)).join('')||`<div class="emptyDesk"><h2>Noch kein aktiver Trade</h2><p>Lege deinen ersten Trade an. Atlas zeigt dir danach nur eine ruhige Übersicht und öffnet Details erst auf Klick.</p></div>`;document.querySelectorAll('[data-selecttrade]').forEach(b=>b.addEventListener('click',()=>selectTrade(b.dataset.selecttrade)));if($('tradeDetail'))$('tradeDetail').classList.toggle('hidden',!currentTrade())}
function tradeDeskCard(t){const current=num(t.current)||num(t.entry);const s=tradeState(t,current);const close=brokerCloseStatus(t,current);const lampClass=close.mode==='stop'||s.key==='stop_approaching'?'red':(close.mode==='target'||s.key==='target_approaching'||s.key==='entry_approaching'?'yellow':'');const side=t.direction==='Long'?'Kaufen':'Verkaufen';const focus=deskFocus(t,current,s);return `<button class="activeTradeCard" data-state="${s.key}" data-selecttrade="${t.id}"><div class="miniLamp ${lampClass}"></div><div><b>${t.market}</b><span>${side} · ${fmt(t.contracts)} Kontrakt(e)</span></div><div class="deskMeta"><strong>${s.phase}</strong><span>${focus}</span></div></button>`}
function deskFocus(p,current,s){if((p.positionStatus||'active')!=='active')return `${fmt(dist(current,p.entry))}P bis Einstieg`;if(s.key==='stop_hit')return 'Stop erreicht';if(s.key==='target_hit')return 'TP erreicht';if(s.key==='stop_approaching')return `${fmt(dist(current,p.stop))}P bis SL`;return `${fmt(dist(p.target,current))}P bis TP`}
function loadForm(source=null){const p=source||((isCreateScreenActive()&&formDraft)?formDraft:(currentTrade()||state.plan||blankTrade()));$('formTitle').textContent=formMode==='edit'?'Trade bearbeiten':'Trade anlegen';$('btnSavePlan').textContent=formMode==='edit'?'Trade aktualisieren':'Neuen Trade speichern';$('fMarketSelect').innerHTML=markets.map(m=>`<option value="${m[0]}">${m[1]}</option>`).join('');$('fMarketSelect').value=markets.some(m=>m[0]===p.symbol)?p.symbol:'CUSTOM';$('fMarket').value=p.market;$('fSymbol').value=p.symbol;$('fDirection').value=p.direction;$('fPositionStatus').value=p.positionStatus||'active';$('fContracts').value=p.contracts;$('fPointValue').value=p.pointValue;$('fEntry').value=p.entry;$('fTarget').value=p.target;$('fStop').value=p.stop;$('fZone').value=p.zone;$('fWhy').value=p.why;$('fRule').value=p.rule;$('hkcmPreview').innerHTML=imgHtml(p.hkcm);$('tvPreview').innerHTML=imgHtml(p.tv);if($('accountStart'))$('accountStart').value=state.settings.accountStart||'';setTimeout(renderDeviationPanel,0)}
function renderPlan(){renderDesk();const p=currentTrade();if(!p){$('tradeDetail').classList.add('hidden');return}$('tradeDetail').classList.remove('hidden');const current=num(p.current)||num(p.entry);$('marketTitle').textContent=`${p.market} · ${p.direction==='Long'?'Kaufen / Long':'Verkaufen / Short'}`;$('directionLine').textContent=`${p.contracts} Kontrakt(e) · ${p.symbol}`;$('sStop').textContent=fmt(p.stop);$('sEntry').textContent=fmt(p.entry);$('sTarget').textContent=fmt(p.target);$('whyList').innerHTML=String(p.why||'').split('\n').filter(Boolean).map(x=>`<div class="pill">✓ ${x}</div>`).join('')||'<p>Keine Analyse hinterlegt.</p>';$('bar').style.width=progressPct(p,current)+'%';$('hkcmView').innerHTML=imgHtml(p.hkcm);$('tvView').innerHTML=imgHtml(p.tv);const k=tradeState(p,current);const mentor=mentorFor(p,k);renderBrain(p,current,k,mentor);renderBrokerCard(p,current,k);renderClosePanel(p,current);renderDeviationInfo(p);const last=lastLiveById[p.id]||(p.liveUpdatedAt?{price:current,change:Number(p.liveChange),source:p.dataSource,at:p.liveUpdatedAt}:null);if(last){$('livePrice').textContent=fmt(last.price);$('liveChange').textContent=Number.isFinite(Number(last.change))?((Number(last.change)>=0?'+':'')+fmt(last.change)+'%'):'-';if($('liveMsg'))$('liveMsg').textContent=`Live-Kurs aktualisiert${last.source?' · '+last.source:''}${last.at?' · '+new Date(last.at).toLocaleTimeString('de-DE'):''}`}else{$('livePrice').textContent=fmt(current);$('liveChange').textContent='-';if($('liveMsg'))$('liveMsg').textContent='Live-Daten werden automatisch geladen.'}}
function renderBrokerCard(p,current,k){const side=p.direction==='Long'?'Kaufen':'Verkaufen';$('brokerSide').textContent=side;$('brokerSide').classList.toggle('sell',p.direction==='Short');$('brokerContracts').textContent=fmt(p.contracts);$('brokerEntry').textContent=fmt(p.entry);$('brokerCurrent').textContent=fmt(current);$('brokerStop').textContent=fmt(p.stop);$('brokerTarget').textContent=fmt(p.target);$('brokerPhase').textContent=k.phase;$('brokerRelevantDistance').textContent=k.headline;$('brokerRelevantText').textContent=k.text}
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
  const max=1100;
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
  return canvas.toDataURL('image/jpeg',.72);
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

  try{
    if($('saveMsg'))$('saveMsg').textContent='Screenshot wird eingelesen...';

    // Immediate local preview confirms that the file selection worked.
    const immediate=await readFileDataUrl(file);
    if(preview)preview.innerHTML=imgHtml(immediate);

    const image=await compressImage(file);

    if(!formDraft){
      formDraft=formMode==='edit'&&currentTrade()
        ? structuredClone(currentTrade())
        : emptyTradeDraft();
    }

    // Preserve all currently typed form values and only replace this screenshot.
    const currentDraft=collectFormDraft();
    formDraft={...currentDraft,[type]:image};
    formDirty=true;

    if(preview)preview.innerHTML=imgHtml(image);
    if($('saveMsg'))$('saveMsg').textContent='Screenshot im Entwurf gespeichert. Bitte den Trade speichern.';

    renderDeviationPanel();
  }catch(error){
    console.error('Screenshot upload failed',error);
    if(preview)preview.innerHTML='<div class="emptyShot">Screenshot konnte nicht geladen werden.</div>';
    if($('saveMsg'))$('saveMsg').textContent='Screenshot konnte nicht verarbeitet werden. Bitte JPG oder PNG verwenden oder das Bild vorher verkleinern.';
  }finally{
    if(input)input.value='';
  }
}

async function savePlan(){
  const editingTrade=formMode==='edit'?(currentTrade()||state.activeTrades.find(t=>t.id===formDraft?.id)):null;
  const isNew=formMode==='new'||!editingTrade;
  const deviationChanges=!isNew?pendingDeviationChanges():[];
  const p=editingTrade?{...editingTrade}:{...emptyTradeDraft(),id:formDraft?.id||uid(),createdAt:formDraft?.createdAt||new Date().toISOString()};

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
  p.hkcm=formDraft&&typeof formDraft.hkcm==='string'?formDraft.hkcm:'';
  p.tv=formDraft&&typeof formDraft.tv==='string'?formDraft.tv:'';
  p.updatedAt=new Date().toISOString();

  if(!isNew&&deviationChanges.length){
    const reason=$('deviationReason').value;
    const note=$('deviationNote').value.trim();
    if(!reason){
      $('saveMsg').textContent='Bitte zuerst den Grund für die Planabweichung auswählen.';
      $('deviationReason').focus();
      return;
    }
    if(reason==='Sonstiges'&&!note){
      $('saveMsg').textContent='Bitte die Planabweichung kurz erläutern.';
      $('deviationNote').focus();
      return;
    }
    recordDeviation(p,deviationChanges,reason,note);
  }
  if(!Array.isArray(state.activeTrades)) state.activeTrades=[];
  upsertTrade(p);
  $('saveMsg').textContent=isNew?'Neuer Trade wird im Trading Desk gespeichert...':'Trade wird aktualisiert...';

  // Neue Trades sollen nach dem Speichern als ruhige Karte im Trading Desk erscheinen.
  // Details öffnen sich erst, wenn der Trade angeklickt wird.
  if(isNew) selectedTradeId=null;

  if($('deviationReason'))$('deviationReason').value='';
  if($('deviationNote'))$('deviationNote').value='';
  clearFormDraft();
  clearFileInputs();
  if($('hkcmPreview'))$('hkcmPreview').innerHTML=imgHtml('');
  if($('tvPreview'))$('tvPreview').innerHTML=imgHtml('');
  renderAll();
  show('plan');

  // Sofort speichern, damit PC und iPhone direkt denselben Trading Desk sehen.
  await saveCloud();

  if(p.symbol && p.symbol!=='CUSTOM'){
    const oldSelected=selectedTradeId;
    selectedTradeId=p.id;
    setTimeout(async()=>{await fetchYahoo(); selectedTradeId=oldSelected; renderAll();},500);
  }
}
async function fetchMarketDataForTrade(p,{silent=false}={}){if(!p||!p.symbol||p.symbol==='CUSTOM')return false;for(const provider of yahooUrls(p.symbol)){try{const res=await withTimeout(provider.url);if(!res.ok)throw new Error(`HTTP ${res.status}`);const quote=parseYahoo(await res.json());applyLivePrice(p,quote,provider.name);if(!silent&&currentTrade()?.id===p.id)$('liveMsg').textContent=`Live-Kurs aktualisiert · ${provider.name} · ${new Date().toLocaleTimeString('de-DE')}`;return true}catch(e){console.warn('Market provider failed',provider.name,e.message)}}if(!silent&&currentTrade()?.id===p.id)$('liveMsg').textContent='Live-Daten konnten nicht geladen werden. Atlas versucht es automatisch erneut.';return false}
async function fetchYahoo(){const p=currentTrade();if(!p)return;$('liveMsg').textContent='Live-Kurs wird geladen...';setDataPill('Marktdaten laden','warn');const ok=await fetchMarketDataForTrade(p);setDataPill(ok?'Marktdaten live':'Marktdaten gestört',ok?'ok':'error');renderAll();if(ok)scheduleSave()}
async function refreshAllMarketData(){if(marketBusy||!user||document.hidden)return;marketBusy=true;setDataPill('Marktdaten laden','warn');let ok=0,failed=0;const trades=[...(state.activeTrades||[])];for(const trade of trades){if(!(state.activeTrades||[]).some(t=>t.id===trade.id))continue;const success=await fetchMarketDataForTrade(trade,{silent:true});success?ok++:failed++}renderAll();if(ok)scheduleSave();setDataPill(failed&&ok?`${ok} live · ${failed} offen`:failed?'Marktdaten gestört':`${ok} Trade${ok===1?'':'s'} live`,failed?'error':'ok');marketBusy=false}
function startMarketEngine(){stopMarketEngine();setTimeout(refreshAllMarketData,1200);marketTimer=setInterval(refreshAllMarketData,MARKET_REFRESH_MS)}
function stopMarketEngine(){if(marketTimer)clearInterval(marketTimer);marketTimer=null;marketBusy=false}
function renderTrades(){const arr=state.trades||[];$('tradeList').innerHTML=arr.map((t,i)=>{const pnl=tradePnlEuro(t);return `<div class="tradeRow"><div><b>${t.date} · ${t.market}</b><br>${t.direction} · ${t.closeType||'Abschluss'}${t.planDeviation?' · Planabweichung':''}${(t.deviations||[]).length?' · '+t.deviations.length+' dokumentierte Änderung(en)':''} · ${t.note||''}<br><small>Entry ${fmt(t.entry)} · Exit ${fmt(t.exit)} · ${t.result||0}P · ${t.contracts||1} Kontrakt(e) · ${euroShort(t.pointValue||1)}/P</small></div><div class="${pnl>=0?'plus':'minus'}">${euroShort(pnl)}</div><button data-deltrade="${i}">Löschen</button></div>`}).join('')||'<p>Noch keine beendeten Trades.</p>';document.querySelectorAll('[data-deltrade]').forEach(b=>b.addEventListener('click',()=>{state.trades.splice(Number(b.dataset.deltrade),1);renderTrades();renderChallenge();scheduleSave()}))}
function brokerCloseStatus(p,current){if((p.positionStatus||'active')!=='active')return{mode:'pending',label:'Order geplant',exit:current,deviation:false};const dir=p.direction==='Long'?1:-1;const targetHit=dir===1?current>=num(p.target):current<=num(p.target);const stopHit=dir===1?current<=num(p.stop):current>=num(p.stop);if(targetHit)return{mode:'target',label:'Take-Profit erreicht',exit:num(p.target),deviation:false};if(stopHit)return{mode:'stop',label:'Stop-Loss erreicht',exit:num(p.stop),deviation:false};return{mode:'manual',label:'Trade läuft noch',exit:current,deviation:false}}
function selectedCloseStatus(){const p=currentTrade();if(!p)return{mode:'manual',label:'Kein Trade',exit:0,deviation:false};const current=num(p.current)||num(p.entry);const auto=brokerCloseStatus(p,current);const mode=$('closeMode')?.value||'auto';if(mode==='auto')return auto;if(mode==='target')return{mode:'target',label:'Take-Profit erreicht',exit:num(p.target),deviation:false};if(mode==='stop')return{mode:'stop',label:'Stop-Loss erreicht',exit:num(p.stop),deviation:false};const manualExit=num($('closePrice')?.value);return{mode:'manual',label:'Manuell geschlossen / Planabweichung',exit:Number.isFinite(manualExit)?manualExit:current,deviation:true}}
function closePreview(){const p=currentTrade();if(!p)return{points:0,pnl:0};const status=selectedCloseStatus();const dir=p.direction==='Long'?1:-1;const points=(num(status.exit)-num(p.entry))*dir;const contracts=num(p.contracts)||1;const pointValue=num(p.pointValue)||1;const pnl=Math.round(points*contracts*pointValue);return{...status,points,pnl,contracts,pointValue}}
function renderClosePanel(p,current){if(!$('closeInfo'))return;const auto=brokerCloseStatus(p,current);const mode=$('closeMode')?.value||'auto';if(auto.mode==='pending')$('closeInfo').textContent='Die Order ist noch nicht als aktive Position markiert. Stelle den Status in der Eingabe auf „Position aktiv“, sobald der Einstieg ausgeführt wurde.';else $('closeInfo').textContent=auto.mode==='target'?'Take-Profit wurde erreicht. Atlas übernimmt den Zielkurs automatisch ins Journal.':auto.mode==='stop'?'Stop-Loss wurde erreicht. Atlas übernimmt den Stopkurs automatisch ins Journal.':'Position läuft. Bei manuellem Abbruch bitte Schlusskurs und Grund dokumentieren.';if($('closePrice')){const needsManualPrice=mode==='manual'||(mode==='auto'&&auto.mode==='manual');$('closePrice').classList.toggle('hidden',!needsManualPrice);if(!needsManualPrice)$('closePrice').value=''}const prev=closePreview();$('closeCalc').textContent=auto.mode==='pending'?'Kein Abschluss möglich, solange die Order nur geplant ist.':`Vorschau: ${prev.label} · Exit ${fmt(prev.exit)} · ${pts(Math.round(prev.points))} · ${euroShort(prev.pnl)}`;if($('btnCloseTrade')){$('btnCloseTrade').disabled=auto.mode==='pending'&&mode==='auto';$('btnCloseTrade').textContent=auto.mode==='target'?'Take-Profit ins Journal übernehmen':auto.mode==='stop'?'Stop-Loss ins Journal übernehmen':'Trade gemäß Broker-Logik ins Journal übernehmen'}}
function closeTrade(){const p=currentTrade();if(!p)return;if((p.positionStatus||'active')!=='active'&&($('closeMode')?.value||'auto')==='auto'){$('closeCalc').textContent='Diese Order ist noch nicht aktiv. Bitte zuerst in der Eingabe auf Position aktiv stellen oder manuell schließen.';return}const prev=closePreview();if(prev.mode==='manual'&&!String($('closePrice').value||'').trim()){$('closeCalc').textContent='Bitte beim manuellen Ausstieg den tatsächlichen Schlusskurs eintragen.';return}if(prev.mode==='manual'&&!String($('closeNote').value||'').trim()){$('closeCalc').textContent='Bitte beim manuellen Ausstieg kurz begründen, warum vom Plan abgewichen wurde.';return}const exit=prev.exit;const result=Math.round(prev.points);const pnl=prev.pnl;const closeType=prev.mode==='target'?'Take-Profit':prev.mode==='stop'?'Stop-Loss':'Manuell';const note=$('closeNote').value||closeType;state.trades.unshift({date:new Date().toLocaleDateString('de-DE'),createdAt:new Date().toISOString(),market:p.market,direction:p.direction,result,pnl,contracts:prev.contracts,pointValue:prev.pointValue,entry:p.entry,target:p.target,stop:p.stop,exit,closeType,planDeviation:prev.deviation,note,symbol:p.symbol,sourceTradeId:p.id});removeActiveTrade(p.id);if($('closeMode'))$('closeMode').value='auto';if($('closePrice'))$('closePrice').value='';$('closeNote').value='';renderAll();scheduleSave();show('journal')}
function exportJournal(){const txt=(state.trades||[]).map(t=>`${t.date}; ${t.market}; ${t.direction}; ${t.result||0}P; ${euroShort(tradePnlEuro(t))}; ${t.note||''}`).join('\n');const blob=new Blob([txt],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='atlas-journal.txt';a.click();URL.revokeObjectURL(a.href)}
function saveAccountBase(){state.settings.accountStart=num($('accountStart').value)||0;$('accountMsg').textContent='Kontostand-Basis gespeichert. Challenge wird aus Journal neu berechnet.';renderChallenge();scheduleSave()}
function milestoneDates(done){const trades=[...(state.trades||[])].reverse();let bal=accountStart();const dates={};for(let i=1;i<=done;i++){if(bal>=i*CHALLENGE_BOX_VALUE)dates[i]='Start'}for(const t of trades){bal+=tradePnlEuro(t);for(let i=1;i<=done;i++){if(!dates[i]&&bal>=i*CHALLENGE_BOX_VALUE)dates[i]=t.date||new Date(t.createdAt||Date.now()).toLocaleDateString('de-DE')}}return dates}
function renderChallenge(){const snap=challengeSnapshot();if($('accountStart'))$('accountStart').value=state.settings.accountStart||'';$('accountBalance').textContent=euroShort(snap.balance);$('journalProfit').textContent=euroShort(snap.pnl);$('wealthNow').textContent=snap.done+' / '+CHALLENGE_BOXES;$('wealthPct').textContent=snap.pct+'%';$('wealthOpen').textContent=euroShort(snap.open);$('nextMilestone').textContent=snap.done>=CHALLENGE_BOXES?'Ziel erreicht':euroShort(snap.next);const bar=$('wealthBar');if(bar)bar.style.width=snap.pct+'%';const dates=milestoneDates(snap.done);$('boxes').innerHTML=Array.from({length:CHALLENGE_BOXES},(_,i)=>{const n=i+1, amount=n*CHALLENGE_BOX_VALUE, done=n<=snap.done;return `<div class="box ${done?'done':''}"><b>${n}</b><span>${euroShort(amount)}</span><small>${done?(dates[n]||'erreicht'):''}</small></div>`}).join('')}
function marketSelect(){const val=$('fMarketSelect').value;const m=markets.find(x=>x[0]===val);if(!m)return;if(val!=='CUSTOM'){$('fSymbol').value=m[0];$('fMarket').value=m[2]}}
function clock(){$('clockPill').textContent=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}
function boot(){makeNav();$('btnLogin').onclick=login;$('btnRegister').onclick=register;$('btnLogout').onclick=()=>atlasFirebase.auth.signOut();$('btnSavePlan').onclick=savePlan;$('btnYahoo').onclick=fetchYahoo;$('btnCloseTrade').onclick=closeTrade;$('btnNewTrade').onclick=startNewTrade;$('btnBackDesk').onclick=()=>{selectedTradeId=null;renderPlan();scrollTo(0,0)};$('btnEditTrade').onclick=editSelectedTrade;if($('closeMode'))$('closeMode').onchange=()=>renderPlan();if($('closePrice'))$('closePrice').oninput=()=>renderPlan();$('btnExportJournal').onclick=exportJournal;if($('btnSaveAccount'))$('btnSaveAccount').onclick=saveAccountBase;$('fMarketSelect').onchange=()=>{marketSelect();markFormDirty();renderDeviationPanel()};
  ['fMarket','fSymbol','fDirection','fPositionStatus','fContracts','fPointValue','fEntry','fStop','fTarget','fZone','fWhy','fRule'].forEach(id=>{
    const el=$(id);if(!el)return;
    el.addEventListener('input',()=>{markFormDirty();renderDeviationPanel()});
    el.addEventListener('change',()=>{markFormDirty();renderDeviationPanel()});
  });$('hkcmFile').addEventListener('change',e=>handleImage(e,'hkcm'));$('tvFile').addEventListener('change',e=>handleImage(e,'tv'));$('modalClose').onclick=()=>$('imgModal').classList.remove('show');$('imgModal').onclick=e=>{if(e.target.id==='imgModal')$('imgModal').classList.remove('show')};document.addEventListener('click',e=>{if(e.target.classList.contains('zoomable')){$('modalImg').src=e.target.src;$('imgModal').classList.add('show')}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)refreshAllMarketData()});clock();setInterval(clock,30000);renderAll()}
boot();
