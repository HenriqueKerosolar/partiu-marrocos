/* ============================================================
   PARTIU MARROCOS — js/admin.js
   Painel administrativo schema-driven sobre PM_DATA.
   ============================================================ */
(function(){
"use strict";
var DATA=null, dirty=false;
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function $(s,c){ return (c||document).querySelector(s); }
function el(tag,cls,html){ var e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
function get(obj,path){ return path.split(".").reduce(function(o,k){ return o==null?o:o[k]; },obj); }
function set(obj,path,val){ var ks=path.split("."),last=ks.pop(),o=obj; ks.forEach(function(k){ o=o[k]; }); o[last]=val; }
function status(msg,cls){ var s=$("#status"); s.textContent=msg; s.className="status "+(cls||""); if(msg) setTimeout(function(){ if(s.textContent===msg){s.textContent="";s.className="status";} },5000); }
function markDirty(){ dirty=true; }
addEventListener("beforeunload",function(e){ if(dirty){ e.preventDefault(); e.returnValue=""; } });

/* ================= GATE =================
   A senha nunca fica no navegador (nem hardcoded, nem em localStorage) —
   check-pass.php valida contra config.php no servidor, com rate limit.
   O valor digitado fica só em memória (var módulo, some ao recarregar a
   página) para reenviar em save.php/upload.php nesta mesma sessão. */
var enteredPass="";
function pass(){ return enteredPass; }
$("#gateGo").addEventListener("click",tryGate);
$("#gatePass").addEventListener("keydown",function(e){ if(e.key==="Enter") tryGate(); });
function tryGate(){
  var candidate=$("#gatePass").value;
  $("#gateGo").disabled=true;
  $("#gateErr").style.display="none";
  fetch("check-pass.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pass:candidate})})
    .then(function(r){ return r.json(); })
    .then(function(j){
      $("#gateGo").disabled=false;
      if(j.ok){ enteredPass=candidate; $("#gate").style.display="none"; boot(); }
      else { $("#gateErr").textContent=j.err||"Senha incorreta."; $("#gateErr").style.display="block"; }
    })
    .catch(function(){ $("#gateGo").disabled=false; $("#gateErr").textContent="Não foi possível validar agora — confira sua conexão."; $("#gateErr").style.display="block"; });
}

/* ================= CAMPOS ================= */
function fld(label,inputEl,note){
  var w=el("div","fld"); var l=el("label",null,label); w.appendChild(l); w.appendChild(inputEl);
  if(note) w.appendChild(el("div","note",note));
  return w;
}
function inp(path,type){
  var i=document.createElement(type==="ta"?"textarea":"input");
  if(type==="n") i.type="number";
  var v=get(DATA,path);
  i.value=v==null?"":v;
  i.addEventListener("input",function(){ set(DATA,path,type==="n"?parseFloat(i.value)||0:i.value); markDirty(); });
  return i;
}
function chk(path,label){
  var w=el("label","chk"); var i=document.createElement("input"); i.type="checkbox"; i.checked=!!get(DATA,path);
  i.addEventListener("change",function(){ set(DATA,path,i.checked); markDirty(); });
  w.appendChild(i); w.appendChild(document.createTextNode(label));
  return w;
}
function csv(path,label,note){ /* array de strings ↔ linhas */
  var i=document.createElement("textarea");
  i.value=(get(DATA,path)||[]).join("\n");
  i.addEventListener("input",function(){ set(DATA,path,i.value.split("\n").map(function(s){return s.trim();}).filter(Boolean)); markDirty(); });
  return fld(label,i,note||"Um item por linha.");
}
function imgf(path,label){
  var w=el("div","fld"); w.appendChild(el("label",null,label));
  var row=el("div","imgfld");
  var i=document.createElement("input"); i.type="text"; i.value=get(DATA,path)||""; i.placeholder="img/foto.jpg ou https://...";
  var th=document.createElement("img"); th.className="thumb"; th.src=i.value; th.onerror=function(){ th.style.opacity=.15; };
  i.addEventListener("input",function(){ set(DATA,path,i.value); th.style.opacity=1; th.src=i.value; markDirty(); });
  var up=el("button","btn ghost up","enviar"); up.type="button";
  var file=document.createElement("input"); file.type="file"; file.accept="image/*"; file.style.display="none";
  up.addEventListener("click",function(){ file.click(); });
  file.addEventListener("change",function(){
    if(!file.files[0]) return;
    var fd=new FormData(); fd.append("pass",pass()); fd.append("file",file.files[0]);
    status("Enviando imagem...");
    fetch("upload.php",{method:"POST",body:fd}).then(function(r){return r.json();}).then(function(j){
      if(j.ok){ i.value=j.path; set(DATA,path,j.path); th.src=j.path; markDirty(); status("Imagem enviada: "+j.path,"ok"); }
      else status("Upload recusado: "+(j.err||"erro"),"err");
    }).catch(function(){ status("Upload indisponível aqui. Suba a imagem por FTP/cPanel para a pasta img/ e digite o caminho.","err"); });
  });
  row.appendChild(i); row.appendChild(th); row.appendChild(up); row.appendChild(file);
  w.appendChild(row);
  return w;
}
/* lista de objetos com colapso, add/remove/duplicar/mover */
function list(cont,path,cfg){
  cont.innerHTML="";
  var arr=get(DATA,path)||[];
  arr.forEach(function(item,idx){
    var it=el("div","item"+(cfg.open?" open":""));
    var head=el("div","head");
    head.appendChild(el("span","idx mono",(idx+1<10?"0":"")+(idx+1)));
    var ttl=el("span","ttl",cfg.title(item)||"—");
    head.appendChild(ttl);
    [["↑","mover para cima",function(){ if(idx>0){ arr.splice(idx-1,0,arr.splice(idx,1)[0]); markDirty(); list(cont,path,cfg);} }],
     ["↓","mover para baixo",function(){ if(idx<arr.length-1){ arr.splice(idx+1,0,arr.splice(idx,1)[0]); markDirty(); list(cont,path,cfg);} }],
     ["⧉","duplicar",function(){ arr.splice(idx+1,0,clone(item)); markDirty(); list(cont,path,cfg); }],
     ["✕","remover",function(){ if(confirm("Remover este item?")){ arr.splice(idx,1); markDirty(); list(cont,path,cfg);} }]
    ].forEach(function(b){
      var bt=el("button","mini"+(b[0]==="✕"?" del":""),b[0]); bt.type="button"; bt.title=b[1];
      bt.addEventListener("click",function(e){ e.stopPropagation(); b[2](); });
      head.appendChild(bt);
    });
    head.addEventListener("click",function(){ it.classList.toggle("open"); });
    it.appendChild(head);
    var body=el("div","body");
    cfg.fields(body,path+"."+idx,item,function(){ ttl.innerHTML=cfg.title(item)||"—"; });
    it.appendChild(body);
    cont.appendChild(it);
  });
  var add=el("button","addbtn","+ adicionar "+(cfg.name||"item")); add.type="button";
  add.addEventListener("click",function(){ arr.push(clone(cfg.blank)); markDirty(); list(cont,path,cfg); cont.lastElementChild.previousElementSibling.classList.add("open"); });
  cont.appendChild(add);
}
/* input que atualiza o título do item */
function tinp(path,retitle,type){
  var i=inp(path,type);
  i.addEventListener("input",retitle);
  return i;
}

/* ================= SEÇÕES ================= */
var SECTIONS=[
{id:"geral",label:"⚙ Geral & Contatos",build:function(s){
  s.appendChild(el("h2",null,"Geral & <em>contatos</em>"));
  s.appendChild(el("div","hint","WhatsApp: só dígitos com DDI (ex.: 5521999998888). YouTube: cole a URL ou só o ID do vídeo — aparece na Cena 10."));
  var g=el("div","grid2");
  g.appendChild(fld("WhatsApp (DDI+DDD+número)",inp("config.whatsapp")));
  g.appendChild(fld("E-mail",inp("config.email")));
  g.appendChild(fld("Site",inp("config.site")));
  g.appendChild(fld("Vídeo YouTube (URL ou ID)",inp("config.youtube")));
  g.appendChild(fld("Instagram (URL)",inp("config.instagram")));
  g.appendChild(fld("Facebook (URL)",inp("config.facebook")));
  g.appendChild(fld("Dona do site",inp("config.owner")));
  g.appendChild(fld("Operadora no Marrocos",inp("config.operator")));
  s.appendChild(g);
  s.appendChild(fld("Nota sob o vídeo (Cena 10)",inp("config.videoNote","ta")));
  var sb2=el("div","subblock"); sb2.appendChild(el("h4",null,"Integração com o CRM (captura de lead)"));
  var g2=el("div","grid2");
  g2.appendChild(fld("URL base do CRM",inp("config.apiBase"),"Ex.: https://app.partiumarrocos.com — sem barra no final."));
  g2.appendChild(fld("Identificador do tenant (slug)",inp("config.tenantSlug")));
  sb2.appendChild(g2);
  sb2.appendChild(el("div","note","O formulário de orçamento grava o lead no CRM antes de abrir o WhatsApp. Se ficar em branco ou o CRM estiver fora do ar, o formulário continua funcionando normalmente (só não grava o lead)."));
  s.appendChild(sb2);
  var sb=el("div","subblock"); sb.appendChild(el("h4",null,"Senha deste painel"));
  sb.appendChild(el("div","note","A senha é definida no servidor, em config.php (veja config.example.php e o README) — não existe mais senha separada guardada no navegador."));
  s.appendChild(sb);
}},
{id:"hero",label:"🎬 Cena 01 · Título",build:function(s){
  s.appendChild(el("h2",null,"Cena 01 · <em>título</em>"));
  var g=el("div","grid2");
  g.appendChild(fld("Kicker (linha acima)",inp("hero.kicker")));
  g.appendChild(fld('Palavra pequena ("Partiu,")',inp("hero.partiu")));
  g.appendChild(fld("Título gigante",inp("hero.titulo")));
  g.appendChild(fld("Posição da letra âmbar (0 = primeira)",inp("hero.oIndex","n")));
  s.appendChild(g);
  s.appendChild(fld("Subtítulo (legenda)",inp("hero.subtitle","ta")));
  s.appendChild(imgf("hero.img","Imagem de fundo"));
  var c=el("div"); s.appendChild(el("h2",null,"Números do herói")); s.appendChild(c);
  list(c,"hero.stats",{name:"número",blank:{n:"0",suf:"",l:"novo dado"},title:function(i){return (i.n||"")+(i.suf||"")+" · "+(i.l||"");},fields:function(b,p,i,rt){
    var g=el("div","grid3");
    g.appendChild(fld("Número",tinp(p+".n",rt)));
    g.appendChild(fld("Sufixo (+, k+, ★...)",tinp(p+".suf",rt)));
    g.appendChild(fld("Legenda",tinp(p+".l",rt)));
    b.appendChild(g);
  }});
}},
{id:"trailer",label:"🎞 Cena 02 · Trailer",build:function(s){
  s.appendChild(el("h2",null,"Cena 02 · <em>trailer & takes</em>"));
  s.appendChild(el("div","hint","As frases grandes aceitam HTML leve: &lt;em&gt;itálico claro&lt;/em&gt; e &lt;span class=\"hi\"&gt;destaque âmbar&lt;/span&gt;."));
  s.appendChild(csv("trailer.lines","Frases do trailer (uma por linha)"));
  var c=el("div"); s.appendChild(c);
  list(c,"trailer.takes",{name:"take",blank:{t:"Novo motivo",d:"Descrição."},title:function(i){return i.t;},fields:function(b,p,i,rt){
    b.appendChild(fld("Título",tinp(p+".t",rt)));
    b.appendChild(fld("Texto",inp(p+".d","ta")));
  }});
}},
{id:"destinos",label:"📍 Cena 03 · Destinos",build:function(s){
  s.appendChild(el("h2",null,"Cena 03 · <em>destinos & fichas</em>"));
  s.appendChild(el("div","hint","Marque \"na película\" para o destino aparecer na tira horizontal. Todos aparecem na ficha técnica (modal)."));
  var c=el("div"); s.appendChild(c);
  list(c,"destinos",{name:"destino",blank:{key:"novo",k:"Apelido",t:"Novo destino",img:"img/dunes.jpg",strip:true,cap:"Novo destino",sub:"legenda curta",d:"Descrição completa.",f:["✨ Destaque 1","✨ Destaque 2"]},title:function(i){return i.t+(i.strip?" · 🎞":"");},fields:function(b,p,i,rt){
    var g=el("div","grid2");
    g.appendChild(fld("Nome (ficha)",tinp(p+".t",rt)));
    g.appendChild(fld("Apelido/kicker",inp(p+".k")));
    g.appendChild(fld("Nome na película",inp(p+".cap")));
    g.appendChild(fld("Legenda na película",inp(p+".sub")));
    b.appendChild(g);
    b.appendChild(chk(p+".strip","Aparece na película (tira horizontal)"));
    b.appendChild(imgf(p+".img","Foto"));
    b.appendChild(fld("Descrição da ficha",inp(p+".d","ta")));
    b.appendChild(csv(p+".f","Destaques (chips da ficha)"));
  }});
}},
{id:"pacotes",label:"🎟 Pacotes & Rotas",build:function(s){
  s.appendChild(el("h2",null,"Pacotes, roteiros & <em>rotas</em>"));
  s.appendChild(el("div","hint","Cada pacote gera automaticamente: aba na Cena 04 com a ROTA ANIMADA (desenhada a partir das paradas abaixo), storyboard dia a dia na Cena 05, pôster na Cena 06, opção no formulário e o MAPA DO TESOURO em PDF."));
  var c=el("div"); s.appendChild(c);
  list(c,"pacotes",{name:"pacote",open:false,blank:{id:"novo-"+Date.now().toString(36),emoji:"🐪",cat:"Curta",dias:"5",noites:"4",ep:"A nova jornada",nome:"Marrocos Novo",sub:"Novo",sinopse:"Descrição do pacote.",inc:["Item incluído"],preco:"R$ 0.000",featured:false,img:"img/dunes.jpg",roteiro:[{n:"Dia 1",t:"Chegada",d:"Descrição do dia.",chips:["Chip"]}],rota:{km:500,stops:[{n:"Partida",s:"início"},{n:"Chegada",s:"fim"}]}},
  title:function(i){return (i.emoji||"")+" "+i.nome+" · "+i.dias+" dias";},fields:function(b,p,i,rt){
    var g=el("div","grid3");
    g.appendChild(fld("Nome",tinp(p+".nome",rt)));
    g.appendChild(fld("Emoji",tinp(p+".emoji",rt)));
    g.appendChild(fld("ID (url do mapa, sem espaços)",inp(p+".id")));
    g.appendChild(fld("Dias",tinp(p+".dias",rt)));
    g.appendChild(fld("Noites",inp(p+".noites")));
    g.appendChild(fld("Categoria (Curta/Longa/Épico)",inp(p+".cat")));
    g.appendChild(fld('Chamada ("A estreia"...)',inp(p+".ep")));
    g.appendChild(fld("Palavra em itálico no pôster",inp(p+".sub")));
    g.appendChild(fld("Preço (a partir de)",inp(p+".preco")));
    b.appendChild(g);
    b.appendChild(chk(p+".featured","Destaque (\"Mais assistido\", moldura âmbar)"));
    b.appendChild(imgf(p+".img","Foto do pôster"));
    b.appendChild(fld("Sinopse",inp(p+".sinopse","ta")));
    b.appendChild(csv(p+".inc","Inclusões (bullets do pôster)"));
    /* roteiro dia a dia */
    var sb1=el("div","subblock"); sb1.appendChild(el("h4",null,"Storyboard · dia a dia"));
    var c1=el("div"); sb1.appendChild(c1); b.appendChild(sb1);
    list(c1,p+".roteiro",{name:"dia",blank:{n:"Dia X",t:"Título",d:"Descrição.",chips:["Chip"]},title:function(d){return d.n+" — "+d.t;},fields:function(bb,pp,dd,rr){
      var gg=el("div","grid2");
      gg.appendChild(fld('Rótulo ("Dia 3", "Dias 8–9")',tinp(pp+".n",rr)));
      gg.appendChild(fld("Título",tinp(pp+".t",rr)));
      bb.appendChild(gg);
      bb.appendChild(fld("Descrição",inp(pp+".d","ta")));
      bb.appendChild(csv(pp+".chips","Chips (tags do dia)"));
    }});
    /* rota */
    var sb2=el("div","subblock"); sb2.appendChild(el("h4",null,"Rota animada & mapa do tesouro"));
    sb2.appendChild(fld("Quilometragem total",inp(p+".rota.km","n"),"Usada no contador animado e no mapa."));
    var c2=el("div"); sb2.appendChild(c2); b.appendChild(sb2);
    list(c2,p+".rota.stops",{name:"parada",blank:{n:"Nova parada",s:"descrição curta"},title:function(x){return x.n;},fields:function(bb,pp,xx,rr){
      var gg=el("div","grid2");
      gg.appendChild(fld("Local",tinp(pp+".n",rr)));
      gg.appendChild(fld("Descrição curta",inp(pp+".s")));
      bb.appendChild(gg);
    }});
  }});
  s.appendChild(fld("Nota de preços (abaixo dos pôsteres)",inp("precosNota","ta")));
}},
{id:"exps",label:"✨ Cena 07 · Experiências",build:function(s){
  s.appendChild(el("h2",null,"Cena 07 · <em>experiências</em>"));
  var c=el("div"); s.appendChild(c);
  list(c,"experiencias",{name:"experiência",blank:{tk:"EXT · local",t:"Nova experiência",d:"Descrição.",img:"img/dunes.jpg"},title:function(i){return i.t;},fields:function(b,p,i,rt){
    var g=el("div","grid2");
    g.appendChild(fld("Título",tinp(p+".t",rt)));
    g.appendChild(fld("Slate (EXT · Saara · noite)",inp(p+".tk")));
    b.appendChild(g);
    b.appendChild(fld("Descrição (aparece no hover)",inp(p+".d","ta")));
    b.appendChild(imgf(p+".img","Foto"));
  }});
}},
{id:"pratos",label:"🍲 Cena 08 · Gastronomia",build:function(s){
  s.appendChild(el("h2",null,"Cena 08 · <em>gastronomia</em>"));
  s.appendChild(el("div","hint","O letreiro (marquee) usa os nomes dos pratos automaticamente."));
  var c=el("div"); s.appendChild(c);
  list(c,"pratos",{name:"prato",blank:{t:"Novo prato",d:"Descrição.",img:"img/tagine.jpg"},title:function(i){return i.t;},fields:function(b,p,i,rt){
    b.appendChild(fld("Nome",tinp(p+".t",rt)));
    b.appendChild(fld("Descrição",inp(p+".d","ta")));
    b.appendChild(imgf(p+".img","Foto"));
  }});
}},
{id:"peeks",label:"🔭 Cena 09 · Tour",build:function(s){
  s.appendChild(el("h2",null,"Cena 09 · <em>tour panorâmico</em>"));
  var c=el("div"); s.appendChild(c);
  list(c,"peeks",{name:"cena",blank:{k:"Local",t:"Descrição",img:"img/jemaa.jpg"},title:function(i){return i.k+" — "+i.t;},fields:function(b,p,i,rt){
    var g=el("div","grid2");
    g.appendChild(fld("Kicker",tinp(p+".k",rt)));
    g.appendChild(fld("Título",tinp(p+".t",rt)));
    b.appendChild(g);
    b.appendChild(imgf(p+".img","Foto (quanto mais larga, melhor o passeio)"));
  }});
}},
{id:"fatos",label:"💡 Cena 11 · Curiosidades",build:function(s){
  s.appendChild(el("h2",null,"Cena 11 · <em>curiosidades</em>"));
  var c=el("div"); s.appendChild(c);
  list(c,"fatos",{name:"curiosidade",blank:{i:"✨",t:"Nova curiosidade",d:"Texto."},title:function(x){return (x.i||"")+" "+x.t;},fields:function(b,p,i,rt){
    var g=el("div","grid2");
    g.appendChild(fld("Emoji/ícone",tinp(p+".i",rt)));
    g.appendChild(fld("Título",tinp(p+".t",rt)));
    b.appendChild(g);
    b.appendChild(fld("Texto",inp(p+".d","ta")));
  }});
}},
{id:"quotes",label:"⭐ Cena 12 · Depoimentos",build:function(s){
  s.appendChild(el("h2",null,"Cena 12 · <em>depoimentos</em>"));
  var c=el("div"); s.appendChild(c);
  list(c,"quotes",{name:"depoimento",blank:{p:"\"Frase do viajante.\"",a:"Nome",s:"Perfil · Pacote"},title:function(i){return i.a;},fields:function(b,p,i,rt){
    b.appendChild(fld("Depoimento",inp(p+".p","ta")));
    var g=el("div","grid2");
    g.appendChild(fld("Autor",tinp(p+".a",rt)));
    g.appendChild(fld("Contexto (Lua de mel · Essencial)",inp(p+".s")));
    b.appendChild(g);
  }});
}},
{id:"elenco",label:"👥 Cena 13 · Equipe",build:function(s){
  s.appendChild(el("h2",null,"Cena 13 · <em>equipe</em>"));
  var c=el("div"); s.appendChild(c);
  list(c,"elenco",{name:"pessoa",blank:{av:"XX",role:"Função",t:"Nome",d:"Descrição."},title:function(i){return i.t+" · "+i.role;},fields:function(b,p,i,rt){
    var g=el("div","grid3");
    g.appendChild(fld("Iniciais (avatar)",inp(p+".av")));
    g.appendChild(fld("Função",tinp(p+".role",rt)));
    g.appendChild(fld("Nome",tinp(p+".t",rt)));
    b.appendChild(g);
    b.appendChild(fld("Descrição",inp(p+".d","ta")));
  }});
}},
{id:"faq",label:"❓ Cena 14 · FAQ",build:function(s){
  s.appendChild(el("h2",null,"Cena 14 · <em>na prática (FAQ)</em>"));
  s.appendChild(el("div","hint","As respostas aceitam HTML leve: &lt;strong&gt;negrito&lt;/strong&gt; e &lt;em&gt;destaque&lt;/em&gt;."));
  var c=el("div"); s.appendChild(c);
  list(c,"faq",{name:"pergunta",blank:{q:"❓ Nova pergunta?",a:"Resposta."},title:function(i){return i.q;},fields:function(b,p,i,rt){
    b.appendChild(fld("Pergunta",tinp(p+".q",rt)));
    b.appendChild(fld("Resposta",inp(p+".a","ta")));
  }});
}},
{id:"alma",label:"ⵣ Cena 15 · Amazigh",build:function(s){
  s.appendChild(el("h2",null,"Cena 15 · <em>a alma (Amazigh)</em>"));
  s.appendChild(el("div","hint","Os parágrafos aceitam &lt;b&gt; e &lt;i&gt;."));
  s.appendChild(csv("alma.paras","Parágrafos (um por linha)"));
  s.appendChild(fld("Citação",inp("alma.quote","ta")));
  var c=el("div"); s.appendChild(c);
  list(c,"alma.stats",{name:"dado",blank:{b:"",n:0,suf:" mil",s:"descrição"},title:function(i){return (i.b||i.n+(i.suf||""))+" — "+(i.s||"");},fields:function(b,p,i,rt){
    var g=el("div","grid3");
    g.appendChild(fld("Número (anima)",tinp(p+".n",rt,"n")));
    g.appendChild(fld("Sufixo",tinp(p+".suf",rt)));
    g.appendChild(fld("OU texto fixo (ⵣ yaz)",tinp(p+".b",rt)));
    b.appendChild(g);
    b.appendChild(fld("Descrição",inp(p+".s","ta")));
  }});
}},
{id:"yalla",label:"🤖 Assistente Yalla",build:function(s){
  s.appendChild(el("h2",null,"Assistente <em>Yalla</em>"));
  s.appendChild(el("div","hint","Palavras-chave separadas por vírgula. Se a mensagem do visitante contiver qualquer uma, o Yalla responde com o texto. *asteriscos* viram negrito."));
  var g=el("div","grid2");
  g.appendChild(fld("Nome do assistente",inp("chatbot.nome")));
  s.appendChild(g);
  s.appendChild(csv("chatbot.chips","Atalhos (botões)"));
  s.appendChild(fld("Resposta padrão (quando não entende)",inp("chatbot.fallback","ta")));
  var c=el("div"); s.appendChild(c);
  list(c,"chatbot.kb",{name:"resposta",blank:{k:"palavra1, palavra2",a:"Resposta."},title:function(i){return (i.k||"").split(",")[0];},fields:function(b,p,i,rt){
    b.appendChild(fld("Palavras-chave (vírgula)",tinp(p+".k",rt)));
    b.appendChild(fld("Resposta",inp(p+".a","ta")));
  }});
}},
{id:"creditos",label:"🎬 Créditos & Rodapé",build:function(s){
  s.appendChild(el("h2",null,"Créditos <em>finais</em>"));
  var c=el("div"); s.appendChild(c);
  list(c,"creditos",{name:"crédito",blank:{role:"Função",name:"Nome"},title:function(i){return i.role+" — "+i.name;},fields:function(b,p,i,rt){
    var g=el("div","grid2");
    g.appendChild(fld("Função",tinp(p+".role",rt)));
    g.appendChild(fld("Nome (aceita <em>)",tinp(p+".name",rt)));
    b.appendChild(g);
  }});
  s.appendChild(fld('Frase final ("fin — ...")',inp("fin")));
  s.appendChild(fld("Linha de rodapé",inp("rodape")));
}}
];

/* ================= BOOT & NAV ================= */
function boot(){
  window.PM_READY.then(function(){
    var draft=localStorage.getItem("pm_live");
    if(draft && confirm("Existe um RASCUNHO salvo neste navegador. Continuar editando o rascunho?\n(Cancelar carrega os dados publicados.)")){
      try{ DATA=JSON.parse(draft); }catch(e){ DATA=clone(window.PM_DATA); }
    } else DATA=clone(window.PM_DEFAULTS && window.PM_DATA ? window.PM_DATA : window.PM_DEFAULTS);
    buildUI();
    $("#app").classList.add("on");
    updateFlag();
  });
}
function buildUI(){
  var nav=$("#nav"), secs=$("#secs");
  nav.innerHTML=""; secs.innerHTML="";
  SECTIONS.forEach(function(S,i){
    var b=el("button",null,S.label); b.type="button";
    b.addEventListener("click",function(){ show(S.id); });
    b.id="nav-"+S.id; nav.appendChild(b);
    var s=el("div","sec"); s.id="sec-"+S.id;
    S.build(s); secs.appendChild(s);
  });
  show(SECTIONS[0].id);
}
function show(id){
  document.querySelectorAll(".sec").forEach(function(s){ s.classList.toggle("on",s.id==="sec-"+id); });
  document.querySelectorAll("#nav button").forEach(function(b){ b.classList.toggle("on",b.id==="nav-"+id); });
  scrollTo(0,0);
}

/* ================= AÇÕES ================= */
function saveDraft(){
  localStorage.setItem("pm_live",JSON.stringify(DATA));
  localStorage.setItem("pm_preview","1");
  dirty=false; updateFlag();
}
$("#btnPreview").addEventListener("click",function(){
  saveDraft(); status("Rascunho salvo. Abrindo preview...","ok");
  open("index.html","pm_preview_tab");
});
$("#btnDownload").addEventListener("click",function(){
  var blob=new Blob([JSON.stringify(DATA,null,2)],{type:"application/json"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="data.json"; a.click();
  status("data.json baixado. Suba-o na raiz do site pelo cPanel para publicar.","ok");
});
$("#btnImport").addEventListener("click",function(){ $("#importFile").click(); });
$("#importFile").addEventListener("change",function(){
  var f=this.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=function(){ try{ DATA=JSON.parse(r.result); buildUI(); markDirty(); status("Importado. Revise e salve/publique.","ok"); }catch(e){ status("Arquivo inválido.","err"); } };
  r.readAsText(f);
});
$("#btnReset").addEventListener("click",function(){
  if(!confirm("Restaurar TODOS os textos e dados padrão? Seu rascunho local será perdido.")) return;
  DATA=clone(window.PM_DEFAULTS);
  localStorage.removeItem("pm_live"); localStorage.removeItem("pm_preview");
  buildUI(); markDirty(); updateFlag(); status("Padrão restaurado (ainda não publicado).","ok");
});
$("#btnPublish").addEventListener("click",function(){
  saveDraft();
  status("Publicando...");
  fetch("save.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pass:pass(),data:DATA})})
  .then(function(r){ return r.json(); })
  .then(function(j){
    if(j.ok){
      localStorage.removeItem("pm_preview"); updateFlag();
      status("✔ Publicado! O site já está atualizado para todos.","ok");
    } else status("Servidor recusou: "+(j.err||"senha?")+" — confira a senha no save.php.","err");
  })
  .catch(function(){ status("save.php indisponível (isso é normal fora do servidor). Use ⬇ Baixar data.json e suba pelo cPanel.","err"); });
});
function updateFlag(){
  var on=localStorage.getItem("pm_preview")==="1";
  $("#pflag").classList.toggle("on",on);
}
$("#pflagOff").addEventListener("click",function(){
  localStorage.removeItem("pm_preview"); updateFlag();
  status("Preview desativado — o site volta a mostrar os dados publicados.","ok");
});
})();
