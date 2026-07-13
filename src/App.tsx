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
  User,
  Plus,
  Search,
  Volume2,
  VolumeX,
  Layers,
  Sparkles
} from 'lucide-react';
import config from './contract-config.json';

// Initialize Stellar Wallets Kit statically
StellarWalletsKit.init({
  modules: [
    new FreighterModule(),
    new AlbedoModule(),
    new xBullModule(),
    new HanaModule()
  ]
});

const server = new rpc.Server(config.rpcUrl);

interface AuctionItem {
  id: number;
  creator: string;
  title: string;
  minBid: bigint;
  endTime: number;
  highestBid: bigint;
  highestBidder: string | null;
  ended: boolean;
}

interface BidEvent {
  id: string;
  auctionId: number;
  bidder: string;
  amount: bigint;
  timestamp: number;
  txHash: string;
}

type TxStatus = 'IDLE' | 'CONNECTING_WALLET' | 'AWAITING_SIGNATURE' | 'SUBMITTING' | 'CONFIRMING' | 'SUCCESS';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  alpha: number;
}

export default function App() {
  // Wallet / Connection states
  const [walletConnected, setWalletConnected] = useState(false);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<string>('');

  // Audio mute state
  const [isMuted, setIsMuted] = useState(false);

  // List of all auctions and active auction selection
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState<number | null>(null);
  const [currentLedgerTime, setCurrentLedgerTime] = useState<number>(Math.floor(Date.now() / 1000));

  // Search, Filter, Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'ENDED'>('ALL');
  const [sortBy, setSortBy] = useState<'ID_ASC' | 'BID_DESC' | 'TIME_ASC'>('ID_ASC');

  // Form states
  const [bidAmount, setBidAmount] = useState<string>('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMinBid, setNewMinBid] = useState('10');
  const [newDuration, setNewDuration] = useState('30'); // minutes

  // Transaction states
  const [txStatus, setTxStatus] = useState<TxStatus>('IDLE');
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  // Events & logs
  const [bidEvents, setBidEvents] = useState<BidEvent[]>([]);
  const isInitialEventsLoaded = useRef(false);

  // Canvas ref for confetti particles
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Setup local countdown timers
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLedgerTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Show dynamic toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  // Convert Stroops to XLM
  const stroopsToXlm = (stroops: bigint): string => {
    const sStr = stroops.toString().padStart(8, '0');
    const whole = sStr.slice(0, -7) || '0';
    const fraction = sStr.slice(-7).replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole;
  };

  // Convert XLM input string to BigInt Stroops
  const parseXlmToStroops = (xlmStr: string): bigint => {
    if (!xlmStr || isNaN(Number(xlmStr))) return 0n;
    const parts = xlmStr.split('.');
    const whole = parts[0] || '0';
    let fraction = parts[1] || '0';
    fraction = fraction.slice(0, 7).padEnd(7, '0');
    return BigInt(whole) * 10000000n + BigInt(fraction);
  };

  // Truncate public key
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  // Play Programmatic Web Audio Synthesizer Tones
  const playTone = (type: 'connect' | 'success' | 'error') => {
    if (isMuted) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'connect') {
        // Melodic upward triplet
        osc.type = 'sine';
        osc.frequency.setValueAtTime(329.63, now); // E4
        osc.frequency.setValueAtTime(392.00, now + 0.1); // G4
        osc.frequency.setValueAtTime(523.25, now + 0.2); // C5
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (type === 'success') {
        // Celestial high chime
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.12); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.18); // C6
        gainNode.gain.setValueAtTime(0.18, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.65);
      } else if (type === 'error') {
        // Soft low synth buzzer
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(75, now + 0.25);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      console.warn('Web Audio API not allowed or failed:', e);
    }
  };

  // Canvas Confetti Engine
  const triggerConfetti = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to cover window
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#00f2fe', '#8a2be2', '#7c4dff', '#f107a3', '#00ff87', '#ffb300'];
    const particles: Particle[] = [];

    // Create 90 confetti pieces from the center bottom
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height - 50,
        vx: (Math.random() - 0.5) * 18,
        vy: -Math.random() * 22 - 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 10 + 6,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        alpha: 1
      });
    }

    particlesRef.current = particles;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.45; // gravity
        p.vx *= 0.98; // friction
        p.rotation += p.rotationSpeed;
        
        if (p.vy > 0) {
          p.alpha -= 0.012; // fade out when falling
        }

        if (p.y < canvas.height && p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      });

      if (alive) {
        animationFrameRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    draw();
  };

  // Clean up animation frames
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // 1. Connect Wallet
  const connectWallet = async () => {
    setTxStatus('CONNECTING_WALLET');
    setErrorMessage(null);
    setErrorDetails(null);
    try {
      const { address } = await StellarWalletsKit.authModal();
      setUserAddress(address);
      setWalletConnected(true);
      setWalletType(StellarWalletsKit.selectedModule?.productName || 'Stellar Wallet');
      setTxStatus('IDLE');
      showToast('Wallet connected successfully', 'success');
      playTone('connect');
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      setTxStatus('IDLE');
      playTone('error');

      // Error Type 1: Extension not found/installed
      if (err.message?.includes('installed') || err.message?.includes('found') || err.message?.includes('module')) {
        setErrorMessage('Stellar Wallet Extension Not Found');
        setErrorDetails(
          'We could not detect any installed Stellar wallet extensions. Please install a compatible browser wallet extension (such as Freighter, Albedo, Hana, or xBull) and reload the page to interact with the Smart Auction House.'
        );
      } else {
        showToast(err.message || 'Wallet connection was cancelled.', 'warning');
      }
    }
  };

  const disconnectWallet = () => {
    setUserAddress(null);
    setWalletConnected(false);
    setWalletType('');
    showToast('Wallet disconnected', 'warning');
  };

  // 2. Fetch all auctions on-chain via simulation
  const fetchAuctions = async () => {
    try {
      const contract = new Contract(config.contractId);
      const dummyAccount = new Account(config.admin, '0');
      const tx = new TransactionBuilder(dummyAccount, {
        fee: '100',
        networkPassphrase: config.networkPassphrase
      })
        .addOperation(contract.call('get_all_auctions'))
        .setTimeout(30)
        .build();

      const simResponse = await server.simulateTransaction(tx);
      
      if (rpc.Api.isSimulationSuccess(simResponse)) {
        const rawList = scValToNative(simResponse.result!.retval);
        if (Array.isArray(rawList)) {
          const parsed: AuctionItem[] = rawList.map((raw: any) => ({
            id: Number(raw.id),
            creator: raw.creator,
            title: raw.title,
            minBid: raw.min_bid,
            endTime: Number(raw.end_time),
            highestBid: raw.highest_bid,
            highestBidder: raw.highest_bidder || null,
            ended: raw.ended
          }));
          setAuctions(parsed);
          
          // Auto select first item if none is selected
          if (parsed.length > 0 && selectedAuctionId === null) {
            setSelectedAuctionId(parsed[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch on-chain auctions:', err);
    }
  };

  // 3. Poll Real-time Event Stream (getEvents)
  const fetchEvents = async () => {
    try {
      const latestLedgerResp = await server.getLatestLedger();
      const currentLedger = latestLedgerResp.sequence;
      const startLedger = Math.max(1, currentLedger - 120);
      
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
                const auctionId = scValToNative(evt.topic[1]);
                const bidder = scValToNative(evt.topic[2]);
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
                  auctionId: Number(auctionId),
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
          
        parsedEvents.sort((a, b) => b.timestamp - a.timestamp);
        
        // Check for new live bids from other users
        if (isInitialEventsLoaded.current && parsedEvents.length > bidEvents.length) {
          const newest = parsedEvents[0];
          // Find the related auction
          const relevantAuction = auctions.find((a) => a.id === newest.auctionId);
          if (newest.bidder !== userAddress && relevantAuction) {
            showToast(
              `Live Update: New bid of ${stroopsToXlm(newest.amount)} XLM placed on "${relevantAuction.title}"!`,
              'info'
            );
            playTone('connect');
          }
        }

        setBidEvents(parsedEvents);
        isInitialEventsLoaded.current = true;
      }
    } catch (err) {
      console.error('Failed to fetch transaction logs:', err);
    }
  };

  // Poll state and events
  useEffect(() => {
    fetchAuctions();
    fetchEvents();

    const fastInterval = setInterval(() => {
      fetchAuctions();
      fetchEvents();
    }, 5000);

    return () => clearInterval(fastInterval);
  }, [userAddress, selectedAuctionId]);

  // Find currently selected auction details
  const activeAuction = auctions.find((a) => a.id === selectedAuctionId) || null;

  // Local calculation of countdown for selected item
  const secondsLeft = activeAuction ? Math.max(0, activeAuction.endTime - currentLedgerTime) : 0;

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 4. Place Bid Transaction
  const placeBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletConnected || !userAddress || !activeAuction) {
      showToast('Please connect your wallet first', 'warning');
      return;
    }

    const amountStroops = parseXlmToStroops(bidAmount);
    setErrorMessage(null);
    setErrorDetails(null);

    // Frontend validations
    if (amountStroops <= 0n) {
      showToast('Please enter a valid bid amount', 'error');
      playTone('error');
      return;
    }

    if (amountStroops < activeAuction.minBid) {
      showToast(`Bid must be at least the minimum of ${stroopsToXlm(activeAuction.minBid)} XLM`, 'error');
      playTone('error');
      return;
    }

    if (amountStroops <= activeAuction.highestBid) {
      showToast(`Bid must be strictly higher than the current highest bid of ${stroopsToXlm(activeAuction.highestBid)} XLM`, 'error');
      playTone('error');
      return;
    }

    setTxStatus('AWAITING_SIGNATURE');

    try {
      const account = await server.getAccount(userAddress);
      const contract = new Contract(config.contractId);
      
      const op = contract.call(
        'bid',
        Address.fromString(userAddress).toScVal(),
        nativeToScVal(activeAuction.id, { type: 'u32' }),
        nativeToScVal(amountStroops, { type: 'i128' })
      );
      
      const tx = new TransactionBuilder(account, {
        fee: '100', // base fee
        networkPassphrase: config.networkPassphrase
      })
        .addOperation(op)
        .setTimeout(180)
        .build();

      // Simulate & prepare transaction (Soroban requires this to estimate gas and allocate storage footprints)
      const preparedTx = await server.prepareTransaction(tx);
      const txXdr = preparedTx.toXDR();
      
      // Sign with kit
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(txXdr, {
        networkPassphrase: config.networkPassphrase,
        address: userAddress,
      });

      // Submit
      setTxStatus('SUBMITTING');
      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, config.networkPassphrase);
      const sendResult = await server.sendTransaction(signedTx);
      
      if (sendResult.status !== 'PENDING') {
        throw new Error(`Transaction rejected by network: ${JSON.stringify(sendResult)}`);
      }

      setTxStatus('CONFIRMING');
      setLastTxHash(sendResult.hash);

      // Poll transaction
      let retries = 24;
      let txResponse = null;
      while (retries > 0) {
        txResponse = await server.getTransaction(sendResult.hash);
        if (txResponse.status === 'SUCCESS') {
          break;
        } else if (txResponse.status === 'FAILED') {
          throw new Error('Smart contract execution panicked. Check if resources or parameters are invalid.');
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        retries--;
      }

      if (!txResponse || txResponse.status !== 'SUCCESS') {
        throw new Error('Transaction confirmation timed out on-chain.');
      }

      setTxStatus('SUCCESS');
      setBidAmount('');
      showToast('Bid placed successfully on-chain!', 'success');
      playTone('success');
      triggerConfetti();

      // Refresh data
      fetchAuctions();
      fetchEvents();

      setTimeout(() => setTxStatus('IDLE'), 6000);

    } catch (err: any) {
      console.error('Bidding transaction failed:', err);
      setTxStatus('IDLE');
      playTone('error');

      // Error Type 2: User rejected transaction signing
      if (
        err.message?.includes('reject') || 
        err.message?.includes('cancel') || 
        err.message?.includes('declined') ||
        err.message?.includes('close') ||
        err.message?.includes('User closed')
      ) {
        setErrorMessage('Transaction Signature Declined');
        setErrorDetails(
          'The transaction signing process was aborted or declined by the user inside the wallet software. No funds were moved, and the on-chain state remains unchanged.'
        );
      } 
      // Error Type 3: Insufficient balance / fees / contract errors
      else if (
        err.message?.includes('balance') || 
        err.message?.includes('underfunded') || 
        err.message?.includes('insufficient') ||
        err.message?.includes('op_underfunded')
      ) {
        setErrorMessage('Insufficient Wallet Balance');
        setErrorDetails(
          `Your connected Stellar wallet (${formatAddress(userAddress)}) does not have enough native XLM tokens to cover the bid amount (${stroopsToXlm(amountStroops)} XLM) plus the necessary network transaction fees. Please fund your address using the Testnet Friendbot and try again.`
        );
      } else {
        setErrorMessage('Transaction Failure');
        setErrorDetails(err.message || 'An unexpected Soroban RPC error occurred during simulated execution or ledger submission.');
      }
    }
  };

  // 5. Claim Auction (withdraw funds / transfer item ownership)
  const claimAuction = async () => {
    if (!walletConnected || !userAddress || !activeAuction) {
      showToast('Please connect your wallet first', 'warning');
      return;
    }

    setErrorMessage(null);
    setErrorDetails(null);
    setTxStatus('AWAITING_SIGNATURE');

    try {
      const account = await server.getAccount(userAddress);
      const contract = new Contract(config.contractId);
      
      const op = contract.call('claim', nativeToScVal(activeAuction.id, { type: 'u32' }));
      
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

      let retries = 24;
      let txResponse = null;
      while (retries > 0) {
        txResponse = await server.getTransaction(sendResult.hash);
        if (txResponse.status === 'SUCCESS') {
          break;
        } else if (txResponse.status === 'FAILED') {
          throw new Error('On-chain finalization failed inside the smart contract logic.');
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        retries--;
      }

      if (!txResponse || txResponse.status !== 'SUCCESS') {
        throw new Error('Transaction confirmation timed out.');
      }

      setTxStatus('SUCCESS');
      showToast('Auction finalized and claimed successfully!', 'success');
      playTone('success');
      triggerConfetti();

      fetchAuctions();
      fetchEvents();

      setTimeout(() => setTxStatus('IDLE'), 6000);

    } catch (err: any) {
      console.error('Finalization transaction failed:', err);
      setTxStatus('IDLE');
      playTone('error');

      if (err.message?.includes('reject') || err.message?.includes('cancel') || err.message?.includes('declined')) {
        setErrorMessage('Transaction Signature Declined');
        setErrorDetails('Finalization claim signing was cancelled by the user.');
      } else {
        setErrorMessage('Finalization Failure');
        setErrorDetails(err.message || 'An error occurred during finalization on-chain.');
      }
    }
  };

  // 6. Create / List New Auction
  const listNewAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletConnected || !userAddress) {
      showToast('Please connect your wallet first', 'warning');
      return;
    }

    if (!newTitle.trim()) {
      showToast('Please enter an item name', 'error');
      playTone('error');
      return;
    }

    const minBidStroops = parseXlmToStroops(newMinBid);
    if (minBidStroops <= 0n) {
      showToast('Minimum bid must be greater than 0 XLM', 'error');
      playTone('error');
      return;
    }

    const durationSecs = BigInt(Math.floor(Number(newDuration) * 60));
    if (durationSecs <= 0n) {
      showToast('Duration must be greater than 0', 'error');
      playTone('error');
      return;
    }

    setErrorMessage(null);
    setErrorDetails(null);
    setTxStatus('AWAITING_SIGNATURE');

    try {
      const account = await server.getAccount(userAddress);
      const contract = new Contract(config.contractId);
      
      const op = contract.call(
        'create_auction',
        Address.fromString(userAddress).toScVal(),
        nativeToScVal(newTitle.trim(), { type: 'string' }),
        nativeToScVal(minBidStroops, { type: 'i128' }),
        nativeToScVal(durationSecs, { type: 'u64' })
      );

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

      let retries = 24;
      let txResponse = null;
      while (retries > 0) {
        txResponse = await server.getTransaction(sendResult.hash);
        if (txResponse.status === 'SUCCESS') {
          break;
        } else if (txResponse.status === 'FAILED') {
          throw new Error('Failed to record new item on the Stellar ledger.');
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        retries--;
      }

      if (!txResponse || txResponse.status !== 'SUCCESS') {
        throw new Error('Listing confirmation timed out.');
      }

      // Success
      setTxStatus('SUCCESS');
      showToast('New item listed on-chain successfully!', 'success');
      playTone('success');
      triggerConfetti();

      // Reset Form and close panel
      setNewTitle('');
      setNewMinBid('10');
      setNewDuration('30');
      setIsCreateOpen(false);

      // Refresh list
      fetchAuctions();
      fetchEvents();

      setTimeout(() => setTxStatus('IDLE'), 6000);

    } catch (err: any) {
      console.error('Listing transaction failed:', err);
      setTxStatus('IDLE');
      playTone('error');

      if (err.message?.includes('reject') || err.message?.includes('cancel') || err.message?.includes('declined')) {
        setErrorMessage('Transaction Signature Declined');
        setErrorDetails('Listing authorization was declined inside your Stellar wallet.');
      } else {
        setErrorMessage('Listing Failure');
        setErrorDetails(err.message || 'An error occurred during listing simulation or submission.');
      }
    }
  };

  // Apply bid increments presets relative to current bid or minimum bid
  const applyPresetIncrement = (amountXlm: number) => {
    if (!activeAuction) return;
    const baseAmount = activeAuction.highestBid > 0n ? activeAuction.highestBid : activeAuction.minBid;
    const incrementStroops = BigInt(amountXlm) * 10000000n;
    const finalAmount = baseAmount + incrementStroops;
    setBidAmount(stroopsToXlm(finalAmount));
    showToast(`Increment applied: +${amountXlm} XLM`, 'info');
  };

  // Filter and Sort active items in the lobby
  const filteredItems = auctions
    .filter((item) => {
      const matchSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
      const isEndedLocal = item.ended || (item.endTime <= currentLedgerTime);
      if (filterStatus === 'ACTIVE') return matchSearch && !isEndedLocal;
      if (filterStatus === 'ENDED') return matchSearch && isEndedLocal;
      return matchSearch;
    })
    .sort((a, b) => {
      const aEnded = a.ended || (a.endTime <= currentLedgerTime);
      const bEnded = b.ended || (b.endTime <= currentLedgerTime);
      
      if (sortBy === 'BID_DESC') {
        return Number(b.highestBid - a.highestBid);
      }
      if (sortBy === 'TIME_ASC') {
        // Active first, ending soonest
        if (aEnded && !bEnded) return 1;
        if (!aEnded && bEnded) return -1;
        return a.endTime - b.endTime;
      }
      // ID_ASC
      return a.id - b.id;
    });

  // Calculate dynamic coordinates for selected auction SVG Line Chart
  const activeEvents = bidEvents
    .filter((evt) => evt.auctionId === selectedAuctionId)
    .sort((a, b) => a.timestamp - b.timestamp); // chronological order

  const renderSvgAnalytics = () => {
    if (!activeAuction) return null;
    
    const width = 460;
    const height = 180;
    const padding = 32;

    const basePrice = activeAuction.minBid;
    
    // Construct coordinates: add the initial state (timestamp of start/creation, starting bid)
    // and subsequent bids.
    const pricePoints: { price: number; label: string }[] = [];
    pricePoints.push({
      price: Number(stroopsToXlm(basePrice)),
      label: 'Start'
    });

    activeEvents.forEach((evt, idx) => {
      pricePoints.push({
        price: Number(stroopsToXlm(evt.amount)),
        label: `Bid ${idx + 1}`
      });
    });

    const prices = pricePoints.map((p) => p.price);
    const maxPrice = Math.max(...prices, Number(stroopsToXlm(basePrice)) * 1.5);
    const minPrice = Math.min(...prices) * 0.9;

    const priceRange = maxPrice - minPrice || 1;

    // Map each index to X coordinate, and price to Y coordinate
    const points = pricePoints.map((pt, idx) => {
      const x = padding + (idx / (pricePoints.length - 1 || 1)) * (width - padding * 2);
      const y = height - padding - ((pt.price - minPrice) / priceRange) * (height - padding * 2);
      return { x, y, price: pt.price, label: pt.label };
    });

    // Create SVG path string
    let pathD = '';
    let areaD = '';
    if (points.length > 0) {
      pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
      areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
    }

    return (
      <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.8rem', fontFamily: 'var(--font-mono)' }}>
          <TrendingUp size={16} style={{ color: 'var(--cyan)' }} />
          Bid Velocity Analytics
        </h3>
        
        <div style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', padding: '0.75rem', position: 'relative' }}>
          {points.length <= 1 ? (
            <div style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', gap: '0.25rem' }}>
              <TrendingUp size={24} style={{ opacity: 0.3 }} />
              <span>Awaiting bid activity to plot velocity.</span>
            </div>
          ) : (
            <svg width="100%" height="180" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', overflow: 'visible' }}>
              <defs>
                <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--purple)" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--cyan)" />
                  <stop offset="100%" stopColor="var(--pink)" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3" />
              <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3" />
              <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

              {/* Area path */}
              <path d={areaD} fill="url(#chartGlow)" />

              {/* Line path */}
              <path d={pathD} fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

              {/* Node points */}
              {points.map((pt, idx) => (
                <g key={idx}>
                  <circle cx={pt.x} cy={pt.y} r="5" fill="#07050d" stroke="var(--cyan)" strokeWidth="2" />
                  <text x={pt.x} y={pt.y - 10} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="var(--font-mono)">
                    {pt.price}
                  </text>
                  <text x={pt.x} y={height - padding + 15} textAnchor="middle" fill="var(--text-secondary)" fontSize="8" fontFamily="var(--font-mono)">
                    {pt.label}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Background ambient glow circles */}
      <div className="bg-ambient-glow glow-purple"></div>
      <div className="bg-ambient-glow glow-cyan"></div>

      {/* Floating Canvas for Confetti */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 9999
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type === 'success' ? 'toast-success' : ''}`}>
            <AlertCircle size={20} className={toast.type === 'success' ? 'text-green' : 'text-cyan'} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>
                {toast.type.toUpperCase()}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {toast.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header bar */}
      <header className="header">
        <div className="brand">
          <Hammer size={28} style={{ color: 'var(--cyan)' }} />
          <span className="brand-logo">StellarBid</span>
          <span className="brand-badge">Stellar Soroban</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Audio toggle button */}
          <button
            className="btn btn-secondary"
            onClick={() => setIsMuted(!isMuted)}
            style={{ padding: '0.6rem 0.8rem', borderRadius: '10px' }}
            title={isMuted ? 'Unmute SFX' : 'Mute SFX'}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} style={{ color: 'var(--cyan)' }} />}
          </button>

          {walletConnected && userAddress ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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

      {/* Warning/Error Box Area */}
      {errorMessage && (
        <div style={{ background: 'rgba(255, 51, 102, 0.08)', border: '1px solid var(--red)', borderRadius: '14px', padding: '1.25rem', marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
          <AlertCircle size={24} style={{ color: 'var(--red)', flexShrink: 0, marginTop: '0.1rem' }} />
          <div>
            <h4 style={{ color: 'white', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.25rem' }}>{errorMessage}</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.4' }}>{errorDetails}</p>
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setErrorMessage(null);
                  setErrorDetails(null);
                }}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }}
              >
                Dismiss Alert
              </button>
              {errorMessage.includes('Not Found') && (
                <a
                  href="https://www.stellar.org/products-and-tools/freighter"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', textDecoration: 'none' }}
                >
                  Download Freighter
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters for Lobby */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search items by keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '0.5rem 0.8rem', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.25rem' }}>
          {/* Filter Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Status:</span>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.25rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '0.25rem' }}>
              {(['ALL', 'ACTIVE', 'ENDED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  style={{
                    background: filterStatus === s ? 'rgba(124, 77, 255, 0.2)' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    color: filterStatus === s ? 'white' : 'var(--text-secondary)',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Sort Option */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              style={{
                background: 'rgba(7, 5, 13, 0.7)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ID_ASC">Newest First</option>
              <option value="BID_DESC">Highest Bid Value</option>
              <option value="TIME_ASC">Ending Soonest</option>
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => setIsCreateOpen(!isCreateOpen)}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            List Asset
          </button>
        </div>
      </div>

      {/* List Asset Form Expansion */}
      {isCreateOpen && (
        <div className="glass-panel" style={{ marginBottom: '2rem', border: '1px solid var(--purple)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={20} style={{ color: 'var(--cyan)' }} />
              List New Asset On-Chain
            </h3>
            <button
              onClick={() => setIsCreateOpen(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              Cancel
            </button>
          </div>

          <form onSubmit={listNewAuction} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Asset Title / Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Genesis Cube #001"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{ padding: '0.6rem 0.9rem', fontSize: '0.95rem' }}
              />
            </div>

            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Minimum Opening Bid (XLM)</label>
              <div className="input-wrapper">
                <input
                  type="number"
                  step="0.1"
                  className="input-field"
                  value={newMinBid}
                  onChange={(e) => setNewMinBid(e.target.value)}
                  style={{ padding: '0.6rem 0.9rem', fontSize: '0.95rem' }}
                />
                <span className="input-suffix">XLM</span>
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Duration Time (Minutes)</label>
              <div className="input-wrapper">
                <input
                  type="number"
                  className="input-field"
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  style={{ padding: '0.6rem 0.9rem', fontSize: '0.95rem' }}
                />
                <span className="input-suffix">Min</span>
              </div>
            </div>

            <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.8rem 2rem' }}>
                Deploy to Stellar Ledger
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Active Lobby Items Grid */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
          <Layers size={20} style={{ color: 'var(--cyan)' }} />
          Stellar Auction Lobby ({filteredItems.length} listed)
        </h2>

        {filteredItems.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '16px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No listed assets found matching current criteria. Try adjusting the search filters or list a new item.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {filteredItems.map((item) => {
              const itemSeconds = Math.max(0, item.endTime - currentLedgerTime);
              const isEndedLocal = item.ended || (itemSeconds <= 0);
              const isSelected = selectedAuctionId === item.id;
              
              // Dynamic rarity indicator based on minimum bid
              let rarityLabel = 'Common';
              let rarityColor = 'var(--text-secondary)';
              if (item.minBid >= 500000000n) {
                rarityLabel = 'Legendary';
                rarityColor = 'var(--pink)';
              } else if (item.minBid >= 250000000n) {
                rarityLabel = 'Rare';
                rarityColor = 'var(--cyan)';
              } else if (item.minBid >= 100000000n) {
                rarityLabel = 'Uncommon';
                rarityColor = 'var(--purple)';
              }

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedAuctionId(item.id)}
                  className="glass-panel"
                  style={{
                    padding: '1.25rem',
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--cyan)' : 'var(--border-color)',
                    boxShadow: isSelected ? '0 0 15px rgba(0, 242, 254, 0.15)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    background: isSelected ? 'rgba(14, 11, 26, 0.95)' : 'var(--bg-panel)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.65rem', color: rarityColor, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {rarityLabel}
                      </span>
                      <span className={`status-badge ${isEndedLocal ? 'status-ended' : 'status-active'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem' }}>
                        {isEndedLocal ? 'Closed' : 'Active'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.05rem', color: 'white', marginBottom: '0.4rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </h3>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Creator: {formatAddress(item.creator)}
                    </p>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                        {item.highestBid > 0n ? 'Highest Bid' : 'Starting Bid'}
                      </p>
                      <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>
                        {stroopsToXlm(item.highestBid > 0n ? item.highestBid : item.minBid)} <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>XLM</span>
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                        Time Remaining
                      </p>
                      <p style={{ fontSize: '1rem', fontWeight: 700, color: isEndedLocal ? 'var(--red)' : 'var(--yellow)', fontFamily: 'var(--font-mono)' }}>
                        {isEndedLocal ? '00:00:00' : formatCountdown(itemSeconds)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Selected Asset Panel Details */}
      {activeAuction ? (
        <main className="grid-2col">
          {/* Left Column: Asset Detail */}
          <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Smart Auction Details
                </span>
                <span className={`status-badge ${(activeAuction.ended || secondsLeft <= 0) ? 'status-ended' : 'status-active'}`}>
                  <span className="status-dot"></span>
                  {(activeAuction.ended || secondsLeft <= 0) ? 'Closed' : 'Active'}
                </span>
              </div>
              <h1 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>
                {activeAuction.title}
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                This asset details are managed directly on the Stellar blockchain network. When a new bid is processed, the smart contract automatically claims funds into escrow, and instantly returns the previous highest bidder's XLM tokens to their address.
              </p>
            </div>

            {/* Smart graphic placeholder based on ID */}
            <div style={{ width: '100%', height: '260px', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
              <img 
                src={
                  activeAuction.id === 1
                    ? '/aether_gavel.png'
                    : activeAuction.id === 2
                      ? 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1964&auto=format&fit=cover'
                      : 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?q=80&w=1964&auto=format&fit=cover'
                } 
                alt="StellarBid" 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?q=80&w=1964&auto=format&fit=cover';
                }}
              />
              <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', background: 'rgba(7, 5, 13, 0.85)', backdropFilter: 'blur(8px)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  On-Chain ID: {activeAuction.id}
                </span>
              </div>
            </div>

            {/* Analytics visualization */}
            {renderSvgAnalytics()}

            {/* Contract info list */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  Creator address
                </p>
                <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'white', textOverflow: 'ellipsis', overflow: 'hidden' }} title={activeAuction.creator}>
                  {formatAddress(activeAuction.creator)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  Asset Currency
                </p>
                <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
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
                    <TrendingUp size={14} style={{ color: 'var(--cyan)' }} /> Current Highest
                  </p>
                  <p style={{ fontSize: '2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.5px', marginTop: '0.25rem' }}>
                    {stroopsToXlm(activeAuction.highestBid > 0n ? activeAuction.highestBid : activeAuction.minBid)} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>XLM</span>
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                    <User size={12} />
                    {activeAuction.highestBidder ? `by ${formatAddress(activeAuction.highestBidder)}` : 'No bids placed yet'}
                  </p>
                </div>

                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                    <Clock size={14} style={{ color: 'var(--pink)' }} /> Time Left
                  </p>
                  <p style={{ fontSize: '2rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-mono)', letterSpacing: '-0.5px', marginTop: '0.25rem' }}>
                    {formatCountdown(secondsLeft)}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {activeAuction.ended ? 'Auction Claimed' : secondsLeft <= 0 ? 'Expired' : 'Live Syncing'}
                  </p>
                </div>
              </div>

              {/* Bidding Form / Status Action */}
              {!activeAuction.ended && secondsLeft > 0 ? (
                <form onSubmit={placeBid}>
                  <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="input-label">Your Bid Amount</label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        Min: {stroopsToXlm(activeAuction.highestBid > 0n ? activeAuction.highestBid + 10000000n : activeAuction.minBid)} XLM
                      </span>
                    </div>
                    <div className="input-wrapper">
                      <input
                        type="number"
                        step="0.1"
                        className="input-field"
                        placeholder={`e.g. ${stroopsToXlm((activeAuction.highestBid > 0n ? activeAuction.highestBid : activeAuction.minBid) + 10000000n)}`}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        disabled={txStatus !== 'IDLE'}
                      />
                      <span className="input-suffix">XLM</span>
                    </div>
                  </div>

                  {/* Preset increments */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <button type="button" onClick={() => applyPresetIncrement(5)} className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }}>
                      +5 XLM
                    </button>
                    <button type="button" onClick={() => applyPresetIncrement(10)} className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }}>
                      +10 XLM
                    </button>
                    <button type="button" onClick={() => applyPresetIncrement(50)} className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }}>
                      +50 XLM
                    </button>
                  </div>

                  <button 
                    type="submit" 
                    className={`btn btn-primary ${txStatus !== 'IDLE' ? 'btn-disabled' : ''}`} 
                    style={{ width: '100%', padding: '1rem' }}
                    disabled={txStatus !== 'IDLE'}
                  >
                    <Hammer size={18} />
                    {txStatus === 'IDLE' ? 'Place Bid' : 'Confirming on Ledger...'}
                  </button>
                </form>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center' }}>
                  <Award size={36} style={{ color: 'var(--yellow)', marginBottom: '0.5rem', display: 'inline-block' }} />
                  <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '0.25rem' }}>
                    This Auction Has Expired
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    {activeAuction.highestBidder 
                      ? `Winner: ${formatAddress(activeAuction.highestBidder)} with a bid of ${stroopsToXlm(activeAuction.highestBid)} XLM.` 
                      : 'No bids were submitted for this asset.'}
                  </p>
                  
                  {/* Claim Button */}
                  {!activeAuction.ended && (
                    <button
                      className={`btn btn-primary ${txStatus !== 'IDLE' ? 'btn-disabled' : ''}`}
                      onClick={claimAuction}
                      style={{ width: '100%' }}
                      disabled={txStatus !== 'IDLE'}
                    >
                      <Sparkles size={16} />
                      Finalize Auction & Distribute Escrow
                    </button>
                  )}

                  {activeAuction.ended && (
                    <div style={{ color: 'var(--green)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                      Finalized & Settled On-Chain
                    </div>
                  )}
                </div>
              )}

              {/* Transaction lifecycle indicators */}
              {txStatus !== 'IDLE' && (
                <div className="tracker">
                  <span className="tracker-title">Stellar Transaction Lifecycle</span>
                  
                  <div className={`tracker-step ${txStatus === 'CONNECTING_WALLET' ? 'step-active' : ''} ${txStatus !== 'CONNECTING_WALLET' ? 'step-completed' : ''}`}>
                    <span className="step-indicator">1</span>
                    <span className="step-text">Confirming Wallet Authorization</span>
                  </div>
                  
                  <div className={`tracker-step ${txStatus === 'AWAITING_SIGNATURE' ? 'step-active' : ''} ${['SUBMITTING', 'CONFIRMING', 'SUCCESS'].includes(txStatus) ? 'step-completed' : ''}`}>
                    <span className="step-indicator">2</span>
                    <span className="step-text">Awaiting Signature confirmation (extension modal)</span>
                  </div>
                  
                  <div className={`tracker-step ${txStatus === 'SUBMITTING' ? 'step-active' : ''} ${['CONFIRMING', 'SUCCESS'].includes(txStatus) ? 'step-completed' : ''}`}>
                    <span className="step-indicator">3</span>
                    <span className="step-text">Submitting to Testnet validators</span>
                  </div>
                  
                  <div className={`tracker-step ${txStatus === 'CONFIRMING' ? 'step-active' : ''} ${txStatus === 'SUCCESS' ? 'step-completed' : ''}`}>
                    <span className="step-indicator">4</span>
                    <span className="step-text">Securing transaction ledger inclusion</span>
                  </div>

                  {lastTxHash && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <a 
                        href={`https://stellar.expert/explorer/testnet/tx/${lastTxHash}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        style={{ fontSize: '0.75rem', color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}
                      >
                        Verify on Stellar.expert <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Item Bids Feed */}
            <div className="glass-panel event-feed" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={18} style={{ color: 'var(--cyan)' }} />
                  Bidding Log for this Item
                </h2>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <RefreshCw size={10} className="status-dot" /> Live
                </span>
              </div>

              <div className="event-list" style={{ maxHeight: '220px' }}>
                {activeEvents.length > 0 ? (
                  activeEvents.map((evt) => (
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
                        <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--green)' }}>
                          +{stroopsToXlm(evt.amount)} XLM
                        </p>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          {new Date(evt.timestamp * 1000).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '2rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: '1px', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                    No bidding events recorded yet.
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '16px', padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Please select an auction from the lobby grid above to view details and place bids.
        </div>
      )}
    </div>
  );
}
