"use client";

export const ProofValue = ({ label, value, href }: { label: string; value: string; href?: string }) => (
  <div className="rounded-xl bg-base-200/70 p-3">
    <p className="m-0 text-xs uppercase tracking-wider text-base-content/50">{label}</p>
    {href ? (
      <a className="mt-1 block break-all font-mono text-xs link" href={href} target="_blank" rel="noreferrer">
        {value}
      </a>
    ) : (
      <p className="mt-1 break-all font-mono text-xs">{value}</p>
    )}
  </div>
);
