import { DAILY_CATEGORY_ID } from "@resto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ProductEditor, ProductForm } from "../../components/admin/ProductForm.js";
import { QuantityInput } from "../../components/admin/QuantityInput.js";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormSection,
  PageHeader,
  StationTag,
} from "../../components/admin/widgets.js";
import { Money } from "../../components/Money.js";
import { Button } from "../../components/ui/button.js";
import { adminApi, type AdminProduct } from "../../lib/admin-api.js";
import { fileToImageBody } from "../../lib/admin/product-image.js";
import { hubUrl } from "../../lib/hub-url.js";
import { toBaseQuantity, type DisplayUnit } from "../../lib/admin/quantity.js";
import { hubErrorText } from "../../lib/errors.js";

export function ProductsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => adminApi.products(),
  });
  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => adminApi.categories(),
  });
  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => adminApi.settings(),
  });
  const food = useQuery({ queryKey: ["admin", "food-cost"], queryFn: () => adminApi.foodCost() });
  const [selected, setSelected] = useState<AdminProduct | null>(null);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [deactivate, setDeactivate] = useState<AdminProduct | null>(null);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [photoTick, setPhotoTick] = useState(0);
  const ceiling = settings.data?.priceCeilingMillimes ?? 1_000_000;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "food-cost"] });
  };
  const create = useMutation({
    mutationFn: (input: {
      id: string;
      categoryId: string;
      nameFr: string;
      nameAr: string;
      priceMillimes: number;
      confirmHighPrice?: boolean;
    }) => adminApi.saveProduct(input.id, input, true),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (input: {
      id: string;
      categoryId: string;
      nameFr: string;
      nameAr: string;
      priceMillimes: number;
      confirmHighPrice?: boolean;
    }) =>
      adminApi.saveProduct(
        input.id,
        {
          categoryId: input.categoryId,
          nameFr: input.nameFr,
          nameAr: input.nameAr,
          priceMillimes: input.priceMillimes,
          ...(input.confirmHighPrice ? { confirmHighPrice: true } : {}),
        },
        false,
      ),
    onSuccess: async () => {
      setEditing(null);
      setNotice(t("admin.saved"));
      await refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: (product: AdminProduct) => adminApi.availability(product.id, !product.isAvailable),
    onSuccess: refresh,
  });
  const retire = useMutation({
    mutationFn: (product: AdminProduct) =>
      adminApi.saveProduct(product.id, { isActive: !product.isActive }, false),
    onSuccess: async () => {
      setDeactivate(null);
      await refresh();
    },
  });
  const activeCategories = (categories.data ?? [])
    .filter((category) => category.isActive && category.id !== DAILY_CATEGORY_ID)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const shown = (products.data ?? []).filter((product) => {
    if (!product.isActive || product.categoryId === DAILY_CATEGORY_ID) {
      return false;
    }
    if (family !== "all" && product.categoryId !== family) {
      return false;
    }
    const needle = search.trim().toLowerCase();
    return (
      needle.length === 0 ||
      product.nameFr.toLowerCase().includes(needle) ||
      product.nameAr.includes(needle)
    );
  });
  const groups = activeCategories
    .map((category) => ({
      category,
      products: shown.filter((product) => product.categoryId === category.id),
    }))
    .filter((group) => group.products.length > 0);
  const error = products.error ?? categories.error ?? create.error ?? update.error ?? toggle.error ?? retire.error;

  return (
    <div className="grid gap-4">
      <PageHeader title={t("admin.products")}>
        <input
          className="min-h-12 w-full rounded-[12px] border border-line bg-fond px-3 sm:w-72"
          placeholder={t("common.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </PageHeader>
      {food.data ? <p className="text-sm text-ink/70">{food.data.notice}</p> : null}
      {notice ? <p className="text-sm text-ink/70">{notice}</p> : null}
      {error ? <ErrorState>{hubErrorText(error, t)}</ErrorState> : null}
      <FormSection title={t("admin.create")}>
        <ProductForm
          categories={activeCategories}
          ceilingMillimes={ceiling}
          onCreate={async (input, image) => {
            setNotice(null);
            await create.mutateAsync(input);
            if (image) {
              try {
                await adminApi.saveProductImage(input.id, await fileToImageBody(image));
                setPhotoTick((current) => current + 1);
                await refresh();
              } catch (caught) {
                setNotice(caught instanceof Error && caught.message === "INVALID_IMAGE" ? t("admin.photoInvalid") : hubErrorText(caught, t));
              }
            }
            setFamily(input.categoryId);
          }}
        />
      </FormSection>
      <div className="flex flex-wrap gap-2">
        <FamilyChip active={family === "all"} onClick={() => setFamily("all")}>
          {t("admin.allCategories")}
        </FamilyChip>
        {activeCategories.map((category) => (
          <FamilyChip key={category.id} active={family === category.id} onClick={() => setFamily(category.id)}>
            {locale === "ar" ? category.nameAr : category.nameFr}
          </FamilyChip>
        ))}
      </div>
      {shown.length === 0 ? <EmptyState>{t("admin.empty")}</EmptyState> : null}
      {groups.map((group) => (
        <section key={group.category.id} className="grid gap-2">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-xl">
            {locale === "ar" ? group.category.nameAr : group.category.nameFr}
            <StationTag kind={group.category.stationKind} />
          </h2>
          {group.products.map((product) => {
            const cost = food.data?.products.find((row) => row.name === product.nameFr);
            return (
              <article key={product.id} className="grid gap-3 rounded-[14px] border border-line bg-surface p-3">
                <div className="flex min-w-0 flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{product.nameFr}</p>
                    <p className="break-words" dir="rtl">
                      {product.nameAr}
                    </p>
                    <p className="text-sm text-ink/70">
                      <Money millimes={product.priceMillimes} locale={locale} />
                      {cost ? (
                        <>
                          {" · "}
                          <Money millimes={cost.costMillimes} locale={locale} />
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 min-[900px]:flex min-[900px]:flex-wrap">
                    <Button className="min-h-11 w-full min-[900px]:w-auto" onClick={() => toggle.mutate(product)}>
                      {product.isAvailable ? t("admin.available") : t("admin.exhausted")}
                    </Button>
                    <Button
                      intent="primary"
                      className="min-h-11 w-full min-[900px]:w-auto"
                      onClick={() => {
                        setSelected(null);
                        setEditing(product);
                      }}
                    >
                      {t("admin.edit")}
                    </Button>
                    <Button className="min-h-11 w-full min-[900px]:w-auto" onClick={() => setSelected(product)}>
                      {t("admin.recipe")}
                    </Button>
                    <Button
                      intent="danger"
                      className="min-h-11 w-full min-[900px]:w-auto"
                      onClick={() => setDeactivate(product)}
                    >
                      {t("admin.deactivate")}
                    </Button>
                  </div>
                </div>
                <ProductPhoto
                  product={product}
                  tick={photoTick}
                  onChanged={async () => {
                    setPhotoTick((current) => current + 1);
                    await refresh();
                  }}
                  onError={(message) => setNotice(message)}
                />
                {editing?.id === product.id ? (
                  <ProductEditor
                    product={product}
                    categories={activeCategories}
                    ceilingMillimes={ceiling}
                    onCancel={() => setEditing(null)}
                    onSave={async (input) => {
                      await update.mutateAsync({ id: product.id, ...input });
                    }}
                  />
                ) : null}
              </article>
            );
          })}
        </section>
      ))}
      {selected ? <RecipeEditor product={selected} onClose={() => setSelected(null)} /> : null}
      <ConfirmDialog
        open={deactivate !== null}
        title={deactivate?.isActive ? t("admin.deactivate") : t("admin.activate")}
        onClose={() => setDeactivate(null)}
        onConfirm={() => {
          if (deactivate) {
            retire.mutate(deactivate);
          }
        }}
      />
    </div>
  );
}

function ProductPhoto({
  product,
  tick,
  onChanged,
  onError,
}: {
  product: AdminProduct;
  tick: number;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  async function replace(file: File | undefined) {
    if (!file) {
      return;
    }
    setBusy(true);
    try {
      await adminApi.saveProductImage(product.id, await fileToImageBody(file));
      await onChanged();
    } catch (caught) {
      onError(caught instanceof Error && caught.message === "INVALID_IMAGE" ? t("admin.photoInvalid") : hubErrorText(caught, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {product.imageType ? (
        <img
          src={`${hubUrl()}/product-images/${product.id}?v=${tick}`}
          alt=""
          className="h-20 w-28 rounded-md object-cover"
        />
      ) : null}
      <label className="grid gap-1 text-sm">
        {product.imageType ? t("admin.photoChange") : t("admin.photo")}
        <input
          className="min-h-12 max-w-full"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void replace(file);
          }}
        />
      </label>
      {product.imageType ? (
        <Button
          intent="danger"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void adminApi
              .removeProductImage(product.id)
              .then(() => onChanged())
              .catch((caught: unknown) => onError(hubErrorText(caught, t)))
              .finally(() => setBusy(false));
          }}
        >
          {t("admin.photoRemove")}
        </Button>
      ) : null}
    </div>
  );
}

function FamilyChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className={`min-h-10 max-w-full rounded-full border px-3 text-sm font-medium break-words ${
        active ? "border-primary bg-primary text-white" : "border-line bg-surface text-ink"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RecipeEditor({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const recipe = useQuery({
    queryKey: ["admin", "recipe", product.id],
    queryFn: () => adminApi.recipe(product.id),
  });
  const stock = useQuery({
    queryKey: ["admin", "stock-items"],
    queryFn: () => adminApi.stockItems(),
  });
  const [stockItemId, setStockItemId] = useState("");
  const [raw, setRaw] = useState("");
  const [unit, setUnit] = useState<DisplayUnit>("G");
  const save = useMutation({
    mutationFn: () => {
      const item = stock.data?.items.find((row) => row.id === stockItemId);
      const quantityBase = toBaseQuantity(raw, unit);
      if (!item || quantityBase === null) {
        throw new Error("quantity");
      }
      const current = recipe.data?.ingredients ?? [];
      return adminApi.setRecipe(product.id, [
        ...current.map((line) => ({
          stockItemId: line.stock_item_id,
          quantityBase: line.quantity_base,
        })),
        { stockItemId: item.id, quantityBase },
      ]);
    },
    onSuccess: async () => {
      setRaw("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "recipe", product.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "food-cost"] });
    },
  });
  const item = stock.data?.items.find((row) => row.id === stockItemId);
  return (
    <FormSection title={`${t("admin.recipe")} · ${product.nameFr}`}>
      {recipe.error ? <ErrorState>{hubErrorText(recipe.error, t)}</ErrorState> : null}
      <ul>
        {(recipe.data?.ingredients ?? []).map((line) => (
          <li key={line.stock_item_id}>
            {stock.data?.items.find((row) => row.id === line.stock_item_id)?.name_fr ??
              line.stock_item_id}{" "}
            · {line.quantity_base}
          </li>
        ))}
      </ul>
      <label className="grid gap-1">
        {t("admin.nav.stock")}
        <select
          className="min-h-12 rounded-[12px] border border-line bg-fond px-3"
          value={stockItemId}
          onChange={(event) => {
            const next = event.target.value;
            setStockItemId(next);
            const found = stock.data?.items.find((row) => row.id === next);
            if (found) {
              setUnit(found.base_unit);
            }
          }}
        >
          <option value="">{t("admin.none")}</option>
          {(stock.data?.items ?? [])
            .filter((row) => row.is_active)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name_fr}
              </option>
            ))}
        </select>
      </label>
      {item ? (
        <QuantityInput
          id="recipe-qty"
          raw={raw}
          unit={unit}
          base={item.base_unit}
          onRaw={setRaw}
          onUnit={setUnit}
        />
      ) : null}
      {save.error ? <ErrorState>{hubErrorText(save.error, t)}</ErrorState> : null}
      <div className="flex gap-2">
        <Button intent="primary" onClick={() => save.mutate()}>
          {t("admin.save")}
        </Button>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </div>
      <StationTag kind="KITCHEN" />
    </FormSection>
  );
}
