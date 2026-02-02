/* =========================================
   1. 基礎設定與初始化
   ========================================= */
const suits = ['♠', '♥', '♦', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const valueMap = {};
values.forEach((v, i) => valueMap[v] = i + 2);

const suitColors = { '♥': 'red', '♦': 'red', '♠': 'black', '♣': 'black' };

let gameState = {
    selectedCards: {},
    activeGroup: null,
    currentPickingTarget: null,
    activePlayers: { 1: true }, // 預設只有 P1
    dealerPos: 1                // 預設莊家在 P1
};

document.addEventListener('DOMContentLoaded', () => {
    initTable();
    updatePositions(); // 初始化位置
});

function initTable() {
    const placeholder = document.getElementById('seats-placeholder');
    placeholder.innerHTML = '';

    for (let i = 1; i <= 9; i++) {
        const seat = document.createElement('div');
        const isActive = gameState.activePlayers[i];

        seat.className = `seat s${i} ${isActive ? 'active' : ''}`;
        seat.id = `seat-p${i}`;

        let labelText = (i === 1) ? "你 (Hero)" : `P${i}`;
        const statusText = isActive ? "(參加)" : "(休息)";

        seat.setAttribute('onclick', `openGroupSelector('p${i}')`);

        seat.innerHTML = `
            <div class="seat-label" onclick="event.stopPropagation(); togglePlayer(${i})">
                ${labelText} <span id="status-p${i}" style="font-size:10px">${statusText}</span>
            </div>
            
            <div id="badge-p${i}" class="badge-container" style="min-height:20px; margin-bottom:4px;"></div>
            
            <div style="display:flex; gap:4px; justify-content:center; pointer-events:none;">
                <div class="card empty" id="p${i}c1">?</div>
                <div class="card empty" id="p${i}c2">?</div>
            </div>
            
            <div class="win-rate" id="win-p${i}">--%</div>
        `;
        placeholder.appendChild(seat);
    }
}

/* =========================================
   2. 位置與輪替邏輯 (新增部分)
   ========================================= */

// 尋找下一個「有參加」的玩家 ID
function getNextActivePlayer(currentId) {
    let next = currentId + 1;
    if (next > 9) next = 1;

    // 循環查找，最多找 9 次防止無窮迴圈
    let count = 0;
    while (!gameState.activePlayers[next] && count < 9) {
        next++;
        if (next > 9) next = 1;
        count++;
    }

    // 如果找不到其他人 (例如只有一人在場)，回傳自己或 null
    return gameState.activePlayers[next] ? next : null;
}

/**
 * [功能] 順時針輪替莊家位置 (D Button)
 * [邏輯] 尋找下一位 activePlayers 為 true 的玩家
 */
function rotateDealer() {
    const activeIds = Object.keys(gameState.activePlayers).map(Number).sort((a, b) => a - b);
    if (activeIds.length < 2) {
        alert("至少需要兩位玩家才能輪替莊家！");
        return;
    }

    // 呼叫輔助函式尋找下一位活躍玩家
    let nextDealer = getNextActivePlayer(gameState.dealerPos);
    if (nextDealer) {
        gameState.dealerPos = nextDealer;
        updatePositions(); // 更新視覺上的 D 標籤與盲注文字
    }
}

/**
 * [功能] 更新所有玩家的位置標籤 (D, SB, BB, UTG)
 * [觸發時機] 1. 初始化 2. 點擊換莊按鈕 3. 玩家加入或離開 (togglePlayer)
 */
function updatePositions() {
    // 1. 取得所有參加玩家
    const activeIds = Object.keys(gameState.activePlayers).map(Number).sort((a, b) => a - b);
    const infoSpan = document.getElementById('pos-info');

    // 隱藏舊的懸浮 D 鈕 (如果 HTML 還留著的話)
    const oldDBtn = document.getElementById('dealer-btn');
    if (oldDBtn) oldDBtn.style.display = 'none';

    // 2. 清除所有座位旁的舊標籤容器內容
    for (let i = 1; i <= 9; i++) {
        const badgeContainer = document.getElementById(`badge-p${i}`);
        if (badgeContainer) badgeContainer.innerHTML = '';
    }

    // 3. 檢查人數
    if (activeIds.length < 2) {
        if (infoSpan) infoSpan.innerText = "等待玩家加入....";
        return;
    }

    // 4. 確認目前莊家玩家
    if (!gameState.activePlayers[gameState.dealerPos]) {
        gameState.dealerPos = activeIds[0];
    }
    const dealer = gameState.dealerPos;

    // --- 關鍵修改：將莊家 D 直接標示在玩家旁邊 ---
    addBadge(dealer, 'D', 'pos-d');

    // 5. 根據人數分配 SB, BB, UTG
    let sb, bb, utg;

    if (activeIds.length === 2) {
        /** 單挑模式 (Heads-up) **/
        // 莊家是 SB，對手是 BB
        sb = dealer;
        bb = getNextActivePlayer(dealer);

        addBadge(sb, 'SB', 'pos-sb');
        addBadge(bb, 'BB', 'pos-bb');

        if (infoSpan) infoSpan.innerText = `HU模式: P${sb}(D/SB) vs P${bb}(BB)`;
    } else {
        /** 多人模式 **/
        sb = getNextActivePlayer(dealer);
        bb = getNextActivePlayer(sb);
        utg = getNextActivePlayer(bb);

        addBadge(sb, 'SB', 'pos-sb');
        addBadge(bb, 'BB', 'pos-bb');

        if (activeIds.length >= 4) {
            addBadge(utg, 'UTG', 'pos-utg');
        }

        if (infoSpan) infoSpan.innerText = `莊家位：P${dealer}`;
    }
}

/**
 * [輔助函式] 在指定玩家座位上產生顏色標籤
 * @param {number} playerId - 玩家編號
 * @param {string} text - 顯示文字 (SB, BB, UTG)
 * @param {string} className - CSS 樣式類別 (pos-sb, pos-bb, pos-utg)
 */
/**
 * [輔助函式] 在指定玩家姓名旁新增標籤
 */
function addBadge(playerId, text, className) {
    const container = document.getElementById(`badge-p${playerId}`);
    if (container) {
        const span = document.createElement('span');
        span.className = `pos-badge ${className}`;
        span.innerText = text;
        container.appendChild(span);
    }
}

function togglePlayer(pIndex) {
    if (pIndex === 1) return;

    const seat = document.getElementById(`seat-p${pIndex}`);
    const statusSpan = document.getElementById(`status-p${pIndex}`);
    const winRate = document.getElementById(`win-p${pIndex}`);

    if (gameState.activePlayers[pIndex]) {
        delete gameState.activePlayers[pIndex];
        seat.classList.remove('active');
        statusSpan.innerText = "(休息)";
        winRate.innerText = "--%";
        // 清除該玩家已選的牌
        delete gameState.selectedCards[`p${pIndex}c1`];
        delete gameState.selectedCards[`p${pIndex}c2`];
        updateCardUI(`p${pIndex}c1`);
        updateCardUI(`p${pIndex}c2`);
    } else {
        gameState.activePlayers[pIndex] = true;
        seat.classList.add('active');
        statusSpan.innerText = "(參加)";
    }
}

// 開啟選牌視窗：設定「目前群組」，並自動尋找第一個空位
function openGroupSelector(groupKey) {
    // 確保玩家已啟用
    if (groupKey.startsWith('p')) {
        const pIndex = parseInt(groupKey.replace('p', ''));
        if (!gameState.activePlayers[pIndex]) {
            togglePlayer(pIndex);
        }
    }

    gameState.activeGroup = groupKey; // 設定目前是誰在選牌 (重要!)

    // 自動將目標設定為該群組的第一個空位 (若全滿則不選任何目標，等待使用者點擊刪除)
    autoSetTargetToFirstEmpty();

    renderSelector();
    document.getElementById('selector-overlay').style.display = 'flex';
}

// 自動尋找並鎖定第一個空位
function autoSetTargetToFirstEmpty() {
    const groupIds = getIdsInGroup(gameState.activeGroup);

    // 找出第一個沒有被填值的 ID
    let firstEmpty = groupIds.find(id => !gameState.selectedCards[id]);

    // 設定目標 (如果全滿，firstEmpty 為 undefined，這時 currentPickingTarget 會變 null，這也是對的)
    gameState.currentPickingTarget = firstEmpty || null;

    // 更新畫面上的高亮框
    document.querySelectorAll('.card').forEach(c => c.classList.remove('editing'));
    if (firstEmpty) {
        document.getElementById(firstEmpty).classList.add('editing');
    }
}

// 取得該群組包含的所有 ID (順序很重要：b0->b4, c1->c2)
function getIdsInGroup(groupKey) {
    if (groupKey === 'board') {
        return ['b0', 'b1', 'b2', 'b3', 'b4'];
    } else {
        // groupKey 例如 'p1'
        return [`${groupKey}c1`, `${groupKey}c2`];
    }
}

// 渲染選牌列表 (邏輯修正：區分「自己群組」與「他人群組」)
function renderSelector() {
    const grid = document.getElementById('card-grid');
    grid.innerHTML = '';

    // 取得目前群組擁有的所有牌 (用於判斷是否為自己所選)
    const currentGroupIds = getIdsInGroup(gameState.activeGroup);

    suits.forEach(s => {
        values.forEach(v => {
            const cardStr = v + s;

            // 檢查這張牌目前被誰持有
            let isUsed = false;
            let usedById = null;

            for (const [key, val] of Object.entries(gameState.selectedCards)) {
                if (val === cardStr) {
                    isUsed = true;
                    usedById = key;
                    break;
                }
            }

            const div = document.createElement('div');
            div.className = 'selector-card';
            div.style.color = suitColors[s];
            div.innerText = cardStr;

            // 決定鎖定狀態
            let isLocked = false;
            let isOwnedByMe = false;

            if (isUsed) {
                div.classList.add('selected');

                // 判斷持有者是否在目前的操作群組內
                if (currentGroupIds.includes(usedById)) {
                    // 是我自己群組選的 -> 顯示綠色，允許點擊 (移除)
                    isOwnedByMe = true;
                    div.classList.add('owned-by-me'); // 用於 CSS 樣式
                } else {
                    // 是別人選的 (例如選 P1 時，這張牌在 Board) -> 嚴格鎖定
                    isLocked = true;
                    div.classList.add('locked');
                    div.title = "其他玩家或公牌已持有";
                }
            }

            // 綁定點擊事件
            if (!isLocked) {
                div.onclick = () => handleCardClick(cardStr, isUsed, usedById, isOwnedByMe);
            } else {
                div.onclick = (e) => e.stopPropagation();
            }

            grid.appendChild(div);
        });
    });
}

// 處理選牌與取消 (核心邏輯：取消後自動補位)
function handleCardClick(cardStr, isUsed, usedById, isOwnedByMe) {

    // 狀況 A: 點擊一張「我這個群組已經選走」的牌 -> 執行移除 (取消選取)
    if (isUsed && isOwnedByMe) {
        // 1. 從紀錄中刪除
        delete gameState.selectedCards[usedById];
        updateCardUI(usedById);

        // 2. 關鍵邏輯：一旦有空格，立刻將目標 (Target) 重置為最前面的空格
        // 這樣下次點擊就會填入這個剛空出來的位置 (或者更前面的位置)
        autoSetTargetToFirstEmpty();

        // 3. 重新渲染選牌視窗 (該牌會變回未選取狀態)
        renderSelector();
        return;
    }

    // 狀況 B: 選一張新牌 (前提：必須有合法的目標格子)
    if (gameState.currentPickingTarget) {
        // 填入牌
        gameState.selectedCards[gameState.currentPickingTarget] = cardStr;
        updateCardUI(gameState.currentPickingTarget);

        // 選完後，自動跳到下一個空格
        autoSetTargetToFirstEmpty();

        renderSelector();
    } else {
        // 如果目前沒有目標 (例如 5 張已滿)，但使用者點擊了一張沒被選過的牌
        // 這裡可以選擇不動作，或者提示使用者先刪除一張
        // 依照您的需求：不做動作，使用者必須先點選已選的牌來取消，才能騰出空間
    }
}

// 更新桌面 UI
function updateCardUI(elementId) {
    const el = document.getElementById(elementId);
    const cardVal = gameState.selectedCards[elementId];

    if (cardVal) {
        el.innerText = cardVal;
        el.style.color = suitColors[cardVal.slice(-1)];
        el.classList.remove('empty');
        el.style.background = "white";
    } else {
        el.innerText = "?";
        el.style.color = "white";
        el.classList.add('empty');
        el.style.background = "";
    }
}

function closeSelector() {
    document.getElementById('selector-overlay').style.display = 'none';
    gameState.currentPickingTarget = null;
    gameState.activeGroup = null;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('editing'));
}

/**
 * [功能] 清空目前桌面所有設定
 * [原理] 重新載入頁面以達到完全初始化
 */
function resetTable() {
    if (confirm("確定要清空桌面所有卡片與設定嗎？")) {
        location.reload();
    }
}

/* =========================================
   3. 核心運算 (維持不變)
   ========================================= */
/**
 * [功能] 計算所有活躍玩家的勝率
 * [原理] 使用蒙特卡羅模擬法，隨機補齊剩餘卡片 3000 次，統計獲勝次數
 */
function calculateOdds() {
    const activeIds = Object.keys(gameState.activePlayers).map(Number);
    // 檢查人數，至少需 2 人
    if (activeIds.length < 2) {
        document.getElementById('status-text').innerText = "請至少點擊一位對手標籤加入牌局";
        return;
    }
    document.getElementById('status-text').innerText = `模擬中：${activeIds.length} 人局...`;
    // 非同步執行模擬，避免 UI 凍結
    setTimeout(() => runSimulation(activeIds), 50);
}

function runSimulation(playerIds) {
    const iterations = 5000; // 模擬次數
    const wins = {};
    playerIds.forEach(id => wins[id] = 0);

    const fullDeck = [];
    suits.forEach(s => values.forEach(v => fullDeck.push(v + s)));

    const knownCards = Object.values(gameState.selectedCards);

    for (let i = 0; i < iterations; i++) {
        let deck = fullDeck.filter(c => !knownCards.includes(c));

        // 洗牌
        for (let j = deck.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [deck[j], deck[k]] = [deck[k], deck[j]];
        }

        let board = [];
        // 填補公牌
        for (let b = 0; b < 5; b++) {
            const bCard = gameState.selectedCards[`b${b}`];
            if (bCard) board.push(bCard);
            else board.push(deck.pop());
        }

        let bestScore = -1;
        let winners = [];

        playerIds.forEach(pid => {
            let c1 = gameState.selectedCards[`p${pid}c1`];
            let c2 = gameState.selectedCards[`p${pid}c2`];

            if (!c1) c1 = deck.pop();
            if (!c2) c2 = deck.pop();

            const score = getHandScore([...board, c1, c2]);
            if (score > bestScore) {
                bestScore = score;
                winners = [pid];
            } else if (score === bestScore) {
                winners.push(pid);
            }
        });

        winners.forEach(pid => wins[pid] += 1 / winners.length);
    }

    playerIds.forEach(pid => {
        const rate = ((wins[pid] / iterations) * 100).toFixed(1);
        const el = document.getElementById(`win-p${pid}`);
        el.innerText = rate + '%';
        el.style.color = parseFloat(rate) > (100 / playerIds.length + 10) ? '#4ade80' : '#ffb703';
    });

    document.getElementById('status-text').innerText = "計算完成";
}

/* =========================================
   4. 牌力計算引擎 (維持不變)
   ========================================= */
function parseCard(cardStr) {
    if (!cardStr) return { value: 0, suit: '' };
    const suit = cardStr.slice(-1);
    const valStr = cardStr.slice(0, -1);
    return { value: valueMap[valStr], suit: suit };
}

function getHandScore(cards) {
    if (cards.length < 5) return 0;
    const sorted = cards.map(parseCard).sort((a, b) => b.value - a.value);

    const suitCounts = {};
    const valCounts = {};
    sorted.forEach(c => {
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
        valCounts[c.value] = (valCounts[c.value] || 0) + 1;
    });

    let flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);

    const uniqueVals = [...new Set(sorted.map(c => c.value))];
    if (uniqueVals.includes(14)) uniqueVals.push(1);
    let straightHigh = 0;
    let seq = 0;
    for (let i = 0; i < uniqueVals.length - 1; i++) {
        if (uniqueVals[i] - uniqueVals[i + 1] == 1) seq++;
        else seq = 0;
        if (seq >= 4) straightHigh = uniqueVals[i - 3];
    }

    if (flushSuit && straightHigh) return 9000000 + straightHigh;

    const quads = Object.keys(valCounts).find(v => valCounts[v] === 4);
    if (quads) return 8000000 + parseInt(quads) * 100;

    const trips = Object.keys(valCounts).filter(v => valCounts[v] === 3).map(Number).sort((a, b) => b - a);
    const pairs = Object.keys(valCounts).filter(v => valCounts[v] === 2).map(Number).sort((a, b) => b - a);

    if (trips.length > 0 && (trips.length >= 2 || pairs.length > 0)) {
        return 7000000 + trips[0] * 100 + (trips[1] || pairs[0]);
    }

    if (flushSuit) return 6000000 + sorted.find(c => c.suit === flushSuit).value;
    if (straightHigh) return 5000000 + straightHigh;
    if (trips.length > 0) return 4000000 + trips[0] * 100;
    if (pairs.length >= 2) return 3000000 + pairs[0] * 100 + pairs[1];
    if (pairs.length === 1) return 2000000 + pairs[0] * 100;

    return 1000000 + sorted[0].value;
}