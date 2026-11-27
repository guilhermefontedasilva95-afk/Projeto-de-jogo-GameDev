"use strict";
const sectors = [
  {name:"Órbita de Ícaro", short:"Ícaro", hint:"Batedores atacam em duplas. Mude de direção depois do primeiro disparo.", interval:2.4, rocks:8},
  {name:"Cinturão de Ferrugem", short:"Ferrugem", hint:"Mineradores cruzam o cinturão. Atraia os meteoros para a rota deles ou destrua as rochas.", interval:1.65, rocks:1.25},
  {name:"Nebulosa Violeta", short:"Violeta", hint:"Caçadores se camuflam na névoa. Observe o brilho do motor antes de cada tiro.", interval:1.55, rocks:5},
  {name:"Estaleiro Fantasma", short:"Estaleiro", hint:"Os drones verdes consertam as fragatas. Destrua a escolta para interromper os reparos.", interval:2.4, rocks:5.5},
  {name:"Núcleo de Cinzas", short:"Núcleo", hint:"A Sentinela guarda o núcleo. Ao romper a última placa de blindagem, desvie dos destroços.", interval:1, rocks:7}
];
const fleet = {
  espectro:{name:"Espectro",system:"Salto de fase",speed:405,hp:3,tip:"Atravesse o perigo em alta velocidade. O primeiro disparo após o salto é crítico."},
  bastiao:{name:"Bastião",system:"Escudo cinético",speed:285,hp:5,tip:"Absorva tiros pela frente. Aperte E de novo para devolver a energia em um pulso."},
  sucateira:{name:"Sucateira",system:"Drone de escolta",speed:345,hp:4,tip:"Use três sucatas para montar um drone por 8 s. Meteoros destruídos deixam peças."}
};
let craft="espectro", rocks=[], rockTimer=0;
function openHangar(){
  state="hangar"; $("arena").dataset.screen="hangar";
  overlay("FROTA EXPEDICIONÁRIA","Escolha sua nave","", "ABRIR MAPA ▸");
  $("hangar").hidden=false;$("route").hidden=true;selectCraft(craft);
}
function selectCraft(id){
  craft=id;
  for(const name of Object.keys(fleet)) $(name).setAttribute("aria-pressed",String(name===id));
  $("desc").textContent=fleet[id].tip;
}
function showMap(n){
  beginWave(n);state="map";foes=[];rocks=[];impacts=[];bolts=[];shots=[];drops=[];sparks=[];
  ctx.clearRect(0,0,W,H);
  $("arena").dataset.screen="map";
  overlay("CARTA DE NAVEGAÇÃO   /   SALTO 0"+n,""+sectors[n-1].name,(n<5?"Sobreviva por 1 minuto. ":"Destrua a Sentinela. ")+sectors[n-1].hint,"SALTAR PARA A FASE 0"+n+" ▸");
  $("hangar").hidden=true;$("route").hidden=false;
  for(let i=1;i<=5;i++){
    const node=$("stop"+i);node.dataset.status=i<n?"done":i===n?"current":"next";
    node.setAttribute("aria-label",sectors[i-1].name+" — "+(i<n?"concluída":i===n?"destino atual":"a explorar"));
  }
  hud();
}
function launch(){
  $("route").hidden=true;$("arena").dataset.screen="flight";$("arena").dataset.sector=wave;
  ship.x=W/2;ship.y=H-65;ship.guard=1.5;rockTimer=wave===2?.6:4;
  if(wave>1)ship.hp=Math.min(fleet[craft].hp,ship.hp+1);
  startJump("arrival");
}
function action(){
  if(state==="paused")resume();
  else if(state==="map")launch();
  else if(state==="hangar")start();
  else openHangar();
}
function ability(){
  if(state!=="play")return;
  if(craft==="bastiao" && ship.shield>0){discharge();return}
  if(pulseTime>0)return;
  if(craft==="espectro"){
    ship.shift=.26;ship.primed=true;ship.guard=Math.max(ship.guard,.26);pulseTime=6;
  }else if(craft==="bastiao"){
    ship.shield=3;ship.charge=0;pulseTime=8;
  }else{
    if(ship.scrap<3)return;
    ship.scrap-=3;ship.drone=8;ship.droneFire=0;pulseTime=8;
  }
  tone(520,.16);
}
function discharge(){
  ship.shield=0;ring=.5;
  for(const f of foes)if(f.y>0)hitEnemy(f,10+10*ship.charge);
  bolts=bolts.filter(b=>!near(b,ship,150));ship.charge=0;
}
function abilityText(){
  if(ship.shield>0)return "Devolver carga ×"+ship.charge;
  if(ship.shift>0)return "Em fase";
  if(ship.drone>0)return "Drone em voo · "+Math.ceil(ship.drone)+"s";
  if(pulseTime>0)return fleet[craft].system+" · "+Math.ceil(pulseTime)+"s";
  if(craft==="sucateira")return "Drone · "+ship.scrap+" / 3 sucatas";
  return fleet[craft].system+" pronto";
}
function addRock(x,y,vx,vy,r,debris=false){
  rocks.push({x,y,vx,vy,r,debris,hp:r>22?20:10,spin:Math.random()*6});
}
function shatter(r){
  r.hp=0;burst(r.x,r.y,"#e5a575");
  if(craft==="sucateira")drops.push({x:r.x,y:r.y,type:"sucata"});
}
function updateHazards(dt){
  rockTimer-=dt;
  if(rockTimer<=0){
    addRock(45+Math.random()*(W-90),-35,Math.random()*95-47,80+Math.random()*55,15+Math.random()*18);
    rockTimer=sectors[wave-1].rocks*(.8+Math.random()*.4);
  }
  for(const r of rocks){
    r.x+=r.vx*dt;r.y+=r.vy*dt;r.spin+=dt*.8;
    if(near(ship,r,r.r+13)){if(ship.shift<=0){damage();shatter(r)}continue}
    if(!r.debris){
      const f=foes.find(f=>!f.boss&&f.hp>0&&near(r,f,f.r+r.r));
      if(f){hitEnemy(f,40);shatter(r)}
    }
  }
  rocks=rocks.filter(r=>r.hp>0&&r.y<H+45&&r.x>-45&&r.x<W+45);
  if(ship.shield>0){ship.shield-=dt;if(ship.shield<=0)discharge()}
  ship.shift=Math.max(0,ship.shift-dt);ship.drone=Math.max(0,ship.drone-dt);
  if(ship.drone>0){
    ship.droneFire-=dt;
    const pos=dronePos(), enemy=foes.filter(f=>f.hp>0&&f.y>0).sort((a,b)=>Math.hypot(a.x-pos.x,a.y-pos.y)-Math.hypot(b.x-pos.x,b.y-pos.y))[0];
    if(enemy && ship.droneFire<=0){
      const angle=Math.atan2(enemy.y-pos.y,enemy.x-pos.x);
      shots.push({x:pos.x,y:pos.y,vx:500*Math.cos(angle),vy:500*Math.sin(angle)});ship.droneFire=.3;
    }
  }
}
function dronePos(){return {x:ship.x+39*Math.cos(elapsed*3),y:ship.y-25+12*Math.sin(elapsed*3)}}
function drawExtras(){
  for(const r of rocks){if(r.hp<=0)continue;ctx.save();ctx.translate(r.x,r.y);ctx.rotate(r.spin);sprite(r.debris?"placa":"meteoro",0,0,r.r*2.2);ctx.restore()}
  if(ship.drone>0){const p=dronePos();sprite("reparo",p.x,p.y,26)}
  if(ship.shield>0){ctx.strokeStyle="#ffcd7e";ctx.lineWidth=5;ctx.beginPath();ctx.arc(ship.x,ship.y,51,Math.PI,2*Math.PI);ctx.stroke()}
}
