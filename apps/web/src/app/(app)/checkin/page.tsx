import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpButton } from "@/components/help-button";
import { CheckInPanel } from "./panel";
import { TrackingControl } from "./tracking-control";

export const dynamic = "force-dynamic";

export default async function CheckInPage({ searchParams }: { searchParams: { token?: string } }) {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx, "checkin.view")) redirect("/dashboard");
  const podeExecutarCheckin = hasPermission(ctx, "checkin.execute");
  const podeExecutarEmbarque = hasPermission(ctx, "boarding.execute");
  const podeRastrear = hasPermission(ctx, "gps.track");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Check-in / Embarque <HelpButton helpKey="checkin.overview" /></h1>
        <p className="text-sm text-muted-foreground">Cole ou digite o código da credencial do passageiro para validar e confirmar o check-in ou o embarque.</p>
      </div>

      {podeRastrear && <TrackingControl />}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Validar credencial</CardTitle>
        </CardHeader>
        <CardContent>
          <CheckInPanel tokenInicial={searchParams.token ?? ""} podeExecutarCheckin={podeExecutarCheckin} podeExecutarEmbarque={podeExecutarEmbarque} />
        </CardContent>
      </Card>
    </div>
  );
}
