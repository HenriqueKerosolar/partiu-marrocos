// Réplica de footer() em public-site.js — conferida contra o HTML real
// (127.0.0.1:8080). "Essenciais" aponta para a mesma seção de FAQ que a
// pílula "Na prática" da nav já usa (não existe página própria de
// "essentials" aqui). "Quero ser parceiro" não tem fluxo de cadastro de
// parceiro implementado no CRM (nenhum Partner tem login hoje) — leva ao
// mesmo formulário de contato usado pelos outros CTAs sem catálogo próprio,
// em vez de inventar um cadastro que não existe.
export function Footer() {
  return (
    <footer className="editorial-footer">
      <div>
        <img src="/img/logo.png" alt="Partiu Marrocos" />
        <p>Feito com alma brasileira e coração amazigh.</p>
      </div>
      <nav aria-label="Menu">
        <a className="btn secondary" href="/#site-inspirations">
          Pacotes <span aria-hidden="true">↗</span>
        </a>
        <a className="btn secondary" href="/universo-amazigh">
          Universo amazigh <span aria-hidden="true">↗</span>
        </a>
        <a className="btn secondary" href="/sabores-do-marrocos">
          Sabores do Marrocos <span aria-hidden="true">↗</span>
        </a>
        <a className="btn secondary" href="/#site-faq">
          Essenciais <span aria-hidden="true">↗</span>
        </a>
        <a className="btn secondary" href="/#site-contact">
          Quero ser parceiro
        </a>
      </nav>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} PARTIU MARROCOS / AMAZIGH TURISMO</span>
        <a href="#site-home" style={{ background: "none", border: 0, color: "#d2bd96", fontSize: 10, padding: 12, textDecoration: "none" }}>
          Voltar ao topo ↑
        </a>
      </div>
    </footer>
  );
}
