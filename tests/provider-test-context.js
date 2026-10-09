const axios = require("axios");
const cheerioModule = require("cheerio");
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const urlsEndpoint =
  "https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/urls.json";
const nativeFetch = global.fetch;

global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url === urlsEndpoint) {
    const providerUrls = fs.readFileSync(
      path.join(rootDir, "urls.json"),
      "utf-8",
    );
    return new Response(providerUrls, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return nativeFetch(input, init);
};

// Local-network note: this machine reaches these sites only through a local
// proxy (registry ProxyServer, honoured by curl but not by Node). Export
// HTTPS_PROXY / HTTP_PROXY (e.g. http://127.0.0.1:7890) before running the CLI
// tests; axios picks those up itself. Do not pass an explicit `proxy` option:
// in axios 1.x that makes it resolve the target itself and bypass the proxy,
// which fails on this machine. Use the literal IPv4 address, because the proxy
// listens on 127.0.0.1 only and `localhost` can resolve to ::1.
// This affects local testing only; it is never bundled into a provider, because
// in the app the sandbox supplies its own transport.
//
// The sandbox exposes cheerio with `cheerio.load(html)` as the primary API.
// cheerio 1.x is a namespace object under require(); wrap it so the injected
// value stays callable and keeps .load, which is how providers use it.
const cheerio = Object.assign(
  (...args) => cheerioModule.load(...args),
  cheerioModule,
);

const providerContext = {
  axios,
  cheerio,
  commonHeaders: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
  Aes: {},
};

module.exports = { providerContext };
