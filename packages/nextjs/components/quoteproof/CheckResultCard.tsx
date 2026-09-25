"use client";

import type { ReactNode } from "react";
import { CheckCircleIcon, MinusCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import type { CheckTone } from "~~/utils/quoteCheckVisual";

export const CheckResultCard = ({
  label,
  text,
  tone,
  children,
}: {
  label: string;
  text: string;
  tone: CheckTone;
  children?: ReactNode;
}) => {
  const Icon = tone === "success" ? CheckCircleIcon : tone === "error" ? XCircleIcon : MinusCircleIcon;
  const cardClass =
    tone === "success"
      ? "border-success/40 bg-success/5"
      : tone === "error"
        ? "border-error/40 bg-error/5"
        : "border-base-300 bg-base-100";
  const iconClass = tone === "success" ? "text-success" : tone === "error" ? "text-error" : "text-base-content/50";
  return (
    <div className={`rounded-xl border p-3 ${cardClass}`} data-check-state={tone}>
      <p className="m-0 text-xs uppercase tracking-wider text-base-content/50">{label}</p>
      <p className="mt-1 flex items-start gap-2 text-sm font-semibold">
        <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} aria-hidden="true" />
        <span>{text}</span>
      </p>
      {children}
    </div>
  );
};
