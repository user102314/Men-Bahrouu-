import { newId } from "@resto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { DataTable, ErrorState, FormSection, PageHeader, fieldClass } from "../../components/admin/widgets.js";
import { Button } from "../../components/ui/button.js";
import { adminApi } from "../../lib/admin-api.js";
import { api } from "../../lib/api.js";
import { hubErrorText } from "../../lib/errors.js";

export function PrintersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const printers = useQuery({ queryKey: ["admin", "printers"], queryFn: () => adminApi.printers() });
  const stations = useQuery({ queryKey: ["admin", "stations"], queryFn: () => adminApi.stationList() });
  const jobs = useQuery({ queryKey: ["print-jobs"], queryFn: () => api.printJobs() });
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("9100");
  const [note, setNote] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => adminApi.savePrinter(newId(), { name: name.trim(), host: host.trim(), port: Number(port) }, true),
    onSuccess: async () => {
      setName("");
      setHost("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "printers"] });
    },
  });
  const test = useMutation({
    mutationFn: (id: string) => adminApi.testPrinter(id),
    onSuccess: (result) => setNote(result.ok ? t("admin.saved") : result.error ?? t("admin.failedPrint")),
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.retryPrint(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["print-jobs"] }),
  });
  const station = useMutation({
    mutationFn: (input: { id: string; body: { printerId: string; fallbackStationId?: string | null } }) =>
      adminApi.saveStation(input.id, input.body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "stations"] }),
  });
  const failed = (jobs.data?.jobs ?? []).filter((job) => job.status === "FAILED");
  const error = printers.error ?? stations.error ?? create.error ?? test.error ?? retry.error;

  return (
    <div className="grid gap-4">
      <PageHeader title={t("admin.printers")} />
      {error ? <ErrorState>{hubErrorText(error, t)}</ErrorState> : null}
      {note ? <p>{note}</p> : null}
      <FormSection title={t("admin.create")}>
        <input className={fieldClass} placeholder={t("admin.deviceName")} value={name} onChange={(event) => setName(event.target.value)} />
        <input className={fieldClass} placeholder={t("admin.host")} value={host} onChange={(event) => setHost(event.target.value)} />
        <input className={fieldClass} inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value)} />
        <Button intent="primary" disabled={!name.trim() || !host.trim()} onClick={() => create.mutate()}>
          {t("admin.create")}
        </Button>
      </FormSection>
      <DataTable>
        <tbody>
          {(printers.data ?? []).map((printer) => (
            <tr key={printer.id} className="border-t border-line">
              <td className="p-3">{printer.name}</td>
              <td className="p-3">
                {printer.host}:{printer.port}
              </td>
              <td className="p-3">{printer.isActive ? t("admin.active") : t("admin.inactive")}</td>
              <td className="p-3">
                <Button onClick={() => test.mutate(printer.id)}>{t("admin.testPrint")}</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <FormSection title={t("admin.stations")}>
        {(stations.data ?? []).map((row) => (
          <label key={row.id} className="grid gap-1">
            {row.name}
            <select
              className={fieldClass}
              value={row.printerId}
              onChange={(event) => station.mutate({ id: row.id, body: { printerId: event.target.value } })}
            >
              {(printers.data ?? []).map((printer) => (
                <option key={printer.id} value={printer.id}>
                  {printer.name}
                </option>
              ))}
            </select>
            <select
              className={fieldClass}
              value={row.fallbackStationId ?? ""}
              onChange={(event) =>
                station.mutate({
                  id: row.id,
                  body: { printerId: row.printerId, fallbackStationId: event.target.value || null },
                })
              }
            >
              <option value="">{t("admin.none")}</option>
              {(stations.data ?? [])
                .filter((other) => other.id !== row.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </FormSection>
      <FormSection title={t("admin.printFailed")}>
        {failed.length === 0 ? <p>{t("admin.empty")}</p> : null}
        {failed.map((job) => (
          <div key={job.id} className="flex items-center justify-between gap-2">
            <span>{job.lastError ?? job.status}</span>
            <Button onClick={() => retry.mutate(job.id)}>{t("admin.retry")}</Button>
          </div>
        ))}
      </FormSection>
    </div>
  );
}
