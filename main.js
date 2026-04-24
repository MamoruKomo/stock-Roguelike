"use strict";

const MAX_STAGES = 5;
const STAGE_TURNS = 4;
const MAX_TURNS = MAX_STAGES * STAGE_TURNS;
const INITIAL_CASH = 1000000;
const MAX_CARDS_PER_TURN = 2;
const TRANSACTION_FEE_RATE = 0.001;

const STOCK_TEMPLATES = [
  { symbol: "TECH", name: "市場価格", type: "マーケット", price: 10000, note: "ボス予兆を読んで売買する" }
];

const STOCK_ICONS = {
  TECH: "assets/icon_technova.png"
};

const MARKET_EVENTS = [
  {
    name: "地合い改善",
    description: "市場価格 +10%",
    changes: { TECH: 0.10 }
  },
  {
    name: "地合い悪化",
    description: "市場価格 -10%",
    changes: { TECH: -0.10 }
  },
  {
    name: "AIブーム",
    description: "市場価格 +20%",
    changes: { TECH: 0.20 }
  },
  {
    name: "大型契約観測",
    description: "市場価格 +18%",
    changes: { TECH: 0.18 }
  },
  {
    name: "製品延期",
    description: "市場価格 -22%",
    changes: { TECH: -0.22 }
  },
  {
    name: "補助金採択",
    description: "市場価格 +25%",
    changes: { TECH: 0.25 }
  },
  {
    name: "円安追い風",
    description: "市場価格 +10%",
    changes: { TECH: 0.10 }
  },
  {
    name: "景気後退",
    description: "市場価格 -15%",
    changes: { TECH: -0.15 }
  }
];

const STAGES = [
  {
    name: "決算の門番",
    theme: "決算発表",
    hp: 100000,
    cashBonus: 50000,
    marketMultiplier: 1,
    bossName: "決算の門番"
  },
  {
    name: "炎上インフルエンサー",
    theme: "SNS相場",
    hp: 180000,
    cashBonus: 80000,
    marketMultiplier: 1.1,
    bossName: "炎上インフルエンサー"
  },
  {
    name: "空売りファンド",
    theme: "機関投資家",
    hp: 280000,
    cashBonus: 120000,
    marketMultiplier: 1.2,
    bossName: "空売りファンド"
  },
  {
    name: "中央銀行",
    theme: "金融引き締め",
    hp: 400000,
    cashBonus: 180000,
    marketMultiplier: 1.35,
    bossName: "中央銀行"
  },
  {
    name: "ブラックマンデー",
    theme: "市場暴落",
    hp: 600000,
    cashBonus: 0,
    marketMultiplier: 1.5,
    bossName: "ブラックマンデー"
  }
];

const PASSIVE_DEFINITIONS = {
  analysis: {
    id: "analysis",
    name: "分析力",
    description: "次のボス予兆が少し具体的になる。"
  },
  feeCut: {
    id: "feeCut",
    name: "手数料削減",
    description: "売買時の手数料を50%削減する。"
  },
  diversifiedInvestor: {
    id: "diversifiedInvestor",
    name: "資金管理家",
    description: "現金比率が30%以上ある場合、下落イベントの影響を20%軽減する。"
  },
  contrarian: {
    id: "contrarian",
    name: "逆張り投資家",
    description: "前ターンに下落した価格を購入すると、購入量が10%増える。"
  },
  riskManagement: {
    id: "riskManagement",
    name: "リスク管理",
    description: "ステージ中に一度だけ、最大損失を半分にする。"
  },
  infoNetwork: {
    id: "infoNetwork",
    name: "情報網",
    description: "ボスイベントの方向性が1ターン早くわかる。"
  },
  longTerm: {
    id: "longTerm",
    name: "長期投資家",
    description: "2ターン以上保有している場合、評価額を少し上げる。"
  },
  gambler: {
    id: "gambler",
    name: "ギャンブラー",
    description: "信用取引の利益と損失が2.5倍になる。"
  }
};

const CARD_DEFINITIONS = {
  buy: {
    id: "buy",
    name: "押し目買いシグナル",
    rarity: "Common",
    category: "投資支援",
    description: "市場価格を一時的に5%下落させる。常時売買で買い場を作るカード。",
    target: "all",
    use(target) {
      applyPriceChanges({ [target]: -0.05 }, "押し目買いシグナル");
    }
  },
  takeProfit: {
    id: "takeProfit",
    name: "利確ブースト",
    rarity: "Common",
    category: "投資支援",
    description: "保有中なら市場価格を8%上昇させる。売却判断は常時売買で行う。",
    target: "owned",
    use(target) {
      applyPriceChanges({ [target]: 0.08 }, "利確ブースト");
    }
  },
  averageDown: {
    id: "averageDown",
    name: "ナンピン",
    rarity: "Common",
    category: "投資支援",
    description: "前ターンより下落している時、平均取得価格を10%改善する。",
    target: "dipped",
    use(target) {
      improveAverageCost(target, 0.10);
    }
  },
  stopLoss: {
    id: "stopLoss",
    name: "損切り",
    rarity: "Common",
    category: "投資支援",
    description: "次ターンに引くカードを1枚増やし、次の下落イベントを半減する。",
    target: "none",
    use() {
      gameState.nextDrawBonus += 1;
      gameState.effects.diversifyCharges += 1;
      addLog("損切りルールを設定。次ターン+1ドロー、次の下落イベントを半減します。");
    }
  },
  margin: {
    id: "margin",
    name: "信用取引",
    rarity: "Rare",
    category: "投資行動",
    description: "このターン中、保有ポジションの利益と損失が2倍。終了時に追証リスクがある。",
    target: "none",
    use() {
      gameState.effects.margin = true;
      addLog("信用取引を開始。保有ポジションの値動きがこのターンだけ2倍になります。");
    }
  },
  goodEarnings: {
    id: "goodEarnings",
    name: "好決算",
    rarity: "Common",
    category: "ニュース",
    description: "市場価格を20%上昇させる。",
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
    description: "市場価格を20%下落させる。",
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
    description: "市場価格を30%下落させる。",
    target: "all",
    use(target) {
      applyPriceChanges({ [target]: -0.30 }, "SNS炎上");
    }
  },
  policyTheme: {
    id: "policyTheme",
    name: "国策テーマ化",
    rarity: "Rare",
    category: "ニュース",
    description: "市場価格を30%上昇させる。",
    target: "all",
    use(target) {
      applyPriceChanges({ [target]: 0.30 }, "国策テーマ化");
    }
  },
  rateHike: {
    id: "rateHike",
    name: "金利上昇",
    rarity: "Rare",
    category: "ニュース",
    description: "高PER不安で市場価格を25%下落させる。",
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
    description: "市場下落に備える。次の下落イベントを半減し、現金が5万円増える。",
    target: "none",
    use() {
      gameState.effects.diversifyCharges += 1;
      gameState.cash += 50000;
      addLog(`現金比率アップ: 余力を${formatYen(50000)}増やし、次の下落を半減します。`);
    }
  },
  crashGuard: {
    id: "crashGuard",
    name: "暴落耐性",
    rarity: "Rare",
    category: "防御",
    description: "次の価格下落を1回だけ無効化する。",
    target: "none",
    use() {
      gameState.effects.crashGuards += 1;
      addLog("暴落耐性を獲得。次の下落イベントを1回無効化します。");
    }
  },
  strongBuy: {
    id: "strongBuy",
    name: "仕手筋の噂",
    rarity: "Rare",
    category: "ニュース",
    description: "市場価格を12%上昇させ、次の上昇イベント倍率をさらに高める。",
    target: "all",
    use(target) {
      applyPriceChanges({ [target]: 0.12 }, "仕手筋の噂");
      gameState.effects.upsideBoostCharges += 1;
    }
  },
  megaEarnings: {
    id: "megaEarnings",
    name: "サプライズ決算",
    rarity: "Epic",
    category: "ニュース",
    description: "市場価格を40%上昇させる。",
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
  },
  diceRoll: {
    id: "diceRoll",
    name: "運命のダイス",
    rarity: "Common",
    category: "運試し",
    description: "市場価格にランダムな値動き。-15%、+10%、+25%のどれかが出る。",
    target: "all",
    use(target) {
      const outcomes = [-0.15, 0.10, 0.25];
      const result = randomItem(outcomes);
      addLog(`運命のダイス: ${formatPercent(result)} が出ました。`);
      applyPriceChanges({ [target]: result }, "運命のダイス");
    }
  },
  jokerMultiplier: {
    id: "jokerMultiplier",
    name: "ジョーカー倍率",
    rarity: "Rare",
    category: "コンボ",
    description: "次に発生する上昇イベントの上昇率を1.5倍にする。",
    target: "none",
    use() {
      gameState.effects.upsideBoostCharges += 1;
      addLog("ジョーカー倍率を準備。次の上昇イベントを1.5倍にします。");
    }
  },
  relicHunt: {
    id: "relicHunt",
    name: "レリック発見",
    rarity: "Epic",
    category: "レリック",
    description: "ランダムな恒久効果を1つ獲得する。重複なし。",
    target: "none",
    use() {
      gainRandomRelic();
    }
  },
  deckThin: {
    id: "deckThin",
    name: "デッキ圧縮",
    rarity: "Common",
    category: "デッキ操作",
    description: "山札か捨札からCommonカードを1枚除外する。このカードも使用後に除外される。",
    target: "none",
    exhaustOnUse: true,
    use() {
      removeWeakCardFromDeck();
    }
  },
  marketBranch: {
    id: "marketBranch",
    name: "分岐ルート選択",
    rarity: "Rare",
    category: "市場操作",
    description: "次の市場イベントは2候補から、現在の保有に有利な方を自動選択する。",
    target: "none",
    use() {
      gameState.effects.marketChoiceCharges += 1;
      addLog("分岐ルートを確保。次の市場イベントは2候補から有利な方を選びます。");
    }
  }
};

const INITIAL_DECK = [
  "buy",
  "takeProfit",
  "averageDown",
  "stopLoss",
  "goodEarnings",
  "diversify",
  "diceRoll",
  "deckThin"
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
  "ironGuard",
  "diceRoll",
  "jokerMultiplier",
  "relicHunt",
  "deckThin",
  "marketBranch"
];

const gameState = {
  started: false,
  gameOver: false,
  waitingForReward: false,
  turn: 1,
  stageIndex: 0,
  stageTurn: 1,
  stageStartAssets: INITIAL_CASH,
  lastTurnAssets: INITIAL_CASH,
  stageDamage: 0,
  lastDamage: 0,
  bonusDamageThisTurn: 0,
  damageCombo: 0,
  lastOverkill: 0,
  bossHp: 0,
  bossMaxHp: 0,
  bossPlan: null,
  currentOmen: "ゲーム開始後に表示されます。",
  priceHistory: [],
  pendingReward: null,
  selectedRewardCard: null,
  selectedRewardPassive: null,
  stageRiskUsed: false,
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
    crashGuards: 0,
    upsideBoostCharges: 0,
    marketChoiceCharges: 0
  },
  relics: [],
  passives: [],
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
  stageText: document.getElementById("stageText"),
  stageTurnText: document.getElementById("stageTurnText"),
  stageNameText: document.getElementById("stageNameText"),
  bossNameText: document.getElementById("bossNameText"),
  bossHpText: document.getElementById("bossHpText"),
  bossHpFill: document.getElementById("bossHpFill"),
  stageStartText: document.getElementById("stageStartText"),
  stageProfitText: document.getElementById("stageProfitText"),
  lastDamageText: document.getElementById("lastDamageText"),
  comboText: document.getElementById("comboText"),
  bossOmenText: document.getElementById("bossOmenText"),
  passiveList: document.getElementById("passiveList"),
  marketPriceText: document.getElementById("marketPriceText"),
  marketChangeText: document.getElementById("marketChangeText"),
  marketHeatText: document.getElementById("marketHeatText"),
  priceChart: document.getElementById("priceChart"),
  positionSharesText: document.getElementById("positionSharesText"),
  positionValueText: document.getElementById("positionValueText"),
  averageCostText: document.getElementById("averageCostText"),
  unrealizedProfitText: document.getElementById("unrealizedProfitText"),
  tradeStockSelect: document.getElementById("tradeStockSelect"),
  tradeSharesInput: document.getElementById("tradeSharesInput"),
  buySharesButton: document.getElementById("buySharesButton"),
  sellSharesButton: document.getElementById("sellSharesButton"),
  maxBuyButton: document.getElementById("maxBuyButton"),
  maxSellButton: document.getElementById("maxSellButton"),
  tradeHint: document.getElementById("tradeHint"),
  handCards: document.getElementById("handCards"),
  deckSummary: document.getElementById("deckSummary"),
  deckList: document.getElementById("deckList"),
  logList: document.getElementById("logList"),
  effectBadges: document.getElementById("effectBadges"),
  rewardModal: document.getElementById("rewardModal"),
  rewardTitle: document.getElementById("rewardTitle"),
  rewardCashText: document.getElementById("rewardCashText"),
  rewardCards: document.getElementById("rewardCards"),
  passiveRewards: document.getElementById("passiveRewards"),
  confirmRewardButton: document.getElementById("confirmRewardButton"),
  resultModal: document.getElementById("resultModal"),
  resultLabel: document.getElementById("resultLabel"),
  resultTitle: document.getElementById("resultTitle"),
  resultMessage: document.getElementById("resultMessage"),
  impactLayer: document.getElementById("impactLayer")
};

function createInitialStock(template) {
  return {
    ...template,
    price: template.price,
    previousPrice: template.price,
    shares: 0,
    averageCost: 0,
    holdingTurns: 0,
    heat: 0
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
  gameState.stageIndex = 0;
  gameState.stageTurn = 1;
  gameState.cash = INITIAL_CASH;
  gameState.stocks = STOCK_TEMPLATES.map(createInitialStock);
  gameState.deck = INITIAL_DECK.map(createCardInstance);
  gameState.drawPile = shuffle([...gameState.deck]);
  gameState.discardPile = [];
  gameState.hand = [];
  gameState.playedThisTurn = 0;
  gameState.nextDrawBonus = 0;
  gameState.effects = { margin: false, diversifyCharges: 0, crashGuards: 0, upsideBoostCharges: 0, marketChoiceCharges: 0 };
  gameState.relics = [];
  gameState.passives = [];
  gameState.pendingReward = null;
  gameState.selectedRewardCard = null;
  gameState.selectedRewardPassive = null;
  gameState.stageRiskUsed = false;
  gameState.priceHistory = [];
  gameState.logs = [];

  elements.rewardModal.classList.add("hidden");
  elements.resultModal.classList.add("hidden");
  recordMarketPrice("START");
  setupStage(0);
  addLog("ゲーム開始。全5ステージの短期決戦を開始します。各ステージ4ターン以内にボスHPを削り切ってください。");
  startTurn();
}

function startTurn() {
  if (gameState.gameOver) return;

  gameState.playedThisTurn = 0;
  gameState.effects.margin = false;
  prepareStageTurnOmen();
  if (hasRelic("riskMeter")) {
    gameState.effects.diversifyCharges += 1;
    addLog("レリック「リスク計量器」: このターンの下落半減を1回獲得。");
  }
  const relicDrawBonus = hasRelic("tradingTerminal") ? 1 : 0;
  const drawCount = 3 + gameState.nextDrawBonus + relicDrawBonus;
  gameState.nextDrawBonus = 0;
  drawCards(drawCount);
  addLog(`<strong>Stage ${gameState.stageIndex + 1}-${gameState.stageTurn}</strong> 開始。手札を${drawCount}枚引きました。`);
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
  if (card.exhaustOnUse) {
    removeCardInstanceFromDeck(cardInstance.instanceId);
    addLog(`<strong>${card.name}</strong> は使用後にデッキから除外されました。`);
  } else {
    gameState.discardPile.push(cardInstance);
  }
  gameState.playedThisTurn += 1;
  addLog(`カード使用: <strong>${card.name}</strong>`);
  triggerImpact(card.name, "card");

  checkGameEnd();
  render();
}

function endTurn() {
  if (!gameState.started || gameState.gameOver || gameState.waitingForReward) return;

  gameState.bonusDamageThisTurn = 0;
  gameState.discardPile.push(...gameState.hand);
  gameState.hand = [];
  setPreviousPrices();
  resolveStageTurnEvent();

  if (gameState.effects.margin) {
    resolveMarginRisk();
  }

  updateHoldingTurns();
  resolvePassiveEndOfTurnEffects();
  resolveEndOfTurnRelics();
  resolveOverheatCorrections();

  gameState.effects.margin = false;
  resolveBossDamage();
  checkGameEnd();
  if (gameState.gameOver) {
    render();
    return;
  }

  if (gameState.bossHp <= 0) {
    resolveStageEnd();
    return;
  }

  if (gameState.stageTurn >= STAGE_TURNS) {
    resolveStageEnd();
    return;
  }

  gameState.stageTurn += 1;
  gameState.turn += 1;
  startTurn();
}

function setupStage(stageIndex) {
  const stage = STAGES[stageIndex];
  gameState.stageIndex = stageIndex;
  gameState.stageTurn = 1;
  gameState.stageStartAssets = calculateTotalAssets();
  gameState.lastTurnAssets = gameState.stageStartAssets;
  gameState.stageDamage = 0;
  gameState.lastDamage = 0;
  gameState.bonusDamageThisTurn = 0;
  gameState.damageCombo = 0;
  gameState.lastOverkill = 0;
  gameState.bossHp = stage.hp;
  gameState.bossMaxHp = stage.hp;
  gameState.bossPlan = createBossPlan(stageIndex);
  gameState.currentOmen = createStageStartOmen();
  gameState.stageRiskUsed = false;
  addLog(`<strong>Stage ${stageIndex + 1}: ${stage.name}</strong> 開始。テーマ: ${stage.theme} / ボスHP ${formatYen(stage.hp)}。`);
}

function createBossPlan(stageIndex) {
  if (stageIndex === 0) {
    const positive = Math.random() < 0.58;
    return { target: "TECH", positive, rebound: null };
  }
  if (stageIndex === 1) {
    const positive = Math.random() < 0.52;
    return { target: "TECH", positive, rebound: null };
  }
  if (stageIndex === 4) {
    return { target: "TECH", positive: false, rebound: "TECH" };
  }
  return { target: "TECH", positive: false, rebound: null };
}

function createStageStartOmen() {
  const stage = getCurrentStage();
  if (hasPassive("infoNetwork")) {
    const target = getKnownBossTarget();
    if (target) return `情報網: 次のボス対象は ${findStock(target).name}。Stage ${gameState.stageIndex + 1}「${stage.name}」への準備を。`;
  }
  return `Stage ${gameState.stageIndex + 1}「${stage.name}」開幕。テーマは「${stage.theme}」。`;
}

function prepareStageTurnOmen() {
  if (gameState.stageTurn === 1) {
    if (!hasPassive("infoNetwork")) {
      gameState.currentOmen = createStageStartOmen();
    }
    return;
  }

  if (gameState.stageTurn === 2) {
    gameState.currentOmen = createBossOmen();
    addLog(`ボス予兆: ${gameState.currentOmen}`);
    triggerDelayedImpact("WARNING", "warning");
    return;
  }

  if (gameState.stageTurn < STAGE_TURNS) {
    gameState.currentOmen = `調整ターン。${getCurrentStage().bossName} の本命イベント前に、保有口数と現金比率を整えてください。`;
    return;
  }

  gameState.currentOmen = `ボスターン。${getCurrentStage().bossName} のイベントがターン終了時に発生します。`;
  triggerDelayedImpact("BOSS TURN", "boss");
}

function createBossOmen() {
  const stageIndex = gameState.stageIndex;
  const plan = gameState.bossPlan;
  const precise = hasPassive("analysis");
  if (stageIndex === 0) {
    const stock = findStock(plan.target);
    const mood = plan.positive ? "好調そう" : "不安がある";
    return precise
      ? `${stock.name} の決算が対象。資料には「${mood}」という強いサイン。`
      : `${stock.name} に決算発表の気配。「${mood}」という市場の噂。`;
  }
  if (stageIndex === 1) {
    const stock = findStock(plan.target);
    const mood = plan.positive ? "熱狂的な拡散" : "炎上の火種";
    return precise
      ? `SNSトレンドは ${stock.name} に集中。内容は「${mood}」。`
      : `${stock.name} にSNS相場の気配。内容は「${mood}」かもしれない。`;
  }
  if (stageIndex === 2) {
    return precise
      ? "空売りファンドは過大ポジションを狙っている。現金比率25%以上なら圧力は軽くなる。"
      : "空売りファンドが信用残と過大ポジションを監視している。現金を残すほど安全。";
  }
  if (stageIndex === 3) {
    return precise
      ? "中央銀行は市場価格に強い下落圧力。現金比率35%以上ならショック後の買い余力として評価される。"
      : "金融引き締めの予兆。高ボラティリティと信用取引に警戒。";
  }
  return precise
    ? "ブラックマンデー後、市場価格に大反発の買いが入りそう。暴落前の現金と暴落耐性が鍵。"
    : "全面暴落の予兆。ただし暴落後に強い反発資金が向かう気配。";
}

function getKnownBossTarget() {
  if (!gameState.bossPlan) return null;
  return gameState.bossPlan.target;
}

function resolveStageTurnEvent() {
  if (gameState.stageTurn === 1) {
    const event = selectMarketEvent();
    addLog(`市場イベント: <strong>${event.name}</strong> - ${event.description}`);
    applyPriceChanges(scaleChanges(event.changes, getCurrentStage().marketMultiplier), event.name);
    resolveStagePressure();
    return;
  }

  if (gameState.stageTurn === 2) {
    addLog("予兆ターン終了。大きなボスイベントはまだ発生しません。ポジション調整の結果を評価します。");
    resolveStagePressure();
    return;
  }

  if (gameState.stageTurn < STAGE_TURNS) {
    const event = selectMarketEvent();
    addLog(`調整ターン市場: <strong>${event.name}</strong> - ${event.description}`);
    applyPriceChanges(scaleChanges(event.changes, getCurrentStage().marketMultiplier * 0.65), event.name);
    resolveStagePressure();
    return;
  }

  addLog(`ボスイベント: <strong>${getCurrentStage().bossName}</strong> が動きます。`);
  triggerImpact("BOSS EVENT", "boss");
  resolveBossEvent();
}

function resolveStagePressure() {
  if (gameState.stageIndex === 1 && gameState.stageTurn < STAGE_TURNS) {
    const techMove = randomItem([-0.12, -0.08, 0.08, 0.12]);
    addLog("SNS相場のボラティリティ上昇: 市場価格が荒い値動き。");
    applyPriceChanges({ TECH: techMove }, "SNSボラティリティ");
    return;
  }

  if (gameState.stageIndex !== 3) return;
  const pressure = gameState.stageTurn === 1 ? -0.10 : -0.08;
  addLog("中央銀行の継続圧力: 市場価格に金融引き締め売り。");
  applyPriceChanges({ TECH: pressure }, "中央銀行の継続圧力");
}

function resolveBossEvent() {
  const plan = gameState.bossPlan;
  if (gameState.stageIndex === 0) {
    const percent = plan.positive ? 0.25 : -0.20;
    applyPriceChanges({ [plan.target]: percent }, "決算発表");
    rewardReadBonus(plan.target, plan.positive, "決算読み切り");
    return;
  }

  if (gameState.stageIndex === 1) {
    const percent = plan.positive ? 0.35 : -0.30;
    applyPriceChanges({ [plan.target]: percent }, "SNS相場");
    rewardReadBonus(plan.target, plan.positive, "SNS読み切り");
    return;
  }

  if (gameState.stageIndex === 2) {
    const cashCushion = getCashRatio() >= 0.25;
    applyPriceChanges({ TECH: cashCushion ? -0.10 : -0.25 }, cashCushion ? "現金余力で軽減した空売り" : "空売りファンドの集中攻撃");
    if (cashCushion) addBonusDamage(Math.floor(getCurrentStage().hp * 0.40), "現金余力ボーナス");
    return;
  }

  if (gameState.stageIndex === 3) {
    applyPriceChanges({ TECH: -0.28 }, "中央銀行ショック");
    if (getCashRatio() >= 0.35) {
      addBonusDamage(Math.floor(getCurrentStage().hp * 0.35), "金融引き締め対応ボーナス");
    }
    return;
  }

  const cashBeforeCrash = getCashRatio();
  applyPriceChanges({ TECH: -0.30 }, "ブラックマンデー暴落");
  applyPriceChanges({ TECH: 0.50 }, "暴落後の大反発");
  if (findStock("TECH").shares > 0) {
    addBonusDamage(Math.floor(findStock("TECH").shares * findStock("TECH").price * 0.35), "大反発キャッチボーナス");
  }
  if (cashBeforeCrash >= 0.40) {
    addBonusDamage(Math.floor(getCurrentStage().hp * 0.25), "暴落待機ボーナス");
  }
}

function rewardReadBonus(symbol, positive, label) {
  const exposure = calculateStockExposure(symbol);
  if (positive && findStock(symbol).shares > 0) {
    addBonusDamage(Math.floor(findStock(symbol).shares * findStock(symbol).price * 0.35), label);
    return;
  }
  if (!positive && exposure < 0.08) {
    addBonusDamage(Math.floor(getCurrentStage().hp * 0.75), label);
  }
}

function calculateStockExposure(symbol) {
  const total = calculateTotalAssets();
  if (total <= 0) return 0;
  const stock = findStock(symbol);
  if (!stock) return 0;
  return (stock.price * stock.shares) / total;
}

function getCashRatio() {
  const total = calculateTotalAssets();
  if (total <= 0) return 0;
  return gameState.cash / total;
}

function addBonusDamage(amount, label) {
  const damage = Math.max(0, Math.floor(amount));
  if (damage <= 0) return;
  gameState.bonusDamageThisTurn += damage;
  addLog(`${label}: 追加 ${formatYen(damage)} ダメージ。`);
  triggerImpact(`${label} +${formatYen(damage)}`, "bonus");
}

function scaleChanges(changes, multiplier) {
  return Object.fromEntries(
    Object.entries(changes).map(([symbol, percent]) => [symbol, percent * multiplier])
  );
}

function resolveBossDamage() {
  const total = calculateTotalAssets();
  const gain = total - gameState.lastTurnAssets;
  const baseDamage = Math.max(0, Math.floor(gain));
  const bonusDamage = gameState.bonusDamageThisTurn;
  if (baseDamage > 0 || bonusDamage > 0) {
    gameState.damageCombo += 1;
    const multiplier = getDamageComboMultiplier();
    const concentrationRate = getLargestHoldingExposure();
    const concentrationPenalty = gameState.stageIndex >= 1 && concentrationRate > 0.7 ? 0.75 : 1;
    const rawDamage = Math.floor(baseDamage * multiplier) + bonusDamage;
    const damage = Math.floor(rawDamage * concentrationPenalty);
    const hpBefore = gameState.bossHp;
    gameState.bossHp = Math.max(0, gameState.bossHp - damage);
    gameState.lastDamage = damage;
    gameState.stageDamage += damage;
    gameState.lastOverkill = Math.max(0, damage - hpBefore);
    if (concentrationPenalty < 1) {
      addLog("ポジション過大: 総資産の70%超を建てているため、ボスへのダメージ効率が25%低下。");
    }
    addLog(`利益 ${formatYen(baseDamage)} × COMBO ${multiplier.toFixed(2)} + 読み切り ${formatYen(bonusDamage)} = <strong>${formatYen(damage)}</strong> ダメージ。残HP ${formatYen(gameState.bossHp)}。`);
    triggerImpact(`${formatYen(damage)} DAMAGE`, "damage");
    pulseElement(elements.bossHpFill, "hit");
  } else {
    gameState.damageCombo = 0;
    gameState.lastDamage = 0;
    gameState.lastOverkill = 0;
    addLog("前ターン比の利益がないため、ボスへのダメージは0。");
    triggerImpact("NO DAMAGE", "miss");
  }
  gameState.lastTurnAssets = total;
}

function getDamageComboMultiplier() {
  return Math.min(2, 1 + Math.max(0, gameState.damageCombo - 1) * 0.25);
}

function resolveOverheatCorrections() {
  const corrections = {};

  gameState.stocks.forEach((stock) => {
    if (stock.heat < 6) return;
    const correction = stock.heat >= 8 ? -0.24 : -0.15;
    corrections[stock.symbol] = correction;
    stock.heat = Math.max(0, stock.heat - 5);
  });

  if (Object.keys(corrections).length === 0) return;

  addLog("過熱反動: 上昇カードで買われすぎた価格帯に利確売りが発生。");
  triggerImpact("OVERHEAT SELL", "warning");
  applyPriceChanges(corrections, "過熱反動");
}

function resolveStageEnd() {
  if (gameState.bossHp > 0) {
    gameState.gameOver = true;
    showResult("Game Over", "ボス撃破失敗", `${getCurrentStage().bossName} のHPが ${formatYen(gameState.bossHp)} 残りました。最終資産: ${formatYen(calculateTotalAssets())}`);
    render();
    return;
  }

  addLog(`<strong>${getCurrentStage().bossName}</strong> を撃破。ステージクリア。`);
  triggerImpact(gameState.lastOverkill > 0 ? `OVERKILL +${formatYen(gameState.lastOverkill)}` : "BOSS BREAK", "clear");
  pulseElement(document.body, "screen-burst");
  if (gameState.stageIndex >= MAX_STAGES - 1) {
    finishGame();
    render();
    return;
  }

  gameState.waitingForReward = true;
  showRewards();
  render();
}

function confirmStageReward() {
  if (!gameState.pendingReward || !gameState.selectedRewardCard || !gameState.selectedRewardPassive) return;

  const newCard = createCardInstance(gameState.selectedRewardCard);
  gameState.deck.push(newCard);
  gameState.discardPile.push(newCard);
  if (!hasPassive(gameState.selectedRewardPassive)) {
    gameState.passives.push(gameState.selectedRewardPassive);
  }
  const overkillBonus = Math.min(Math.floor(gameState.lastOverkill * 0.15), getCurrentStage().hp);
  gameState.cash += gameState.pendingReward.cashBonus + overkillBonus;
  addLog(`報酬: ${CARD_DEFINITIONS[gameState.selectedRewardCard].name} / ${PASSIVE_DEFINITIONS[gameState.selectedRewardPassive].name} / 現金 ${formatYen(gameState.pendingReward.cashBonus)} / オーバーキル ${formatYen(overkillBonus)} を獲得。`);

  gameState.waitingForReward = false;
  gameState.pendingReward = null;
  gameState.selectedRewardCard = null;
  gameState.selectedRewardPassive = null;
  elements.rewardModal.classList.add("hidden");
  gameState.stageIndex += 1;
  gameState.turn += 1;
  setupStage(gameState.stageIndex);
  startTurn();
}

function buyStock(symbol, cashRatio) {
  const stock = findStock(symbol);
  const budget = Math.floor(gameState.cash * cashRatio);
  const sharesToBuy = Math.floor(budget / stock.price);
  buyShares(symbol, sharesToBuy, "カード買付");
}

function buyShares(symbol, sharesToBuy, source = "買付") {
  const stock = findStock(symbol);
  let bonusShares = 0;
  if (hasPassive("contrarian") && stock.price < stock.previousPrice) {
    bonusShares = Math.max(1, Math.floor(sharesToBuy * 0.1));
    addLog(`逆張り投資家: 下落時の買付量が${bonusShares}口増加。`);
  }

  if (sharesToBuy <= 0) {
    addLog(`${stock.name}を購入する現金が不足しています。`);
    return false;
  }

  const subtotal = sharesToBuy * stock.price;
  const fee = calculateTradeFee(subtotal);
  const cost = subtotal + fee;
  if (cost > gameState.cash) {
    addLog(`${sharesToBuy}口購入する現金が不足しています。`);
    return false;
  }

  const totalShares = sharesToBuy + bonusShares;
  const currentCost = stock.averageCost * stock.shares;
  stock.averageCost = (currentCost + subtotal) / (stock.shares + totalShares);
  stock.shares += totalShares;
  gameState.cash -= cost;
  addLog(`${source}: ${totalShares}口購入。約定代金 ${formatYen(subtotal)} / 手数料 ${formatYen(fee)}。`);
  triggerImpact(`BUY ${stock.name}`, "trade");
  return true;
}

function sellStock(symbol, ratio, reason) {
  const stock = findStock(symbol);
  const sharesToSell = Math.floor(stock.shares * ratio);
  sellShares(symbol, sharesToSell, reason);
}

function sellShares(symbol, sharesToSell, source = "売却") {
  const stock = findStock(symbol);
  if (sharesToSell <= 0) {
    addLog(`${stock.name}は保有していません。`);
    return false;
  }

  if (sharesToSell > stock.shares) {
    addLog(`保有口数を超えて売却することはできません。`);
    return false;
  }

  const subtotal = sharesToSell * stock.price;
  const fee = calculateTradeFee(subtotal);
  const revenue = subtotal - fee;
  stock.shares -= sharesToSell;
  if (stock.shares === 0) {
    stock.averageCost = 0;
    stock.holdingTurns = 0;
  }
  gameState.cash += revenue;
  addLog(`${source}: ${sharesToSell}口売却。受取 ${formatYen(revenue)} / 手数料 ${formatYen(fee)}。`);
  triggerImpact(`SELL ${stock.name}`, "trade");
  return true;
}

function calculateTradeFee(amount) {
  const rate = hasPassive("feeCut") ? TRANSACTION_FEE_RATE / 2 : TRANSACTION_FEE_RATE;
  return Math.ceil(amount * rate);
}

function calculateMaxBuyShares(price) {
  const rate = hasPassive("feeCut") ? TRANSACTION_FEE_RATE / 2 : TRANSACTION_FEE_RATE;
  return Math.floor(gameState.cash / (price * (1 + rate)));
}

function improveAverageCost(symbol, improvementRate) {
  const stock = findStock(symbol);
  if (stock.shares <= 0) {
    addLog(`${stock.name}は保有していないため、平均取得価格を改善できません。`);
    return;
  }
  const oldCost = stock.averageCost;
  stock.averageCost *= 1 - improvementRate;
  addLog(`${stock.name}の平均取得価格を ${formatYen(oldCost)} → ${formatYen(stock.averageCost)} に改善。`);
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
  addLog(`現金比率アップ: 保有ポジションの半分を売却し、${formatYen(totalRevenue)}を現金化しました。`);
}

function applyPriceChanges(changes, source) {
  const adjustedChanges = adjustUpside(adjustDownside(changes, source), source);

  Object.entries(adjustedChanges).forEach(([symbol, percent]) => {
    const stock = findStock(symbol);
    if (!stock) return;
    const leverage = gameState.effects.margin && stock.shares > 0 ? getMarginMultiplier(percent) : 1;
    const leveragedPercent = percent * leverage;
    const oldPrice = stock.price;
    stock.price = Math.max(100, Math.round(stock.price * (1 + leveragedPercent)));
    updateStockHeat(stock, leveragedPercent, source);
    recordMarketPrice(source);
    const sign = leveragedPercent >= 0 ? "+" : "";
    addLog(`${stock.name}: ${formatYen(oldPrice)} → ${formatYen(stock.price)} (${sign}${formatPercent(leveragedPercent)})`);
  });
}

function recordMarketPrice(source) {
  const stock = gameState.stocks[0];
  if (!stock) return;
  gameState.priceHistory.push({
    price: stock.price,
    source,
    turn: gameState.turn,
    stage: gameState.stageIndex + 1,
    stageTurn: gameState.stageTurn
  });
  gameState.priceHistory = gameState.priceHistory.slice(-48);
}

function updateStockHeat(stock, percent, source) {
  if (source.includes("過熱反動")) return;

  if (percent > 0) {
    const addedHeat = Math.max(1, Math.ceil(percent * 10));
    stock.heat = Math.min(9, stock.heat + addedHeat);
    return;
  }

  if (percent < 0) {
    const cooledHeat = Math.max(1, Math.ceil(Math.abs(percent) * 8));
    stock.heat = Math.max(0, stock.heat - cooledHeat);
  }
}

function getMarginMultiplier(percent) {
  if (hasPassive("gambler")) return 2.5;
  if (gameState.stageIndex === 3 && percent < 0) return 3;
  return 2;
}

function adjustUpside(changes, source) {
  const hasUpside = Object.values(changes).some((percent) => percent > 0);
  if (!hasUpside || gameState.effects.upsideBoostCharges <= 0) return changes;

  gameState.effects.upsideBoostCharges -= 1;
  addLog(`ジョーカー倍率が発動。${source} の上昇率を1.5倍にしました。`);
  return Object.fromEntries(
    Object.entries(changes).map(([symbol, percent]) => [symbol, percent > 0 ? percent * 1.5 : percent])
  );
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
    changes = Object.fromEntries(
      Object.entries(changes).map(([symbol, percent]) => [symbol, percent < 0 ? percent / 2 : percent])
    );
  }

  if (hasPassive("diversifiedInvestor") && getCashRatio() >= 0.30) {
    addLog(`資金管理家: 現金比率30%以上により、${source} の下落影響を20%軽減。`);
    changes = Object.fromEntries(
      Object.entries(changes).map(([symbol, percent]) => [symbol, percent < 0 ? percent * 0.8 : percent])
    );
  }

  if (hasPassive("riskManagement") && !gameState.stageRiskUsed) {
    const downsideEntries = Object.entries(changes).filter(([, percent]) => percent < 0);
    if (downsideEntries.length > 0) {
      downsideEntries.sort((a, b) => a[1] - b[1]);
      const [worstSymbol] = downsideEntries[0];
      gameState.stageRiskUsed = true;
      addLog(`リスク管理: ${findStock(worstSymbol).name} の最大損失を半分にしました。`);
      changes = { ...changes, [worstSymbol]: changes[worstSymbol] / 2 };
    }
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
    addLog("信用取引のリスク判定は発生しましたが、保有ポジションがありませんでした。");
    return;
  }

  addLog("信用取引の追証リスク発生。保有ポジションに追加ショック -15%。");
  applyPriceChanges(shock, "信用取引リスク");
}

function selectMarketEvent() {
  if (gameState.effects.marketChoiceCharges <= 0) return randomItem(MARKET_EVENTS);

  gameState.effects.marketChoiceCharges -= 1;
  const first = randomItem(MARKET_EVENTS);
  let second = randomItem(MARKET_EVENTS);
  while (second.name === first.name && MARKET_EVENTS.length > 1) {
    second = randomItem(MARKET_EVENTS);
  }

  const firstScore = estimateEventImpact(first);
  const secondScore = estimateEventImpact(second);
  const selected = firstScore >= secondScore ? first : second;
  const skipped = selected === first ? second : first;
  addLog(`分岐ルート選択: 「${first.name}」と「${second.name}」から「${selected.name}」を選択。回避: ${skipped.name}`);
  return selected;
}

function estimateEventImpact(event) {
  return Object.entries(event.changes).reduce((score, [symbol, percent]) => {
    const stock = findStock(symbol);
    const holdingImpact = stock.shares > 0 ? stock.price * stock.shares * percent : stock.price * percent * 0.02;
    return score + holdingImpact;
  }, 0);
}

const RELIC_DEFINITIONS = [
  {
    id: "compoundSeed",
    name: "複利の種",
    description: "ターン終了時、ポジション評価額の1%を配当として現金に得る。"
  },
  {
    id: "tradingTerminal",
    name: "証券端末",
    description: "毎ターンのドロー枚数が1枚増える。"
  },
  {
    id: "riskMeter",
    name: "リスク計量器",
    description: "各ターン開始時、下落イベント半減を1回得る。"
  }
];

function gainRandomRelic() {
  const candidates = RELIC_DEFINITIONS.filter((relic) => !gameState.relics.includes(relic.id));
  if (candidates.length === 0) {
    gameState.cash += 100000;
    addLog(`全レリック取得済み。代わりに${formatYen(100000)}を得ました。`);
    return;
  }

  const relic = randomItem(candidates);
  gameState.relics.push(relic.id);
  addLog(`レリック獲得: <strong>${relic.name}</strong> - ${relic.description}`);
}

function hasRelic(relicId) {
  return gameState.relics.includes(relicId);
}

function hasPassive(passiveId) {
  return gameState.passives.includes(passiveId);
}

function getCurrentStage() {
  return STAGES[gameState.stageIndex] || STAGES[0];
}

function countHeldStocks() {
  return gameState.stocks.filter((stock) => stock.shares > 0).length;
}

function getLargestHoldingSymbol() {
  const holdings = gameState.stocks.filter((stock) => stock.shares > 0);
  if (holdings.length === 0) return null;
  holdings.sort((a, b) => (b.shares * b.price) - (a.shares * a.price));
  return holdings[0].symbol;
}

function getLargestHoldingExposure() {
  const total = calculateTotalAssets();
  if (total <= 0) return 0;
  return gameState.stocks.reduce((max, stock) => Math.max(max, (stock.price * stock.shares) / total), 0);
}

function updateHoldingTurns() {
  gameState.stocks.forEach((stock) => {
    if (stock.shares > 0) {
      stock.holdingTurns += 1;
    } else {
      stock.holdingTurns = 0;
    }
  });
}

function resolvePassiveEndOfTurnEffects() {
  if (!hasPassive("longTerm")) return;

  const changes = {};
  gameState.stocks.forEach((stock) => {
    if (stock.shares > 0 && stock.holdingTurns >= 2) {
      changes[stock.symbol] = 0.03;
    }
  });
  if (Object.keys(changes).length === 0) return;
  addLog("長期投資家: 2ターン以上保有しているポジションに評価見直し。");
  applyPriceChanges(changes, "長期投資家");
}

function resolveEndOfTurnRelics() {
  if (!hasRelic("compoundSeed")) return;

  const dividend = Math.floor(calculateStockValue() * 0.01);
  if (dividend <= 0) return;
  gameState.cash += dividend;
  addLog(`レリック「複利の種」: 配当 ${formatYen(dividend)} を獲得。`);
}

function removeWeakCardFromDeck() {
  const piles = [gameState.drawPile, gameState.discardPile];
  for (const pile of piles) {
    const index = pile.findIndex((cardInstance) => CARD_DEFINITIONS[cardInstance.cardId].rarity === "Common");
    if (index === -1) continue;
    const [removed] = pile.splice(index, 1);
    removeCardInstanceFromDeck(removed.instanceId);
    addLog(`デッキ圧縮: <strong>${CARD_DEFINITIONS[removed.cardId].name}</strong> を除外しました。`);
    return;
  }

  gameState.nextDrawBonus += 1;
  addLog("デッキ圧縮: 除外対象がないため、次ターンのドローを1枚増やしました。");
}

function removeCardInstanceFromDeck(instanceId) {
  gameState.deck = gameState.deck.filter((cardInstance) => cardInstance.instanceId !== instanceId);
  gameState.drawPile = gameState.drawPile.filter((cardInstance) => cardInstance.instanceId !== instanceId);
  gameState.discardPile = gameState.discardPile.filter((cardInstance) => cardInstance.instanceId !== instanceId);
}

function showRewards() {
  const rewards = drawRewardChoices();
  const passiveChoices = drawPassiveChoices();
  const cashBonus = getCurrentStage().cashBonus;
  gameState.pendingReward = { rewards, passiveChoices, cashBonus };
  gameState.selectedRewardCard = null;
  gameState.selectedRewardPassive = null;
  elements.rewardTitle.textContent = `Stage ${gameState.stageIndex + 1} Clear Reward`;
  elements.rewardCashText.textContent = `現金ボーナス: ${formatYen(cashBonus)}`;
  elements.rewardCards.innerHTML = "";
  rewards.forEach((cardId) => {
    const cardElement = createCardElement(CARD_DEFINITIONS[cardId], {
      reward: true,
      onClick: () => selectRewardCard(cardId)
    });
    cardElement.dataset.cardId = cardId;
    elements.rewardCards.appendChild(cardElement);
  });

  elements.passiveRewards.innerHTML = "";
  passiveChoices.forEach((passiveId) => {
    const passive = PASSIVE_DEFINITIONS[passiveId];
    const button = document.createElement("button");
    button.className = "passive-option";
    button.dataset.passiveId = passiveId;
    button.innerHTML = `<strong>${passive.name}</strong><span>${passive.description}</span>`;
    button.addEventListener("click", () => selectRewardPassive(passiveId));
    elements.passiveRewards.appendChild(button);
  });
  updateRewardConfirmState();
  elements.rewardModal.classList.remove("hidden");
}

function drawRewardChoices() {
  const choices = new Set();
  while (choices.size < 3) {
    const roll = Math.random();
    const epicRate = 0.08 + gameState.stageIndex * 0.035;
    const rareRate = 0.24 + gameState.stageIndex * 0.04;
    const rarity = roll < 1 - rareRate - epicRate ? "Common" : roll < 1 - epicRate ? "Rare" : "Epic";
    const candidates = REWARD_POOL.filter((cardId) => CARD_DEFINITIONS[cardId].rarity === rarity);
    choices.add(randomItem(candidates));
  }
  return [...choices];
}

function drawPassiveChoices() {
  const available = Object.keys(PASSIVE_DEFINITIONS).filter((passiveId) => !hasPassive(passiveId));
  return shuffle(available).slice(0, 3);
}

function selectRewardCard(cardId) {
  gameState.selectedRewardCard = cardId;
  [...elements.rewardCards.children].forEach((cardElement) => {
    cardElement.classList.toggle("selected", cardElement.dataset.cardId === cardId);
  });
  updateRewardConfirmState();
}

function selectRewardPassive(passiveId) {
  gameState.selectedRewardPassive = passiveId;
  [...elements.passiveRewards.children].forEach((button) => {
    button.classList.toggle("selected", button.dataset.passiveId === passiveId);
  });
  updateRewardConfirmState();
}

function updateRewardConfirmState() {
  elements.confirmRewardButton.disabled = !gameState.selectedRewardCard || !gameState.selectedRewardPassive;
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
    return gameState.stocks.filter((stock) => stock.shares > 0 && stock.price < stock.previousPrice);
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
  showResult("Game Clear", "全5ステージ制覇", `ブラックマンデーを突破しました。最終資産は ${formatYen(total)}。初期資産比 ${multiple.toFixed(2)} 倍、投資ランク ${rank} です。`);
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
    stage: gameState.stageIndex + 1,
    stageTurn: gameState.stageTurn,
    message
  });
  gameState.logs = gameState.logs.slice(0, 80);
}

function executeManualTrade(type) {
  if (!gameState.started || gameState.gameOver) return;

  const symbol = elements.tradeStockSelect.value;
  const shares = Math.floor(Number(elements.tradeSharesInput.value));
  if (!symbol || !Number.isFinite(shares) || shares <= 0) {
    addLog("売買口数は1以上の整数で入力してください。");
    render();
    return;
  }

  const succeeded = type === "buy"
    ? buyShares(symbol, shares, "手動買付")
    : sellShares(symbol, shares, "手動売却");
  if (succeeded) {
    elements.tradeSharesInput.value = "";
  }
  checkGameEnd();
  render();
}

function fillMaxShares(type) {
  const stock = findStock(elements.tradeStockSelect.value);
  if (!stock) return;

  const maxShares = type === "buy" ? calculateMaxBuyShares(stock.price) : stock.shares;
  elements.tradeSharesInput.value = Math.max(0, maxShares);
  renderTradePanel();
}

function render() {
  renderStatus();
  renderStageInfo();
  renderMarketScreen();
  renderTradePanel();
  renderHand();
  renderDeckView();
  renderLogs();
  renderEffects();
  elements.startButton.disabled = gameState.started && !gameState.gameOver;
  elements.endTurnButton.disabled = !gameState.started || gameState.gameOver || gameState.waitingForReward;
}

function renderStatus() {
  const stockValue = calculateStockValue();
  const totalAssets = calculateTotalAssets();
  const stageProfit = gameState.started ? totalAssets - gameState.stageStartAssets : 0;
  elements.turnText.textContent = gameState.started ? `${gameState.turn} / ${MAX_TURNS}` : "-";
  elements.stageText.textContent = gameState.started ? `${gameState.stageIndex + 1} / ${MAX_STAGES}` : "-";
  elements.stageTurnText.textContent = gameState.started ? `${gameState.stageTurn} / ${STAGE_TURNS}` : "-";
  elements.cashText.textContent = formatYen(gameState.cash);
  elements.stockValueText.textContent = formatYen(stockValue);
  elements.totalAssetText.textContent = formatYen(totalAssets);
  elements.stockValueText.className = stockValue > 0 ? "positive" : "neutral";
  elements.totalAssetText.className = gameState.started ? changeClass(stageProfit) : "neutral";
  elements.playedCountText.textContent = `使用済み ${gameState.playedThisTurn} / ${MAX_CARDS_PER_TURN}`;
}

function renderStageInfo() {
  const stage = getCurrentStage();
  const profit = calculateTotalAssets() - gameState.stageStartAssets;
  const hpRatio = gameState.bossMaxHp > 0 ? Math.max(0, gameState.bossHp / gameState.bossMaxHp) : 0;

  elements.stageNameText.textContent = gameState.started ? `${stage.name} / ${stage.theme}` : "-";
  elements.bossNameText.textContent = gameState.started ? stage.bossName : "-";
  elements.bossHpText.textContent = gameState.started ? `${formatYen(gameState.bossHp)} / ${formatYen(gameState.bossMaxHp)}` : "-";
  elements.bossHpFill.style.width = `${hpRatio * 100}%`;
  elements.stageStartText.textContent = gameState.started ? formatYen(gameState.stageStartAssets) : "-";
  elements.stageProfitText.textContent = gameState.started ? formatYen(profit) : "-";
  elements.stageProfitText.className = profit >= 0 ? "positive" : "negative";
  elements.lastDamageText.textContent = gameState.started ? formatYen(gameState.lastDamage) : "-";
  elements.lastDamageText.className = gameState.lastDamage > 0 ? "positive damage-text" : "neutral";
  elements.comboText.textContent = gameState.started ? `${gameState.damageCombo} HIT ×${getDamageComboMultiplier().toFixed(2)}` : "-";
  elements.comboText.className = gameState.damageCombo >= 2 ? "combo-hot" : "neutral";
  elements.bossOmenText.textContent = gameState.currentOmen || "-";
  elements.passiveList.innerHTML = renderPassiveList();
}

function renderPassiveList() {
  const passiveNames = gameState.passives.map((passiveId) => PASSIVE_DEFINITIONS[passiveId].name);
  const relicNames = gameState.relics
    .map((relicId) => RELIC_DEFINITIONS.find((relic) => relic.id === relicId))
    .filter(Boolean)
    .map((relic) => relic.name);
  const names = [...passiveNames, ...relicNames];
  if (names.length === 0) return `<span class="empty-inline">なし</span>`;
  return names.map((name) => `<span class="passive-chip">${name}</span>`).join("");
}

function renderMarketScreen() {
  const stock = gameState.stocks[0];
  if (!stock) {
    elements.marketPriceText.textContent = "-";
    elements.marketChangeText.textContent = "-";
    elements.marketHeatText.textContent = "-";
    elements.priceChart.innerHTML = `<div class="empty-state">ゲーム開始後、価格チャートが表示されます。</div>`;
    elements.positionSharesText.textContent = "-";
    elements.positionValueText.textContent = "-";
    elements.averageCostText.textContent = "-";
    elements.unrealizedProfitText.textContent = "-";
    return;
  }

  const change = stock.previousPrice === 0 ? 0 : (stock.price - stock.previousPrice) / stock.previousPrice;
  const positionValue = stock.price * stock.shares;
  const unrealizedProfit = stock.shares > 0 ? positionValue - stock.averageCost * stock.shares : 0;

  elements.marketPriceText.textContent = formatYen(stock.price);
  elements.marketPriceText.className = changeClass(change);
  elements.marketChangeText.textContent = `${change >= 0 ? "+" : ""}${formatPercent(change)}`;
  elements.marketChangeText.className = changeClass(change);
  elements.marketHeatText.innerHTML = renderHeat(stock.heat);
  elements.positionSharesText.textContent = `${stock.shares.toLocaleString("ja-JP")}口`;
  elements.positionValueText.textContent = formatYen(positionValue);
  elements.positionValueText.className = positionValue > 0 ? "positive" : "neutral";
  elements.averageCostText.textContent = formatYen(stock.averageCost || 0);
  elements.unrealizedProfitText.textContent = `${unrealizedProfit >= 0 ? "+" : ""}${formatYen(unrealizedProfit)}`;
  elements.unrealizedProfitText.className = changeClass(unrealizedProfit);
  elements.priceChart.innerHTML = renderPriceChart();
}

function renderPriceChart() {
  const history = gameState.priceHistory.length > 0 ? gameState.priceHistory : [{ price: STOCK_TEMPLATES[0].price }];
  const prices = history.map((point) => point.price);
  const width = 640;
  const height = 260;
  const padding = 24;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = Math.max(1, maxPrice - minPrice);
  const points = prices.map((price, index) => {
    const x = prices.length === 1 ? padding : padding + (index / (prices.length - 1)) * (width - padding * 2);
    const y = height - padding - ((price - minPrice) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = prices[prices.length - 1];
  const first = prices[0];
  const chartClass = last >= first ? "chart-line positive-line" : "chart-line negative-line";
  const lastPoint = points[points.length - 1].split(",");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="価格チャート">
      <defs>
        <pattern id="chartGrid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(159,176,173,0.18)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#chartGrid)"></rect>
      <polyline class="${chartClass}" points="${points.join(" ")}"></polyline>
      <circle class="chart-last-point" cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="6"></circle>
      <text x="${padding}" y="24" class="chart-label">${formatYen(maxPrice)}</text>
      <text x="${padding}" y="${height - 8}" class="chart-label">${formatYen(minPrice)}</text>
    </svg>
  `;
}

function renderHeat(heat) {
  const level = Math.min(9, Math.max(0, heat || 0));
  const className = level >= 6 ? "heat high" : level >= 3 ? "heat mid" : "heat";
  const pips = level > 0 ? "■".repeat(Math.ceil(level / 2)) : "□";
  return `<span class="${className}" title="過熱度: 高いほど反動売りが起きやすい">${pips} ${level}</span>`;
}

function renderTradePanel() {
  const selectedSymbol = elements.tradeStockSelect.value || (gameState.stocks[0] && gameState.stocks[0].symbol);
  elements.tradeStockSelect.innerHTML = "";

  gameState.stocks.forEach((stock) => {
    const option = document.createElement("option");
    option.value = stock.symbol;
    option.textContent = `${stock.name} / ${formatYen(stock.price)} / 保有 ${stock.shares}口`;
    elements.tradeStockSelect.appendChild(option);
  });

  if (selectedSymbol) elements.tradeStockSelect.value = selectedSymbol;
  const stock = findStock(elements.tradeStockSelect.value);
  const disabled = !gameState.started || gameState.gameOver || !stock;
  const maxBuy = stock ? calculateMaxBuyShares(stock.price) : 0;
  const maxSell = stock ? stock.shares : 0;

  elements.buySharesButton.disabled = disabled || maxBuy <= 0;
  elements.sellSharesButton.disabled = disabled || maxSell <= 0;
  elements.maxBuyButton.disabled = disabled || maxBuy <= 0;
  elements.maxSellButton.disabled = disabled || maxSell <= 0;
  elements.tradeSharesInput.disabled = disabled;
  elements.tradeStockSelect.disabled = disabled;

  if (!stock) {
    elements.tradeHint.textContent = "ゲーム開始後、口数を指定していつでも売買できます。";
    return;
  }

  elements.tradeHint.textContent = `買付可能 ${maxBuy.toLocaleString("ja-JP")}口 / 売却可能 ${maxSell.toLocaleString("ja-JP")}口 / 平均取得 ${formatYen(stock.averageCost || 0)}`;
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

function renderDeckView() {
  if (!elements.deckList || !elements.deckSummary) return;
  if (!gameState.started) {
    elements.deckSummary.textContent = "Deck -";
    elements.deckList.innerHTML = `<span class="deck-empty">ゲーム開始後にデッキ内容を表示</span>`;
    return;
  }

  const counts = gameState.deck.reduce((map, cardInstance) => {
    map.set(cardInstance.cardId, (map.get(cardInstance.cardId) || 0) + 1);
    return map;
  }, new Map());
  const orderedCards = [...counts.entries()]
    .map(([cardId, count]) => ({ card: CARD_DEFINITIONS[cardId], count }))
    .sort((a, b) => rarityRank(b.card.rarity) - rarityRank(a.card.rarity) || a.card.name.localeCompare(b.card.name, "ja"));

  elements.deckSummary.textContent = `Deck ${gameState.deck.length} / 山札 ${gameState.drawPile.length} / 捨札 ${gameState.discardPile.length}`;
  elements.deckList.innerHTML = orderedCards
    .map(({ card, count }) => `<span class="deck-pill ${card.rarity.toLowerCase()}">${card.name}<b>x${count}</b></span>`)
    .join("");
}

function rarityRank(rarity) {
  if (rarity === "Epic") return 3;
  if (rarity === "Rare") return 2;
  return 1;
}

function createCardElement(card, options) {
  const element = document.createElement("article");
  element.className = `card ${card.rarity.toLowerCase()} ${getCardFrameClass(card)}`;

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
  if (isTargetCard && targets.length > 1) {
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
  button.textContent = options.reward ? "カードを選択" : "使用";
  button.disabled = disabled;
  button.addEventListener("click", () => {
    if (options.reward) {
      options.onClick();
      return;
    }
    const target = select ? select.value : targets[0] ? targets[0].symbol : null;
    options.onClick(options.instanceId, target);
  });
  element.appendChild(button);

  if (disabled) element.classList.add("disabled");
  return element;
}

function getCardFrameClass(card) {
  if (card.category === "ニュース") return "card-frame-news";
  if (card.category === "防御") return "card-frame-defense";
  return "card-frame-action";
}

function renderLogs() {
  elements.logList.innerHTML = "";
  gameState.logs.forEach((log) => {
    const item = document.createElement("div");
    item.className = `log-item ${getLogToneClass(log.message)}`;
    item.innerHTML = `<strong>S${log.stage}-${log.stageTurn}</strong> ${log.message}`;
    elements.logList.appendChild(item);
  });
}

function getLogToneClass(message) {
  if (/(\+|上昇|利益|ボーナス|獲得|改善|DAMAGE|撃破|反発)/.test(message)) return "log-positive";
  if (/(-|下落|損|暴落|炎上|悪化|リスク|NO DAMAGE|失敗)/.test(message)) return "log-negative";
  return "";
}

function renderEffects() {
  const relicNames = gameState.relics
    .map((relicId) => RELIC_DEFINITIONS.find((relic) => relic.id === relicId))
    .filter(Boolean)
    .map((relic) => relic.name)
    .join(" / ");
  const positionRate = Math.round(getLargestHoldingExposure() * 100);
  const badges = [
    { label: "信用取引", active: gameState.effects.margin },
    { label: `分散 ${gameState.effects.diversifyCharges}`, active: gameState.effects.diversifyCharges > 0 },
    { label: `暴落耐性 ${gameState.effects.crashGuards}`, active: gameState.effects.crashGuards > 0 },
    { label: `倍率 ${gameState.effects.upsideBoostCharges}`, active: gameState.effects.upsideBoostCharges > 0 },
    { label: `分岐 ${gameState.effects.marketChoiceCharges}`, active: gameState.effects.marketChoiceCharges > 0 },
    { label: `ポジション ${positionRate}%`, active: positionRate > 70 },
    { label: `パッシブ ${gameState.passives.length}`, active: gameState.passives.length > 0 },
    { label: `レリック ${gameState.relics.length}${relicNames ? `: ${relicNames}` : ""}`, active: gameState.relics.length > 0 },
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

function triggerImpact(text, type) {
  if (!elements.impactLayer) return;
  elements.impactLayer.textContent = text;
  elements.impactLayer.className = `impact-layer impact-${type}`;
  if (typeof window !== "undefined") {
    window.clearTimeout(triggerImpact.timer);
    triggerImpact.timer = window.setTimeout(() => {
      elements.impactLayer.classList.add("hidden");
    }, 920);
  }
}

function triggerDelayedImpact(text, type) {
  if (typeof window === "undefined") return;
  window.clearTimeout(triggerDelayedImpact.timer);
  triggerDelayedImpact.timer = window.setTimeout(() => triggerImpact(text, type), 980);
}

function pulseElement(element, className) {
  if (!element || !element.classList || typeof window === "undefined") return;
  element.classList.remove(className);
  window.requestAnimationFrame(() => {
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), 520);
  });
}

elements.startButton.addEventListener("click", resetGame);
elements.restartButton.addEventListener("click", resetGame);
elements.resultRestartButton.addEventListener("click", resetGame);
elements.endTurnButton.addEventListener("click", endTurn);
elements.confirmRewardButton.addEventListener("click", confirmStageReward);
elements.buySharesButton.addEventListener("click", () => executeManualTrade("buy"));
elements.sellSharesButton.addEventListener("click", () => executeManualTrade("sell"));
elements.maxBuyButton.addEventListener("click", () => fillMaxShares("buy"));
elements.maxSellButton.addEventListener("click", () => fillMaxShares("sell"));
elements.tradeStockSelect.addEventListener("change", renderTradePanel);
elements.tradeSharesInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") executeManualTrade("buy");
});

render();
