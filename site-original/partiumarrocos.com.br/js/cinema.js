/* ============================================================
   PARTIU MARROCOS — js/cinema.js
   Motor: GSAP + ScrollTrigger · roda após PM_render()
   ============================================================ */
(function(){
"use strict";
var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
var hasGSAP = typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined";
if(hasGSAP) gsap.registerPlugin(ScrollTrigger);
if(reduced || !hasGSAP) document.documentElement.classList.add("reduced");
function pad(n){ return (n<10?"0":"")+n; }

/* ---------- COLD OPEN (roda já) ---------- */
var cold=document.getElementById("cold"), num=document.getElementById("coldNum"),
    sweep=document.getElementById("sweep"), coldDone=false, heroReady=false;
function endCold(){
  if(cold && !cold.classList.contains("done")){
    cold.classList.add("done");
    setTimeout(function(){ cold.remove(); coldDone=true; if(heroReady) heroIn(); },850);
  }
}
document.getElementById("skip").addEventListener("click", endCold);
if(reduced){ endCold(); coldDone=true; }
else{
  var seq=[3,2,1], ci=0, per=720;
  (function step(){
    if(ci>=seq.length){ endCold(); return; }
    num.textContent=seq[ci];
    var t0=performance.now();
    (function sw(now){
      var p=Math.min(1,(now-t0)/per);
      sweep.style.background="conic-gradient(rgba(242,169,59,.18) "+(p*360)+"deg, transparent "+(p*360)+"deg)";
      if(p<1 && cold && !cold.classList.contains("done")) requestAnimationFrame(sw);
    })(t0);
    ci++; setTimeout(step, per);
  })();
  setTimeout(endCold, per*3+400);
}

/* ---------- TIMECODE ---------- */
var tc=document.getElementById("tc"), tct0=performance.now();
(function tick(now){
  var s=(now-tct0)/1000, f=Math.floor((s%1)*24),
      h=Math.floor(s/3600), m=Math.floor(s/60)%60, ss=Math.floor(s)%60;
  tc.textContent=pad(h)+":"+pad(m)+":"+pad(ss)+":"+pad(f);
  requestAnimationFrame(tick);
})(tct0);

/* ================= INIT PÓS-DADOS ================= */
window.PM_READY.then(function(){
  window.PM_render();
  var D=window.PM_DATA, C=D.config;

  /* ---------- Attribution (T6) ----------
     Capturado uma vez, na carga da página (é a mesma página a viagem toda —
     site de página única em scroll, não muda de URL). Sem cookie/visitante
     persistente ainda (fora de escopo desta rodada) — isso é sempre o touch
     de CONVERSÃO (no momento do envio do formulário), nunca FIRST/LAST de
     verdade. Nunca bloqueia o formulário se algo aqui falhar. */
  var ATTRIBUTION = (function(){
    try{
      var qs = new URLSearchParams(window.location.search);
      var pick = function(k){ var v = qs.get(k); return v ? v.slice(0,200) : undefined; };
      return {
        utmSource: pick("utm_source"), utmMedium: pick("utm_medium"), utmCampaign: pick("utm_campaign"),
        utmContent: pick("utm_content"), utmTerm: pick("utm_term"),
        gclid: pick("gclid"), fbclid: pick("fbclid"),
        landingPage: String(window.location.href||"").slice(0,1000),
        referrer: String(document.referrer||"").slice(0,1000)
      };
    }catch(e){ return {}; }
  })();

  function waLink(msg){
    return "https://wa.me/"+C.whatsapp+"?text="+encodeURIComponent(msg||"Olá! Vim do site Partiu Marrocos e quero saber mais sobre as viagens. 🐪");
  }
  document.querySelectorAll("[data-wa]").forEach(function(a){
    a.addEventListener("click",function(e){ e.preventDefault(); open(waLink(),"_blank"); });
  });
  var fabWa=document.getElementById("fabWa");
  fabWa.addEventListener("click",function(e){ e.preventDefault(); open(waLink(),"_blank"); });

  /* ---------- HERO in ---------- */
  window.heroIn=function(){
    if(reduced || !hasGSAP){ document.querySelectorAll(".s-title .rv").forEach(function(el){el.style.opacity=1;}); countUp(document.getElementById("pmMeta")); return; }
    gsap.fromTo("#hTitle .ch",{yPercent:110,opacity:0},{yPercent:0,opacity:1,duration:1.15,ease:"power4.out",stagger:.045});
    gsap.fromTo(".s-title .rv",{y:40,opacity:0},{y:0,opacity:1,duration:1,ease:"power3.out",stagger:.12,delay:.35});
    countUp(document.getElementById("pmMeta"));
  };
  heroReady=true; if(coldDone) heroIn();

  function countUp(scope){
    if(!scope) return;
    scope.querySelectorAll("[data-count]").forEach(function(el){
      var target=parseInt(el.getAttribute("data-count"),10);
      if(!hasGSAP||reduced){ el.textContent=target; return; }
      var o={v:0};
      gsap.to(o,{v:target,duration:1.6,ease:"power2.out",onUpdate:function(){ el.textContent=Math.round(o.v); }});
    });
  }

  if(hasGSAP && !reduced){
    gsap.fromTo("#heroBg",{scale:1.14},{scale:1,ease:"none",scrollTrigger:{trigger:".s-title",start:"top top",end:"bottom top",scrub:1}});
    gsap.to("#heroBg",{yPercent:14,ease:"none",scrollTrigger:{trigger:".s-title",start:"top top",end:"bottom top",scrub:1}});
    gsap.to("#progress",{scaleX:1,ease:"none",scrollTrigger:{trigger:document.body,start:"top top",end:"bottom bottom",scrub:.4}});

    gsap.utils.toArray(".rv").forEach(function(el){
      if(el.closest(".s-title")) return;
      gsap.fromTo(el,{y:46,opacity:0},{y:0,opacity:1,duration:1,ease:"power3.out",
        scrollTrigger:{trigger:el,start:"top 94%",toggleActions:"play none none none"}});
    });

    document.querySelectorAll("[data-split]").forEach(function(line){
      var html=line.innerHTML;
      line.innerHTML=html.replace(/(^|>)([^<]+)(?=<|$)/g,function(m,p1,txt){
        return p1+txt.split(/(\s+)/).map(function(w){
          return /^\s+$/.test(w)?w:'<span class="w" style="opacity:0;display:inline-block">'+w+'</span>';
        }).join("");
      });
      gsap.to(line.querySelectorAll(".w"),{opacity:1,y:0,duration:.9,ease:"power3.out",stagger:.05,
        scrollTrigger:{trigger:line,start:"top 82%"},startAt:{y:34}});
    });

    /* filmstrip pinada */
    var track=document.getElementById("track"), frames=track.children.length;
    gsap.to(track,{x:function(){return -(track.scrollWidth - innerWidth);},ease:"none",
      scrollTrigger:{trigger:"#cenarios",start:"top top",
        end:function(){ return "+=" + (track.scrollWidth - innerWidth + innerHeight*.4); },
        pin:true,scrub:1,invalidateOnRefresh:true,
        onUpdate:function(st){ document.getElementById("fCur").textContent=pad(Math.min(frames,Math.floor(st.progress*frames)+1)); }}});

    /* parallax + contadores da alma */
    document.querySelectorAll(".pximg[data-px]").forEach(function(el){
      gsap.fromTo(el,{yPercent:-6},{yPercent:8,ease:"none",
        scrollTrigger:{trigger:el.closest(".scene"),start:"top bottom",end:"bottom top",scrub:1}});
    });
    ScrollTrigger.create({trigger:"#soulStats",start:"top 85%",once:true,
      onEnter:function(){ countUp(document.getElementById("soulStats")); }});
  }else{
    document.getElementById("km") && (document.getElementById("km").textContent="");
    countUp(document.getElementById("soulStats"));
  }

  /* ---------- ROTAS ANIMADAS POR PACOTE ---------- */
  var animatedPanes={};
  function animateRoute(pane){
    var path=pane.querySelector(".rpath"), km=parseInt(pane.getAttribute("data-km"),10)||0,
        kmEl=pane.querySelector(".km"),
        stops=[].slice.call(pane.querySelectorAll(".stop")),
        pts=[].slice.call(pane.querySelectorAll(".pt")),
        N=pts.length;
    stops.forEach(function(s){s.classList.remove("lit");});
    pts.forEach(function(p){p.classList.remove("lit");});
    if(!hasGSAP || reduced){
      stops.concat(pts).forEach(function(x){x.classList.add("lit");});
      if(kmEl) kmEl.textContent=km;
      if(path) path.style.strokeDasharray="none";
      return;
    }
    var len=path.getTotalLength();
    path.style.strokeDasharray=len; path.style.strokeDashoffset=len;
    var o={p:0};
    gsap.to(o,{p:1,duration:Math.max(1.8,N*.42),ease:"power1.inOut",
      onUpdate:function(){
        path.style.strokeDashoffset=len*(1-o.p);
        if(kmEl) kmEl.textContent=Math.round(o.p*km);
        var lit=Math.floor(o.p*(N-.001));
        stops.forEach(function(s,i){ s.classList.toggle("lit", i<=lit); });
        pts.forEach(function(p,i){ p.classList.toggle("lit", i<=lit); });
      }});
  }
  function activateRoute(id){
    document.querySelectorAll("#rtTabs .day-tab").forEach(function(t){ t.classList.toggle("on", t.getAttribute("data-rt")===id); });
    document.querySelectorAll(".rt-pane").forEach(function(p){
      var on=p.getAttribute("data-pane")===id;
      p.classList.toggle("on",on);
      if(on) animateRoute(p);
    });
    if(hasGSAP) ScrollTrigger.refresh();
  }
  document.querySelectorAll("#rtTabs .day-tab").forEach(function(t){
    t.addEventListener("click",function(){ activateRoute(t.getAttribute("data-rt")); });
  });
  /* primeira rota anima ao entrar em cena */
  var firstPane=document.querySelector(".rt-pane.on");
  if(firstPane){
    if(hasGSAP && !reduced){
      ScrollTrigger.create({trigger:"#rota",start:"top 62%",once:true,onEnter:function(){ animateRoute(firstPane); }});
    }else animateRoute(firstPane);
  }

  /* ---------- FICHAS DE DESTINO ---------- */
  var DEST=D.destinos, dmodal=document.getElementById("dmodal"), dIdx=0;
  function fillDest(i){
    dIdx=(i+DEST.length)%DEST.length;
    var d=DEST[dIdx];
    document.getElementById("dmImg").src=d.img;
    document.getElementById("dmImg").alt=d.t;
    document.getElementById("dmK").textContent=d.k;
    document.getElementById("dmT").textContent=d.t;
    document.getElementById("dmD").textContent=d.d;
    document.getElementById("dmF").innerHTML=d.f.map(function(x){return "<span>"+x+"</span>";}).join("");
    document.getElementById("dmIdx").textContent=pad(dIdx+1)+" / "+pad(DEST.length);
  }
  function openDest(key){
    var i=DEST.findIndex(function(d){return d.key===key;});
    fillDest(i<0?0:i);
    dmodal.classList.add("open"); document.body.style.overflow="hidden";
    if(hasGSAP&&!reduced) gsap.fromTo(".dsheet",{y:40,opacity:0},{y:0,opacity:1,duration:.6,ease:"power3.out"});
  }
  function closeDest(){ dmodal.classList.remove("open"); document.body.style.overflow=""; }
  document.querySelectorAll(".frame[data-dest]").forEach(function(f){
    f.addEventListener("click",function(){ openDest(f.getAttribute("data-dest")); });
  });
  dmodal.querySelectorAll("[data-close]").forEach(function(b){ b.addEventListener("click",closeDest); });
  document.getElementById("dmPrev").addEventListener("click",function(){ fillDest(dIdx-1); });
  document.getElementById("dmNext").addEventListener("click",function(){ fillDest(dIdx+1); });

  /* ---------- STORYBOARD tabs ---------- */
  document.querySelectorAll("#dayTabs .day-tab").forEach(function(t){
    t.addEventListener("click",function(){
      document.querySelectorAll("#dayTabs .day-tab").forEach(function(x){x.classList.remove("on");});
      document.querySelectorAll("#boards .board").forEach(function(x){x.classList.remove("on");});
      t.classList.add("on");
      var b=document.getElementById(t.getAttribute("data-board"));
      b.classList.add("on");
      if(hasGSAP&&!reduced) gsap.fromTo(b.children,{y:26,opacity:0},{y:0,opacity:1,duration:.6,ease:"power2.out",stagger:.05});
      if(hasGSAP) ScrollTrigger.refresh();
    });
  });
  document.querySelectorAll(".book[data-pkg]").forEach(function(b){
    b.addEventListener("click",function(){ document.getElementById("fPkg").value=b.getAttribute("data-pkg"); });
  });

  /* ---------- LIGHTBOX pan + vídeo ---------- */
  var PEEKS=D.peeks;
  var lb=document.getElementById("lb"), lbImg=document.getElementById("lbImg"),
      lbStage=document.getElementById("lbStage"), pIdx=0, panX=0, dragging=false, startX=0;
  function clearVid(){ var f=lbStage.querySelector("iframe"); if(f) f.remove(); lbImg.style.display=""; }
  function showPeek(i){
    clearVid();
    pIdx=(i+PEEKS.length)%PEEKS.length; panX=0; applyPan();
    var p=PEEKS[pIdx];
    lbImg.src=p.img; lbImg.alt=p.t;
    document.getElementById("lbK").textContent=p.k;
    document.getElementById("lbT").textContent=p.t;
  }
  function applyPan(){
    var lim=innerWidth<700?130:280;
    panX=Math.max(-lim,Math.min(lim,panX));
    lbImg.style.transform="translate(calc(-50% + "+panX+"px),-50%) scale(1.35)";
  }
  document.querySelectorAll(".peek[data-peek]").forEach(function(p){
    p.addEventListener("click",function(){
      showPeek(parseInt(p.getAttribute("data-peek"),10));
      lb.classList.add("open"); document.body.style.overflow="hidden";
    });
  });
  function lbClose(){ lb.classList.remove("open"); document.body.style.overflow=""; clearVid(); }
  document.getElementById("lbX").addEventListener("click",lbClose);
  document.getElementById("lbPrev").addEventListener("click",function(){ showPeek(pIdx-1); });
  document.getElementById("lbNext").addEventListener("click",function(){ showPeek(pIdx+1); });
  lbStage.addEventListener("pointerdown",function(e){ dragging=true; startX=e.clientX-panX; lbStage.classList.add("grab"); });
  addEventListener("pointermove",function(e){ if(dragging){ panX=e.clientX-startX; applyPan(); } });
  addEventListener("pointerup",function(){ dragging=false; lbStage.classList.remove("grab"); });
  addEventListener("keydown",function(e){
    if(e.key==="Escape"){ lbClose(); closeDest(); }
    if(lb.classList.contains("open") && !lbStage.querySelector("iframe")){
      if(e.key==="ArrowLeft") showPeek(pIdx-1); if(e.key==="ArrowRight") showPeek(pIdx+1);
    }
  });

  /* vídeo: YouTube configurável */
  function ytId(u){
    if(!u) return "";
    var m=String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m?m[1]:(String(u).match(/^[\w-]{11}$/)?u:"");
  }
  document.getElementById("vcard").addEventListener("click",function(){
    var id=ytId(C.youtube);
    lb.classList.add("open"); document.body.style.overflow="hidden";
    if(id){
      clearVid(); lbImg.style.display="none";
      var f=document.createElement("iframe");
      f.src="https://www.youtube-nocookie.com/embed/"+id+"?autoplay=1&rel=0";
      f.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      f.allowFullscreen=true;
      f.style.cssText="position:absolute;inset:0;width:100%;height:100%;border:0";
      lbStage.appendChild(f);
      document.getElementById("lbK").textContent="Em movimento";
      document.getElementById("lbT").textContent="Partiu Marrocos · teaser";
    }else{
      showPeek(1);
      document.getElementById("lbK").textContent="Teaser";
      document.getElementById("lbT").textContent="Em breve · configure o vídeo no painel admin";
    }
  });

  /* ---------- CLAQUETE ---------- */
  var slate=document.getElementById("slate"), curSlate="";
  var so=new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(e.isIntersecting){
        var s=e.target.getAttribute("data-slate");
        if(s && s!==curSlate){ curSlate=s; slate.classList.add("swap");
          setTimeout(function(){ slate.textContent=s; slate.classList.remove("swap"); },180); }
      }
    });
  },{rootMargin:"-42% 0px -42% 0px"});
  document.querySelectorAll(".scene[data-slate]").forEach(function(s){ so.observe(s); });

  /* ---------- FORM → CRM (grava o lead) → WhatsApp ----------
     Antes, o formulário só montava uma mensagem e abria o WhatsApp — se o
     visitante não confirmasse a conversa lá, o lead se perdia (achado
     crítico da auditoria, ver DOCUMENTO-DE-FUNDACAO). Agora grava no CRM
     primeiro (POST /api/public/leads), com timeout curto — o WhatsApp abre
     de qualquer forma (sucesso, erro ou timeout do CRM), o visitante nunca
     fica esperando nem percebe diferença. */
  function enviarLeadCRM(dados){
    if(!C.apiBase || !C.tenantSlug) return Promise.resolve();
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function(){ ctrl.abort(); },6000) : null;
    return fetch(C.apiBase.replace(/\/$/,"")+"/api/public/leads",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(Object.assign({
        tenantSlug:C.tenantSlug, nome:dados.nome, telefone:dados.zap, email:dados.mail,
        origem:"site", mensagem:dados.msg
      }, ATTRIBUTION)),
      signal: ctrl ? ctrl.signal : undefined
    }).catch(function(){ /* CRM fora do ar ou timeout — nunca bloqueia o WhatsApp */ })
      .finally(function(){ if(timer) clearTimeout(timer); });
  }

  document.getElementById("bookForm").addEventListener("submit",function(e){
    e.preventDefault();
    var v=function(id){ return (document.getElementById(id).value||"").trim(); };
    if(!v("fNome")||!v("fZap")){ document.getElementById(v("fNome")?"fZap":"fNome").focus(); return; }
    var resumo="Pessoas: "+v("fPess")+" · Quando: "+v("fQuando")+" · Pacote: "+v("fPkg")+
      " · Tipo: "+v("fTipo")+" · Orçamento: "+v("fOrc")+(v("fMsg")?" · Sonho: "+v("fMsg"):"");
    var msg="🐪 *Pedido de orçamento — Partiu Marrocos*\n"+
      "Nome: "+v("fNome")+"\nWhatsApp: "+v("fZap")+
      (v("fMail")?"\nE-mail: "+v("fMail"):"")+
      (v("fPess")?"\nPessoas: "+v("fPess"):"")+
      (v("fQuando")?"\nQuando: "+v("fQuando"):"")+
      "\nPacote: "+v("fPkg")+"\nTipo: "+v("fTipo")+"\nOrçamento: "+v("fOrc")+
      (v("fMsg")?"\nSonho: "+v("fMsg"):"");
    document.getElementById("fok").classList.add("on");
    enviarLeadCRM({nome:v("fNome"),zap:v("fZap"),mail:v("fMail"),msg:resumo}).then(function(){
      setTimeout(function(){ open(waLink(msg),"_blank"); },900);
    });
  });

  /* ---------- CHAT YALLA (dados do admin) ---------- */
  var BOT=D.chatbot;
  var KB=BOT.kb.map(function(e){ return {k:String(e.k).split(",").map(function(x){return x.trim();}).filter(Boolean), a:e.a, esc:!!e.esc}; });
  var chat=document.getElementById("chat"), fab=document.getElementById("fab"),
      chatBody=document.getElementById("chatBody"), started=false;
  document.querySelector("#chat header b").textContent=BOT.nome||"Yalla";
  function cnorm(s){ return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
  function reply(text){
    var t=cnorm(text);
    for(var i=0;i<KB.length;i++){ if(KB[i].k.some(function(kw){return t.indexOf(cnorm(kw))>=0;})) return KB[i]; }
    return {a:BOT.fallback,esc:true};
  }
  function addMsg(text,who){
    var m=document.createElement("div"); m.className="msg "+who;
    m.innerHTML=String(text).replace(/\*(.+?)\*/g,"<b>$1</b>");
    chatBody.appendChild(m); chatBody.scrollTop=chatBody.scrollHeight;
  }
  function botSay(item){
    setTimeout(function(){
      addMsg(item.a,"bot");
      if(item.esc){
        var w=document.createElement("div"); w.className="msg bot"; w.style.cssText="background:transparent;border:none;padding:0";
        var a=document.createElement("a"); a.href=waLink(); a.target="_blank"; a.rel="noopener";
        a.className="cta-mini"; a.style.display="inline-block"; a.textContent="💬 FALAR NO WHATSAPP";
        w.appendChild(a); chatBody.appendChild(w); chatBody.scrollTop=chatBody.scrollHeight;
      }
    },500+Math.random()*400);
  }
  function handle(text){
    if(!text.trim()) return;
    addMsg(text,"user");
    document.getElementById("chatIn").value="";
    botSay(reply(text));
  }
  fab.addEventListener("click",function(){
    chat.classList.add("open"); fab.style.display="none"; fabWa.style.display="none";
    if(!started){ started=true; botSay(KB[0]||{a:BOT.fallback});
      var chips=document.getElementById("chatChips");
      (BOT.chips||[]).forEach(function(c){ var b=document.createElement("button"); b.type="button"; b.className="chip"; b.textContent=c;
        b.onclick=function(){ handle(c); }; chips.appendChild(b); });
    }
    document.getElementById("chatIn").focus();
  });
  document.getElementById("chatX").addEventListener("click",function(){ chat.classList.remove("open"); fab.style.display=""; fabWa.style.display=""; });
  document.getElementById("chatForm").addEventListener("submit",function(e){ e.preventDefault(); handle(document.getElementById("chatIn").value); });

  /* nav suave */
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener("click",function(e){
      var id=a.getAttribute("href"); if(id.length<2) return;
      var el=document.querySelector(id); if(!el) return;
      e.preventDefault();
      var y=el.getBoundingClientRect().top+scrollY-52;
      window.scrollTo({top:y,behavior:reduced?"auto":"smooth"});
    });
  });

  if(hasGSAP) setTimeout(function(){ ScrollTrigger.refresh(); }, 400);
});
})();
