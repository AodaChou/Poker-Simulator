/* =========================================
   poker-engine.js
   負責核心機率運算、蒙特卡羅模擬與牌力評分
   ========================================= */

/**
 * [功能] 計算所有活躍玩家的勝率
 * [參數] callback: (選填) 計算完成後執行的函式 (用於觸發贏家特效)
 */
function calculateOdds(callback) {
    // 1. 取得活躍玩家 ID
    const activeIds = Object.keys(gameState.activePlayers).map(Number);

    // 2. 檢查人數
    if (activeIds.length < 2) {
        document.getElementById('status-text').innerText = "請至少點擊一位對手標籤加入牌局";
        activeIds.forEach(id => {
            const el = document.getElementById(`win-p${id}`);
            if (el) {
                el.innerText = "--%";
                el.style.color = "";
            }
        });
        return;
    }

    document.getElementById('status-text').innerText = `模擬中：${activeIds.length} 人局...`;

    // 3. 非同步執行模擬，避免卡住 UI
    setTimeout(() => {
        runSimulation(activeIds, callback);
    }, 50);
}

/**
 * [功能] 執行蒙特卡羅模擬 (Monte Carlo Simulation)
 */
function runSimulation(playerIds, callback) {
    const iterations = 5000; // 模擬次數 (越高越準，但也越慢)
    const wins = {};

    // 過濾掉已經 Fold 的玩家
    const activeContestants = playerIds.filter(id => !gameState.foldedPlayers || !gameState.foldedPlayers[id]);
    
    // 初始化勝場數
    activeContestants.forEach(id => wins[id] = 0);

    if (activeContestants.length === 0) {
        document.getElementById('status-text').innerText = "沒有活躍玩家可計算";
        return;
    }

    // 準備完整牌堆
    const fullDeck = [];
    suits.forEach(s => values.forEach(v => fullDeck.push(v + s)));

    // 找出死牌 (桌面上已知的牌)
    const knownCards = Object.values(gameState.selectedCards);

    // --- 開始模擬迴圈 ---
    for (let i = 0; i < iterations; i++) {
        // 1. 建立剩餘牌堆
        let deck = fullDeck.filter(c => !knownCards.includes(c));

        // 2. 洗牌 (Fisher-Yates Shuffle)
        for (let j = deck.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [deck[j], deck[k]] = [deck[k], deck[j]];
        }

        // 3. 補齊公牌 (Board)
        let board = [];
        for (let b = 0; b < 5; b++) {
            if (gameState.selectedCards[`b${b}`]) {
                board.push(gameState.selectedCards[`b${b}`]);
            } else {
                board.push(deck.pop());
            }
        }

        // 4. 補齊手牌並比牌
        let bestScore = -1;
        let winners = [];

        activeContestants.forEach(pid => {
            let c1 = gameState.selectedCards[`p${pid}c1`];
            let c2 = gameState.selectedCards[`p${pid}c2`];

            // 模擬對手範圍：若沒選手牌，隨機發兩張
            if (!c1) c1 = deck.pop();
            if (!c2) c2 = deck.pop();

            // 計算分數
            const score = getHandScore([...board, c1, c2]);

            if (score > bestScore) {
                bestScore = score;
                winners = [pid];
            } else if (score === bestScore) {
                winners.push(pid);
            }
        });

        // 5. 紀錄勝場 (平手則平分)
        winners.forEach(pid => wins[pid] += 1 / winners.length);
    }

    // --- 更新 UI ---
    playerIds.forEach(pid => {
        const el = document.getElementById(`win-p${pid}`);
        if (!el) return;

        if (gameState.foldedPlayers && gameState.foldedPlayers[pid]) {
            el.innerText = "Fold";
            el.style.color = "#aaa";
        } else {
            const rate = ((wins[pid] / iterations) * 100).toFixed(1);
            el.innerText = rate + '%';
            
            // 根據勝率變色 (大於平均值顯示綠色)
            const threshold = 100 / activeContestants.length;
            el.style.color = parseFloat(rate) > (threshold + 5) ? '#4ade80' : '#ffb703';
        }
    });

    document.getElementById('status-text').innerText = "計算完成";

    // [關鍵] 執行回調函數 (觸發贏家金光特效)
    if (callback && typeof callback === 'function') {
        callback();
    }
}

/* =========================================
   牌力評分邏輯 (Hand Evaluator)
   ========================================= */

/**
 * [功能] 解析卡片字串
 * 輸入 "10♠" -> 輸出 { value: 10, suit: '♠' }
 */
function parseCard(cardStr) {
    if (!cardStr) return { value: 0, suit: '' };
    const suit = cardStr.slice(-1);
    const valStr = cardStr.slice(0, -1);
    return { value: valueMap[valStr], suit: suit };
}

/**
 * [功能] 計算踢腳分數
 * 將剩餘的牌值轉化為小數，用於同級牌型比大小
 * 例如 A, K, J -> 0.141311
 */
function getKickerScore(cardsToSum) {
    let score = 0;
    let divider = 100;
    cardsToSum.forEach(c => {
        score += c.value / divider;
        divider *= 100;
    });
    return score;
}

/**
 * [功能] 計算 7 張牌中的最佳 5 張牌力分數
 * 分數結構：牌型等級(百萬級) + 主要點數 + 踢腳小數
 */
function getHandScore(cards) {
    if (cards.length < 5) return 0;

    // 1. 排序：點數由大到小
    const sorted = cards.map(parseCard).sort((a, b) => b.value - a.value);

    // 2. 統計頻率
    const suitCounts = {};
    const valCounts = {};
    sorted.forEach(c => {
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
        valCounts[c.value] = (valCounts[c.value] || 0) + 1;
    });

    // 3. 基礎特徵判斷
    let flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
    
    // 順子判斷 (處理 A-2-3-4-5)
    const uniqueVals = [...new Set(sorted.map(c => c.value))];
    if (uniqueVals.includes(14)) uniqueVals.push(1); 
    
    let straightHigh = 0;
    let seq = 0;
    for (let i = 0; i < uniqueVals.length - 1; i++) {
        if (uniqueVals[i] - uniqueVals[i + 1] == 1) seq++;
        else seq = 0;
        if (seq >= 4) straightHigh = uniqueVals[i - 3];
    }

    // --- 開始評分 ---

    // 1. 同花順 (Straight Flush) -> 900 萬分
    if (flushSuit && straightHigh) {
        // 嚴謹檢查：同花色的牌是否構成順子
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
        return 8000000 + parseInt(quads) * 100 + (kicker ? kicker.value * 0.01 : 0);
    }

    // 3. 葫蘆 (Full House) -> 700 萬分
    const trips = Object.keys(valCounts).filter(v => valCounts[v] === 3).map(Number).sort((a, b) => b - a);
    const pairs = Object.keys(valCounts).filter(v => valCounts[v] === 2).map(Number).sort((a, b) => b - a);

    if (trips.length > 0 && (trips.length >= 2 || pairs.length > 0)) {
        const tVal = trips[0]; // 最大的三條
        const pVal = (trips.length >= 2) ? trips[1] : pairs[0]; // 剩下最大的對子 (或第二個三條當對子)
        return 7000000 + tVal * 100 + pVal;
    }

    // 4. 同花 (Flush) -> 600 萬分
    if (flushSuit) {
        const flushCards = sorted.filter(c => c.suit === flushSuit).slice(0, 5);
        // 使用 10000 倍率確保踢腳權重夠大
        return 6000000 + getKickerScore(flushCards) * 10000;
    }

    // 5. 順子 (Straight) -> 500 萬分
    if (straightHigh) return 5000000 + straightHigh;

    // 6. 三條 (Trips) -> 400 萬分
    if (trips.length > 0) {
        const kickers = sorted.filter(c => c.value !== trips[0]).slice(0, 2);
        return 4000000 + trips[0] * 100 + getKickerScore(kickers);
    }

    // 7. 兩對 (Two Pair) -> 300 萬分
    if (pairs.length >= 2) {
        const p1 = pairs[0];
        const p2 = pairs[1];
        const kicker = sorted.find(c => c.value !== p1 && c.value !== p2);
        return 3000000 + p1 * 100 + p2 + (kicker ? kicker.value * 0.01 : 0);
    }

    // 8. 一對 (One Pair) -> 200 萬分
    if (pairs.length === 1) {
        const p1 = pairs[0];
        const kickers = sorted.filter(c => c.value !== p1).slice(0, 3);
        return 2000000 + p1 * 100 + getKickerScore(kickers);
    }

    // 9. 高牌 (High Card) -> 100 萬分
    return 1000000 + getKickerScore(sorted.slice(0, 5)) * 10000;
}