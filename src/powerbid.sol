pragma solidity >=0.4.22 <0.7.0;

contract PowerBid {
    // Parameters of the auction. Times are either
    // absolute unix timestamps (seconds since 1970-01-01)
    // or time periods in seconds.
    address payable public consumer;
    uint public consumptionStartTime; // t0
    uint public consumptionEndTime;  // t1
    uint public requiredNRG; // in watts hour 
    uint public maxPrice;  // max flat rate price for watts * hours (t1-t0) in the given period

    // Current state of the auction.
    address payable public bestSupplier;
    uint public bestPrice;

    // Set to true at the end, disallows any change.
    // By default initialized to `false`.
    bool auctionEnded;
    bool powerConsumed;
    uint gain;
    uint price;

    // Events that will be emitted on changes.
    event BestPriceUpdated(address bidder, uint amount);
    event AuctionEnded(address winner, uint amount);
    event Consumed(address consumer, address supplier, uint amount,uint price);

    /// Create a power bidding auction with `_consumptionStartTime`
    /// that represents the start time of the future consumption with  `_consumptionEndTimeseconds` 
    /// as the end time. `_requiredEnergy` is the amount of energy required between `_consumptionEndTimeseconds`  - `_consumptionStartTime`
    /// on a flat rate
    constructor(
        uint auctionPeriodSeconds,
        uint consumptionPeriodSeconds,
        uint requiredEnergy
    ) public payable {
        require(requiredEnergy > 0, "required energy must be greater than 0 wh");
        require(msg.value > 0 ,"max price must be greater than 0");
        consumer = msg.sender;
        maxPrice = msg.value;
        requiredNRG = requiredEnergy;
        consumptionStartTime = now + auctionPeriodSeconds;
        consumptionEndTime = consumptionStartTime + consumptionPeriodSeconds;
    }

    /// Bid on the auction 
    function bid(uint _price) public {
        // No arguments are necessary, all
        // information is already part of
        // the transaction. Function is not reciving Ether
        // as the consumer pays

        // Revert the call if the bidding
        // period is over.
        require(
            now < consumptionStartTime,
            "Auction already ended."
        );

        // If the price is not better, snd the
        // money back.
        require(
            _price < bestPrice || (bestSupplier == address(0) && _price <= maxPrice),
            "There already is a better price."
        );
        
        require(!auctionEnded, "can't bid on an auction that has ended");

        bestPrice = _price;
        bestSupplier = msg.sender;
        emit BestPriceUpdated(msg.sender, bestPrice);
    }


    /// Withdraw the gain by the sender.
    function withdraw_gain() public returns (bool) {
        require(auctionEnded);
        require(msg.sender == consumer);
        require(gain > 0)
        
        uint amount = gain;
        gain = 0;
        msg.sender.transfer(amount);
        
        return true;
    }
    
    // withdraw price of energy by the best supplier
    function withdraw() public returns (bool) {
        require(powerConsumed);
        require(msg.sender == bestSupplier);
        require(price > 0)

        uint amount = price;
        price = 0;       
        msg.sender.transfer(amount);

        return true;
    }

    

    /// End the auction
    function auctionEnd() public {
        // It is a good guideline to structure functions that interact
        // with other contracts (i.e. they call functions or send Ether)
        // into three phases:
        // 1. checking conditions
        // 2. performing actions (potentially changing conditions)
        // 3. interacting with other contracts
        // If these phases are mixed up, the other contract could call
        // back into the current contract and modify the state or cause
        // effects (ether payout) to be performed multiple times.
        // If functions called internally include interaction with external
        // contracts, they also have to be considered interaction with
        // external contracts.

        // 1. Conditions
        require(now >= consumptionStartTime, "Auction not yet ended.");
        require(!auctionEnded, "auctionEnd has already been called.");

        // 2. Effects
        // If no bids have been received send back the money to the consumer
        if(bestSupplier == address(0)){
            powerConsumed = true;
            auctionEnded = true;
        }else{
            auctionEnded = true;
        }
        
        gain = maxPrice - bestPrice;
        price = bestPrice;

        emit AuctionEnded(bestSupplier, bestPrice);
    }
    
    function auction_time_left() public view returns (uint) {
        if(now > consumptionStartTime)return 0;
        else return consumptionStartTime - now;
    }
    
    function consumePower() public
    {
        //1. Conditions
        require(consumer == msg.sender,"Only consumer can consume the negotiated power");
        require(auctionEnded, "Auciton has not ended yet");
        require(!powerConsumed, "power already consumed");

        //2. Effects
        powerConsumed = true;
        
        emit Consumed(msg.sender, bestSupplier,requiredNRG,bestPrice);
    }
}