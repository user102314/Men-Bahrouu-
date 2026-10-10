import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Dialog } from "../ui/dialog.js";
import { CopyButton } from "./widgets.js";

export function OneTimeSecretDialog({
  open,
  secret,
  children,
  onClose,
}: {
  open: boolean;
  secret: string;
  children?: ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())} title={t("admin.token")}>
      <p>{t("admin.secretOnce")}</p>
      <p className="mt-3 break-all rounded-[12px] bg-fond p-3 font-mono text-sm">{secret}</p>
      <div className="mt-3">{children}</div>
      <div className="mt-3">
        <CopyButton value={secret} />
      </div>
    </Dialog>
  );
}
