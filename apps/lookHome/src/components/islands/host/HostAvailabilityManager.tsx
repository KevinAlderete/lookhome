import { useState } from "react";

type Rule = {
  id: string;
  ruleType: string;
  startDate?: string | null;
  endDate?: string | null;
  weekPattern?: { days?: number[] } | null;
};
type Block = {
  id: string;
  startDate?: string | null;
  endDate?: string | null;
  reason?: string | null;
  bookingId?: string | null;
};
type Props = { offerId: string; rules: Rule[]; blocks: Block[] };

const RANGE_RULES = [
  { value: "open_range", label: "Rango disponible" },
  { value: "blocked_range", label: "Rango no disponible" },
] as const;
const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const BLOCK_REASONS = [
  { value: "maintenance", label: "Mantenimiento" },
  { value: "owner_block", label: "Bloqueo del anfitrión" },
  { value: "other", label: "Otro motivo" },
];
const RULE_LABELS: Record<string, string> = { open_range: "Rango disponible", blocked_range: "Rango no disponible", weekly_pattern: "Patrón semanal" };
const BLOCK_LABELS: Record<string, string> = { maintenance: "Mantenimiento", owner_block: "Bloqueo del anfitrión", other: "Otro motivo", booked: "Bloqueo por solicitud o reserva" };

function message(data: any, fallback: string) {
  if (typeof data?.message === "string") return data.message;
  if (Array.isArray(data?.message)) return data.message.join(" · ");
  return fallback;
}

export default function HostAvailabilityManager({ offerId, rules, blocks }: Props) {
  const [ruleType, setRuleType] = useState("open_range");
  const [ruleStart, setRuleStart] = useState("");
  const [ruleEnd, setRuleEnd] = useState("");
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [reason, setReason] = useState("owner_block");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const request = async (path: string, method: string, body?: unknown) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(path, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(data, "No se pudo actualizar la disponibilidad."));
      setSuccess(message(data, "Disponibilidad actualizada."));
      window.setTimeout(() => window.location.reload(), 500);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar la disponibilidad.");
      setLoading(false);
    }
  };

  const createRule = () => {
    if (ruleType === "weekly_pattern") {
      if (!weekDays.length) { setError("Selecciona al menos un día de la semana."); return; }
      void request("/api/host/availability/rules/create", "POST", { roomId: offerId, ruleType, weekPattern: { days: weekDays } });
      return;
    }
    if (!ruleStart || !ruleEnd || ruleStart >= ruleEnd) { setError("Indica un rango con fecha final posterior a la inicial."); return; }
    void request("/api/host/availability/rules/create", "POST", { roomId: offerId, ruleType, startDate: ruleStart, endDate: ruleEnd });
  };

  const createBlock = () => {
    if (!blockStart || !blockEnd || blockStart >= blockEnd) { setError("Indica un bloqueo con fecha final posterior a la inicial."); return; }
    void request("/api/host/availability/blocks/create", "POST", { roomId: offerId, startDate: blockStart, endDate: blockEnd, reason });
  };

  return (
    <div className="space-y-5">
      {error && <p role="alert" aria-live="assertive" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-5 rounded-[24px] bg-white p-5 shadow-[0_18px_50px_rgba(80,76,74,0.08)] md:p-6">
          <div><h2 className="text-xl font-bold text-warm-gray">Reglas de disponibilidad</h2><p className="mt-1 text-sm text-warm-gray/70">Puedes definir un rango concreto o los días de la semana en que aceptas ingresos.</p></div>
          <div className="grid gap-3">
            <label className="space-y-2"><span className="text-sm font-semibold">Tipo de regla</span><select name="ruleType" value={ruleType} onChange={(event) => setRuleType(event.target.value)} className="h-11 w-full rounded-xl border px-3"><option value="open_range">Rango disponible</option><option value="blocked_range">Rango no disponible</option><option value="weekly_pattern">Patrón semanal</option></select></label>
            {ruleType === "weekly_pattern" ? <fieldset className="rounded-xl border border-warm-gray/15 p-3"><legend className="px-1 text-sm font-semibold">Días disponibles</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{WEEKDAYS.map((day, index) => <label key={day} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="weekPatternDays" value={index} checked={weekDays.includes(index)} onChange={() => setWeekDays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort())} />{day}</label>)}</div></fieldset> : <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2"><span className="text-sm font-semibold">Desde</span><input name="ruleStart" autoComplete="off" type="date" value={ruleStart} onChange={(event) => setRuleStart(event.target.value)} className="h-11 w-full rounded-xl border px-3" /></label><label className="space-y-2"><span className="text-sm font-semibold">Hasta</span><input name="ruleEnd" autoComplete="off" type="date" min={ruleStart || undefined} value={ruleEnd} onChange={(event) => setRuleEnd(event.target.value)} className="h-11 w-full rounded-xl border px-3" /></label></div>}
            <button type="button" onClick={createRule} disabled={loading} className="min-h-11 rounded-xl bg-terracotta px-4 font-semibold text-white disabled:opacity-60">{loading ? "Guardando…" : "Guardar regla"}</button>
          </div>
          <div><h3 className="font-bold text-warm-gray">Reglas actuales</h3>{rules.length ? <ul className="mt-3 space-y-2">{rules.map((rule) => <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream p-3"><div><strong className="block text-sm">{RULE_LABELS[rule.ruleType] ?? "Regla"}</strong><span className="mt-1 block text-xs text-warm-gray/70">{rule.ruleType === "weekly_pattern" ? (rule.weekPattern?.days ?? []).map((day) => WEEKDAYS[day]).join(", ") : `${rule.startDate?.slice(0, 10) ?? "—"} al ${rule.endDate?.slice(0, 10) ?? "—"}`}</span></div><button type="button" disabled={loading} onClick={() => void request(`/api/host/availability/rules/${encodeURIComponent(rule.id)}/delete`, "POST")} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-red-700 disabled:opacity-50">Eliminar regla</button></li>)}</ul> : <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-warm-gray/70">No hay reglas configuradas.</p>}</div>
        </section>

        <section className="space-y-5 rounded-[24px] bg-white p-5 shadow-[0_18px_50px_rgba(80,76,74,0.08)] md:p-6">
          <div><h2 className="text-xl font-bold text-warm-gray">Bloquear fechas</h2><p className="mt-1 text-sm text-warm-gray/70">Usa un bloqueo para mantenimiento u otros motivos. Las fechas ocupadas por solicitudes y reservas se administran automáticamente.</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2"><span className="text-sm font-semibold">Desde</span><input name="blockStart" autoComplete="off" type="date" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} className="h-11 w-full rounded-xl border px-3" /></label><label className="space-y-2"><span className="text-sm font-semibold">Hasta</span><input name="blockEnd" autoComplete="off" type="date" min={blockStart || undefined} value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} className="h-11 w-full rounded-xl border px-3" /></label><label className="space-y-2 sm:col-span-2"><span className="text-sm font-semibold">Motivo</span><select name="blockReason" value={reason} onChange={(event) => setReason(event.target.value)} className="h-11 w-full rounded-xl border px-3">{BLOCK_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
          <button type="button" onClick={createBlock} disabled={loading} className="min-h-11 rounded-xl bg-warm-gray px-4 font-semibold text-white disabled:opacity-60">{loading ? "Guardando…" : "Crear bloqueo"}</button>
          <div><h3 className="font-bold text-warm-gray">Bloqueos actuales</h3>{blocks.length ? <ul className="mt-3 space-y-2">{blocks.map((block) => <li key={block.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream p-3"><div><strong className="block text-sm">{BLOCK_LABELS[block.reason ?? ""] ?? "Bloqueo"}</strong><span className="mt-1 block text-xs text-warm-gray/70">{block.startDate?.slice(0, 10) ?? "—"} al {block.endDate?.slice(0, 10) ?? "—"}</span>{block.bookingId && <span className="mt-1 block text-xs font-semibold text-warm-gray/70">Generado por el flujo de alquiler</span>}</div>{!block.bookingId && <button type="button" disabled={loading} onClick={() => void request(`/api/host/availability/blocks/${encodeURIComponent(block.id)}/delete`, "POST")} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-red-700 disabled:opacity-50">Quitar bloqueo</button>}</li>)}</ul> : <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-warm-gray/70">No hay bloqueos manuales.</p>}</div>
        </section>
      </div>
    </div>
  );
}
