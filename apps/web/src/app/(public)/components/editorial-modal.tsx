"use client";

import { useEffect, useRef } from "react";

// Réplica do <dialog id="dialog"> nativo usado por showModal() em
// public-site.js (app.js) — não um overlay customizado. Usar <dialog> de
// verdade dá o botão "Fechar" real (.dialog-head .btn), a proporção real da
// imagem (o <dialog> tem max-width:940px, não um valor inventado) e o
// backdrop/Escape/foco de graça. Compartilhado por todos os modais
// (destinos, pacotes, experiências, galeria) — corrigir aqui corrige todos.
export function EditorialModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("click", onClick);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("click", onClick);
    };
  }, [onClose]);

  return (
    <dialog ref={ref} aria-labelledby="dialog-title" onClose={onClose}>
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="btn secondary small" onClick={onClose}>
          Fechar
        </button>
      </div>
      <div className="editorial-dialog">{children}</div>
    </dialog>
  );
}
