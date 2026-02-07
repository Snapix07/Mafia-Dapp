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

if (connectBtn) connectBtn.onclick = connectWallet
if (createBtn) createBtn.onclick = createGame

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
  try {
    const tx = await contract.createGame()
    await tx.wait()
    loadGames()
  } catch (e) {
    console.error(e)
    alert(e.message)
  }
}

async function loadGames() {
  if (!gamesDiv) return
  gamesDiv.innerHTML = 'Loading...'

  try {
    const count = await contract.gameCounter()

    if (Number(count) === 0) {
      gamesDiv.innerHTML = 'No games yet. Create one!'
      return
    }

    gamesDiv.innerHTML = ''

    for (let i = Number(count); i >= 1; i--) {
      try {
        const info = await contract.getGameInfo(i)
        const stateIdx = Number(info[0])
        const state = ['Waiting', 'Night', 'Day', 'Voting', 'Finished'][
          stateIdx
        ]
        const players = Number(info[1])
        const inGame = await contract.isPlayerInGame(i, user)

        if (state === 'Finished' && !inGame) continue

        const card = document.createElement('div')
        card.className = 'game-card'

        if (state === 'Finished') card.style.opacity = '0.6'

        card.innerHTML = `
          <b>Game #${i}</b><br>
          Status: ${state}<br>
          Players: ${players}/10<br>
          ${state === 'Waiting' ? '<i>Entry Fee: 0.001 ETH</i><br>' : ''}
          <br>
          <button id="btn-${i}">${inGame ? 'Enter' : 'Join & Pay'}</button>
        `

        const btn = card.querySelector(`#btn-${i}`)

        if (state === 'Finished' && !inGame) {
          btn.disabled = true
          btn.innerText = 'Closed'
        } else {
          btn.onclick = async () => {
            if (!inGame) {
              try {
                // ВОТ ГЛАВНОЕ ИСПРАВЛЕНИЕ: Передаем ETH
                const tx = await contract.joinGame(i, {
                  value: ethers.parseEther('0.001'),
                })
                btn.innerText = 'Joining...'
                btn.disabled = true
                await tx.wait()
              } catch (err) {
                console.error(err)
                alert('Error: ' + (err.reason || err.message))
                btn.innerText = 'Join & Pay'
                btn.disabled = false
                return
              }
            }
            window.location.href = `game.html?id=${i}`
          }
        }

        gamesDiv.appendChild(card)
      } catch (err) {
        console.warn(`Skipping game ${i}:`, err.message)
      }
    }

    if (gamesDiv.innerHTML === '') {
      gamesDiv.innerHTML = 'No active games found.'
    }
  } catch (e) {
    console.error(e)
    gamesDiv.innerText = 'Error loading games. Check console.'
  }
}
