/* BASELINE — Strength mode (iOS) prototype logic.
   Data objects at the top are the spec for the data model (see README → State & data). */
(function(){
var $=function(s){return document.querySelector(s)},$$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
var P=new URLSearchParams(location.search),BARE=P.has('bare');
var r1=function(n){return Math.round(n*10)/10},f1=function(n){return r1(n).toFixed(1).replace(/\.0$/,'')};
var e1=function(l,r,rir){return l*(1+(r+(rir||0))/30)}; // RIR-adjusted Epley
var mmss=function(s){s=Math.ceil(s);return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2)};
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var dstr=function(d){return MON[d.getMonth()]+' '+d.getDate()};

/* ---------- data ---------- */
var MUSCLES=[
{id:'chest',n:'Chest',a:'CHEST',sets:8,band:[10,14,18],sore:1},
{id:'back',n:'Back',a:'BACK',sets:14,band:[12,16,20],sore:1},
{id:'fdelt',n:'Front delts',a:'F DELT',sets:9,band:[6,10,14],sore:0},
{id:'sdelt',n:'Side delts',a:'SD',sets:10,band:[10,14,20],sore:0},
{id:'rdelt',n:'Rear delts',a:'RD',sets:6,band:[6,10,14],sore:0},
{id:'bi',n:'Biceps',a:'BI',sets:9,band:[8,12,16],sore:0},
{id:'tri',n:'Triceps',a:'TRI',sets:12,band:[8,12,16],sore:2},
{id:'quad',n:'Quads',a:'QUADS',sets:12,band:[10,14,18],sore:2},
{id:'ham',n:'Hamstrings',a:'HAMS',sets:8,band:[8,11,14],sore:2},
{id:'glute',n:'Glutes',a:'GLUTES',sets:6,band:[4,8,12],sore:1},
{id:'calf',n:'Calves',a:'CALVES',sets:6,band:null,empty:'Band not learned yet · 3 of 6 weeks logged'},
{id:'abs',n:'Abs',a:'ABS',sets:0,band:null,empty:'No ab sets logged · 6 weeks of sets learns a band'}
];
var MB={};MUSCLES.forEach(function(m){MB[m.id]=m});
var EX=[
{n:'Barbell bench press',sh:'Bench',m:'chest',main:true,inc:2.5,lastDate:'Sep 20',last:[[100,8,2],[100,7,1],[100,6,1]],plan:[[102.5,8],[102.5,8],[102.5,8],[102.5,7]]},
{n:'Incline DB press',sh:'Incline',m:'chest',inc:2,lastDate:'Sep 20',last:[[34,10,2],[34,9,1],[34,8,1]],plan:[[34,10],[34,10],[34,9]]},
{n:'Cable fly',sh:'Fly',m:'chest',inc:2.5,lastDate:'Sep 20',last:[[18,14,2],[18,12,1]],plan:[[18,14],[18,13]]},
{n:'Overhead press',sh:'OHP',m:'fdelt',main:true,inc:2.5,lastDate:'Sep 20',last:[[60,6,2],[60,6,2],[60,5,1]],plan:[[60,6],[60,6],[60,5]]},
{n:'Triceps pushdown',sh:'Pushdown',m:'tri',inc:2.5,lastDate:'Sep 20',last:[[32,12,2],[32,11,1]],plan:[[32,12],[32,11]]},
{n:'Overhead triceps extension',sh:'OH ext',m:'tri',inc:2.5,lastDate:'Sep 20',last:[[22,12,2],[22,10,1]],plan:[[22,12],[22,10]]}
];
var LIB=[
{n:'Machine chest press',sh:'Machine',m:'chest',inc:5,lastDate:'Sep 13',last:[[70,10,2],[70,9,1]]},
{n:'Lateral raise',sh:'Lateral',m:'sdelt',inc:1,lastDate:'Sep 24',last:[[12,15,2],[12,14,1],[12,12,1]]},
{n:'Dips',sh:'Dips',m:'tri',inc:2.5,lastDate:'Aug 30',last:[[20,10,2],[20,8,1]]},
{n:'Pec deck',sh:'Pec deck',m:'chest',inc:5,last:null},
{n:'Skull crusher',sh:'Skulls',m:'tri',inc:2.5,last:null}
];
var LIFTS=[
{n:'Bench',d:[125,126,127,127.5,128,129,129.5,130,131,132,133.3,133.3]},
{n:'Squat',d:[154,155,156,157.5,158,159,159,160,161,162.5,164,165]},
{n:'Overhead press',d:[74,75,75.5,76,76,76.5,76,76,75.5,76,76,76]},
{n:'Deadlift',d:null,empty:'Logged twice in 8 weeks. A trend needs 4 sessions.'}
];
var RAMP={plan:[96,104,112,120,128,64],done:[94,106,111,100,null,null],today:16,cur:3};
var REST_S=180; // experiment block 3 = arm B, 3 min
var TAGS_FRONT=[['sdelt',1,1,1,1],['fdelt',2,2,1,1],['sdelt',4,1,1,1],['bi',1,1,2,1],['chest',2,2,2,1],['bi',4,1,2,1],['abs',2,2,3,1],['quad',2,2,4,1]];
var TAGS_BACK=[['rdelt',1,1,1,1],['back',2,2,1,2],['rdelt',4,1,1,1],['tri',1,1,2,1],['tri',4,1,2,1],['glute',2,2,3,1],['ham',2,2,4,1],['calf',2,2,5,1]];
var VARS=[
{id:'sleep',n:'Sleep extension',A:'Usual bedtime',B:'+60 min in bed',len:[1,2]},
{id:'carbs',n:'Pre-workout carbs',A:'No carbs 2 h before',B:'60 g carbs 60–90 min before',len:[1,2]},
{id:'caf',n:'Caffeine timing',A:'200 mg 30 min before',B:'200 mg on waking',len:[1,2]},
{id:'crea',n:'Creatine',A:'No creatine',B:'5 g every day',len:[4],note:'Creatine takes about 4 weeks to saturate muscle and as long to wash out, so blocks are fixed at 4 weeks.'},
{id:'freq',n:'Training frequency',A:'Each muscle 1× / week',B:'Each muscle 2× / week',len:[2],note:'Weekly sets stay the same in both arms; only how they are split changes.'},
{id:'rest',n:'Rest intervals',A:'90 s',B:'3 min',len:[1,2],running:true}
];

/* ---------- state ---------- */
var S={unit:'RIR',ex:0,load:102.5,reps:8,t0:Date.now()-18*60e3,restEnd:Date.now()+108e3,restTotal:REST_S,sessionDone:false};
EX.forEach(initEx);
function initEx(ex){ex.sets=(ex.plan||[[20,10],[20,10],[20,10]]).map(function(p,i){return{load:p[0],reps:p[1],rir:null,done:false,last:ex.last?ex.last[i]||null:null}});ex.sel=null}
EX[0].sets[0].rir=2;EX[0].sets[0].done=true;EX[0].sets[1].reps=7;EX[0].sets[1].rir=1;EX[0].sets[1].done=true;
var CK={mode:'evening',rpe:null,sore:{},protein:null,wt:84.7,pick:null};
var D={v:'carbs',o:'vol',rpe:8,lift:'Bench',len:1,n:6};

/* ---------- nav ---------- */
var MODAL={log:1,summary:1,checkin:1};
var TABOF={today:'today',log:'today',summary:'today',checkin:'today',body:'body',block:'body',mind:'mind',coach:'coach',goals:'goals'};
var cur_screen='today';
function go(name,opt){
  opt=opt||{};
  var id=(name==='coach'||name==='goals')?'stub':name;
  $$('.st-v').forEach(function(v){v.classList.toggle('on',v.id==='v-'+id)});
  if(id==='stub')$('#stub-h').textContent=name.toUpperCase();
  document.body.classList.toggle('modal',!!MODAL[name]);
  document.body.classList.toggle('logmode',name==='log');
  $$('.tab').forEach(function(t){t.classList.toggle('on',t.dataset.tab===TABOF[name])});
  cur_screen=name;
  if(name==='log')renderLog();
  if(name==='summary')renderSummary();
  if(name==='checkin')setMode(opt.mode||CK.mode);
  var v=$('#v-'+id);if(v)v.scrollTop=0;
  closeSheet();
  try{localStorage.setItem('baseline_strength_screen',name)}catch(e){}
}

/* ---------- log ---------- */
function curIdx(ex){if(ex.sel!=null)return ex.sel;for(var i=0;i<ex.sets.length;i++)if(!ex.sets[i].done)return i;return -1}
function rv(rir){if(rir==null)return '';return S.unit==='RIR'?(rir>=4?'4+':String(rir)):(rir>=4?'≤6':String(10-rir))}
function doneCount(){var d=0,t=0;EX.forEach(function(ex){ex.sets.forEach(function(s){t++;if(s.done)d++})});return[d,t]}
function bestE1(sets){var b=0;sets.forEach(function(s){if(s&&s.done!==false){var v=Array.isArray(s)?e1(s[0],s[1],s[2]):e1(s.load,s.reps,s.rir);if(v>b)b=v}});return b}
function syncWorking(){var ex=EX[S.ex],i=curIdx(ex);if(i<0)return;var s=ex.sets[i];if(!s.done&&i>0&&ex.sets[i-1].done&&s.load===ex.sets[i-1].load){}S.load=s.load;S.reps=s.reps}
function renderLog(){
  var ex=EX[S.ex],i=curIdx(ex),h='';
  EX.forEach(function(e,k){var d=e.sets.filter(function(s){return s.done}).length;h+='<button class="st-exc'+(k===S.ex?' on':'')+(d===e.sets.length?' done':'')+'" data-ex="'+k+'"><b>'+(k+1)+' · '+e.sh+'</b><span>'+d+' / '+e.sets.length+' sets</span></button>'});
  $('#exstrip').innerHTML=h;
  var meta='<span>'+MB[ex.m].n+'</span>';
  if(ex.last)meta+='<span>Last '+ex.lastDate+'</span>';else meta+='<span>First time logged</span>';
  if(ex.main&&ex.last){var lb=bestE1(ex.last),tb=bestE1(ex.sets.filter(function(s){return s.done}));meta+='<span>e1RM <b class="num">'+f1(lb)+'</b></span>';if(tb>lb)meta+='<span class="st-g">▲ '+f1(tb)+' today</span>'}
  $('#exhead').innerHTML='<div class="nm">'+ex.n+'</div><div class="mt">'+meta+'</div>';
  h='<div class="st-sh"><span>Set</span><span>'+(ex.last?'Last · '+ex.lastDate:'Last')+'</span><span>Today</span><span>'+S.unit+'</span></div>';
  if(!ex.last)h+='<div class="st-note">No previous session. Today\'s sets become the reference for next time.</div>';
  ex.sets.forEach(function(s,k){
    var st=s.done?'done':'next';if(k===i)st='active';
    var last=s.last?f1(s.last[0])+' × '+s.last[1]+'<i>'+S.unit+' '+rv(s.last[2])+'</i>':(ex.last?'<span class="new">+1 set · push</span>':'<span class="first">First time</span>');
    var ld=k===i?S.load:s.load,rp=k===i?S.reps:s.reps;
    h+='<div class="st-set '+st+(s.done&&k===i?' done':'')+'" data-set="'+k+'"><span class="no">'+(k+1)+'</span><span class="last">'+last+'</span><span class="now">'+f1(ld)+' × '+rp+'</span><span class="r">'+(s.done?rv(s.rir):'')+'</span></div>';
  });
  $('#sets').innerHTML=h;
  var dc=doneCount();$('#setct').textContent=dc[0]+' of '+dc[1]+' sets';
  $('#unitbtn').innerHTML=S.unit==='RIR'?'<b>RIR</b> / RPE':'RIR / <b>RPE</b>';
  renderDock();
}
function renderDock(){
  var ex=EX[S.ex],i=curIdx(ex),h='';
  if(S.restEnd){var left=(S.restEnd-Date.now())/1000,go=left<=0;
    h+='<div class="st-rest'+(go?' go':'')+'" id="rest"><div><div class="ov">'+(go?'Rest done':'Rest')+'</div><div class="x">Experiment · '+mmss(S.restTotal)+' rest</div></div><div class="tm num" id="rtm">'+(go?'GO':mmss(left))+'</div><div class="b"><button data-act="r-">−15</button><button data-act="r+">+15</button><button data-act="rx">'+(go?'Clear':'Skip')+'</button></div><div class="bar"><i id="rbar" style="width:'+Math.max(0,Math.min(100,(1-left/S.restTotal)*100))+'%"></i></div></div>';
  }else h+='<div class="st-rest idle">Rest timer starts when you log a set · '+mmss(REST_S)+' this block</div>';
  if(i>=0){
    var s=ex.sets[i];
    h+='<div class="st-cap"><span><b>Set '+(i+1)+'</b> · '+ex.sh+(s.done?' · editing':'')+'</span><span>'+(s.last?'Last '+f1(s.last[0])+' × '+s.last[1]+' · '+S.unit+' '+rv(s.last[2]):(ex.last?'New set today':'No previous set'))+'</span></div>';
    h+='<div class="st-steps"><div class="st-step"><button data-act="l-" aria-label="Less weight">−</button><div class="v"><b id="dl">'+f1(S.load)+'</b><span>kg</span></div><button data-act="l+" aria-label="More weight">+</button></div><div class="st-step"><button data-act="p-" aria-label="Fewer reps">−</button><div class="v"><b id="dr">'+S.reps+'</b><span>reps</span></div><button data-act="p+" aria-label="More reps">+</button></div></div>';
    var vals=S.unit==='RIR'?['0','1','2','3','4+']:['10','9','8','7','≤6'];
    h+='<div class="st-rirk"><span>Tap '+S.unit+' to log set '+(i+1)+'</span><span>'+(S.unit==='RIR'?'reps left in the tank':'how hard the set was')+'</span></div><div class="st-rir">';
    vals.forEach(function(v,k){h+='<button data-rir="'+k+'"'+(s.done&&s.rir===k?' class="on"':'')+'>'+v+'</button>'});
    h+='</div>';
  }else{
    var nx=EX[S.ex+1];
    h+='<div class="st-cap"><span><b>'+ex.sh+' done</b> · '+ex.sets.length+' sets</span><span>'+doneCount()[0]+' of '+doneCount()[1]+' session sets</span></div>';
    h+=nx?'<button class="st-next" data-act="nextex">Next · '+nx.n+' ›</button>':'<button class="st-next" data-act="finish">Finish session ›</button>';
  }
  $('#dock').innerHTML=h;
  requestAnimationFrame(function(){$('#v-log').style.paddingBottom=($('#dock').offsetHeight+16)+'px'});
}
function logSet(rir){
  var ex=EX[S.ex],i=curIdx(ex);if(i<0)return;var s=ex.sets[i],was=s.done,prev={load:s.load,reps:s.reps,rir:s.rir,done:s.done};
  s.load=S.load;s.reps=S.reps;s.rir=rir;s.done=true;ex.sel=null;
  for(var k=i+1;k<ex.sets.length;k++)if(!ex.sets[k].done&&ex.sets[k].load<s.load&&!ex.last)ex.sets[k].load=s.load;
  if(!was){S.restEnd=Date.now()+REST_S*1000;S.restTotal=REST_S}
  syncWorking();renderLog();
  toast('Set '+(i+1)+' · '+f1(s.load)+' × '+s.reps+' · '+S.unit+' '+rv(rir),'Undo',function(){Object.assign(s,prev);if(!was)S.restEnd=null;ex.sel=i;syncWorking();renderLog()});
}

/* ---------- summary ---------- */
function renderSummary(){
  var mins=Math.max(1,Math.round((Date.now()-S.t0)/60000)),vol=0,lvol=0,dc=doneCount(),top=null,topE=0;
  EX.forEach(function(ex){ex.sets.forEach(function(s){if(s.done){vol+=s.load*s.reps;if(ex.main){var v=e1(s.load,s.reps,s.rir);if(v>topE){topE=v;top={ex:ex,s:s}}}}});if(ex.last)ex.last.forEach(function(l){lvol+=l[0]*l[1]})});
  var dv=lvol?Math.round((vol-lvol)/lvol*100):0;
  var h='<div class="st-lh"><div class="c"><div class="t">Session logged</div><div class="s">Push A · Sun, Sep 27</div></div></div><div class="wrap"><div class="stack-lg"><div class="mgrid">';
  h+='<div class="mcard"><div class="k">Volume</div><div class="v num">'+Math.round(vol).toLocaleString('en-US')+'<small> kg</small></div><div class="t '+(dv>=0?'st-g':'st-a')+'">'+(dv>=0?'▲ ':'▼ ')+Math.abs(dv)+'% vs Sep 20</div></div>';
  h+='<div class="mcard"><div class="k">Sets</div><div class="v num">'+dc[0]+'<small> / '+dc[1]+'</small></div><div class="t">'+mins+' min · last time 68</div></div></div>';
  h+='<div class="panel"><div class="ph"><span class="ov">Top set</span></div>'+(top?'<div class="st-kv"><span class="n">'+top.ex.n+'<span>'+S.unit+' '+rv(top.s.rir)+'</span></span><span class="v num">'+f1(top.s.load)+' × '+top.s.reps+'</span></div>':'<div class="st-dnote" style="margin:0">No main-lift sets logged in this session, so there is no top set.</div>')+'</div>';
  h+='<div class="panel"><div class="ph"><span class="ov">Estimated 1RM · vs last time</span></div>';
  EX.filter(function(e){return e.main}).forEach(function(ex){var lb=bestE1(ex.last),done=ex.sets.filter(function(s){return s.done}),tb=bestE1(done);
    if(!done.length){h+='<div class="st-kv"><span class="n">'+ex.sh+'<span>No sets logged today</span></span><span class="v num">'+f1(lb)+'</span></div>';return}
    var d=tb-lb;h+='<div class="st-kv"><span class="n">'+ex.sh+'<span>'+f1(lb)+' → '+f1(tb)+' kg</span></span><span class="v num '+(d>0?'st-g':d<0?'st-a':'')+'">'+(d>0?'+':'')+f1(d)+'<small style="color:var(--faint)">kg</small></span></div>'});
  h+='</div><div class="panel"><div class="ph"><span class="ov">Weekly sets after today</span></div>';
  var add={};EX.forEach(function(ex){add[ex.m]=(add[ex.m]||0)+ex.sets.filter(function(s){return s.done}).length});
  Object.keys(add).forEach(function(id){var m=MB[id],t=m.sets+add[id];if(!m.band)return;var st=t<m.band[0]?['Under your min','st-a']:t>m.band[2]?['Over your max','st-a']:['In your band','st-g'];
    h+='<div class="st-kv"><span class="n">'+m.n+'<span>+'+add[id]+' today · band '+m.band[0]+'–'+m.band[2]+'</span></span><span class="v num">'+t+'<small class="'+st[1]+'">'+st[0]+'</small></span></div>'});
  h+='</div><button class="st-link" data-go="checkin" data-mode="evening"><span class="k">Tonight</span><span class="t">Evening check-in</span><span class="s">Session RPE · soreness · protein</span></button><button class="btn block" data-act="sumdone" style="min-height:54px">Done</button></div></div>';
  $('#v-summary').innerHTML=h;
}

/* ---------- body ---------- */
function pc(v){return (Math.min(v,24)/24*100)+'%'}
function renderBands(){
  var plan={};EX.forEach(function(ex){plan[ex.m]=(plan[ex.m]||0)+ex.sets.length});var h='';
  MUSCLES.forEach(function(m){
    if(!m.band){h+='<div class="st-band"><span class="n">'+m.n+'</span><span class="emp">'+m.empty+'</span><span class="v num">'+m.sets+'<small> sets</small></span></div>';return}
    var st=m.sets<m.band[0]?'low':m.sets>m.band[2]?'over':'in',td=plan[m.id]||0;
    h+='<div class="st-band '+st+'"><span class="n">'+m.n+'</span><span class="st-track"><i class="bd" style="left:'+pc(m.band[0])+';width:'+pc(m.band[2]-m.band[0])+'"></i><i class="ad" style="left:'+pc(m.band[1])+'"></i><i class="cur" style="width:'+pc(m.sets)+'"></i>'+(td?'<i class="td" style="left:'+pc(m.sets)+';width:'+pc(td)+'"></i>':'')+'</span><span class="v num">'+m.sets+'<small> / '+m.band[0]+'–'+m.band[2]+'</small></span></div>';
  });
  $('#bands').innerHTML=h;
}
function spark(d){var mn=Math.min.apply(0,d),mx=Math.max.apply(0,d),rg=mx-mn||1;return '<svg viewBox="0 0 120 34" preserveAspectRatio="none"><polyline fill="none" stroke="var(--gold)" stroke-width="1.8" vector-effect="non-scaling-stroke" points="'+d.map(function(v,i){return (i/(d.length-1)*120).toFixed(1)+','+(30-(v-mn)/rg*26).toFixed(1)}).join(' ')+'"></polyline></svg>'}
function renderE1(){var h='';LIFTS.forEach(function(l){
  if(!l.d){h+='<div class="mcard st-e1 empty"><div class="k">'+l.n+'</div><div class="v">Not enough data</div><div class="t">'+l.empty+'</div></div>';return}
  var d=l.d[11]-l.d[0];h+='<div class="mcard st-e1"><div class="k">'+l.n+'</div><div class="v num">'+f1(l.d[11])+'<small> kg</small></div><div class="t">'+(d>0?'<b>+'+f1(d)+'</b> in 12 wks':'Flat · '+(d>=0?'+':'')+f1(d)+' in 12 wks')+'</div>'+spark(l.d)+'</div>'});
  $('#e1rm').innerHTML=h}
function renderMap(el,sore,edit){
  var fig=function(cap,t){var h='<div class="st-fig"><div class="cap">'+cap+'</div><div class="st-fg">';t.forEach(function(x){var m=MB[x[0]],v=sore[x[0]]||0;h+='<button class="st-tile s'+v+(edit&&CK.pick===x[0]?' pick':'')+'" data-m="'+x[0]+'" style="grid-column:'+x[1]+' / span '+x[2]+';grid-row:'+x[3]+' / span '+x[4]+'"'+(edit?'':' tabindex="-1"')+' aria-label="'+m.n+' soreness '+v+'">'+m.a+'<b>'+v+'</b></button>'});return h+'</div></div>'};
  el.innerHTML=fig('Front',TAGS_FRONT)+fig('Back',TAGS_BACK);
}
function renderRamp(){var mx=128,h='';RAMP.plan.forEach(function(p,i){var d=RAMP.done[i],cls=i===RAMP.cur?'cur':i===5?'dl':'',H=p/mx*96;
  h+='<div class="c '+cls+'"><span class="n num">'+(d!=null?d+(i===RAMP.cur?'+'+RAMP.today:''):p)+'<small>'+(d!=null?'of '+p:'planned')+'</small></span><span class="bx" style="height:'+H+'px">'+(d!=null?'<i style="height:'+(d/p*100)+'%"></i>':'')+(i===RAMP.cur?'<em style="bottom:'+(d/p*100)+'%;height:'+(RAMP.today/p*100)+'%"></em>':'')+'</span></div>'});
  $('#ramp').innerHTML=h}

/* ---------- check-in ---------- */
var WT=(function(){var a=[];for(var i=0;i<28;i++)a.push(r1(83.4+0.3/7*i+Math.sin(i*1.7)*0.35+Math.cos(i*0.9)*0.2));a[27]=84.7;return a})();
function avg7(a,i){var s=0,n=0;for(var k=Math.max(0,i-6);k<=i;k++){s+=a[k];n++}return s/n}
function renderWChart(){
  var W=325,H=120,y0=82.6,y1=85.8,X=function(i){return 6+i/28*(W-12)},Y=function(v){return H-6-(v-y0)/(y1-y0)*(H-12)};
  var base=83.3,lo=[],hi=[];for(var i=0;i<=28;i++){lo.push(X(i)+','+Y(base+0.25/7*i));hi.unshift(X(i)+','+Y(base+0.5/7*i))}
  var h='<polygon fill="color-mix(in oklch,var(--blue),transparent 78%)" points="'+lo.concat(hi).join(' ')+'"></polygon>';
  WT.forEach(function(v,i){h+='<rect x="'+(X(i)-1.5)+'" y="'+(Y(v)-1.5)+'" width="3" height="3" fill="var(--faint)"></rect>'});
  var pts=WT.map(function(v,i){return X(i)+','+Y(avg7(WT,i))});pts.push(X(28)+','+Y(avg7(WT.concat([CK.wt]),28)));
  h+='<polyline fill="none" stroke="var(--gold)" stroke-width="2" points="'+pts.join(' ')+'"></polyline>';
  h+='<rect x="'+(X(28)-4)+'" y="'+(Y(CK.wt)-4)+'" width="8" height="8" fill="var(--gold)" transform="rotate(45 '+X(28)+' '+Y(CK.wt)+')"></rect>';
  $('#wchart').innerHTML=h;$('#wavg').textContent=avg7(WT.concat([CK.wt]),28).toFixed(1);
}
function setMode(m){CK.mode=m;$$('#ckmode .opt').forEach(function(o){o.classList.toggle('on',o.dataset.mode===m)});$('#ck-evening').style.display=m==='evening'?'':'none';$('#ck-morning').style.display=m==='morning'?'':'none';if(m==='morning')renderWChart()}
function renderRPE(){var h='';for(var i=1;i<=10;i++)h+='<button class="'+(CK.rpe===i?'on':'')+'" data-rpe="'+i+'">'+i+'</button>';$('#rpe').innerHTML=h}
var SL=['None','Mild','Moderate','Severe'];

/* ---------- experiment designer ---------- */
function renderDesigner(){
  var v=VARS.filter(function(x){return x.id===D.v})[0];if(v.len.indexOf(D.len)<0)D.len=v.len[0];
  var h='<div class="st-dstep"><i>1</i>Variable</div><div class="chips">';
  VARS.forEach(function(x){h+='<button class="tagchip'+(x.id===D.v?' on':'')+'" data-var="'+x.id+'"'+(x.running?' disabled':'')+'>'+x.n+(x.running?' <small>Running</small>':'')+'</button>'});
  h+='</div><div class="st-arms"><div><b>A</b>'+v.A+'</div><div><b>B</b>'+v.B+'</div></div>'+(v.note?'<div class="st-dnote">'+v.note+'</div>':'');
  h+='<div class="st-dstep"><i>2</i>Outcome</div><div class="seg c2" id="d-o"><div class="opt'+(D.o==='vol'?' on':'')+'" data-o="vol">Volume at RPE</div><div class="opt'+(D.o==='e1'?' on':'')+'" data-o="e1">Estimated 1RM</div></div>';
  h+='<div class="st-dnote">'+(D.o==='vol'?'Load × reps on your top set at the prescribed RPE.':'From your top sets, RIR-adjusted.')+'</div>';
  if(D.o==='vol')h+='<div class="seg c3" style="margin-top:10px">'+[7,8,9].map(function(r){return '<div class="opt'+(D.rpe===r?' on':'')+'" data-rpe2="'+r+'">RPE '+r+'</div>'}).join('')+'</div>';
  h+='<div class="chips" style="margin-top:10px">'+['Bench','Squat','OHP','Deadlift'].map(function(l){return '<button class="tagchip'+(D.lift===l?' on':'')+'" data-lift="'+l+'"'+(l==='Deadlift'?' disabled':'')+'>'+l+'</button>'}).join('')+'</div><div class="st-dnote"><b>Deadlift</b> is off: logged twice in 8 weeks. Pick a lift you train every week.</div>';
  h+='<div class="st-dstep"><i>3</i>Randomized blocks</div><div class="seg '+(v.len.length>1?'c2':'c2')+'">'+v.len.map(function(l){return '<div class="opt'+(D.len===l?' on':'')+'" data-len="'+l+'">'+l+'-week blocks</div>'}).join('')+'</div>';
  h+='<div class="seg c3" style="margin-top:6px">'+[4,6,8].map(function(n){return '<div class="opt'+(D.n===n?' on':'')+'" data-n="'+n+'">'+n+' blocks</div>'}).join('')+'</div>';
  var wks=D.n*D.len,st=new Date(2026,9,19),en=new Date(st.getTime()+(wks*7-1)*864e5);
  h+='<div class="st-dnote">Blocks are drawn in balanced pairs (AB or BA). Each block\'s arm is revealed on its first Monday.</div>';
  h+='<div class="st-review"><b>'+v.n+':</b> '+v.A+' vs '+v.B+' → <b>'+(D.o==='vol'?D.lift+' volume at RPE '+D.rpe:D.lift+' estimated 1RM')+'</b>. '+D.n+' × '+D.len+'-week blocks, '+wks+' weeks, '+dstr(st)+' – '+dstr(en)+'. Starts after the rest-interval test ends. No interim results; the answer unlocks '+dstr(en)+'.</div>';
  h+='<button class="btn block" data-act="queue" style="margin-top:14px;min-height:54px">Queue experiment</button>';
  $('#designer').innerHTML=h;
}

/* ---------- toast / sheet ---------- */
var tt;function toast(t,b,fn){var el=$('#toast');$('#toast-t').textContent=t;var btn=$('#toast-b');btn.style.display=b?'':'none';btn.textContent=b||'';btn.onclick=function(){el.classList.remove('on');fn&&fn()};
  el.style.bottom=(document.body.classList.contains('logmode')?$('#dock').offsetHeight+10:100)+'px';el.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){el.classList.remove('on')},3200)}
function openSheet(){var q=($('#exsearch').value||'').toLowerCase();$('#exlist').innerHTML=LIB.filter(function(x){return x.n.toLowerCase().indexOf(q)>=0}).map(function(x){var i=LIB.indexOf(x);return '<button class="st-opt" data-lib="'+i+'"><span><b>'+x.n+'</b><span>'+MB[x.m].n+' · '+(x.last?'Last '+x.lastDate+' · '+f1(x.last[0][0])+' × '+x.last[0][1]:'No previous session')+'</span></span><i>+</i></button>'}).join('')||'<div class="st-dnote">No match. Exercises you log appear here.</div>';$('#sheet').classList.add('on')}
function closeSheet(){$('#sheet').classList.remove('on')}

/* ---------- today ---------- */
function updateToday(){
  var b=$('#startbtn');if(S.sessionDone){b.classList.add('done');b.dataset.go='summary';b.querySelector('.t').textContent='Push A logged';b.querySelector('.s').textContent='View session summary'}
}

/* ---------- events ---------- */
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-go],[data-act],[data-tab],[data-ex],[data-set],[data-rir],[data-lib],[data-m],[data-rpe],[data-var],[data-o],[data-rpe2],[data-lift],[data-len],[data-n],#ckmode .opt,#protein .opt,#ck-tags .tagchip,#sheet');
  if(!t)return;var d=t.dataset;
  if(t.id==='sheet'){if(e.target===t)closeSheet();return}
  if(d.tab){go(d.tab);return}
  if(d.go){go(d.go,{mode:d.mode});return}
  if(d.ex!=null){S.ex=+d.ex;syncWorking();renderLog();return}
  if(d.set!=null){var ex=EX[S.ex];ex.sel=+d.set;syncWorking();renderLog();return}
  if(d.rir!=null){logSet(+d.rir);return}
  if(d.lib!=null){var x=JSON.parse(JSON.stringify(LIB[+d.lib]));x.plan=x.last?x.last.map(function(l){return[l[0],l[1]]}):null;initEx(x);EX.push(x);S.ex=EX.length-1;syncWorking();closeSheet();renderLog();toast(x.n+' added');return}
  if(d.m){if(!t.closest('.edit'))return;var v=((CK.sore[d.m]||0)+1)%4;CK.sore[d.m]=v;CK.pick=d.m;renderMap($('#map-ck'),CK.sore,true);$('#ck-readout').innerHTML=MB[d.m].n+' → <b>'+v+'</b>'+SL[v];return}
  if(d.rpe){CK.rpe=+d.rpe;renderRPE();return}
  if(t.closest('#ckmode')){setMode(d.mode);return}
  if(t.closest('#protein')){$$('#protein .opt').forEach(function(o){o.classList.toggle('on',o===t)});CK.protein=t.textContent;return}
  if(t.closest('#ck-tags')){t.classList.toggle('on');return}
  if(d.var){if(t.disabled)return;D.v=d.var;renderDesigner();return}
  if(d.o){D.o=d.o;renderDesigner();return}
  if(d.rpe2){D.rpe=+d.rpe2;renderDesigner();return}
  if(d.lift){if(t.disabled)return;D.lift=d.lift;renderDesigner();return}
  if(d.len){D.len=+d.len;renderDesigner();return}
  if(d.n){D.n=+d.n;renderDesigner();return}
  var a=d.act,ex=EX[S.ex];
  if(a==='close'){go('today');return}
  if(a==='unit'){S.unit=S.unit==='RIR'?'RPE':'RIR';renderLog();return}
  if(a==='l-'||a==='l+'){S.load=Math.max(0,r1(S.load+(a==='l+'?ex.inc:-ex.inc)));renderLog();return}
  if(a==='p-'||a==='p+'){S.reps=Math.max(1,S.reps+(a==='p+'?1:-1));renderLog();return}
  if(a==='r-'){S.restEnd-=15e3;renderDock();return}
  if(a==='r+'){S.restEnd=Math.max(S.restEnd,Date.now())+15e3;renderDock();return}
  if(a==='rx'){S.restEnd=null;renderDock();return}
  if(a==='addset'){var l=ex.sets[ex.sets.length-1];ex.sets.push({load:l?l.load:20,reps:l?l.reps:10,rir:null,done:false,last:null});ex.sel=null;syncWorking();renderLog();toast('Set '+ex.sets.length+' added to '+ex.sh);return}
  if(a==='addex'){$('#exsearch').value='';openSheet();return}
  if(a==='nextex'){S.ex=Math.min(EX.length-1,S.ex+1);syncWorking();renderLog();return}
  if(a==='finish'){S.sessionDone=true;S.restEnd=null;updateToday();go('summary');return}
  if(a==='sumdone'){go('today');return}
  if(a==='saveck'){$('#lk-evening').classList.add('done');$('#lk-evening-s').textContent='Saved'+(CK.rpe?' · RPE '+CK.rpe:'')+(CK.protein?' · protein '+CK.protein.toLowerCase():'');go('today');toast('Evening check-in saved');return}
  if(a==='w-'||a==='w+'){CK.wt=r1(CK.wt+(a==='w+'?0.1:-0.1));$('#wt').textContent=CK.wt.toFixed(1);renderWChart();return}
  if(a==='savewt'){$('#lk-morning').classList.add('done');$('#lk-morning-s').textContent=CK.wt.toFixed(1)+' kg · 7-day avg '+$('#wavg').textContent;go('today');toast('Weight saved · '+CK.wt.toFixed(1)+' kg');return}
  if(a==='queue'){toast('Queued · starts Mon, Oct 19');return}
});
$('#exsearch').addEventListener('input',openSheet);

/* ---------- clock ---------- */
setInterval(function(){
  if(cur_screen!=='log')return;
  $('#elapsed').textContent=mmss((Date.now()-S.t0)/1000);
  if(S.restEnd){var left=(S.restEnd-Date.now())/1000,r=$('#rest');if(!r)return;
    if(left<=0&&!r.classList.contains('go'))renderDock();
    else if(left>0){if(r.classList.contains('go'))renderDock();$('#rtm').textContent=mmss(left);$('#rbar').style.width=Math.max(0,Math.min(100,(1-left/S.restTotal)*100))+'%'}}
},250);

/* ---------- init ---------- */
renderBands();renderE1();renderMap($('#map-body'),(function(){var o={};MUSCLES.forEach(function(m){o[m.id]=m.sore||0});return o})(),false);renderRamp();renderMap($('#map-ck'),CK.sore,true);renderRPE();renderDesigner();syncWorking();
var start=P.get('screen');
if(start==='summary'){EX.forEach(function(ex){ex.sets.forEach(function(s,i){if(!s.done){s.done=true;s.rir=i===ex.sets.length-1?1:2}})});S.t0=Date.now()-54*60e3;S.sessionDone=true;updateToday()}
if(start==='sheet'){go('log');openSheet()}
else if(start==='checkin-m')go('checkin',{mode:'morning'});
else if(start==='checkin-e'){CK.rpe=8;CK.sore={tri:2,chest:1,fdelt:1};CK.pick='tri';renderRPE();renderMap($('#map-ck'),CK.sore,true);$('#ck-readout').innerHTML='Triceps → <b>2</b>Moderate';go('checkin',{mode:'evening'})}
else{var saved=null;try{saved=localStorage.getItem('baseline_strength_screen')}catch(e){}go(start||(!BARE&&saved&&saved!=='summary'?saved:'today'))}

/* ---------- device scaling (presentation only) ---------- */
var sc=document.getElementById('scaler');
function fit(){if(BARE){sc.style.transform='none';return}var s=Math.min((innerWidth-48)/393,(innerHeight-48)/852,1.15);sc.style.transform='scale('+s+')'}
fit();addEventListener('resize',fit);
})();
