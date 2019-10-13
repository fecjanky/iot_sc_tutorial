pragma solidity >=0.4.22 <0.7.0;

contract NumberGuessingGame {
    struct Result{
        address guesser;
        uint guess;
        bool valid;
    }
    struct Guess{
        bool guessed;
    }
    address public owner;
    uint public maxNumberOfGuesses;
    uint public numberOfGuesses;
    uint public prize;
    
    // Non public members
    uint highestGuess;
    // Keep track of addresses that already guessed
    mapping(address => Guess) guessed;
    // linear index to guessed number mapping
    mapping(uint => uint) guessMapping;
    // the guessed number to results mapping
    mapping (uint => Result) results;


    constructor(uint maxNumberOfGuesses_) public payable {
        require(maxNumberOfGuesses_ > 0, "maxNumberOfGuesses_ must be greater than 0");
        require(msg.value > 0, "prize must be greater than 0");
        owner = msg.sender;
        maxNumberOfGuesses = maxNumberOfGuesses_;
        numberOfGuesses = 0;
        prize = msg.value;
        highestGuess = 0;
    }

    function guess(uint guess_) public {
        Guess storage sender = guessed[msg.sender];
        require(!sender.guessed, "already guessed");
        require(numberOfGuesses < maxNumberOfGuesses, "game is over");
        guessMapping[numberOfGuesses] = guess_;
        Result storage res = results[guess_];
        if(res.guesser == address(0)){
            res.guesser = msg.sender;
            res.guess = guess_;
            res.valid = true;
        }else{
            res.valid = false;
        }
        if(guess_ > highestGuess)
        {
            highestGuess = guess_;
        }
        sender.guessed = true;
        numberOfGuesses++;
    }

    function forceEndGame() public
    {
        require(msg.sender == owner,"only the owner can force end game");
        require(maxNumberOfGuesses > numberOfGuesses, "game has alredy ended");
        maxNumberOfGuesses = numberOfGuesses;
    }

    function result() public view returns(uint,address) {
        // not allowed to get results while game is ongoing
        if(numberOfGuesses < maxNumberOfGuesses){
            return (0,address(0));
        }
        address winner = address(0);
        uint winnerGuess = highestGuess;
        for(uint i = 0;i < numberOfGuesses; i++)
        {
             Result storage res = results[guessMapping[i]];
             // We can allow equality in case of searching for min
             // as the uniqueness is enforced by the structure
             if(res.valid && res.guesser != address(0) && res.guess <= winnerGuess){
                     winnerGuess = res.guess;
                     winner = res.guesser;
             }
        }
        return winner != address(0) ? (winnerGuess, winner) : (0,address(0));
    }

    function withdraw() public{
        (uint winnerGuess, address winner) = result();
        winnerGuess;
        require((winner == address(0) && msg.sender == owner) || winner == msg.sender, 
            "only the winner or the owner can withdraw in case of no valid guesses");
        require(prize > 0, "already withdrawn");
        uint toTransfer = prize;
        prize = 0;
        msg.sender.transfer(toTransfer);  
    }
}