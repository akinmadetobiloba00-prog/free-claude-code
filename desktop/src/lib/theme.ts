// SPDX-License-Identifier: AGPL-3.0-only
// Theme tokens. Warm-grey surfaces with one accent colour; all values are our own picks.
export type ThemeId = "clay-dark" | "light" | "oled" | "contrast";
export const THEMES: { id: ThemeId; name: string; hint: string }[] = [
  { id: "clay-dark", name: "Clay Dark", hint: "Warm dark with orange accent (default)" },
  { id: "light", name: "Light", hint: "Warm paper white" },
  { id: "oled", name: "Inverted / OLED", hint: "Pure black background" },
  { id: "contrast", name: "High contrast", hint: "Strong borders and text" },
];
export const ACCENTS = ["#D97757", "#E0763C", "#4F8EF7", "#3FB28A", "#A57CF0", "#E25C8A"];

export interface ThemePrefs { theme: ThemeId; accent: string }
const KEY = "fcc.theme";
export function loadTheme(): ThemePrefs {
  try { return { theme: "clay-dark", accent: "#D97757", ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { theme: "clay-dark", accent: "#D97757" }; }
}
export function applyTheme(p: ThemePrefs) {
  const root = document.documentElement;
  root.dataset.theme = p.theme;
  root.style.setProperty("--accent", p.accent);
  localStorage.setItem(KEY, JSON.stringify(p));
}
