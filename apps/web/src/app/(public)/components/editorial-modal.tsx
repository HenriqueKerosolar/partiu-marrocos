"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Modal genérico para os detalhes (destino/pacote/experiência/prato/galeria),
// equivalente ao showModal(ctx) usado por public-site.js.
export function EditorialModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#04080fcc",
        backdropFilter: "blur(6px)",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: 640,
          width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          background: "#0d192b",
          border: "1px solid #b9966059",
          borderRadius: 18,
          padding: 32,
          boxShadow: "0 30px 70px #000a",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1px solid #b9966059",
            background: "#142237",
            color: "#e9e2d4",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ×
        </button>
        <h2 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 26, color: "#eee3cd", margin: "0 30px 18px 0" }}>{title}</h2>
        <div className="editorial-dialog">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
