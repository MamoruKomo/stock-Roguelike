"use strict";

const MAX_TURNS = 20;
const INITIAL_CASH = 1000000;
const MAX_CARDS_PER_TURN = 2;

const STOCK_TEMPLATES = [
  { symbol: "TECH", name: "TechNova", type: "成長株", price: 10000, note: "上昇しやすいが下落も大きい" },
  { symbol: "CARE", name: "CareLink", type: "介護テック株", price: 5000, note: "安定成長" },
  { symbol: "GAME", name: "GameForge", type: "ゲーム株", price: 8000, note: "イベントによる変動が大きい" },
  { symbol: "GREEN", name: "GreenEnergy", type: "テーマ株", price: 3000, note: "ニュースカードの影響を受けやすい" }
];

const MARKET_EVENTS = [
  {
    name: "全体相場上昇",
    description: "全銘柄 +10%",
    changes: { TECH: 0.10, CARE: 0.10, GAME: 0.10, GREEN: 0.10 }
  },
  {
    name: "全体相場下落",
    description: "全銘柄 -10%",
    changes: { TECH: -0.10, CARE: -0.10, GAME: -0.10, GREEN: -0.10 }
  },
  {
    name: "AIブーム",
    description: "TechNova +20%",
    changes: { TECH: 0.20 }
  },
  {
    name: "介護人材不足ニュース",
    description: "CareLink +20%",
    changes: { CARE: 0.20 }
  },
  {
    name: "新作ゲーム爆死",
    description: "GameForge -25%",
    changes: { GAME: -0.25 }
  },
  {
    name: "補助金発表",
    description: "GreenEnergy +25%",
    changes: { GREEN: 0.25 }
  },
  {
    name: "円安進行",
    description: "GameForge +10%",
    changes: { GAME: 0.10 }
  },
  {
    name: "景気後退",
    description: "全銘柄 -15%",
    changes: { TECH: -0.15, CARE: -0.15, GAME: -0.15, GREEN: -0.15 }
  }
];

const CARD_DEFINITIONS = {
  buy: {
    id: "buy",
    name: "買付",
    rarity: "Common",
    category: "投資行動",
    description: "指定銘柄を、現金で買えるだけ購入する。",
    target: "all",
    use(target) {
      buyStock(target, 1);
    }
  },
  takeProfit: {
    id: "takeProfit",
    name: "利確",
    rarity: "Common",
    category: "投資行動",
    description: "保有している指定銘柄をすべて売却する。",
    target: "owned",
    use(target) {
      sellStock(target, 1, "利確");
    }
  },
  averageDown: {
    id: "averageDown",
    name: "ナンピン",
    rarity: "Common",
    category: "投資行動",
    description: "前ターン基準より下落している銘柄を追加購入する。",
    target: "dipped",
    use(target) {
      buyStock(target, 0.65);
    }
  },
  stopLoss: {
    id: "stopLoss",
    name: "損切り",
    rarity: "Common",
    category: "投資行動",
    description: "指定銘柄をすべて売却し、次ターンに引くカードを1枚増やす。",
    target: "owned",
    use(target) {
      sellStock(target, 1, "損切り");
      gameState.nextDrawBonus += 1;
      addLog("損切りにより、次ターンのドローが1枚増えます。");
    }
  },
  margin: {
    id: "margin",
    name: "信用取引",
    rarity: "Rare",
    category: "投資行動",
    description: "このターン中、保有銘柄の利益と損失が2倍。終了時に追証リスクがある。",
    target: "none",
    use() {
      gameState.effects.margin = true;
      addLog("信用取引を開始。保有銘柄の値動きがこのターンだけ2倍になります。");
    }
  },
  goodEarnings: {
    id: "goodEarnings",
    name: "好決算",
    rarity: "Common",
    category: "ニュース",
    description: "指定銘柄の株価を20%上昇させる。",
    target: "all",
    use(target) {
      applyPriceChanges({ [target]: 0.20 }, "好決算");
    }
  },
  badEarnings: {
    id: "badEarnings",
    name: "悪決算",
    rarity: "Common",
    category: "ニュース",
    description: "指定銘柄の株価を20%下落させる。",
    target: "all",
    use(target) {
      applyPriceChanges({ [target]: -0.20 }, "悪決算");
    }
  },
  snsFire: {
    id: "snsFire",
    name: "SNS炎上",
    rarity: "Rare",
    category: "ニュース",
    description: "GameForgeまたはTechNovaの株価を30%下落させる。",
    target: ["TECH", "GAME"],
    use(target) {
      applyPriceChanges({ [target]: -0.30 }, "SNS炎上");
    }
  },
  policyTheme: {
    id: "policyTheme",
    name: "国策テーマ化",
    rarity: "Rare",
    category: "ニュース",
    description: "GreenEnergyまたはCareLinkの株価を30%上昇させる。",
    target: ["GREEN", "CARE"],
    use(target) {
      applyPriceChanges({ [target]: 0.30 }, "国策テーマ化");
    }
  },
  rateHike: {
    id: "rateHike",
    name: "金利上昇",
    rarity: "Rare",
    category: "ニュース",
    description: "成長株であるTechNovaの株価を25%下落させる。",
    target: "none",
    use() {
      applyPriceChanges({ TECH: -0.25 }, "金利上昇");
    }
  },
  diversify: {
    id: "diversify",
    name: "分散投資",
    rarity: "Common",
    category: "防御",
    description: "次に受ける下落イベントの影響を半分にする。",
    target: "none",
    use() {
      gameState.effects.diversifyCharges += 1;
      addLog("分散投資を準備。次の下落イベントを半減します。");
    }
  },
  cashRatio: {
    id: "cashRatio",
    name: "現金比率アップ",
    rarity: "Common",
    category: "防御",
    description: "保有株の半分を売却して現金化する。",
    target: "none",
    use() {
      sellHalfOfAllStocks();
    }
  },
  crashGuard: {
    id: "crashGuard",
    name: "暴落耐性",
    rarity: "Rare",
    category: "防御",
    description: "次の株価下落を1回だけ無効化する。",
    target: "none",
    use() {
      gameState.effects.crashGuards += 1;
      addLog("暴落耐性を獲得。次の下落イベントを1回無効化します。");
    }
  },
  strongBuy: {
    id: "strongBuy",
    name: "集中投資",
    rarity: "Rare",
    category: "投資行動",
    description: "指定銘柄を買えるだけ購入し、その銘柄をさらに5%押し上げる。",
    target: "all",
    use(target) {
      buyStock(target, 1);
      applyPriceChanges({ [target]: 0.05 }, "集中投資の需給");
    }
  },
  megaEarnings: {
    id: "megaEarnings",
    name: "サプライズ決算",
    rarity: "Epic",
    category: "ニュース",
    description: "指定銘柄の株価を40%上昇させる。",
    target: "all",
    use(target) {
      applyPriceChanges({ [target]: 0.40 }, "サプライズ決算");
    }
  },
  ironGuard: {
    id: "ironGuard",
    name: "鉄壁ヘッジ",
    rarity: "Epic",
    category: "防御",
    description: "次の下落イベントを無効化し、さらに次の下落イベントを半減する。",
    target: "none",
    use() {
      gameState.effects.crashGuards += 1;
      gameState.effects.diversifyCharges += 1;
      addLog("鉄壁ヘッジを構築。下落無効化と半減を1回ずつ獲得しました。");
    }
  }
};

const INITIAL_DECK = [
  "buy",
  "buy",
  "takeProfit",
  "averageDown",
  "stopLoss",
  "goodEarnings",
  "diversify",
  "cashRatio"
];

const REWARD_POOL = [
  "buy",
  "takeProfit",
  "averageDown",
  "stopLoss",
  "goodEarnings",
  "badEarnings",
  "diversify",
  "cashRatio",
  "margin",
  "snsFire",
  "policyTheme",
  "rateHike",
  "crashGuard",
  "strongBuy",
  "megaEarnings",
  "ironGuard"
];

const gameState = {
  started: false,
  gameOver: false,
  waitingForReward: false,
  turn: 1,
  cash: INITIAL_CASH,
  stocks: [],
  deck: [],
  drawPile: [],
  discardPile: [],
  hand: [],
  playedThisTurn: 0,
  nextDrawBonus: 0,
  effects: {
    margin: false,
    diversifyCharges: 0,
    crashGuards: 0
  },
  logs: []
};

const elements = {
  startButton: document.getElementById("startButton"),
  restartButton: document.getElementById("restartButton"),
  resultRestartButton: document.getElementById("resultRestartButton"),
  endTurnButton: document.getElementById("endTurnButton"),
  turnText: document.getElementById("turnText"),
  cashText: document.getElementById("cashText"),
  stockValueText: document.getElementById("stockValueText"),
  totalAssetText: document.getElementById("totalAssetText"),
  playedCountText: document.getElementById("playedCountText"),
  stockTableBody: document.getElementById("stockTableBody"),
  handCards: document.getElementById("handCards"),
  logList: document.getElementById("logList"),
  effectBadges: document.getElementById("effectBadges"),
  rewardModal: document.getElementById("rewardModal"),
  rewardCards: document.getElementById("rewardCards"),
  resultModal: document.getElementById("resultModal"),
  resultLabel: document.getElementById("resultLabel"),
  resultTitle: document.getElementById("resultTitle"),
  resultMessage: document.getElementById("resultMessage")
};

function createInitialStock(template) {
  return {
    ...template,
    price: template.price,
    previousPrice: template.price,
    shares: 0,
    averageCost: 0
  };
}

function createCardInstance(cardId) {
  const canUseRandomUuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function";
  return {
    instanceId: canUseRandomUuid ? globalThis.crypto.randomUUID() : `${cardId}-${Date.now()}-${Math.random()}`,
    cardId
  };
}

function resetGame() {
  gameState.started = true;
  gameState.gameOver = false;
  gameState.waitingForReward = false;
  gameState.turn = 1;
  gameState.cash = INITIAL_CASH;
  gameState.stocks = STOCK_TEMPLATES.map(createInitialStock);
  gameState.deck = INITIAL_DECK.map(createCardInstance);
  gameState.drawPile = shuffle([...gameState.deck]);
  gameState.discardPile = [];
  gameState.hand = [];
  gameState.playedThisTurn = 0;
  gameState.nextDrawBonus = 0;
  gameState.effects = { margin: false, diversifyCharges: 0, crashGuards: 0 };
  gameState.logs = [];

  elements.rewardModal.classList.add("hidden");
  elements.resultModal.classList.add("hidden");
  addLog("ゲーム開始。初期資金100万円で20週間の投資を始めます。");
  startTurn();
}

function startTurn() {
  if (gameState.gameOver) return;

  gameState.playedThisTurn = 0;
  gameState.effects.margin = false;
  const drawCount = 3 + gameState.nextDrawBonus;
  gameState.nextDrawBonus = 0;
  drawCards(drawCount);
  addLog(`<strong>Turn ${gameState.turn}</strong> 開始。手札を${drawCount}枚引きました。`);
  render();
}

function drawCards(count) {
  for (let i = 0; i < count; i += 1) {
    if (gameState.drawPile.length === 0) {
      gameState.drawPile = shuffle(gameState.discardPile);
      gameState.discardPile = [];
    }
    const card = gameState.drawPile.pop();
    if (!card) return;
    gameState.hand.push(card);
  }
}

function useCard(instanceId, target) {
  if (!gameState.started || gameState.gameOver || gameState.waitingForReward) return;
  if (gameState.playedThisTurn >= MAX_CARDS_PER_TURN) return;

  const handIndex = gameState.hand.findIndex((card) => card.instanceId === instanceId);
  if (handIndex === -1) return;

  const cardInstance = gameState.hand[handIndex];
  const card = CARD_DEFINITIONS[cardInstance.cardId];
  if (!canUseCard(card, target)) return;

  card.use(target);
  gameState.hand.splice(handIndex, 1);
  gameState.discardPile.push(cardInstance);
  gameState.playedThisTurn += 1;
  addLog(`カード使用: <strong>${card.name}</strong>`);

  checkGameEnd();
  render();
}

function endTurn() {
  if (!gameState.started || gameState.gameOver || gameState.waitingForReward) return;

  gameState.discardPile.push(...gameState.hand);
  gameState.hand = [];
  setPreviousPrices();
  const event = randomItem(MARKET_EVENTS);
  addLog(`市場イベント: <strong>${event.name}</strong> - ${event.description}`);
  applyPriceChanges(event.changes, event.name);

  if (gameState.effects.margin) {
    resolveMarginRisk();
  }

  gameState.effects.margin = false;
  checkGameEnd();
  if (gameState.gameOver) {
    render();
    return;
  }

  if (gameState.turn >= MAX_TURNS) {
    finishGame();
    render();
    return;
  }

  gameState.waitingForReward = true;
  showRewards();
  render();
}

function chooseReward(cardId) {
  const newCard = createCardInstance(cardId);
  gameState.deck.push(newCard);
  gameState.discardPile.push(newCard);
  gameState.waitingForReward = false;
  elements.rewardModal.classList.add("hidden");
  gameState.turn += 1;
  addLog(`報酬カード <strong>${CARD_DEFINITIONS[cardId].name}</strong> をデッキに追加しました。`);
  startTurn();
}

function buyStock(symbol, cashRatio) {
  const stock = findStock(symbol);
  const budget = Math.floor(gameState.cash * cashRatio);
  const sharesToBuy = Math.floor(budget / stock.price);

  if (sharesToBuy <= 0) {
    addLog(`${stock.name}を購入する現金が不足しています。`);
    return;
  }

  const cost = sharesToBuy * stock.price;
  const currentCost = stock.averageCost * stock.shares;
  stock.averageCost = (currentCost + cost) / (stock.shares + sharesToBuy);
  stock.shares += sharesToBuy;
  gameState.cash -= cost;
  addLog(`${stock.name}を${sharesToBuy}株購入。約定代金 ${formatYen(cost)}。`);
}

function sellStock(symbol, ratio, reason) {
  const stock = findStock(symbol);
  const sharesToSell = Math.floor(stock.shares * ratio);

  if (sharesToSell <= 0) {
    addLog(`${stock.name}は保有していません。`);
    return;
  }

  const revenue = sharesToSell * stock.price;
  stock.shares -= sharesToSell;
  if (stock.shares === 0) stock.averageCost = 0;
  gameState.cash += revenue;
  addLog(`${reason}: ${stock.name}を${sharesToSell}株売却。受取 ${formatYen(revenue)}。`);
}

function sellHalfOfAllStocks() {
  let totalRevenue = 0;
  gameState.stocks.forEach((stock) => {
    const sharesToSell = Math.floor(stock.shares / 2);
    if (sharesToSell <= 0) return;
    const revenue = sharesToSell * stock.price;
    stock.shares -= sharesToSell;
    if (stock.shares === 0) stock.averageCost = 0;
    totalRevenue += revenue;
  });

  gameState.cash += totalRevenue;
  addLog(`現金比率アップ: 保有株の半分を売却し、${formatYen(totalRevenue)}を現金化しました。`);
}

function applyPriceChanges(changes, source) {
  const adjustedChanges = adjustDownside(changes, source);

  Object.entries(adjustedChanges).forEach(([symbol, percent]) => {
    const stock = findStock(symbol);
    const leverage = gameState.effects.margin && stock.shares > 0 ? 2 : 1;
    const leveragedPercent = percent * leverage;
    const oldPrice = stock.price;
    stock.price = Math.max(100, Math.round(stock.price * (1 + leveragedPercent)));
    const sign = leveragedPercent >= 0 ? "+" : "";
    addLog(`${stock.name}: ${formatYen(oldPrice)} → ${formatYen(stock.price)} (${sign}${formatPercent(leveragedPercent)})`);
  });
}

function adjustDownside(changes, source) {
  const hasDownside = Object.values(changes).some((percent) => percent < 0);
  if (!hasDownside) return changes;

  if (gameState.effects.crashGuards > 0) {
    gameState.effects.crashGuards -= 1;
    addLog(`暴落耐性が発動。${source} の下落を無効化しました。`);
    return Object.fromEntries(
      Object.entries(changes).map(([symbol, percent]) => [symbol, percent < 0 ? 0 : percent])
    );
  }

  if (gameState.effects.diversifyCharges > 0) {
    gameState.effects.diversifyCharges -= 1;
    addLog(`分散投資が発動。${source} の下落幅を半分にしました。`);
    return Object.fromEntries(
      Object.entries(changes).map(([symbol, percent]) => [symbol, percent < 0 ? percent / 2 : percent])
    );
  }

  return changes;
}

function resolveMarginRisk() {
  const riskRoll = Math.random();
  if (riskRoll >= 0.30) {
    addLog("信用取引の追証リスクは発生しませんでした。");
    return;
  }

  const shock = {};
  gameState.stocks.forEach((stock) => {
    if (stock.shares > 0) shock[stock.symbol] = -0.15;
  });

  if (Object.keys(shock).length === 0) {
    addLog("信用取引のリスク判定は発生しましたが、保有株がありませんでした。");
    return;
  }

  addLog("信用取引の追証リスク発生。保有銘柄に追加ショック -15%。");
  applyPriceChanges(shock, "信用取引リスク");
}

function showRewards() {
  const rewards = drawRewardChoices();
  elements.rewardCards.innerHTML = "";
  rewards.forEach((cardId) => {
    const cardElement = createCardElement(CARD_DEFINITIONS[cardId], {
      reward: true,
      onClick: () => chooseReward(cardId)
    });
    elements.rewardCards.appendChild(cardElement);
  });
  elements.rewardModal.classList.remove("hidden");
}

function drawRewardChoices() {
  const choices = new Set();
  while (choices.size < 3) {
    const roll = Math.random();
    const rarity = roll < 0.68 ? "Common" : roll < 0.92 ? "Rare" : "Epic";
    const candidates = REWARD_POOL.filter((cardId) => CARD_DEFINITIONS[cardId].rarity === rarity);
    choices.add(randomItem(candidates));
  }
  return [...choices];
}

function canUseCard(card, target) {
  if (gameState.playedThisTurn >= MAX_CARDS_PER_TURN) return false;
  const targets = getTargetsForCard(card);
  return card.target === "none" || targets.some((stock) => stock.symbol === target);
}

function getTargetsForCard(card) {
  if (card.target === "none") return [];
  if (Array.isArray(card.target)) {
    return gameState.stocks.filter((stock) => card.target.includes(stock.symbol));
  }
  if (card.target === "owned") {
    return gameState.stocks.filter((stock) => stock.shares > 0);
  }
  if (card.target === "dipped") {
    return gameState.stocks.filter((stock) => stock.price < stock.previousPrice);
  }
  return gameState.stocks;
}

function setPreviousPrices() {
  gameState.stocks.forEach((stock) => {
    stock.previousPrice = stock.price;
  });
}

function checkGameEnd() {
  if (calculateTotalAssets() <= 0) {
    gameState.gameOver = true;
    showResult("Game Over", "破産しました", `総資産が0円以下になりました。最終資産: ${formatYen(calculateTotalAssets())}`);
  }
}

function finishGame() {
  gameState.gameOver = true;
  const total = calculateTotalAssets();
  const multiple = total / INITIAL_CASH;
  const rank = multiple >= 3 ? "S" : multiple >= 2 ? "A" : multiple >= 1.4 ? "B" : multiple >= 1 ? "C" : "D";
  showResult("Final Score", "20ターン終了", `最終資産は ${formatYen(total)}。初期資産比 ${multiple.toFixed(2)} 倍、投資ランク ${rank} です。`);
}

function showResult(label, title, message) {
  elements.resultLabel.textContent = label;
  elements.resultTitle.textContent = title;
  elements.resultMessage.textContent = message;
  elements.resultModal.classList.remove("hidden");
}

function calculateStockValue() {
  return gameState.stocks.reduce((sum, stock) => sum + stock.price * stock.shares, 0);
}

function calculateTotalAssets() {
  return gameState.cash + calculateStockValue();
}

function findStock(symbol) {
  return gameState.stocks.find((stock) => stock.symbol === symbol);
}

function addLog(message) {
  gameState.logs.unshift({
    turn: gameState.turn,
    message
  });
  gameState.logs = gameState.logs.slice(0, 80);
}

function render() {
  renderStatus();
  renderStocks();
  renderHand();
  renderLogs();
  renderEffects();
  elements.startButton.disabled = gameState.started && !gameState.gameOver;
  elements.endTurnButton.disabled = !gameState.started || gameState.gameOver || gameState.waitingForReward;
}

function renderStatus() {
  elements.turnText.textContent = gameState.started ? `${gameState.turn} / ${MAX_TURNS}` : "-";
  elements.cashText.textContent = formatYen(gameState.cash);
  elements.stockValueText.textContent = formatYen(calculateStockValue());
  elements.totalAssetText.textContent = formatYen(calculateTotalAssets());
  elements.playedCountText.textContent = `使用済み ${gameState.playedThisTurn} / ${MAX_CARDS_PER_TURN}`;
}

function renderStocks() {
  elements.stockTableBody.innerHTML = "";
  gameState.stocks.forEach((stock) => {
    const row = document.createElement("tr");
    const change = stock.previousPrice === 0 ? 0 : (stock.price - stock.previousPrice) / stock.previousPrice;
    row.innerHTML = `
      <td>
        <div class="stock-name">
          <strong>${stock.name}</strong>
          <span>${stock.type} / ${stock.note}</span>
        </div>
      </td>
      <td>${formatYen(stock.price)}</td>
      <td class="${changeClass(change)}">${change >= 0 ? "+" : ""}${formatPercent(change)}</td>
      <td>${stock.shares.toLocaleString("ja-JP")}株</td>
      <td>${formatYen(stock.price * stock.shares)}</td>
    `;
    elements.stockTableBody.appendChild(row);
  });
}

function renderHand() {
  elements.handCards.innerHTML = "";
  if (!gameState.started) {
    elements.handCards.innerHTML = `<div class="empty-state">ゲーム開始を押すと手札が配られます。</div>`;
    return;
  }
  if (gameState.hand.length === 0) {
    elements.handCards.innerHTML = `<div class="empty-state">手札はありません。ターンを終了してください。</div>`;
    return;
  }

  gameState.hand.forEach((cardInstance) => {
    const card = CARD_DEFINITIONS[cardInstance.cardId];
    const cardElement = createCardElement(card, {
      instanceId: cardInstance.instanceId,
      disabled: gameState.playedThisTurn >= MAX_CARDS_PER_TURN || gameState.waitingForReward || gameState.gameOver,
      onClick: useCard
    });
    elements.handCards.appendChild(cardElement);
  });
}

function createCardElement(card, options) {
  const element = document.createElement("article");
  element.className = `card ${card.rarity.toLowerCase()}`;

  const targets = getTargetsForCard(card);
  const isTargetCard = card.target !== "none" && !options.reward;
  const disabled = options.reward ? false : options.disabled || (isTargetCard && targets.length === 0);

  element.innerHTML = `
    <div class="card-top">
      <div>
        <p class="eyebrow">${card.category}</p>
        <h3>${card.name}</h3>
      </div>
      <span class="rarity">${card.rarity}</span>
    </div>
    <p>${card.description}</p>
  `;

  let select = null;
  if (isTargetCard) {
    select = document.createElement("select");
    targets.forEach((stock) => {
      const option = document.createElement("option");
      option.value = stock.symbol;
      option.textContent = `${stock.name} (${formatYen(stock.price)})`;
      select.appendChild(option);
    });
    if (targets.length === 0) {
      const option = document.createElement("option");
      option.textContent = "対象なし";
      select.appendChild(option);
    }
    element.appendChild(select);
  }

  const button = document.createElement("button");
  button.textContent = options.reward ? "デッキに追加" : "使用";
  button.disabled = disabled;
  button.addEventListener("click", () => {
    if (options.reward) {
      options.onClick();
      return;
    }
    options.onClick(options.instanceId, select ? select.value : null);
  });
  element.appendChild(button);

  if (disabled) element.classList.add("disabled");
  return element;
}

function renderLogs() {
  elements.logList.innerHTML = "";
  gameState.logs.forEach((log) => {
    const item = document.createElement("div");
    item.className = "log-item";
    item.innerHTML = `<strong>T${log.turn}</strong> ${log.message}`;
    elements.logList.appendChild(item);
  });
}

function renderEffects() {
  const badges = [
    { label: "信用取引", active: gameState.effects.margin },
    { label: `分散 ${gameState.effects.diversifyCharges}`, active: gameState.effects.diversifyCharges > 0 },
    { label: `暴落耐性 ${gameState.effects.crashGuards}`, active: gameState.effects.crashGuards > 0 },
    { label: `山札 ${gameState.drawPile.length}`, active: false },
    { label: `捨札 ${gameState.discardPile.length}`, active: false },
    { label: `デッキ ${gameState.deck.length}`, active: false }
  ];

  elements.effectBadges.innerHTML = badges
    .map((badge) => `<span class="badge ${badge.active ? "active" : ""}">${badge.label}</span>`)
    .join("");
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function formatYen(value) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function changeClass(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

elements.startButton.addEventListener("click", resetGame);
elements.restartButton.addEventListener("click", resetGame);
elements.resultRestartButton.addEventListener("click", resetGame);
elements.endTurnButton.addEventListener("click", endTurn);

render();
