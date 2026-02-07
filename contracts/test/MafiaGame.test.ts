import { expect } from 'chai'
import hre from 'hardhat'
import type { MafiaGame, MafiaToken } from '../typechain-types'

describe('MafiaGame', function () {
  // Фикстура для деплоя контрактов
  async function deployFixture() {
    const { ethers, networkHelpers } = await hre.network.connect()
    const { loadFixture } = networkHelpers

    const [owner, player1, player2, player3, player4] =
      await ethers.getSigners()

    // Деплоим MafiaToken
    const MafiaToken = await ethers.getContractFactory('MafiaToken')
    const mafiaToken = (await MafiaToken.deploy()) as MafiaToken
    await mafiaToken.waitForDeployment()

    // Деплоим MafiaGame
    const MafiaGame = await ethers.getContractFactory('MafiaGame')
    const mafiaGame = (await MafiaGame.deploy(
      await mafiaToken.getAddress(),
    )) as MafiaGame
    await mafiaGame.waitForDeployment()

    // Передаем ownership токена контракту игры
    await mafiaToken.transferOwnership(await mafiaGame.getAddress())

    return {
      mafiaGame,
      mafiaToken,
      owner,
      player1,
      player2,
      player3,
      player4,
      ethers,
      networkHelpers,
    }
  }

  describe('Token Deployment', function () {
    it('Should deploy MafiaToken with correct name and symbol', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaToken } = await deployFixture()

      expect(await mafiaToken.name()).to.equal('Mafia Reward Token')
      expect(await mafiaToken.symbol()).to.equal('MAFIA')
    })

    it('Should transfer ownership to MafiaGame contract', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaToken, mafiaGame } = await deployFixture()

      expect(await mafiaToken.owner()).to.equal(await mafiaGame.getAddress())
    })
  })

  describe('Game Creation', function () {
    it('Should create a new game', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()

      expect(await mafiaGame.gameCounter()).to.equal(1)
    })

    it('Should emit GameCreated event', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1 } = await deployFixture()

      await expect(mafiaGame.connect(player1).createGame())
        .to.emit(mafiaGame, 'GameCreated')
        .withArgs(1, player1.address)
    })

    it('Should return correct game info after creation', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()

      const gameInfo = await mafiaGame.getGameInfo(1)
      expect(gameInfo.state).to.equal(0) // Waiting
      expect(gameInfo.playerCount).to.equal(0)
    })
  })

  describe('Joining Game', function () {
    it('Should allow player to join game', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()

      await expect(mafiaGame.connect(player2).joinGame(1))
        .to.emit(mafiaGame, 'PlayerJoined')
        .withArgs(1, player2.address)

      const gameInfo = await mafiaGame.getGameInfo(1)
      expect(gameInfo.playerCount).to.equal(1)
    })

    it('Should not allow player to join twice', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player2).joinGame(1)

      await expect(mafiaGame.connect(player2).joinGame(1)).to.be.revertedWith(
        'Already joined',
      )
    })

    it('Should not allow joining non-existent game', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player2 } = await deployFixture()

      await expect(mafiaGame.connect(player2).joinGame(999)).to.be.revertedWith(
        'Game does not exist',
      )
    })

    it('Should track all players correctly', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)

      const players = await mafiaGame.getPlayers(1)
      expect(players.length).to.equal(3)
      expect(players).to.include(player1.address)
      expect(players).to.include(player2.address)
      expect(players).to.include(player3.address)
    })
  })

  describe('Starting Game', function () {
    it('Should start game with minimum players', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)

      await expect(mafiaGame.connect(player1).startGame(1))
        .to.emit(mafiaGame, 'GameStarted')
        .withArgs(1, 3)

      const gameInfo = await mafiaGame.getGameInfo(1)
      expect(gameInfo.state).to.equal(1) // Night
    })

    it('Should not allow non-creator to start game', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)

      await expect(mafiaGame.connect(player2).startGame(1)).to.be.revertedWith(
        'Only creator can start',
      )
    })

    it('Should not start with less than minimum players', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, owner } = await deployFixture()

      await mafiaGame.connect(owner).createGame()
      await mafiaGame.connect(owner).joinGame(1)

      await expect(mafiaGame.connect(owner).startGame(1)).to.be.revertedWith(
        'Not enough players',
      )
    })

    it('Should assign roles to all players', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)
      await mafiaGame.connect(player1).startGame(1)

      const player1Info = await mafiaGame.getPlayerInfo(1, player1.address)
      const player2Info = await mafiaGame.getPlayerInfo(1, player2.address)
      const player3Info = await mafiaGame.getPlayerInfo(1, player3.address)

      // Проверяем, что роли назначены (не None)
      expect(player1Info.role).to.not.equal(0)
      expect(player2Info.role).to.not.equal(0)
      expect(player3Info.role).to.not.equal(0)

      // Проверяем, что все живы
      expect(player1Info.isAlive).to.be.true
      expect(player2Info.isAlive).to.be.true
      expect(player3Info.isAlive).to.be.true
    })
  })

  describe('Phase Transitions', function () {
    it('Should not end night phase before time', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)
      await mafiaGame.connect(player1).startGame(1)

      await expect(mafiaGame.endNight(1)).to.be.revertedWith(
        'Phase not ended yet',
      )
    })

    it('Should transition from Night to Day after time', async function () {
      const { ethers, networkHelpers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)
      await mafiaGame.connect(player1).startGame(1)

      // Перематываем время на 5 минут + 1 секунда
      await networkHelpers.time.increase(301)

      await expect(mafiaGame.endNight(1))
        .to.emit(mafiaGame, 'PhaseChanged')
        .withArgs(1, 2) // Day

      const gameInfo = await mafiaGame.getGameInfo(1)
      expect(gameInfo.state).to.equal(2) // Day
    })

    it('Should transition from Day to Voting', async function () {
      const { ethers, networkHelpers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)
      await mafiaGame.connect(player1).startGame(1)

      await networkHelpers.time.increase(301)
      await mafiaGame.endNight(1)

      await networkHelpers.time.increase(301)
      await expect(mafiaGame.startVoting(1))
        .to.emit(mafiaGame, 'PhaseChanged')
        .withArgs(1, 3) // Voting

      const gameInfo = await mafiaGame.getGameInfo(1)
      expect(gameInfo.state).to.equal(3) // Voting
    })
  })

  describe('Voting Phase', function () {
    it('Should allow voting to eject player', async function () {
      const { ethers, networkHelpers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)
      await mafiaGame.connect(player1).startGame(1)

      // Переходим к голосованию
      await networkHelpers.time.increase(301)
      await mafiaGame.endNight(1)
      await networkHelpers.time.increase(301)
      await mafiaGame.startVoting(1)

      await expect(mafiaGame.connect(player1).voteToEject(1, player2.address))
        .to.emit(mafiaGame, 'VoteCast')
        .withArgs(1, player1.address, player2.address)
    })

    it('Should not allow voting twice', async function () {
      const { ethers, networkHelpers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)
      await mafiaGame.connect(player1).startGame(1)

      await networkHelpers.time.increase(301)
      await mafiaGame.endNight(1)
      await networkHelpers.time.increase(301)
      await mafiaGame.startVoting(1)

      await mafiaGame.connect(player1).voteToEject(1, player2.address)

      await expect(
        mafiaGame.connect(player1).voteToEject(1, player3.address),
      ).to.be.revertedWith('Already voted')
    })

    it('Should eject player with most votes', async function () {
      const { ethers, networkHelpers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player3 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)
      await mafiaGame.connect(player3).joinGame(1)
      await mafiaGame.connect(player1).startGame(1)

      await networkHelpers.time.increase(301)
      await mafiaGame.endNight(1)
      await networkHelpers.time.increase(301)
      await mafiaGame.startVoting(1)

      await mafiaGame.connect(player1).voteToEject(1, player2.address)
      await mafiaGame.connect(player3).voteToEject(1, player2.address)

      await networkHelpers.time.increase(301)
      await expect(mafiaGame.endVoting(1))
        .to.emit(mafiaGame, 'PlayerKilled')
        .withArgs(1, player2.address)

      const player2Info = await mafiaGame.getPlayerInfo(1, player2.address)
      expect(player2Info.isAlive).to.be.false
    })
  })

  describe('View Functions', function () {
    it('Should return correct game info', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)

      const gameInfo = await mafiaGame.getGameInfo(1)
      expect(gameInfo.state).to.equal(0) // Waiting
      expect(gameInfo.playerCount).to.equal(2)
    })

    it('Should check if player is in game', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2, player4 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)

      expect(await mafiaGame.isPlayerInGame(1, player1.address)).to.be.true
      expect(await mafiaGame.isPlayerInGame(1, player4.address)).to.be.false
    })

    it('Should return player list', async function () {
      const { ethers } = await hre.network.connect()
      const { mafiaGame, player1, player2 } = await deployFixture()

      await mafiaGame.connect(player1).createGame()
      await mafiaGame.connect(player1).joinGame(1)
      await mafiaGame.connect(player2).joinGame(1)

      const players = await mafiaGame.getPlayers(1)
      expect(players.length).to.equal(2)
    })
  })
})
