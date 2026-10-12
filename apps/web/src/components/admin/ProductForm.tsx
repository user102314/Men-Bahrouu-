import { newId } from "@resto/shared";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { parseMoneyDraft } from "../../lib/admin/money-draft.js";
import type { AdminCategory, AdminProduct } from "../../lib/admin-api.js";
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
  onCreate: (
    input: {
      id: string;
      categoryId: string;
      nameFr: string;
      nameAr: string;
      priceMillimes: number;
      confirmHighPrice?: boolean;
    },
    image: File | null,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const form = useForm<ProductValues>({
    defaultValues: { nameFr: "", nameAr: "", categoryId: categories[0]?.id ?? "" },
  });
  const categoryId = form.watch("categoryId");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [confirmPrice, setConfirmPrice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const draft = parseMoneyDraft(price, ceilingMillimes);

  useEffect(() => {
    if (!categoryId && categories[0]) {
      form.setValue("categoryId", categories[0].id);
    }
  }, [categories, categoryId, form]);

  return (
    <form
      className="grid min-w-0 gap-3 lg:grid-cols-2"
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
          await onCreate(
            {
              id: newId(),
              categoryId: values.categoryId,
              nameFr: values.nameFr.trim(),
              nameAr: values.nameAr.trim(),
              priceMillimes: draft.millimes,
              ...(draft.needsConfirm ? { confirmHighPrice: true } : {}),
            },
            image,
          );
          form.reset({ nameFr: "", nameAr: "", categoryId: values.categoryId });
          setPrice("");
          setImage(null);
          setConfirmPrice(false);
          setMessage(t("admin.added"));
        })();
      }}
    >
      <label className="grid gap-1 lg:col-span-2">
        {t("admin.category")}
        <select className={fieldClass} {...form.register("categoryId", { required: true })}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nameFr} · {category.nameAr}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        {t("admin.nameFr")}
        <input className={fieldClass} autoComplete="off" {...form.register("nameFr", { required: true })} />
      </label>
      <label className="grid gap-1">
        {t("admin.nameAr")}
        <input className={fieldClass} dir="rtl" autoComplete="off" {...form.register("nameAr", { required: true })} />
      </label>
      <label className="grid gap-1">
        {t("admin.price")}
        <MoneyInput id="new-product-price" value={price} ceilingMillimes={ceilingMillimes} onChange={setPrice} />
      </label>
      <label className="grid gap-1">
        {t("admin.photo")}
        <input
          className={fieldClass}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setImage(event.target.files?.[0] ?? null)}
        />
        <span className="text-sm text-ink/70">{t("admin.photoHelp")}</span>
      </label>
      <div className="flex items-end">
        <Button intent="primary" type="submit" className="w-full">
          {confirmPrice ? t("admin.confirmPrice") : t("admin.create")}
        </Button>
      </div>
      {confirmPrice ? <p className="lg:col-span-2">{t("admin.moneyHigh")}</p> : null}
      {message ? <p className="text-sm text-ink/70 lg:col-span-2">{message}</p> : null}
    </form>
  );
}

export function ProductEditor({
  product,
  categories,
  ceilingMillimes,
  onSave,
  onCancel,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  ceilingMillimes: number;
  onSave: (input: {
    categoryId: string;
    nameFr: string;
    nameAr: string;
    priceMillimes: number;
    confirmHighPrice?: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const form = useForm<ProductValues>({
    defaultValues: {
      nameFr: product.nameFr,
      nameAr: product.nameAr,
      categoryId: product.categoryId,
    },
  });
  const [price, setPrice] = useState(millimesDraft(product.priceMillimes));
  const [confirmPrice, setConfirmPrice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const draft = parseMoneyDraft(price, ceilingMillimes);

  return (
    <form
      className="grid min-w-0 gap-3 rounded-[12px] border border-line bg-fond p-3 lg:grid-cols-2"
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
          await onSave({
            categoryId: values.categoryId,
            nameFr: values.nameFr.trim(),
            nameAr: values.nameAr.trim(),
            priceMillimes: draft.millimes,
            ...(draft.needsConfirm ? { confirmHighPrice: true } : {}),
          });
        })();
      }}
    >
      <label className="grid gap-1 lg:col-span-2">
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
        {t("admin.nameFr")}
        <input className={fieldClass} autoComplete="off" {...form.register("nameFr", { required: true })} />
      </label>
      <label className="grid gap-1">
        {t("admin.nameAr")}
        <input className={fieldClass} dir="rtl" autoComplete="off" {...form.register("nameAr", { required: true })} />
      </label>
      <label className="grid gap-1">
        {t("admin.price")}
        <MoneyInput id={`edit-price-${product.id}`} value={price} ceilingMillimes={ceilingMillimes} onChange={setPrice} />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <Button intent="primary" type="submit">
          {confirmPrice ? t("admin.confirmPrice") : t("admin.save")}
        </Button>
        <Button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
      {message ? <p className="text-sm text-terracotta lg:col-span-2">{message}</p> : null}
    </form>
  );
}

function millimesDraft(amount: number): string {
  const whole = Math.floor(amount / 1000);
  const fraction = String(amount % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return fraction.length === 0 ? String(whole) : `${whole},${fraction}`;
}
