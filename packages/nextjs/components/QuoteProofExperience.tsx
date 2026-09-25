"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import referenceReceipt from "../../../examples/receipt-testnet.json";
import { useQuery } from "@tanstack/react-query";
import { type Hash, type Hex, decodeEventLog, formatUnits, zeroAddress } from "viem";
import { hederaTestnet } from "viem/chains";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  DocumentArrowDownIcon,
  InformationCircleIcon,
  LinkIcon,
  LockClosedIcon,
  MinusCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-hbar";
import { getQuoteProofRegistryAddress } from "~~/contracts/quoteProofContext";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-hbar";
import {
  type CheckTone,
  checkTone,
  previewDisplayState,
  shareAutoComparisonKey,
  showShareCheckPlaceholders,
} from "~~/utils/quoteCheckVisual";
import {
  HISTORICAL_HCS_REFERENCE,
  type HcsAnchorReference,
  type HcsAnchorViewStatus,
  hcsAnchorStatusLabel,
  hcsAnchorViewStatus,
  parseHcsAnchorReference,
  quoteSharePath,
} from "~~/utils/quoteHcsReference";
import { canWriteQuote, friendlyWriteError } from "~~/utils/quoteWrite";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-hbar";

const TESTNET_CHAIN_ID = hederaTestnet.id;
const MAX_CENTS = 100_000_000n;
const REGISTRY_ADDRESS = getQuoteProofRegistryAddress();
const HISTORICAL_TX = "0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9";
const HAS_REFERENCE_REGISTRY = REGISTRY_ADDRESS.toLowerCase() === referenceReceipt.registry.toLowerCase();

const quoteRecordedAbi = [
  {
    type: "event",
    name: "QuoteRecorded",
    anonymous: false,
    inputs: [
      { indexed: true, name: "commitment", type: "bytes32" },
      {
        indexed: false,
        name: "quote",
        type: "tuple",
        components: [
          { name: "schemaVersion", type: "uint256" },
          { name: "chainId", type: "uint256" },
          { name: "registry", type: "address" },
          { name: "issuer", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "cents", type: "uint256" },
          { name: "oracle", type: "address" },
          { name: "feedId", type: "bytes32" },
          { name: "roundId", type: "uint80" },
          { name: "price", type: "uint256" },
          { name: "decimals", type: "uint8" },
          { name: "observedAt", type: "uint256" },
          { name: "recordedAt", type: "uint256" },
          { name: "maximumAge", type: "uint256" },
          { name: "tinybars", type: "uint256" },
        ],
      },
    ],
  },
] as const;

type PreviewQuote = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

type QuoteFields = {
  schemaVersion: bigint;
  chainId: bigint;
  registry: Hex;
  issuer: Hex;
  nonce: bigint;
  cents: bigint;
  oracle: Hex;
  feedId: Hex;
  roundId: bigint;
  price: bigint;
  decimals: bigint;
  observedAt: bigint;
  recordedAt: bigint;
  maximumAge: bigint;
  tinybars: bigint;
};

type ReceiptProof = {
  commitment: Hex;
  quote: QuoteFields;
  blockNumber: bigint;
  logIndex: number;
};

type StoredComparisonResponse = {
  localConsistency: {
    status: "valid" | "invalid" | "wrong_context";
    errors: string[];
  };
  recordedComparison: {
    status: "match" | "mismatch" | "not_found" | "wrong_context" | "wrong_network" | "provider_error" | "not_run";
    storedCommitment?: string;
    error?: string;
    providerChainId?: string;
  };
  historicalOracle: {
    status: "match" | "mismatch" | "unavailable" | "not_checked";
    requestedRoundId: string;
    returnedRoundId?: string;
    returnedPrice?: string;
    returnedObservedAt?: string;
    currentDecimals?: string;
    error?: string;
  };
};

function normalizePreviewQuote(data: unknown): PreviewQuote | undefined {
  if (Array.isArray(data) && data.length >= 6) {
    const values = data.slice(0, 6);
    if (values.every(value => typeof value === "bigint")) return values as unknown as PreviewQuote;
  }
  if (!data || typeof data !== "object") return undefined;
  const named = data as Record<string, unknown>;
  const values = [named.nonce, named.roundId, named.price, named.decimals, named.observedAt, named.tinybars];
  if (values.every(value => typeof value === "bigint")) return values as unknown as PreviewQuote;
  const indexed = [named[0], named[1], named[2], named[3], named[4], named[5]];
  if (indexed.every(value => typeof value === "bigint")) return indexed as unknown as PreviewQuote;
  return named.result ? normalizePreviewQuote(named.result) : undefined;
}

function parseUsdToCents(value: string): bigint | undefined {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) return undefined;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents >= 1n && cents <= MAX_CENTS ? cents : undefined;
}

function formatHbar(tinybars: bigint): string {
  return `${Number(formatUnits(tinybars, 8)).toLocaleString(undefined, { maximumFractionDigits: 8 })} HBAR`;
}

function formatPrice(price: bigint, decimals: bigint): string {
  return `$${Number(formatUnits(price, Number(decimals))).toFixed(6)}`;
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function comparisonStatusLabel(status: StoredComparisonResponse["recordedComparison"]["status"] | "valid" | "invalid") {
  return {
    valid: "Locally consistent",
    invalid: "Local checks failed",
    match: "Stored commitment matches",
    mismatch: "Stored commitment differs",
    not_found: "No stored commitment",
    wrong_context: "Trusted context rejected",
    wrong_network: "Provider network rejected",
    provider_error: "Provider unavailable",
    not_run: "Not run",
  }[status];
}

function historicalOracleStatusLabel(status: StoredComparisonResponse["historicalOracle"]["status"]) {
  return {
    match: "Historical observation matches",
    mismatch: "Historical observation differs",
    unavailable: "Historical observation unavailable",
    not_checked: "Not checked",
  }[status];
}

const CheckResultCard = ({
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

function serializeReceipt(proof: ReceiptProof): Record<string, string> {
  return {
    schemaVersion: proof.quote.schemaVersion.toString(),
    chainId: proof.quote.chainId.toString(),
    registry: proof.quote.registry,
    issuer: proof.quote.issuer,
    nonce: proof.quote.nonce.toString(),
    cents: proof.quote.cents.toString(),
    oracle: proof.quote.oracle,
    feedId: proof.quote.feedId,
    roundId: proof.quote.roundId.toString(),
    price: proof.quote.price.toString(),
    decimals: proof.quote.decimals.toString(),
    observedAt: proof.quote.observedAt.toString(),
    recordedAt: proof.quote.recordedAt.toString(),
    maximumAge: proof.quote.maximumAge.toString(),
    tinybars: proof.quote.tinybars.toString(),
    commitment: proof.commitment,
  };
}

const FailureExercises = () => (
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

const ReceiptProofCard = ({
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
  const [copied, setCopied] = useState(false);
  const autoComparedKey = useRef<string | undefined>(undefined);
  const comparisonInFlight = useRef(false);
  const activeHash = requestedReceipt?.hash ?? txHash ?? sharedLink?.hash;
  const anchorReference = requestedReceipt?.anchor ?? (txHash ? undefined : sharedLink?.anchor);
  const shareHash = requestedReceipt?.hash ?? (txHash ? undefined : sharedLink?.hash);
  const showCheckingCards = showShareCheckPlaceholders({
    isShared: Boolean(shareHash),
    isComparing,
    hasResults: Boolean(comparison),
    hasError: Boolean(comparisonError),
    isReverted: status === "reverted",
  });

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

  const compareStoredReceipt = useCallback(async () => {
    if (!proof || !activeHash || comparisonInFlight.current) return;
    comparisonInFlight.current = true;
    setIsComparing(true);
    setComparison(undefined);
    setComparisonError(undefined);
    setHcsStatus(hcsAnchorViewStatus(anchorReference));
    try {
      const receipt = serializeReceipt(proof);
      const response = await fetch("/api/quote/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receipt }),
      });
      const payload = (await response.json()) as StoredComparisonResponse;
      if (!response.ok) throw new Error("The receipt comparison request failed");
      setComparison(payload);
      if (anchorReference) {
        try {
          const hcsResponse = await fetch("/api/quote/hcs/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              receipt,
              transactionHash: activeHash,
              logIndex: proof.logIndex,
              topicId: anchorReference.topicId,
              sequenceNumber: anchorReference.sequenceNumber,
            }),
          });
          const hcsPayload = (await hcsResponse.json()) as { hcsAnchor?: { status?: unknown } };
          setHcsStatus(hcsAnchorViewStatus(anchorReference, hcsPayload.hcsAnchor?.status));
        } catch {
          setHcsStatus("unavailable");
        }
      }
    } catch (error) {
      setComparisonError(error instanceof Error ? error.message : "The receipt comparison request failed");
    } finally {
      comparisonInFlight.current = false;
      setIsComparing(false);
    }
  }, [activeHash, anchorReference, proof]);

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
          <div className="flex items-center gap-2 text-sm font-semibold text-success-content">
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
              onClick={() => void compareStoredReceipt()}
              disabled={!proof || isComparing}
            >
              {isComparing ? "Comparing…" : "Compare stored commitment"}
            </button>
          </div>
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
              </CheckResultCard>
              <CheckResultCard
                label="Recorded state"
                text={comparisonStatusLabel(comparison.recordedComparison.status)}
                tone={checkTone(comparison.recordedComparison.status)}
              >
                {comparison.recordedComparison.error ? (
                  <p className="mt-2 m-0 text-xs leading-5 text-error">{comparison.recordedComparison.error}</p>
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
              </CheckResultCard>
              <CheckResultCard label="HCS anchor" text={hcsAnchorStatusLabel(hcsStatus)} tone={checkTone(hcsStatus)}>
                {anchorReference ? (
                  <a
                    className="mt-2 block text-xs leading-5 link"
                    href={`https://testnet.mirrornode.hedera.com/api/v1/topics/${anchorReference.topicId}/messages/${anchorReference.sequenceNumber}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Topic {anchorReference.topicId} · message {anchorReference.sequenceNumber}
                  </a>
                ) : null}
              </CheckResultCard>
            </div>
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

const ProofValue = ({ label, value, href }: { label: string; value: string; href?: string }) => (
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

const QuoteProofExperience = () => {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [usdInput, setUsdInput] = useState("1.00");
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [txHash, setTxHash] = useState<Hash>();
  const [requestedReceipt, setRequestedReceipt] = useState<{ hash: Hash; anchor?: HcsAnchorReference }>();
  const [writeMessage, setWriteMessage] = useState<string>();
  const [writeError, setWriteError] = useState(false);
  const cents = useMemo(() => parseUsdToCents(usdInput), [usdInput]);
  const {
    data: previewData,
    isFetched: hasPreviewFetched,
    error: previewError,
    refetch: refetchPreview,
  } = useQuery({
    queryKey: ["quoteproof-preview", cents?.toString()],
    queryFn: async () => {
      if (cents === undefined) throw new Error("Preview client unavailable");
      const response = await fetch(`/api/quote/preview?cents=${cents.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as Record<string, string>;
      if (!response.ok) throw new Error(payload.error || "Reference unavailable");
      return {
        nonce: BigInt(payload.nonce),
        roundId: BigInt(payload.roundId),
        price: BigInt(payload.price),
        decimals: BigInt(payload.decimals),
        observedAt: BigInt(payload.observedAt),
        tinybars: BigInt(payload.tinybars),
      };
    },
    enabled: cents !== undefined,
    refetchInterval: 10_000,
  });
  const { data: nonceData } = useScaffoldReadContract({
    contractName: "QuoteProofRegistry",
    functionName: "nonces",
    args: [address ?? zeroAddress],
    chainId: TESTNET_CHAIN_ID,
  });
  const { data: oracleData } = useScaffoldReadContract({
    contractName: "QuoteProofRegistry",
    functionName: "oracle",
    chainId: TESTNET_CHAIN_ID,
  });
  const { data: decimalsData } = useScaffoldReadContract({
    contractName: "QuoteProofRegistry",
    functionName: "expectedDecimals",
    chainId: TESTNET_CHAIN_ID,
  });
  const { data: maxAgeData } = useScaffoldReadContract({
    contractName: "QuoteProofRegistry",
    functionName: "maxAge",
    chainId: TESTNET_CHAIN_ID,
  });
  const { data: feedIdData } = useScaffoldReadContract({
    contractName: "QuoteProofRegistry",
    functionName: "FEED_ID",
    chainId: TESTNET_CHAIN_ID,
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({
    contractName: "QuoteProofRegistry",
    chainId: TESTNET_CHAIN_ID,
  });

  const rawPreview = normalizePreviewQuote(previewData);
  const preview = rawPreview
    ? ([
        address && typeof nonceData === "bigint" ? nonceData : rawPreview[0],
        rawPreview[1],
        rawPreview[2],
        rawPreview[3],
        rawPreview[4],
        rawPreview[5],
      ] as PreviewQuote)
    : undefined;
  const maxAge = typeof maxAgeData === "bigint" ? maxAgeData : undefined;
  const observedAge = preview ? BigInt(nowSeconds) - preview[4] : undefined;
  const isFresh = observedAge !== undefined && observedAge >= 0n && (!maxAge || observedAge <= maxAge);
  const previewState = previewDisplayState({
    hasValidAmount: cents !== undefined,
    hasFetched: hasPreviewFetched,
    hasPreview: Boolean(preview),
    hasError: Boolean(previewError),
    isFresh,
  });
  const wrongNetwork = isConnected && chainId !== TESTNET_CHAIN_ID;
  const canWrite = canWriteQuote({
    hasPreview: previewState === "ready",
    hasCents: cents !== undefined,
    isConnected,
    hasNonce: typeof nonceData === "bigint",
    wrongNetwork,
    isMining,
    hasTxHash: Boolean(txHash),
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!requestedReceipt) return;
    const frame = window.requestAnimationFrame(() => {
      const section = document.getElementById("receipt-section");
      if (!section) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      section.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [requestedReceipt]);

  const openHistoricalReceipt = () => {
    window.history.replaceState({}, "", quoteSharePath(HISTORICAL_TX, HISTORICAL_HCS_REFERENCE));
    setRequestedReceipt({ hash: HISTORICAL_TX as Hash, anchor: HISTORICAL_HCS_REFERENCE });
  };

  const switchToTestnet = async () => {
    try {
      await switchChainAsync({ chainId: TESTNET_CHAIN_ID });
      setWriteMessage(undefined);
      setWriteError(false);
    } catch {
      setWriteMessage("Network switch was not completed. Select Hedera Testnet in your wallet to continue.");
      setWriteError(true);
    }
  };

  const recordQuote = async () => {
    if (
      !canWriteQuote({
        hasPreview: previewState === "ready",
        hasCents: cents !== undefined,
        isConnected,
        hasNonce: typeof nonceData === "bigint",
        wrongNetwork,
        isMining,
        hasTxHash: Boolean(txHash),
      }) ||
      !preview ||
      cents === undefined
    ) {
      return;
    }
    setWriteMessage(undefined);
    setWriteError(false);
    try {
      const hash = await writeContractAsync({ functionName: "createQuote", args: [cents, preview[1], preview[0]] });
      if (hash) {
        setRequestedReceipt(undefined);
        setTxHash(hash);
        window.history.replaceState({}, "", `/?tx=${hash}`);
        setWriteMessage("The transaction is confirmed. Loading the event-bound receipt below.");
      }
    } catch (error) {
      setWriteMessage(friendlyWriteError(error));
      setWriteError(true);
    }
  };

  return (
    <div className="flex grow flex-col bg-base-200">
      <section className="hedera-gradient px-5 pb-10 pt-6 text-white sm:pb-20 sm:pt-14">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="badge border-white/20 bg-white/10 py-4 text-white">QuoteProof</span>
            <div className="rounded-full border border-white/20 bg-black/10 px-3 py-1 text-xs font-medium">
              <span className="sm:hidden">Testnet · {TESTNET_CHAIN_ID}</span>
              <span className="hidden sm:inline">Hedera Testnet · chain {TESTNET_CHAIN_ID}</span>
            </div>
          </div>
          <div className="mt-5 max-w-3xl sm:mt-12">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-white/70 sm:mb-4">
              Reference quotes, made legible
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-6xl">
              See the quote before you write it.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-6 text-white/80 sm:mt-5 sm:text-lg sm:leading-7">
              Preview a bounded USD-to-HBAR reference from the configured Chainlink feed, then record one portable
              receipt when the wallet is ready.
            </p>
            <nav
              aria-label="Explore QuoteProof"
              className="mt-5 flex flex-wrap gap-x-3 gap-y-2 text-xs font-semibold sm:mt-7 sm:gap-x-5 sm:text-sm"
            >
              {HAS_REFERENCE_REGISTRY && (
                <button
                  aria-label="Historical testnet receipt"
                  className="underline decoration-white/50 underline-offset-4 hover:decoration-white"
                  type="button"
                  onClick={openHistoricalReceipt}
                >
                  Receipt
                </button>
              )}
              <a
                className="underline decoration-white/50 underline-offset-4 hover:decoration-white"
                href="https://github.com/ref-dev22/quoteproof-template"
                rel="noopener noreferrer"
                target="_blank"
              >
                Public source
              </a>
            </nav>
          </div>
        </div>
      </section>

      <main className="mx-auto -mt-8 w-full max-w-5xl px-5 pb-16">
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
                    {isMining
                      ? "Waiting for confirmation…"
                      : txHash
                        ? "Receipt loaded below"
                        : "Record reference quote"}
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

        <ReceiptProofCard txHash={txHash} requestedReceipt={requestedReceipt} />

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

        <FailureExercises />
      </main>
    </div>
  );
};

const MetricRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-base-content/60">{label}</span>
    <span className="text-right font-semibold">{value}</span>
  </div>
);

export { QuoteProofExperience };
