"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarConfigIA, desligarIA, removerChaveIA } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConfigIAForm({
  ligado,
  temChave,
  providerAtual,
}: {
  ligado: boolean;
  temChave: boolean;
  providerAtual?: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await salvarConfigIA(formData);
      if (res.error) {
        setErro(res.error);
        return;
      }
      e.currentTarget.reset();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  async function onDesligar() {
    setSalvando(true);
    try {
      await desligarIA();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  async function onRemoverChave() {
    if (!window.confirm("Remover definitivamente a chave de IA salva? Isso não pode ser desfeito — será preciso informar uma nova chave para religar o Yalla.")) return;
    setSalvando(true);
    try {
      await removerChaveIA();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="provider">Provedor</Label>
          <select
            id="provider"
            name="provider"
            defaultValue={providerAtual ?? "anthropic"}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apiKey">Chave de API</Label>
          <Input id="apiKey" name="apiKey" type="password" placeholder={temChave ? "•••••••• (trocar)" : ""} required />
        </div>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={salvando} className="self-start">
          {salvando ? "Salvando..." : temChave ? "Atualizar chave" : "Ligar Yalla"}
        </Button>
        {ligado && (
          <Button type="button" variant="ghost" disabled={salvando} onClick={onDesligar} className="self-start">
            Desligar
          </Button>
        )}
        {temChave && (
          <Button type="button" variant="ghost" disabled={salvando} onClick={onRemoverChave} className="self-start text-destructive">
            Remover chave
          </Button>
        )}
      </div>
    </form>
  );
}
