"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { CheckResultCard } from "./CheckResultCard";
import { ForgePanel } from "./ForgePanel";
import { ProofValue } from "./ProofValue";
import {
  type QuoteFields,
  REGISTRY_ADDRESS,
  type ReceiptProof,
  type StoredComparisonResponse,
  TESTNET_CHAIN_ID,
  comparisonStatusLabel,
  formatHbar,
  formatPrice,
  historicalOracleStatusLabel,
  quoteRecordedAbi,
  serializeReceipt,
  shortHash,
} from "./model";
import { type Hash, type Hex, decodeEventLog } from "viem";
import { usePublicClient } from "wagmi";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  DocumentArrowDownIcon,
  LinkIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { checkTone, shareAutoComparisonKey, showShareCheckPlaceholders } from "~~/utils/quoteCheckVisual";
import {
  FORGE_CASES,
  type ForgeCaseId,
  forgeCheckExplanation,
  forgeReceipt,
  forgeRunReducer,
  forgeScrollOptions,
  initialForgeRunState,
  isHistoricalForgeReceipt,
} from "~~/utils/quoteForge";
import {
  HISTORICAL_HCS_REFERENCE,
  type HcsAnchorReference,
  type HcsAnchorViewStatus,
  displayedHcsAnchorStatus,
  hcsAnchorStatusLabel,
  hcsAnchorViewStatus,
  parseHcsAnchorReference,
  quoteSharePath,
} from "~~/utils/quoteHcsReference";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-hbar";

export const ReceiptProofCard = ({
  txHash,
  requestedReceipt,
}: {
  txHash?: Hash;
  requestedReceipt?: { hash: Hash; anchor?: HcsAnchorReference };
}) => {
  const publicClient = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const [sharedLink, setSharedLink] = useState<{ hash: Hash; anchor?: HcsAnchorReference }>();
  const [status, setStatus] = useState<"idle" | "loading" | "confirmed" | "reverted" | "unavailable">("idle");
  const [proof, setProof] = useState<ReceiptProof>();
  const [comparison, setComparison] = useState<StoredComparisonResponse>();
  const [comparisonError, setComparisonError] = useState<string>();
  const [hcsStatus, setHcsStatus] = useState<HcsAnchorViewStatus>("not_anchored");
  const [isComparing, setIsComparing] = useState(false);
  const [forgeRun, dispatchForgeRun] = useReducer(forgeRunReducer, initialForgeRunState);
  const [copied, setCopied] = useState(false);
  const autoComparedKey = useRef<string | undefined>(undefined);
  const comparisonInFlight = useRef(false);
  const forgeChecksRef = useRef<HTMLDivElement>(null);
  const activeHash = requestedReceipt?.hash ?? txHash ?? sharedLink?.hash;
  const anchorReference = requestedReceipt?.anchor ?? (txHash ? undefined : sharedLink?.anchor);
  const historicalProof = isHistoricalForgeReceipt(proof?.commitment);
  const checkAnchorReference = anchorReference ?? (historicalProof ? HISTORICAL_HCS_REFERENCE : undefined);
  const shareHash = requestedReceipt?.hash ?? (txHash ? undefined : sharedLink?.hash);
  const showCheckingCards =
    isComparing ||
    showShareCheckPlaceholders({
      isShared: Boolean(shareHash),
      isComparing,
      hasResults: Boolean(comparison),
      hasError: Boolean(comparisonError),
      isReverted: status === "reverted",
    });
  const displayedHcsStatus = comparison
    ? displayedHcsAnchorStatus(comparison.localConsistency.status, hcsStatus)
    : hcsStatus;

  useEffect(() => {
    const queryHash = new URLSearchParams(window.location.search).get("tx");
    if (queryHash && /^0x[0-9a-fA-F]{64}$/.test(queryHash)) {
      setSharedLink({ hash: queryHash as Hash, anchor: parseHcsAnchorReference(window.location.search) });
    }
  }, []);

  useEffect(() => {
    setProof(undefined);
    setComparison(undefined);
    setComparisonError(undefined);
    setHcsStatus("not_anchored");
    dispatchForgeRun({ type: "reset" });
    autoComparedKey.current = undefined;
  }, [activeHash]);

  useEffect(() => {
    if (!activeHash || !publicClient) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const loadReceipt = async () => {
      setStatus("loading");
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: activeHash });
        if (cancelled) return;
        if (receipt.status === "reverted") {
          setStatus("reverted");
          return;
        }
        const eventLog = receipt.logs.find(log => log.address.toLowerCase() === REGISTRY_ADDRESS.toLowerCase());
        if (!eventLog) {
          setStatus("unavailable");
          retryTimer = setTimeout(loadReceipt, 8000);
          return;
        }
        const decoded = decodeEventLog({ abi: quoteRecordedAbi, data: eventLog.data, topics: eventLog.topics });
        const args = decoded.args as unknown as { commitment: Hex; quote: QuoteFields };
        setProof({
          commitment: args.commitment,
          quote: args.quote,
          blockNumber: receipt.blockNumber,
          logIndex: eventLog.logIndex,
        });
        setStatus("confirmed");
      } catch {
        if (!cancelled) {
          setStatus("unavailable");
          retryTimer = setTimeout(loadReceipt, 8000);
        }
      }
    };

    void loadReceipt();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [activeHash, publicClient]);

  const sharePath = activeHash ? quoteSharePath(activeHash, anchorReference) : "";
  const shareUrl = typeof window === "undefined" ? sharePath : `${window.location.origin}${sharePath}`;
  const explorerUrl = activeHash ? getBlockExplorerTxLink(TESTNET_CHAIN_ID, activeHash) : "";
  const mirrorUrl = `https://testnet.mirrornode.hedera.com/api/v1/contracts/results/${activeHash}`;

  const copyShareUrl = async () => {
    if (!activeHash) return;
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const downloadReceipt = () => {
    if (!proof || !activeHash) return;
    const blob = new Blob([JSON.stringify(serializeReceipt(proof), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quoteproof-${activeHash.slice(2, 10)}.json`;
    link.click();
    // Give the browser time to consume the blob URL before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const compareStoredReceipt = useCallback(
    async (caseId: ForgeCaseId | null = null, scrollToChecks = false) => {
      if (!proof || !activeHash || comparisonInFlight.current) return;
      comparisonInFlight.current = true;
      dispatchForgeRun({ type: "start", caseId });
      setIsComparing(true);
      setComparison(undefined);
      setComparisonError(undefined);
      setHcsStatus(hcsAnchorViewStatus(checkAnchorReference));
      if (scrollToChecks) {
        window.requestAnimationFrame(() => {
          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          forgeChecksRef.current?.scrollIntoView(forgeScrollOptions(reduceMotion));
        });
      }
      try {
        const receipt = caseId ? forgeReceipt(caseId) : serializeReceipt(proof);
        const comparisonRequest = fetch("/api/quote/compare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ receipt }),
        }).then(async response => {
          const payload = (await response.json()) as StoredComparisonResponse;
          if (!response.ok) throw new Error("The receipt comparison request failed");
          return payload;
        });
        const hcsRequest: Promise<HcsAnchorViewStatus> = checkAnchorReference
          ? fetch("/api/quote/hcs/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                receipt,
                transactionHash: activeHash,
                logIndex: proof.logIndex,
                topicId: checkAnchorReference.topicId,
                sequenceNumber: checkAnchorReference.sequenceNumber,
              }),
            }).then(async response => {
              const payload = (await response.json()) as { hcsAnchor?: { status?: unknown } };
              return hcsAnchorViewStatus(checkAnchorReference, payload.hcsAnchor?.status);
            })
          : Promise.resolve("not_anchored");
        const [comparisonResult, hcsResult] = await Promise.allSettled([comparisonRequest, hcsRequest]);
        if (comparisonResult.status === "fulfilled") {
          setComparison(comparisonResult.value);
        } else {
          setComparisonError("The receipt comparison request failed. Retry the read-only checks.");
        }
        setHcsStatus(hcsResult.status === "fulfilled" ? hcsResult.value : "unavailable");
        dispatchForgeRun({
          type:
            comparisonResult.status === "rejected" || hcsResult.status === "rejected" ? "network_error" : "complete",
        });
      } catch {
        setComparisonError("The receipt comparison request failed. Retry the read-only checks.");
        dispatchForgeRun({ type: "network_error" });
      } finally {
        comparisonInFlight.current = false;
        setIsComparing(false);
      }
    },
    [activeHash, checkAnchorReference, proof],
  );

  useEffect(() => {
    const key = shareAutoComparisonKey(activeHash, shareHash, proof?.commitment);
    if (!key || autoComparedKey.current === key) return;
    autoComparedKey.current = key;
    void compareStoredReceipt();
  }, [activeHash, compareStoredReceipt, proof?.commitment, shareHash]);

  if (!activeHash) return null;

  return (
    <section
      id="receipt-section"
      aria-labelledby="receipt-heading"
      tabIndex={-1}
      className="mt-6 scroll-mt-6 rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Portable proof</p>
          <h2 id="receipt-heading" className="text-xl font-semibold">
            Receipt link
          </h2>
          <p className="mt-2 text-sm text-base-content/70">
            This view can be opened without the original wallet session.
          </p>
        </div>
        <span
          className={`badge ${status === "confirmed" ? "badge-success" : status === "reverted" ? "badge-error" : "badge-warning"} gap-1 py-3`}
        >
          {status === "confirmed" ? <CheckCircleIcon className="h-4 w-4" aria-hidden="true" /> : null}
          {status === "confirmed"
            ? "Confirmed on Hedera testnet"
            : status === "reverted"
              ? "Reverted"
              : "Waiting for receipt / index"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <ProofValue label="Chain" value={`Hedera Testnet · ${TESTNET_CHAIN_ID}`} />
        <ProofValue label="Transaction" value={shortHash(activeHash)} href={explorerUrl} />
        <ProofValue label="Registry" value={REGISTRY_ADDRESS} />
        <ProofValue label="Block" value={proof ? proof.blockNumber.toString() : "Pending"} />
      </div>

      {status === "unavailable" ? (
        <p role="status" className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          The transaction may be confirmed while indexing catches up. This page will check again without sending another
          transaction.
        </p>
      ) : null}
      {status === "reverted" ? (
        <p role="alert" className="mt-4 rounded-xl border border-error/40 bg-error/10 p-3 text-sm">
          The transaction reverted. No receipt is presented as confirmed; review the recovery guidance above.
        </p>
      ) : null}

      {proof ? (
        <div className="mt-5 rounded-2xl border border-success/30 bg-success/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-base-content">
            <ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />
            Event-bound receipt found
          </div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <ProofValue label="Reference" value={`${formatPrice(proof.quote.price, proof.quote.decimals)} per HBAR`} />
            <ProofValue label="Quantity" value={formatHbar(proof.quote.tinybars)} />
            <ProofValue label="Round" value={proof.quote.roundId.toString()} />
            <ProofValue label="Commitment" value={shortHash(proof.commitment)} />
          </div>
          <p className="mt-3 text-xs leading-5 text-base-content/60">
            RPC receipt and{" "}
            <a className="link" href={mirrorUrl} target="_blank" rel="noreferrer">
              Mirror Node result
            </a>{" "}
            are available as independent references. Standalone verification is calculation-checked; it does not replace
            the on-chain state check.
          </p>
        </div>
      ) : null}

      {proof || (shareHash && status !== "reverted") ? (
        <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Four read-only checks
              </p>
              <p className="m-0 text-sm font-semibold">Compare this receipt with the stored issuer / nonce record</p>
              <p className="mt-2 text-xs leading-5 text-base-content/60">
                The results are local consistency, the configured oracle&apos;s exact historical round, the trusted
                Hedera Testnet registry record, and an optional HCS anchor. They never sign or submit a transaction.
              </p>
              <p className="mt-2 text-xs leading-5 text-base-content/60">
                Anyone reads anchors from the public Mirror Node; the trust anchor is the operator account that pays for
                each anchor message.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void compareStoredReceipt(forgeRun.caseId)}
              disabled={!proof || isComparing}
            >
              {isComparing ? "Comparing…" : "Compare stored commitment"}
            </button>
          </div>
          <div ref={forgeChecksRef} className="h-px scroll-mt-24 lg:scroll-mt-6" aria-hidden="true" />
          {forgeRun.caseId ? (
            <p role="status" className="mt-4 rounded-xl border border-error/40 bg-error/10 p-3 text-sm font-semibold">
              Forged copy (simulation) · {FORGE_CASES.find(item => item.id === forgeRun.caseId)?.label}
            </p>
          ) : null}
          {showCheckingCards ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status">
              {["Local consistency", "Recorded state", "Historical oracle", "HCS anchor"].map(label => (
                <CheckResultCard key={label} label={label} text="Running checks…" tone="neutral" />
              ))}
            </div>
          ) : comparison ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CheckResultCard
                label="Local consistency"
                text={comparisonStatusLabel(comparison.localConsistency.status)}
                tone={checkTone(comparison.localConsistency.status)}
              >
                {comparison.localConsistency.errors.length > 0 ? (
                  <p className="mt-2 m-0 text-xs leading-5 text-error">
                    {comparison.localConsistency.errors.join("; ")}
                  </p>
                ) : null}
                {forgeRun.caseId && forgeCheckExplanation("local", comparison.localConsistency.status) ? (
                  <p className="mt-2 text-xs leading-5 text-base-content/80">
                    {forgeCheckExplanation("local", comparison.localConsistency.status)}
                  </p>
                ) : null}
              </CheckResultCard>
              <CheckResultCard
                label="Recorded state"
                text={comparisonStatusLabel(comparison.recordedComparison.status)}
                tone={checkTone(comparison.recordedComparison.status)}
              >
                {comparison.recordedComparison.error ? (
                  <p className="mt-2 m-0 text-xs leading-5 text-error">{comparison.recordedComparison.error}</p>
                ) : null}
                {forgeRun.caseId && forgeCheckExplanation("stored", comparison.recordedComparison.status) ? (
                  <p className="mt-2 text-xs leading-5 text-base-content/80">
                    {forgeCheckExplanation("stored", comparison.recordedComparison.status)}
                  </p>
                ) : null}
              </CheckResultCard>
              <CheckResultCard
                label="Historical oracle"
                text={historicalOracleStatusLabel(comparison.historicalOracle.status)}
                tone={checkTone(comparison.historicalOracle.status)}
              >
                <p className="mt-2 m-0 text-xs leading-5 text-base-content/60">
                  Round {comparison.historicalOracle.requestedRoundId}
                  {comparison.historicalOracle.returnedRoundId
                    ? ` · returned ${comparison.historicalOracle.returnedRoundId}`
                    : ""}
                  {comparison.historicalOracle.currentDecimals
                    ? ` · current decimals ${comparison.historicalOracle.currentDecimals}`
                    : ""}
                </p>
                {comparison.historicalOracle.error ? (
                  <p className="mt-2 m-0 text-xs leading-5 text-error">{comparison.historicalOracle.error}</p>
                ) : null}
                {forgeRun.caseId && forgeCheckExplanation("oracle", comparison.historicalOracle.status) ? (
                  <p className="mt-2 text-xs leading-5 text-base-content/80">
                    {forgeCheckExplanation("oracle", comparison.historicalOracle.status)}
                  </p>
                ) : null}
              </CheckResultCard>
              <CheckResultCard
                label="HCS anchor"
                text={hcsAnchorStatusLabel(displayedHcsStatus)}
                tone={checkTone(displayedHcsStatus)}
              >
                {checkAnchorReference ? (
                  <a
                    className="mt-2 block text-xs leading-5 link"
                    href={`https://testnet.mirrornode.hedera.com/api/v1/topics/${checkAnchorReference.topicId}/messages/${checkAnchorReference.sequenceNumber}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Topic {checkAnchorReference.topicId} · message {checkAnchorReference.sequenceNumber}
                  </a>
                ) : null}
                {forgeRun.caseId && forgeCheckExplanation("hcs", displayedHcsStatus) ? (
                  <p className="mt-2 text-xs leading-5 text-base-content/80">
                    {forgeCheckExplanation("hcs", displayedHcsStatus)}
                  </p>
                ) : null}
              </CheckResultCard>
            </div>
          ) : null}
          {historicalProof ? (
            <ForgePanel forgeRun={forgeRun} isComparing={isComparing} compareStoredReceipt={compareStoredReceipt} />
          ) : null}
          {comparisonError ? <p className="mt-3 m-0 text-xs text-error">{comparisonError}</p> : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-outline gap-2" onClick={() => void copyShareUrl()}>
          <LinkIcon className="h-4 w-4" aria-hidden="true" />
          {copied ? "Copied" : "Copy share link"}
        </button>
        <button type="button" className="btn btn-sm btn-outline gap-2" onClick={downloadReceipt} disabled={!proof}>
          <DocumentArrowDownIcon className="h-4 w-4" aria-hidden="true" />
          Export receipt JSON
        </button>
        {explorerUrl ? (
          <a className="btn btn-sm btn-ghost gap-2" href={explorerUrl} target="_blank" rel="noreferrer">
            Open transaction <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </section>
  );
};
