/* ================= HELPERS ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const rand=a=>a[Math.random()*a.length|0];
const isA=c=>/[A-Za-z0-9]/.test(c);
function joinZh(ch){let s="";ch.forEach((c,i)=>{if(i&&(isA(s.slice(-1))||isA(c[0])))s+=" ";s+=c});return s}
const ALL=[];
UNITS.forEach((u,ui)=>{u.items=u.items.map((r,ii)=>{const chunks=r[0].split(" ");const o={id:ui+"-"+ii,u:ui,chunks,zh:joinZh(chunks),py:r[1],en:r[2],note:r[3]||""};ALL.push(o);return o});
  const L=[];for(let i=0;i<u.items.length;i+=5)L.push(u.items.slice(i,i+5));
  if(L.length>1&&L[L.length-1].length<3){const last=L.pop();L[L.length-1]=L[L.length-1].concat(last)}
  u.lessons=L;});
const BYID=Object.fromEntries(ALL.map(x=>[x.id,x]));

/* ================= STATE ================= */
const APP_VERSION="1.1.3";const KEY="cl-v1",MAXH=5,HEART_MS=30*60e3,REFILL=100,FREEZE=50;
let S;try{S=JSON.parse(localStorage.getItem(KEY))||null}catch(e){S=null}
if(!S){let old=null;try{old=JSON.parse(localStorage.getItem("scm-v1"))}catch(e){}S=old?{xp:old.xp||0,streak:old.streak||0,last:old.last||"",done:old.done||{},items:old.items||{},addr:old.addr||""}:{}}
S=Object.assign({xp:0,gems:50,hearts:MAXH,heartTs:Date.now(),streak:0,best:0,last:"",days:[],freezes:0,goal:30,done:{},items:{},addr:"",daily:{d:""},chests:{},ach:{},stats:{lessons:0,perfect:0,practice:0,bestCombo:0},sound:true,haptic:true,silentSound:true,speak:true,noSpeakUntil:0,installDismissed:0},S);
S.best=Math.max(S.best,S.streak);
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
function today(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
const addDays=(ds,n)=>new Date(new Date(ds+"T00:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);
const dayDiff=(a,b)=>Math.round((new Date(b+"T00:00:00Z")-new Date(a+"T00:00:00Z"))/864e5);
function strength(id){const r=S.items[id];if(!r)return 0;return Math.max(0,Math.min(1,(r.c+1)/(r.c+r.w*2+2)))}
const seen=id=>!!S.items[id];
const learned=()=>Object.keys(S.items).length;
function mark(id,ok){const r=S.items[id]||(S.items[id]={c:0,w:0});ok?r.c++:r.w++}
const unitDone=ui=>UNITS[ui].lessons.every((_,li)=>S.done[ui+"-"+li]);
const levelOf=xp=>{let n=0;while(25*(n+1)*(n+2)<=xp)n++;return n+1};
const lvlFloor=l=>25*(l-1)*l;

/* hearts */
function tickHearts(){if(S.hearts>=MAXH){S.hearts=MAXH;return}const n=Math.floor((Date.now()-S.heartTs)/HEART_MS);if(n>0){S.hearts=Math.min(MAXH,S.hearts+n);S.heartTs+=n*HEART_MS;if(S.hearts>=MAXH)S.heartTs=Date.now();save()}}
function nextHeartIn(){const ms=HEART_MS-(Date.now()-S.heartTs);const m=Math.max(0,Math.ceil(ms/60000));return m+" min"}
function loseHeart(){if(S.hearts>=MAXH)S.heartTs=Date.now();S.hearts=Math.max(0,S.hearts-1);save()}

/* streak (with freezes) */
function checkStreak(){if(!S.last)return;const d=dayDiff(S.last,today());if(d<=1)return;const missed=d-1;
  if(S.streak>0&&S.freezes>=missed){S.freezes-=missed;for(let i=1;i<=missed;i++)S.days.push("F"+addDays(S.last,i));S.last=addDays(today(),-1);save();setTimeout(()=>toast(`🧊 Streak freeze used. Your ${S.streak}-day streak is safe!`),600)}
  else{if(S.streak>0)setTimeout(()=>toast(`💔 Your ${S.streak}-day streak ended. Start a new one today!`),600);S.streak=0;save()}}

/* daily quests */
const QPOOL=[
 {k:"lessons",g:[1,2,3],t:g=>`Complete ${g} lesson${g>1?"s":""}`,ic:"📘"},
 {k:"combo",g:[5,8,10],t:g=>`Get ${g} correct in a row`,ic:"🔥"},
 {k:"p90",g:[1,2],t:g=>`Score 90% or higher in ${g} session${g>1?"s":""}`,ic:"🎯"},
 {k:"listen",g:[5,8,10],t:g=>`Get ${g} listening exercises right`,ic:"🎧"},
 {k:"correct",g:[20,30,40],t:g=>`Answer ${g} questions correctly`,ic:"✅"}];
function seeded(str){let h=2166136261;for(const c of str)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>((h=Math.imul(h^(h>>>15),2246822507)^Math.imul(h^(h>>>13),3266489909))>>>0)/4294967296}
function D(){const t=today();if(S.daily.d!==t){const r=seeded(t);const pool=QPOOL.slice();const pick=[];while(pick.length<2){const i=r()*pool.length|0;pick.push(pool.splice(i,1)[0])}
  const qs=[{k:"xp",goal:S.goal,t:`Earn ${S.goal} XP`,ic:"⚡",rw:10}].concat(pick.map(p=>{const gi=r()*p.g.length|0;const g=p.g[gi];return{k:p.k,goal:g,t:p.t(g),ic:p.ic,rw:10+gi*5}}));
  S.daily={d:t,xp:0,lessons:0,combo:0,p90:0,listen:0,correct:0,q:qs,claimed:[]};save()}return S.daily}
const qProg=q=>Math.min(q.goal,D()[q.k]||0);
const qDone=q=>qProg(q)>=q.goal;
const claimable=()=>D().q.some((q,i)=>qDone(q)&&!D().claimed.includes(i));

/* achievements */
const ACH=[
 {id:"first",ic:"🎓",t:"First Steps",d:"Complete your first lesson",f:()=>S.stats.lessons>=1},
 {id:"s3",ic:"🔥",t:"Warming Up",d:"Reach a 3-day streak",f:()=>S.best>=3},
 {id:"s7",ic:"📅",t:"Week Warrior",d:"Reach a 7-day streak",f:()=>S.best>=7},
 {id:"s30",ic:"🌋",t:"Unstoppable",d:"Reach a 30-day streak",f:()=>S.best>=30},
 {id:"c10",ic:"🎯",t:"Sharpshooter",d:"Get 10 correct in a row",f:()=>S.stats.bestCombo>=10},
 {id:"p5",ic:"💯",t:"Perfectionist",d:"Finish 5 sessions with no mistakes",f:()=>S.stats.perfect>=5},
 {id:"w50",ic:"📚",t:"Phrase Collector",d:"Learn 50 phrases",f:()=>learned()>=50},
 {id:"w100",ic:"🧠",t:"Walking Phrasebook",d:"Learn 100 phrases",f:()=>learned()>=100},
 {id:"neg",ic:"⚖️",t:"Hard Bargainer",d:"Finish the Negotiation unit",f:()=>unitDone(4)},
 {id:"qc",ic:"🔍",t:"Quality Inspector",d:"Finish the Quality Control unit",f:()=>unitDone(5)},
 {id:"sos",ic:"🚑",t:"Ready for Anything",d:"Finish the Emergencies unit",f:()=>unitDone(8)},
 {id:"leg",ic:"👑",t:"Legendary",d:"Take any lesson to 5 crowns",f:()=>Object.values(S.done).some(v=>v>=5)},
 {id:"xp1k",ic:"⚡",t:"XP Machine",d:"Earn 1,000 XP",f:()=>S.xp>=1000},
 {id:"prac10",ic:"🏋️",t:"Gym Rat",d:"Finish 10 practice sessions",f:()=>S.stats.practice>=10},
 {id:"all",ic:"🏆",t:"Fluent on the Floor",d:"Finish every unit",f:()=>UNITS.every((_,i)=>unitDone(i))}];

/* ================= FEEDBACK FX ================= */
function toast(m){const t=$("#toast");t.textContent=m;t.style.display="block";t.style.animation="none";void t.offsetWidth;t.style.animation="";clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display="none",2800)}
function confetti(n=140){const c=document.createElement("canvas");c.className="conf";document.body.appendChild(c);const W=c.width=innerWidth,H=c.height=innerHeight,x=c.getContext("2d");const cols=["#58cc02","#1cb0f6","#ffc800","#ff4b4b","#ce82ff","#ff9600"];
  const P=Array.from({length:n},()=>({x:W/2+(Math.random()-.5)*W*.3,y:H*.35,vx:(Math.random()-.5)*14,vy:-Math.random()*16-4,r:Math.random()*6+4,c:rand(cols),a:Math.random()*6,va:(Math.random()-.5)*.4}));let f=0;
  (function loop(){x.clearRect(0,0,W,H);P.forEach(p=>{p.vy+=.45;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.a+=p.va;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);x.restore()});if(++f<160)requestAnimationFrame(loop);else c.remove()})()}
function countUp(el,to,ms=800,pre="",suf=""){const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/ms);el.textContent=pre+Math.round(to*(1-Math.pow(1-k,3)))+suf;if(k<1)requestAnimationFrame(f)})(t0)}

/* original mascot: Bāo the shipping box (包) */
function bao(mood="happy",sz=88,cls=""){
  const ink="#4a3220";
  const eyes={happy:`<circle cx="37" cy="50" r="5.5" fill="${ink}"/><circle cx="63" cy="50" r="5.5" fill="${ink}"/><circle cx="39" cy="48" r="1.8" fill="#fff"/><circle cx="65" cy="48" r="1.8" fill="#fff"/>`,
    cheer:`<path d="M31 51q6-8 12 0M57 51q6-8 12 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    sad:`<path d="M31 47q6 5 12 0M57 47q6 5 12 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    wow:`<circle cx="37" cy="50" r="7" fill="#fff" stroke="${ink}" stroke-width="3"/><circle cx="63" cy="50" r="7" fill="#fff" stroke="${ink}" stroke-width="3"/><circle cx="37" cy="51" r="3.5" fill="${ink}"/><circle cx="63" cy="51" r="3.5" fill="${ink}"/>`,
    think:`<circle cx="37" cy="50" r="5" fill="${ink}"/><circle cx="63" cy="50" r="5" fill="${ink}"/><path d="M30 41l12 2M70 41l-12 2" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`}[mood]||"";
  const mouth={happy:`<path d="M42 62q8 9 16 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    cheer:`<path d="M39 60q11 18 22 0z" fill="${ink}"/><path d="M44 67q6 5 12 0" fill="#ff7a8a"/>`,
    sad:`<path d="M42 68q8-7 16 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M68 56q3 6 0 9q-3-3 0-9z" fill="#5cc8ff"/>`,
    wow:`<ellipse cx="50" cy="66" rx="6" ry="7" fill="${ink}"/>`,
    think:`<path d="M43 65h14" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`}[mood]||"";
  const arms=mood==="cheer"?`<path d="M14 58L3 38M86 58l11-20" stroke="#c98b45" stroke-width="7" stroke-linecap="round"/>`:`<path d="M14 62L6 74M86 62l8 12" stroke="#c98b45" stroke-width="7" stroke-linecap="round"/>`;
  return `<span class="mascot ${cls}"><svg width="${sz}" height="${sz}" viewBox="0 0 100 100">${arms}<path d="M14 30L26 16h48l12 14z" fill="#d79a52"/><rect x="14" y="28" width="72" height="62" rx="9" fill="#e9b26b" stroke="#c98b45" stroke-width="3"/><rect x="44" y="28" width="12" height="16" fill="#f6dcae"/><text x="76" y="84" font-size="11" font-weight="900" fill="#b97a38" text-anchor="middle" font-family="sans-serif">包</text>${eyes}${mouth}<circle cx="28" cy="61" r="4.5" fill="#ff9fa8" opacity=".6"/><circle cx="72" cy="61" r="4.5" fill="#ff9fa8" opacity=".6"/></svg></span>`}

/* ================= MODALS ================= */
function modal(html,center){$("#modal").innerHTML=`<div class="mback ${center?"center":""}" id="mb"><div class="mbox">${html}</div></div>`;$("#mb").onclick=e=>{if(e.target.id==="mb")closeModal()};bindAll($("#modal"))}
function closeModal(){$("#modal").innerHTML=""}
function heartsModal(fromLesson){tickHearts();const full=S.hearts>=MAXH;
  modal(`${bao(S.hearts?"happy":"sad",80)}<h3>${S.hearts?`You have ${S.hearts} heart${S.hearts>1?"s":""}`:"You're out of hearts"}</h3>
  <div class="hearts">${"❤️".repeat(S.hearts)}${"🤍".repeat(MAXH-S.hearts)}</div>
  <p>${full?"Full hearts. Go learn something!":`Next heart in ${nextHeartIn()}. Lessons cost a heart per mistake; practice never does and earns one back.`}</p>
  <button class="btn blue" id="mh-refill" ${full||S.gems<REFILL?"disabled":""}>Refill hearts · 💎${REFILL}</button>
  <button class="btn ghost" id="mh-prac">Practice to earn hearts</button>
  <button class="btn link" id="mh-close">${fromLesson?"End lesson":"Close"}</button>`,true);
  $("#mh-refill").onclick=()=>{S.gems-=REFILL;S.hearts=MAXH;S.heartTs=Date.now();save();SFX.coin();buzz(20);stats();closeModal();toast("❤️ Hearts refilled!");if(fromLesson){SES.i++;step()}};
  $("#mh-prac").onclick=()=>{closeModal();if(fromLesson)endLesson(true);practice(learned()>=4?"mix":"sos")};
  $("#mh-close").onclick=()=>{closeModal();if(fromLesson)endLesson(true)};}
function streakModal(){const n=streakNow();modal(`<div class="flame">${n?"🔥":"🩶"}</div><div class="bignum">${n}</div><h3>day streak</h3><p>Best: ${S.best} days · Streak freezes: ${"🧊".repeat(S.freezes)||"none"}</p>${weekHTML()}<button class="btn blue" id="mz-buy" ${S.freezes>=2||S.gems<FREEZE?"disabled":""}>${S.freezes>=2?"Freezes full (2/2)":`Buy streak freeze · 💎${FREEZE}`}</button><button class="btn link" id="mz-c">Close</button>`,true);
  $("#mz-buy").onclick=()=>{buyFreeze();streakModal()};$("#mz-c").onclick=closeModal}
function buyFreeze(){if(S.freezes>=2||S.gems<FREEZE)return;S.gems-=FREEZE;S.freezes++;save();SFX.coin();buzz(20);stats();toast("🧊 Streak freeze equipped")}
function weekHTML(){const t=today(),set=new Set(S.days);let h=`<div class="week">`;for(let i=6;i>=0;i--){const d=addDays(t,-i);const lbl=["Su","Mo","Tu","We","Th","Fr","Sa"][new Date(d+"T12:00:00").getDay()];const on=set.has(d),fz=set.has("F"+d);h+=`<div>${lbl}<i class="${on?"on":fz?"fz":""}" style="animation-delay:${(6-i)*.06}s">${on?"✓":fz?"🧊":""}</i></div>`}return h+`</div>`}
function streakNow(){if(!S.last)return 0;return dayDiff(S.last,today())<=1?S.streak:0}

/* ================= TABS ================= */
const TABS=["learn","practice","quests","book","sos","me"];let tab=TABS.includes(location.hash.slice(1))?location.hash.slice(1):"learn";
window.addEventListener("hashchange",()=>{const h=location.hash.slice(1);if(TABS.includes(h)&&h!==tab&&!SES){tab=h;render()}});
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{tick();tab=b.dataset.tab;render();scrollTo(0,0)});
$("#t-streak").onclick=streakModal;$("#t-hearts").onclick=()=>heartsModal(false);$("#t-gems").onclick=()=>{tab="me";render();setTimeout(()=>{const s=$("#shop");s&&s.scrollIntoView({behavior:"smooth"})},50)};
function stats(){tickHearts();try{if(navigator.setAppBadge){(D().xp<S.goal?navigator.setAppBadge(1):navigator.clearAppBadge()).catch(()=>{})}}catch(e){}const sn=streakNow();$("#st-streak").textContent=sn;$("#t-streak").classList.toggle("dim",!sn||S.last!==today());$("#st-gems").textContent=S.gems;$("#st-hearts").textContent=S.hearts;
  document.querySelectorAll("nav button").forEach(x=>{x.classList.toggle("on",x.dataset.tab===tab);const old=x.querySelector(".dot");old&&old.remove();if(x.dataset.tab==="quests"&&claimable())x.insertAdjacentHTML("beforeend",`<span class="dot"></span>`)})}
function render(){stats();try{if(location.hash!=="#"+tab)history.replaceState(null,"","#"+tab)}catch(e){}const v=$("#view");v.innerHTML={learn:learnView,practice:practiceView,quests:questsView,book:bookView,sos:sosView,me:meView}[tab]();bindAll(v)}

function goalCard(){const tx=D().xp,pct=Math.min(100,tx/S.goal*100);return `<div class="card goal">${bao(pct>=100?"cheer":"happy",54)}<div style="flex:1"><b style="font-size:15px">${pct>=100?"Daily goal reached! 🎉":"Daily goal"}</b><div style="display:flex;align-items:center;gap:8px;margin-top:6px"><div class="bar" style="flex:1"><i style="width:${pct}%;background:var(--y)"></i></div><b style="font-size:13px;color:var(--mute)">${tx}/${S.goal}</b></div></div></div>`}
function learnView(){
  let nextId=null;outer:for(let ui=0;ui<UNITS.length;ui++)for(let li=0;li<UNITS[ui].lessons.length;li++){const id=ui+"-"+li;if(!S.done[id]){nextId=id;break outer}}
  let h=installCard()+goalCard();
  const pq=D().q.find((q,i)=>!qDone(q));if(pq)h+=`<div class="card" style="display:flex;gap:12px;align-items:center;cursor:pointer" data-go="quests"><span style="font-size:28px">${pq.ic}</span><div style="flex:1"><b style="font-size:14px">${esc(pq.t)}</b><div class="bar" style="margin-top:6px;height:10px"><i style="width:${qProg(pq)/pq.goal*100}%;background:var(--o)"></i></div></div><span style="font-size:22px">🎁</span></div>`;
  const off=[0,46,64,46,0,-46,-64,-46];
  UNITS.forEach((u,ui)=>{const dn=u.lessons.filter((_,li)=>S.done[ui+"-"+li]).length;
    h+=`<div class="unit" style="background:${u.c};box-shadow:0 4px 0 ${u.s}"><div><h3>Unit ${ui+1} · ${esc(u.t)}</h3><p>${esc(u.d)} · ${dn}/${u.lessons.length} lessons</p></div><div class="ic">${u.ic}</div></div><div class="path">`;
    u.lessons.forEach((L,li)=>{const id=ui+"-"+li,cr=S.done[id]||0,isNext=id===nextId,x=off[(li+ui*3)%off.length];
      const st=cr||isNext?`background:${u.c};box-shadow:0 6px 0 ${u.s}`:"";
      h+=`<div class="row" style="transform:translateX(${x}px)">${isNext?`<div class="start-tip" style="color:${u.c}">START</div>`:""}<button class="node ${cr||isNext?"":"avail"} ${isNext?"next":""} ${cr>=5?"legend":""}" style="${st}" data-lesson="${id}">${cr>=5?"👑":cr?"✓":isNext?"★":u.ic}${cr?`<span class="crown">👑${cr}</span>`:""}</button><div class="nlbl">${esc(L[0].en)}</div></div>`});
    const cs=S.chests[ui]?"open":dn===u.lessons.length?"ready":"locked";
    h+=`<div class="row" style="transform:translateX(${off[(u.lessons.length+ui*3)%off.length]}px)"><button class="chest ${cs}" data-chest="${ui}">${cs==="open"?"📭":"🎁"}</button><div class="nlbl">${cs==="open"?"Opened":cs==="ready"?"Open me!":"Unit reward"}</div></div></div>`});
  h+=`<div class="card"><h4>Tones 101</h4><p>Same syllable, four meanings. Tap to hear. The tone mark on the pinyin tells you which.</p><div class="tones">${[["妈","mā","1 · high flat"],["麻","má","2 · rising"],["马","mǎ","3 · dip"],["骂","mà","4 · falling"]].map(t=>`<button class="zh" data-say="${t[0]}">${t[0]}<small>${t[1]}<br>${t[2]}</small></button>`).join("")}</div></div>`;
  return h}
function lessonSheet(id){const[ui,li]=id.split("-").map(Number),u=UNITS[ui],L=u.lessons[li],cr=S.done[id]||0;tickHearts();
  const box=`<div class="sheet"><div style="display:flex;justify-content:space-between;align-items:center"><div><h3 style="margin:0">${esc(u.t)}</h3><p style="margin:2px 0 12px">Lesson ${li+1} of ${u.lessons.length} · ${cr>=5?"Legendary 👑":`Crown level ${cr}/5`}</p></div><span style="font-size:36px">${u.ic}</span></div>
  <div class="prev">${L.map(x=>`<span class="zh">${esc(x.zh)}</span> <span style="opacity:.85">· ${esc(x.en)}</span>`).join("<br>")}</div>
  <button class="btn white" id="ls-go" style="color:${u.c}">${S.hearts?(cr?`Level up · +${10+5} XP`:"Start · +10 XP"):"❤️ Out of hearts"}</button></div>`;
  modal(box);$("#modal .mbox").style.background=u.c;
  $("#ls-go").onclick=()=>{closeModal();if(!S.hearts)return heartsModal(false);SFX.whoosh();startSession(L,{lesson:id,learn:true})}}
function openChest(ui){if(S.chests[ui])return toast("Already opened");if(!unitDone(ui)){buzz(30);return toast("🔒 Finish every lesson in this unit to unlock")}
  S.chests[ui]=1;const g=20+Math.floor(Math.random()*11);S.gems+=g;save();SFX.coin();setTimeout(SFX.fanfare,200);confetti(90);buzz([20,40,20]);
  modal(`<div style="font-size:90px;animation:popin .5s">🎁</div><h3>Unit chest!</h3><p>You earned <b style="color:var(--b)">💎${g}</b> gems</p><button class="btn" id="cc">Nice!</button>`,true);$("#cc").onclick=()=>{closeModal();render()}}

function practiceView(){const si=ALL.filter(x=>seen(x.id)),weak=si.filter(x=>strength(x.id)<.75);
  const card=(k,i,t,s,dis)=>`<button class="pc" data-prac="${k}" ${dis?"disabled":""}><span class="i">${i}</span><div><b>${t}</b><span>${s}</span></div></button>`;
  return `<div class="card" style="display:flex;gap:12px;align-items:center">${bao("happy",50)}<p>Practice never costs hearts and earns you <b style="color:var(--r)">+1 ❤️</b> each time you finish.</p></div><div class="prac">
  ${card("weak","💪","Fix weak phrases",weak.length?`${weak.length} phrase${weak.length>1?"s need":" needs"} work`:"Nothing weak yet. Finish a lesson first",!weak.length)}
  ${card("mix","🔀","Mixed review",si.length>=4?`Random mix of ${si.length} learned phrases`:"Learn at least 4 phrases first",si.length<4)}
  ${card("listen","🎧","Listening drill","Hear it, pick it. Trains your ear for calls and the factory floor",si.length<4)}
  ${card("supplier","🏭","Supplier sprint","Quotes, negotiation, QC and shipping, mixed",false)}
  ${card("sos","🚨","Emergency drill","Drill the phrases you can't afford to forget",false)}</div>
  <div class="grp">Your phrases by strength</div>${si.length?si.sort((a,b)=>strength(a.id)-strength(b.id)).slice(0,30).map(rowHTML).join(""):`<div class="empty">Complete a lesson to see stats here.</div>`}`}
function rowHTML(x){const s=strength(x.id);return `<div class="ph"><div class="str"><i style="height:${seen(x.id)?Math.round(s*100):0}%;background:${s<.5?"var(--r)":s<.75?"var(--y)":"var(--g)"}"></i></div><div class="t"><div class="zh">${esc(x.zh)}</div><div class="p">${esc(x.py)}</div><div class="e">${esc(x.en)}</div></div><button class="ib" data-say="${esc(x.zh)}">🔊</button><button class="ib" data-show="${x.id}">⤢</button></div>`}

function questsView(){const d=D();const end=new Date();end.setHours(24,0,0,0);const hl=Math.ceil((end-new Date())/36e5);
  return `<div class="card" style="display:flex;gap:12px;align-items:center;background:#fff8e1;border-color:#ffe08a">${bao("wow",56)}<div><b style="font-size:17px">Daily Quests</b><p style="color:#7a5a00">New quests in ${hl} hour${hl>1?"s":""}. Complete them and open the chests for gems.</p></div></div>
  <div style="margin:0 16px">${d.q.map((q,i)=>{const p=qProg(q),done=p>=q.goal,cl=d.claimed.includes(i);return `<div class="quest"><span class="ic">${q.ic}</span><div class="t"><b>${esc(q.t)}</b><div class="bar"><i style="width:${p/q.goal*100}%;background:${done?"var(--g)":"var(--o)"}"></i><em>${p} / ${q.goal}</em></div></div><button class="qchest ${done&&!cl?"ready":""}" data-claim="${i}" ${!done||cl?"disabled":""}>${cl?"📭":"🎁"}</button></div>`}).join("")}</div>
  <div class="grp">How to earn gems</div><div class="card"><p>💎 +5 per lesson, +5 more for a perfect one · 🎁 10–20 per quest chest · 🎁 20–30 per unit chest. Spend them on heart refills and streak freezes in the Me tab.</p></div>`}
function claimQuest(i){const d=D(),q=d.q[i];if(!q||!qDone(q)||d.claimed.includes(i))return;d.claimed.push(i);S.gems+=q.rw;save();SFX.coin();buzz([15,30,15]);confetti(60);toast(`🎁 Quest chest: +💎${q.rw}`);render()}

let qs="";
function bookView(){return `<div class="search"><input id="srch" placeholder="Search English, pinyin or 汉字…" value="${esc(qs)}" autocomplete="off"></div><div id="blist">${bookList()}</div>`}
const norm=s=>s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
function bookList(){const n=norm(qs.trim());let h="";UNITS.forEach(u=>{const its=u.items.filter(x=>!n||norm(x.en).includes(n)||norm(x.py).replace(/[\s-]/g,"").includes(n.replace(/\s/g,""))||x.zh.includes(qs.trim()));if(its.length)h+=`<div class="grp">${u.ic} ${esc(u.t)}</div>`+its.map(rowHTML).join("")});return h||`<div class="empty">No matches.</div>`}
function sosView(){const sos=UNITS.find(u=>u.sos);
  return `<div class="nums"><div class="num" style="background:#2b70c9"><b>110</b><span>Police</span><small>报警 bàojǐng</small></div><div class="num" style="background:#ea2b2b"><b>120</b><span>Ambulance</span><small>救护车 jiùhùchē</small></div><div class="num" style="background:#ff9600"><b>119</b><span>Fire</span><small>火警 huǒjǐng</small></div><div class="num" style="background:#555"><b>122</b><span>Traffic accident</span><small>交通事故 jiāotōng shìgù</small></div></div>
  <div class="addr"><div class="grp" style="margin:0 0 8px">Your hotel / factory address (in Chinese)</div><textarea id="addr" class="zh" placeholder="Paste the Chinese address here, then tap Show to driver">${esc(S.addr)}</textarea><button class="btn blue" id="showaddr" style="margin-top:10px">Show to driver</button></div>
  <div class="prac" style="margin-top:0"><button class="pc" data-prac="sos"><span class="i">🚨</span><div><b>Emergency drill</b><span>Practice these now so they're automatic later</span></div></button></div>
  <div class="grp">Tap ⤢ to show full screen</div>${sos.items.map(rowHTML).join("")}<div style="height:20px"></div>`}
function meView(){const lv=levelOf(S.xp),a=lvlFloor(lv),b=lvlFloor(lv+1),got=ACH.filter(x=>S.ach[x.id]).length;
  const goals=[[10,"Casual"],[20,"Regular"],[30,"Serious"],[50,"Intense"]];
  return `<div class="prof">${bao("cheer",96,"jump")}<h2>Level ${lv}</h2><div style="display:flex;align-items:center;gap:8px;max-width:320px;margin:8px auto 0"><div class="bar" style="flex:1"><i style="width:${(S.xp-a)/(b-a)*100}%;background:var(--p)"></i></div><b style="font-size:12px;color:var(--mute)">${S.xp-a}/${b-a} XP</b></div></div>
  <div class="sgrid"><div class="sg"><i>🔥</i><div><b>${streakNow()}</b><span>Day streak</span></div></div><div class="sg"><i>🏅</i><div><b>${S.best}</b><span>Best streak</span></div></div><div class="sg"><i>⚡</i><div><b>${S.xp}</b><span>Total XP</span></div></div><div class="sg"><i>📘</i><div><b>${S.stats.lessons}</b><span>Lessons</span></div></div><div class="sg"><i>🗣️</i><div><b>${learned()}/${ALL.length}</b><span>Phrases learned</span></div></div><div class="sg"><i>💯</i><div><b>${S.stats.perfect}</b><span>Perfect sessions</span></div></div></div>
  <div class="grp">Achievements · ${got}/${ACH.length}</div><div class="agrid">${ACH.map(x=>`<button class="ach ${S.ach[x.id]?"got":"lock"}" data-ach="${x.id}"><i>${x.ic}</i><b>${esc(x.t)}</b></button>`).join("")}</div>
  <div class="grp" id="shop">Shop · 💎${S.gems}</div>
  <div class="shop"><span class="ic">❤️</span><div class="t"><b>Refill hearts</b><span>${S.hearts}/${MAXH} now${S.hearts<MAXH?` · next in ${nextHeartIn()}`:""}</span></div><button class="btn blue" id="buy-h" ${S.hearts>=MAXH||S.gems<REFILL?"disabled":""}>💎${REFILL}</button></div>
  <div class="shop"><span class="ic">🧊</span><div class="t"><b>Streak freeze</b><span>Protects your streak for a missed day · ${S.freezes}/2 equipped</span></div><button class="btn blue" id="buy-f" ${S.freezes>=2||S.gems<FREEZE?"disabled":""}>💎${FREEZE}</button></div>
  <div class="grp">Daily goal</div><div class="seg">${goals.map(g=>`<button data-goal="${g[0]}" class="${S.goal===g[0]?"on":""}">${g[1]}<br>${g[0]} XP</button>`).join("")}</div>
  <div class="grp">Settings</div>
  <div class="tog">🔊 Sound effects<button class="sw ${S.sound?"on":""}" data-tog="sound"></button></div>
  <div class="tog"><span>🔕 Play sounds in silent mode<br><small style="color:var(--mute);font-weight:700">iPhone ring switch off. Note: pauses other music</small></span><button class="sw ${S.silentSound?"on":""}" data-tog="silentSound"></button></div>
  <div class="tog"><span>📳 Haptics<br><small style="color:var(--mute);font-weight:700">${FX.canVibrate?"Vibration patterns":"iPhone taps (iOS 18+)"}</small></span><button class="sw ${S.haptic?"on":""}" data-tog="haptic"></button></div>
  ${window.ASR&&ASR.supported?`<div class="tog"><span>🎙️ Speaking exercises<br><small style="color:var(--mute);font-weight:700">Uses the microphone</small></span><button class="sw ${S.speak?"on":""}" data-tog="speak"></button></div>`:""}
  <div style="margin:16px 16px 0"><button class="btn ghost" id="fxtest">▶ Test sound, voice &amp; haptics</button></div>
  ${appCard()}
  <div class="grp">Your data</div>
  <div class="card"><p>Progress lives on this device. To move it to another phone, copy a backup code here and paste it there.</p><div style="display:flex;gap:10px;margin-top:12px"><button class="btn ghost" id="exp" style="font-size:13px">Copy backup</button><button class="btn ghost" id="imp" style="font-size:13px;margin-top:0">Restore</button></div></div>
  <div style="margin:20px 16px"><button class="btn ghost" id="reset" style="color:var(--r)">Reset all progress</button></div>
  <div class="card"><p>Audio uses your device's built-in Chinese voice. Works offline once installed. v${APP_VERSION}</p></div>`}
function installCard(){if(!window.PWA||PWA.standalone()||S.installDismissed>Date.now()-7*864e5)return "";if(!PWA.canPrompt()&&!PWA.isIOS())return "";
  return `<div class="card install">${bao("wow",54)}<div style="flex:1"><b>Install China Lingo</b><p>${PWA.isIOS()?"Tap <b>Share</b> ⬆️ then <b>Add to Home Screen</b> for full-screen, offline lessons with sound and haptics.":"Add it to your home screen for full-screen, offline lessons."}</p>${PWA.canPrompt()?`<button class="btn blue" data-install style="margin-top:10px;padding:10px">Install app</button>`:""}</div><button class="x" data-dismiss-install style="font-size:20px;align-self:flex-start">✕</button></div>`}
function appCard(){if(!window.PWA)return "";if(PWA.standalone())return `<div class="card" style="margin-top:16px"><p>✅ Installed. Running as an app.</p></div>`;
  return `<div class="card" style="margin-top:16px"><h4>📲 Install as an app</h4><p>${PWA.isIOS()?"In Safari tap <b>Share</b> ⬆️ → <b>Add to Home Screen</b>.":PWA.canPrompt()?"Install for offline, full-screen use.":"Use your browser menu → <b>Install app</b> or <b>Add to Home Screen</b>."}</p>${PWA.canPrompt()?`<button class="btn blue" data-install style="margin-top:10px">Install app</button>`:""}</div>`}

function bindAll(v){
  v.querySelectorAll("[data-say]").forEach(b=>b.onclick=()=>say(b.dataset.say));
  v.querySelectorAll("[data-show]").forEach(b=>b.onclick=()=>showBig(BYID[b.dataset.show]));
  v.querySelectorAll("[data-lesson]").forEach(b=>b.onclick=()=>{tick();lessonSheet(b.dataset.lesson)});
  v.querySelectorAll("[data-chest]").forEach(b=>b.onclick=()=>openChest(+b.dataset.chest));
  v.querySelectorAll("[data-prac]").forEach(b=>b.onclick=()=>{SFX.whoosh();practice(b.dataset.prac)});
  v.querySelectorAll("[data-claim]").forEach(b=>b.onclick=()=>claimQuest(+b.dataset.claim));
  v.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{tab=b.dataset.go;render()});
  v.querySelectorAll("[data-ach]").forEach(b=>b.onclick=()=>{const a=ACH.find(x=>x.id===b.dataset.ach);modal(`<div style="font-size:70px;${S.ach[a.id]?"":"filter:grayscale(1);opacity:.5"}">${a.ic}</div><h3>${esc(a.t)}</h3><p>${esc(a.d)}${S.ach[a.id]?`<br>Unlocked ${S.ach[a.id]}`:"<br>Locked"}</p><button class="btn" id="ac">OK</button>`,true);$("#ac").onclick=closeModal});
  v.querySelectorAll("[data-goal]").forEach(b=>b.onclick=()=>{S.goal=+b.dataset.goal;const d=D();d.q[0].goal=S.goal;d.q[0].t=`Earn ${S.goal} XP`;save();tick();render()});
  v.querySelectorAll("[data-tog]").forEach(b=>b.onclick=()=>{S[b.dataset.tog]=!S[b.dataset.tog];if(b.dataset.tog==="speak")S.noSpeakUntil=0;save();FX.applySession();tick();if(b.dataset.tog==="haptic"&&S.haptic)buzz(20);render()});
  v.querySelectorAll("[data-install]").forEach(b=>b.onclick=()=>PWA.prompt().then(()=>render()));
  v.querySelectorAll("[data-dismiss-install]").forEach(b=>b.onclick=()=>{S.installDismissed=Date.now();save();render()});
  const ft=v.querySelector("#fxtest");if(ft)ft.onclick=()=>{SFX.ok();buzz([20,60,20]);setTimeout(SFX.combo,450);setTimeout(()=>say("你好，欢迎！"),1100);toast(`Sound ${S.sound?"on":"off"} · Haptics ${S.haptic?(FX.canVibrate?"vibrate":"iPhone tap"):"off"}`)};
  const ex=v.querySelector("#exp");if(ex)ex.onclick=async()=>{const code="CL1."+btoa(unescape(encodeURIComponent(JSON.stringify(S))));try{await navigator.clipboard.writeText(code);toast("📋 Backup code copied")}catch(e){modal(`<h3>Backup code</h3><p>Copy this text:</p><textarea style="width:100%;height:120px;font-size:11px" readonly>${esc(code)}</textarea><button class="btn" id="bk">Done</button>`,true);$("#bk").onclick=closeModal}};
  const im=v.querySelector("#imp");if(im)im.onclick=()=>{modal(`<h3>Restore progress</h3><p>Paste a backup code. This replaces progress on this device.</p><textarea id="impt" style="width:100%;height:110px;font-size:12px;border:2px solid var(--line);border-radius:12px;padding:8px"></textarea><button class="btn" id="impy" style="margin-top:12px">Restore</button><button class="btn link" id="impn">Cancel</button>`,true);$("#impn").onclick=closeModal;$("#impy").onclick=()=>{try{const t=$("#impt").value.trim();const o=JSON.parse(decodeURIComponent(escape(atob(t.replace(/^CL1\./,"")))));if(typeof o.xp!=="number")throw 0;localStorage.setItem(KEY,JSON.stringify(o));location.reload()}catch(e){toast("❌ That code didn't work");buzz([40,50,40])}}};
  const bh=v.querySelector("#buy-h");if(bh)bh.onclick=()=>{S.gems-=REFILL;S.hearts=MAXH;S.heartTs=Date.now();save();SFX.coin();toast("❤️ Hearts refilled!");render()};
  const bf=v.querySelector("#buy-f");if(bf)bf.onclick=()=>{buyFreeze();render()};
  const rs=v.querySelector("#reset");if(rs)rs.onclick=()=>{modal(`${bao("sad",80)}<h3>Reset everything?</h3><p>XP, streak, gems, crowns and achievements will all be erased. This can't be undone.</p><button class="btn red" id="rs-y">Reset progress</button><button class="btn link" id="rs-n">Cancel</button>`,true);$("#rs-n").onclick=closeModal;$("#rs-y").onclick=()=>{try{localStorage.removeItem(KEY)}catch(e){}location.reload()}};
  const s=v.querySelector("#srch");if(s)s.oninput=()=>{qs=s.value;$("#blist").innerHTML=bookList();bindAll($("#blist"))};
  const a=v.querySelector("#addr");if(a)a.oninput=()=>{S.addr=a.value;save()};
  const sa=v.querySelector("#showaddr");if(sa)sa.onclick=()=>{const t=(S.addr||"").trim();showBig({zh:t?"请带我去：\n"+t:"请带我去这个地址",py:"qǐng dài wǒ qù",en:"Please take me to:"},true)};}
function showBig(x,isAddr){const o=$("#modal"),t=x.zh.replace("\n","");o.innerHTML=`<div class="show"><button class="x close" id="cl">✕</button><div class="zh" style="${isAddr?"font-size:clamp(30px,8vw,56px);white-space:pre-wrap":""}">${esc(x.zh)}</div><div class="py">${esc(x.py)}</div><div class="en">${esc(x.en)}</div><div class="spk"><button class="sb" id="s1">🔊</button><button class="sb" id="s2">🐢</button></div><div class="hint">Turn your screen toward them</div></div>`;
  $("#cl").onclick=closeModal;$("#s1").onclick=()=>say(t);$("#s2").onclick=()=>say(t,1);say(t)}

function practice(k){const si=ALL.filter(x=>seen(x.id));let items,opt={learn:true,practice:true};
  if(k==="weak")items=si.sort((a,b)=>strength(a.id)-strength(b.id)).slice(0,6);
  else if(k==="mix")items=shuffle(si).slice(0,7);
  else if(k==="listen"){items=shuffle(si).slice(0,8);opt.only="listen"}
  else if(k==="supplier")items=shuffle(ALL.filter(x=>x.u>=2&&x.u<=7)).slice(0,7);
  else items=shuffle(UNITS.find(u=>u.sos).items).slice(0,7);
  if(!items.length)return toast("Finish a lesson first");startSession(items,opt)}

/* ================= SESSION ================= */
let SES=null;
const TYPES=["mc_zh","mc_en","listen","build","speak"];
const canSpeak=it=>window.ASR&&ASR.supported&&S.speak&&Date.now()>S.noSpeakUntil&&it.u!==1&&it.zh.replace(/[^\u4e00-\u9fff]/g,"").length>=2;
const PRAISE=[["太棒了！","tài bàng le","Awesome!"],["很好！","hěn hǎo","Very good!"],["厉害！","lìhai","Impressive!"],["对了！","duì le","That's right!"],["真棒！","zhēn bàng","Great job!"],["完美！","wánměi","Perfect!"],["不错！","búcuò","Not bad at all!"]];
const OOPS=["Not quite","Almost!","Close one","Oops"];
function pickType(it,avoid){const t=TYPES.filter(x=>x!==avoid&&(x!=="build"||it.chunks.length>=2)&&(x!=="speak"||canSpeak(it)));return rand(t)}
function startSession(items,opt){
  const q=[],last={},ex=it=>{const t=opt.only||pickType(it,last[it.id]);last[it.id]=t;return{type:t,item:it}};
  items.forEach(it=>{if(opt.learn&&!seen(it.id))q.push({type:"learn",item:it});q.push(ex(it))});
  if(items.length>=4&&!opt.only)q.splice(Math.min(q.length,Math.ceil(q.length*.6)),0,{type:"match",items:shuffle(items).slice(0,4)});
  shuffle(items).forEach(it=>q.push(ex(it)));
  SES={items,q,i:0,ok:0,tot:0,combo:0,best:0,opt,ex,mist:new Set(),t0:Date.now(),half:false,hl:0,lv0:levelOf(S.xp),gx0:D().xp,qd0:D().q.map(qDone),ach0:Object.assign({},S.ach),ud0:UNITS.map((_,i)=>unitDone(i))};
  $("#overlay").innerHTML=`<div class="lesson"><div class="in"><div class="lhead"><button class="x" id="quit">✕</button><div class="prog" id="pgw"><i id="pg"></i><span class="cmb" id="cb"></span></div><div class="lh ${opt.practice?"pr":""}" id="lh"></div></div><div class="lbody" id="lb"></div></div><div id="lf"></div></div>`;
  $("#quit").onclick=quitAsk;hdr();try{history.pushState({lesson:1},"")}catch(e){}step()}
let ignorePop=false;
window.addEventListener("popstate",()=>{if(ignorePop){ignorePop=false;return}
  if($("#modal").innerHTML){closeModal();if(SES&&!SES.done)try{history.pushState({lesson:1},"")}catch(e){};return}
  if(SES){if(SES.done){SES.done="left";endLesson();return}try{history.pushState({lesson:1},"")}catch(e){}quitAsk()}});
function hdr(){const lh=$("#lh");if(!lh)return;lh.innerHTML=SES.opt.practice?"🏋️ Practice":`❤️ <span>${S.hearts}</span>`}
function quitAsk(){if(SES&&SES.done)return endLesson();modal(`${bao("sad",84,"shk")}<h3>Wait, don't go!</h3><p>You'll lose your progress in this ${SES.opt.practice?"practice session":"lesson"}.</p><button class="btn blue" id="qk">Keep learning</button><button class="btn link" id="qe" style="color:var(--r)">End session</button>`,true);$("#qk").onclick=closeModal;$("#qe").onclick=()=>{closeModal();endLesson(true)}}
function endLesson(){hush();if(window.__pendingUpdate){window.__applyUpdate();return}if(history.state&&history.state.lesson){ignorePop=true;try{history.back()}catch(e){ignorePop=false}}$("#overlay").innerHTML="";SES=null;render();scrollTo(0,0)}
function step(){const s=SES;$("#pg").style.width=(s.i/s.q.length*100)+"%";
  if(s.i>=s.q.length)return finish();
  if(!s.half&&s.i>=Math.floor(s.q.length/2)&&s.i>2){s.half=true;banner("cheer","Halfway there!","加油 jiāyóu · keep it up!")}
  let e=s.q[s.i];if(e.type==="speak"&&!canSpeak(e.item))e=s.q[s.i]={type:pickType(e.item,"speak"),item:e.item};
  const lb=$("#lb");lb.scrollTop=0;s.sel=null;
  ({learn:rLearn,mc_zh:rMcZh,mc_en:rMcEn,listen:rListen,build:rBuild,match:rMatch,speak:rSpeak})[e.type](e,lb);
  lb.classList.remove("enter");void lb.offsetWidth;lb.classList.add("enter")}
function banner(mood,t,sub){const old=document.querySelector(".banner");old&&old.remove();const el=document.createElement("div");el.className="banner";el.innerHTML=`${bao(mood,44)}<div><b>${t}</b><small>${sub||""}</small></div>`;$(".lesson>.in").appendChild(el);setTimeout(()=>el.remove(),2000)}
function foot(label,cb,dis,cls){$("#lf").innerHTML=`<div class="lfoot"><div class="in2"><button class="btn ${cls||""}" id="go" ${dis?"disabled":""}>${label}</button></div></div>`;$("#go").onclick=cb}
const enableGo=()=>{const g=$("#go");if(g)g.disabled=false};
function distract(it,n){const ses=new Set((SES&&SES.items||[]).map(x=>x.id));const ok=x=>x.id!==it.id&&x.en!==it.en&&x.zh!==it.zh;
  const known=shuffle(ALL.filter(x=>ok(x)&&x.u===it.u&&(seen(x.id)||ses.has(x.id))));const same=shuffle(ALL.filter(x=>ok(x)&&x.u===it.u&&!known.includes(x)));
  let p=known.concat(same).slice(0,n);if(p.length<n)p=p.concat(shuffle(ALL.filter(x=>ok(x)&&x.u!==it.u)).slice(0,n-p.length));return p}

function rLearn(e,lb){const it=e.item;S.items[it.id]=S.items[it.id]||{c:0,w:0};save();
  lb.innerHTML=`<div class="tag">✨ New phrase</div><div class="say" style="margin-top:6px">${bao("wow",64)}<div class="bubble">Listen and repeat out loud!</div></div><div class="big zh">${esc(it.zh)}</div><div class="py">${esc(it.py)}</div><div class="en">${esc(it.en)}</div><div class="spk"><button class="sb" id="a1">🔊</button><button class="sb" id="a2">🐢</button></div>${it.note?`<div class="note">💡 ${esc(it.note)}</div>`:""}`;
  $("#a1").onclick=()=>say(it.zh);$("#a2").onclick=()=>say(it.zh,1);say(it.zh);
  foot("Got it",()=>{tick();SES.i++;step()})}
function optsHTML(list,fn){return `<div class="opts">${list.map((x,i)=>`<button class="opt" data-i="${i}"><span class="k">${i+1}</span><div>${fn(x)}</div></button>`).join("")}</div>`}
function bindOpts(lb,list,onPick){lb.querySelectorAll(".opt").forEach(b=>b.onclick=()=>{tick();lb.querySelectorAll(".opt").forEach(o=>o.classList.remove("sel"));b.classList.add("sel");SES.sel=list[+b.dataset.i];onPick&&onPick(SES.sel);enableGo()})}
function rMcZh(e,lb){const it=e.item,list=shuffle([it,...distract(it,3)]);
  lb.innerHTML=`<div class="tag">Say it in Mandarin</div><div class="say" style="justify-content:flex-start">${bao("think",58)}<div class="bubble" style="font-size:19px">“${esc(it.en)}”</div></div><div style="height:14px"></div>`+optsHTML(list,x=>`<span class="zh">${esc(x.zh)}</span><small>${esc(x.py)}</small>`);
  bindOpts(lb,list,x=>say(x.zh));foot("Check",()=>check(SES.sel===it,it,"mc_zh"),true)}
function rMcEn(e,lb){const it=e.item,list=shuffle([it,...distract(it,3)]);
  lb.innerHTML=`<div class="tag">What does this mean?</div><div class="prompt">${bao("happy",58)}<div class="bubble"><div style="display:flex;gap:10px;align-items:center"><button class="sb sm" id="a1">🔊</button><div class="zh">${esc(it.zh)}</div></div><button class="reveal" id="rv">Show pinyin</button></div></div>`+optsHTML(list,x=>esc(x.en));
  $("#a1").onclick=()=>say(it.zh);$("#rv").onclick=function(){this.outerHTML=`<div class="py" style="text-align:left;font-size:15px">${esc(it.py)}</div>`};say(it.zh);
  bindOpts(lb,list);foot("Check",()=>check(SES.sel===it,it,"mc_en"),true)}
function rListen(e,lb){const it=e.item,list=shuffle([it,...distract(it,3)]);
  lb.innerHTML=`<div class="tag">🎧 Listening</div><div class="q">Tap what you hear</div><div class="spk"><button class="sb big2" id="a1">🔊</button><button class="sb" id="a2" style="align-self:flex-end">🐢</button></div>`+optsHTML(list,x=>`<span class="zh">${esc(x.zh)}</span>`);
  $("#a1").onclick=()=>say(it.zh);$("#a2").onclick=()=>say(it.zh,1);setTimeout(()=>say(it.zh),150);
  bindOpts(lb,list);foot("Check",()=>check(SES.sel===it,it,"listen"),true)}
function rBuild(e,lb){const it=e.item,ans=it.chunks;
  const pool=[...new Set(ALL.filter(x=>x.u===it.u&&x.id!==it.id).flatMap(x=>x.chunks))].filter(c=>!ans.includes(c));
  const tiles=shuffle([...ans,...shuffle(pool).slice(0,Math.min(3,Math.max(2,ans.length-1)))]).map((t,i)=>({t,i}));const picked=[];
  lb.innerHTML=`<div class="tag">Build the sentence</div><div class="say" style="justify-content:flex-start">${bao("think",58)}<div class="bubble" style="font-size:18px">“${esc(it.en)}”</div></div><div class="ans" id="ans" style="margin-top:14px"></div><div class="bank" id="bank"></div><div style="text-align:center;margin-top:18px"><button class="reveal" id="hint">💡 Show pinyin hint</button></div>`;
  $("#hint").onclick=function(){this.outerHTML=`<div class="py" style="font-size:16px">${esc(it.py)}</div>`};
  function draw(){$("#ans").innerHTML=picked.map((p,k)=>`<button class="tile zh" data-k="${k}">${esc(p.t)}</button>`).join("");
    $("#bank").innerHTML=tiles.map(p=>`<button class="tile zh ${picked.includes(p)?"used":""}" data-i="${p.i}">${esc(p.t)}</button>`).join("");
    $("#ans").querySelectorAll(".tile").forEach(b=>b.onclick=()=>{tick();picked.splice(+b.dataset.k,1);draw()});
    $("#bank").querySelectorAll(".tile").forEach(b=>b.onclick=()=>{const p=tiles.find(x=>x.i==b.dataset.i);if(picked.includes(p))return;tick();picked.push(p);draw()});
    const g=$("#go");if(g)g.disabled=!picked.length}
  foot("Check",()=>check(picked.map(p=>p.t).join("")===ans.join(""),it,"build"),true);draw()}
function rMatch(e,lb){const its=e.items,L=shuffle(its),R=shuffle(its);let sl=null,sr=null,left=its.length,miss=0;
  lb.innerHTML=`<div class="tag">⚡ Match the pairs</div><div class="q">Tap the matching pairs</div><div class="mgrid"><div class="mcol">${L.map(x=>`<button class="mt" data-l="${x.id}"><span class="zh">${esc(x.zh)}</span></button>`).join("")}</div><div class="mcol">${R.map(x=>`<button class="mt" data-r="${x.id}">${esc(x.en)}</button>`).join("")}</div></div>`;
  $("#lf").innerHTML="";
  const tryPair=()=>{if(!sl||!sr)return;const a=lb.querySelector(`[data-l="${sl}"]`),b=lb.querySelector(`[data-r="${sr}"]`);
    if(sl===sr){a.className=b.className="mt ok";SFX.ok();buzz(12);mark(sl,1);left--;if(!left){SES.tot++;const D0=D();if(!miss){SES.ok++;SES.combo++;D0.correct++;SES.best=Math.max(SES.best,SES.combo);D0.combo=Math.max(D0.combo,SES.combo)}else SES.combo=0;save();
      foot("Continue",()=>{SES.i++;step()});$("#lf").innerHTML=`<div class="fb good"><div class="in2"><div class="fbh">${bao(miss?"happy":"cheer",54)}<div><h5>${miss?"All matched!":"Flawless match!"}</h5><div class="sub">${miss?`${miss} mismatch${miss>1?"es":""}, no hearts lost`:"完美 wánměi · perfect"}</div></div></div><button class="btn" id="go">Continue</button></div></div>`;$("#go").onclick=()=>{SES.i++;step()};if(!miss)SFX.combo()}}
    else{a.classList.add("no");b.classList.add("no");SFX.bad();buzz(30);miss++;mark(sl,0);SES.mist.add(sl);setTimeout(()=>{a.classList.remove("no","sel");b.classList.remove("no","sel")},450)}
    sl=sr=null};
  lb.querySelectorAll("[data-l]").forEach(b=>b.onclick=()=>{lb.querySelectorAll("[data-l]").forEach(x=>x.classList.remove("sel"));b.classList.add("sel");sl=b.dataset.l;say(BYID[sl].zh);tryPair()});
  lb.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{tick();lb.querySelectorAll("[data-r]").forEach(x=>x.classList.remove("sel"));b.classList.add("sel");sr=b.dataset.r;tryPair()})}

function simScore(a,b){const n=x=>x.toLowerCase().replace(/[^\u4e00-\u9fffa-z0-9]/g,"");a=n(a);b=n(b);if(!b.length)return 0;
  const m=Array.from({length:a.length+1},()=>new Array(b.length+1).fill(0));for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=a[i-1]===b[j-1]?m[i-1][j-1]+1:Math.max(m[i-1][j],m[i][j-1]);
  return m[a.length][b.length]/Math.max(b.length,a.length*.8)}
function rSpeak(e,lb){const it=e.item;let tries=0,stop=null;
  lb.innerHTML=`<div class="tag">🎙️ Speak this sentence</div><div class="prompt">${bao("happy",58)}<div class="bubble"><div style="display:flex;gap:10px;align-items:center"><button class="sb sm" id="a1">🔊</button><div class="zh">${esc(it.zh)}</div></div><div class="py" style="text-align:left;font-size:15px">${esc(it.py)}</div></div></div>
  <div style="text-align:center"><button class="mic" id="mic"><span>🎙️</span></button><div class="micl" id="micl">Tap and say it out loud</div><div class="heard" id="heard"></div><button class="reveal" id="nospk" style="margin-top:14px">Can't speak now</button></div>`;
  $("#lf").innerHTML="";const mic=$("#mic"),ml=$("#micl"),hd=$("#heard");
  $("#a1").onclick=()=>say(it.zh);say(it.zh);
  $("#nospk").onclick=()=>{if(stop)stop();S.noSpeakUntil=Date.now()+15*60e3;save();tick();toast("🎙️ Speaking exercises paused for 15 minutes");SES.q[SES.i]={type:pickType(it,"speak"),item:it};step()};
  mic.onclick=()=>{if(stop){stop();return}hush();tick();mic.classList.add("on");ml.textContent="Listening… tap to stop";hd.innerHTML="";
    stop=ASR.listen((err,alts)=>{stop=null;mic.classList.remove("on");ml.textContent="Tap and say it out loud";
      if(err&&!alts.length){if(/not-allowed|service-not-allowed/.test(err)){hd.innerHTML=`<b style="color:var(--r)">Microphone is blocked.</b><br>Allow mic access for this app in Settings, or tap "Can't speak now".`;buzz(30);return}
        hd.innerHTML=`<b style="color:var(--o)">Didn't catch that. Try again.</b>`;buzz(20);return}
      const sc=Math.max(...alts.map(a=>simScore(a,it.zh)));hd.innerHTML=`You said: <span class="zh">${esc(alts[0])}</span>`;
      if(sc>=.7)return check(true,it,"speak");
      if(++tries<2){SFX.bad();buzz(30);hd.innerHTML+=`<br><b style="color:var(--r)">Not quite. One more try!</b>`;mic.classList.add("shake");setTimeout(()=>mic.classList.remove("shake"),450);return}
      check(false,it,"speak")},t=>{hd.innerHTML=`<span class="zh">${esc(t)}</span>`})}}
function check(ok,it,type){const s=SES,d=D();s.tot++;mark(it.id,ok);
  const lb=$("#lb");lb.querySelectorAll("button").forEach(b=>{if(!b.classList.contains("sb"))b.disabled=true});
  lb.querySelectorAll(".opt.sel").forEach(b=>b.classList.add(ok?"good":"bad"));const an=$("#ans");if(an)an.classList.add(ok?"good":"bad");
  let mood,head,sub;
  if(ok){s.ok++;s.combo++;s.best=Math.max(s.best,s.combo);d.correct++;if(type==="listen")d.listen++;d.combo=Math.max(d.combo,s.combo);S.stats.bestCombo=Math.max(S.stats.bestCombo,s.combo);
    const p=rand(PRAISE);mood=s.combo>=3?"cheer":"happy";head=p[2];sub=`${p[0]} ${p[1]}`+(s.combo>=3?` · 🔥 ${s.combo} in a row`:"");SFX.ok();
    const ms=[3,5,10,15,20,25,30].includes(s.combo);buzz(ms?[15,50,15,50,30]:15);
    if(ms)setTimeout(()=>{SFX.combo();banner("cheer",`${s.combo} in a row!`,s.combo>=10?"厉害 lìhai · unstoppable!":s.combo>=5?"🔥 You're on fire!":"Keep the streak going")},250)}
  else{const wasCombo=s.combo;s.combo=0;s.mist.add(it.id);s.q.push(s.ex(it));mood="sad";head=rand(OOPS);sub=wasCombo>=5?`${wasCombo}-answer streak lost. You'll see this again.`:"We'll bring this one back later.";SFX.bad();buzz([40,50,40]);
    if(!s.opt.practice){loseHeart();s.hl++;setTimeout(SFX.heart,180);const lh=$("#lh");lh.innerHTML=`❤️ <span>${S.hearts}</span><span class="minus">-1</span>`;lh.classList.add("shake");setTimeout(()=>lh.classList.remove("shake"),500);stats()}}
  save();$("#pgw").classList.toggle("hot",s.combo>=5);$("#cb").textContent=s.combo>=3?`🔥${s.combo}`:"";
  $("#pg").style.width=((s.i+1)/s.q.length*100)+"%";
  $("#lf").innerHTML=`<div class="fb ${ok?"good":"bad"}"><div class="in2"><div class="fbh">${bao(mood,56,ok&&s.combo>=3?"jump":ok?"":"shk")}<div><h5>${esc(head)}</h5><div class="sub">${esc(sub)}</div></div></div>
  <div class="ca"><button class="mini" id="fa">🔊</button><div>${ok?"":`<div style="font-size:13px;font-weight:900;text-transform:uppercase;opacity:.8">Correct answer</div>`}<span class="zh">${esc(it.zh)}</span><small>${esc(it.py)} · ${esc(it.en)}</small></div></div>
  <button class="btn ${ok?"":"red"}" id="go">${ok?"Continue":"Got it"}</button></div></div>`;
  $("#fa").onclick=()=>say(it.zh);if(!ok)setTimeout(()=>say(it.zh),400);
  $("#go").onclick=()=>{tick();if(!s.opt.practice&&S.hearts<=0){return heartsModal(true)}s.i++;step()}}

/* ================= END-OF-SESSION SEQUENCE ================= */
function finish(){const s=SES,d=D();s.done=true;document.querySelectorAll('.banner').forEach(b=>b.remove());const acc=s.tot?Math.round(s.ok/s.tot*100):100,perfect=!s.mist.size,secs=Math.round((Date.now()-s.t0)/1000);
  const xb=[["Session complete",10]];if(perfect)xb.push(["Perfect bonus",5]);if(s.best>=10)xb.push(["10+ combo",5]);else if(s.best>=5)xb.push(["5+ combo",3]);if(s.opt.lesson&&S.done[s.opt.lesson])xb.push(["Crown level-up",5]);
  const xp=xb.reduce((a,b)=>a+b[1],0);const gems=s.opt.practice?0:5+(perfect?5:0);let heartGain=0;
  S.xp+=xp;d.xp+=xp;S.gems+=gems;if(acc>=90)d.p90++;if(perfect)S.stats.perfect++;
  if(s.opt.practice){S.stats.practice++;if(S.hearts<MAXH){S.hearts++;heartGain=1;if(S.hearts>=MAXH)S.heartTs=Date.now()}}
  let crown=0;if(s.opt.lesson){S.done[s.opt.lesson]=(S.done[s.opt.lesson]||0)+1;crown=Math.min(5,S.done[s.opt.lesson]);S.stats.lessons++;d.lessons++}
  const t=today();let ext=false;if(S.last!==t){const y=addDays(t,-1);S.streak=S.last===y?S.streak+1:1;S.last=t;ext=true;if(!S.days.includes(t))S.days.push(t);S.days=S.days.slice(-60)}S.best=Math.max(S.best,S.streak);
  const newAch=ACH.filter(a=>!S.ach[a.id]&&a.f());newAch.forEach(a=>S.ach[a.id]=t);
  const newQ=d.q.map((q,i)=>!s.qd0[i]&&qDone(q)?i:-1).filter(i=>i>=0);
  const newUnit=UNITS.map((_,i)=>!s.ud0[i]&&unitDone(i)?i:-1).filter(i=>i>=0);
  const lv1=levelOf(S.xp);save();stats();
  const screens=[];
  screens.push(()=>{const title=perfect?"Perfect "+(s.opt.practice?"practice!":"lesson!"):s.opt.practice?"Practice complete!":"Lesson complete!";
    const accL=acc>=95?"Amazing":acc>=85?"Great":acc>=70?"Good":"Keep going";
    return{html:`<div class="end">${bao("cheer",120,"jump")}<h2 style="color:${perfect?"var(--y)":"var(--g)"}">${title}</h2><p class="sub">${perfect?"No mistakes. 完美 wánměi!":acc>=80?"太棒了 tài bàng le! Solid work.":"Every mistake now is one you won't make at the factory."}</p>
      <div class="kpis"><div class="kpi" style="border-color:var(--y);animation-delay:.1s"><b style="background:var(--y)">Total XP</b><span style="color:var(--yd)" id="k1">0</span></div><div class="kpi" style="border-color:var(--g);animation-delay:.25s"><b style="background:var(--g)">${accL}</b><span style="color:var(--gd)" id="k2">0%</span></div><div class="kpi" style="border-color:var(--b);animation-delay:.4s"><b style="background:var(--b)">Time</b><span style="color:var(--bd)">${Math.floor(secs/60)}:${String(secs%60).padStart(2,"0")}</span></div></div>
      <div class="chips">${xb.map((x,i)=>`<span class="chip" style="animation-delay:${.5+i*.1}s">⚡ ${x[0]} +${x[1]}</span>`).join("")}${gems?`<span class="chip" style="animation-delay:.9s;border-color:#84d8ff">💎 +${gems} gems</span>`:""}${heartGain?`<span class="chip" style="animation-delay:1s;border-color:#ffc1c1">❤️ +1 heart</span>`:""}${crown?`<span class="chip" style="animation-delay:1.1s;border-color:var(--y)">👑 Crown ${crown}/5</span>`:""}${s.best>=3?`<span class="chip" style="animation-delay:1.2s;border-color:#ffcf99">🔥 Best combo ${s.best}</span>`:""}</div>
      ${s.mist.size?`<div class="mist"><h4>Review your mistakes</h4>${[...s.mist].map(id=>rowHTML(BYID[id])).join("").replace(/margin:0 16px/g,"")}</div>`:""}</div>`,
    fx:()=>{SFX.fanfare();confetti();buzz([30,60,30,60,80]);countUp($("#k1"),xp,900);countUp($("#k2"),acc,900,"","%")}}});
  newUnit.forEach(ui=>screens.push(()=>({html:`<div class="end"><div style="font-size:90px;animation:popin .5s">${UNITS[ui].ic}</div><h2 style="color:${UNITS[ui].c}">Unit ${ui+1} complete!</h2><p class="sub">You finished <b>${esc(UNITS[ui].t)}</b>. A reward chest is waiting on the path 🎁</p>${bao("cheer",100,"jump")}</div>`,fx:()=>{SFX.level();confetti(180)}})));
  if(ext)screens.push(()=>({html:`<div class="end"><div class="flame">🔥</div><div class="bignum" id="sk">${Math.max(0,S.streak-1)}</div><h2 style="color:var(--o);margin-top:4px">day streak!</h2><p class="sub">${S.streak===1?"You started a streak! Come back tomorrow to keep it alive.":[3,7,14,30,50,100,365].includes(S.streak)?`🏅 ${S.streak}-day milestone! 坚持 jiānchí, keep at it.`:"You extended your streak. 加油 jiāyóu!"}</p>${weekHTML()}${S.freezes?`<p class="sub">🧊 ${S.freezes} streak freeze${S.freezes>1?"s":""} equipped</p>`:""}</div>`,fx:()=>{setTimeout(()=>{const e=$("#sk");if(e){e.textContent=S.streak;e.classList.add("pop")}SFX.combo();buzz([20,40,60])},700)}}));
  if(s.gx0<S.goal&&d.xp>=S.goal)screens.push(()=>({html:`<div class="end"><div style="font-size:90px;animation:popin .5s">🎯</div><h2 style="color:var(--y)">Daily goal reached!</h2><p class="sub">${d.xp} / ${S.goal} XP today. That's how habits are built.</p>${bao("cheer",100,"jump")}</div>`,fx:()=>{SFX.fanfare();confetti(100)}}));
  if(newQ.length)screens.push(()=>({html:`<div class="end">${bao("wow",100)}<h2 style="color:var(--o)">Quest${newQ.length>1?"s":""} complete!</h2><p class="sub">Open your chest${newQ.length>1?"s":""} to collect gems.</p><div style="text-align:left">${newQ.map(i=>{const q=d.q[i];return `<div class="quest"><span class="ic">${q.ic}</span><div class="t"><b>${esc(q.t)}</b><div class="bar"><i style="width:100%;background:var(--g)"></i><em>${q.goal} / ${q.goal}</em></div></div><button class="qchest ready" data-endclaim="${i}">🎁</button></div>`}).join("")}</div></div>`,
    fx:()=>{SFX.coin();document.querySelectorAll("[data-endclaim]").forEach(b=>b.onclick=()=>{const i=+b.dataset.endclaim;if(d.claimed.includes(i))return;d.claimed.push(i);S.gems+=d.q[i].rw;save();stats();b.textContent="📭";b.classList.remove("ready");b.insertAdjacentHTML("afterend",`<b style="color:var(--b);animation:popin .3s">+💎${d.q[i].rw}</b>`);SFX.coin();confetti(50);buzz(20)})}}));
  if(lv1>s.lv0)screens.push(()=>({html:`<div class="end"><div style="font-size:30px;font-weight:900;color:var(--p)">LEVEL UP!</div><div style="font-size:110px;font-weight:900;color:var(--p);animation:popin .6s;line-height:1.1">${lv1}</div>${bao("cheer",100,"jump")}<p class="sub">You reached level ${lv1}. ${lv1>=5?"Your suppliers will notice.":"Keep stacking XP."}</p></div>`,fx:()=>{SFX.level();confetti(160);buzz([50,50,50,50,120])}}));
  newAch.forEach(a=>screens.push(()=>({html:`<div class="end"><div style="font-size:14px;font-weight:900;color:var(--y);letter-spacing:1px">ACHIEVEMENT UNLOCKED</div><div style="font-size:100px;animation:popin .6s">${a.ic}</div><h2>${esc(a.t)}</h2><p class="sub">${esc(a.d)}</p></div>`,fx:()=>{SFX.fanfare();confetti(110);buzz([30,30,90])}})));
  let k=0;const show=()=>{if(k>=screens.length)return endLesson();const sc=screens[k++]();$("#lb").innerHTML=sc.html;$("#lb").scrollTop=0;bindAll($("#lb"));$("#pg").style.width="100%";foot(k>=screens.length?"Continue":"Next",()=>{tick();show()});sc.fx&&sc.fx()};show()}

/* keyboard: 1-4 pick, Enter continue */
document.addEventListener("keydown",e=>{if(!SES||$("#modal").innerHTML)return;if(/^[1-4]$/.test(e.key)){const o=document.querySelectorAll(".opt")[+e.key-1];o&&!o.disabled&&o.click()}else if(e.key==="Enter"){const g=$("#go");g&&!g.disabled&&g.click()}});

D();checkStreak();render();setInterval(stats,30000);
