"use client";

import { InformationCircleIcon } from "@heroicons/react/24/outline";

export const FailureExercises = () => (
  <section
    aria-labelledby="failure-heading"
    className="mt-6 rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm"
  >
    <div className="flex items-start gap-3">
      <InformationCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Failure exercises</p>
        <h2 id="failure-heading" className="text-xl font-semibold">
          The recovery path is part of the demo
        </h2>
        <p className="mt-2 text-sm leading-6 text-base-content/70">
          These cases are backed by executable contract tests and keep fixture behavior visibly separate from a
          confirmed testnet receipt.
        </p>
      </div>
    </div>
    <div className="mt-5 grid gap-3 md:grid-cols-3">
      {[
        ["Stale feed", "Preview shows unavailable", "Refresh the reference; no write is sent."],
        ["Changed round", "Guard rejects a changed observation", "Refresh once after reviewing the new quote."],
        [
          "Altered receipt",
          "Standalone verifier marks it invalid",
          "Export the original receipt again; hashes must agree.",
        ],
      ].map(([title, outcome, action]) => (
        <article key={title} className="rounded-2xl border border-base-300 bg-base-200/60 p-4">
          <p className="mb-2 text-sm font-semibold">{title}</p>
          <p className="m-0 text-sm text-base-content/80">{outcome}</p>
          <p className="mt-2 text-xs leading-5 text-base-content/60">Recovery: {action}</p>
        </article>
      ))}
    </div>
    <p className="mt-4 text-xs text-base-content/50">
      Reuse guidance: <code>QuoteProofRegistry.test.ts</code>, <code>quoteReceipt.test.ts</code> and{" "}
      <code>npm run verify:quote</code>.
    </p>
  </section>
);
