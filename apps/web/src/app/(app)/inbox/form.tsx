"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { responderWhatsapp } from "@/app/actions/whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RespostaForm({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await responderWhatsapp(conversationId, formData);
      if (res.error) {
        setErro(res.error);
        return;
      }
      e.currentTarget.reset();
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input name="texto" placeholder="Escreva uma resposta..." required disabled={enviando} />
        <Button type="submit" disabled={enviando}>
          {enviando ? "Enviando..." : "Enviar"}
        </Button>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </form>
  );
}
