import { useTranslation } from "react-i18next";

export function AdminSoonPage() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto grid max-w-xl gap-3">
      <h1 className="font-display text-5xl">{t("admin.soon")}</h1>
      <p>{t("admin.body")}</p>
    </section>
  );
}
