// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MafiaToken.sol";


contract MafiaGame is ReentrancyGuard {

    enum GameState {
        Waiting,        
        Night,          
        Day,           
        Voting,         
        Finished        
    }

    enum Role {
        None,
        Mafia,
        Villager,
        Doctor
    }

    enum Team {
        None,
        Mafia,
        Villagers
    }

    // ========== STRUCTS ==========
    struct Player {
        address playerAddress;
        Role role;
        bool isAlive;
        bool hasVoted;
        uint256 votesReceived;
    }

    struct Game {
        uint256 id;
        address creator;
        GameState state;
        uint256 playerCount;
        uint256 aliveCount;
        uint256 mafiaCount;
        uint256 villagersCount;
        uint256 phaseEndTime;
        uint256 currentPhase;
        Team winner;
        bool isActive;
        address[] playerAddresses;
        mapping(address => Player) players;
        mapping(address => bool) hasJoined;
        address mafiaTarget;
        address doctorTarget;
        mapping(address => address) dayVotes;
        uint256 votesCount;
    }

    // ========== STATE VARIABLES ==========
    MafiaToken public rewardToken;
    uint256 public gameCounter;
    uint256 public constant MIN_PLAYERS = 3;
    uint256 public constant MAX_PLAYERS = 10;
    uint256 public constant PHASE_DURATION = 5 minutes;
    uint256 public constant REWARD_PER_WIN = 100 * 10**18; // 100 токенов

    mapping(uint256 => Game) private games;

    // ========== EVENTS ==========
    event GameCreated(uint256 indexed gameId, address indexed creator);
    event PlayerJoined(uint256 indexed gameId, address indexed player);
    event GameStarted(uint256 indexed gameId, uint256 playerCount);
    event PhaseChanged(uint256 indexed gameId, GameState newState);
    event PlayerKilled(uint256 indexed gameId, address indexed player);
    event VoteCast(uint256 indexed gameId, address indexed voter, address indexed target);
    event GameEnded(uint256 indexed gameId, Team winner);
    event RewardIssued(uint256 indexed gameId, address indexed player, uint256 amount);

    // ========== MODIFIERS ==========
    modifier gameExists(uint256 gameId) {
        require(games[gameId].isActive, "Game does not exist");
        _;
    }

    modifier onlyPlayer(uint256 gameId) {
        require(games[gameId].hasJoined[msg.sender], "Not a player");
        _;
    }

    modifier onlyAlive(uint256 gameId) {
        require(games[gameId].players[msg.sender].isAlive, "Player is dead");
        _;
    }

    modifier inState(uint256 gameId, GameState _state) {
        require(games[gameId].state == _state, "Invalid game state");
        _;
    }

    // ========== CONSTRUCTOR ==========
    constructor(address _tokenAddress) {
        rewardToken = MafiaToken(_tokenAddress);
    }

    // ========== GAME MANAGEMENT ==========

   
    function createGame() external returns (uint256) {
        gameCounter++;
        uint256 gameId = gameCounter;

        Game storage game = games[gameId];
        game.id = gameId;
        game.creator = msg.sender;
        game.state = GameState.Waiting;
        game.isActive = true;

        emit GameCreated(gameId, msg.sender);
        return gameId;
    }

   
    function joinGame(uint256 gameId) 
        external 
        gameExists(gameId) 
        inState(gameId, GameState.Waiting) 
    {
        Game storage game = games[gameId];
        require(!game.hasJoined[msg.sender], "Already joined");
        require(game.playerCount < MAX_PLAYERS, "Game is full");

        game.hasJoined[msg.sender] = true;
        game.playerAddresses.push(msg.sender);
        game.playerCount++;

        game.players[msg.sender] = Player({
            playerAddress: msg.sender,
            role: Role.None,
            isAlive: true,
            hasVoted: false,
            votesReceived: 0
        });

        emit PlayerJoined(gameId, msg.sender);
    }

    
    function startGame(uint256 gameId) 
        external 
        gameExists(gameId) 
        inState(gameId, GameState.Waiting) 
    {
        Game storage game = games[gameId];
        require(msg.sender == game.creator, "Only creator can start");
        require(game.playerCount >= MIN_PLAYERS, "Not enough players");

        _assignRoles(gameId);
        game.state = GameState.Night;
        game.aliveCount = game.playerCount;
        game.phaseEndTime = block.timestamp + PHASE_DURATION;

        emit GameStarted(gameId, game.playerCount);
        emit PhaseChanged(gameId, GameState.Night);
    }


    function _assignRoles(uint256 gameId) private {
        Game storage game = games[gameId];
        uint256 mafiaCount = game.playerCount / 3; 
        if (mafiaCount == 0) mafiaCount = 1;

    
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            gameId
        )));

        for (uint256 i = 0; i < game.playerCount; i++) {
            address playerAddr = game.playerAddresses[i];
            
            if (i < mafiaCount) {
                game.players[playerAddr].role = Role.Mafia;
                game.mafiaCount++;
            } else if (i == mafiaCount) {
                game.players[playerAddr].role = Role.Doctor;
                game.villagersCount++;
            } else {
                game.players[playerAddr].role = Role.Villager;
                game.villagersCount++;
            }
        }

        _shufflePlayers(gameId, randomSeed);
    }

   
    function _shufflePlayers(uint256 gameId, uint256 seed) private {
        Game storage game = games[gameId];
        uint256 n = game.playerCount;

        for (uint256 i = 0; i < n; i++) {
            uint256 j = i + (uint256(keccak256(abi.encodePacked(seed, i))) % (n - i));
            
            address tempAddr = game.playerAddresses[i];
            game.playerAddresses[i] = game.playerAddresses[j];
            game.playerAddresses[j] = tempAddr;
        }
    }

    // ========== GAME ACTIONS ==========


    function mafiaKill(uint256 gameId, address target) 
        external 
        gameExists(gameId)
        onlyPlayer(gameId)
        onlyAlive(gameId)
        inState(gameId, GameState.Night)
    {
        Game storage game = games[gameId];
        require(game.players[msg.sender].role == Role.Mafia, "Only Mafia can kill");
        require(game.players[target].isAlive, "Target is already dead");
        require(target != msg.sender, "Cannot target yourself");

        game.mafiaTarget = target;
    }

   
    function doctorHeal(uint256 gameId, address target) 
        external 
        gameExists(gameId)
        onlyPlayer(gameId)
        onlyAlive(gameId)
        inState(gameId, GameState.Night)
    {
        Game storage game = games[gameId];
        require(game.players[msg.sender].role == Role.Doctor, "Only Doctor can heal");
        require(game.players[target].isAlive, "Target is already dead");

        game.doctorTarget = target;
    }

  
    function endNight(uint256 gameId) 
        external 
        gameExists(gameId)
        inState(gameId, GameState.Night)
    {
        Game storage game = games[gameId];
        require(block.timestamp >= game.phaseEndTime, "Phase not ended yet");

        // Проверяем, спас ли доктор цель
        if (game.mafiaTarget != address(0)) {
            if (game.mafiaTarget != game.doctorTarget) {
                _killPlayer(gameId, game.mafiaTarget);
                emit PlayerKilled(gameId, game.mafiaTarget);
            }
        }

        
        game.mafiaTarget = address(0);
        game.doctorTarget = address(0);

        
        if (_checkWinCondition(gameId)) {
            return;
        }

        game.state = GameState.Day;
        game.phaseEndTime = block.timestamp + PHASE_DURATION;
        emit PhaseChanged(gameId, GameState.Day);
    }

    function startVoting(uint256 gameId) 
        external 
        gameExists(gameId)
        inState(gameId, GameState.Day)
    {
        Game storage game = games[gameId];
        require(block.timestamp >= game.phaseEndTime, "Day phase not ended");

        game.state = GameState.Voting;
        game.phaseEndTime = block.timestamp + PHASE_DURATION;
        game.votesCount = 0;

        emit PhaseChanged(gameId, GameState.Voting);
    }

    function voteToEject(uint256 gameId, address target) 
        external 
        gameExists(gameId)
        onlyPlayer(gameId)
        onlyAlive(gameId)
        inState(gameId, GameState.Voting)
    {
        Game storage game = games[gameId];
        require(!game.players[msg.sender].hasVoted, "Already voted");
        require(game.players[target].isAlive, "Target is dead");

        game.dayVotes[msg.sender] = target;
        game.players[msg.sender].hasVoted = true;
        game.players[target].votesReceived++;
        game.votesCount++;

        emit VoteCast(gameId, msg.sender, target);
    }

    
    function endVoting(uint256 gameId) 
        external 
        gameExists(gameId)
        inState(gameId, GameState.Voting)
    {
        Game storage game = games[gameId];
        require(
            block.timestamp >= game.phaseEndTime || game.votesCount >= game.aliveCount,
            "Voting not complete"
        );

        
        address ejected = _findMostVoted(gameId);
        
        if (ejected != address(0)) {
            _killPlayer(gameId, ejected);
            emit PlayerKilled(gameId, ejected);
        }

        
        _resetVotes(gameId);

        
        if (_checkWinCondition(gameId)) {
            return;
        }

    
        game.state = GameState.Night;
        game.currentPhase++;
        game.phaseEndTime = block.timestamp + PHASE_DURATION;
        emit PhaseChanged(gameId, GameState.Night);
    }

    // ========== INTERNAL FUNCTIONS ==========

    function _killPlayer(uint256 gameId, address player) private {
        Game storage game = games[gameId];
        game.players[player].isAlive = false;
        game.aliveCount--;

        Role role = game.players[player].role;
        if (role == Role.Mafia) {
            game.mafiaCount--;
        } else {
            game.villagersCount--;
        }
    }

    function _findMostVoted(uint256 gameId) private view returns (address) {
        Game storage game = games[gameId];
        address mostVoted = address(0);
        uint256 maxVotes = 0;

        for (uint256 i = 0; i < game.playerCount; i++) {
            address playerAddr = game.playerAddresses[i];
            if (game.players[playerAddr].votesReceived > maxVotes) {
                maxVotes = game.players[playerAddr].votesReceived;
                mostVoted = playerAddr;
            }
        }

        return mostVoted;
    }

    function _resetVotes(uint256 gameId) private {
        Game storage game = games[gameId];
        
        for (uint256 i = 0; i < game.playerCount; i++) {
            address playerAddr = game.playerAddresses[i];
            game.players[playerAddr].hasVoted = false;
            game.players[playerAddr].votesReceived = 0;
        }
    }

    function _checkWinCondition(uint256 gameId) private returns (bool) {
        Game storage game = games[gameId];
        if (game.mafiaCount >= game.villagersCount) {
            _endGame(gameId, Team.Mafia);
            return true;
        }

        
        if (game.mafiaCount == 0) {
            _endGame(gameId, Team.Villagers);
            return true;
        }

        return false;
    }

    function _endGame(uint256 gameId, Team winner) private {
        Game storage game = games[gameId];
        game.state = GameState.Finished;
        game.winner = winner;

        for (uint256 i = 0; i < game.playerCount; i++) {
            address playerAddr = game.playerAddresses[i];
            Player storage player = game.players[playerAddr];

            bool isWinner = (winner == Team.Mafia && player.role == Role.Mafia) ||
                           (winner == Team.Villagers && player.role != Role.Mafia);

            if (isWinner) {
                rewardToken.mint(playerAddr, REWARD_PER_WIN);
                emit RewardIssued(gameId, playerAddr, REWARD_PER_WIN);
            }
        }

        emit GameEnded(gameId, winner);
    }

    // ========== VIEW FUNCTIONS ==========

    function getGameInfo(uint256 gameId) external view returns (
        GameState state,
        uint256 playerCount,
        uint256 aliveCount,
        uint256 phaseEndTime,
        Team winner
    ) {
        Game storage game = games[gameId];
        return (
            game.state,
            game.playerCount,
            game.aliveCount,
            game.phaseEndTime,
            game.winner
        );
    }

    function getPlayerInfo(uint256 gameId, address player) external view returns (
        Role role,
        bool isAlive,
        bool hasVoted,
        uint256 votesReceived
    ) {
        Game storage game = games[gameId];
        Player storage p = game.players[player];
        return (p.role, p.isAlive, p.hasVoted, p.votesReceived);
    }

    function getPlayers(uint256 gameId) external view returns (address[] memory) {
        return games[gameId].playerAddresses;
    }

    function isPlayerInGame(uint256 gameId, address player) external view returns (bool) {
        return games[gameId].hasJoined[player];
    }
}
