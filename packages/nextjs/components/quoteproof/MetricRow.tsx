"use client";

export const MetricRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-base-content/60">{label}</span>
    <span className="text-right font-semibold">{value}</span>
  </div>
);
