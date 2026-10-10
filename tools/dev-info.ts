import os from "node:os";

const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
  .map((entry) => entry?.address)
  .filter((address): address is string => Boolean(address));

console.log("Men Bahrouu — accès local");
console.log("");
for (const address of addresses.length > 0 ? addresses : ["127.0.0.1"]) {
  console.log(`Hub   http://${address}:3000`);
  console.log(`Web   http://${address}:5173`);
  console.log("");
}
console.log("Appareils du seed : Tablette salle (TABLET), PC caisse (CASHIER_PC), Téléphone admin (PHONE).");
console.log("Les jetons sont dans .dev-device-tokens.json, ignoré par Git. Ce script ne les affiche pas.");
console.log("Serveur Mohamed, caissière Sonia, admin Karim. Les PIN et le mot de passe sont dans le README de développement.");
