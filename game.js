const CONTRACT_ADDRESS = '0x8310f2Ce406698636CB83D92F91DBe10CeB11869'

const ABI = [
  'function startGame(uint256)',
  'function endNight(uint256)',
  'function startVoting(uint256)',
  'function endVoting(uint256)',
  'function mafiaKill(uint256,address)',
  'function doctorHeal(uint256,address)',
  'function voteToEject(uint256,address)',
  'function getGameInfo(uint256) view returns (uint8,uint256,uint256,uint256,uint8)',
  'function getPlayers(uint256) view returns (address[])',
  'function getPlayerInfo(uint256,address) view returns (uint8,bool,bool,uint256)',
  'function isPlayerInGame(uint256,address) view returns (bool)',
]

const gameId = new URLSearchParams(window.location.search).get('id')

let provider, signer, contract, user

const statusDiv = document.getElementById('status')
const timerDiv = document.getElementById('timer')
const playersDiv = document.getElementById('players')
const waitingText = document.getElementById('waitingText')
const adminPanel = document.getElementById('adminPanel')

if (document.getElementById('startGame'))
  document.getElementById('startGame').onclick = () => call('startGame')
if (document.getElementById('endNight'))
  document.getElementById('endNight').onclick = () => call('endNight')
if (document.getElementById('startVoting'))
  document.getElementById('startVoting').onclick = () => call('startVoting')
if (document.getElementById('endVoting'))
  document.getElementById('endVoting').onclick = () => call('endVoting')

init()

async function init() {
  if (!window.ethereum) {
    alert('Please install MetaMask')
    window.location.href = 'index.html'
    return
  }

  provider = new ethers.BrowserProvider(window.ethereum)
  signer = await provider.getSigner()
  user = await signer.getAddress()

  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer)

  try {
    const inGame = await contract.isPlayerInGame(gameId, user)
    if (!inGame) {
      alert('You must join the game first')
      window.location.href = 'index.html'
      return
    }
  } catch (e) {
    console.error(e)
    alert('Error checking status. Wrong network?')
    return
  }

  await loadGame()
  setInterval(loadGame, 4000)
}

async function call(fn) {
  try {
    const tx = await contract[fn](gameId)
    await tx.wait()
    loadGame()
  } catch (e) {
    console.error(e)
    alert(e.message)
  }
}

async function loadGame() {
  const info = await contract.getGameInfo(gameId)

  const stateIdx = Number(info[0])
  const state = ['Waiting', 'Night', 'Day', 'Voting', 'Finished'][stateIdx]
  const playerCount = Number(info[1])
  const winnerIdx = Number(info[5])

  if (state === 'Finished') {
    const winner = ['None', 'Mafia', 'Villagers'][winnerIdx]
    statusDiv.innerText = 'Game Over. Winner: ' + winner
    timerDiv.innerText = ''
    playersDiv.innerHTML = '<h2>GAME OVER</h2>'
    return
  }

  statusDiv.innerText = 'State: ' + state

  if (waitingText) {
    waitingText.style.display =
      state === 'Waiting' && playerCount < 3 ? 'block' : 'none'
  }

  const end = Number(info[3])
  const now = Math.floor(Date.now() / 1000)
  timerDiv.innerText =
    end > now ? `Time left: ${end - now}s` : 'Phase ended (Wait for Admin)'

  const players = await contract.getPlayers(gameId)
  playersDiv.innerHTML = ''

  if (players.length === 0) {
    playersDiv.innerHTML = '<p>No players yet</p>'
    return
  }

  let myRole = null

  for (const p of players) {
    if (p.toLowerCase() === user.toLowerCase()) {
      const pi = await contract.getPlayerInfo(gameId, p)
      myRole = ['None', 'Mafia', 'Villager', 'Doctor'][Number(pi[0])]
    }
  }

  for (const p of players) {
    const pi = await contract.getPlayerInfo(gameId, p)
    const alive = pi[1]

    // Скрываем роли чужих
    let roleText = 'Hidden'
    if (p.toLowerCase() === user.toLowerCase()) {
      roleText = myRole
    } else if (!alive) {
      roleText = 'Dead'
    }

    const card = document.createElement('div')
    card.className = 'player-card' + (alive ? '' : ' player-dead')

    if (!alive) card.style.opacity = '0.5'

    card.innerHTML = `
      <div><b>${p.substring(0, 6)}...${p.substring(38)}</b></div>
      <div class="role">Role: ${roleText}</div>
      <div>Status: ${alive ? 'Alive' : 'Dead'}</div>
    `

    if (alive && p.toLowerCase() !== user.toLowerCase()) {
      if (state === 'Night' && myRole === 'Mafia') {
        addBtn(card, '🔫 Kill', () => contract.mafiaKill(gameId, p))
      }
      if (state === 'Night' && myRole === 'Doctor') {
        addBtn(card, '💊 Heal', () => contract.doctorHeal(gameId, p))
      }
      if (state === 'Voting') {
        addBtn(card, '🗳️ Vote', () => contract.voteToEject(gameId, p))
      }
    }
    playersDiv.appendChild(card)
  }
}

function addBtn(el, text, action) {
  const b = document.createElement('button')
  b.innerText = text
  b.onclick = async () => {
    try {
      const tx = await action()
      await tx.wait()
      loadGame()
    } catch (e) {
      console.error(e)
      alert('Error: ' + (e.reason || e.message))
    }
  }
  el.appendChild(document.createElement('br'))
  el.appendChild(b)
}
