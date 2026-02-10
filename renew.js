// renew.js
const puppeteer = require("puppeteer");
const fs = require("fs");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function debugDump(page, tag) {
  const safe = String(tag).replace(/[^a-z0-9_-]/gi, "_");
  try {
    const html = await page.content();
    fs.writeFileSync(`/app/debug_${safe}.html`, html);
  } catch {}
  try {
    await page.screenshot({ path: `/app/debug_${safe}.png`, fullPage: true });
  } catch {}
}

async function clickFirstByText(page, regex) {
  const result = await page.evaluate((pattern) => {
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
        style.display !== "none"
      );
    };

    for (const el of candidates) {
      const text =
        (el.tagName === "INPUT" ? (el.value || "") : (el.textContent || ""))
          .trim();

      if (re.test(text) && isVisible(el) && !el.disabled) {
        el.click();
        return { ok: true, text };
      }
    }

    return { ok: false };
  }, regex.source);

  return result;
}

async function renewServer() {
  // If your host has a special renew page/button, set this to that URL.
  const RENEW_URL = process.env.RENEW_URL;
  const EMAIL = process.env.PANEL_EMAIL;
  const PASS = process.env.PANEL_PASSWORD;

  if (!RENEW_URL) {
    throw new Error("Missing env var: RENEW_URL");
  }

  // Some sites require login first; if yours does, set PANEL_EMAIL/PANEL_PASSWORD.
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    await page.goto(RENEW_URL, { waitUntil: "domcontentloaded" });
    await sleep(1500);

    // If there's a login form and creds are provided, try to log in.
    if (EMAIL && PASS) {
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
        await page.type("input[type='email'], input[name='email'], input[autocomplete='email']", EMAIL, { delay: 10 });
        await page.type("input[type='password'], input[name='password']", PASS, { delay: 10 });

        const submitClicked = await clickFirstByText(page, /sign in|log in|login|continue|submit/i);
        if (!submitClicked.ok) {
          await page.keyboard.press("Enter");
        }

        await sleep(2500);
        await page.goto(RENEW_URL, { waitUntil: "domcontentloaded" });
        await sleep(1500);
      }
    }

    await debugDump(page, "before_renew");

    // Click Renew (common labels)
    const renewClicked = await clickFirstByText(page, /renew|extend|activate|keep alive|re-?new/i);
    if (!renewClicked.ok) {
      await debugDump(page, "renew_not_found");
      throw new Error("Could not find a visible Renew button on the renew page.");
    }

    // Optional confirm popup
    await sleep(1000);
    const confirmClicked = await clickFirstByText(page, /confirm|yes|ok|continue/i);
    if (confirmClicked.ok) await sleep(1000);

    await debugDump(page, "after_renew");

    return `Renew click sent (matched: "${renewClicked.text}")`;
  } finally {
    try { await browser.close(); } catch {}
  }
}

module.exports = { renewServer };
