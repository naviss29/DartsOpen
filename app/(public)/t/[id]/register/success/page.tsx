import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ name?: string }> }

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("register.successMeta") };
}

export default async function RegisterSuccessPage({ params, searchParams }: Props) {
  const { t } = await getI18n();
  const { id } = await params;
  const { name } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="text-6xl">🎯</div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-brand-dark">{t("register.successTitle")}</h1>
          {name && (
            <p className="text-brand-dark">
              {t("register.successTeam", { name })}
            </p>
          )}
          <p className="text-brand-text-secondary text-sm">
            {t("register.successDetail")}
          </p>
        </div>

        <div className="rounded-xl bg-surface border border-border-muted p-4 text-sm text-brand-dark space-y-1">
          <p>{t("register.successQr")}</p>
        </div>

        <Link
          href={`/t/${id}/live`}
          className="inline-block rounded-lg border border-border-muted px-4 py-2 text-sm font-medium text-brand-dark hover:bg-surface transition-colors"
        >
          {t("register.followLive")}
        </Link>
      </div>
    </div>
  );
}
