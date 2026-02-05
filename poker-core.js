/* =========================================
   1. 基礎設定與初始化，程式亂了
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