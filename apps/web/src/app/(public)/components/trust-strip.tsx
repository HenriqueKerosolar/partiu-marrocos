import { editorial } from "@/lib/public-site-data";

// Réplica de trust() em public-site.js.
export function TrustStrip() {
  return (
    <div className="trust-strip">
      {editorial.hero.stats.map((s) => (
        <div key={s.l}>
          <strong>{s.n}{s.suf}</strong>
          <span>{s.l}</span>
        </div>
      ))}
    </div>
  );
}
