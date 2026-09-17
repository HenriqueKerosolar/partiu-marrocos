"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvarContaWhatsapp } from "@/app/actions/whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ContaWhatsappForm() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await salvarContaWhatsapp(formData);
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="label">Nome da conta</Label>
          <Input id="label" name="label" placeholder="Ex.: WhatsApp Comercial" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phoneNumberId">Phone Number ID</Label>
          <Input id="phoneNumberId" name="phoneNumberId" required />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="accessToken">Access Token (System User)</Label>
          <Input id="accessToken" name="accessToken" type="password" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="appSecret">App Secret (valida assinatura do webhook)</Label>
          <Input id="appSecret" name="appSecret" type="password" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="verifyToken">Verify Token</Label>
          <Input id="verifyToken" name="verifyToken" required />
        </div>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Button type="submit" disabled={salvando} className="self-start">
        {salvando ? "Salvando..." : "Salvar conta"}
      </Button>
    </form>
  );
}
