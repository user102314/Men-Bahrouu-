import { newId } from "@resto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MoneyInput } from "../../components/admin/MoneyInput.js";
import { ErrorState, FormSection, PageHeader, fieldClass } from "../../components/admin/widgets.js";
import { Money } from "../../components/Money.js";
import { Button } from "../../components/ui/button.js";
import { adminApi, type AdminProduct, type DailyOffer } from "../../lib/admin-api.js";
import { parseMoneyDraft } from "../../lib/admin/money-draft.js";
import { hubErrorText } from "../../lib/errors.js";
import { hubUrl } from "../../lib/hub-url.js";

function millimesDraft(amount: number): string {
  const whole = Math.floor(amount / 1000);
  const fraction = String(amount % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return fraction.length === 0 ? String(whole) : `${whole},${fraction}`;
}

interface OfferDraft {
  id: string;
  productId: string | null;
  nameFr: string;
  nameAr: string;
  priceMillimes: number;
  confirmHighPrice?: boolean;
}

export function DailyPlanPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: ["admin", "daily-specials"], queryFn: () => adminApi.dailySpecials() });
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: () => adminApi.products() });
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminApi.settings() });
  const [nameFr, setNameFr] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [price, setPrice] = useState("");
  const [linkedId, setLinkedId] = useState("");
  const [confirmPrice, setConfirmPrice] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editFr, setEditFr] = useState("");
  const [editAr, setEditAr] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editConfirm, setEditConfirm] = useState(false);
  const ceiling = settings.data?.priceCeilingMillimes ?? 1_000_000;
  const offers = menu.data?.offers ?? [];
  const catalog = (products.data ?? []).filter((product) => product.isActive && product.isAvailable);

  const save = useMutation({
    mutationFn: (next: OfferDraft[]) => adminApi.saveDailyOffers(next),
    onSuccess: async () => {
      setNameFr("");
      setNameAr("");
      setPrice("");
      setLinkedId("");
      setConfirmPrice(false);
      setEditing(null);
      setEditConfirm(false);
      await queryClient.invalidateQueries({ queryKey: ["admin", "daily-specials"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });

  function toDraft(offer: DailyOffer, patch?: Partial<OfferDraft>): OfferDraft {
    return {
      id: offer.id,
      productId: offer.productId,
      nameFr: offer.nameFr,
      nameAr: offer.nameAr,
      priceMillimes: offer.priceMillimes,
      ...patch,
    };
  }

  const error = menu.error ?? products.error ?? save.error;

  return (
    <div className="grid gap-4">
      <div className="no-print grid gap-4">
      <PageHeader title={t("admin.dailyTitle")}>
        <Button intent="primary" disabled={offers.length === 0} onClick={() => window.print()}>
          {t("admin.dailyPrint")}
        </Button>
      </PageHeader>
      <p className="text-sm text-ink/70">
        {t("admin.dailyHelp")} {menu.data ? `· ${menu.data.businessDate}` : ""}
      </p>
      {error ? <ErrorState>{hubErrorText(error, t)}</ErrorState> : null}
      <FormSection title={t("admin.dailyNew")}>
        <label className="grid gap-1">
          {t("admin.dailyPick")}
          <select className={fieldClass} value={linkedId} onChange={(event) => setLinkedId(event.target.value)}>
            <option value="">{t("admin.dailyFree")}</option>
            {catalog.map((product) => (
              <option key={product.id} value={product.id}>
                {locale === "ar" ? product.nameAr : product.nameFr}
              </option>
            ))}
          </select>
        </label>
        {linkedId.length === 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-1">
              {t("admin.nameFr")}
              <input className={fieldClass} value={nameFr} onChange={(event) => setNameFr(event.target.value)} />
            </label>
            <label className="grid gap-1">
              {t("admin.nameAr")}
              <input className={fieldClass} dir="rtl" value={nameAr} onChange={(event) => setNameAr(event.target.value)} />
            </label>
            <label className="grid gap-1">
              {t("admin.price")}
              <MoneyInput id="daily-price" value={price} ceilingMillimes={ceiling} onChange={setPrice} />
            </label>
          </div>
        ) : null}
        {confirmPrice ? <p>{t("admin.moneyHigh")}</p> : null}
        <Button
          intent="primary"
          disabled={save.isPending}
          onClick={() => {
            if (linkedId.length > 0) {
              const product = catalog.find((row) => row.id === linkedId);
              if (!product || offers.some((offer) => offer.productId === product.id)) {
                return;
              }
              save.mutate([
                ...offers.map((offer) => toDraft(offer)),
                {
                  id: product.id,
                  productId: product.id,
                  nameFr: product.nameFr,
                  nameAr: product.nameAr,
                  priceMillimes: product.priceMillimes,
                },
              ]);
              return;
            }
            const draft = parseMoneyDraft(price, ceiling);
            if (draft.millimes === null || nameFr.trim().length === 0 || nameAr.trim().length === 0) {
              return;
            }
            if (draft.needsConfirm && !confirmPrice) {
              setConfirmPrice(true);
              return;
            }
            const id = newId();
            save.mutate([
              ...offers.map((offer) => toDraft(offer)),
              {
                id,
                productId: null,
                nameFr: nameFr.trim(),
                nameAr: nameAr.trim(),
                priceMillimes: draft.millimes,
                ...(draft.needsConfirm ? { confirmHighPrice: true } : {}),
              },
            ]);
          }}
        >
          {confirmPrice ? t("admin.confirmPrice") : t("admin.dailySave")}
        </Button>
      </FormSection>
      {offers.length === 0 ? <p>{t("admin.dailyEmpty")}</p> : null}
      <div className="grid gap-3">
        {offers.map((offer) => (
          <article key={offer.id} className="grid gap-3 rounded-[14px] border border-line bg-surface p-3">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium break-words">{locale === "ar" ? offer.nameAr : offer.nameFr}</p>
                <p className="break-words" dir={locale === "ar" ? "ltr" : "rtl"}>
                  {locale === "ar" ? offer.nameFr : offer.nameAr}
                </p>
                <p className="text-sm text-ink/70">
                  <Money millimes={offer.priceMillimes} locale={locale} />
                  {" · "}
                  {offer.fromCatalog ? t("admin.dailyFromMenu") : t("admin.dailyOwn")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {offer.fromCatalog ? null : (
                  <Button
                    intent="primary"
                    onClick={() => {
                      setEditing(offer.id);
                      setEditFr(offer.nameFr);
                      setEditAr(offer.nameAr);
                      setEditPrice(millimesDraft(offer.priceMillimes));
                      setEditConfirm(false);
                    }}
                  >
                    {t("admin.edit")}
                  </Button>
                )}
                <Button
                  intent="danger"
                  disabled={save.isPending}
                  onClick={() => save.mutate(offers.filter((row) => row.id !== offer.id).map((row) => toDraft(row)))}
                >
                  {t("admin.dailyRemove")}
                </Button>
              </div>
            </div>
            {editing === offer.id ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="grid gap-1">
                  {t("admin.nameFr")}
                  <input className={fieldClass} value={editFr} onChange={(event) => setEditFr(event.target.value)} />
                </label>
                <label className="grid gap-1">
                  {t("admin.nameAr")}
                  <input className={fieldClass} dir="rtl" value={editAr} onChange={(event) => setEditAr(event.target.value)} />
                </label>
                <label className="grid gap-1">
                  {t("admin.price")}
                  <MoneyInput id={`daily-edit-${offer.id}`} value={editPrice} ceilingMillimes={ceiling} onChange={setEditPrice} />
                </label>
                {editConfirm ? <p className="lg:col-span-2">{t("admin.moneyHigh")}</p> : null}
                <div className="flex flex-wrap gap-2 lg:col-span-2">
                  <Button
                    intent="primary"
                    disabled={save.isPending}
                    onClick={() => {
                      const draft = parseMoneyDraft(editPrice, ceiling);
                      if (draft.millimes === null || editFr.trim().length === 0 || editAr.trim().length === 0) {
                        return;
                      }
                      if (draft.needsConfirm && !editConfirm) {
                        setEditConfirm(true);
                        return;
                      }
                      save.mutate(
                        offers.map((row) =>
                          row.id === offer.id
                            ? {
                                id: row.id,
                                productId: row.productId,
                                nameFr: editFr.trim(),
                                nameAr: editAr.trim(),
                                priceMillimes: draft.millimes ?? row.priceMillimes,
                                ...(draft.needsConfirm ? { confirmHighPrice: true } : {}),
                              }
                            : toDraft(row),
                        ),
                      );
                    }}
                  >
                    {editConfirm ? t("admin.confirmPrice") : t("admin.save")}
                  </Button>
                  <Button type="button" onClick={() => setEditing(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      </div>
      <DailyMenuPoster
        offers={offers}
        products={products.data ?? []}
        businessDate={menu.data?.businessDate}
        locale={locale}
        title={t("admin.dailyTitle")}
        empty={t("admin.dailyEmpty")}
      />
    </div>
  );
}

function DailyMenuPoster({
  offers,
  products,
  businessDate,
  locale,
  title,
  empty,
}: {
  offers: DailyOffer[];
  products: AdminProduct[];
  businessDate: string | undefined;
  locale: "fr" | "ar";
  title: string;
  empty: string;
}) {
  return (
    <section className="daily-menu-sheet" aria-label={title}>
      <header>
        <img src="/menbahrou.png" alt="Men Bahrouu" />
        <p className="menu-kicker">Men Bahrouu</p>
        <h2>{title}</h2>
        {businessDate ? <p className="menu-date">{menuDate(businessDate)}</p> : null}
      </header>
      {offers.length === 0 ? <p className="menu-empty">{empty}</p> : null}
      <ul>
        {offers.map((offer) => {
          const photo = products.find((product) => product.id === offer.productId && product.imageType);
          return (
            <li key={offer.id}>
              {photo ? (
                <img className="dish-photo" src={`${hubUrl()}/product-images/${offer.productId}`} alt="" />
              ) : (
                <span className="dish-mark" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="dish-fr">{offer.nameFr}</p>
                <p className="dish-ar" dir="rtl">
                  {offer.nameAr}
                </p>
              </div>
              <p className="dish-price">
                <Money millimes={offer.priceMillimes} locale={locale} />
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function menuDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
}
