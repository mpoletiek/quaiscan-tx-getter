# quaiscan-tx-getter

Export all transactions for Quai or Qi wallet addresses to CSV using the [Quaiscan](https://quaiscan.io) (Blockscout) API. Supports both token types in Quai's dual-token system.

## Requirements

- Node.js 18+

No dependencies to install — the app uses only Node.js built-ins.

## Usage

```bash
node index.js <address1> [address2] [address3] ...
```

Each address produces its own `<address>_transactions_<timestamp>.csv` file in the current directory. Both Quai and Qi addresses are supported and can be mixed freely.

### Examples

```bash
# Single address
node index.js 0x0006506bDE7140b85DED58a40D7444F84cde4821

# Multiple addresses (Quai and Qi can be mixed)
node index.js 0x0006506bDE7140b85DED58a40D7444F84cde4821 0x00971b7c48EcbF6ba4C9A7a0d1B84E6E34814dd4
```

## Configuration

### Quaiscan endpoint

By default the app points at the **Orchard testnet** (`https://orchard.quaiscan.io`). Set the `QUAISCAN_API_URL` environment variable to target a different network:

```bash
# Mainnet (when available)
QUAISCAN_API_URL=https://quaiscan.io node index.js <address>

# Testnet (default)
QUAISCAN_API_URL=https://orchard.quaiscan.io node index.js <address>
```

Any Blockscout-based explorer should work as long as it exposes the v2 API.

## CSV columns

| Column | Description |
|---|---|
| TxHash | Transaction hash |
| BlockNumber | Block the transaction was included in |
| Timestamp | UTC date/time (`YYYY-MM-DD HH:MM:SS UTC`) |
| From | Sender address |
| To | Recipient address |
| Value | Transfer value (18 decimals for QUAI, 3 decimals for QI) |
| Currency | `QUAI` or `QI` |
| Direction | `IN` if the wallet is the recipient, `OUT` otherwise |
| GasLimit | Gas limit set for the transaction |
| GasUsed | Actual gas consumed |
| GasPrice (Wei) | Gas price in wei |
| Status | `success` or the reported error status |
| Method | Contract method called (if any) |
| Nonce | Transaction nonce |

## Rate limiting

The app waits 500ms between API pages and automatically retries with exponential backoff if it receives a 429 (rate limited) response.
