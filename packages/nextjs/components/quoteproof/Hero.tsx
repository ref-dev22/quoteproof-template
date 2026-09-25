"use client";

import { HAS_REFERENCE_REGISTRY, TESTNET_CHAIN_ID } from "./model";

export const Hero = ({ openHistoricalReceipt }: { openHistoricalReceipt: () => void }) => (
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
          Preview a bounded USD-to-HBAR reference from the configured Chainlink feed, then record one portable receipt
          when the wallet is ready.
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
);
