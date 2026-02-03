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
    dealerPos: 1,                // 預設莊家在 P1
    foldedPlayers: {} // 新增：紀錄哪些座位已棄牌 { 1: true, 3: true... }
};

document.addEventListener('DOMContentLoaded', () => {
    initTable();
    updatePositions(); // 初始化位置
});

/**
 * [功能] 初始化桌面座位、按鈕與玩家狀態
 * 確保只要玩家是「參加」狀態，無論何時都顯示 Fold 按鈕
 */
function initTable() {
    const placeholder = document.getElementById('seats-placeholder');
    if (!placeholder) return;

    placeholder.innerHTML = '';

    for (let i = 1; i <= 9; i++) {
        const seat = document.createElement('div');

        // --- 1. 取得最新狀態 ---
        const isActive = gameState.activePlayers[i];
        // 確保 foldedPlayers 物件存在，避免讀取錯誤
        const isFolded = gameState.foldedPlayers && gameState.foldedPlayers[i];

        // --- 2. 核心修正：定義顯示邏輯 ---
        // 只要是參加者 (isActive)，就顯示按鈕，不論有無選牌
        // --- 2. 核心修正：定義顯示邏輯 ---
        // 判斷桌面上是否已經有任何牌被選了 (代表遊戲進行中)
        const isGameStarted = Object.keys(gameState.selectedCards).length > 0;

        // 只要是參加者 (isActive) 且遊戲已開始，就顯示按鈕
        const foldBtnStyle = (isActive && isGameStarted) ? "display:inline-block;" : "display:none;";
        const foldBtnText = isFolded ? "復原" : "Fold";

        // 標籤文字
        let labelText = (i === 1) ? "你 (Hero)" : `P${i}`;
        let statusText = isActive ? (isFolded ? "(Fold)" : "(參加)") : "(休息)";

        // 卡片視覺效果
        const foldClass = (isActive && isFolded) ? 'folded' : '';

        // --- 3. 設定座位基本屬性 ---
        seat.className = `seat s${i} ${isActive ? 'active' : ''}`;
        seat.id = `seat-p${i}`;
        // 點擊座位整體仍可開啟選牌器
        seat.setAttribute('onclick', `openGroupSelector('p${i}')`);

        // --- 4. 產生 HTML 結構 ---
        seat.innerHTML = `
            <div class="seat-label" onclick="event.stopPropagation();">
                <span onclick="togglePlayer(${i})">
                    ${(i === 1) ? "你 (Hero)" : `P${i}`} 
                    <span id="status-p${i}" style="font-size:10px">${isActive ? (isFolded ? "(Fold)" : "(參加)") : "(休息)"}</span>
                </span>
                <button class="btn-fold ${isFolded ? 'is-folded' : ''}" 
                        style="${foldBtnStyle} margin-left:5px;"
                        onclick="event.stopPropagation(); toggleFold(${i})">
                    ${foldBtnText}
                </button>
            </div>
            `;

        // --- 5. 將座位加入桌面並恢復卡片視覺 ---
        placeholder.appendChild(seat);

        // --- 6. 更新卡片視覺 (確保選過的牌能顯示出來) ---
        if (typeof updateCardVisuals === 'function') {
            updateCardVisuals(i);
        }
    }

    // 初始化莊家/SB/BB位置
    if (typeof updatePositions === 'function') {
        updatePositions();
    }
}

// 新增一個輔助函式來恢復卡片顯示 (不然 initTable 會把牌變回 ?)
function updateCardVisuals(playerId) {
    ['c1', 'c2'].forEach(suffix => {
        const key = `p${playerId}${suffix}`;
        const cardVal = gameState.selectedCards[key];
        const el = document.getElementById(key);
        if (cardVal && el) {
            el.className = `card ${gameState.foldedPlayers[playerId] ? 'folded' : ''}`;
            const suit = cardVal.slice(-1);
            el.classList.add(suitColors[suit]);
            el.innerText = cardVal;
        }
    });
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
        // --- 新增：每選一張牌，就重新刷新一次桌面按鈕狀態 ---
        initTable();
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
 * [功能] 一鍵隨機發出剩餘的公牌 (b0 ~ b4)
 */
function dealRandomCommunityCards() {
    // 1. 建立完整 52 張牌堆
    const fullDeck = [];
    suits.forEach(s => values.forEach(v => fullDeck.push(v + s)));

    // 2. 獲取目前桌面上已經被選走的牌 (包含手牌與公牌)
    const usedCards = Object.values(gameState.selectedCards);
    // 3. 過濾掉已使用的牌
    let remainingDeck = fullDeck.filter(card => !usedCards.includes(card));

    // 4. 洗牌
    for (let i = remainingDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingDeck[i], remainingDeck[j]] = [remainingDeck[j], remainingDeck[i]];
    }

    let changed = false;
    // 5. 檢查 b0 到 b4 這五個位置，如果是空的就從牌堆抽一張
    for (let i = 0; i < 5; i++) {
        const targetId = `b${i}`;
        if (!gameState.selectedCards[targetId]) {
            if (remainingDeck.length > 0) {
                const newCard = remainingDeck.pop();
                gameState.selectedCards[targetId] = newCard;

                // 更新畫面上公牌的 DOM
                const cardEl = document.getElementById(targetId);
                if (cardEl) {
                    const suit = newCard.slice(-1);
                    cardEl.className = `card ${suitColors[suit]}`;
                    cardEl.innerText = newCard;
                }
                changed = true;
            }
        }
    }

    if (changed) {
        // 更新狀態列並重新初始化桌面以同步 Fold 按鈕狀態
        initTable();
        document.getElementById('status-text').innerText = "已隨機補齊公牌";
    } else {
        alert("公牌已滿，無需發牌");
    }
}


/**
 * [功能] 切換玩家棄牌狀態
 */
function toggleFold(playerId) {
    // 只有參加中的玩家可以 Fold
    if (!gameState.activePlayers[playerId]) return;

    // 切換棄牌狀態
    if (gameState.foldedPlayers[playerId]) {
        delete gameState.foldedPlayers[playerId];
    } else {
        gameState.foldedPlayers[playerId] = true;
    }

    // 重要：狀態改變後要重新渲染桌面，按鈕文字才會從 Fold 變成 復原
    initTable();

    // 如果有選牌，就順便更新勝率 (選用)
    if (Object.keys(gameState.selectedCards).length > 0) {
        calculateOdds();
    }
}

/**
 * [功能] 清空桌面上的卡片與勝率，但保留玩家座位與莊家設定
 */
function resetTable() {
    // 增加確認對話框，避免誤觸
    if (!confirm("確定要清空桌面上的牌嗎？(玩家設定將保留)")) return;

    // 1. 清空記憶體中的選牌資料
    gameState.selectedCards = {};
    gameState.foldedPlayers = {}; // 新增：重置所有棄牌狀態

    // 2. 重置公牌區域 (b0 - b4)
    for (let i = 0; i < 5; i++) {
        const el = document.getElementById(`b${i}`);
        if (el) {
            el.className = 'card empty'; // 移除花色樣式，變回虛線框
            el.innerText = '?';          // 文字變回問號
        }
    }

    // 3. 重置所有玩家的手牌與勝率 (p1 - p9)
    for (let i = 1; i <= 9; i++) {
        // 重置兩張手牌
        ['c1', 'c2'].forEach(suffix => {
            const el = document.getElementById(`p${i}${suffix}`);
            if (el) {
                el.className = 'card empty';
                el.innerText = '?';
            }
        });

        // 重置勝率顯示
        const winEl = document.getElementById(`win-p${i}`);
        if (winEl) {
            winEl.innerText = '--%';
            winEl.style.color = ''; // 移除顏色設定
        }
    }

    // 4. 更新狀態列提示
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.innerText = "桌面已清空，請開始新的一局";
    }
    // 建議在 resetTable 最後加這一行來刷新 UI
    initTable();
}


/* =========================================
   3. 核心運算 (提高次數)
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
    const iterations = 50000;
    const wins = {};

    // 1. 過濾出「真正參與比牌」的玩家 (排除 Fold 的人)
    // 雖然 playerIds 傳進來的是所有 Active 的人，但我們要扣掉 Fold 的
    const activeContestants = playerIds.filter(id => !gameState.foldedPlayers[id]);

    // 初始化計分板
    activeContestants.forEach(id => wins[id] = 0);

    // 如果沒人玩或只剩 0 人，直接結束
    if (activeContestants.length === 0) {
        document.getElementById('status-text').innerText = "沒有活躍玩家可計算";
        return;
    }

    const fullDeck = [];
    suits.forEach(s => values.forEach(v => fullDeck.push(v + s)));

    // 2. 關鍵：knownCards 包含「所有」桌上的牌 (包含已 Fold 玩家的牌)
    // 這保證了 Fold 掉的牌不會被重新發出來
    const knownCards = Object.values(gameState.selectedCards);

    for (let i = 0; i < iterations; i++) {
        // 從牌堆移除已知牌 (包含 Fold 的牌)
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

        // 3. 只計算「沒 Fold」的玩家的分數
        activeContestants.forEach(pid => {
            let c1 = gameState.selectedCards[`p${pid}c1`];
            let c2 = gameState.selectedCards[`p${pid}c2`];

            // 補牌
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

    // 更新顯示
    playerIds.forEach(pid => {
        const el = document.getElementById(`win-p${pid}`);
        if (el) {
            // 如果玩家 Fold 了，顯示 "Fold" 且無勝率
            if (gameState.foldedPlayers[pid]) {
                el.innerText = 'Fold';
                el.style.color = '#999';
            } else {
                const rate = ((wins[pid] / iterations) * 100).toFixed(1);
                el.innerText = rate + '%';
                el.style.color = parseFloat(rate) > (100 / activeContestants.length + 10) ? '#4ade80' : '#ffb703';
            }
        }
    });

    document.getElementById('status-text').innerText = "計算完成";
}

/* =========================================
   4. 牌力計算引擎 (修正版 - 包含踢腳判定)
   ========================================= */
function parseCard(cardStr) {
    if (!cardStr) return { value: 0, suit: '' };
    const suit = cardStr.slice(-1);
    const valStr = cardStr.slice(0, -1);
    return { value: valueMap[valStr], suit: suit };
}

function getHandScore(cards) {
    if (cards.length < 5) return 0;

    // 由大到小排序
    const sorted = cards.map(parseCard).sort((a, b) => b.value - a.value);

    const suitCounts = {};
    const valCounts = {};
    sorted.forEach(c => {
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
        valCounts[c.value] = (valCounts[c.value] || 0) + 1;
    });

    // 檢查同花
    let flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
    let flushCards = [];
    if (flushSuit) {
        // 修正：同花必須比 5 張牌的大小，不只是最大的那張
        flushCards = sorted.filter(c => c.suit === flushSuit).slice(0, 5);
    }

    // 檢查順子
    const uniqueVals = [...new Set(sorted.map(c => c.value))];
    if (uniqueVals.includes(14)) uniqueVals.push(1); // 處理 A 2 3 4 5

    let straightHigh = 0;
    let seq = 0;
    for (let i = 0; i < uniqueVals.length - 1; i++) {
        if (uniqueVals[i] - uniqueVals[i + 1] == 1) seq++;
        else seq = 0;
        if (seq >= 4) straightHigh = uniqueVals[i - 3]; // 找到順子最大值
    }

    // --- 輔助函式：計算踢腳牌分數 (將牌值轉為小數，如 A,K,J => 0.141311) ---
    const getKickerScore = (cardsToSum) => {
        let score = 0;
        let divider = 100;
        cardsToSum.forEach(c => {
            score += c.value / divider;
            divider *= 100;
        });
        return score;
    };

    // 1. 同花順 (Straight Flush) -> 900 萬分
    if (flushSuit && straightHigh) {
        // 這裡需要嚴格檢查同花順，簡化版可能會有誤差，但機率極低
        // 若要嚴謹，需檢查 flushCards 裡是否有順子，這邊暫沿用舊邏輯修正
        // 正確做法是只看同花牌有沒有順
        const fCards = sorted.filter(c => c.suit === flushSuit);
        const fVals = [...new Set(fCards.map(c => c.value))];
        if (fVals.includes(14)) fVals.push(1);
        let fSeq = 0;
        let fStraightHigh = 0;
        for (let i = 0; i < fVals.length - 1; i++) {
            if (fVals[i] - fVals[i + 1] == 1) fSeq++;
            else fSeq = 0;
            if (fSeq >= 4) fStraightHigh = fVals[i - 3];
        }
        if (fStraightHigh) return 9000000 + fStraightHigh;
    }

    // 2. 四條 (Quads) -> 800 萬分
    const quads = Object.keys(valCounts).find(v => valCounts[v] === 4);
    if (quads) {
        const kicker = sorted.find(c => c.value != quads);
        return 8000000 + parseInt(quads) * 100 + kicker.value * 0.01;
    }

    // 3. 葫蘆 (Full House) -> 700 萬分
    const trips = Object.keys(valCounts).filter(v => valCounts[v] === 3).map(Number).sort((a, b) => b - a);
    const pairs = Object.keys(valCounts).filter(v => valCounts[v] === 2).map(Number).sort((a, b) => b - a);

    if (trips.length > 0 && (trips.length >= 2 || pairs.length > 0)) {
        const tVal = trips[0];
        const pVal = (trips.length >= 2) ? trips[1] : pairs[0];
        return 7000000 + tVal * 100 + pVal;
    }

    // 4. 同花 (Flush) -> 600 萬分 (修正：比所有5張牌)
    if (flushSuit) {
        return 6000000 + getKickerScore(flushCards) * 10000; // 乘大一點避免被小數吃掉
    }

    // 5. 順子 (Straight) -> 500 萬分
    if (straightHigh) return 5000000 + straightHigh;

    // 6. 三條 (Trips) -> 400 萬分 + 兩個踢腳
    if (trips.length > 0) {
        const kickers = sorted.filter(c => c.value !== trips[0]).slice(0, 2);
        return 4000000 + trips[0] * 100 + getKickerScore(kickers);
    }

    // 7. 兩對 (Two Pair) -> 300 萬分 + 一個踢腳
    if (pairs.length >= 2) {
        const p1 = pairs[0];
        const p2 = pairs[1];
        const kicker = sorted.find(c => c.value !== p1 && c.value !== p2);
        return 3000000 + p1 * 100 + p2 + (kicker ? kicker.value * 0.01 : 0);
    }

    // 8. 一對 (One Pair) -> 200 萬分 + 三個踢腳 (修正最重要的地方)
    if (pairs.length === 1) {
        const p1 = pairs[0];
        const kickers = sorted.filter(c => c.value !== p1).slice(0, 3);
        return 2000000 + p1 * 100 + getKickerScore(kickers);
    }

    // 9. 高牌 (High Card) -> 100 萬分 + 五個踢腳
    return 1000000 + getKickerScore(sorted.slice(0, 5)) * 10000;
}
