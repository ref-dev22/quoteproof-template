"use client";

import { MetricRow } from "./MetricRow";
import { type PreviewQuote, formatHbar, formatPrice } from "./model";
import type { Hash } from "viem";
import { InformationCircleIcon, LockClosedIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-hbar";
import type { PreviewDisplayState } from "~~/utils/quoteCheckVisual";

export const PreviewRecordCard = ({
  usdInput,
  setUsdInput,
  preview,
  previewState,
  observedAge,
  maxAge,
  decimalsData,
  feedIdData,
  oracleData,
  refetchPreview,
  isConnected,
  wrongNetwork,
  switchToTestnet,
  isSwitching,
  recordQuote,
  canWrite,
  isMining,
  txHash,
  writeMessage,
  writeError,
}: {
  usdInput: string;
  setUsdInput: (value: string) => void;
  preview: PreviewQuote | undefined;
  previewState: PreviewDisplayState;
  observedAge: bigint | undefined;
  maxAge: bigint | undefined;
  decimalsData: unknown;
  feedIdData: unknown;
  oracleData: unknown;
  refetchPreview: () => unknown;
  isConnected: boolean;
  wrongNetwork: boolean;
  switchToTestnet: () => Promise<void>;
  isSwitching: boolean;
  recordQuote: () => Promise<void>;
  canWrite: boolean;
  isMining: boolean;
  txHash: Hash | undefined;
  writeMessage: string | undefined;
  writeError: boolean;
}) => (
  <section aria-labelledby="quote-heading" className="rounded-3xl bg-base-100 p-6 shadow-xl sm:p-8">
    <div className="grid min-w-0 gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <SparklesIcon className="h-5 w-5" aria-hidden="true" />
          Wallet-free preview
        </div>
        <h2 id="quote-heading" className="mt-3 text-2xl font-semibold sm:text-3xl">
          Build a reference quote
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-base-content/70">
          The preview is calculation-only. It never creates a transaction, and it never moves HBAR. Recording is a
          separate, wallet-gated action.
        </p>
        <label className="mt-7 block text-sm font-semibold" htmlFor="usd-input">
          Synthetic USD amount
        </label>
        <div className="mt-2 flex max-w-md items-center rounded-2xl border border-base-300 bg-base-100 p-2 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <span className="px-3 text-lg text-base-content/50">$</span>
          <input
            id="usd-input"
            inputMode="decimal"
            className="min-w-0 w-full bg-transparent px-2 py-3 text-2xl font-semibold outline-none"
            value={usdInput}
            onChange={event => setUsdInput(event.target.value)}
            aria-describedby="usd-help"
          />
          <span className="px-3 text-sm font-semibold text-base-content/50">USD</span>
        </div>
        <p id="usd-help" className="mt-2 text-xs text-base-content/50">
          Enter 0.01–$1,000,000.00. The contract stores cents.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="badge badge-outline gap-1 py-3">
            <InformationCircleIcon className="h-4 w-4" aria-hidden="true" />
            Calculation-only
          </span>
          <span className="badge badge-outline py-3">Source: Chainlink HBAR/USD</span>
        </div>
      </div>

      <div className="min-w-0 rounded-3xl bg-base-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/50">
              Observed reference
            </p>
            <p className="mt-2 text-3xl font-semibold">{preview ? formatPrice(preview[2], preview[3]) : "—"}</p>
            <p className="m-0 text-sm text-base-content/60">USD per HBAR</p>
          </div>
          <div className={`badge ${previewState === "ready" ? "badge-success" : "badge-warning"} py-3`}>
            {previewState === "ready"
              ? "Within policy"
              : previewState === "stale"
                ? "Stale"
                : previewState === "unavailable"
                  ? "Unavailable"
                  : "Checking"}
          </div>
        </div>
        <div className="mt-6 space-y-3">
          <MetricRow label="Reference quantity" value={preview ? formatHbar(preview[5]) : "—"} />
          <MetricRow
            label="Observation age"
            value={observedAge !== undefined && observedAge >= 0n ? `${observedAge.toString()}s` : "—"}
          />
          <MetricRow label="Rounding" value="Ceiling to tinybar" />
          <MetricRow label="Round" value={preview ? preview[1].toString() : "—"} />
        </div>
        <div className="mt-6 border-t border-base-300 pt-4 text-xs leading-5 text-base-content/60">
          <p className="m-0">
            <span className="font-semibold text-base-content/80">Policy:</span>{" "}
            {maxAge ? `${maxAge.toString()} seconds maximum age` : "Loading maximum age"}
          </p>
          <p className="m-0">
            <span className="font-semibold text-base-content/80">Decimals:</span>{" "}
            {decimalsData !== undefined ? String(decimalsData) : "Loading"}
          </p>
          <p className="m-0 break-all">
            <span className="font-semibold text-base-content/80">Feed ID:</span>{" "}
            {feedIdData ? String(feedIdData) : "Loading"}
          </p>
          <p className="m-0 break-all">
            <span className="font-semibold text-base-content/80">Oracle:</span>{" "}
            {oracleData ? String(oracleData) : "Loading"}
          </p>
        </div>
        {previewState === "loading" ? (
          <div role="status" className="mt-5 rounded-xl border border-base-300 bg-base-100 p-3 text-sm">
            Loading reference…
          </div>
        ) : previewState !== "ready" ? (
          <div role="status" className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
            {previewState !== "invalid_amount"
              ? "Reference unavailable or stale. Refresh after the feed has a valid observation."
              : "Enter a valid USD amount to load the reference."}
            {previewState !== "invalid_amount" ? (
              <button className="link ml-1 font-semibold" onClick={() => void refetchPreview()} type="button">
                Refresh
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>

    <div className="mt-8 border-t border-base-300 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="m-0 text-sm font-semibold">Ready to record?</p>
          <p className="m-0 mt-1 text-xs text-base-content/60">
            One signature records the previewed round and nonce. Double clicks stay disabled while pending.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!isConnected ? <RainbowKitCustomConnectButton /> : null}
          {wrongNetwork ? (
            <button
              className="btn btn-warning btn-sm"
              onClick={() => void switchToTestnet()}
              disabled={isSwitching}
              type="button"
            >
              {isSwitching ? "Switching…" : "Switch to Hedera Testnet"}
            </button>
          ) : null}
          {isConnected && !wrongNetwork ? (
            <button
              className="btn btn-primary gap-2"
              onClick={() => void recordQuote()}
              disabled={!canWrite}
              type="button"
            >
              <LockClosedIcon className="h-4 w-4" aria-hidden="true" />
              {isMining ? "Waiting for confirmation…" : txHash ? "Receipt loaded below" : "Record reference quote"}
            </button>
          ) : null}
        </div>
      </div>
      {writeMessage ? (
        <p
          role={writeError ? "alert" : "status"}
          className={`mt-4 rounded-xl border p-3 text-sm ${writeError ? "border-error/40 bg-error/10" : "border-success/40 bg-success/10"}`}
        >
          {writeMessage}
        </p>
      ) : null}
    </div>
  </section>
);
