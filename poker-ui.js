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

        // --- 5. 更新卡片視覺 (確保選過的牌能顯示出來) ---
        if (typeof updateCardVisuals === 'function') {
            updateCardVisuals(i);
        }
    }

    // 初始化莊家/SB/BB位置
    if (typeof updatePositions === 'function') {
        updatePositions();
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

function closeSelector() {
    document.getElementById('selector-overlay').style.display = 'none';
    gameState.currentPickingTarget = null;
    gameState.activeGroup = null;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('editing'));
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

    if (el && cardVal) {
        el.innerText = cardVal;
        el.style.color = suitColors[cardVal.slice(-1)];
        el.classList.remove('empty');
        el.style.background = "white";
        const suit = cardVal.slice(-1);
        el.className = `card ${suitColors[suit]}`; // 這會套用紅或黑
    } else {
        el.innerText = "?";
        el.style.color = "white";
        el.classList.add('empty');
        el.style.background = "";
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

/**
 * [功能] 隨機補齊剩餘的公牌 (支援自動與混合模式)
 */
/**
 * [功能] 智慧階段式隨機發公牌
 * 1. 0張 -> 發3張 (Flop) + 算勝率
 * 2. 3張 -> 發1張 (Turn) + 算勝率
 * 3. 4張 -> 發1張 (River) + 算勝率 + 顯示特效
 */
function dealRandomCommunityCards() {
    const fullDeck = [];
    suits.forEach(s => values.forEach(v => fullDeck.push(v + s)));
    const usedCards = Object.values(gameState.selectedCards);
    let remainingDeck = fullDeck.filter(card => !usedCards.includes(card));

    // 洗牌
    for (let i = remainingDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingDeck[i], remainingDeck[j]] = [remainingDeck[j], remainingDeck[i]];
    }

    // 取得目前公牌已發了幾張
    let boardCount = 0;
    for (let i = 0; i < 5; i++) {
        if (gameState.selectedCards[`b${i}`]) boardCount++;
    }

    let cardsToDeal = 0;
    let stageName = "";

    if (boardCount === 0) {
        cardsToDeal = 3; // Flop
        stageName = "翻牌 (Flop)";
    } else if (boardCount === 3) {
        cardsToDeal = 1; // Turn
        stageName = "轉牌 (Turn)";
    } else if (boardCount === 4) {
        cardsToDeal = 1; // River
        stageName = "河牌 (River)";
    } else if (boardCount === 5) {
        alert("公牌已全數發放完畢。");
        return;
    } else {
        // 處理玩家手動選了 1 或 2 張的混亂情況，直接補滿到下一個階段
        if (boardCount < 3) cardsToDeal = 3 - boardCount;
        else cardsToDeal = 1;
    }

    // 執行發牌
    let dealtInThisTurn = 0;
    for (let i = 0; i < 5 && dealtInThisTurn < cardsToDeal; i++) {
        const targetId = `b${i}`;
        if (!gameState.selectedCards[targetId]) {
            const newCard = remainingDeck.pop();
            gameState.selectedCards[targetId] = newCard;
            updateCardUI(targetId); // 確保呼叫單個更新 UI 的函式
            dealtInThisTurn++;
        }
    }

    // 更新狀態文字
    document.getElementById('status-text').innerText = `已隨機發出 ${stageName}`;

    // 自動觸發計算勝率
    if (typeof calculateOdds === "function") {
        calculateOdds();
    }

    // 如果是河牌發完，延遲一下下顯示獲勝特效
    if (boardCount + dealtInThisTurn === 5) {
        setTimeout(showWinnerEffect, 800);
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
    updatePositions();
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
 * [功能] 在 River 階段為最高勝率（獲勝者）加上閃爍特效
 */
function showWinnerEffect() {
    let maxWin = -1;
    let winners = [];

    // 找出畫面上勝率最高的人
    for (let i = 1; i <= 9; i++) {
        const winEl = document.getElementById(`win-p${i}`);
        if (winEl && winEl.innerText !== '--%') {
            const prob = parseFloat(winEl.innerText);
            if (prob > maxWin) {
                maxWin = prob;
                winners = [i];
            } else if (prob === maxWin) {
                winners.push(i);
            }
        }
    }

    // 為贏家座位加上 CSS 特效
    winners.forEach(id => {
        const seat = document.querySelector(`.seat[data-id="${id}"]`);
        if (seat) {
            seat.classList.add('winner-flash');
            // 3秒後移除特效，方便下一局
            setTimeout(() => seat.classList.remove('winner-flash'), 3000);
        }
    });
}