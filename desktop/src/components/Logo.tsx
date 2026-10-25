// SPDX-License-Identifier: AGPL-3.0-only
// FCC Desk placeholder mark: black FCC monogram on an orange rounded square (original artwork).
export function Logo({ size = 28 }: { size?: number }) {
  return <img src="/logo.svg" width={size} height={size} alt="FCC Desk" className="shrink-0" draggable={false} />;
}
export function Dot({ state }: { state: "ok" | "warn" | "off" | "bad" }) {
  const c = { ok: "bg-ok", warn: "bg-warn", off: "bg-subtle/50", bad: "bg-bad" }[state];
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} aria-label={state} />;
}
