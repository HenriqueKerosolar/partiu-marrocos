import { editorial } from "@/lib/public-site-data";

// Réplica de food() em public-site.js. `full` omite o link "Explorar sabores
// e receitas" (a própria página de sabores já é o destino desse link).
export function FoodScene({ full = false }: { full?: boolean }) {
  return (
    <section className="scene-block food-scene" id="site-food">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>06</span> Sabores do Marrocos
          </p>
          <h2>
            Uma viagem <em>também à mesa.</em>
          </h2>
        </div>
        <p>Da panela de barro ao ritual do chá. Descubra os sabores e as receitas do Marrocos.</p>
      </header>
      <div className="food-grid">
        {editorial.pratos.map((p) => (
          <div className="food-card" key={p.t}>
            <img src={p.img} alt={p.t} />
            <span>
              <strong>{p.t}</strong>
              <small>{p.d}</small>
            </span>
          </div>
        ))}
      </div>
      {!full ? (
        <a className="btn" href="/sabores-do-marrocos">
          Explorar sabores e receitas <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </section>
  );
}
