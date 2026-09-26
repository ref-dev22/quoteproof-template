const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) throw new Error("PLAYWRIGHT_MODULE must point to the CI-only Playwright installation");
const { webkit, devices } = require(playwrightModule);

const baseUrl = (process.env.BASE_URL || "https://quoteproof-judge-preview.vercel.app").replace(/\/$/, "");
const fourGreenLimitMs = Number(process.env.FOUR_GREEN_LIMIT_MS || 8_000);
const checkTimeoutMs = Number(process.env.CHECK_TIMEOUT_MS || 15_000);
if (!Number.isFinite(fourGreenLimitMs) || fourGreenLimitMs <= 0) throw new Error("Invalid FOUR_GREEN_LIMIT_MS");
if (!Number.isFinite(checkTimeoutMs) || checkTimeoutMs <= 0) throw new Error("Invalid CHECK_TIMEOUT_MS");
const shareUrl =
  `${baseUrl}/?tx=0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9&hcsTopic=0.0.10698279&hcsSeq=1`;
const labels = ["Local consistency", "Recorded state", "Historical oracle", "HCS anchor"];
const cases = [
  { name: "tinybar", button: "Add 1 tinybar", states: ["error", "neutral", "neutral", "neutral"] },
  {
    name: "amount",
    button: "Change $1.00 to $10.00 and recompute the fingerprint",
    states: ["success", "error", "success", "error"],
  },
  {
    name: "price",
    button: "Double the oracle price and recompute the fingerprint",
    states: ["success", "error", "error", "error"],
  },
];
const allGreen = ["success", "success", "success", "success"];
const artifacts = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd(), "judge-browser-artifacts");
fs.mkdirSync(artifacts, { recursive: true });

function card(page, label) {
  return page.getByText(label, { exact: true }).locator("xpath=..");
}

async function waitForStates(page, states, timeoutMs = checkTimeoutMs) {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const actual = await Promise.all(labels.map(label => card(page, label).getAttribute("data-check-state").catch(() => null)));
    if (actual.every((state, index) => state === states[index])) return;
    if (performance.now() >= deadline) {
      throw new Error(`Expected ${states.join("/")}; found ${actual.join("/")}`);
    }
    await page.waitForTimeout(75);
  }
}

async function waitForBannerInViewport(page, banner) {
  const deadline = performance.now() + 3_000;
  for (;;) {
    const box = await banner.boundingBox();
    const viewport = page.viewportSize();
    if (
      box &&
      viewport &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= viewport.width &&
      box.y + box.height <= viewport.height
    ) {
      return;
    }
    if (performance.now() >= deadline) {
      throw new Error("Forged copy banner did not scroll into the 390px viewport");
    }
    await page.waitForTimeout(75);
  }
}

async function screenshot(page, theme, state) {
  await page.screenshot({ path: path.join(artifacts, theme, `${state}.png`), scale: "css" });
}

async function runAttempt(browser, theme, attempt) {
  const themeDir = path.join(artifacts, theme);
  fs.mkdirSync(themeDir, { recursive: true });
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), `quoteproof-${theme}-${attempt}-`));
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 390, height: 844 },
    colorScheme: theme,
    recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  const video = page.video();
  let fourGreenMs;
  try {
    if (page.viewportSize()?.width !== 390) throw new Error("iPhone viewport is not 390px wide");
    const started = performance.now();
    await page.goto(shareUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try {
      await waitForStates(page, allGreen);
      fourGreenMs = Math.round(performance.now() - started);
    } catch (error) {
      fourGreenMs = Math.round(performance.now() - started);
      throw error;
    }
    await screenshot(page, theme, "genuine");
    if (fourGreenMs > fourGreenLimitMs) throw new Error(`Four green checks took ${fourGreenMs}ms, above ${fourGreenLimitMs}ms`);
    const actualTheme = await page.locator("html").getAttribute("data-theme");
    const prefersDark = await page.evaluate(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (actualTheme !== theme || prefersDark !== (theme === "dark")) {
      throw new Error(`Expected ${theme} theme and matching colorScheme; found ${actualTheme}`);
    }

    for (const item of cases) {
      await page.getByRole("button", { name: item.button, exact: true }).click();
      const banner = page.getByRole("status").filter({ hasText: "Forged copy (simulation)" });
      await banner.waitFor({ state: "visible", timeout: 5_000 });
      await waitForBannerInViewport(page, banner);
      await waitForStates(page, item.states);
      await screenshot(page, theme, item.name);
    }

    await page.getByRole("button", { name: "Restore original", exact: true }).click();
    await waitForStates(page, allGreen);
    if (await page.getByRole("status").filter({ hasText: "Forged copy (simulation)" }).count()) {
      throw new Error("Forged copy banner remained after Restore original");
    }
    await screenshot(page, theme, "restored");
    return { fourGreenMs };
  } catch (error) {
    error.fourGreenMs = fourGreenMs;
    await page.screenshot({ path: path.join(themeDir, "failure.png"), scale: "css" }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    if (video) await video.saveAs(path.join(themeDir, "flow.webm"));
  }
}

function safeDetail(error) {
  return String(error?.message || error).replace(/[|\r\n]/g, " ").slice(0, 180);
}

async function main() {
  const rows = [
    "## WebKit iPhone judge flow",
    "",
    `390px iPhone 13 emulation. Base URL: ${baseUrl}. No cookies, tokens, or bypass headers. One retry per theme. Four-green limit: ${fourGreenLimitMs}ms. Historical checks require the published reference registry.`,
    "",
    "| Theme | Attempt | Four green | Result |",
    "|---|---:|---:|---|",
  ];
  const failures = [];
  const browser = await webkit.launch({ headless: true });
  try {
    for (const theme of ["light", "dark"]) {
      let passed = false;
      for (const attempt of [1, 2]) {
        try {
          const result = await runAttempt(browser, theme, attempt);
          rows.push(`| ${theme} | ${attempt} | ${result.fourGreenMs}ms | PASS: genuine → three forgeries → restored |`);
          passed = true;
          break;
        } catch (error) {
          const timing = error.fourGreenMs === undefined ? "not reached" : `${error.fourGreenMs}ms`;
          rows.push(`| ${theme} | ${attempt} | ${timing} | FAIL: ${safeDetail(error)} |`);
        }
      }
      if (!passed) failures.push(theme);
    }
  } finally {
    await browser.close();
    const summary = `${rows.join("\n")}\n`;
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    process.stdout.write(summary);
  }
  if (failures.length) throw new Error(`Browser flow failed after one retry: ${failures.join(", ")}`);
}

main().catch(error => {
  console.error(safeDetail(error));
  process.exitCode = 1;
});
