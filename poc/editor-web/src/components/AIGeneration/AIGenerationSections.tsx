import type { ReactNode } from "react";

type AIGenSectionProps = {
  id: string;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
};

export function AIGenSection({ id, title, subtitle, open, onToggle, children }: AIGenSectionProps) {
  return (
    <section className="aiGenSection" data-section-id={id}>
      <button type="button" className="aiGenSectionHeader" onClick={() => onToggle(id)}>
        <span className="aiGenSectionTitleWrap">
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open ? <div className="aiGenSectionBody">{children}</div> : null}
    </section>
  );
}

type AIGenFieldProps = {
  label: string;
  hint?: string;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
};

export function AIGenField({ label, hint, disabled = false, title, children }: AIGenFieldProps) {
  return (
    <label className={`aiGenField ${disabled ? "isDisabled" : ""}`} title={title}>
      <span className="aiGenFieldLabel">{label}</span>
      {children}
      {hint ? <small className="hint">{hint}</small> : null}
    </label>
  );
}

type AIGenTagProps = {
  children: ReactNode;
};

export function AIGenTag({ children }: AIGenTagProps) {
  return <span className="aiGenTag">{children}</span>;
}
