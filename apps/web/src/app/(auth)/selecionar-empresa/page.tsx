import { redirect } from "next/navigation";
import { prisma, getMembershipsForUser } from "@partiumarrocos/db";
import { getAuthContext } from "@/lib/session";
import { SelecionarEmpresaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SelecionarEmpresaPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.tenantId) redirect("/dashboard");

  const memberships = await getMembershipsForUser(prisma, ctx.user.id);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SelecionarEmpresaForm memberships={memberships} />
    </div>
  );
}
