"use strict";
const $ = id => document.getElementById(id);
const canvas = document.querySelector("canvas"), ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;
const keys = new Set(), sprites = {};
for (const name of ["espectro","bastiao","sucateira","meteoro","placa","minerador","cacador","fragata","reparo","drone", "chefe-1", "chefe-2", "chefe-3"]) {
  const img = new Image(); img.src = "assets/" + name + ".png"; sprites[name] = img;
}
let state = "menu", record = 0, sound = true, audio, last = 0, target = null;
let ship, foes, shots, bolts, drops, sparks, wave, spawned, spawnClock, elapsed, sectorTime, points, kills, pulseTime, ring, itemIndex;
try { record = Number(localStorage.getItem("orbita-cinzas-recorde")) || 0; } catch {}
$("record").textContent = "Recorde · " + record;
function tone(freq, duration, type = "sine") {
  if (!sound || !audio || audio.state !== "running") return;
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = type; osc.frequency.value = freq; osc.frequency.exponentialRampToValueAtTime(freq * .55, audio.currentTime + duration);
  gain.gain.value = .035; gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
  osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
}
function unlock() {
  try { audio ??= new AudioContext(); audio.resume().catch(() => {}); } catch {}
}
const laser = {damage:10, criticalChance:.20, criticalMultiplier:2};
const tracks = {normal:new Audio("assets/travessia.mp3"), boss:new Audio("assets/confronto.mp3")};
for(const track of Object.values(tracks)){track.loop=true;track.volume=.35}
let theme="normal", impacts=[];
function syncMusic(){
  for(const [name,track] of Object.entries(tracks)){
    if(name===theme && state==="play" && sound) track.play().catch(()=>{});
    else track.pause();
  }
}
function bossPhase(f){return f.hp>f.max*2/3?1:f.hp>f.max/3?2:3}
function beginWave(n) {
  wave = n; spawned = 0; spawnClock = .9; sectorTime = 0;
}
function start() {
  unlock(); ship = {x:W/2,y:H-68,hp:fleet[craft].hp,shift:0,primed:false,shield:0,charge:0,scrap:3,drone:0,droneFire:0,guard:1.2,fire:0,triple:0};
  foes=[]; shots=[]; bolts=[]; drops=[]; sparks=[]; elapsed=0; points=0; kills=0; pulseTime=0; ring=0; itemIndex=0;
  theme="normal"; impacts=[]; for(const track of Object.values(tracks))track.currentTime=0;
  showMap(1);
}
const survivalSeconds=60;
const jumpDuration=1.8;
let jumpTime=0, pausedState="play";
function startJump(direction){
  state=direction;jumpTime=0;keys.clear();target=null;
  $("panel").hidden=true;$("pause").disabled=false;
  last=performance.now();hud();syncMusic();tone(direction==="arrival"?420:660,.35,"triangle");
}
function inFlight(){return ["play","arrival","departure"].includes(state)}
function resume(mode=pausedState) {
  state=mode; keys.clear(); target=null; $("panel").hidden=true; $("pause").disabled=false; last=performance.now(); hud(); syncMusic();
}
function overlay(eyebrow, title, details, button) {
  syncMusic(); keys.clear(); target=null; $("panel").hidden=false; $("pause").disabled=true;
  $("kicker").textContent=eyebrow; $("title").textContent=title; $("desc").textContent=details; $("action").textContent=button;
  $("action").focus({preventScroll:true});
}
function pause() {
  if(state==="paused") return resume();
  if(!inFlight()) return;
  pausedState=state;state="paused"; overlay("TRANSMISSÃO EM ESPERA","Pausa","Sua missão continua daqui.","CONTINUAR ▸");
}
function finish(win) {
  state=win?"won":"lost";
  record=Math.max(record,points); try {localStorage.setItem("orbita-cinzas-recorde",record)} catch {}
  hud(); overlay("SETOR 0"+wave+" / 05",win?"Órbita salva!":"Game over",points+" pontos · "+kills+" alvos destruídos.","JOGAR NOVAMENTE ▸"); tone(win?700:115,.45);
}
function hud() {
  const remaining=Math.max(0,Math.ceil(survivalSeconds-sectorTime-1e-9));
  $("clock").textContent=wave===5?"CHEFE":(remaining===60?"01:00":"00:"+String(remaining).padStart(2,"0"));
  $("life").textContent="◆ ".repeat(ship.hp)+"◇ ".repeat(fleet[craft].hp-ship.hp);
  $("sector").textContent="0"+wave+" / 05"; $("score").textContent=String(points).padStart(6,"0");
  $("record").textContent="Recorde · "+record;
  $("power").textContent=abilityText()+(ship.triple>0?" · Tiro triplo "+Math.ceil(ship.triple)+"s":"");
}
function burst(x,y,color) {
  for(let i=0;i<12;i++) sparks.push({x,y,vx:Math.random()*180-90,vy:Math.random()*180-90,t:.25+Math.random()*.35,color});
}
function hitEnemy(f,damage,critical=false) {
  if(f.hp<=0) return;
  const previous=bossPhase(f); f.hp=Math.max(0,f.hp-damage); f.flash=.19;
  impacts.push({x:f.x,y:f.y,t:.58,damage,critical,dead:f.hp===0,size:f.boss?145:43,
    sprite:f.boss?"chefe-"+previous:f.type});
  if(f.boss && f.hp>0 && previous!==bossPhase(f)){
    burst(f.x-25,f.y,"#ffbc68"); burst(f.x+25,f.y,"#f48c65");
    if(bossPhase(f)===3){
      for(let i=-2;i<=2;i++)addRock(f.x+i*15,f.y+20,i*48,95+(2-Math.abs(i))*20,16,true);
    }
    f.fire=Math.max(.85,f.fire);
  }
  if(f.hp>0) return;
  points+=f.boss?1500:f.type==="fragata"?240:100; kills++; burst(f.x,f.y,"#ffac70"); tone(145,.13,"triangle");
  if(!f.boss && kills%3===0) drops.push({x:f.x,y:f.y,type:["triplo","escudo","reparo"][itemIndex++%3]});
}
function damage() {
  if(ship.guard>0 || state!=="play") return;
  ship.hp--; ship.guard=2; burst(ship.x,ship.y,"#7eeaf9"); tone(94,.25);
  if(!ship.hp) finish(false);
}
function spawn(type,x,leader=null) {
  const boss=type==="sentinela";
  const hp={drone:10,minerador:30,cacador:20,fragata:80,reparo:15,sentinela:600}[type];
  if(boss){theme="boss";syncMusic()}
  const foe={x,y:-42,base:x,hp,max:hp,type,boss,leader,age:0,fire:1.4+Math.random(),flash:0,volley:0,r:boss?48:type==="fragata"?24:17};
  foes.push(foe);return foe;
}
function formation(){
  const x=120+Math.random()*(W-240);
  if(wave===1){
    spawn("drone",x-37);spawn("drone",x+37).leadShot=true;spawned+=2;
  }else if(wave===4){
    const leader=spawn("fragata",x);
    spawn("reparo",x-52,leader);spawn("reparo",x+52,leader);spawned+=3;
  }else{
    spawn(["","","minerador","cacador","","sentinela"][wave],wave===5?W/2:x);spawned++;
  }
  spawnClock=sectors[wave-1].interval;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function near(a,b,r){return Math.hypot(a.x-b.x,a.y-b.y)<r}
function update(dt) {
  elapsed+=dt; sectorTime+=dt;
  if(wave<5 && sectorTime>=survivalSeconds){startJump("departure");return}
  spawnClock-=dt; pulseTime=Math.max(0,pulseTime-dt); ring=Math.max(0,ring-dt);
  ship.guard=Math.max(0,ship.guard-dt); ship.triple=Math.max(0,ship.triple-dt); ship.fire-=dt;
  const held=(a,b)=>Number(keys.has(a)||keys.has(b));
  let dx=held("ArrowRight","KeyD")-held("ArrowLeft","KeyA"),dy=held("ArrowDown","KeyS")-held("ArrowUp","KeyW");
  const speed=fleet[craft].speed*(ship.shift>0?2.4:1)*dt;
  if(ship.shift>0&&!dx&&!dy&&!target)dy=-1;
  if(target){dx=target.x-ship.x;dy=target.y-ship.y}
  const dist=Math.hypot(dx,dy), step=target?Math.min(speed,dist):speed;
  if(dist){ship.x=clamp(ship.x+dx/dist*step,20,W-20);ship.y=clamp(ship.y+dy/dist*step,30,H-22)}
  ship.vx=dist&&dt>0?dx/dist*speed/dt:0;
  if((keys.has("Space")||target) && ship.fire<=0 && ship.shift<=0){
    for(const vx of ship.triple>0?[-125,0,125]:[0]) shots.push({x:ship.x,y:ship.y-18,vx,critical:ship.primed});
    ship.primed=false;
    ship.fire=.15; tone(750,.055,"triangle");
  }
  if(spawnClock<=0 && (wave===5?spawned===0:foes.length<7))formation();
  updateHazards(dt);if(state!=="play")return;
  for(const f of foes){
    if(f.hp<=0)continue;
    f.age+=dt;f.fire-=dt;f.flash=Math.max(0,f.flash-dt);
    f.y=f.boss?Math.min(96,f.y+65*dt):f.y+(f.type==="fragata"?23:37+wave*3)*dt;
    f.x=f.base+Math.sin(f.age*(f.boss?.7:1+wave*.24))*(f.boss?W*.32:20+wave*10);
    if(f.type==="reparo" && f.leader.hp>0){
      f.x=f.leader.x+(f.base-f.leader.base);f.y=f.leader.y+12;
      if(f.fire<=0 && f.y>0){f.leader.hp=Math.min(f.leader.max,f.leader.hp+8);f.fire=1.65;f.link=.32}
      f.link=Math.max(0,(f.link||0)-dt);
    }else if(f.fire<=0 && f.y>12){
      const angle=Math.atan2(ship.y-f.y,ship.x+(f.leadShot?ship.vx*.36:0)-f.x);
      const phase=bossPhase(f);
      let spread=[0];
      if(f.boss){
        spread=phase===1?[-.28,0,.28]:phase===2?[-.55,-.27,0,.27,.55]:
          (f.volley%2?[0]:[-.84,-.56,-.28,0,.28,.56,.84]);
      }else if(f.type==="fragata" || f.type==="minerador")spread=[-.16,.16];
      f.volley++;
      for(const offset of spread) bolts.push({x:f.x,y:f.y,vx:Math.cos(angle+offset)*(120+wave*13),vy:Math.sin(angle+offset)*(120+wave*13)});
      f.fire=f.boss?[0,1.45,1.15,.85][phase]:2.8;
    }
    if(near(f,ship,f.r+12)){damage();if(!f.boss)f.hp=0}
    if(f.y>H+25)f.hp=0;
    if(state!=="play")return;
  }
  for(const s of shots){
    s.y+=(s.vy??-500)*dt;s.x+=s.vx*dt;
    const rock=rocks.find(r=>r.hp>0 && near(s,r,r.r+3));
    if(rock){rock.hp-=s.critical?20:10;if(rock.hp<=0)shatter(rock);s.used=true;continue}
    const f=foes.find(f=>f.hp>0 && near(s,f,f.r+4));
    if(f){
      const critical=s.critical || Math.random()<laser.criticalChance;
      hitEnemy(f,laser.damage*(critical?laser.criticalMultiplier:1),critical);
      s.used=true;
    }
  }
  for(const b of bolts){b.x+=b.vx*dt;b.y+=b.vy*dt;if(ship.shield>0 && b.y<=ship.y && near(b,ship,54)){ship.charge++;b.used=true;continue}if(near(b,ship,14)){b.used=true;damage();if(state!=="play")return}}
  for(const d of drops){
    d.y+=83*dt;
    if(near(d,ship,33)){
      if(d.type==="sucata")ship.scrap++;
      if(d.type==="escudo")ship.guard=6;
      if(d.type==="triplo")ship.triple=10;
      if(d.type==="reparo")ship.hp=Math.min(fleet[craft].hp,ship.hp+1);
      d.used=true;points+=50;tone(920,.17);
    }
  }
  shots=shots.filter(s=>!s.used&&s.y>-12&&s.y<H+15&&s.x>-15&&s.x<W+15);bolts=bolts.filter(b=>!b.used&&b.y<H+12&&b.y>-12&&b.x>-12&&b.x<W+12);
  drops=drops.filter(d=>!d.used&&d.y<H+12);foes=foes.filter(f=>f.hp>0);
  for(const mark of impacts)mark.t-=dt;impacts=impacts.filter(mark=>mark.t>0);
  for(const s of sparks){s.t-=dt;s.x+=s.vx*dt;s.y+=s.vy*dt} sparks=sparks.filter(s=>s.t>0);
  if(wave===5 && spawned>0 && !foes.length)startJump("departure");
  hud();
}
function sprite(name,x,y,size){
  const img=sprites[name];if(img.complete&&img.naturalWidth)ctx.drawImage(img,Math.round(x-size/2),Math.round(y-size/2),size,size);
}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.imageSmoothingEnabled=false;
  if(!ship||state==="map")return;
  ctx.fillStyle="#060c1a55";ctx.fillRect(0,0,W,H);
  for(let i=0;i<48;i++){ctx.fillStyle=i%4?"#8095ac":"#dbe7ff";ctx.fillRect((i*379)%W,(i*71+elapsed*(15+i%45))%H,2,2)}
  for(const f of foes){
    if(f.hp<=0)continue;
    const phase=bossPhase(f),size=f.boss?145:43, shake=Math.sin(f.flash*95)*f.flash*22;
    ctx.save();ctx.translate(f.x+shake,f.y-f.flash*16);
    if(f.type==="cacador" && f.fire>.65 && !f.flash){ctx.globalAlpha=.22}
    if(f.flash>0){ctx.rotate(shake*.022);ctx.filter="brightness("+ (1+f.flash*11) +")"}
    sprite(f.boss?"chefe-"+phase:f.type,0,0,size);ctx.restore();
    if(f.type==="cacador"){ctx.fillStyle=f.fire<.65?"#f8b8ff":"#786bb6";ctx.fillRect(f.x-3,f.y-13,6,6)}
    if(f.link>0 && f.leader.hp>0){ctx.strokeStyle="#89eabe";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.leader.x,f.leader.y);ctx.stroke()}
    if(f.boss && phase>1){
      for(let i=0;i<(phase===3?9:4);i++){
        const age=(elapsed*1.4+i*.21)%1, side=i%2&&phase===3?1:-1;
        ctx.fillStyle=age<.25?"#ffab60":"rgba(135,131,151,"+(.65*(1-age))+")";
        ctx.fillRect(f.x+side*47+Math.sin(i+age*4)*6,f.y-12-age*35,4+age*7,4+age*7);
      }
    }
    if(f.boss){ctx.fillStyle="#fbe1c1";ctx.textAlign="center";ctx.font="bold 13px monospace";
      ctx.fillText("SENTINELA  /  FASE "+phase+"  ·  "+Math.ceil(f.hp/f.max*100)+"%",f.x,f.y-65);ctx.fillStyle="#452c42";ctx.fillRect(f.x-52,f.y-60,104,5);ctx.fillStyle="#ff9264";ctx.fillRect(f.x-52,f.y-60,104*f.hp/f.max,5)}
  }
  ctx.fillStyle="#8ffff1";for(const s of shots)ctx.fillRect(s.x-2,s.y-6,4,14);
  for(const b of bolts){ctx.fillStyle="#ff805c";ctx.beginPath();ctx.arc(b.x,b.y,5,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ffefba";ctx.fillRect(b.x-2,b.y-2,4,4)}
  for(const d of drops){ctx.fillStyle="#8af0d1";ctx.fillRect(d.x-12,d.y-12,24,24);ctx.fillStyle="#112b40";ctx.font="bold 18px monospace";ctx.textAlign="center";ctx.fillText({triplo:"Ⅲ",escudo:"S",reparo:"+",sucata:"⚙"}[d.type],d.x,d.y+6)}
  if(ship.hp){ctx.fillStyle="#ffc783";ctx.fillRect(ship.x-3,ship.y+14,6,8+Math.sin(elapsed*38)*4);sprite(craft,ship.x,ship.y,48);
    if(ship.guard>0){ctx.strokeStyle="#83eee0";ctx.lineWidth=2;ctx.beginPath();ctx.arc(ship.x,ship.y,29,0,Math.PI*2);ctx.stroke()}}
  for(const s of sparks){ctx.fillStyle=s.color;ctx.fillRect(s.x,s.y,4,4)}
  drawExtras();
  for(const m of impacts){
    const age=.58-m.t;ctx.save();
    if(m.dead && age<.16){
      ctx.globalAlpha=1-age/.16;ctx.filter="brightness(3)";
      sprite(m.sprite,m.x,m.y-age*35,m.size*(1+age));ctx.filter="none";
    }
    ctx.globalAlpha=Math.min(1,m.t*5);ctx.textAlign="center";
    ctx.font=m.critical?"bold 19px monospace":"bold 14px monospace";
    const label=(m.critical?"CRÍTICO ":"")+"−"+m.damage;
    ctx.lineWidth=3;ctx.strokeStyle="#111624";ctx.strokeText(label,m.x,m.y-22-age*54);
    ctx.fillStyle=m.critical?"#ffd265":"#e3fff9";ctx.fillText(label,m.x,m.y-22-age*54);ctx.restore();
  }
  if(ring>0){ctx.strokeStyle="#a6fff2";ctx.lineWidth=4;ctx.beginPath();ctx.arc(ship.x,ship.y,(.5-ring)*2100+15,0,Math.PI*2);ctx.stroke()}
}
// Project stars outward from the jump point and ease the ship along its approach or escape.
function drawJump(){
  const entering=state==="arrival", t=Math.min(1,jumpTime/jumpDuration);
  const eased=t*t*(3-2*t), cx=W*.5, cy=H*.32;
  const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle="rgba(5,12,26,.65)";ctx.fillRect(0,0,W,H);
  if(!reduced){
    ctx.lineWidth=2;
    for(let i=0;i<70;i++){
      const angle=i*2.4,depth=(i*.381+t*.85)%1;
      const scale=depth*depth*W,tail=scale*(1-.19*Math.sin(Math.PI*t));
      ctx.strokeStyle=i%3?"#7193ae":"#b2f5e8";ctx.beginPath();
      ctx.moveTo(cx+Math.cos(angle)*tail,cy+Math.sin(angle)*tail*.68);
      ctx.lineTo(cx+Math.cos(angle)*scale,cy+Math.sin(angle)*scale*.68);ctx.stroke();
    }
  }
  const x=entering?cx:ship.x+(cx-ship.x)*eased;
  const y=reduced?H*.76:entering?H+45+(ship.y-H-45)*eased:ship.y+(-70-ship.y)*eased;
  sprite(craft,x,y,reduced?48:entering?60-12*eased:48-32*eased);
  ctx.textAlign="center";ctx.fillStyle="#f2bf90";ctx.font="bold 18px monospace";
  ctx.fillText(entering?"ENTRANDO NO SETOR 0"+wave:wave===5?"SENTINELA DESTRUÍDA":"SETOR 0"+wave+" CONCLUÍDO",cx,H*.43);
  ctx.fillStyle="#eff4f8";ctx.font="bold 32px monospace";
  ctx.fillText(sectors[wave-1].name.toUpperCase(),cx,H*.52);
}
function advanceJump(dt){
  jumpTime+=dt;drawJump();
  if(jumpTime<jumpDuration)return;
  if(state==="arrival")resume("play");
  else if(wave<5)showMap(wave+1);
  else finish(true);
}
function frame(time){
  const dt=Math.min((time-last)/1000,.04);last=time;
  if(state==="play"){update(dt);if(state==="play" || state==="lost")draw()}
  else if(state==="arrival" || state==="departure")advanceJump(dt);
  requestAnimationFrame(frame);
}
$("action").onclick=action;
for(const name of Object.keys(fleet))$(name).onclick=()=>selectCraft(name);
$("pause").onclick=pause;$("pulse").onclick=ability;
$("sound").onclick=()=>{sound=!sound;unlock();syncMusic();$("sound").textContent=sound?"Som ligado":"Som desligado";$("sound").setAttribute("aria-pressed",sound)};
window.addEventListener("keydown",e=>{
  if(e.code==="KeyP"&&!e.repeat){pause();return}
  if(state!=="play")return;
  if(e.code==="Space"||e.code.startsWith("Arrow"))e.preventDefault();
  keys.add(e.code);if(e.code==="KeyE"&&!e.repeat)ability();
});
window.addEventListener("keyup",e=>keys.delete(e.code));
function aim(e){const r=canvas.getBoundingClientRect();target={x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height}}
canvas.onpointerdown=e=>{if(state==="play"){canvas.setPointerCapture(e.pointerId);aim(e)}};
canvas.onpointermove=e=>{if(target&&canvas.hasPointerCapture(e.pointerId))aim(e)};
canvas.onlostpointercapture=()=>target=null;
window.addEventListener("blur",()=>{if(inFlight())pause()});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&inFlight())pause()});
requestAnimationFrame(frame);
