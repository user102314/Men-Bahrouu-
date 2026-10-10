import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import ar from "./ar.json" with { type: "json" };
import fr from "./fr.json" with { type: "json" };

const STORAGE_KEY = "resto.lang";

function storedLanguage(): "fr" | "ar" {
  try {
    return localStorage.getItem(STORAGE_KEY) === "ar" ? "ar" : "fr";
  } catch {
    return "fr";
  }
}

export function applyDocumentLocale(language: string): void {
  const arabic = language.startsWith("ar");
  document.documentElement.lang = arabic ? "ar" : "fr";
  document.documentElement.dir = arabic ? "rtl" : "ltr";
  try {
    localStorage.setItem(STORAGE_KEY, arabic ? "ar" : "fr");
  } catch {
    /* ignore */
  }
}

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, ar: { translation: ar } },
  lng: storedLanguage(),
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", applyDocumentLocale);

export function toggleLanguage(): void {
  void i18n.changeLanguage(i18n.language.startsWith("ar") ? "fr" : "ar");
}

export { i18n };
