import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { OneTimeSecretDialog } from "../../components/admin/OneTimeSecretDialog.js";
import { ConfirmDialog, DataTable, ErrorState, FormSection, PageHeader, fieldClass } from "../../components/admin/widgets.js";
import { Button } from "../../components/ui/button.js";
import { adminApi } from "../../lib/admin-api.js";
import { hubErrorText } from "../../lib/errors.js";

const TYPES = ["TABLET", "CASHIER_PC", "PHONE", "PERSONAL"] as const;

export function DevicesPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ["admin", "devices"], queryFn: () => adminApi.devices() });
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("TABLET");
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => adminApi.createDevice(name.trim(), type),
    onSuccess: async (created) => {
      setSecret(created.token);
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "devices"] });
    },
  });
  const drop = useMutation({
    mutationFn: (id: string) => adminApi.revokeDevice(id),
    onSuccess: async () => {
      setRevoke(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "devices"] });
    },
  });

  useEffect(() => {
    if (!secret) {
      setQr(null);
      return;
    }
    const url = `${window.location.origin}/setup?token=${encodeURIComponent(secret)}`;
    void QRCode.toDataURL(url, { margin: 1, width: 240 }).then(setQr);
  }, [secret]);

  return (
    <div className="grid gap-4">
      <PageHeader title={t("admin.devices")} />
      {devices.error || create.error || drop.error ? (
        <ErrorState>{hubErrorText(devices.error ?? create.error ?? drop.error, t)}</ErrorState>
      ) : null}
      <FormSection title={t("admin.create")}>
        <input className={fieldClass} placeholder={t("admin.deviceName")} value={name} onChange={(event) => setName(event.target.value)} />
        <select className={fieldClass} value={type} onChange={(event) => setType(event.target.value as (typeof TYPES)[number])}>
          {TYPES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <p className="text-sm text-ink/70">{t("admin.phoneAdmin")}</p>
        <Button intent="primary" disabled={name.trim().length === 0} onClick={() => create.mutate()}>
          {t("admin.create")}
        </Button>
      </FormSection>
      <DataTable>
        <tbody>
          {(devices.data ?? []).map((device) => (
            <tr key={device.id} className="border-t border-line">
              <td className="p-3">{device.name}</td>
              <td className="p-3">{device.type}</td>
              <td className="p-3">{device.isActive ? t("admin.active") : t("admin.inactive")}</td>
              <td className="p-3">
                {device.lastSeenAt
                  ? new Intl.DateTimeFormat(i18n.language.startsWith("ar") ? "ar-TN" : "fr-TN", {
                      timeZone: "Africa/Tunis",
                      dateStyle: "short",
                      timeStyle: "short",
                      numberingSystem: "latn",
                    }).format(new Date(device.lastSeenAt))
                  : t("admin.never")}
              </td>
              <td className="p-3">
                <Button intent="danger" disabled={!device.isActive} onClick={() => setRevoke(device.id)}>
                  {t("admin.revoke")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <OneTimeSecretDialog open={secret !== null} secret={secret ?? ""} onClose={() => setSecret(null)}>
        {qr ? <img src={qr} alt={t("admin.setupQr")} width={240} height={240} /> : null}
      </OneTimeSecretDialog>
      <ConfirmDialog
        open={revoke !== null}
        title={t("admin.revoke")}
        onClose={() => setRevoke(null)}
        onConfirm={() => {
          if (revoke) {
            drop.mutate(revoke);
          }
        }}
      />
    </div>
  );
}
