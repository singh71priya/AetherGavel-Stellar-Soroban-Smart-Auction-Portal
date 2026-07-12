#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, String, Symbol};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Title,
    MinBid,
    EndTime,
    HighestBid,
    HighestBidder,
    Ended,
    Initialized,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionState {
    pub admin: Address,
    pub token: Address,
    pub title: String,
    pub min_bid: i128,
    pub end_time: u64,
    pub highest_bid: i128,
    pub highest_bidder: Option<Address>,
    pub ended: bool,
    pub current_time: u64,
}

#[contract]
pub struct AetherGavelContract;

#[contractimpl]
impl AetherGavelContract {
    /// Initialize the auction. Can only be called once.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        title: String,
        min_bid: i128,
        duration_secs: u64,
    ) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("Auction already initialized");
        }

        let current_time = env.ledger().timestamp();
        let end_time = current_time + duration_secs;

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Title, &title);
        env.storage().instance().set(&DataKey::MinBid, &min_bid);
        env.storage().instance().set(&DataKey::EndTime, &end_time);
        env.storage().instance().set(&DataKey::HighestBid, &0_i128);
        env.storage().instance().set(&DataKey::Ended, &false);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// Place a bid on the auction.
    pub fn bid(env: Env, bidder: Address, amount: i128) {
        bidder.require_auth();

        // 1. Check initialization
        if !env.storage().instance().has(&DataKey::Initialized) {
            panic!("Auction not initialized");
        }

        // 2. Check active status (not ended and time hasn't expired)
        let ended: bool = env.storage().instance().get(&DataKey::Ended).unwrap_or(false);
        if ended {
            panic!("Auction already ended");
        }

        let end_time: u64 = env.storage().instance().get(&DataKey::EndTime).unwrap();
        let current_time = env.ledger().timestamp();
        if current_time >= end_time {
            panic!("Auction time has expired");
        }

        // 3. Verify bid amount is greater than current highest bid and >= min bid
        let min_bid: i128 = env.storage().instance().get(&DataKey::MinBid).unwrap();
        if amount < min_bid {
            panic!("Bid amount is lower than minimum bid");
        }

        let highest_bid: i128 = env.storage().instance().get(&DataKey::HighestBid).unwrap_or(0);
        if amount <= highest_bid {
            panic!("Bid amount must be strictly greater than current highest bid");
        }

        // 4. Handle token transfers
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        // Transfer new bid tokens from bidder to this contract
        token_client.transfer(&bidder, &env.current_contract_address(), &amount);

        // Refund the previous highest bidder, if they exist
        let prev_bidder: Option<Address> = env.storage().instance().get(&DataKey::HighestBidder);
        if let Some(prev) = prev_bidder {
            if highest_bid > 0 {
                token_client.transfer(&env.current_contract_address(), &prev, &highest_bid);
            }
        }

        // 5. Update state
        env.storage().instance().set(&DataKey::HighestBid, &amount);
        env.storage().instance().set(&DataKey::HighestBidder, &bidder);

        // 6. Emit events for real-time synchronization
        env.events().publish(
            (Symbol::new(&env, "bid_placed"), bidder.clone()),
            (amount, current_time),
        );
    }

    /// Claim the highest bid (seller claims funds) and close the auction.
    /// Can only be called after the auction end time.
    pub fn claim(env: Env) {
        if !env.storage().instance().has(&DataKey::Initialized) {
            panic!("Auction not initialized");
        }

        let ended: bool = env.storage().instance().get(&DataKey::Ended).unwrap_or(false);
        if ended {
            panic!("Auction already claimed");
        }

        let end_time: u64 = env.storage().instance().get(&DataKey::EndTime).unwrap();
        let current_time = env.ledger().timestamp();
        if current_time < end_time {
            panic!("Auction has not ended yet");
        }

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        let highest_bid: i128 = env.storage().instance().get(&DataKey::HighestBid).unwrap_or(0);

        if highest_bid > 0 {
            let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
            let token_client = token::Client::new(&env, &token_addr);
            // Transfer winning bid amount to admin/seller
            token_client.transfer(&env.current_contract_address(), &admin, &highest_bid);
        }

        env.storage().instance().set(&DataKey::Ended, &true);

        let winner: Option<Address> = env.storage().instance().get(&DataKey::HighestBidder);
        env.events().publish(
            (Symbol::new(&env, "auction_claimed"), admin),
            (winner, highest_bid, current_time),
        );
    }

    /// Retrieve the current state of the auction.
    pub fn get_state(env: Env) -> AuctionState {
        let default_addr = env.current_contract_address(); // safe fallback before init
        let admin = env.storage().instance().get(&DataKey::Admin).unwrap_or_else(|| default_addr.clone());
        let token = env.storage().instance().get(&DataKey::Token).unwrap_or_else(|| default_addr.clone());
        let title = env.storage().instance().get(&DataKey::Title).unwrap_or_else(|| String::from_str(&env, "Uninitialized"));
        let min_bid = env.storage().instance().get(&DataKey::MinBid).unwrap_or(0);
        let end_time = env.storage().instance().get(&DataKey::EndTime).unwrap_or(0);
        let highest_bid = env.storage().instance().get(&DataKey::HighestBid).unwrap_or(0);
        let highest_bidder = env.storage().instance().get(&DataKey::HighestBidder);
        let ended = env.storage().instance().get(&DataKey::Ended).unwrap_or(false);
        let current_time = env.ledger().timestamp();

        AuctionState {
            admin,
            token,
            title,
            min_bid,
            end_time,
            highest_bid,
            highest_bidder,
            ended,
            current_time,
        }
    }
}
