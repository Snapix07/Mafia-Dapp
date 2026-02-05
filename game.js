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
  "function getPlayerInfo(uint256,address) view returns (uint8,bool,bool,uint256)"
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
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  user = await signer.getAddress();
  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  loadGame();
  setInterval(loadGame, 4000);
}

async function call(fn) {
  const tx = await contract[fn](gameId);
  await tx.wait();
}

async function loadGame() {
  const info = await contract.getGameInfo(gameId);
const playerCount = Number(info[1]);

if (state === "Waiting" && playerCount < 3) {
  waitingText.style.display = "block";
} else {
  waitingText.style.display = "none";
}


  const end = Number(info[3]);
  const now = Math.floor(Date.now() / 1000);
  timerDiv.innerText = end > now ? `Time left: ${end - now}s` : "Phase ended";

  playersDiv.innerHTML = "";
  const players = await contract.getPlayers(gameId);

  for (const p of players) {
    const pi = await contract.getPlayerInfo(gameId, p);
    const role = ["None","Mafia","Villager","Doctor"][pi[0]];
    const alive = pi[1];

    const card = document.createElement("div");
    card.className = "player-card" + (alive ? "" : " player-dead");
    card.innerHTML = `
      ${p}<br>
      <div class="role">Role: ${role}</div>
      Alive: ${alive}
    `;

    if (alive && p !== user) {
      if (state === "Night" && role === "Mafia") {
        addBtn(card, "Kill", () => contract.mafiaKill(gameId, p));
      }
      if (state === "Night" && role === "Doctor") {
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
