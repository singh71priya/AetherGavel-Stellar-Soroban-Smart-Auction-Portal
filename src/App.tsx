import { useState, useEffect, useRef } from 'react';
import {
  rpc,
  TransactionBuilder,
  Account,
  Contract,
  Address,
  nativeToScVal,
  scValToNative
} from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
// @ts-ignore
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
// @ts-ignore
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
// @ts-ignore
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
// @ts-ignore
import { HanaModule } from "@creit.tech/stellar-wallets-kit/modules/hana";
import {
  Wallet,
  Clock,
  Coins,
  History,
  TrendingUp,
  AlertCircle,
  ExternalLink,
  Hammer,
  Award,
  RefreshCw,
  User
} from 'lucide-react';
import config from './contract-config.json';

// Initialize the Stellar Wallets Kit statically
StellarWalletsKit.init({
  modules: [
    new FreighterModule(),
    new AlbedoModule(),
    new xBullModule(),
    new HanaModule()
  ]
});

const server = new rpc.Server(config.rpcUrl);

interface AuctionState {
  admin: string;
  token: string;
  title: string;
  minBid: bigint;
  endTime: number;
  highestBid: bigint;
  highestBidder: string | null;
  ended: boolean;
}

interface BidEvent {
  id: string;
  bidder: string;
  amount: bigint;
  timestamp: number;
  txHash: string;
}

type TxStatus = 'IDLE' | 'CONNECTING_WALLET' | 'AWAITING_SIGNATURE' | 'SUBMITTING' | 'CONFIRMING' | 'SUCCESS';

export default function App() {
  // Connection state
  const [walletConnected, setWalletConnected] = useState(false);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<string>('');

  // Auction data state
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [bidEvents, setBidEvents] = useState<BidEvent[]>([]);

  // Form state
  const [bidAmount, setBidAmount] = useState<string>('');

  // Transaction processing state
  const [txStatus, setTxStatus] = useState<TxStatus>('IDLE');
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Notifications state
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);

  // Polling intervals
  const isInitialEventsLoaded = useRef<boolean>(false);

  // Show Toast Helper
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'error') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 6000);
  };

  // Convert Stroops to XLM
  const stroopsToXlm = (stroops: bigint): string => {
    const sStr = stroops.toString().padStart(8, '0');
    const whole = sStr.slice(0, -7) || '0';
    const fraction = sStr.slice(-7).replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole;
  };

  // Helper to parse input XLM string to BigInt Stroops safely
  const parseXlmToStroops = (xlmStr: string): bigint => {
    if (!xlmStr || isNaN(Number(xlmStr))) return 0n;
    const parts = xlmStr.split('.');
    const whole = parts[0] || '0';
    let fraction = parts[1] || '0';
    fraction = fraction.slice(0, 7).padEnd(7, '0');
    return BigInt(whole) * 10000000n + BigInt(fraction);
  };

  // Truncate Address
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  // 1. Connect Wallet Flow
  const connectWallet = async () => {
    setTxStatus('CONNECTING_WALLET');
    try {
      const { address } = await StellarWalletsKit.authModal();
      setUserAddress(address);
      setWalletConnected(true);
      setWalletType(StellarWalletsKit.selectedModule?.productName || 'Stellar Wallet');
      setTxStatus('IDLE');
      showToast('Connected successfully', 'success');
    } catch (err: any) {
      console.error('Wallet acquisition failed:', err);
      setTxStatus('IDLE');
      if (err.message?.includes('installed') || err.message?.includes('found')) {
        showToast('Wallet extension not found. Please install Freighter/Albedo/Hana.', 'error');
      } else {
        showToast(err.message || 'Modal closed or connection rejected.', 'warning');
      }
    }
  };

  const disconnectWallet = () => {
    setUserAddress(null);
    setWalletConnected(false);
    setWalletType('');
    showToast('Wallet disconnected', 'warning');
  };

  // 2. Poll Contract State via Simulation
  const fetchAuctionState = async () => {
    try {
      const contract = new Contract(config.contractId);
      
      // Build dummy transaction to simulate get_state
      const dummyAccount = new Account(config.admin, '0');
      const tx = new TransactionBuilder(dummyAccount, {
        fee: '100',
        networkPassphrase: config.networkPassphrase
      })
        .addOperation(contract.call('get_state'))
        .setTimeout(30)
        .build();

      const simResponse = await server.simulateTransaction(tx);
      
      if (rpc.Api.isSimulationSuccess(simResponse)) {
        const rawState = scValToNative(simResponse.result!.retval);
        
        const state: AuctionState = {
          admin: rawState.admin,
          token: rawState.token,
          title: rawState.title,
          minBid: rawState.min_bid,
          endTime: Number(rawState.end_time),
          highestBid: rawState.highest_bid,
          highestBidder: rawState.highest_bidder || null,
          ended: rawState.ended
        };
        
        setAuctionState(state);
        
        // Calculate remaining seconds
        const ledgerTime = Number(rawState.current_time);
        const diff = state.endTime - ledgerTime;
        setTimeLeft(diff > 0 ? diff : 0);
      }
    } catch (err) {
      console.error('Failed to fetch auction state:', err);
    }
  };

  // 3. Poll Real-time Event Stream (getEvents)
  const fetchEvents = async () => {
    try {
      const latestLedgerResp = await server.getLatestLedger();
      const currentLedger = latestLedgerResp.sequence;
      
      // If we don't have a starting ledger, start from 100 ledgers back
      const startLedger = currentLedger - 120;
      
      const filterOptions = {
        startLedger: startLedger,
        filters: [
          {
            type: 'contract' as const,
            contractIds: [config.contractId]
          }
        ],
        limit: 100
      };

      const eventsResponse = await server.getEvents(filterOptions);
      
      if (eventsResponse.events && eventsResponse.events.length > 0) {
        const parsedEvents: BidEvent[] = eventsResponse.events
          .map((evt: any) => {
            try {
              const topic0 = scValToNative(evt.topic[0]);
              if (topic0 === 'bid_placed') {
                const bidder = scValToNative(evt.topic[1]);
                const val = scValToNative(evt.value);
                
                let amount = 0n;
                let timestamp = Math.floor(Date.now() / 1000);
                
                if (Array.isArray(val)) {
                  amount = val[0];
                  timestamp = Number(val[1]);
                } else {
                  amount = val;
                }
                
                return {
                  id: evt.id || evt.txHash,
                  bidder: typeof bidder === 'string' ? bidder : bidder.toString(),
                  amount: typeof amount === 'bigint' ? amount : BigInt(amount),
                  timestamp: timestamp,
                  txHash: evt.txHash
                };
              }
            } catch (e) {
              console.error('Event parsing error:', e, evt);
            }
            return null;
          })
          .filter((e): e is BidEvent => e !== null);
          
        // Sort descending by timestamp/id
        parsedEvents.sort((a, b) => b.timestamp - a.timestamp);
        setBidEvents(parsedEvents);
        
        // If a new event is detected and we aren't performing an initial load, notify user
        if (isInitialEventsLoaded.current && parsedEvents.length > bidEvents.length) {
          const newest = parsedEvents[0];
          if (newest.bidder !== userAddress) {
            showToast(`New bid of ${stroopsToXlm(newest.amount)} XLM placed!`, 'success');
          }
        }
        
        isInitialEventsLoaded.current = true;
      }
    } catch (err) {
      console.error('Failed to stream events:', err);
    }
  };

  // Poll state and events initially and periodically
  useEffect(() => {
    fetchAuctionState();
    fetchEvents();

    const stateInterval = setInterval(fetchAuctionState, 6000);
    const eventInterval = setInterval(fetchEvents, 4000);

    return () => {
      clearInterval(stateInterval);
      clearInterval(eventInterval);
    };
  }, [userAddress, bidEvents.length]);

  // Handle ticking timer locally for smooth UI ticks
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Formatted countdown time
  const getFormattedTimeLeft = () => {
    if (timeLeft <= 0) return '00:00:00';
    const hrs = Math.floor(timeLeft / 3600);
    const mins = Math.floor((timeLeft % 3600) / 60);
    const secs = timeLeft % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 4. Place Bid Transaction flow
  const placeBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletConnected || !userAddress) {
      showToast('Please connect your wallet first', 'warning');
      return;
    }

    const amountStroops = parseXlmToStroops(bidAmount);
    
    // Validate bid locally
    if (amountStroops <= 0n) {
      showToast('Please enter a valid bid amount', 'error');
      return;
    }
    
    if (auctionState) {
      if (amountStroops < auctionState.minBid) {
        showToast(`Bid must be at least the minimum of ${stroopsToXlm(auctionState.minBid)} XLM`, 'error');
        return;
      }
      if (amountStroops <= auctionState.highestBid) {
        showToast(`Bid must be strictly higher than the current highest bid of ${stroopsToXlm(auctionState.highestBid)} XLM`, 'error');
        return;
      }
    }

    setTxStatus('AWAITING_SIGNATURE');
    
    try {
      // 1. Fetch user's account seq to build tx
      const account = await server.getAccount(userAddress);
      const contract = new Contract(config.contractId);
      
      const op = contract.call(
        'bid',
        Address.fromString(userAddress).toScVal(),
        nativeToScVal(amountStroops, { type: 'i128' })
      );
      
      const tx = new TransactionBuilder(account, {
        fee: '100', // placeholder base fee
        networkPassphrase: config.networkPassphrase
      })
        .addOperation(op)
        .setTimeout(180)
        .build();

      // 2. Simulate & prepare transaction resources/footprints/fees
      const preparedTx = await server.prepareTransaction(tx);
      const txXdr = preparedTx.toXDR();
      
      // 3. User signs using connected wallet
      console.log('Sending transaction for signature to', walletType);
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(txXdr, {
        networkPassphrase: config.networkPassphrase,
        address: userAddress,
      });

      // 4. Submit to Stellar Testnet
      setTxStatus('SUBMITTING');
      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, config.networkPassphrase);
      const sendResult = await server.sendTransaction(signedTx);
      
      if (sendResult.status !== 'PENDING') {
        throw new Error(`Transaction rejected by network: ${JSON.stringify(sendResult)}`);
      }

      // 5. Confirm Transaction
      setTxStatus('CONFIRMING');
      setLastTxHash(sendResult.hash);
      
      // Poll transaction status
      let retries = 20;
      let txResponse = null;
      while (retries > 0) {
        txResponse = await server.getTransaction(sendResult.hash);
        if (txResponse.status === 'SUCCESS') {
          break;
        } else if (txResponse.status === 'FAILED') {
          // Extract specific error code
          throw new Error('Transaction submission failed inside the smart contract');
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        retries--;
      }

      if (!txResponse || txResponse.status !== 'SUCCESS') {
        throw new Error('Transaction confirmation timed out');
      }

      // Success!
      setTxStatus('SUCCESS');
      setBidAmount('');
      showToast('Bid placed successfully!', 'success');
      
      // Refresh state
      fetchAuctionState();
      fetchEvents();

      // Clear success screen after 5s
      setTimeout(() => setTxStatus('IDLE'), 5000);

    } catch (err: any) {
      console.error('Bidding failed:', err);
      setTxStatus('IDLE');
      
      // Handle error type 2: User rejected transaction
      if (
        err.message?.includes('reject') || 
        err.message?.includes('cancel') || 
        err.message?.includes('declined') ||
        err.message?.includes('User closed')
      ) {
        showToast('Transaction signing rejected by user.', 'warning');
      } 
      // Handle error type 3: Insufficient balance or contract panic
      else if (err.message?.includes('balance') || err.message?.includes('underfunded') || err.message?.includes('insufficient')) {
        showToast('Insufficient XLM balance in your wallet to cover the bid and fee.', 'error');
      } else if (err.message?.includes('lower than') || err.message?.includes('greater than')) {
        showToast('Bid was outbid before transaction was processed. Try a higher amount.', 'error');
      } else {
        showToast(err.message || 'An error occurred during submission.', 'error');
      }
    }
  };

  // 5. Claim Auction transaction flow (Only seller/admin claims, or anybody once ended)
  const claimAuction = async () => {
    if (!walletConnected || !userAddress) {
      showToast('Please connect your wallet first', 'warning');
      return;
    }

    setTxStatus('AWAITING_SIGNATURE');
    try {
      const account = await server.getAccount(userAddress);
      const contract = new Contract(config.contractId);
      
      const op = contract.call('claim');
      
      const tx = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: config.networkPassphrase
      })
        .addOperation(op)
        .setTimeout(180)
        .build();

      const preparedTx = await server.prepareTransaction(tx);
      const txXdr = preparedTx.toXDR();
      
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(txXdr, {
        networkPassphrase: config.networkPassphrase,
        address: userAddress,
      });

      setTxStatus('SUBMITTING');
      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, config.networkPassphrase);
      const sendResult = await server.sendTransaction(signedTx);
      
      setTxStatus('CONFIRMING');
      setLastTxHash(sendResult.hash);
      
      let retries = 20;
      let txResponse = null;
      while (retries > 0) {
        txResponse = await server.getTransaction(sendResult.hash);
        if (txResponse.status === 'SUCCESS') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        retries--;
      }

      if (!txResponse || txResponse.status !== 'SUCCESS') {
        throw new Error('Transaction confirmation timed out');
      }

      setTxStatus('SUCCESS');
      showToast('Auction claimed and finalized successfully!', 'success');
      fetchAuctionState();
      fetchEvents();

      setTimeout(() => setTxStatus('IDLE'), 5000);

    } catch (err: any) {
      console.error('Claiming failed:', err);
      setTxStatus('IDLE');
      if (err.message?.includes('reject') || err.message?.includes('cancel')) {
        showToast('Transaction signing rejected by user.', 'warning');
      } else {
        showToast(err.message || 'Claim transaction failed.', 'error');
      }
    }
  };

  return (
    <div className="app-container">
      {/* Background ambient glow circles */}
      <div className="bg-ambient-glow glow-purple"></div>
      <div className="bg-ambient-glow glow-cyan"></div>

      {/* Floating notifications */}
      {notification && (
        <div className="toast-container">
          <div className={`toast ${notification.type === 'success' ? 'toast-success' : ''}`}>
            <AlertCircle size={20} className={notification.type === 'success' ? 'text-green' : 'text-red'} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>
                {notification.type.toUpperCase()}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {notification.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="header">
        <a href="#" className="brand">
          <Hammer size={28} style={{ color: 'var(--cyan)' }} />
          <span className="brand-logo">AetherGavel</span>
          <span className="brand-badge">Testnet</span>
        </a>

        <div>
          {walletConnected && userAddress ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="glass-panel" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '12px' }}>
                <Wallet size={16} style={{ color: 'var(--cyan)' }} />
                <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 500 }}>
                  {formatAddress(userAddress)}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                  {walletType}
                </span>
              </div>
              <button className="btn btn-secondary" onClick={disconnectWallet} style={{ padding: '0.5rem 1rem' }}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={connectWallet}>
              <Wallet size={18} />
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <main className="grid-2col">
        {/* Left Column: Asset Detail */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Active Smart Auction
              </span>
              {auctionState && (
                <span className={`status-badge ${auctionState.ended ? 'status-ended' : 'status-active'}`}>
                  <span className="status-dot"></span>
                  {auctionState.ended ? 'Ended & Claimed' : 'Active'}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
              {auctionState ? auctionState.title : 'AetherGavel #804: Celestial Core'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
              A high-velocity cybernetic relic forged within the Stellar testnet nebulae. Empowered by Soroban decentralized logic, this celestial artifact automates bid verification, instant outbid returns, and smart contract fund distributions.
            </p>
          </div>

          {/* Gavel Image */}
          <div style={{ width: '100%', height: '320px', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
            <img 
              src="/aether_gavel.png" 
              alt="AetherGavel" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                // Fallback if image fails to load
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1964&auto=format&fit=cover';
              }}
            />
            <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', background: 'rgba(7, 5, 13, 0.8)', backdropFilter: 'blur(8px)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                Contract: {config.contractId ? formatAddress(config.contractId) : 'Loading...'}
              </span>
            </div>
          </div>

          {/* Details list */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                Seller (Admin)
              </p>
              <p style={{ fontSize: '0.9rem', fontWeight: 500, color: 'white' }}>
                {auctionState ? formatAddress(auctionState.admin) : 'Loading...'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                Asset Currency
              </p>
              <p style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Coins size={14} /> Native XLM (SAC)
              </p>
            </div>
          </div>
        </section>

        {/* Right Column: Bidding & Interaction */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Bid Summary & Countdown */}
          <div className="glass-panel">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  <TrendingUp size={14} style={{ color: 'var(--cyan)' }} /> Current Bid
                </p>
                <p style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.5px', marginTop: '0.25rem' }}>
                  {auctionState ? stroopsToXlm(auctionState.highestBid) : '0'} <span style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>XLM</span>
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                  <User size={12} />
                  {auctionState?.highestBidder ? `by ${formatAddress(auctionState.highestBidder)}` : 'No bids yet'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  <Clock size={14} style={{ color: 'var(--pink)' }} /> Time Left
                </p>
                <p style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-mono)', letterSpacing: '-0.5px', marginTop: '0.25rem' }}>
                  {getFormattedTimeLeft()}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {auctionState?.ended ? 'Auction Finalized' : 'Ticks in real-time'}
                </p>
              </div>
            </div>

            {/* Bidding Form */}
            {auctionState && !auctionState.ended && timeLeft > 0 ? (
              <form onSubmit={placeBid}>
                <div className="input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="input-label">Your Bid Amount</label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Min Bid: {stroopsToXlm(auctionState.minBid)} XLM
                    </span>
                  </div>
                  <div className="input-wrapper">
                    <input
                      type="number"
                      step="0.0000001"
                      className="input-field"
                      placeholder={`e.g. ${stroopsToXlm(auctionState.highestBid + 10000000n)}`}
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      disabled={txStatus !== 'IDLE'}
                    />
                    <span className="input-suffix">XLM</span>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className={`btn btn-primary ${txStatus !== 'IDLE' ? 'btn-disabled' : ''}`} 
                  style={{ width: '100%', padding: '1rem' }}
                  disabled={txStatus !== 'IDLE'}
                >
                  <Hammer size={18} />
                  {txStatus === 'IDLE' ? 'Place Bid via Wallet' : 'Processing Bid...'}
                </button>
              </form>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center' }}>
                <Award size={36} style={{ color: 'var(--yellow)', marginBottom: '0.5rem', display: 'inline-block' }} />
                <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '0.25rem' }}>
                  Auction Ended
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  {auctionState?.highestBidder 
                    ? `Winner: ${formatAddress(auctionState.highestBidder)} with ${stroopsToXlm(auctionState.highestBid)} XLM` 
                    : 'No bids were placed.'}
                </p>
                {auctionState && !auctionState.ended && (
                  <button className="btn btn-primary" onClick={claimAuction} style={{ width: '100%' }}>
                    Claim & Distribute Funds
                  </button>
                )}
              </div>
            )}

            {/* Visual Timeline Tracking */}
            {txStatus !== 'IDLE' && (
              <div className="tracker">
                <span className="tracker-title">Transaction Lifecycle Tracker</span>
                
                <div className={`tracker-step ${txStatus === 'CONNECTING_WALLET' ? 'step-active' : ''} ${txStatus !== 'CONNECTING_WALLET' ? 'step-completed' : ''}`}>
                  <span className="step-indicator">1</span>
                  <span className="step-text">Connecting Wallet Option</span>
                </div>
                
                <div className={`tracker-step ${txStatus === 'AWAITING_SIGNATURE' ? 'step-active' : ''} ${txStatus === 'SUBMITTING' || txStatus === 'CONFIRMING' || txStatus === 'SUCCESS' ? 'step-completed' : ''}`}>
                  <span className="step-indicator">2</span>
                  <span className="step-text">Awaiting Signature (Freighter/Albedo/Hana)</span>
                </div>
                
                <div className={`tracker-step ${txStatus === 'SUBMITTING' ? 'step-active' : ''} ${txStatus === 'CONFIRMING' || txStatus === 'SUCCESS' ? 'step-completed' : ''}`}>
                  <span className="step-indicator">3</span>
                  <span className="step-text">Submitting to Stellar Testnet Ledger</span>
                </div>
                
                <div className={`tracker-step ${txStatus === 'CONFIRMING' ? 'step-active' : ''} ${txStatus === 'SUCCESS' ? 'step-completed' : ''}`}>
                  <span className="step-indicator">4</span>
                  <span className="step-text">Confirming Execution Result</span>
                </div>

                {lastTxHash && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <a 
                      href={`https://stellar.expert/explorer/testnet/tx/${lastTxHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ fontSize: '0.75rem', color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}
                    >
                      View on Stellar.expert <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Real-time Bidding Feed / Event Log */}
          <div className="glass-panel event-feed">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={18} style={{ color: 'var(--cyan)' }} />
                Real-time Bid Logs
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                <RefreshCw size={12} className="status-dot" /> Listening...
              </span>
            </div>

            <div className="event-list">
              {bidEvents.length > 0 ? (
                bidEvents.map((evt) => (
                  <div className="event-item" key={evt.id}>
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>
                        {formatAddress(evt.bidder)}
                      </p>
                      <a 
                        href={`https://stellar.expert/explorer/testnet/tx/${evt.txHash}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.25rem' }}
                      >
                        Tx: {evt.txHash.slice(0, 8)}... <ExternalLink size={10} />
                      </a>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--green)' }}>
                        +{stroopsToXlm(evt.amount)} XLM
                      </p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {new Date(evt.timestamp * 1000).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '2rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '1px', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                  No bid activities detected yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
