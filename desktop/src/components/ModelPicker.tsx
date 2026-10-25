// SPDX-License-Identifier: AGPL-3.0-only
import { ChevronDown, Check, Gauge } from "lucide-react";
import { useDesk } from "@/lib/store";
import { health, type CodeModel } from "@/lib/api";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel } from "./ui/dropdown";
import { Dot } from "./Logo";

export function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const d = useDesk();
  const models = d.boot?.models ?? [];
  const byProvider = new Map<string, CodeModel[]>();
  for (const m of models) byProvider.set(m.provider_id, [...(byProvider.get(m.provider_id) ?? []), m]);
  const pstat = (id: string) => d.status?.provider_status.find((p) => p.provider_id === id);
  const runtime = d.status?.startup?.providers ?? {};
  const cur = models.find((m) => m.id === value);
  return (
    <Menu>
      <MenuTrigger className="flex h-7 max-w-[300px] items-center gap-1.5 rounded-ctl px-2 text-[13px] text-muted hover:bg-raised hover:text-fg" title="Model">
        <Dot state={health(pstat(cur?.provider_id ?? "")?.status, runtime[cur?.provider_id ?? ""])} />
        <span className="truncate">{cur ? cur.model_name : value || "Pick a model"}</span>
        <ChevronDown size={13} />
      </MenuTrigger>
      <MenuContent align="end" className="w-[340px]">
        {models.length === 0 && <div className="p-3 text-sm text-subtle">No models yet. Add a provider key in Providers & models.</div>}
        {[...byProvider.entries()].map(([pid, list]) => (
          <div key={pid}>
            <MenuLabel><span className="inline-flex items-center gap-1.5"><Dot state={health(pstat(pid)?.status, runtime[pid])} />{pstat(pid)?.display_name ?? pid}</span></MenuLabel>
            {list.map((m) => (
              <MenuItem key={m.id} onSelect={() => onChange(m.id)}>
                <span className="flex-1 truncate">{m.model_name}</span>
                {m.id === value && <Check size={14} className="text-accent" />}
              </MenuItem>
            ))}
          </div>
        ))}
      </MenuContent>
    </Menu>
  );
}

const EFFORT_LABEL: Record<string, string> = { none: "Off", off: "Off", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "X-High", max: "Max" };
export function EffortPicker({ model, value, onChange }: { model: string; value: string | null; onChange: (e: string | null) => void }) {
  const d = useDesk();
  const m = d.boot?.models.find((x) => x.id === model);
  const opts = m?.reasoning_efforts ?? [];
  if (!opts.length) return null;
  return (
    <Menu>
      <MenuTrigger className="flex h-7 items-center gap-1 rounded-ctl px-2 text-[13px] text-muted hover:bg-raised hover:text-fg" title="Reasoning effort">
        <Gauge size={13} /> {value ? EFFORT_LABEL[value] ?? value : "Default"} <ChevronDown size={13} />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>Effort</MenuLabel>
        <MenuItem onSelect={() => onChange(null)}><span className="flex-1">Default{m?.default_reasoning_effort ? ` (${EFFORT_LABEL[m.default_reasoning_effort] ?? m.default_reasoning_effort})` : ""}</span>{!value && <Check size={14} className="text-accent" />}</MenuItem>
        {opts.map((o) => <MenuItem key={o} onSelect={() => onChange(o)}><span className="flex-1">{EFFORT_LABEL[o] ?? o}</span>{value === o && <Check size={14} className="text-accent" />}</MenuItem>)}
      </MenuContent>
    </Menu>
  );
}
