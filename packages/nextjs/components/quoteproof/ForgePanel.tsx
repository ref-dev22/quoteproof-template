"use client";

import { FORGE_CASES, type ForgeCaseId, type ForgeRunState, forgeDisplayState } from "~~/utils/quoteForge";

export const ForgePanel = ({
  forgeRun,
  isComparing,
  compareStoredReceipt,
}: {
  forgeRun: ForgeRunState;
  isComparing: boolean;
  compareStoredReceipt: (caseId: ForgeCaseId | null, scrollToChecks?: boolean) => Promise<void>;
}) => (
  <section
    aria-labelledby="forge-heading"
    className="mt-5 border-t border-base-300 pt-5"
    data-forge-state={forgeDisplayState(forgeRun)}
  >
    <h3 id="forge-heading" className="m-0 text-base font-semibold">
      Try to forge this receipt
    </h3>
    <p className="mt-2 text-sm text-base-content/80">
      Simulation: runs a prepared forged copy through the same read-only checks. Nothing is written to Hedera.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      {FORGE_CASES.map(item => (
        <button
          key={item.id}
          type="button"
          className={`btn btn-sm h-auto min-w-0 max-w-full whitespace-normal break-words py-2 text-left leading-snug ${forgeRun.caseId === item.id ? "btn-error" : "btn-outline"}`}
          onClick={() => void compareStoredReceipt(item.id, true)}
          disabled={isComparing}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        className="btn btn-sm btn-outline"
        onClick={() => void compareStoredReceipt(null, true)}
        disabled={isComparing || (!forgeRun.caseId && !forgeRun.forgedEver)}
      >
        Restore original
      </button>
    </div>
    <p className="mt-3 text-xs leading-5 text-base-content/60">
      These prepared forgeries come from <code>examples/adversarial</code>, the same cases checked by{" "}
      <code>npm run demo</code>.
    </p>
    {forgeRun.phase === "network_error" ? (
      <p role="status" className="mt-3 text-sm text-base-content/80">
        A network check could not finish. Retry the read-only comparison.
      </p>
    ) : null}
  </section>
);
