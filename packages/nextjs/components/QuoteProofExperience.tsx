"use client";

import { useEffect, useMemo, useState } from "react";
import { FailureExercises } from "./quoteproof/FailureExercises";
import { Hero } from "./quoteproof/Hero";
import { PreviewRecordCard } from "./quoteproof/PreviewRecordCard";
import { ReceiptProofCard } from "./quoteproof/ReceiptProofCard";
import { TrustNotes } from "./quoteproof/TrustNotes";
import {
  HISTORICAL_TX,
  type PreviewQuote,
  TESTNET_CHAIN_ID,
  normalizePreviewQuote,
  parseUsdToCents,
} from "./quoteproof/model";
import { useQuery } from "@tanstack/react-query";
import { type Hash, zeroAddress } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-hbar";
import { previewDisplayState } from "~~/utils/quoteCheckVisual";
import { HISTORICAL_HCS_REFERENCE, type HcsAnchorReference, quoteSharePath } from "~~/utils/quoteHcsReference";
import { canWriteQuote, friendlyWriteError } from "~~/utils/quoteWrite";

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
      <Hero openHistoricalReceipt={openHistoricalReceipt} />
      <main className="mx-auto -mt-8 w-full max-w-5xl px-5 pb-16">
        <PreviewRecordCard
          usdInput={usdInput}
          setUsdInput={setUsdInput}
          preview={preview}
          previewState={previewState}
          observedAge={observedAge}
          maxAge={maxAge}
          decimalsData={decimalsData}
          feedIdData={feedIdData}
          oracleData={oracleData}
          refetchPreview={refetchPreview}
          isConnected={isConnected}
          wrongNetwork={wrongNetwork}
          switchToTestnet={switchToTestnet}
          isSwitching={isSwitching}
          recordQuote={recordQuote}
          canWrite={canWrite}
          isMining={isMining}
          txHash={txHash}
          writeMessage={writeMessage}
          writeError={writeError}
        />
        <ReceiptProofCard txHash={txHash} requestedReceipt={requestedReceipt} />
        <TrustNotes />
        <FailureExercises />
      </main>
    </div>
  );
};

export { QuoteProofExperience };
