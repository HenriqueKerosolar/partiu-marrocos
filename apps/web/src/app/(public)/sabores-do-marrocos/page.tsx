import type { Metadata } from "next";
import { PublicNav } from "../components/public-nav";
import { Footer } from "../components/footer";
import { receitas, saboresBalanceado, saboresEditorial, saboresHeranca, saboresHero } from "@/lib/public-site-data";

export const metadata: Metadata = { title: "Sabores do Marrocos · Partiu Marrocos" };

// Réplica de p7food() em proposta/mockup-v11-source.html.
export default function SaboresDoMarrocosPage() {
  return (
    <>
      <PublicNav />
      <div className="p7-destination p7-public">
        <section className="p7-hero p7-food-hero">
          <div className="p7-hero-copy">
            <div className="pm-eyebrow">{saboresHero.kicker}</div>
            <h1>
              {saboresHero.titulo}
              <br />
              <em>{saboresHero.tituloItalico}</em>
            </h1>
            <p>{saboresHero.subtitle}</p>
          </div>
          <figure>
            <img src={saboresHero.img} alt="Mesa com cuscuz marroquino" />
            <figcaption>{saboresHero.imgCaption}</figcaption>
          </figure>
        </section>

        <section className="p7-food-story">
          <div>
            <div className="pm-eyebrow">{saboresEditorial.kicker.toUpperCase()}</div>
            <h2>{saboresEditorial.titulo}</h2>
            <p>{saboresEditorial.texto}</p>
          </div>
          <div className="p7-heritage-note">
            <span className="p7-year">{saboresHeranca.ano}</span>
            <h3>{saboresHeranca.titulo}</h3>
            <p>{saboresHeranca.texto}</p>
          </div>
        </section>

        <section className="p7-balanced">
          <div className="pm-eyebrow">{saboresBalanceado.kicker.toUpperCase()}</div>
          <h2>{saboresBalanceado.titulo}</h2>
          <p>{saboresBalanceado.texto}</p>
        </section>

        <div className="p7-section-title">
          <h2>Para cozinhar em casa</h2>
          <span className="pm-small">Três versões com base vegetal</span>
        </div>
        <div className="p7-recipes">
          {receitas.map((r) => (
            <article className="p7-recipe-card" key={r.id}>
              <div className="p7-recipe-mark">
                <span>{r.prato}</span>
              </div>
              <div>
                <span className="pm-eyebrow">{r.minutos} MIN · 4 PORÇÕES</span>
                <h3>{r.titulo}</h3>
                <p>{r.intro}</p>
                <a className="pm-btn pm-primary" href="/#reservar">Ver receita</a>
              </div>
            </article>
          ))}
        </div>

        <details className="p7-meal-stories">
          <summary>Curiosidades para levar à mesa</summary>
          <h3>Harira e os encontros do Ramadã</h3>
          <p>
            A harira é uma sopa marroquina associada às refeições do Ramadã. Há muitas versões, com leguminosas,
            tomate, massa e farinha.
          </p>
          <h3>Marrocos e a dieta mediterrânea</h3>
          <p>
            O Marrocos integra o reconhecimento cultural da dieta mediterrânea pela UNESCO. Esse patrimônio inclui
            saberes, rituais, cultivo e o hábito de comer juntos.
          </p>
        </details>
      </div>
      <Footer />
    </>
  );
}
