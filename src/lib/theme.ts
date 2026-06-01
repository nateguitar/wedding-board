// Runtime theme system. The whole app is styled through 7 CSS variables (see
// globals.css). A "theme" is just a map of those variable suffixes to colors;
// applying it sets the variables on <html>, which overrides the defaults live.

export const THEME_TOKENS = [
  { key: "background", label: "Page background", hint: "The canvas behind everything" },
  { key: "surface", label: "Panels & cards", hint: "Top bar, inspector, sidebar" },
  { key: "foreground", label: "Text", hint: "Primary text color" },
  { key: "accent", label: "Accent", hint: "Buttons, selections, highlights" },
  { key: "accent-soft", label: "Accent (soft)", hint: "Tinted backgrounds & chips" },
  { key: "border", label: "Borders", hint: "Hairlines between sections" },
  { key: "muted", label: "Muted text", hint: "Secondary / hint text" },
] as const;

export type ThemeKey = (typeof THEME_TOKENS)[number]["key"];
export type Theme = Record<ThemeKey, string>;

export const STORAGE_KEY = "wb-theme";

// The current ("Terracotta") defaults, mirrored from globals.css :root.
export const DEFAULT_THEME: Theme = {
  background: "#fbf7f0",
  surface: "#ffffff",
  foreground: "#2b2622",
  accent: "#c0705f",
  "accent-soft": "#f2e3dd",
  border: "#ece3d6",
  muted: "#8a7f74",
};

// The palette the user provided (for the swatch tray + reference).
export const TEST_PALETTE = [
  { name: "Chinese Blue", hex: "#414B9E" },
  { name: "Ceil", hex: "#9792CB" },
  { name: "Pearly Purple", hex: "#AA74A0" },
  { name: "Desert Sand", hex: "#E2C99E" },
  { name: "Antique Ruby", hex: "#852736" },
] as const;

// Full themes, including ones derived from the provided palette so the user can
// "test it out" with one click, then fine-tune.
export const PRESETS: { name: string; theme: Theme }[] = [
  { name: "Terracotta", theme: DEFAULT_THEME },
  {
    name: "Twilight",
    theme: {
      background: "#f6f4fa",
      surface: "#ffffff",
      foreground: "#2a2540",
      accent: "#414b9e", // Chinese Blue
      "accent-soft": "#e4e2f2", // Ceil tint
      border: "#e5e1f0",
      muted: "#8884a6",
    },
  },
  {
    name: "Mauve",
    theme: {
      background: "#faf6f9",
      surface: "#ffffff",
      foreground: "#332430",
      accent: "#aa74a0", // Pearly Purple
      "accent-soft": "#f0e4ee",
      border: "#eee3ec",
      muted: "#998595",
    },
  },
  {
    name: "Ruby & Sand",
    theme: {
      background: "#fbf6ee",
      surface: "#ffffff",
      foreground: "#2e2622",
      accent: "#852736", // Antique Ruby
      "accent-soft": "#f1ddd2",
      border: "#ece0ce", // Desert Sand tint
      muted: "#94806f",
    },
  },
];

export function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}

export function applyTheme(theme: Partial<Theme>) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme)) {
    root.style.setProperty(`--${key}`, value);
  }
}

export function loadTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<Theme>;
    return { ...DEFAULT_THEME, ...parsed };
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

// Inline <script> body for layout <head>: applies the saved theme before paint
// so there's no flash of the default colors on load.
export const NO_FLASH_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem('${STORAGE_KEY}'));if(t){var r=document.documentElement;for(var k in t){r.style.setProperty('--'+k,t[k])}}}catch(e){}})();`;
