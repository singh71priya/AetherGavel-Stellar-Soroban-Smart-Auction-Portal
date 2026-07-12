# AetherGavel ✦ Stellar Soroban Smart Auction Portal

**AetherGavel** is a premium, real-time decentralized bidding and auction application built on the **Stellar Soroban Smart Contract Platform**. It provides a sleek, glassmorphic dark-theme interface that connects multiple browser extension wallets, tracks contract state through transaction simulation, and streams ledger event logs in real-time.

---

## 🚀 Verifiable Testnet Deployment

The smart contract is compiled, deployed, and initialized on the **Stellar Testnet**:

*   **Smart Contract Address:** `CAG6KGOBUZJLHXAX6RGQMLAD6JAIDSNAAPA2BIWCCUHEAIUTOD3NJOE5`
    *   *Verify on Stellar.expert:* [Stellar Explorer Contract Link](https://stellar.expert/explorer/testnet/contract/CAG6KGOBUZJLHXAX6RGQMLAD6JAIDSNAAPA2BIWCCUHEAIUTOD3NJOE5)
*   **WASM Upload Transaction Hash:** `6beb4632d57263dc6afeb9eaf47c481d8ea1d89f65898331c1698a711313c178`
    *   *Verify on Stellar.expert:* [WASM Upload Tx Details](https://stellar.expert/explorer/testnet/tx/6beb4632d57263dc6afeb9eaf47c481d8ea1d89f65898331c1698a711313c178)
*   **Contract Instantiation Transaction Hash:** `d626809a82789cbfb243dbb8bc0076e003d005e6381b4c0462a0f4864425464c`
    *   *Verify on Stellar.expert:* [Instantiation Tx Details](https://stellar.expert/explorer/testnet/tx/d626809a82789cbfb243dbb8bc0076e003d005e6381b4c0462a0f4864425464c)
*   **Contract Initialization (`initialize`) Transaction Hash:** `370c18e4f600a3b91757e07492ebb1e8aab1ceddf07b715cee86b23b1f65d1b2`
    *   *Verify on Stellar.expert:* [Initialization Tx Details](https://stellar.expert/explorer/testnet/tx/370c18e4f600a3b91757e07492ebb1e8aab1ceddf07b715cee86b23b1f65d1b2)

---

## 🛡️ Core Features & Level 2 Requirements Met

### 1. Multi-Wallet Integration
Uses `@creit.tech/stellar-wallets-kit` to support multiple browser wallets under a single static connector interface:
*   **Freighter** (Stellar Development Foundation)
*   **Albedo**
*   **xBull**
*   **Hana Wallet**

### 2. Smart Contract Called from Frontend
*   **Read State:** The application periodically polls the contract's `get_state` method via RPC transaction simulation (`simulateTransaction`). This performs a gas-free, instant execution to display the current highest bid, bidder, countdown, and active status in the UI.
*   **Write State:** Bidders submit bids via the contract's `bid` method, which is simulated, prepared with appropriate resource footprints and fees, signed by the user's browser wallet, and submitted to the Testnet ledger.

### 3. Real-Time Event Listening & State Synchronization
*   The contract publishes a `bid_placed` event with the bidder's Address and a vector containing the `(amount, timestamp)`.
*   The React frontend polls the Soroban RPC `getEvents` endpoint every 4 seconds. It parses events into native JS values via `scValToNative` and streams them into a scrollable, real-time **Bid Logs Feed**.

### 4. Transaction Status & Explorer Link Visibility
An interactive **Transaction Lifecycle Tracker** shows the state machine progression in real-time:
`Connecting Wallet` ➔ `Awaiting Signature` ➔ `Submitting to Testnet` ➔ `Confirming Execution` ➔ `Success / Error`.
Once submitted, a direct, clickable hyperlink to the transaction on `Stellar.expert` is generated dynamically.

### 5. 3 Custom Error Types Handled
1.  **Wallet Extension Missing / Not Found:** If a user selects a wallet option but doesn't have the extension installed, a toast alerts the user to install the extension.
2.  **User Rejected Connection / Signature:** Catching signature declines (like closing the Freighter popup or clicking "Reject") and notifying the user with a gentle warning toast.
3.  **Insufficient Balance / Contract Failures:** If a user bids with insufficient XLM, or attempts to place a bid that is lower than the minimum or current highest bid, the RPC submission fail state is parsed, and a clear error notification is shown.

---

## 🛠️ Local Development & Quick Start

Follow these steps to run the application locally:

### Prerequisites
*   Node.js (v18+ or v20+)
*   npm (v9+)
*   Rust / Cargo (Only if compiling the smart contract yourself)

### Installation
1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Run the local development server:
    ```bash
    npm run dev
    ```

3.  Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📦 Compilation & Redeployment (Optional)

If you modify the smart contract and wish to compile/redeploy it:

1.  **Compile Rust Contract to WebAssembly:**
    Navigate to the contract directory and build:
    ```bash
    cd contracts/auction
    cargo build --target wasm32-unknown-unknown --release
    ```

2.  **Run the Deployment Script:**
    From the root directory, run the automated script. It will generate a new account, fund it via Friendbot, deploy the WASM, instantiate the contract, call `initialize`, and overwrite the frontend config file `src/contract-config.json` automatically:
    ```bash
    node scripts/deploy.cjs
    ```
