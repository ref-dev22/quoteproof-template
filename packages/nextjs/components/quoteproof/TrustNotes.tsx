"use client";

import { CheckCircleIcon, ClipboardDocumentIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

export const TrustNotes = () => (
  <section aria-labelledby="trust-heading" className="mt-6 grid gap-6 md:grid-cols-3">
    <article className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <CheckCircleIcon className="h-6 w-6 text-success" aria-hidden="true" />
      <h2 id="trust-heading" className="mt-4 text-lg font-semibold">
        Reference, not payment
      </h2>
      <p className="mt-2 text-sm leading-6 text-base-content/70">
        The contract records a bounded quote receipt. It does not transfer HBAR or confirm a payment.
      </p>
    </article>
    <article className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <ShieldCheckIcon className="h-6 w-6 text-primary" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">Event-bound fields</h2>
      <p className="mt-2 text-sm leading-6 text-base-content/70">
        The receipt is built from the recorded event, including round, observation time, rounding and commitment.
      </p>
    </article>
    <article className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <ClipboardDocumentIcon className="h-6 w-6 text-secondary" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">Portable verification</h2>
      <p className="mt-2 text-sm leading-6 text-base-content/70">
        Exported JSON can be checked by the standalone verifier with the testnet chain and registry context.
      </p>
    </article>
  </section>
);
