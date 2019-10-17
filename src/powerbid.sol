pragma solidity >=0.4.22 <0.7.0;

contract PowerBid {
    
    enum Phase {
        AUCTION,
        CONSUMPTION,
        FINISHED,
        GAIN_WITHDRAWN, 
        PRICE_WITHDRAWN,
        COMPLETED,
        VIOLATED,
        VIOLATION_RESOLVED}
    // Parameters of the auction. Times are either
    // absolute unix timestamps (seconds since 1970-01-01)
    // or time periods in seconds.
    address payable public consumer;
    uint public auctionStartTime;
    uint public consumptionStartTime; // t0
    uint public consumptionEndTime;  // t1
    uint public requiredNRG; // in watts hour 
    uint public maxPrice;  // max flat rate price for watts * hours (t1-t0) in the given period

    // Current state of the auction.
    address payable public bestSupplier;
    uint public bestPrice;
    Phase public state;
    uint public auctionEndTime;
    uint public consumptionTime;

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
        require(auctionPeriodSeconds > 0, "auction period must be greater than 0");
        require(consumptionPeriodSeconds > 0, "consumption period must be greater than 0");
        consumer = msg.sender;
        maxPrice = msg.value;
        requiredNRG = requiredEnergy;
        auctionStartTime = now;
        consumptionStartTime = now + auctionPeriodSeconds;
        consumptionEndTime = consumptionStartTime + consumptionPeriodSeconds;
        state = Phase.AUCTION;
        auctionEndTime = consumptionTime = 0;
    }

    /// Bid on the auction 
    function bid(uint _price) public {
        // No arguments are necessary, all
        // information is already part of
        // the transaction. Function is not reciving Ether
        // as the consumer pays

        // Revert the call if the bidding
        // period is over.
        require(state == Phase.AUCTION, "Auction already ended.");
        // Don't allow self bids
        require(msg.sender != consumer);
        // no free power
        require(_price > 0);
        // If the price is not better, send the
        // money back.
        require(
            _price < bestPrice || (bestSupplier == address(0) && _price <= maxPrice),
            "There already is a better price."
        );

        bestPrice = _price;
        bestSupplier = msg.sender;
        emit BestPriceUpdated(msg.sender, bestPrice);
    }


    function auctionEnd() public{
        require(state == Phase.AUCTION);
        if(msg.sender == consumer){
            auctionEndTime = now;
            state = auctionEndTime >= consumptionStartTime ? Phase.CONSUMPTION : Phase.VIOLATED;
        }else if(now >= consumptionStartTime){
            auctionEndTime = now;
            state = Phase.CONSUMPTION;
        }
    }

    function isValidWithdrawGain() private view returns(bool){
        return  state != Phase.GAIN_WITHDRAWN  && 
                state != Phase.COMPLETED && 
                state != Phase.VIOLATED && 
                state != Phase.VIOLATION_RESOLVED;
    }

    function isValidWithdraw() private view returns(bool){
        return  state != Phase.PRICE_WITHDRAWN  && 
                state != Phase.COMPLETED && 
                state != Phase.VIOLATED && 
                state != Phase.VIOLATION_RESOLVED;
    }
    function setEndTimes() private{
        if(auctionEndTime == 0){
            auctionEndTime = consumptionStartTime;
        }
        if(consumptionTime == 0){
            consumptionTime = consumptionEndTime;
        }
    }
    /// Withdraw the gain by the sender.
    function withdrawGain() public returns (bool) {
        require(msg.sender == consumer);
        require(isValidWithdrawGain(), "gain can't be withdrawn");
        if(now >= consumptionEndTime){
            setEndTimes();
            uint amount = maxPrice - bestPrice;
            state = state == Phase.PRICE_WITHDRAWN ? Phase.COMPLETED : Phase.GAIN_WITHDRAWN;
            msg.sender.transfer(amount);
            return true;
        }
        return false;
    }
    
    // withdraw price of energy by the best supplier
    function withdraw() public returns (bool) {
        require(msg.sender == bestSupplier);
        require(isValidWithdraw(), "price can't be withdrawn");
        if(now >= consumptionEndTime){
            setEndTimes();
            uint amount = bestPrice;
            state = state == Phase.GAIN_WITHDRAWN ? Phase.COMPLETED : Phase.PRICE_WITHDRAWN;
            msg.sender.transfer(amount);
            return true;
        }
        return false;
    }
    
    function auctionStatus() public view returns (uint,address,address,uint,uint){
        return (consumptionStartTime,bestSupplier,consumer,bestPrice,consumptionEndTime);
    }

    function withdrawableAmount() public view returns (uint){
        if(!isValidWithdraw()) return 0;
        else return bestPrice;
    }

    function withdrawableGain() public view returns (uint){
        if(!isValidWithdrawGain()) return 0;
        else return maxPrice - bestPrice;
    }

    function consumePower() public
    {
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

        //1. Conditions
        require(state == Phase.CONSUMPTION || state == Phase.AUCTION, "Auction has not ended yet");

        //2. Effects
        if(consumer == msg.sender && now < consumptionStartTime){
            auctionEndTime = now;
            consumptionTime = now;
            state = Phase.VIOLATED;
        } else if(consumer == msg.sender && now >= consumptionStartTime){
            state = Phase.FINISHED;
            consumptionTime = now;
            emit Consumed(msg.sender, bestSupplier,requiredNRG,bestPrice);
        }else if(now >= consumptionEndTime) {
            consumptionTime = consumptionEndTime;
            state = Phase.FINISHED;
        }
    }

    function resolveViolation() public {
        require(state == Phase.VIOLATED);
        if(bestSupplier != address(0)){
            bestSupplier.transfer(bestPrice);
        }
        consumer.transfer(maxPrice-bestPrice);
        state = Phase.VIOLATION_RESOLVED;
    }

    function destroy() public {
        // Should be a 3rd party, trusted static account
        // that will resolve the payments
        require(msg.sender == consumer);
        selfdestruct(consumer);
    }
}