// "SUA PROPOSTA" (p8-wrap > p7-invitation) e "Viaje ou seja nosso parceiro"
// (pm-site > pm-vbanner) — replica exata das duas funções do mockup
// (v8View's wrap e v4View's role==='site' branch).
export function PropostaBanner() {
  return (
    <>
      <div className="p8-wrap">
        <div className="p7-invitation">
          <div>
            <div className="pm-eyebrow">SUA PROPOSTA</div>
            <h2>Pronto para a próxima viagem?</h2>
          </div>
          <a className="pm-btn pm-primary" href="#roteiros">Comprar pacote</a>
        </div>
      </div>
      <div className="pm-site">
        <div className="pm-vbanner">
          <div>
            <b>Viaje ou seja nosso parceiro.</b>
          </div>
          <a className="pm-btn pm-primary" href="/login">Entrar / Cadastrar</a>
        </div>
      </div>
    </>
  );
}
