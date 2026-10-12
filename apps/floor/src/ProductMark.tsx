import type { ReactNode } from "react";

type PictureKind =
  | "coffee"
  | "tea"
  | "juice"
  | "water"
  | "pizza"
  | "fish"
  | "pasta"
  | "dessert"
  | "salad"
  | "pastry"
  | "grill"
  | "plate";

const BACKGROUNDS: Record<PictureKind, string> = {
  coffee: "#f3e2cf",
  tea: "#e5f4df",
  juice: "#ffe7b8",
  water: "#d9eef8",
  pizza: "#ffe0cc",
  fish: "#d9f1f4",
  pasta: "#fdecc8",
  dessert: "#f8e4ef",
  salad: "#e4f6d4",
  pastry: "#fff1c9",
  grill: "#fde0c8",
  plate: "#efe6d6",
};

export function ProductMark({ name }: { name: string }) {
  const kind = pictureKind(name);
  return (
    <svg viewBox="0 0 160 96" className="h-20 w-full" aria-hidden="true">
      <rect width="160" height="96" fill={BACKGROUNDS[kind]} />
      {scenes[kind]}
    </svg>
  );
}

function pictureKind(name: string): PictureKind {
  const value = name.toLowerCase();
  if (includes(value, ["brik", "بريك"])) return "pastry";
  if (includes(value, ["salade", "mechouia", "سلاطة", "سلطة"])) return "salad";
  if (
    includes(value, [
      "poisson",
      "daurade",
      "loup",
      "calamar",
      "crevette",
      "moule",
      "fruits de mer",
      "gargoulette",
      "flouka",
      "حوت",
      "سمك",
      "وراطة",
      "قاروص",
      "كلامار",
      "كروفات",
      "مول",
      "قلة",
      "فلوكة",
      "غلال البحر",
    ])
  ) {
    return "fish";
  }
  if (
    includes(value, [
      "spaghetti",
      "penne",
      "tagliatelle",
      "risotto",
      "pâte",
      "pate",
      "سباغيتي",
      "باستا",
      "ريزوتو",
      "بلومة",
      "تالياتالي",
    ])
  )
    return "pasta";
  if (includes(value, ["fruit", "dessert", "حلويات", "غلال الموسم"])) return "dessert";
  if (includes(value, ["thé", "tea", "شاي", "تاي"])) return "tea";
  if (includes(value, ["citron", "jus", "gazeuse", "ليمون", "عصير", "غازي"])) return "juice";
  if (includes(value, ["eau", "ماء"])) return "water";
  if (includes(value, ["escalope", "nugget", "poulet", "دجاج", "اسكالوب"])) return "grill";
  return "plate";
}

function includes(value: string, words: string[]): boolean {
  return words.some((word) => value.includes(word));
}

const scenes: Record<PictureKind, ReactNode> = {
  coffee: (
    <g>
      <ellipse cx="78" cy="70" rx="28" ry="6" fill="#c4a484" />
      <path
        d="M58 42 h36 v22 a18 18 0 0 1 -36 0z"
        fill="#f7f1ea"
        stroke="#6b3e26"
        strokeWidth="3"
      />
      <path d="M94 48 h8 a8 8 0 0 1 0 14 h-8" fill="none" stroke="#6b3e26" strokeWidth="3" />
      <path d="M70 34 q4 -8 0 -14" fill="none" stroke="#b9b2a8" strokeWidth="2" />
      <path d="M80 32 q4 -8 0 -14" fill="none" stroke="#b9b2a8" strokeWidth="2" />
    </g>
  ),
  tea: (
    <g>
      <path d="M62 38 h28 l-4 34 h-20z" fill="#fff8e8" stroke="#3d6b45" strokeWidth="3" />
      <path d="M90 46 h8 a7 7 0 0 1 0 14 h-7" fill="none" stroke="#3d6b45" strokeWidth="3" />
      <ellipse cx="76" cy="48" rx="8" ry="3" fill="#7dbe6a" />
    </g>
  ),
  juice: (
    <g>
      <path d="M68 34 h24 l-6 40 h-12z" fill="#ffb703" stroke="#d97706" strokeWidth="3" />
      <circle cx="80" cy="28" r="8" fill="#fb923c" />
      <rect x="76" y="18" width="8" height="8" rx="2" fill="#65a30d" />
    </g>
  ),
  water: (
    <g>
      <path d="M70 30 h18 l6 42 h-30z" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
      <path d="M76 46 h12" stroke="#7dd3fc" strokeWidth="3" />
    </g>
  ),
  pizza: (
    <g>
      <path d="M40 68 L80 28 L120 68 Z" fill="#f6d36b" stroke="#c2410c" strokeWidth="3" />
      <circle cx="78" cy="50" r="4" fill="#b91c1c" />
      <circle cx="92" cy="56" r="4" fill="#b91c1c" />
      <circle cx="70" cy="60" r="3" fill="#166534" />
    </g>
  ),
  fish: (
    <g>
      <ellipse cx="78" cy="52" rx="28" ry="14" fill="#67e8f9" stroke="#0e7490" strokeWidth="3" />
      <path d="M106 52 l16 -12 v24z" fill="#22d3ee" stroke="#0e7490" strokeWidth="3" />
      <circle cx="62" cy="48" r="2" fill="#164e63" />
    </g>
  ),
  pasta: (
    <g>
      <ellipse cx="80" cy="58" rx="32" ry="12" fill="#f8fafc" stroke="#a16207" strokeWidth="3" />
      <path d="M62 52 q8 -16 16 0 t16 0" fill="none" stroke="#f59e0b" strokeWidth="4" />
      <path d="M66 58 q8 -14 14 0 t14 0" fill="none" stroke="#fbbf24" strokeWidth="3" />
    </g>
  ),
  dessert: (
    <g>
      <path
        d="M58 46 h44 v8 c0 16 -10 24 -22 24 s-22 -8 -22 -24z"
        fill="#f5f5f4"
        stroke="#78716c"
        strokeWidth="3"
      />
      <rect x="58" y="40" width="44" height="8" fill="#44403c" />
      <circle cx="80" cy="36" r="6" fill="#fafaf9" stroke="#a8a29e" />
    </g>
  ),
  salad: (
    <g>
      <ellipse cx="80" cy="58" rx="34" ry="12" fill="#ecfccb" stroke="#3f6212" strokeWidth="3" />
      <circle cx="68" cy="50" r="8" fill="#65a30d" />
      <circle cx="86" cy="46" r="9" fill="#84cc16" />
      <circle cx="96" cy="54" r="6" fill="#ef4444" />
    </g>
  ),
  pastry: (
    <g>
      <path d="M58 64 q22 -40 44 0z" fill="#fde68a" stroke="#b45309" strokeWidth="3" />
      <path d="M74 52 q6 10 12 0" fill="none" stroke="#92400e" strokeWidth="2" />
    </g>
  ),
  grill: (
    <g>
      <ellipse cx="80" cy="58" rx="34" ry="14" fill="#fff7ed" stroke="#9a3412" strokeWidth="3" />
      <ellipse cx="80" cy="52" rx="18" ry="8" fill="#ea580c" />
      <path d="M64 58 h32 M68 64 h24" stroke="#fdba74" strokeWidth="2" />
    </g>
  ),
  plate: (
    <g>
      <ellipse cx="80" cy="56" rx="36" ry="16" fill="#fff" stroke="#a8a29e" strokeWidth="3" />
      <ellipse cx="80" cy="56" rx="18" ry="8" fill="#fdba74" />
    </g>
  ),
};
