const puppeteer = require("puppeteer");
const fs = require("fs");

async function startSeedloaf({ email, password, dashboardUrl }) {
  if (!email || !password || !dashboardUrl) {
    throw new Error("Missing env vars: SEEDLOAF_EMAIL / SEEDLOAF_PASS / SEEDLOAF_DASHURL");
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  const dumpDebug = async (tag) => {
    try {
      const url = page.url();
      const title = await page.title();
      const html = await page.content();

      console.log(`[DEBUG:${tag}] url=${url}`);
      console.log(`[DEBUG:${tag}] title=${title}`);
      console.log(`[DEBUG:${tag}] html_head=${html.slice(0, 500).replace(/\s+/g, " ")}`);

      fs.writeFileSync(`/app/debug_${tag}.html`, html);
      await page.screenshot({ path: `/app/debug_${tag}.png`, fullPage: true });
      console.log(`[DEBUG:${tag}] wrote /app/debug_${tag}.html and /app/debug_${tag}.png`);
    } catch (e) {
      console.log(`[DEBUG:${tag}] failed to dump debug:`, e);
    }
  };

  try {
    console.log("Navigating to Seedloaf login...");
    await page.goto("https://seedloaf.com/login", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await dumpDebug("after_goto_login");

    // Helper: try selectors on a given frame
    const findAndType = async (frame, selectors, value, label) => {
      for (const sel of selectors) {
        const el = await frame.$(sel);
        if (el) {
          console.log(`Found ${label} using selector: ${sel}`);
          await el.click({ clickCount: 3 });
          await el.type(value, { delay: 20 });
          return true;
        }
      }
      return false;
    };

    const findAndClick = async (frame, selectors, label) => {
      for (const sel of selectors) {
        const el = await frame.$(sel);
        if (el) {
          console.log(`Found ${label} using selector: ${sel}`);
          await el.click();
          return true;
        }
      }
      return false;
    };

    // Candidate selectors (adjustable)
    const emailSelectors = [
      'input[name="email"]',
      'input[type="email"]',
      'input#email',
      'input[autocomplete="email"]',
      'input[placeholder*="Email" i]',
    ];

    const passSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input#password',
      'input[autocomplete="current-password"]',
      'input[placeholder*="Password" i]',
    ];

    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has(svg)', // may or may not help
    ];

    // 1) Try on main page first
    console.log("Trying to locate login fields on main page...");
    let emailOk = await findAndType(page, emailSelectors, email, "email");
    let passOk = false;

    if (emailOk) {
      passOk = await findAndType(page, passSelectors, password, "password");
    }

    // 2) If not found, try all iframes
    if (!emailOk || !passOk) {
      console.log("Login fields not found on main page. Scanning iframes...");
      const frames = page.frames();
      console.log(`Found ${frames.length} frames total.`);

      for (const frame of frames) {
        const frameUrl = frame.url();
        console.log("Checking frame:", frameUrl);

        if (!emailOk) emailOk = await findAndType(frame, emailSelectors, email, "email");
        if (emailOk && !passOk) passOk = await findAndType(frame, passSelectors, password, "password");

        if (emailOk && passOk) {
          console.log("Found fields in frame:", frameUrl);
          // click submit in same frame if possible
          const clicked = await findAndClick(frame, submitSelectors, "submit");
          if (!clicked) {
            console.log("Submit not found in that frame; will try on main page.");
          }
          break;
        }
      }
    }

    if (!emailOk || !passOk) {
      await dumpDebug("login_fields_not_found");
      throw new Error("Could not find login email/password fields (selectors/iframe/bot-check likely).");
    }

    console.log("Submitting login...");
    // Try clicking submit on page; if it was inside iframe it may still work; otherwise adjust later.
    const clickedSubmit = await findAndClick(page, submitSelectors, "submit");
    if (!clickedSubmit) {
      console.log("Submit button not found on main page; pressing Enter in password field.");
      await page.keyboard.press("Enter");
    }

    // Wait for nav or for URL to change
    try {
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 });
    } catch {
      console.log("No navigation detected after submit (could be SPA). Continuing...");
    }

    await page.waitForTimeout(2000);
    await dumpDebug("after_login_attempt");

    console.log("Navigating to dashboard URL...");
    await page.goto(dashboardUrl, { waitUntil: "networkidle2" });
    await page.waitForTimeout(2000);
    await dumpDebug("after_dashboard");

    console.log("Looking for Start button...");
    let clicked = false;

    // Try aria label
    const startBtn = await page.$("button[aria-label*='Start'], button[aria-label*='start']");
    if (startBtn) {
      await startBtn.click();
      clicked = true;
      console.log("Clicked Start via aria-label selector.");
    }

    // Fallback: visible text "Start"
    if (!clicked) {
      clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const target = btns.find((b) => (b.innerText || "").trim().toLowerCase() === "start");
        if (target) {
          target.click();
          return true;
        }
        return false;
      });
      if (clicked) console.log("Clicked Start via button text.");
    }

    if (!clicked) {
      console.log("Start button not found.");
      await dumpDebug("start_button_not_found");
      throw new Error("Start button not found on dashboard page.");
    }

    console.log("Start click attempted.");
  } catch (err) {
    console.error("Puppeteer error:", err);
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = { startSeedloaf };
