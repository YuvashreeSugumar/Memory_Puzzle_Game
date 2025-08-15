// K‑Pop Match — Memory Puzzle PWA
// Features: background music, obstacles, power‑ups (Hint/Freeze/Shield/Speed Boost), score multiplier, levels

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

// Installation prompt
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = "inline-block";
});
installBtn?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt = null;
  installBtn.style.display = "none";
});

const state = {
  level: 1,
  timeLeft: 120,
  baseFlipMs: 420,
  multiplier: 1,
  score: 0,
  revealed: [],
  lock: false,
  matched: 0,
  totalPairs: 0,
  timerId: null,
  obstacleId: null,
  powerups: [], // ["shield"]
  coins: 0,
  paused: false
};

const SFX = {
  flip: new Audio(),
  match: new Audio(),
  bad: new Audio(),
  power: new Audio(),
};

// very small bleep SFX using WebAudio (generated on the fly)
function playBeep(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    let f = 880;
    if (type==="match") f = 660;
    if (type==="bad") f = 120;
    if (type==="power") f = 1320;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.15);
    o.start(); o.stop(ctx.currentTime+0.16);
  } catch {}
}

const EL = {
  cards: document.getElementById("cards"),
  time: document.getElementById("time"),
  level: document.getElementById("level"),
  score: document.getElementById("score"),
  mult: document.getElementById("mult"),
  powers: document.getElementById("powers"),
  progress: document.getElementById("progressBar"),
  newGameBtn: document.getElementById("newGameBtn"),
  muteBtn: document.getElementById("muteBtn"),
  bgm: document.getElementById("bgm"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalMsg: document.getElementById("modalMsg"),
  resumeBtn: document.getElementById("resumeBtn"),
  restartBtn: document.getElementById("restartBtn"),
  btnHint: document.getElementById("btnHint"),
  btnFreeze: document.getElementById("btnFreeze"),
  btnShield: document.getElementById("btnShield"),
  btnBoost: document.getElementById("btnBoost"),
};

const CARD_POOL = [
  "lightstick","microphone","headphones","vinyl","star","heart",
  "crown","dancer","note","stage","thunder","glowstick"
];

function shuffle(a) {
  for (let i=a.length-1;i>0;i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function createDeck(level) {
  const pairs = Math.min(12, 6 + (level-1)); // up to 12 pairs
  state.totalPairs = pairs;
  const chosen = shuffle([...CARD_POOL]).slice(0, pairs);
  const deck = shuffle([...chosen, ...chosen]).map((id, idx) => ({
    id, key: `${id}-${idx}`, matched:false
  }));
  return deck;
}

let deck = [];

function render() {
  EL.cards.innerHTML = "";
  EL.cards.style.setProperty("--flip", (state.baseFlipMs/1000)+"s");
  deck.forEach((card, idx) => {
    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.dataset.key = card.key;
    tile.innerHTML = `
      <div class="inner ${card.matched ? "matched": ""}">
        <div class="face front"><div class="logo">K‑POP</div></div>
        <div class="face back"><img src="assets/cards/${card.id}.svg" alt="${card.id}" /></div>
      </div>`;
    tile.addEventListener("click", () => onCardClick(card, tile));
    EL.cards.appendChild(tile);
  });
  EL.level.textContent = state.level;
  EL.score.textContent = state.score;
  EL.time.textContent = Math.max(0, Math.floor(state.timeLeft));
  EL.mult.textContent = state.multiplier + "×";
  EL.powers.textContent = state.powerups.length ? state.powerups.join(", ") : "—";
  EL.progress.style.width = Math.min(100, (state.matched/state.totalPairs)*100) + "%";
}

function onCardClick(card, tile) {
  if (state.lock || card.matched || state.paused) return;
  const already = state.revealed.find(c => c.key===card.key);
  if (already) return;

  tile.classList.add("revealed");
  playBeep("flip");
  state.revealed.push(card);

  if (state.revealed.length === 2) {
    state.lock = true;
    const [a,b] = state.revealed;
    const match = a.id === b.id;
    setTimeout(() => {
      if (match) {
        deck.forEach(c => { if (c.key===a.key || c.key===b.key) c.matched = true; });
        state.matched++;
        const gain = Math.floor(100 * state.multiplier);
        state.score += gain;
        state.coins += 10;
        toast(`Perfect match! +${gain} pts, +10 💎`);
        playBeep("match");
        checkWin();
      } else {
        // flip back
        document.querySelectorAll(".card-tile.revealed .inner").forEach(el=>{
          el.parentElement.classList.remove("revealed");
        });
        playBeep("bad");
        // slight penalty
        state.score = Math.max(0, state.score - 10);
      }
      state.revealed = [];
      state.lock = false;
      render();
    }, Math.max(80, state.baseFlipMs*0.7));
  }
}

function startLevel(lvl) {
  state.level = lvl;
  state.timeLeft = Math.max(60, 120 - (lvl-1)*10);
  state.baseFlipMs = Math.max(220, 420 - (lvl-1)*20);
  state.multiplier = 1;
  state.matched = 0;
  state.revealed = [];
  state.lock = false;
  state.paused = false;
  deck = createDeck(lvl);
  render();
  clearInterval(state.timerId);
  clearInterval(state.obstacleId);
  state.timerId = setInterval(tick, 1000/10); // 100ms resolution
  state.obstacleId = setInterval(spawnObstacle, 20000); // every 20 sec
}

function tick() {
  if (state.paused) return;
  state.timeLeft -= 0.1;
  if (state.timeLeft <= 0) {
    return gameOver(false, "Time's up! You ran out of time.");
  }
  EL.time.textContent = Math.max(0, Math.floor(state.timeLeft));
}

function checkWin() {
  if (state.matched >= state.totalPairs) {
    clearInterval(state.timerId);
    clearInterval(state.obstacleId);
    state.score += Math.floor(state.timeLeft)*2;
    toast("Level cleared! Bonus added.");
    // level up
    setTimeout(() => {
      startLevel(state.level+1);
    }, 900);
  }
}

// Obstacles system
function spawnObstacle() {
  if (state.paused) return;
  const types = ["glitch","shuffle","lock"];
  const type = types[Math.floor(Math.random()*types.length)];
  if (state.powerups.includes("shield")) {
    toast("🛡️ Shield blocked obstacle!");
    // consume shield
    state.powerups = state.powerups.filter(p=>p!=="shield");
    render();
    return;
  }
  if (type==="glitch") {
    toast("⚠️ Glitch! Revealed cards will hide.");
    document.querySelectorAll(".card-tile.revealed").forEach(t => t.classList.remove("revealed"));
    state.revealed = [];
  } else if (type==="shuffle") {
    toast("⚠️ Shuffle! Board shuffled.");
    deck = shuffle(deck);
    render();
  } else if (type==="lock") {
    toast("⚠️ Stage blackout! Controls locked briefly.");
    state.lock = true;
    setTimeout(()=>{ state.lock=false; }, 1500);
  }
}

// Power‑ups (shop opens via modal pause)
function openModal(title, msg) {
  state.paused = true;
  EL.modalTitle.textContent = title;
  EL.modalMsg.textContent = msg;
  EL.modal.classList.add("open");
}
function closeModal() {
  EL.modal.classList.remove("open");
  state.paused = false;
}
function useHint() {
  if (state.coins < 50) return toast("Need 50 💎");
  state.coins -= 50;
  playBeep("power");
  // briefly reveal two random unmatched cards that form a pair
  const unmatchedIds = [];
  const seen = new Set();
  deck.forEach(c => { if (!c.matched && !seen.has(c.id)) { 
    const cnt = deck.filter(d=>d.id===c.id && !d.matched).length;
    if (cnt===2) { unmatchedIds.push(c.id); seen.add(c.id); }
  }});
  if (!unmatchedIds.length) return toast("No pairs to hint.");
  const id = unmatchedIds[Math.floor(Math.random()*unmatchedIds.length)];
  const els = [];
  deck.forEach((c, i) => {
    if (c.id===id && !c.matched) {
      const el = document.querySelector(`[data-key="${c.key}"]`);
      if (el) { el.classList.add("revealed","blink"); els.push(el); }
    }
  });
  setTimeout(()=>els.forEach(el=>el.classList.remove("revealed","blink")), 900);
  toast("Hint revealed!");
}
function useFreeze() {
  if (state.coins < 60) return toast("Need 60 💎");
  state.coins -= 60;
  playBeep("power");
  toast("🧊 Time frozen for 5s!");
  const saved = state.paused;
  state.paused = true;
  setTimeout(()=>{ state.paused = saved; }, 5000);
}
function useShield() {
  if (state.coins < 70) return toast("Need 70 💎");
  state.coins -= 70;
  playBeep("power");
  state.powerups.push("shield");
  render();
  toast("🛡️ Shield ready!");
}
function useBoost() {
  if (state.coins < 40) return toast("Need 40 💎");
  state.coins -= 40;
  playBeep("power");
  const prev = state.baseFlipMs;
  state.baseFlipMs = Math.max(140, prev - 160);
  state.multiplier = Math.min(5, state.multiplier+1);
  document.querySelectorAll(".card-tile .inner").forEach(el=>el.style.setProperty("--flip",(state.baseFlipMs/1000)+"s"));
  render();
  toast("⚡ Speed boost! Faster flips & +1× multiplier for 10s.");
  setTimeout(()=>{
    state.baseFlipMs = prev;
    state.multiplier = Math.max(1, state.multiplier-1);
    document.querySelectorAll(".card-tile .inner").forEach(el=>el.style.setProperty("--flip",(state.baseFlipMs/1000)+"s"));
    render();
  }, 10000);
}

function gameOver(win, msg) {
  clearInterval(state.timerId);
  clearInterval(state.obstacleId);
  openModal(win ? "You Win!" : "Game Over", msg);
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1200);
}

// Controls
EL.newGameBtn.addEventListener("click", ()=>{
  state.score = 0;
  state.coins = 0;
  state.powerups = [];
  startLevel(1);
  try { EL.bgm.play(); } catch {}
});
EL.muteBtn.addEventListener("click", ()=>{
  EL.bgm.muted = !EL.bgm.muted;
  EL.muteBtn.textContent = EL.bgm.muted ? "🔇" : "🔊";
});
EL.resumeBtn.addEventListener("click", closeModal);
EL.restartBtn.addEventListener("click", ()=>{ closeModal(); EL.newGameBtn.click(); });

EL.btnHint.addEventListener("click", useHint);
EL.btnFreeze.addEventListener("click", useFreeze);
EL.btnShield.addEventListener("click", useShield);
EL.btnBoost.addEventListener("click", useBoost);

// Pause (open shop) on Escape
window.addEventListener("keydown", (e)=>{
  if (e.key==="Escape") {
    if (state.paused) closeModal();
    else openModal("Paused", "Spend 💎 to grab power‑ups or resume your performance!");
  }
});

// Auto start muted for autoplay policies
document.addEventListener("visibilitychange", ()=>{
  if (document.visibilityState==="visible" && !state.timerId && state.level===1 && state.score===0) {
    // idle
  }
});

// First render
render();
