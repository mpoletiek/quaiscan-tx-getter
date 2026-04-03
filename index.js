const https = require("https");
const fs = require("fs");
const path = require("path");

const API_BASE =
  (process.env.QUAISCAN_API_URL || "https://orchard.quaiscan.io").replace(/\/+$/, "") + "/api/v2";
const RATE_LIMIT_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 429) {
        resolve({ rateLimited: true, retryAfter: res.headers["retry-after"] });
        return;
      }

      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.slice(0, 200)}`));
        }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetchJSON(url);

    if (resp.rateLimited) {
      const waitMs = (resp.retryAfter ? Number(resp.retryAfter) * 1000 : 2000) * (attempt + 1);
      console.log(`  Rate limited, waiting ${waitMs}ms...`);
      await sleep(waitMs);
      continue;
    }

    return resp;
  }

  throw new Error("Rate limited after max retries");
}

async function fetchAllTransactions(address) {
  const allTxs = [];
  let nextPageParams = null;
  let page = 1;

  console.log(`Fetching transactions for ${address}...`);

  while (true) {
    let url = `${API_BASE}/addresses/${address}/transactions`;

    if (nextPageParams) {
      const params = new URLSearchParams();
      for (const [key, val] of Object.entries(nextPageParams)) {
        if (val !== null && val !== undefined) {
          params.set(key, String(val));
        }
      }
      url += `?${params.toString()}`;
    }

    const resp = await fetchWithRetry(url);

    if (!resp.items || resp.items.length === 0) {
      if (page === 1) {
        console.log("No transactions found.");
      }
      break;
    }

    allTxs.push(...resp.items);
    console.log(`  Page ${page}: ${resp.items.length} transactions (${allTxs.length} total)`);

    if (!resp.next_page_params) break;

    nextPageParams = resp.next_page_params;
    page++;

    await sleep(RATE_LIMIT_MS);
  }

  return allTxs;
}

function weiToQuai(wei) {
  if (!wei || wei === "0") return "0";
  const str = wei.padStart(19, "0");
  const intPart = str.slice(0, str.length - 18) || "0";
  const decPart = str.slice(str.length - 18).replace(/0+$/, "");
  return decPart ? `${intPart}.${decPart}` : intPart;
}

function escapeCSV(val) {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function txToRow(tx, address) {
  const toAddr = tx.to?.hash || "";
  const fromAddr = tx.from?.hash || "";
  const isIncoming = toAddr.toLowerCase() === address.toLowerCase();
  const dt = new Date(tx.timestamp);
  const ts = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")} ${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}:${String(dt.getUTCSeconds()).padStart(2, "0")} UTC`;

  return [
    tx.hash,
    tx.block,
    ts,
    fromAddr,
    toAddr,
    weiToQuai(tx.value),
    isIncoming ? "IN" : "OUT",
    tx.gas_limit,
    tx.gas_used,
    tx.gas_price,
    tx.status === "ok" ? "success" : tx.status || "unknown",
    tx.method || "",
    tx.nonce,
  ];
}

function writeCSV(transactions, address, outputPath) {
  const headers = [
    "TxHash",
    "BlockNumber",
    "Timestamp",
    "From",
    "To",
    "Value (QUAI)",
    "Direction",
    "GasLimit",
    "GasUsed",
    "GasPrice (Wei)",
    "Status",
    "Method",
    "Nonce",
  ];

  const lines = [
    headers.map(escapeCSV).join(","),
    ...transactions.map((tx) => txToRow(tx, address).map(escapeCSV).join(",")),
  ];

  fs.writeFileSync(outputPath, lines.join("\n") + "\n");
}

async function main() {
  const addresses = process.argv.slice(2);

  if (addresses.length === 0) {
    console.error("Usage: node index.js <address1> [address2] [address3] ...");
    process.exit(1);
  }

  for (const address of addresses) {
    const transactions = await fetchAllTransactions(address);

    if (transactions.length === 0) {
      console.log(`No transactions to export for ${address}.\n`);
      continue;
    }

    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const outputFile = path.join(process.cwd(), `${address}_transactions_${ts}.csv`);
    writeCSV(transactions, address, outputFile);
    console.log(`Exported ${transactions.length} transactions to ${outputFile}\n`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
