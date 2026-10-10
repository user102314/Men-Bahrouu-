import { newId } from "@resto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { DataTable, ErrorState, FormSection, PageHeader, StationTag, fieldClass } from "../../components/admin/widgets.js";
import { Button } from "../../components/ui/button.js";
import { adminApi } from "../../lib/admin-api.js";
import { hubErrorText } from "../../lib/errors.js";

export function CategoriesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: () => adminApi.categories() });
  const stations = useQuery({ queryKey: ["admin", "stations"], queryFn: () => adminApi.stationList() });
  const [nameFr, setNameFr] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [stationId, setStationId] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
  const create = useMutation({
    mutationFn: () => adminApi.saveCategory(newId(), { nameFr, nameAr, stationId: stationId || stations.data?.[0]?.id }, true),
    onSuccess: async () => {
      setNameFr("");
      setNameAr("");
      await refresh();
    },
  });
  const patch = useMutation({
    mutationFn: (input: { id: string; body: unknown }) => adminApi.saveCategory(input.id, input.body, false),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => adminApi.reorderCategories(ids),
    onSuccess: refresh,
  });
  const rows = categories.data ?? [];
  const error = categories.error ?? stations.error ?? create.error ?? patch.error;

  return (
    <div className="grid gap-4">
      <PageHeader title={t("admin.categories")} />
      {error ? <ErrorState>{hubErrorText(error, t)}</ErrorState> : null}
      <FormSection title={t("admin.create")}>
        <input className={fieldClass} placeholder={t("admin.nameFr")} value={nameFr} onChange={(event) => setNameFr(event.target.value)} />
        <input className={fieldClass} dir="rtl" placeholder={t("admin.nameAr")} value={nameAr} onChange={(event) => setNameAr(event.target.value)} />
        <select className={fieldClass} value={stationId} onChange={(event) => setStationId(event.target.value)}>
          {(stations.data ?? []).map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </select>
        <Button
          intent="primary"
          disabled={nameFr.trim().length === 0 || nameAr.trim().length === 0}
          onClick={() => create.mutate()}
        >
          {t("admin.create")}
        </Button>
      </FormSection>
      <DataTable>
        <tbody>
          {rows.map((category, index) => (
            <tr key={category.id} className="border-t border-line">
              <td className="p-3">
                <p>{category.nameFr}</p>
                <p dir="rtl">{category.nameAr}</p>
              </td>
              <td className="p-3">
                <StationTag kind={category.stationKind} />
              </td>
              <td className="p-3">
                <select
                  className={fieldClass}
                  value={category.stationId}
                  onChange={(event) => patch.mutate({ id: category.id, body: { stationId: event.target.value } })}
                >
                  {(stations.data ?? []).map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-3">
                <Button onClick={() => patch.mutate({ id: category.id, body: { isActive: !category.isActive } })}>
                  {category.isActive ? t("admin.active") : t("admin.inactive")}
                </Button>
              </td>
              <td className="p-3">
                <Button
                  disabled={index === 0}
                  onClick={() => {
                    const ids = rows.map((row) => row.id);
                    const previous = ids[index - 1];
                    const current = ids[index];
                    if (!previous || !current) {
                      return;
                    }
                    ids[index - 1] = current;
                    ids[index] = previous;
                    reorder.mutate(ids);
                  }}
                >
                  ↑
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
