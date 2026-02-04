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

/* =========================================
   4. 牌力計算引擎 (修正版 - 包含踢腳判定)
   ========================================= */
function parseCard(cardStr) {
    if (!cardStr) return { value: 0, suit: '' };
    const suit = cardStr.slice(-1);
    const valStr = cardStr.slice(0, -1);
    return { value: valueMap[valStr], suit: suit };
}