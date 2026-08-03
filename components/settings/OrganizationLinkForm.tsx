"use client";

import { useActionState } from "react";
import { Alert, Select } from "@naviss29/design-system";
import { linkOrganization } from "@/lib/actions/organization";
import Button from "@/components/ui/Button";
import type { MyOrganization } from "@/lib/api/organizations";

interface Props {
  organizations: MyOrganization[];
}

export function OrganizationLinkForm({ organizations }: Props) {
  const [state, action, isPending] = useActionState(linkOrganization, undefined);

  const eligible = organizations.filter((o) => o.role === "OWNER" || o.role === "ADMIN");

  if (eligible.length === 0) {
    return (
      <Alert tone="info">
        Aucune de vos organisations BApps Studio ne vous donne les droits nécessaires (Propriétaire
        ou Administrateur) pour l&apos;associer à DartsOpen. Demandez à un gestionnaire de votre
        organisation de vous accorder ce rôle sur BApps Studio.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <Select name="slug" required defaultValue="">
        <option value="" disabled>Choisir une organisation…</option>
        {eligible.map((o) => (
          <option key={o.slug} value={o.slug}>{o.name}</option>
        ))}
      </Select>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Liaison…" : "Lier cette organisation"}
      </Button>
    </form>
  );
}
