type Fonte = { name: string; url: string };

// Réplica de p7sources() em mockup-v11-source.html.
export function Sources({ items }: { items: Fonte[] }) {
  return (
    <details className="p7-sources">
      <summary>Fontes e leituras</summary>
      {items.map((f) => (
        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer">
          {f.name}
        </a>
      ))}
    </details>
  );
}
