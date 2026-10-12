import { useEffect, useState } from "react";

import { text, type Lang } from "./copy.js";
import { tunisStamp } from "./time.js";
import { closeService, money, openService, serviceRecette, type ServiceRecetteReport } from "./hub.js";

export function ServiceRecette({ lang }: { lang: Lang }) {
  const copy = text(lang);
  const [report, setReport] = useState<ServiceRecetteReport | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [printReady, setPrintReady] = useState(false);

  useEffect(() => {
    let stop = false;
    void serviceRecette()
      .then((body) => {
        if (!stop) {
          setReport(body);
        }
      })
      .catch(() => {
        if (!stop) {
          setHint(copy.payFailed);
        }
      });
    return () => {
      stop = true;
    };
  }, [lang]);

  useEffect(() => {
    if (!printReady) {
      return;
    }
    window.print();
    setPrintReady(false);
  }, [printReady]);

  const open = report?.service?.status === "OPEN";

  return (
    <div className="table-toolbar">
      <p className="text-sm">{open ? copy.serviceOpen : report?.service ? copy.serviceClosed : copy.serviceHint}</p>
      {hint ? <p className="text-sm text-terracotta">{hint}</p> : null}
      <div className="recette-actions">
        <button
          type="button"
          className="min-h-12 rounded-md bg-primary px-3 font-semibold text-white disabled:opacity-40"
          disabled={busy || open}
          onClick={() => {
            setBusy(true);
            setHint(null);
            void openService()
              .then(setReport)
              .catch(() => setHint(copy.payFailed))
              .finally(() => setBusy(false));
          }}
        >
          {copy.openService}
        </button>
        <button
          type="button"
          className="min-h-12 rounded-md bg-ink px-3 font-semibold text-white disabled:opacity-40"
          disabled={busy || !open}
          onClick={() => {
            setBusy(true);
            setHint(null);
            void closeService()
              .then((body) => {
                setReport(body);
                setPrintReady(true);
              })
              .catch(() => setHint(copy.payFailed))
              .finally(() => setBusy(false));
          }}
        >
          {copy.closeService}
        </button>
        {report && report.products.length > 0 ? (
          <button type="button" className="min-h-12 rounded-md bg-accent px-3 font-semibold text-white" onClick={() => setPrintReady(true)}>
            {copy.reprintService}
          </button>
        ) : null}
      </div>
      {report ? <ServiceSheets report={report} lang={lang} /> : null}
    </div>
  );
}

function ServiceSheets({ report, lang }: { report: ServiceRecetteReport; lang: Lang }) {
  const copy = text(lang);
  const pages = [
    { title: copy.slipAll, lines: report.products, total: report.totals.all },
    { title: copy.slipBar, lines: report.products.filter((line) => line.stationKind === "BAR"), total: report.totals.bar },
    {
      title: copy.slipKitchen,
      lines: report.products.filter((line) => line.stationKind === "KITCHEN"),
      total: report.totals.kitchen,
    },
  ];
  return (
    <div className="service-print">
      {pages.map((page) => (
        <section key={page.title} className="service-page slip">
          <p className="slip-brand">{copy.brand}</p>
          <h1>{page.title}</h1>
          <p className="slip-meta">
            {report.service?.businessDate}
            <br />
            {report.service?.openedAt ? tunisStamp(report.service.openedAt) : ""}
            {report.service?.closedAt ? ` – ${tunisStamp(report.service.closedAt)}` : ""}
            <br />
            {tunisStamp(new Date())}
          </p>
          <div className="slip-rule" />
          {page.lines.length === 0 ? <p className="slip-meta">{copy.noSales}</p> : null}
          {page.lines.map((line) => (
            <div key={`${page.title}-${line.stationKind}-${line.nameFr}`} className="slip-row">
              <span>{line.quantity}×</span>
              <span className="slip-name">{line.nameFr}</span>
              <span>{money(line.revenueMillimes)}</span>
            </div>
          ))}
          <div className="slip-rule" />
          <p className="slip-total">
            <span>{copy.total}</span>
            <span>{money(page.total.revenueMillimes)}</span>
          </p>
          <p className="slip-meta">{page.total.quantity}</p>
          <p className="slip-foot">{report.notice}</p>
        </section>
      ))}
    </div>
  );
}
