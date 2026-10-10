import { newId } from "@resto/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { parseMoneyDraft } from "../../lib/admin/money-draft.js";
import type { AdminCategory } from "../../lib/admin-api.js";
import { Button } from "../ui/button.js";
import { MoneyInput } from "./MoneyInput.js";
import { fieldClass } from "./widgets.js";

interface ProductValues {
  nameFr: string;
  nameAr: string;
  categoryId: string;
}

export function ProductForm({
  categories,
  ceilingMillimes,
  onCreate,
}: {
  categories: AdminCategory[];
  ceilingMillimes: number;
  onCreate: (input: {
    id: string;
    categoryId: string;
    nameFr: string;
    nameAr: string;
    priceMillimes: number;
    confirmHighPrice?: boolean;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const form = useForm<ProductValues>({
    defaultValues: { nameFr: "", nameAr: "", categoryId: categories[0]?.id ?? "" },
  });
  const [price, setPrice] = useState("");
  const [confirmPrice, setConfirmPrice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const draft = parseMoneyDraft(price, ceilingMillimes);

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(async (values) => {
          if (draft.millimes === null || !values.categoryId) {
            setMessage(t("admin.moneyInvalid"));
            return;
          }
          if (draft.needsConfirm && !confirmPrice) {
            setConfirmPrice(true);
            return;
          }
          setMessage(null);
          await onCreate({
            id: newId(),
            categoryId: values.categoryId,
            nameFr: values.nameFr.trim(),
            nameAr: values.nameAr.trim(),
            priceMillimes: draft.millimes,
            ...(draft.needsConfirm ? { confirmHighPrice: true } : {}),
          });
          form.reset();
          setPrice("");
          setConfirmPrice(false);
        })();
      }}
    >
      <label className="grid gap-1">
        {t("admin.nameFr")}
        <input className={fieldClass} {...form.register("nameFr", { required: true })} />
      </label>
      <label className="grid gap-1">
        {t("admin.nameAr")}
        <input className={fieldClass} dir="rtl" {...form.register("nameAr", { required: true })} />
      </label>
      <label className="grid gap-1">
        {t("admin.category")}
        <select className={fieldClass} {...form.register("categoryId", { required: true })}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nameFr}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        {t("admin.price")}
        <MoneyInput id="new-product-price" value={price} ceilingMillimes={ceilingMillimes} onChange={setPrice} />
      </label>
      {confirmPrice ? <p>{t("admin.moneyHigh")}</p> : null}
      {message ? <p className="text-terracotta">{message}</p> : null}
      <Button intent="primary" type="submit">
        {confirmPrice ? t("admin.confirmPrice") : t("admin.create")}
      </Button>
    </form>
  );
}
