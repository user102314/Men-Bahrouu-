import { newId, settingsPutSchema } from "@resto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { MoneyInput } from "../../components/admin/MoneyInput.js";
import { ConfirmDialog, DataTable, ErrorState, FormSection, PageHeader, StatusBadge, fieldClass } from "../../components/admin/widgets.js";
import { Button } from "../../components/ui/button.js";
import { adminApi } from "../../lib/admin-api.js";
import { parseMoneyDraft } from "../../lib/admin/money-draft.js";
import { hubErrorText } from "../../lib/errors.js";

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => adminApi.settings() });
  const tables = useQuery({ queryKey: ["admin", "tables"], queryFn: () => adminApi.tables() });
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [cutoff, setCutoff] = useState("5");
  const [vat, setVat] = useState("700");
  const [columns, setColumns] = useState("48");
  const [header, setHeader] = useState("");
  const [requireShift, setRequireShift] = useState(false);
  const [restock, setRestock] = useState(false);
  const [ceiling, setCeiling] = useState("");
  const [variance, setVariance] = useState("");
  const [label, setLabel] = useState("");
  const [zone, setZone] = useState("");
  const [seats, setSeats] = useState("4");
  const [zoneFrom, setZoneFrom] = useState("");
  const [zoneTo, setZoneTo] = useState("");
  const [busyTable, setBusyTable] = useState<string | null>(null);

  useEffect(() => {
    const current = settings.data;
    if (!current) {
      return;
    }
    setName(current.restaurant.name);
    setAddress(current.restaurant.address);
    setPhone(current.restaurant.phone);
    setCutoff(String(current.businessDayCutoffHour));
    setVat(String(current.defaultVatBp));
    setColumns(String(current.printColumns));
    setHeader(current.ticketHeader);
    setRequireShift(current.requireOpenShift);
    setRestock(current.restockOnVoid);
    setCeiling(String(current.priceCeilingMillimes / 1000));
    setVariance(String(current.cashVarianceAlertMillimes / 1000));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => {
      const ceilingDraft = parseMoneyDraft(ceiling, Number.MAX_SAFE_INTEGER);
      const varianceDraft = parseMoneyDraft(variance, Number.MAX_SAFE_INTEGER);
      const body: Record<string, unknown> = {
        defaultVatBp: Number(vat),
        businessDayCutoffHour: Number(cutoff),
        printColumns: Number(columns),
        ticketHeader: header,
        requireOpenShift: requireShift,
        restockOnVoid: restock,
      };
      if (name.trim() && address.trim() && phone.trim()) {
        body.restaurant = { name: name.trim(), address: address.trim(), phone: phone.trim() };
      }
      if (ceilingDraft.millimes !== null) {
        body.priceCeilingMillimes = ceilingDraft.millimes;
      }
      if (varianceDraft.millimes !== null) {
        body.cashVarianceAlertMillimes = varianceDraft.millimes;
      }
      return adminApi.putSettings(settingsPutSchema.parse(body));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "settings"] }),
  });
  const createTable = useMutation({
    mutationFn: () =>
      adminApi.saveTable(newId(), { label: label.trim(), zone: zone.trim(), seats: Number(seats) }, true),
    onSuccess: async () => {
      setLabel("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "tables"] });
    },
  });
  const patchTable = useMutation({
    mutationFn: (input: { id: string; body: unknown }) => adminApi.saveTable(input.id, input.body, false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "tables"] }),
  });
  const rename = useMutation({
    mutationFn: () => adminApi.renameZone(zoneFrom.trim(), zoneTo.trim()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "tables"] }),
  });
  const error = settings.error ?? tables.error ?? save.error ?? createTable.error ?? patchTable.error ?? rename.error;

  return (
    <div className="grid gap-4">
      <PageHeader title={t("admin.settings")} />
      {error ? <ErrorState>{hubErrorText(error, t)}</ErrorState> : null}
      <FormSection title={t("admin.restaurant")}>
        <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("admin.restaurant")} />
        <input className={fieldClass} value={address} onChange={(event) => setAddress(event.target.value)} placeholder={t("admin.address")} />
        <input className={fieldClass} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t("admin.phone")} />
        <label className="grid gap-1">
          {t("admin.cutoff")}
          <input className={fieldClass} inputMode="numeric" value={cutoff} onChange={(event) => setCutoff(event.target.value)} />
        </label>
        <label className="grid gap-1">
          {t("admin.vat")}
          <input className={fieldClass} inputMode="numeric" value={vat} onChange={(event) => setVat(event.target.value)} />
        </label>
        <label className="grid gap-1">
          {t("admin.columns")}
          <input className={fieldClass} inputMode="numeric" value={columns} onChange={(event) => setColumns(event.target.value)} />
        </label>
        <input className={fieldClass} value={header} onChange={(event) => setHeader(event.target.value)} placeholder={t("admin.header")} />
        <label className="flex min-h-12 items-center gap-2">
          <input type="checkbox" checked={requireShift} onChange={(event) => setRequireShift(event.target.checked)} />
          {t("admin.requireShift")}
        </label>
        <label className="flex min-h-12 items-center gap-2">
          <input type="checkbox" checked={restock} onChange={(event) => setRestock(event.target.checked)} />
          {t("admin.restock")}
        </label>
        <label className="grid gap-1">
          {t("admin.ceiling")}
          <MoneyInput id="ceiling" value={ceiling} ceilingMillimes={Number.MAX_SAFE_INTEGER} onChange={setCeiling} />
        </label>
        <label className="grid gap-1">
          {t("admin.varianceAlert")}
          <MoneyInput id="variance" value={variance} ceilingMillimes={Number.MAX_SAFE_INTEGER} onChange={setVariance} />
        </label>
        <Button intent="primary" onClick={() => save.mutate()}>
          {t("admin.save")}
        </Button>
      </FormSection>
      <FormSection title={t("admin.tables")}>
        <input className={fieldClass} placeholder={t("admin.label")} value={label} onChange={(event) => setLabel(event.target.value)} />
        <input className={fieldClass} placeholder={t("admin.zone")} value={zone} onChange={(event) => setZone(event.target.value)} />
        <input className={fieldClass} inputMode="numeric" value={seats} onChange={(event) => setSeats(event.target.value)} />
        <Button intent="primary" disabled={!label.trim() || !zone.trim()} onClick={() => createTable.mutate()}>
          {t("admin.create")}
        </Button>
        <div className="flex gap-2">
          <input className={fieldClass} placeholder={t("admin.from")} value={zoneFrom} onChange={(event) => setZoneFrom(event.target.value)} />
          <input className={fieldClass} placeholder={t("admin.to")} value={zoneTo} onChange={(event) => setZoneTo(event.target.value)} />
          <Button disabled={!zoneFrom.trim() || !zoneTo.trim()} onClick={() => rename.mutate()}>
            {t("admin.renameZone")}
          </Button>
        </div>
        <DataTable>
          <tbody>
            {(tables.data?.tables ?? []).map((table) => (
              <tr key={table.id} className="border-t border-line">
                <td className="p-3">{table.label}</td>
                <td className="p-3">{table.zone}</td>
                <td className="p-3">{table.seats}</td>
                <td className="p-3">
                  <StatusBadge status={table.status} />
                </td>
                <td className="p-3">
                  <Button onClick={() => setBusyTable(table.id)}>
                    {table.isActive ? t("admin.active") : t("admin.inactive")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </FormSection>
      <ConfirmDialog
        open={busyTable !== null}
        title={t("admin.deactivate")}
        onClose={() => setBusyTable(null)}
        onConfirm={() => {
          const table = tables.data?.tables.find((row) => row.id === busyTable);
          if (table) {
            patchTable.mutate({ id: table.id, body: { isActive: !table.isActive } });
          }
          setBusyTable(null);
        }}
      />
    </div>
  );
}
