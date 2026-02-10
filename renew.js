const puppeteer = require("puppeteer");

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}

async function debugDump(page, label) {
  const safe = label.replace(/[^a-z0-9_-]/gi, "_");
  try {
    await page.screenshot({ path: `/app/debug_${safe}.png`, fullPage: true });
  } catch {}
  try {
    const html = await page.content();
    require("fs").writeFileSync(`/app/debug_${safe}.html`, html);
  } catch {}
}

async function clickFirstByText(page, regex) {
  // Clicks first visible button/link/div with matching text
  const clicked = await page.evaluate((pattern) => {
    const re = new RegExp(pattern, "i");
    const candidates = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']"));
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };

    for (const el of candidates) {
      const text =
        (el.tagName === "INPUT" ? (el.value || "") : (el.textContent || "")).trim();
      if (re.test(text) && isVisible(el) && !el.disabled) {
        el.click();
        return { ok: true, text };
      }
    }
    return { ok: false };
  }, regex.source);

  return clicked;
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
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Go directly to the renew page; if not logged in, you’ll be redirected to login.
    await page.goto(RENEW_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Attempt to detect login form fields (generic)
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
      // Fill login
      await page.type("input[type='email'], input[name='email'], input[autocomplete='email']", EMAIL, { delay: 10 });
      await page.type("input[type='password'], input[name='password']", PASS, { delay: 10 });

      // Submit
      const submitClicked = await clickFirstByText(page, /sign in|log in|login|continue|submit/i);
      if (!submitClicked.ok) {
        // Fallback: press Enter on password field
        await page.keyboard.press("Enter");
      }

      // Wait for navigation / page change
      await page.waitForTimeout(2500);
      // Go again to renew URL in case login redirects elsewhere
      await page.goto(RENEW_URL, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
    }

    await debugDump(page, "before_renew_click");

    // Click renew
    const renewClicked = await clickFirstByText(page, /renew|extend|activate|keep alive|re-?new/i);
    if (!renewClicked.ok) {
      await debugDump(page, "renew_button_not_found");
      throw new Error("Could not find a visible Renew button on the renew page.");
    }

    // Optional: confirm dialogs
    await page.waitForTimeout(1000);
    const confirmClicked = await clickFirstByText(page, /confirm|yes|ok|continue/i);
    if (confirmClicked.ok) {
      await page.waitForTimeout(1000);
    }

    await debugDump(page, "after_renew_click");

    return `Renew click sent (matched: "${renewClicked.text}")`;
  } finally {
    await browser.close();
  }
}

module.exports = { renewServer };
