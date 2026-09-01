"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { CompanyDetail } from "@/features/companies/company-detail";

export default function ProbarCompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const t = useTranslations("companiesLeads");

  return (
    <div className="space-y-4">
      <Link
        href="/probar/companies"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t("backToCompanies")}
      </Link>
      <CompanyDetail companyId={params.id} />
    </div>
  );
}
