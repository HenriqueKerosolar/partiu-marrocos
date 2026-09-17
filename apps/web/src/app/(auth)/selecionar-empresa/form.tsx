"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserMembershipSummary } from "@partiumarrocos/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HelpButton } from "@/components/help-button";

export function SelecionarEmpresaForm({ memberships }: { memberships: UserMembershipSummary[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);

  async function selecionar(tenantId: string) {
    setErro(null);
    setCarregando(tenantId);
    try {
      const res = await fetch("/api/auth/selecionar-empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Não foi possível selecionar a empresa.");
        return;
      }
      router.push(data.redirectTo ?? "/dashboard");
      router.refresh();
    } finally {
      setCarregando(null);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Selecione a empresa <HelpButton helpKey="auth.selecionarEmpresa" /></CardTitle>
        <CardDescription>Você pertence a mais de uma empresa.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {memberships.map((m) => (
          <Button
            key={m.tenantId}
            variant="outline"
            className="justify-between"
            disabled={carregando !== null}
            onClick={() => selecionar(m.tenantId)}
          >
            <span>{m.tenantNome}</span>
            <span className="text-xs text-muted-foreground">{m.roleNome}</span>
          </Button>
        ))}
        {erro && <p className="text-sm text-destructive">{erro}</p>}
      </CardContent>
    </Card>
  );
}
