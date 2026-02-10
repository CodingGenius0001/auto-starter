const puppeteer = require("puppeteer");

async function startSeedloaf({ email, password, dashboardUrl }) {

  if (!email || !password || !dashboardUrl) {
    throw new Error("Missing Seedloaf credentials or dashboard URL");
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  const page = await browser.newPage();

  // Prevent timeouts on slower Railway instances
  page.setDefaultTimeout(60000);

  try {

    console.log("Navigating to Seedloaf login...");

    await page.goto("https://seedloaf.com/login", {
      waitUntil: "networkidle2"
    });

    // Wait for login form
    await page.waitForSelector('input[name="email"]');

    console.log("Entering credentials...");

    await page.type('input[name="email"]', email, { delay: 25 });
    await page.type('input[name="password"]', password, { delay: 25 });

    await page.click("button[type=submit]");

    await page.waitForNavigation({
      waitUntil: "networkidle2"
    });

    console.log("Login successful, opening dashboard...");

    await page.goto(dashboardUrl, {
      waitUntil: "networkidle2"
    });

    console.log("Looking for Start button...");

    // Try multiple possible selectors (Seedloaf UI may change)
    const selectors = [
      "button[aria-label*='Start']",
      "button:has(svg)",
      "button"
    ];

    let clicked = false;

    for (const selector of selectors) {
      const buttons = await page.$$(selector);

      for (const btn of buttons) {

        const text = await page.evaluate(el => el.innerText, btn);

        if (text && text.toLowerCase().includes("start")) {

          console.log("Start button found, clicking...");

          await btn.click();
          clicked = true;
          break;
        }
      }

      if (clicked) break;
    }

    if (!clicked) {
      throw new Error("Could not find Start button");
    }

    console.log("Server start triggered successfully");

  } catch (err) {

    console.error("Puppeteer error:", err);
    throw err;

  } finally {

    await browser.close();

  }
}

module.exports = { startSeedloaf };
