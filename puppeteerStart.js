const puppeteer = require("puppeteer");

async function startSeedloaf({ email, password, dashboardUrl }) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  // Go to dashboard login
  await page.goto("https://seedloaf.com/login", { waitUntil: "networkidle2" });

  // Log in
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click("button[type=submit]");
  await page.waitForNavigation({ waitUntil: "networkidle2" });

  // Go to your server console
  await page.goto(dashboardUrl, { waitUntil: "networkidle2" });

  // Click Start button
  const startBtn = await page.$("button[aria-label*='Start']");
  if (startBtn) {
    await startBtn.click();
  }

  await browser.close();
}

module.exports = { startSeedloaf };
