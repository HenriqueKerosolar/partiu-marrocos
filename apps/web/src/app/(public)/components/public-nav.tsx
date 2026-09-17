import Link from "next/link";

export function PublicNav() {
  return (
    <>
      <header className="pm-head">
        <div className="pm-brand">
          <img className="pm-logo" src="/img/logo.png" alt="Logo original Partiu Marrocos" />
          <div className="pm-brandname">
            Sua viagem,
            <br />
            <em>por inteiro.</em>
          </div>
        </div>
        <nav className="pm-headnav" aria-label="Site público">
          <Link href="/">Site público</Link>
          <Link href="#reservar">Falar com a equipe</Link>
        </nav>
        <select id="pm-language" className="pm-lang" aria-label="Idiomas" defaultValue="0">
          <option value="0">PT</option>
          <option value="1">EN</option>
          <option value="2">ES</option>
          <option value="3">FR</option>
        </select>
      </header>
      <nav className="p7-site-nav" aria-label="Explorar o Marrocos">
        <Link className="pm-btn" href="#roteiros">Roteiros</Link>
        <Link className="pm-btn" href="/universo-amazigh">Universo amazigh</Link>
        <Link className="pm-btn" href="/sabores-do-marrocos">Sabores do Marrocos</Link>
        <Link className="pm-btn pm-primary" href="#reservar">Comprar pacote</Link>
      </nav>
    </>
  );
}
