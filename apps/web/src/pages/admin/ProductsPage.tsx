import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ProductForm } from "../../components/admin/ProductForm.js";
import { QuantityInput } from "../../components/admin/QuantityInput.js";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormSection,
  PageHeader,
  StationTag,
} from "../../components/admin/widgets.js";
import { Money } from "../../components/Money.js";
import { Button } from "../../components/ui/button.js";
import { adminApi, type AdminProduct } from "../../lib/admin-api.js";
import { toBaseQuantity, type DisplayUnit } from "../../lib/admin/quantity.js";
import { hubErrorText } from "../../lib/errors.js";

export function ProductsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ar") ? "ar" : "fr";
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: () => adminApi.products() });
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: () => adminApi.categories() });
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminApi.settings() });
  const food = useQuery({ queryKey: ["admin", "food-cost"], queryFn: () => adminApi.foodCost() });
  const [selected, setSelected] = useState<AdminProduct | null>(null);
  const [deactivate, setDeactivate] = useState<AdminProduct | null>(null);
  const [search, setSearch] = useState("");
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
  const shown = (products.data ?? []).filter((product) => {
    const needle = search.trim().toLowerCase();
    return needle.length === 0 || product.nameFr.toLowerCase().includes(needle) || product.nameAr.includes(needle);
  });
  const error = products.error ?? categories.error ?? create.error ?? toggle.error ?? retire.error;

  return (
    <div className="grid gap-4">
      <PageHeader title={t("admin.products")}>
        <input
          className="min-h-12 rounded-[12px] border border-line bg-fond px-3"
          placeholder={t("common.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </PageHeader>
      {food.data ? <p className="text-sm text-ink/70">{food.data.notice}</p> : null}
      {error ? <ErrorState>{hubErrorText(error, t)}</ErrorState> : null}
      <FormSection title={t("admin.create")}>
        <ProductForm
          categories={(categories.data ?? []).filter((category) => category.isActive)}
          ceilingMillimes={ceiling}
          onCreate={async (input) => {
            await create.mutateAsync(input);
          }}
        />
      </FormSection>
      {shown.length === 0 ? <EmptyState>{t("admin.empty")}</EmptyState> : null}
      {shown.length > 0 ? (
        <DataTable>
          <tbody>
            {shown.map((product) => {
              const cost = food.data?.products.find((row) => row.name === product.nameFr);
              return (
                <tr key={product.id} className="border-t border-line">
                  <td className="p-3">
                    <p>{product.nameFr}</p>
                    <p dir="rtl">{product.nameAr}</p>
                  </td>
                  <td className="p-3">
                    <Money millimes={product.priceMillimes} locale={locale} />
                  </td>
                  <td className="p-3">{cost ? <Money millimes={cost.costMillimes} locale={locale} /> : "—"}</td>
                  <td className="p-3">{cost ? <Money millimes={cost.marginMillimes} locale={locale} /> : "—"}</td>
                  <td className="p-3">
                    <Button onClick={() => toggle.mutate(product)}>
                      {product.isAvailable ? t("admin.available") : t("admin.exhausted")}
                    </Button>
                  </td>
                  <td className="p-3">
                    <Button onClick={() => setSelected(product)}>{t("admin.recipe")}</Button>
                  </td>
                  <td className="p-3">
                    <Button intent="danger" onClick={() => setDeactivate(product)}>
                      {product.isActive ? t("admin.deactivate") : t("admin.activate")}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      ) : null}
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

function RecipeEditor({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const recipe = useQuery({
    queryKey: ["admin", "recipe", product.id],
    queryFn: () => adminApi.recipe(product.id),
  });
  const stock = useQuery({ queryKey: ["admin", "stock-items"], queryFn: () => adminApi.stockItems() });
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
        ...current.map((line) => ({ stockItemId: line.stock_item_id, quantityBase: line.quantity_base })),
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
            {stock.data?.items.find((row) => row.id === line.stock_item_id)?.name_fr ?? line.stock_item_id} ·{" "}
            {line.quantity_base}
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
