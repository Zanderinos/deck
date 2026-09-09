export const control = "rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent";

export function Card({ title, description, children, className = "" }: { title: string; description: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-edge2 bg-panel p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-mut">{description}</p>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-dim">{label}</span>
      {hint && <span className="ml-1.5 text-[11px] text-mut">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function Toggle({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={`flex items-center gap-2 text-xs ${disabled ? "text-mut" : "text-dim"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
