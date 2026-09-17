import { PublicNav } from "./components/public-nav";
import { Hero } from "./components/hero";
import { TrustStrip } from "./components/trust-strip";
import { Why } from "./components/why";
import { Destinations } from "./components/destinations";
import { RouteExplorer } from "./components/route-explorer";
import { Departures } from "./components/departures";
import { Inspirations } from "./components/inspirations";
import { Experiences } from "./components/experiences";
import { AmazighScene } from "./components/amazigh-scene";
import { FoodScene } from "./components/food-scene";
import { Gallery } from "./components/gallery";
import { Facts } from "./components/facts";
import { Testimonials } from "./components/testimonials";
import { Team } from "./components/team";
import { FaqSection } from "./components/faq-section";
import { Contact } from "./components/contact";
import { Footer } from "./components/footer";
import { SiteHelp } from "./components/site-help";

// Réplica de page(data,false) em public-site.js. Conferido seção-a-seção ao
// vivo (DOM de 127.0.0.1:8080, o pacote php74 0.4.11 rodando) — a ordem e a
// lista de seções abaixo é exatamente a mesma, incluindo "Saídas disponíveis"
// (Departures), que ali também aparece no estado "consultas indisponíveis"
// por falta de catálogo conectado, o mesmo estado real do CRM hoje. Propaganda
// de parceiros e os artigos extras do CMS (catalogStories/advertising) não
// aparecem nem na referência — confirmado vazios, por isso ficam de fora.
export default function PublicHomePage() {
  return (
    <>
      <PublicNav />
      <div className="public-editorial" data-public-landing>
        <Hero />
        <TrustStrip />
        <Why />
        <Destinations />
        <RouteExplorer />
        <Departures />
        <Inspirations />
        <Experiences />
        <AmazighScene />
        <FoodScene />
        <Gallery />
        <Facts />
        <Testimonials />
        <Team />
        <FaqSection />
        <Contact />
        <Footer />
        <SiteHelp />
      </div>
    </>
  );
}
