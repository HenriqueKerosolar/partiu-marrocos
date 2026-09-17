import { PublicNav } from "./components/public-nav";
import { PropostaBanner } from "./components/proposta-banner";
import { Hero } from "./components/hero";
import { Highlights } from "./components/highlights";
import { Roteiros } from "./components/roteiros";
import { Accompaniment } from "./components/accompaniment";
import { Teaser } from "./components/teaser";
import { Footer } from "./components/footer";

export default function PublicHomePage() {
  return (
    <>
      <PublicNav />
      <PropostaBanner />
      <div className="pm-site">
        <Hero />
        <Highlights />
        <Roteiros />
      </div>
      <section className="pm-site">
        <Accompaniment />
      </section>
      <Teaser />
      <Footer />
    </>
  );
}
