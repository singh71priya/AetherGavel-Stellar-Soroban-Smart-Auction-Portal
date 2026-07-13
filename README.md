# StellarBid ✦ Stellar Soroban Smart Auction Portal

**StellarBid** is a premium, real-time decentralized bidding and auction application built on the **Stellar Soroban Smart Contract Platform**. It provides a sleek, glassmorphic dark-theme interface that connects multiple browser extension wallets, tracks contract state through transaction simulation, and streams ledger event logs in real-time.

---

## 🚀 Verifiable Testnet Deployment

The smart contract is compiled, deployed, initialized, and seeded on the **Stellar Testnet**:

*   **Live Portal Link:** [https://aether-gavel.vercel.app/](https://aether-gavel.vercel.app/)
*   **Smart Contract Address:** `CASWUUXTETDACBYXKFJY73ZXFHD7ROUUZYLIXSBWHUCFLFWSS6XRVYK5`
    *   *Verify on Stellar.expert:* [Stellar Explorer Contract Link](https://stellar.expert/explorer/testnet/contract/CASWUUXTETDACBYXKFJY73ZXFHD7ROUUZYLIXSBWHUCFLFWSS6XRVYK5)
*   **WASM Upload Transaction Hash:** `736bacb951cd0b348d659e0cc747069fb124b5bfe48e48b9e6f6752b90cabc59`
    *   *Verify on Stellar.expert:* [WASM Upload Tx Details](https://stellar.expert/explorer/testnet/tx/736bacb951cd0b348d659e0cc747069fb124b5bfe48e48b9e6f6752b90cabc59)
*   **Contract Instantiation Transaction Hash:** `923fdb0e6ad6840358bc0211b6e258b56c4ec2d319ed18d8f2c3e0b58c2e2ba1`
    *   *Verify on Stellar.expert:* [Instantiation Tx Details](https://stellar.expert/explorer/testnet/tx/923fdb0e6ad6840358bc0211b6e258b56c4ec2d319ed18d8f2c3e0b58c2e2ba1)
*   **Contract Initialization (`initialize`) Transaction Hash:** `78f148cc86ae6d0d8408e5598e22a33b2c95adda788330c336668e3fb1bd6286`
    *   *Verify on Stellar.expert:* [Initialization Tx Details](https://stellar.expert/explorer/testnet/tx/78f148cc86ae6d0d8408e5598e22a33b2c95adda788330c336668e3fb1bd6286)

### Seeded Items (Default State)
Three default items have been successfully listed on-chain for verification:
1.  **StellarBid #804: Celestial Core** (10 XLM opening bid, Tx: `44c023251c6d2bdbf732301cd5606ede0f11707909d69bc226de9cc500b7138f`)
2.  **Chronos Hourglass: Temporal Sands** (25 XLM opening bid, Tx: `2f89a5a0a40ac7231581289077c3c338e1955866ed1729f82070f6123110bb07`)
3.  **Nebula Aegis: Quantum Bulwark** (50 XLM opening bid, Tx: `8bb3a816bd80ba6433879eb916b0202d55cf411ff5f63cf5825ff356a295e08a`)

---

## 🛡️ Core Features & Level 2 Requirements Met

### 1. Multi-Item Auction Lobby & Dynamic Listings
*   **On-Chain Grid Lobby:** Users can view all active and ended auctions on the Stellar ledger dynamically.
*   **On-Chain Creation:** Connect your wallet and fill out the "List Asset" form to deploy a new item (with name, starting bid, and duration) on the Stellar testnet. It updates the lobby grid in real-time.
*   **Preset Bidding Increments:** Fast quick-clicks to add `+5 XLM`, `+10 XLM`, or `+50 XLM` relative to the current bid.

### 2. Premium UX Aesthetics
*   **Web Audio API Synth:** Programmatic audio sound effects (happy upward tones on wallet connect, high chimes on successful bid, and deep buzzers on error) that work without static files.
*   **Interactive Confetti Canvas:** High-performance vector confetti bursts on successful bid placement or finalization claims.
*   **Dynamic SVG Price Chart:** Evaluates transaction event history and plots a gradient trading line chart of bid velocity/progression for each active item.

### 3. Multi-Wallet Integration
Uses `@creit.tech/stellar-wallets-kit` to support multiple browser wallets under a single static connector interface:
*   **Freighter** (Stellar Development Foundation)
*   **Albedo**
*   **xBull**
*   **Hana Wallet**

### 4. Smart Contract Called from Frontend
*   **Read State:** The application polls all items from the contract's `get_all_auctions` method via gas-free RPC simulation (`simulateTransaction`).
*   **Write State:** Bidders submit bids via the contract's `bid` method, which is simulated, signed by the browser wallet, and submitted.

### 5. Real-Time Event Listening & State Synchronization
*   The contract publishes a `bid_placed` event with the item ID, bidder, and amount.
*   The frontend polls the Soroban RPC `getEvents` endpoint and logs activities dynamically.

### 6. Transaction Status & Explorer Link Visibility
An interactive **Transaction Lifecycle Tracker** shows the state machine progression in real-time:
`Connecting Wallet` ➔ `Awaiting Signature` ➔ `Submitting to Testnet` ➔ `Confirming Execution` ➔ `Success / Error`.
Clickable hyperlinks to the transaction on `Stellar.expert` are generated.

### 7. 3 Custom Error Types Handled
1.  **Wallet Extension Missing / Not Found:** If a user selects a wallet option but doesn't have the extension installed, a styled notification banner prompts the user with troubleshooting details and installation links.
2.  **User Rejected Connection / Signature:** Gracefully intercepts Freighter/Albedo cancel codes and warns the user with a "Transaction Signature Declined" popup.
3.  **Insufficient Balance / Contract Failures:** Checks if the user's XLM balance is underfunded or if the transaction failed validator criteria, showing precise diagnostics.

---

## 📸 Application Visual Walkthrough

Here is a visual walkthrough of the **StellarBid** multi-item auction house showcasing the completed features and Level 2 requirements:

### 1. Main Dashboard & Active Lobby Grid
The active item lobby displays all active or finalized smart auctions on-chain with rarity indicators, dynamic listing cards, and countdown timers:
![Lobby Grid](screenshots/lobby.png)

### 2. Connected State & Wallet Integration
Connecting your wallet uses `StellarWalletsKit` supporting Freighter, Albedo, Hana, and xBull:
![Connected State](screenshots/connected.png)

### 3. Placing an On-Chain Bid
Inputting a bid amount and placing it triggers a transaction simulation, signature, and submission:
![Placing Bid](screenshots/bid_placed.png)

### 4. Interactive Transaction Lifecycle
An interactive status timeline tracks the transaction step-by-step from wallet authorization to ledger confirmation:
![Transaction Lifecycle](screenshots/lifecycle.png)

### 5. Dynamic Bid Velocity Chart
The dashboard automatically plots bid history in a responsive SVG line chart:
![SVG Price Chart](screenshots/live_timmer_bid.png)

### 6. Streaming Real-Time Ledger Events
The real-time log listens to Soroban event logs to synchronize updates and list active bidders:
![Bid Logs Feed](screenshots/bid_log.png)

### 7. Deploying New Items On-Chain
Connected users can list their own custom assets dynamically by completing the "List Asset" form:
![List Asset Form](screenshots/deploy_item.png)

### 8. Finalizing and Settling Auctions
When an auction expires, the finalization step distributes the escrow funds to the creator on-chain:
![Finalize Auction](screenshots/auction%20done_.png)

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
    From the root directory, run the automated script:
    ```bash
    node scripts/deploy.cjs
    ```

   v
