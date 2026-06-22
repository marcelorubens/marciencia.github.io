const suits = [
  { key: "S", symbol: "♠", color: "black" },
  { key: "H", symbol: "♥", color: "red" },
  { key: "D", symbol: "♦", color: "red" },
  { key: "C", symbol: "♣", color: "black" },
];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const STORAGE_KEY = "solitaire-game-state-v1";

const state = {
  stock: [],
  waste: [],
  foundations: [[], [], [], []],
  tableau: [[], [], [], [], [], [], []],
  moves: 0,
  seconds: 0,
  started: false,
  won: false,
};

let snapshots = [];
let timerId = null;
let drag = null;
let toastId = null;
let lastTap = { cardId: null, time: 0 };
let lastTouchEnd = 0;

const els = {
  stock: document.querySelector("#stock"),
  waste: document.querySelector("#waste"),
  foundations: Array.from({ length: 4 }, (_, i) => document.querySelector(`#foundation-${i}`)),
  tableau: Array.from({ length: 7 }, (_, i) => document.querySelector(`#tableau-${i}`)),
  dragLayer: document.querySelector("#dragLayer"),
  moves: document.querySelector("#moves"),
  timer: document.querySelector("#timer"),
  status: document.querySelector("#status"),
  toast: document.querySelector("#toast"),
  newGame: document.querySelector("#newGame"),
  newGameDialog: document.querySelector("#newGameDialog"),
  undo: document.querySelector("#undo"),
  hint: document.querySelector("#hint"),
  winOverlay: document.querySelector("#winOverlay"),
  winNewGame: document.querySelector("#winNewGame"),
};

function makeDeck() {
  return suits.flatMap((suit) =>
    ranks.map((rank, index) => ({
      id: `${rank}${suit.key}`,
      suit: suit.key,
      symbol: suit.symbol,
      color: suit.color,
      rank,
      value: index + 1,
      faceUp: false,
    })),
  );
}

function shuffle(deck) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function newGame() {
  const deck = shuffle(makeDeck());
  state.stock = [];
  state.waste = [];
  state.foundations = [[], [], [], []];
  state.tableau = [[], [], [], [], [], [], []];
  state.moves = 0;
  state.seconds = 0;
  state.started = false;
  state.won = false;
  snapshots = [];
  stopTimer();

  for (let col = 0; col < 7; col += 1) {
    for (let row = 0; row <= col; row += 1) {
      const card = deck.pop();
      card.faceUp = row === col;
      state.tableau[col].push(card);
    }
  }

  state.stock = deck;
  render();
  showToast("New game");
}

function cloneState() {
  return JSON.stringify({
    stock: state.stock,
    waste: state.waste,
    foundations: state.foundations,
    tableau: state.tableau,
    moves: state.moves,
    seconds: state.seconds,
    started: state.started,
    won: state.won,
  });
}

function restoreState(serialized) {
  const data = JSON.parse(serialized);
  Object.assign(state, data);
  if (state.started) startTimer();
  render();
}

function saveGame() {
  const payload = {
    stock: state.stock,
    waste: state.waste,
    foundations: state.foundations,
    tableau: state.tableau,
    moves: state.moves,
    seconds: state.seconds,
    started: state.started,
    won: state.won,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable in private browsing or locked-down contexts.
  }
}

function loadSavedGame() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;

    const data = JSON.parse(saved);
    if (!isValidSavedGame(data)) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }

    Object.assign(state, data);
    if (state.started) startTimer();
    render();
    return true;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup failures.
    }
    return false;
  }
}

function isValidSavedGame(data) {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.stock) || !Array.isArray(data.waste)) return false;
  if (!Array.isArray(data.foundations) || data.foundations.length !== 4) return false;
  if (!Array.isArray(data.tableau) || data.tableau.length !== 7) return false;

  const cards = [
    ...data.stock,
    ...data.waste,
    ...data.foundations.flat(),
    ...data.tableau.flat(),
  ];
  const ids = new Set(cards.map((card) => card?.id));
  return cards.length === 52 && ids.size === 52;
}

function saveSnapshot() {
  snapshots.push(cloneState());
  if (snapshots.length > 80) snapshots.shift();
}

function startTimer() {
  if (timerId || state.won) return;
  state.started = true;
  timerId = window.setInterval(() => {
    state.seconds += 1;
    els.timer.textContent = formatTime(state.seconds);
    saveGame();
  }, 1000);
}

function stopTimer() {
  window.clearInterval(timerId);
  timerId = null;
}

function formatTime(total) {
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function render() {
  clearPiles();
  clearDragLayer();
  els.stock.classList.toggle("empty", state.stock.length === 0);
  if (state.stock.length) {
    const back = createCardElement({ faceUp: false, id: "stock-back" });
    back.style.top = "0px";
    back.style.left = "0px";
    els.stock.append(back);
  }

  renderStack(els.waste, state.waste.slice(-1), "waste", null, true);
  state.foundations.forEach((pile, index) => renderStack(els.foundations[index], pile.slice(-1), "foundation", index, true));
  state.tableau.forEach((pile, index) => renderStack(els.tableau[index], pile, "tableau", index, false));

  els.moves.textContent = String(state.moves);
  els.timer.textContent = formatTime(state.seconds);
  els.status.textContent = state.won ? "Completed" : "Game in progress";
  els.undo.disabled = snapshots.length === 0;
  syncWinOverlay();
  saveGame();
}

function syncWinOverlay() {
  els.winOverlay.classList.toggle("show", state.won);
  els.winOverlay.setAttribute("aria-hidden", state.won ? "false" : "true");
}

function clearPiles() {
  [els.stock, els.waste, ...els.foundations, ...els.tableau].forEach((pile) => {
    pile.querySelectorAll(".card").forEach((card) => card.remove());
  });
}

function clearDragLayer() {
  els.dragLayer.querySelectorAll(".card").forEach((card) => card.remove());
}

function renderStack(container, cards, source, index, singleCard) {
  cards.forEach((card, position) => {
    const el = createCardElement(card);
    el.dataset.source = source;
    if (index !== null) el.dataset.index = String(index);
    el.dataset.position = String(singleCard ? getPile(source, index).length - 1 : position);
    el.style.top = singleCard ? "0px" : `${offsetFor(card, position)}px`;
    container.append(el);
  });
}

function createCardElement(card) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `card${card.faceUp ? "" : " face-down"}${card.color === "red" && card.faceUp ? " red" : ""}`;
  el.dataset.cardId = card.id;
  el.setAttribute("aria-label", card.faceUp ? `${card.rank} ${card.symbol}` : "Face-down card");

  if (card.faceUp) {
    el.innerHTML = `<span class="corner"><span>${card.rank}</span><span>${card.symbol}</span></span><span class="suit-center">${card.symbol}</span>`;
  }
  return el;
}

function offsetFor(card, position) {
  const faceGap = cssLength("--stack-gap");
  const hiddenGap = cssLength("--hidden-gap");
  let offset = 0;
  const pile = state.tableau.find((stack) => stack.includes(card));
  for (let i = 0; i < position; i += 1) offset += pile[i].faceUp ? faceGap : hiddenGap;
  return offset;
}

function cssLength(property) {
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.width = `var(${property})`;
  document.body.append(probe);
  const value = Number.parseFloat(getComputedStyle(probe).width);
  probe.remove();
  return value;
}

function getPile(source, index) {
  if (source === "stock") return state.stock;
  if (source === "waste") return state.waste;
  if (source === "foundation") return state.foundations[index];
  return state.tableau[index];
}

function drawStock() {
  const stockRect = els.stock.getBoundingClientRect();
  saveSnapshot();
  startTimer();
  if (state.stock.length) {
    const card = state.stock.pop();
    card.faceUp = true;
    state.waste.push(card);
    state.moves += 1;
    render();
    animateDrawnCard(card, stockRect);
    return;
  } else if (state.waste.length) {
    state.stock = state.waste.reverse().map((card) => ({ ...card, faceUp: false }));
    state.waste = [];
    state.moves += 1;
  } else {
    snapshots.pop();
    showToast("No cards to draw");
  }
  render();
}

function animateDrawnCard(card, fromRect) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  window.requestAnimationFrame(() => {
    const node = document.querySelector(`#waste [data-card-id="${card.id}"]`);
    if (!node) return;

    const to = node.getBoundingClientRect();
    const dx = fromRect.left - to.left;
    const dy = fromRect.top - to.top;

    node.classList.add("moving");
    node.style.transition = "none";
    node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

    window.requestAnimationFrame(() => {
      node.style.transition = "transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      node.style.transform = "translate3d(0, 0, 0)";
    });

    window.setTimeout(() => {
      node.classList.remove("moving");
      node.style.transition = "";
      node.style.transform = "";
    }, 260);
  });
}

function canMoveToFoundation(card, index) {
  const pile = state.foundations[index];
  if (!card.faceUp || suits[index].key !== card.suit) return false;
  if (!pile.length) return card.value === 1;
  return pile[pile.length - 1].value + 1 === card.value;
}

function canMoveToTableau(cards, index) {
  const card = cards[0];
  const pile = state.tableau[index];
  if (!card.faceUp) return false;
  if (!pile.length) return card.value === 13;
  const target = pile[pile.length - 1];
  return target.faceUp && target.color !== card.color && target.value === card.value + 1;
}

function moveCards(fromSource, fromIndex, fromPosition, toSource, toIndex) {
  const sourcePile = getPile(fromSource, fromIndex);
  const moving = sourcePile.slice(fromPosition);
  if (!moving.length || !moving[0].faceUp) return false;

  if (toSource === "foundation" && moving.length === 1 && canMoveToFoundation(moving[0], toIndex)) {
    applyMove(sourcePile, moving, state.foundations[toIndex]);
    return true;
  }

  if (toSource === "tableau" && canMoveToTableau(moving, toIndex)) {
    applyMove(sourcePile, moving, state.tableau[toIndex]);
    return true;
  }

  return false;
}

function applyMove(sourcePile, moving, targetPile) {
  const fromRects = captureCardRects(moving);
  saveSnapshot();
  startTimer();
  sourcePile.splice(sourcePile.length - moving.length, moving.length);
  targetPile.push(...moving);
  flipExposedTableauCards();
  state.moves += 1;
  render();
  animateMovedCards(moving, fromRects);
  checkWin();
}

function captureCardRects(cards) {
  return new Map(
    cards
      .map((card) => {
        const node = document.querySelector(`[data-card-id="${card.id}"]`);
        return node ? [card.id, node.getBoundingClientRect()] : null;
      })
      .filter(Boolean),
  );
}

function animateMovedCards(cards, fromRects) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  window.requestAnimationFrame(() => {
    cards.forEach((card, index) => {
      const node = document.querySelector(`[data-card-id="${card.id}"]`);
      const from = fromRects.get(card.id);
      if (!node || !from) return;

      const to = node.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      node.classList.add("moving");
      node.style.transition = "none";
      node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

      window.requestAnimationFrame(() => {
        node.style.transition = `transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1) ${index * 18}ms`;
        node.style.transform = "translate3d(0, 0, 0)";
      });

      window.setTimeout(() => {
        node.classList.remove("moving");
        node.style.transition = "";
        node.style.transform = "";
      }, 280 + index * 18);
    });
  });
}

function flipExposedTableauCards() {
  state.tableau.forEach((pile) => {
    const top = pile[pile.length - 1];
    if (top && !top.faceUp) top.faceUp = true;
  });
}

function checkWin() {
  const total = state.foundations.reduce((sum, pile) => sum + pile.length, 0);
  if (total === 52) {
    state.won = true;
    stopTimer();
    render();
  }
}

function findCard(cardId) {
  const piles = [
    ["waste", null, state.waste],
    ...state.foundations.map((pile, index) => ["foundation", index, pile]),
    ...state.tableau.map((pile, index) => ["tableau", index, pile]),
  ];
  for (const [source, index, pile] of piles) {
    const position = pile.findIndex((card) => card.id === cardId);
    if (position !== -1) return { source, index, position, pile, card: pile[position] };
  }
  return null;
}

function autoMove(cardId) {
  const found = findCard(cardId);
  if (!found || !found.card.faceUp) return false;
  const moving = found.pile.slice(found.position);

  if (moving.length === 1) {
    const foundationIndex = suits.findIndex((suit) => suit.key === found.card.suit);
    if (moveCards(found.source, found.index, found.position, "foundation", foundationIndex)) return true;
  }

  for (let i = 0; i < 7; i += 1) {
    if (found.source === "tableau" && found.index === i) continue;
    if (moveCards(found.source, found.index, found.position, "tableau", i)) return true;
  }

  return false;
}

function findHint() {
  const candidates = [
    ...state.waste.slice(-1),
    ...state.tableau.flatMap((pile) => pile.filter((card) => card.faceUp)),
  ];

  for (const card of candidates) {
    const found = findCard(card.id);
    if (!found) continue;
    const moving = found.pile.slice(found.position);
    if (moving.length === 1) {
      const foundationIndex = suits.findIndex((suit) => suit.key === card.suit);
      if (canMoveToFoundation(card, foundationIndex)) return card.id;
    }
    if (state.tableau.some((_, i) => i !== found.index && canMoveToTableau(moving, i))) return card.id;
  }
  return null;
}

function showHint() {
  const cardId = findHint();
  document.querySelectorAll(".hinted").forEach((el) => el.classList.remove("hinted"));
  if (!cardId) {
    showToast(state.stock.length ? "Draw a card" : "No move found");
    return;
  }
  const el = document.querySelector(`[data-card-id="${cardId}"]`);
  el?.classList.add("hinted");
  window.setTimeout(() => el?.classList.remove("hinted"), 1200);
}

function showToast(message) {
  window.clearTimeout(toastId);
}

function undo() {
  const previous = snapshots.pop();
  if (!previous) return;
  restoreState(previous);
}

function beginDrag(event, cardEl) {
  const found = findCard(cardEl.dataset.cardId);
  if (!found || !found.card.faceUp) return;
  const pile = found.pile;
  if (found.source === "foundation" && found.position !== pile.length - 1) return;
  if (found.source === "waste" && found.position !== pile.length - 1) return;

  event.preventDefault();
  try {
    cardEl.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic and interrupted pointer streams may not be capturable.
  }
  const rect = cardEl.getBoundingClientRect();
  const movingCards = pile.slice(found.position);
  drag = {
    pointerId: event.pointerId,
    source: found.source,
    index: found.index,
    position: found.position,
    startX: event.clientX,
    startY: event.clientY,
    dx: event.clientX - rect.left,
    dy: event.clientY - rect.top,
    moved: false,
    nodes: [],
  };

  movingCards.forEach((card, offsetIndex) => {
    const node = document.querySelector(`[data-card-id="${card.id}"]`);
    if (!node) return;
    const nodeRect = node.getBoundingClientRect();
    node.classList.add("dragging");
    node.style.left = `${nodeRect.left}px`;
    node.style.top = `${nodeRect.top}px`;
    els.dragLayer.append(node);
    drag.nodes.push({ node, offsetY: nodeRect.top - rect.top });
  });

  revealSourceCardDuringDrag(found);
}

function revealSourceCardDuringDrag(found) {
  if (found.position === 0) return;
  if (found.source !== "waste" && found.source !== "foundation") return;

  const revealCard = found.pile[found.position - 1];
  if (!revealCard) return;

  const container = found.source === "waste" ? els.waste : els.foundations[found.index];
  const node = createCardElement(revealCard);
  node.classList.add("peek-card");
  node.dataset.source = found.source;
  if (found.index !== null) node.dataset.index = String(found.index);
  node.dataset.position = String(found.position - 1);
  node.style.top = "0px";
  node.style.left = "0px";
  container.append(node);
}

function moveDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const left = event.clientX - drag.dx;
  const top = event.clientY - drag.dy;
  drag.moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8;
  drag.nodes.forEach(({ node, offsetY }) => {
    node.style.left = `${left}px`;
    node.style.top = `${top + offsetY}px`;
  });
}

function endDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const currentDrag = drag;
  drag = null;

  if (!currentDrag.moved) {
    render();
    handleTap(currentDrag.nodes[0]?.node?.dataset.cardId);
    return;
  }

  const target = pileAtPoint(event.clientX, event.clientY);
  const moved = target && moveCards(currentDrag.source, currentDrag.index, currentDrag.position, target.source, target.index);
  if (!moved) {
    render();
    showToast("That move does not fit");
  }
}

function pileAtPoint(x, y) {
  const piles = [
    ...els.foundations.map((el, index) => ({ el, source: "foundation", index })),
    ...els.tableau.map((el, index) => ({ el, source: "tableau", index })),
  ];
  return piles.find(({ el }) => {
    const rect = el.getBoundingClientRect();
    return x >= rect.left - 8 && x <= rect.right + 8 && y >= rect.top - 8 && y <= rect.bottom + 8;
  });
}

function handleTap(cardId) {
  if (!cardId) return;
  const now = Date.now();
  const doubleTap = lastTap.cardId === cardId && now - lastTap.time < 360;
  lastTap = { cardId, time: now };

  if (autoMove(cardId)) return;
  if (doubleTap) showToast("No automatic move");
}

document.addEventListener("pointerdown", (event) => {
  const stock = event.target.closest("#stock");
  if (stock) {
    drawStock();
    return;
  }

  const card = event.target.closest(".card");
  if (card && card.dataset.cardId !== "stock-back") beginDrag(event, card);
});

document.addEventListener("pointermove", moveDrag, { passive: false });
document.addEventListener("pointerup", endDrag, { passive: false });
document.addEventListener("pointercancel", () => {
  if (drag) {
    drag = null;
    render();
  }
});
document.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
document.addEventListener(
  "touchend",
  (event) => {
    const now = Date.now();
    if (event.changedTouches.length === 1 && now - lastTouchEnd < 350) event.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
document.addEventListener("gesturestart", (event) => event.preventDefault());

els.newGame.addEventListener("click", () => {
  els.newGameDialog.returnValue = "";
  els.newGameDialog.showModal();
});
els.newGameDialog.addEventListener("close", () => {
  if (els.newGameDialog.returnValue === "confirm") newGame();
});
els.winNewGame.addEventListener("click", newGame);
els.undo.addEventListener("click", undo);
els.hint.addEventListener("click", showHint);
window.addEventListener("resize", render);

if (!loadSavedGame()) newGame();
