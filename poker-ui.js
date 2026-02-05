/* =========================================
   poker-ui.js
   負責桌面渲染、互動事件、選牌邏輯與特效呈現
   ========================================= */

/**
 * [功能] 初始化桌面
 * 產生 9 個座位的 HTML，包含暱稱、卡片、Fold 按鈕、位置標籤
 */
function initTable() {
    const placeholder = document.getElementById('seats-placeholder');
    if (!placeholder) return;

    placeholder.innerHTML = '';

    for (let i = 1; i <= 9; i++) {
        const seat = document.createElement('div');
        const isActive = gameState.activePlayers[i];
        const isFolded = gameState.foldedPlayers && gameState.foldedPlayers[i];
        const isGameStarted = Object.keys(gameState.selectedCards).length > 0;

        // Fold 按鈕顯示邏輯
        const foldBtnStyle = (isActive && isGameStarted) ? "display:inline-block;" : "display:none;";
        const foldBtnText = isFolded ? "復原" : "Fold";

        let labelText = (i === 1) ? "你 (Hero)" : `P${i}`;
        let statusText = isActive ? (isFolded ? "(Fold)" : "(參加)") : "(休息)";
        const foldClass = (isActive && isFolded) ? 'folded' : '';

        seat.className = `seat s${i} ${isActive ? 'active' : ''}`;
        seat.id = `seat-p${i}`;

        // 點擊座位可開啟該玩家的選牌 (整組)
        seat.setAttribute('onclick', `openSelector('p${i}c1')`);

        seat.innerHTML = `
            <div class="seat-label" onclick="event.stopPropagation();">
                <span onclick="togglePlayer(${i})">
                    ${labelText} <span id="status-p${i}" style="font-size:10px">${statusText}</span>
                </span>
                <button class="btn-fold ${isFolded ? 'is-folded' : ''}" 
                        style="${foldBtnStyle} margin-left:8px; vertical-align:middle;"
                        onclick="event.stopPropagation(); toggleFold(${i})">
                    ${foldBtnText}
                </button>
            </div>
            
            <div id="badge-p${i}" class="badge-container" style="min-height:20px; margin-bottom:4px;"></div>
            
            <div style="display:flex; gap:4px; justify-content:center; pointer-events:none;">
                <div class="card empty ${foldClass}" id="p${i}c1">?</div>
                <div class="card empty ${foldClass}" id="p${i}c2">?</div>
            </div>
            
            <div class="win-rate" id="win-p${i}">--%</div>
        `;

        placeholder.appendChild(seat);
        updateCardVisuals(i);
    }

    updatePositions();
}

/**
 * [功能] 開啟選牌視窗
 * 整合了「點擊公牌」與「點擊玩家牌」的邏輯
 * 並自動鎖定該群組的第一個空位
 */
function openSelector(targetId) {
    // 1. 解析目標群組 (是公牌 board 還是玩家 pX)
    let groupKey = 'board';
    if (targetId.startsWith('p')) {
        const match = targetId.match(/p(\d+)/);
        if (match) {
            const pIndex = parseInt(match[1]);
            groupKey = `p${pIndex}`;
            // 如果玩家沒參加，自動讓他加入
            if (!gameState.activePlayers[pIndex]) {
                togglePlayer(pIndex);
            }
        }
    } else if (targetId.startsWith('b')) {
        groupKey = 'board';
    }

    gameState.activeGroup = groupKey;

    // 2. 自動跳轉到該群組的第一個空位 (UX 優化)
    // 如果使用者點的是 p1c2 但 p1c1 是空的，自動跳回 p1c1
    autoSetTargetToFirstEmpty(targetId);

    renderSelector();
    document.getElementById('selector-overlay').style.display = 'flex';
}

/**
 * [功能] 渲染 52 張卡片選單
 * 區分「我選的牌(綠色)」與「別人/公牌選的牌(鎖定)」
 */
function renderSelector() {
    const grid = document.getElementById('card-grid');
    grid.innerHTML = '';

    const currentGroupIds = getIdsInGroup(gameState.activeGroup);

    suits.forEach(s => {
        values.forEach(v => {
            const cardStr = v + s;
            let isUsed = false;
            let usedById = null;

            // 檢查牌是否已被使用
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

            let isLocked = false;
            let isOwnedByMe = false;

            if (isUsed) {
                div.classList.add('selected');
                if (currentGroupIds.includes(usedById)) {
                    isOwnedByMe = true;
                    div.classList.add('owned-by-me');
                } else {
                    isLocked = true;
                    div.classList.add('locked');
                }
            }

            if (!isLocked) {
                div.onclick = () => handleCardClick(cardStr, isUsed, usedById, isOwnedByMe);
            } else {
                div.onclick = (e) => e.stopPropagation();
            }

            grid.appendChild(div);
        });
    });
}

/**
 * [核心功能] 處理選牌點擊
 * 包含：選牌、取消選牌、自動跳下一格、計算勝率、觸發贏家特效
 */
function handleCardClick(cardStr, isUsed, usedById, isOwnedByMe) {
    const targetId = gameState.currentPickingTarget;

    // 1. 移除舊的贏家特效 (只要牌變動，舊特效就無效了)
    removeWinnerEffects();

    // 情況 A: 取消選取 (點擊自己已選的牌)
    if (isUsed && isOwnedByMe) {
        delete gameState.selectedCards[usedById];
        updateCardUI(usedById);
        autoSetTargetToFirstEmpty();
        renderSelector();
        // 牌變少了，重新計算勝率 (不觸發特效)
        if (typeof calculateOdds === 'function') calculateOdds();
        return;
    }

    // 情況 B: 選取新牌
    if (targetId) {
        gameState.selectedCards[targetId] = cardStr;
        updateCardUI(targetId);

        // 選完這張，自動跳去下一張空格
        autoSetTargetToFirstEmpty();
        renderSelector();

        // [關鍵修復]：選牌後計算勝率，並檢查是否需要「閃爍金光」
        if (typeof calculateOdds === 'function') {
            calculateOdds(() => {
                // Callback: 檢查公牌是否滿 5 張
                const boardCount = countBoardCards();
                if (boardCount === 5) {
                    showWinnerEffect();
                }
            });
        }
    }
}

/**
 * [功能] 隨機發公牌 (Flop -> Turn -> River)
 */
function dealRandomCommunityCards() {
    // 移除舊特效
    removeWinnerEffects();

    // 準備牌堆
    const fullDeck = [];
    suits.forEach(s => values.forEach(v => fullDeck.push(v + s)));
    const usedCards = Object.values(gameState.selectedCards);
    let remainingDeck = fullDeck.filter(card => !usedCards.includes(card));

    // 洗牌
    for (let i = remainingDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingDeck[i], remainingDeck[j]] = [remainingDeck[j], remainingDeck[i]];
    }

    let boardCount = countBoardCards();
    let cardsToDeal = 0;
    let stageName = "";

    if (boardCount === 0) {
        cardsToDeal = 3;
        stageName = "翻牌 (Flop)";
    } else if (boardCount >= 3 && boardCount < 5) {
        cardsToDeal = 1;
        stageName = (boardCount === 3) ? "轉牌 (Turn)" : "河牌 (River)";
    } else if (boardCount === 5) {
        alert("公牌已全數發放完畢。");
        return;
    } else {
        cardsToDeal = 3 - boardCount;
        if (cardsToDeal < 1) cardsToDeal = 1;
        stageName = "補齊翻牌";
    }

    let dealtCount = 0;
    for (let i = 0; i < 5; i++) {
        if (dealtCount >= cardsToDeal) break;
        const targetId = `b${i}`;
        if (!gameState.selectedCards[targetId] && remainingDeck.length > 0) {
            gameState.selectedCards[targetId] = remainingDeck.pop();
            updateCardUI(targetId);
            dealtCount++;
        }
    }

    document.getElementById('status-text').innerText = `已發出 ${stageName}`;

    // [關鍵修復]：計算勝率，如果現在滿5張了，就顯示特效
    if (typeof calculateOdds === "function") {
        const newTotal = boardCount + dealtCount;
        if (newTotal === 5) {
            calculateOdds(showWinnerEffect);
        } else {
            calculateOdds();
        }
    }
}

/* =========================================
   輔助功能與視覺特效
   ========================================= */

// 顯示贏家特效 (金光閃爍)
function showWinnerEffect() {
    let maxWin = -1;
    let winners = [];

    // 找出勝率最高者
    for (let i = 1; i <= 9; i++) {
        const winEl = document.getElementById(`win-p${i}`);
        // 排除 Fold 或無數據
        if (winEl && winEl.innerText !== '--%' && winEl.innerText !== 'Fold') {
            const prob = parseFloat(winEl.innerText);
            if (prob > maxWin) {
                maxWin = prob;
                winners = [i];
            } else if (prob === maxWin) {
                winners.push(i);
            }
        }
    }

    // 套用 CSS 動畫類別
    winners.forEach(id => {
        // [修正] 使用正確的 ID 選擇器
        const seat = document.getElementById(`seat-p${id}`);
        if (seat) {
            seat.classList.add('winner-flash');
        }
    });
}

// 移除所有贏家特效
function removeWinnerEffects() {
    document.querySelectorAll('.seat').forEach(el => {
        el.classList.remove('winner-flash');
    });
}

// 計算目前公牌數量
function countBoardCards() {
    let count = 0;
    for (let i = 0; i < 5; i++) {
        if (gameState.selectedCards[`b${i}`]) count++;
    }
    return count;
}

// 更新單張卡片 UI
function updateCardUI(elementId) {
    const el = document.getElementById(elementId);
    const cardVal = gameState.selectedCards[elementId];
    if (el) {
        if (cardVal) {
            el.innerText = cardVal;
            const suit = cardVal.slice(-1);
            el.className = `card ${suitColors[suit]}`;
        } else {
            el.innerText = "?";
            el.className = 'card empty';
        }
    }
}

// 關閉選單
function closeSelector() {
    document.getElementById('selector-overlay').style.display = 'none';
    gameState.currentPickingTarget = null;
    gameState.activeGroup = null;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('editing'));
}

// 自動將目標設定為該群組的第一個空位
function autoSetTargetToFirstEmpty(clickTargetId) {
    const groupIds = getIdsInGroup(gameState.activeGroup);

    // 如果傳入的點擊目標本身就是空的，優先選它
    if (clickTargetId && !gameState.selectedCards[clickTargetId]) {
        gameState.currentPickingTarget = clickTargetId;
    } else {
        // 否則找第一個空格
        const firstEmpty = groupIds.find(id => !gameState.selectedCards[id]);
        gameState.currentPickingTarget = firstEmpty || null;
    }

    // 更新綠色高亮框
    document.querySelectorAll('.card').forEach(c => c.classList.remove('editing'));
    if (gameState.currentPickingTarget) {
        document.getElementById(gameState.currentPickingTarget).classList.add('editing');
    }
}

// 取得群組內的 ID 列表
function getIdsInGroup(groupKey) {
    if (groupKey === 'board') return ['b0', 'b1', 'b2', 'b3', 'b4'];
    if (groupKey && groupKey.startsWith('p')) return [`${groupKey}c1`, `${groupKey}c2`];
    return [];
}

// 恢復卡片視覺 (用於 initTable)
function updateCardVisuals(playerId) {
    ['c1', 'c2'].forEach(suffix => {
        const key = `p${playerId}${suffix}`;
        updateCardUI(key);
        // 如果 Fold，加上半透明效果
        if (gameState.foldedPlayers && gameState.foldedPlayers[playerId]) {
            const el = document.getElementById(key);
            if (el) el.classList.add('folded');
        }
    });
}

// 切換玩家 Fold 狀態
function toggleFold(playerId) {
    if (!gameState.activePlayers[playerId]) return;
    if (!gameState.foldedPlayers) gameState.foldedPlayers = {};

    if (gameState.foldedPlayers[playerId]) {
        delete gameState.foldedPlayers[playerId];
    } else {
        gameState.foldedPlayers[playerId] = true;
    }
    initTable();
    if (Object.keys(gameState.selectedCards).length > 0) calculateOdds();
}

// 切換玩家 參加/休息
function togglePlayer(pIndex) {
    if (pIndex === 1) return;
    const seat = document.getElementById(`seat-p${pIndex}`);

    if (gameState.activePlayers[pIndex]) {
        delete gameState.activePlayers[pIndex];
        delete gameState.selectedCards[`p${pIndex}c1`];
        delete gameState.selectedCards[`p${pIndex}c2`];
    } else {
        gameState.activePlayers[pIndex] = true;
    }
    initTable();
}

/**
 * [功能] 清空桌面上的卡片與勝率，但保留玩家座位與莊家設定
 * 修正重點：使用統一的 UI 更新函式，並確保清除贏家特效
 */
/**
 * [功能] 重置桌面並自動切換莊家到下一位玩家
 */
function resetTable() {
    // 增加確認對話框，避免誤觸
    if (!confirm("確定要結算本局並開始下一局嗎？\n(將清空卡片並自動移動莊家位置)")) return;

    // 1. 清空數據層
    gameState.selectedCards = {};
    gameState.foldedPlayers = {};

    // 2. 清除贏家特效 (金光)
    if (typeof removeWinnerEffects === 'function') {
        removeWinnerEffects();
    }

    // 3. 【核心修正】順時針移動莊家位
    rotateDealer();

    // 4. 同步 UI 顯示
    initTable(); // 重新渲染座位與按鈕

    // 手動同步公牌 UI (變回問號)
    for (let i = 0; i < 5; i++) {
        updateCardUI(`b${i}`);
    }

    // 手動同步所有玩家勝率文字
    for (let i = 1; i <= 9; i++) {
        const winEl = document.getElementById(`win-p${i}`);
        if (winEl) {
            winEl.innerText = '--%';
            winEl.style.color = '';
        }
    }

    // 5. 更新狀態提示
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.innerText = `進入下一局，莊家已移至 P${gameState.dealerPos}`;
    }
}

// 更新位置標籤 (D/SB/BB)
function updatePositions() {
    // 清除舊標籤
    for (let i = 1; i <= 9; i++) {
        const badge = document.getElementById(`badge-p${i}`);
        if (badge) badge.innerHTML = '';
    }

    const activeIds = Object.keys(gameState.activePlayers).map(Number).sort((a, b) => a - b);
    if (activeIds.length < 2) return;

    if (!gameState.dealerPos || !gameState.activePlayers[gameState.dealerPos]) {
        gameState.dealerPos = activeIds[0];
    }

    const dealer = gameState.dealerPos;
    addBadge(dealer, 'D', 'pos-d');

    // 簡單的 SB/BB 邏輯
    let sb = getNextActivePlayer(dealer);
    let bb = getNextActivePlayer(sb);
    addBadge(sb, 'SB', 'pos-sb');
    addBadge(bb, 'BB', 'pos-bb');
}

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

function addBadge(playerId, text, className) {
    const container = document.getElementById(`badge-p${playerId}`);
    if (container) {
        const span = document.createElement('span');
        span.className = `pos-badge ${className}`;
        span.innerText = text;
        container.appendChild(span);
    }
}

/**
 * [功能] 將莊家位置順時針移動到下一位「活躍」玩家
 */
function rotateDealer() {
    // 使用現有的 getNextActivePlayer 尋找下一位沒在休息的人
    const nextDealer = getNextActivePlayer(gameState.dealerPos);
    
    if (nextDealer !== null) {
        gameState.dealerPos = nextDealer;
        
        // 更新位置標籤 (D, SB, BB, UTG)
        updatePositions();
        
        console.log(`莊家已移至: P${nextDealer}`);
    }
}

/**
 * [輔助功能] 尋找下一個「有參加」的玩家 ID (順時針)
 */
function getNextActivePlayer(currentId) {
    let next = currentId + 1;
    if (next > 9) next = 1;

    let count = 0;
    // 循環查找 9 次，直到找到一位在 gameState.activePlayers 裡的玩家
    while (!gameState.activePlayers[next] && count < 9) {
        next++;
        if (next > 9) next = 1;
        count++;
    }

    // 如果繞了一圈都沒人參加，回傳原點或 null
    return gameState.activePlayers[next] ? next : null;
}