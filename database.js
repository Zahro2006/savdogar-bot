const { createClient } = require('@libsql/client');

// Turso bulutli DB ulanish
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// ===== JADVALLARNI YARATISH =====
async function initDB() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      direction TEXT,
      token TEXT NOT NULL,
      leverage REAL DEFAULT 1,
      entry_price REAL NOT NULL,
      entry_date TEXT NOT NULL,
      exit_price REAL NOT NULL,
      exit_date TEXT NOT NULL,
      amount REAL NOT NULL,
      profit_loss REAL,
      profit_percent REAL,
      correct_actions TEXT,
      mistakes TEXT,
      notes TEXT,
      channel_message_id INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    );
  `);
  console.log('✅ Turso DB ulandi va jadvallar tayyor!');
}

// ===== SAVDO FUNKSIYALARI =====

async function saveTrade(trade) {
  const result = await db.execute({
    sql: `INSERT INTO trades (user_id, type, direction, token, leverage, entry_price, entry_date, exit_price, exit_date, amount, profit_loss, profit_percent, correct_actions, mistakes, notes)
          VALUES (:user_id, :type, :direction, :token, :leverage, :entry_price, :entry_date, :exit_price, :exit_date, :amount, :profit_loss, :profit_percent, :correct_actions, :mistakes, :notes)`,
    args: trade
  });
  return Number(result.lastInsertRowid);
}

async function updateTradeMessageId(tradeId, messageId) {
  await db.execute({
    sql: 'UPDATE trades SET channel_message_id = ? WHERE id = ?',
    args: [messageId, tradeId]
  });
}

async function getTodayTrades(userId) {
  const result = await db.execute({
    sql: `SELECT * FROM trades 
          WHERE user_id = ? AND DATE(created_at) = DATE('now', 'localtime')
          ORDER BY created_at DESC`,
    args: [userId]
  });
  return result.rows;
}

async function getWeekTrades(userId) {
  const result = await db.execute({
    sql: `SELECT * FROM trades 
          WHERE user_id = ? AND created_at >= datetime('now', '-7 days', 'localtime')
          ORDER BY created_at DESC`,
    args: [userId]
  });
  return result.rows;
}

async function getMonthTrades(userId) {
  const result = await db.execute({
    sql: `SELECT * FROM trades 
          WHERE user_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
          ORDER BY created_at DESC`,
    args: [userId]
  });
  return result.rows;
}

async function getAllTrades(userId) {
  const result = await db.execute({
    sql: 'SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC',
    args: [userId]
  });
  return result.rows;
}

function getTradeStats(trades) {
  if (!trades || trades.length === 0) return null;

  const total = trades.length;
  const profitable = trades.filter(t => t.profit_loss > 0);
  const losing = trades.filter(t => t.profit_loss < 0);
  const totalPnL = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const totalInvested = trades.reduce((sum, t) => sum + (t.amount || 0), 0);
  const bestTrade = trades.reduce((best, t) => (!best || t.profit_loss > best.profit_loss) ? t : best, null);
  const worstTrade = trades.reduce((worst, t) => (!worst || t.profit_loss < worst.profit_loss) ? t : worst, null);
  const winRate = total > 0 ? (profitable.length / total * 100).toFixed(1) : 0;
  const avgPnL = total > 0 ? (totalPnL / total).toFixed(2) : 0;

  const tokenStats = {};
  trades.forEach(t => {
    if (!tokenStats[t.token]) tokenStats[t.token] = { count: 0, pnl: 0 };
    tokenStats[t.token].count++;
    tokenStats[t.token].pnl += t.profit_loss || 0;
  });
  const topToken = Object.entries(tokenStats).sort((a, b) => b[1].pnl - a[1].pnl)[0];

  return {
    total,
    profitable: profitable.length,
    losing: losing.length,
    totalPnL,
    totalInvested,
    bestTrade,
    worstTrade,
    winRate,
    avgPnL,
    topToken: topToken ? { name: topToken[0], pnl: topToken[1].pnl, count: topToken[1].count } : null
  };
}

// ===== SOZLAMALAR FUNKSIYALARI =====

async function getSetting(userId, key) {
  const result = await db.execute({
    sql: 'SELECT value FROM settings WHERE user_id = ? AND key = ?',
    args: [userId, key]
  });
  return result.rows.length > 0 ? result.rows[0].value : null;
}

async function setSetting(userId, key, value) {
  await db.execute({
    sql: 'INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)',
    args: [userId, key, value]
  });
}

module.exports = {
  db,
  initDB,
  saveTrade,
  updateTradeMessageId,
  getTodayTrades,
  getWeekTrades,
  getMonthTrades,
  getAllTrades,
  getTradeStats,
  getSetting,
  setSetting
};
