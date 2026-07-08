const tabs=[['plan','Mein Plan'],['create','Eingabe'],['journal','Journal'],['challenge','Challenge']];
const $=id=>document.getElementById(id);
const store={get:(k,f)=>JSON.parse(localStorage.getItem(k)||JSON.stringify(f)),set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
let plan=store.get('atlasPlan',{market:'Dow Jones',symbol:'^DJI',direction:'Long',contracts:'2 Kontrakte',entry:43180,target:45000,stop:42180,current:44270,zone:44420,why:'Welle IV abgeschlossen\nErwartung Welle V\nImpulsstruktur intakt\nInvalidierung unter 42.180\nZielbereich 45.000',rule:'Keine neue Entscheidung ohne objektive Strukturänderung.',hkcm:'',tv:''});
let trades=store.get('atlasTrades',[]);
let challenge=store.get('atlasChallenge',[]);
function makeNav(){const html=tabs.map((t,i)=>`<button onclick="show('${t[0]}')" class="${i?'':'active'}">${t[1]}</button>`).join('');$('nav').innerHTML=html;$('bottom').innerHTML=html}
function show(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$(id).classList.add('active');document.querySelectorAll('.nav button,.bottom button').forEach(b=>b.classList.remove('active'));document.querySelectorAll(`button[onclick="show('${id}')"]`).forEach(b=>b.classList.add('active'));scrollTo(0,0)}
function fmt(n){return Number(n||0).toLocaleString('de-DE')}function pts(n){return(n>0?'+':'')+fmt(n)+'P'}function dist(a,b){return Math.round(Math.abs(Number(a)-Number(b)))}
function imgHtml(src){return src?`<img src="${src}" onclick="openImg('${src}')">`:`<div class="emptyShot">Noch kein Screenshot<br>über Eingabe hinzufügen</div>`}
function openImg(src){$('modalImg').src=src;$('imgModal').classList.add('show')}function closeImg(){$('imgModal').classList.remove('show')}
function loadForm(){['Market','Symbol','Contracts','Entry','Target','Stop','Current','Zone','Why','Rule'].forEach(x=>{$('f'+x).value=plan[x.toLowerCase()]||''});$('fDirection').value=plan.direction;$('hkcmPreview').innerHTML=imgHtml(plan.hkcm);$('tvPreview').innerHTML=imgHtml(plan.tv)}

function isLong(){return (plan.direction||'Long').toLowerCase()==='long'}
function signedProgress(){
  const stop=Number(plan.stop), target=Number(plan.target), current=Number(plan.current);
  const range=Math.abs(target-stop)||1;
  return isLong()?((current-stop)/range*100):((stop-current)/range*100);
}
function zoneReached(){
  const c=Number(plan.current), z=Number(plan.zone);
  return isLong()?c>=z:c<=z;
}
function invalidated(){
  const c=Number(plan.current), s=Number(plan.stop);
  return isLong()?c<=s:c>=s;
}
function targetReached(){
  const c=Number(plan.current), t=Number(plan.target);
  return isLong()?c>=t:c<=t;
}
function getCoach(){
  const c=Number(plan.current), e=Number(plan.entry), t=Number(plan.target), st=Number(plan.stop), z=Number(plan.zone);
  const toEntry=dist(c,e), toTarget=dist(t,c), toStop=dist(c,st), toZone=dist(z,c);
  const checklist=[];
  let phase='Plan läuft', signal='Nicht handeln', color='green', text='Dein Plan ist aktiv. Atlas sieht aktuell keinen Grund für eine neue Entscheidung.';
  if(invalidated()){
    phase='Invalidierung erreicht'; signal='Trade beenden / Plan neu prüfen'; color='red';
    text='Der Kurs hat den Stop-/Invalidierungsbereich erreicht. Jetzt nicht hoffen, sondern Regel ausführen.';
    checklist.push(['danger','Stop wurde erreicht oder überschritten. Keine emotionale Verlängerung.']);
  }else if(targetReached()){
    phase='Zielzone erreicht'; signal='Gewinn sichern nach Plan'; color='gold';
    text='Die Zielzone wurde erreicht. Jetzt nicht gierig werden. Abschluss, Teilgewinn oder Trailing nur nach vorheriger Regel.';
    checklist.push(['ok','Ziel wurde erreicht. Dokumentiere den Trade sauber im Journal.']);
  }else if(zoneReached()){
    phase='Prüfzone erreicht'; signal='Erst Analyse prüfen'; color='gold';
    text='Du bist in der Entscheidungszone. Keine spontane Reaktion. Prüfe HKCM-Screenshot, TradingView-Bild und ursprüngliche Warum-Liste.';
    checklist.push(['warn','Prüfzone aktiv: Nur handeln, wenn sich die Struktur objektiv verändert hat.']);
  }else if(toEntry<=50){
    phase='Nähe Einstieg'; signal='Nicht hinterherlaufen'; color='gold';
    text='Der Markt ist nahe am Einstieg. Warte auf deinen Bereich. Kein FOMO-Einstieg außerhalb des Plans.';
    checklist.push(['warn',`Nur noch ${fmt(toEntry)} Punkte bis Einstieg. Limit/Setup respektieren.`]);
  }else if(toStop<toTarget*0.35){
    phase='Druckphase'; signal='Ruhig bleiben'; color='gold';
    text='Der Kurs ist näher am Stop als am Ziel. Jetzt zählt Disziplin: Keine Panik, aber auch keine Regel brechen.';
    checklist.push(['warn',`Nur ${fmt(toStop)} Punkte bis Stop. Risiko bewusst akzeptieren oder Plan beenden.`]);
  }
  checklist.push(['ok',`Punkte bis Ziel: ${fmt(toTarget)}`]);
  checklist.push(['ok',`Punkte bis Stop: ${fmt(toStop)}`]);
  checklist.push(['ok',`Punkte bis Prüfzone: ${fmt(toZone)}`]);
  return {phase,signal,color,text,checklist};
}
function updateCoach(){
  const c=getCoach();
  $('coachPhase').textContent=c.phase;
  $('coachSignal').textContent=c.signal;
  $('coachSignal').className='coachSignal '+c.color;
  $('coachText').textContent=c.text;
  $('coachChecklist').innerHTML=c.checklist.map(x=>`<div class="coachItem ${x[0]}">✓ ${x[1]}</div>`).join('');
  $('riskBadge').textContent=c.color==='red'?'Rot':c.color==='gold'?'Gelb':'Grün';
  $('riskBadge').className=c.color==='red'?'red':c.color==='gold'?'gold':'green';
}
function updateClockAndSession(){
  const now=new Date();
  if($('clock')) $('clock').textContent=now.toLocaleTimeString('de-DE');
  const day=now.getDay();
  const minutes=now.getHours()*60+now.getMinutes();
  const open=day>=1&&day<=5&&minutes>=15*60+30&&minutes<22*60;
  const pre=day>=1&&day<=5&&minutes>=10*60&&minutes<15*60+30;
  const txt=open?'US-Markt geöffnet':pre?'Vorbörse / Vorbereitung':'US-Markt geschlossen';
  if($('sessionStatus')) $('sessionStatus').textContent=txt;
  if($('sessionBadge')) $('sessionBadge').textContent=open?'Offen':pre?'Pre':'Zu';
  if($('sessionText')) $('sessionText').textContent=open?'Live-Entscheidungen nur nach Plan. Keine impulsiven Klicks.':pre?'Setups vorbereiten, aber nicht aus Langeweile handeln.':'Außerhalb der Hauptsession: Analyse, Journal, Vorbereitung.';
}
function render(){
  $('marketTitle').textContent=`${plan.market} · ${plan.direction}`;$('directionLine').textContent=plan.contracts||'';$('dEntry').textContent=fmt(plan.entry);$('dTarget').textContent=fmt(plan.target);$('dStop').textContent=fmt(plan.stop);$('dCurrent').textContent=fmt(plan.current);$('sStop').textContent=fmt(plan.stop);$('sEntry').textContent=fmt(plan.entry);$('sTarget').textContent=fmt(plan.target);$('whyList').innerHTML=(plan.why||'').split('\n').filter(Boolean).map(x=>`<div class="pill">✓ ${x}</div>`).join('');$('pEntry').textContent=pts(dist(plan.current,plan.entry));$('pTarget').textContent=pts(dist(plan.target,plan.current));$('pStop').textContent=pts(dist(plan.current,plan.stop));$('pZone').textContent=pts(dist(plan.zone,plan.current));$('distanceText').textContent=`Noch ${fmt(dist(plan.zone,plan.current))} Punkte bis zur Prüfzone.`;$('bar').style.width=Math.min(100,Math.max(0,signedProgress()))+'%';$('hkcmView').innerHTML=imgHtml(plan.hkcm);$('tvView').innerHTML=imgHtml(plan.tv);zoneReached()?$('decision').classList.remove('hidden'):$('decision').classList.add('hidden');updateClockAndSession();updateCoach();renderTrades();renderChallenge()}

function loadImage(e,type){let file=e.target.files[0];if(!file)return;let r=new FileReader();r.onload=()=>{plan[type]=r.result;store.set('atlasPlan',plan);$(type+'Preview').innerHTML=imgHtml(r.result);render()};r.readAsDataURL(file)}
function savePlan(){plan={...plan,market:$('fMarket').value,symbol:$('fSymbol').value,direction:$('fDirection').value,contracts:$('fContracts').value,entry:+$('fEntry').value,target:+$('fTarget').value,stop:+$('fStop').value,current:+$('fCurrent').value,zone:+$('fZone').value,why:$('fWhy').value,rule:$('fRule').value};store.set('atlasPlan',plan);render();show('plan')}
async function updateYahoo(){if(!plan.symbol){$('liveStatus').textContent='Bitte zuerst ein Yahoo-Symbol in der Eingabe hinterlegen.';return}$('liveStatus').textContent='Yahoo-Daten werden geladen ...';const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(plan.symbol);const proxies=[url,'https://api.allorigins.win/raw?url='+encodeURIComponent(url),'https://corsproxy.io/?'+encodeURIComponent(url)];for(const u of proxies){try{const res=await fetch(u);if(!res.ok)throw new Error('HTTP '+res.status);const data=await res.json();const meta=data.chart.result[0].meta;const price=meta.regularMarketPrice||meta.previousClose;const prev=meta.previousClose||price;plan.current=Number(price);store.set('atlasPlan',plan);$('livePrice').textContent=fmt(price);$('liveChange').textContent=((price-prev)>=0?'+':'')+(price-prev).toFixed(2);$('liveChange').className=(price-prev)>=0?'green':'red';$('liveStatus').textContent='Live-Daten aktualisiert: '+new Date().toLocaleTimeString('de-DE');loadForm();render();return}catch(e){console.warn(e)}}$('liveStatus').textContent='Yahoo konnte nicht geladen werden. Bitte Kurs manuell eintragen.'}
function closeActiveTrade(){const r=Number($('closeResult').value);if(!r && r!==0){alert('Bitte Ergebnis eintragen.');return}trades.unshift({date:new Date().toLocaleDateString('de-DE'),market:plan.market,direction:plan.direction,result:r,note:$('closeNote').value||'',entry:plan.entry,target:plan.target,stop:plan.stop});store.set('atlasTrades',trades);$('closeResult').value='';$('closeNote').value='';render();show('journal')}
function deleteTrade(i){if(!confirm('Trade wirklich löschen?'))return;trades.splice(i,1);store.set('atlasTrades',trades);renderTrades()}
function renderTrades(){if(!trades.length){$('tradeList').innerHTML='<p>Noch keine beendeten Trades.</p>';return}$('tradeList').innerHTML=trades.map((t,i)=>`<div class="tradeRow"><div><b>${t.date} · ${t.market}</b><br><span>${t.direction} · ${t.note||''}</span></div><div>${t.result>=0?'Gewinn':'Verlust'}</div><div class="${t.result>=0?'plus':'minus'}">${pts(t.result)}</div><button class="deleteBtn" onclick="deleteTrade(${i})">×</button></div>`).join('')}
function exportJournalPdf(){let rows=trades.map(t=>`<tr><td>${t.date}</td><td>${t.market}</td><td>${t.direction}</td><td>${t.result}</td><td>${t.note||''}</td></tr>`).join('');let w=window.open('','_blank');w.document.write(`<html><head><title>Atlas Journal</title><style>body{font-family:Arial;padding:30px}h1{color:#8b6b28}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}</style></head><body><h1>Atlas Trading Journal</h1><table><tr><th>Datum</th><th>Markt</th><th>Richtung</th><th>Ergebnis</th><th>Notiz</th></tr>${rows}</table><script>print()<\/script></body></html>`);w.document.close()}
function toggleBox(i){challenge[i]=challenge[i]?null:new Date().toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});store.set('atlasChallenge',challenge);renderChallenge()}
function renderChallenge(){let done=challenge.filter(Boolean).length;$('wealthNow').textContent=done+' / 50';$('wealthPct').textContent=Math.round(done/50*100)+'%';$('lastCheck').textContent=challenge.filter(Boolean).slice(-1)[0]||'–';$('boxes').innerHTML=Array.from({length:50},(_,i)=>`<div onclick="toggleBox(${i})" class="box ${challenge[i]?'done':''}">${i+1}<br>${challenge[i]||''}</div>`).join('')}
makeNav();loadForm();render();setInterval(updateClockAndSession,1000);
