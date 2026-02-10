const puppeteer = require("puppeteer");
const fs = require("fs");

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}

async function debugDump(page, label) {
  const safe = label.replace(/[^a-z0-9_-]/gi, "_");
  try {
    const url = page.url();
    const title = await page.title();
    const html = await page.content();
    console.log(`[DEBUG:${safe}] url=${url}`);
    console.log(`[DEBUG:${safe}] title=${title}`);
    console.log(`[DEBUG:${safe}] html_head=${html.slice(0, 400).replace(/\s+/g, " ")}`);
    fs.writeFileSync(`/app/debug_${safe}.html`, html);
    await page.screenshot({ path: `/app/debug_${safe}.png`, fullPage: true });
    console.log(`[DEBUG:${safe}] wrote /app/debug_${safe}.html and /app/debug_${safe}.png`);
  } catch (e) {
    console.log(`[DEBUG:${safe}] dump failed`, e);
  }
}

async function logVisibleCandidateTexts(frameOrPage, label) {
  try {
    const result = await frameOrPage.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll(
          "button, a, [role='button'], input[type='button'], input[type='submit']"
        )
      );

      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0"
        );
      };

      const texts = [];
      for (const el of els) {
        if (!isVisible(el)) continue;
        const text =
          el.tagName === "INPUT"
            ? (el.value || "").trim()
            : (el.textContent || "").trim();
        if (text) texts.push(text.slice(0, 80));
        if (texts.length >= 60) break;
      }
      return texts;
    });

    console.log(`[DEBUG:${label}] visible clickable texts (${result.length}):`);
    console.log(result.map((t) => `  - ${t}`).join("\n") || "  (none)");
  } catch (e) {
    console.log(`[DEBUG:${label}] failed to list visible texts`, e);
  }
}

async function clickFirstByText(frameOrPage, regex) {
  const clicked = await frameOrPage.evaluate((pattern) => {
    const re = new RegExp(pattern, "i");
    const candidates = Array.from(
      document.querySelectorAll(
        "button, a, [role='button'], input[type='button'], input[type='submit']"
      )
    );

    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0"
      );
    };

    for (const el of candidates) {
      const text =
        el.tagName === "INPUT"
          ? (el.value || "").trim()
          : (el.textContent || "").trim();

      if (re.test(text) && isVisible(el) && !el.disabled) {
        el.scrollIntoView({ block: "center" });
        el.click();
        return { ok: true, text };
      }
    }
    return { ok: false };
  }, regex.source);

  return clicked;
}

async function clickByTextAnyFrame(page, regex, label) {
  // Try main page
  let res = await clickFirstByText(page, regex);
  if (res.ok) {
    console.log(`[${label}] clicked on main page: "${res.text}"`);
    return res;
  }

  // Try frames
  const frames = page.frames();
  console.log(`[${label}] not on main page, scanning ${frames.length} frames...`);
  for (const frame of frames) {
    try {
      res = await clickFirstByText(frame, regex);
      if (res.ok) {
        console.log(`[${label}] clicked in frame ${frame.url()}: "${res.text}"`);
        return res;
      }
    } catch {
      // ignore frame eval errors
    }
  }

  return { ok: false };
}

async function renewServer() {
  const EMAIL = process.env.PANEL_EMAIL;
  const PASS = process.env.PANEL_PASSWORD;
  const RENEW_URL = process.env.RENEW_PAGE_URL;

  if (!EMAIL || !PASS || !RENEW_URL) {
    throw new Error("Missing env: PANEL_EMAIL, PANEL_PASSWORD, RENEW_PAGE_URL");
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    console.log(`[RENEW] Opening: ${RENEW_URL}`);
    await page.goto(RENEW_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await debugDump(page, "renew_after_goto");

    // Detect common bot-check pages
    const title = await page.title();
    if ((title || "").toLowerCase().includes("just a moment")) {
      await logVisibleCandidateTexts(page, "botcheck_main");
      throw new Error("Blocked by bot-check (page title 'Just a moment...'). Renew cannot be automated here.");
    }

    // Detect login form
    const hasLogin = await page.evaluate(() => {
      const email =
        document.querySelector("input[type='email']") ||
        document.querySelector("input[name='email']") ||
        document.querySelector("input[autocomplete='email']");
      const pass =
        document.querySelector("input[type='password']") ||
        document.querySelector("input[name='password']");
      return Boolean(email && pass);
    });

    if (hasLogin) {
      console.log("[RENEW] Login form detected, logging in...");

      await page.type(
        "input[type='email'], input[name='email'], input[autocomplete='email']",
        EMAIL,
        { delay: 10 }
      );
      await page.type("input[type='password'], input[name='password']", PASS, {
        delay: 10,
      });

      // Submit (try text, else Enter)
      let submit = await clickByTextAnyFrame(page, /sign in|log in|login|continue|submit/i, "LOGIN");
      if (!submit.ok) {
        await page.keyboard.press("Enter");
      }

      await page.waitForTimeout(2500);
      await page.goto(RENEW_URL, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);

      await debugDump(page, "renew_after_login");
    }

    // Try to surface the renew UI by scrolling
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);

    // Log what buttons we *can* see (critical for figuring out the real label)
    await logVisibleCandidateTexts(page, "renew_visible_texts_main");
    // Also log in frames
    for (const [i, frame] of page.frames().entries()) {
      await logVisibleCandidateTexts(frame, `renew_visible_texts_frame_${i}`);
    }

    await debugDump(page, "renew_before_click");

    // Click renew (expand patterns)
    const renewClicked = await clickByTextAnyFrame(
      page,
      /renew|extend|activate|claim|reset timer|keep alive|re-?new|continue|resume/i,
      "RENEW"
    );

    if (!renewClicked.ok) {
      await debugDump(page, "renew_button_not_found");
      throw new Error("Could not find a visible Renew button on the renew page.");
    }

    // Optional confirmation
    await page.waitForTimeout(800);
    const confirmClicked = await clickByTextAnyFrame(
      page,
      /confirm|yes|ok|continue|proceed/i,
      "CONFIRM"
    );

    if (confirmClicked.ok) {
      await page.waitForTimeout(800);
    }

    await debugDump(page, "renew_after_click");
    return `Renew click sent (matched: "${renewClicked.text}")`;
  } finally {
    await browser.close();
  }
}

module.exports = { renewServer };
