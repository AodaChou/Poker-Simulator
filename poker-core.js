/* =========================================
   poker-core.js - 核心數據管理與邏輯控制
   ========================================= */

const suits = ['♠', '♥', '♦', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const valueMap = {};
values.forEach((v, i) => valueMap[v] = i + 2);

const suitColors = { '♥': 'red', '♦': 'red', '♠': 'black', '♣': 'black' };

let gameState = {
    selectedCards: {},       // 存儲已選的牌，格式：{ p1c1: "A♠", b0: "10♥" }
    currentPickingTarget: null,
    activePlayers: { 1: true }, // 預設 P1 參加
    dealerPos: 1,            // 莊家位置
    foldedPlayers: {}        // 棄牌狀態
};

document.addEventListener('DOMContentLoaded', () => {
    initTable();
    updatePositions();
});

/**
 * [功能] 初始化或重新渲染玩家座位區域
 */
function initTable() {
    const placeholder = document.getElementById('seats-placeholder');
    if (!placeholder) return;
    placeholder.innerHTML = ''; 

    for (let i = 1; i <= 9; i++) {
        const seat = document.createElement('div');
        const isActive = gameState.activePlayers[i];
        const isFolded = gameState.foldedPlayers[i];

        seat.className = `seat s${i} ${isActive ? 'active' : ''}`;
        seat.id = `seat-p${i}`;

        let labelText = (i === 1) ? "你 (Hero)" : `P${i}`;
        const isGameStarted = Object.keys(gameState.selectedCards).length > 0;
        const foldBtnStyle = (isActive && isGameStarted) ? "display:inline-block;" : "display:none;";

        seat.innerHTML = `
            <div class="player-tag" onclick="togglePlayer(${i})">${labelText}</div>
            <div class="status-label">${isActive ? (isFolded ? 'FOLDED' : 'ACTIVE') : 'OFF'}</div>
            <div class="cards-row ${isFolded ? 'folded-area' : ''}">
                <div class="card ${!gameState.selectedCards[`p${i}c1`] ? 'empty' : ''}" id="p${i}c1" onclick="openSelector('p${i}c1')">?</div>
                <div class="card ${!gameState.selectedCards[`p${i}c2`] ? 'empty' : ''}" id="p${i}c2" onclick="openSelector('p${i}c2')">?</div>
            </div>
            <div class="win-rate" id="win-p${i}">--%</div>
            <div class="pos-tag" id="pos-p${i}"></div>
            <button class="btn-fold" style="${foldBtnStyle}" onclick="toggleFold(${i})">${isFolded ? 'Undo' : 'Fold'}</button>
        `;
        placeholder.appendChild(seat);

        // 初始化後如果已有選牌，需刷一次 UI 顏色
        updateCardUI(`p${i}c1`);
        updateCardUI(`p${i}c2`);
    }
}

/**
 * [功能] 當在選牌器點擊一張牌時觸發
 */
function selectCard(cardStr) {
    const targetId = gameState.currentPickingTarget;
    if (!targetId) return;

    // 1. 檢查牌是否已被他人選走
    const isUsed = Object.entries(gameState.selectedCards).some(([id, val]) => id !== targetId && val === cardStr);
    if (isUsed) {
        alert("這張牌已經在桌面上囉！");
        return;
    }

    // 2. 更新數據
    gameState.selectedCards[targetId] = cardStr;

    // 3. 更新視覺
    updateCardUI(targetId);

    // 4. 自動跳轉下一個位置
    autoNextTarget(targetId);

    // 5. 刷新選牌器（標記已選牌）
    renderSelector();
}

/**
 * [功能] 更新卡片 UI 視覺狀態
 */
function updateCardUI(targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;

    const cardStr = gameState.selectedCards[targetId];
    if (cardStr) {
        const suit = cardStr.slice(-1);
        el.innerText = cardStr;
        el.className = `card ${suitColors[suit] === 'red' ? 'red' : 'black'}`;
        el.style.background = "white";
    } else {
        el.innerText = "?";
        el.className = "card empty";
        el.style.background = "";
    }
}

/**
 * [功能] 重置桌面、自動輪替莊家、更新所有標籤
 */
function resetTable() {
    if (!confirm("確定要結算本局並開始下一局嗎？\n(卡片將清空，莊家自動順時針移動)")) return;

    // 1. 清空數據
    gameState.selectedCards = {};
    gameState.foldedPlayers = {};

    // 2. 移動莊家位置
    rotateDealer();

    // 3. 視覺重置
    initTable(); // 重刷座位與手牌

    // 4. 重置公牌區視覺
    for (let i = 0; i < 5; i++) {
        updateCardUI(`b${i}`);
    }

    // 5. 清除勝率特效 (若 poker-ui.js 有定義)
    if (window.removeWinnerEffects) removeWinnerEffects();

    document.getElementById('status-text').innerText = `新局開始，莊家位：P${gameState.dealerPos}`;
}

/**
 * [功能] 順時針尋找下一個活躍玩家擔任莊家
 */
function rotateDealer() {
    const nextDealer = getNextActivePlayer(gameState.dealerPos);
    if (nextDealer !== null) {
        gameState.dealerPos = nextDealer;
        updatePositions(); // 更新標籤位置
    }
}

/**
 * [輔助] 尋找下一位活躍玩家 ID
 */
function getNextActivePlayer(currentId) {
    let next = currentId + 1;
    if (next > 9) next = 1;

    let count = 0;
    while (!gameState.activePlayers[next] && count < 9) {
        next++;
        if (next > 9) next = 1;
        count++;
    }
    return gameState.activePlayers[next] ? next : currentId;
}

/**
 * [功能] 更新 D, SB, BB, UTG 標籤
 */
function updatePositions() {
    // 隱藏所有標籤
    document.querySelectorAll('.pos-tag').forEach(el => {
        el.innerText = '';
        el.style.display = 'none';
    });

    const d = gameState.dealerPos;
    const sb = getNextActivePlayer(d);
    const bb = getNextActivePlayer(sb);
    const utg = getNextActivePlayer(bb);

    const posMap = { [d]: 'D', [sb]: 'SB', [bb]: 'BB', [utg]: 'UTG' };

    Object.entries(posMap).forEach(([id, label]) => {
        const el = document.getElementById(`pos-p${id}`);
        if (el && gameState.activePlayers[id]) {
            el.innerText = label;
            el.style.display = 'block';
            // 給莊家位一點特殊顏色
            el.style.background = (label === 'D') ? 'var(--gold)' : '#444';
        }
    });
}

/**
 * [功能] 切換玩家參加/休息狀態
 */
function togglePlayer(id) {
    if (id === 1) return; // Hero 不可關閉
    if (gameState.activePlayers[id]) {
        delete gameState.activePlayers[id];
        // 如果莊家剛好被關掉，移動莊家
        if (gameState.dealerPos === id) gameState.dealerPos = 1;
    } else {
        gameState.activePlayers[id] = true;
    }
    initTable();
    updatePositions();
}

/**
 * [功能] 開啟選牌器
 */
function openSelector(targetId) {
    gameState.currentPickingTarget = targetId;
    renderSelector();
    document.getElementById('selector-overlay').style.display = 'flex';
    
    // 高亮目前的目標牌
    document.querySelectorAll('.card').forEach(c => c.classList.remove('highlight-active'));
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.add('highlight-active');
}

/**
 * [功能] 繪製選牌器網格
 */
function renderSelector() {
    const grid = document.getElementById('card-grid');
    grid.innerHTML = '';
    
    suits.forEach(s => {
        values.forEach(v => {
            const cardStr = v + s;
            const btn = document.createElement('div');
            btn.className = `selector-card ${suitColors[s]}`;
            btn.innerText = cardStr;
            
            // 檢查是否已被選用
            const isUsed = Object.values(gameState.selectedCards).includes(cardStr);
            if (isUsed) btn.classList.add('used');
            
            btn.onclick = () => selectCard(cardStr);
            grid.appendChild(btn);
        });
    });
}

/**
 * [功能] 自動導航到下一張牌
 */
function autoNextTarget(currentId) {
    let nextId = null;

    // 如果是公牌，依序移動 b0 -> b1 -> ... -> b4
    if (currentId.startsWith('b')) {
        const index = parseInt(currentId[1]);
        if (index < 4) nextId = `b${index + 1}`;
    } 
    // 如果是玩家手牌，移動 c1 -> c2
    else if (currentId.includes('c1')) {
        nextId = currentId.replace('c1', 'c2');
    }

    if (nextId) {
        gameState.currentPickingTarget = nextId;
        document.querySelectorAll('.card').forEach(c => c.classList.remove('highlight-active'));
        const nextEl = document.getElementById(nextId);
        if (nextEl) nextEl.classList.add('highlight-active');
    } else {
        // 沒下一張了就關閉
        closeSelector();
    }
}

function closeSelector() {
    document.getElementById('selector-overlay').style.display = 'none';
    document.querySelectorAll('.card').forEach(c => c.classList.remove('highlight-active'));
    gameState.currentPickingTarget = null;
}

function toggleFold(id) {
    if (!gameState.foldedPlayers) gameState.foldedPlayers = {};
    gameState.foldedPlayers[id] = !gameState.foldedPlayers[id];
    initTable();
}