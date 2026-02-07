const CONTRACT_ADDRESS = "0x0C7055dF1b367F79D9510f29Ea9e3e53686bf0Fd";

const ABI = [
  "function startGame(uint256)",
  "function endNight(uint256)",
  "function startVoting(uint256)",
  "function endVoting(uint256)",
  "function mafiaKill(uint256,address)",
  "function doctorHeal(uint256,address)",
  "function voteToEject(uint256,address)",
  "function getGameInfo(uint256) view returns (uint8,uint256,uint256,uint256,uint8)",
  "function getPlayers(uint256) view returns (address[])",
  "function getPlayerInfo(uint256,address) view returns (uint8,bool,bool,uint256)",
  "function isPlayerInGame(uint256,address) view returns (bool)"
];

const gameId = new URLSearchParams(window.location.search).get("id");

let provider, signer, contract, user;

const statusDiv = document.getElementById("status");
const timerDiv = document.getElementById("timer");
const playersDiv = document.getElementById("players");
const waitingText = document.getElementById("waitingText");

document.getElementById("startGame").onclick = () => call("startGame");
document.getElementById("endNight").onclick = () => call("endNight");
document.getElementById("startVoting").onclick = () => call("startVoting");
document.getElementById("endVoting").onclick = () => call("endVoting");

init();

async function init() {
  if (!window.ethereum) {
    alert("Please install MetaMask");
    window.location.href = "index.html";
    return;
  }

  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  user = await signer.getAddress();

  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  const inGame = await contract.isPlayerInGame(gameId, user);
  if (!inGame) {
    alert("You must join the game first");
    window.location.href = "index.html";
    return;
  }

  await loadGame();
  setInterval(loadGame, 4000);
}

async function call(fn) {
  const tx = await contract[fn](gameId);
  await tx.wait();
}

async function loadGame() {
  const info = await contract.getGameInfo(gameId);
  const state = ["Waiting", "Night", "Day", "Voting", "Finished"][info[0]];
  const playerCount = Number(info[1]);

  // GAME OVER
  if (state === "Finished") {
    const winner = ["None", "Mafia", "Villagers"][info[4]];
    statusDiv.innerText = "Game Over. Winner: " + winner;
    timerDiv.innerText = "";

    document.querySelectorAll("button").forEach(b => b.disabled = true);
    return;
  }

  statusDiv.innerText = "State: " + state;

  // WAITING TEXT
  if (state === "Waiting" && playerCount < 3) {
    waitingText.style.display = "block";
  } else {
    waitingText.style.display = "none";
  }

  // TIMER
  const end = Number(info[3]);
  const now = Math.floor(Date.now() / 1000);
  timerDiv.innerText = end > now ? `Time left: ${end - now}s` : "Phase ended";

  const players = await contract.getPlayers(gameId);
  playersDiv.innerHTML = "";

  if (players.length === 0) {
    playersDiv.innerHTML = "<p>No players yet</p>";
    return;
  }

  let myRole = null;

  // FIRST PASS — find my role
  for (const p of players) {
    const pi = await contract.getPlayerInfo(gameId, p);
    if (p.toLowerCase() === user.toLowerCase()) {
      myRole = ["None", "Mafia", "Villager", "Doctor"][pi[0]];
    }
  }

  // SECOND PASS — render players
  for (const p of players) {
    const pi = await contract.getPlayerInfo(gameId, p);
    const alive = pi[1];

    let roleText = "Hidden";
    if (p.toLowerCase() === user.toLowerCase()) {
      roleText = myRole;
    }

    const card = document.createElement("div");
    card.className = "player-card" + (alive ? "" : " player-dead");
    card.innerHTML = `
      <div><b>${p}</b></div>
      <div class="role">Role: ${roleText}</div>
      <div>Alive: ${alive}</div>
    `;

    if (alive && p.toLowerCase() !== user.toLowerCase()) {
      if (state === "Night" && myRole === "Mafia") {
        addBtn(card, "Kill", () => contract.mafiaKill(gameId, p));
      }

      if (state === "Night" && myRole === "Doctor") {
        addBtn(card, "Heal", () => contract.doctorHeal(gameId, p));
      }

      if (state === "Voting") {
        addBtn(card, "Vote", () => contract.voteToEject(gameId, p));
      }
    }

    playersDiv.appendChild(card);
  }
}

function addBtn(el, text, action) {
  const b = document.createElement("button");
  b.innerText = text;
  b.onclick = action;
  el.appendChild(document.createElement("br"));
  el.appendChild(b);
}
