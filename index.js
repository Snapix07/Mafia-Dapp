const CONTRACT_ADDRESS = '0x8310f2Ce406698636CB83D92F91DBe10CeB11869'

const ABI = [
  'function createGame() external returns (uint256)',
  'function joinGame(uint256 gameId) external payable',
  'function getGameInfo(uint256) view returns (uint8,uint256,uint256,uint256,uint8)',
  'function gameCounter() view returns (uint256)',
  'function isPlayerInGame(uint256 gameId,address) view returns (bool)',
]
let provider, signer, contract, user

const connectBtn = document.getElementById('connectBtn')
const createBtn = document.getElementById('createGameBtn')
const walletDiv = document.getElementById('wallet')
const gamesDiv = document.getElementById('games')

connectBtn.onclick = connectWallet
createBtn.onclick = createGame

async function connectWallet() {
  if (!window.ethereum) {
    alert('Install MetaMask')
    return
  }

  provider = new ethers.BrowserProvider(window.ethereum)
  const network = await provider.getNetwork()

  if (network.chainId !== 11155111n) {
    alert('Please switch MetaMask to Sepolia')
    return
  }

  signer = await provider.getSigner()
  user = await signer.getAddress()
  walletDiv.innerText = user

  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer)
  loadGames()
}

async function createGame() {
  const tx = await contract.createGame()
  await tx.wait()
  loadGames()
}

async function loadGames() {
  gamesDiv.innerHTML = ''
  const count = await contract.gameCounter()

  for (let i = 1; i <= count; i++) {
    const info = await contract.getGameInfo(i)
    const state = ['Waiting', 'Night', 'Day', 'Voting', 'Finished'][info[0]]
    const players = info[1]
    const inGame = await contract.isPlayerInGame(i, user)

    const card = document.createElement('div')
    card.className = 'game-card'
    card.innerHTML = `
      <b>Game #${i}</b><br>
      Status: ${state}<br>
      Players: ${players}<br><br>
      <button>${inGame ? 'Enter' : 'Join'}</button>
    `

    card.querySelector('button').onclick = async () => {
      if (!inGame) {
        const tx = await contract.joinGame(i)
        await tx.wait()
      }
      window.location.href = `game.html?id=${i}`
    }

    gamesDiv.appendChild(card)
  }
}
