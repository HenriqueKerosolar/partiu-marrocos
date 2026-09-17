/* ============================================================
   PARTIU MARROCOS — js/render.js
   Constrói o site inteiro a partir de window.PM_DATA.
   Inclui o gerador automático de rotas SVG por pacote.
   ============================================================ */
(function(){
"use strict";
function $(s,c){ return (c||document).querySelector(s); }
function esc(s){ return String(s==null?"":s); }
function pad(n){ return (n<10?"0":"")+n; }

/* ---------- GERADOR DE ROTA: N paradas → path serpenteante ---------- */
function genRoute(stops){
  var N=stops.length, W=600, H=630, pts=[];
  var x0=64, x1=536, y0=560, y1=88;
  for(var i=0;i<N;i++){
    var t=N===1?0:i/(N-1);
    var wob=Math.sin(t*Math.PI*2.2 + .6)*74*(1-Math.abs(t-.5)*.6);
    var x=x0+(x1-x0)*t+wob;
    var y=y0+(y1-y0)*t+Math.cos(t*Math.PI*1.7)*26;
    pts.push([Math.max(46,Math.min(554,x)), Math.max(58,Math.min(576,y))]);
  }
  /* Catmull-Rom → Bezier */
  function d(){
    if(N===1) return "M"+pts[0][0]+" "+pts[0][1];
    var p="M"+pts[0][0].toFixed(1)+" "+pts[0][1].toFixed(1);
    for(var i=0;i<N-1;i++){
      var p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(N-1,i+2)];
      var c1=[p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6];
      var c2=[p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6];
      p+=" C "+c1[0].toFixed(1)+" "+c1[1].toFixed(1)+", "+c2[0].toFixed(1)+" "+c2[1].toFixed(1)+", "+p2[0].toFixed(1)+" "+p2[1].toFixed(1);
    }
    return p;
  }
  var path=d();
  var g=stops.map(function(s,i){
    var x=pts[i][0], y=pts[i][1];
    var left = x>340; /* label do lado livre */
    var tx = left ? x-18 : x+18;
    var anchor = left ? "end" : "start";
    return '<g class="pt" data-pt="'+i+'"><circle cx="'+x+'" cy="'+y+'" r="7"/><text x="'+tx+'" y="'+(y+5)+'" text-anchor="'+anchor+'">'+esc(s.n)+'</text></g>';
  }).join("");
  return '<svg viewBox="0 0 600 630" aria-hidden="true">'+
    '<path class="rghost" d="'+path+'"/><path class="rpath" d="'+path+'"/>'+g+'</svg>';
}
window.PM_genRoute = genRoute;

/* ---------- RENDER ---------- */
window.PM_render = function(){
  var D=window.PM_DATA, C=D.config;

  /* cold open + title/meta da página */
  var studio=$("#coldStudio"); if(studio) studio.innerHTML=esc(C.owner)+" <b>apresenta</b>";

  /* HERO */
  $("#pmKicker").textContent=D.hero.kicker;
  $("#pmPartiu").textContent=D.hero.partiu;
  var t=esc(D.hero.titulo), oi=D.hero.oIndex;
  $("#hTitle").innerHTML = t.split("").map(function(c,i){
    return '<span class="ch'+(i===oi?" o":"")+'">'+c+'</span>';
  }).join("");
  $("#hTitle").setAttribute("aria-label",t);
  $("#pmSubtitle").innerHTML=D.hero.subtitle;
  $("#heroBg").style.backgroundImage="url('"+D.hero.img+"')";
  $("#pmMeta").innerHTML=D.hero.stats.map(function(s){
    return "<span><b>"+esc(s.n)+"</b>"+esc(s.suf)+" "+esc(s.l)+"</span>";
  }).join("");

  /* TRAILER + TAKES */
  $("#pmLines").innerHTML=D.trailer.lines.map(function(l,i){
    return '<p class="tr-line'+(i===1?" right":"")+'" data-split>'+l+"</p>";
  }).join("");
  var rom=["i","ii","iii","iv","v","vi","vii","viii","ix","x","xi","xii"];
  $("#takes").innerHTML=D.trailer.takes.map(function(k,i){
    return '<div class="take rv"><div class="big">'+(rom[i]||"·")+'</div><div class="tk">Take '+pad(i+1)+'</div><h3>'+esc(k.t)+"</h3><p>"+esc(k.d)+"</p></div>";
  }).join("")+'<div class="take rv" style="display:flex;flex-direction:column;justify-content:center"><a class="cta-mini" href="#reservar" style="align-self:flex-start;padding:14px 22px">COMEÇAR MINHA CENA →</a></div>';

  /* STRIP (cenários) */
  var strip=D.destinos.filter(function(d){return d.strip;});
  $("#track").innerHTML=strip.map(function(d){
    return '<figure class="frame" data-dest="'+d.key+'"><div class="open-tag">ficha →</div>'+
      '<div class="ph"><img src="'+d.img+'" alt="'+esc(d.t)+'"></div>'+
      '<figcaption class="cap"><h3>'+esc(d.cap)+"</h3><small>"+esc(d.sub)+"</small></figcaption></figure>";
  }).join("");
  $("#fTot").textContent=pad(strip.length);

  /* ROTA: tabs + panes por pacote (gerado automaticamente) */
  $("#rtTabs").innerHTML=D.pacotes.map(function(p,i){
    return '<button class="day-tab'+(i===0?" on":"")+'" data-rt="'+p.id+'"><b>'+esc(p.emoji)+"</b>"+esc(p.sub).toUpperCase()+" · "+esc(p.dias).toUpperCase()+"</button>";
  }).join("");
  $("#rtPanes").innerHTML=D.pacotes.map(function(p,i){
    var stops=p.rota.stops.map(function(s,j){
      return '<div class="stop"><b>'+pad(j+1)+"</b><span>"+esc(s.n)+"</span><span>"+esc(s.s)+"</span></div>";
    }).join("");
    return '<div class="rt-pane'+(i===0?" on":"")+'" data-pane="'+p.id+'" data-km="'+p.rota.km+'">'+
      '<div class="route-grid">'+
      '<div><div class="stops">'+stops+"</div>"+
      '<a class="dl-map" href="mapa.html?p='+p.id+'" target="_blank" rel="noopener">📜 Baixar este roteiro em <b>Mapa do Tesouro (PDF)</b></a></div>'+
      '<div class="route-map">'+genRoute(p.rota.stops)+
      '<div class="route-km"><b class="km">0</b> KM DE PAISAGENS</div></div>'+
      "</div></div>";
  }).join("");

  /* STORYBOARD: tabs + boards por pacote */
  $("#dayTabs").innerHTML=D.pacotes.map(function(p,i){
    return '<button class="day-tab'+(i===0?" on":"")+'" data-board="bd-'+p.id+'"><b>'+esc(p.emoji)+"</b>"+esc(p.sub).toUpperCase()+" · "+esc(p.dias).toUpperCase()+"</button>";
  }).join("");
  $("#boards").innerHTML=D.pacotes.map(function(p,i){
    var days=p.roteiro.map(function(d){
      return '<div class="day"><div class="dnum">'+esc(d.n)+"</div><h4>"+esc(d.t)+"</h4><p>"+esc(d.d)+"</p>"+
        '<div class="chips">'+(d.chips||[]).map(function(c){return "<i>"+esc(c)+"</i>";}).join("")+"</div></div>";
    }).join("");
    return '<div class="board'+(i===0?" on":"")+'" id="bd-'+p.id+'">'+days+"</div>";
  }).join("");

  /* PÔSTERES */
  $("#posters").innerHTML=D.pacotes.map(function(p){
    return '<article class="poster'+(p.featured?" featured":"")+' rv">'+
      '<img src="'+p.img+'" alt="'+esc(p.nome)+" "+esc(p.sub)+'">'+
      '<div class="top-line"><span>'+esc(p.cat)+" · "+esc(p.dias)+" · "+esc(p.noites)+"</span><span>"+esc(p.emoji)+"</span></div>"+
      (p.featured?'<div class="fea-tag">'+esc(p.badge||"Mais assistido")+"</div>":"")+
      '<div class="body"><div class="ep">'+esc(p.ep)+"</div>"+
      "<h3>"+esc(p.nome)+" <em>"+esc(p.sub)+"</em></h3>"+
      '<p class="sin">'+esc(p.sinopse)+"</p>"+
      '<ul class="inc">'+p.inc.map(function(x){return "<li>"+esc(x)+"</li>";}).join("")+"</ul>"+
      '<div class="price"><small>a partir de</small><b>'+esc(p.preco)+"</b></div>"+
      '<a class="book" href="#reservar" data-pkg="'+esc(p.nome)+" "+esc(p.sub)+" ("+esc(p.dias)+")\">Reservar o "+esc(p.sub)+"</a>"+
      "</div></article>";
  }).join("");
  $("#precosNota").innerHTML=D.precosNota;

  /* seletor do formulário */
  var sel=$("#fPkg");
  sel.innerHTML=D.pacotes.map(function(p){
    return "<option>"+esc(p.nome)+" "+esc(p.sub)+" ("+esc(p.dias)+")</option>";
  }).join("")+"<option>Roteiro personalizado</option><option>Ainda não sei / me ajude</option>";

  /* EXPERIÊNCIAS / PRATOS / PEEKS / FATOS / QUOTES / ELENCO / FAQ */
  $("#exps").innerHTML=D.experiencias.map(function(e){
    return '<div class="exp rv"><span class="tk">'+esc(e.tk)+'</span><img src="'+e.img+'" alt="'+esc(e.t)+'">'+
      '<div class="cap"><h3>'+esc(e.t)+"</h3><p>"+esc(e.d)+"</p></div></div>";
  }).join("");
  $("#dishes").innerHTML=D.pratos.map(function(e){
    return '<div class="dish rv"><img src="'+e.img+'" alt="'+esc(e.t)+'"><div class="cap"><h3>'+esc(e.t)+"</h3><p>"+esc(e.d)+"</p></div></div>";
  }).join("");
  $("#mq").innerHTML=D.pratos.map(function(e){return esc(e.t.toLowerCase());}).join("<b>·</b>")+"<b>·</b>";
  $("#peeks").innerHTML=D.peeks.map(function(e,i){
    return '<div class="peek rv" data-peek="'+i+'"><span class="exp360">↔ explorar</span><img src="'+e.img+'" alt="'+esc(e.t)+'">'+
      '<div class="cap"><b>'+esc(e.k)+"</b>"+esc(e.t)+"</div></div>";
  }).join("");
  $("#facts").innerHTML=D.fatos.map(function(f){
    return '<div class="fact rv"><span class="fi">'+esc(f.i)+"</span><h3>"+esc(f.t)+"</h3><p>"+esc(f.d)+"</p></div>";
  }).join("");
  $("#pressRow").innerHTML=D.quotes.map(function(q){
    return '<article class="quote"><div class="stars">★★★★★</div><p>'+q.p+"</p><footer><b>"+esc(q.a)+"</b>"+esc(q.s)+"</footer></article>";
  }).join("");
  $("#cast").innerHTML=D.elenco.map(function(a){
    return '<div class="actor rv"><div class="av">'+esc(a.av)+'</div><div class="role">'+esc(a.role)+"</div><h3>"+esc(a.t)+"</h3><p>"+esc(a.d)+"</p></div>";
  }).join("");
  $("#faqs").innerHTML=D.faq.map(function(f){
    return '<details class="faq"><summary>'+esc(f.q)+'<span class="pl">+</span></summary><div class="ans">'+f.a+"</div></details>";
  }).join("");

  /* ALMA */
  $("#soulCopy").innerHTML=D.alma.paras.map(function(p){return '<p class="rv">'+p+"</p>";}).join("")+
    '<div class="soul-quote rv">'+esc(D.alma.quote)+"</div>";
  $("#soulStats").innerHTML=D.alma.stats.map(function(s){
    var b=s.n>0?'<b><span data-count="'+s.n+'">0</span>'+esc(s.suf)+"</b>":"<b>"+esc(s.b)+"</b>";
    return '<div class="sstat">'+b+"<span>"+esc(s.s)+"</span></div>";
  }).join("");

  /* VÍDEO */
  $("#vnote").innerHTML=esc(C.videoNote);

  /* CRÉDITOS + rodapé */
  $("#credits").innerHTML=D.creditos.map(function(c){
    return '<div class="credit rv"><div class="role">'+esc(c.role)+'</div><div class="name">'+c.name+"</div></div>";
  }).join("")+'<div class="credit rv"><div class="role">Contato</div><div class="name"><a href="mailto:'+esc(C.email)+'">'+esc(C.email)+"</a></div></div>";
  $("#fin").textContent=D.fin;
  $("#creditsFoot").innerHTML='<a href="#" data-wa>WhatsApp</a> · <a href="'+esc(C.instagram)+'" target="_blank" rel="noopener">Instagram</a> · <a href="'+esc(C.facebook)+'" target="_blank" rel="noopener">Facebook</a> · <a href="https://'+esc(C.site)+'">'+esc(C.site)+"</a><br>"+D.rodape;

  document.title="Partiu Marrocos · A Viagem em Longa-Metragem";
};
})();
