#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, String, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionDetails {
    pub id: u32,
    pub creator: Address,
    pub title: String,
    pub min_bid: i128,
    pub end_time: u64,
    pub highest_bid: i128,
    pub highest_bidder: Option<Address>,
    pub ended: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    NextId,
    Auction(u32),
    Token,
}

#[contract]
pub struct AetherGavelContract;

#[contractimpl]
impl AetherGavelContract {
    /// Initialize the contract globally with the bidding token.
    pub fn initialize(env: Env, token: Address) {
        if env.storage().instance().has(&DataKey::Token) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &1_u32);
    }

    /// Create a new auction on-chain. Returns the new auction ID.
    pub fn create_auction(
        env: Env,
        creator: Address,
        title: String,
        min_bid: i128,
        duration_secs: u64,
    ) -> u32 {
        creator.require_auth();

        let next_id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        let end_time = env.ledger().timestamp() + duration_secs;

        let auction = AuctionDetails {
            id: next_id,
            creator: creator.clone(),
            title,
            min_bid,
            end_time,
            highest_bid: 0,
            highest_bidder: None,
            ended: false,
        };

        env.storage().instance().set(&DataKey::Auction(next_id), &auction);
        env.storage().instance().set(&DataKey::NextId, &(next_id + 1));

        // Emit dynamic auction creation event
        env.events().publish(
            (Symbol::new(&env, "auction_created"), next_id),
            (creator, end_time),
        );

        next_id
    }

    /// Place a bid on a specific auction.
    pub fn bid(env: Env, bidder: Address, auction_id: u32, amount: i128) {
        bidder.require_auth();

        let mut auction: AuctionDetails = env
            .storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        if auction.ended {
            panic!("Auction already ended");
        }

        let current_time = env.ledger().timestamp();
        if current_time >= auction.end_time {
            panic!("Auction time has expired");
        }

        if amount < auction.min_bid {
            panic!("Bid is below minimum bid amount");
        }

        if amount <= auction.highest_bid {
            panic!("Bid must be strictly higher than the current highest bid");
        }

        // Perform token operations
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        // Transfer new bid tokens from bidder to the contract
        token_client.transfer(&bidder, &env.current_contract_address(), &amount);

        // Refund the previous highest bidder if one exists
        if let Some(prev_bidder) = auction.highest_bidder {
            if auction.highest_bid > 0 {
                token_client.transfer(&env.current_contract_address(), &prev_bidder, &auction.highest_bid);
            }
        }

        // Update auction details
        auction.highest_bid = amount;
        auction.highest_bidder = Some(bidder.clone());

        env.storage().instance().set(&DataKey::Auction(auction_id), &auction);

        // Emit events matching format: topic: ("bid_placed", auction_id, bidder), value: (amount, current_time)
        env.events().publish(
            (Symbol::new(&env, "bid_placed"), auction_id, bidder),
            (amount, current_time),
        );
    }

    /// Claim the highest bid for a specific auction ID.
    pub fn claim(env: Env, auction_id: u32) {
        let mut auction: AuctionDetails = env
            .storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        if auction.ended {
            panic!("Auction already claimed");
        }

        let current_time = env.ledger().timestamp();
        if current_time < auction.end_time {
            panic!("Auction has not ended yet");
        }

        if auction.highest_bid > 0 {
            let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
            let token_client = token::Client::new(&env, &token_addr);
            // Transfer winning bid amount to creator (seller)
            token_client.transfer(&env.current_contract_address(), &auction.creator, &auction.highest_bid);
        }

        auction.ended = true;
        env.storage().instance().set(&DataKey::Auction(auction_id), &auction);

        env.events().publish(
            (Symbol::new(&env, "auction_claimed"), auction_id, auction.creator.clone()),
            (auction.highest_bidder.clone(), auction.highest_bid, current_time),
        );
    }

    /// Retrieve details of a single auction.
    pub fn get_auction(env: Env, auction_id: u32) -> AuctionDetails {
        env.storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"))
    }

    /// Retrieve all registered auctions.
    pub fn get_all_auctions(env: Env) -> Vec<AuctionDetails> {
        let next_id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        let mut list = Vec::new(&env);
        for id in 1..next_id {
            if let Some(auction) = env.storage().instance().get::<_, AuctionDetails>(&DataKey::Auction(id)) {
                list.push_back(auction);
            }
        }
        list
    }
}
