const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function initDB() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      token TEXT NOT NULL,
      price REAL NOT NULL,
      amount REAL,
      allocated REAL,
      profit REAL,
      photo_file_id TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    );
  `);

  // Eski bazada allocated ustuni bo'lmasligi mumkin — qo'shamiz
  try {
    await db.execute(`ALTER TABLE trades ADD COLUMN allocated REAL`);
    console.log('✅ allocated ustuni qo\'shildi');
  } catch (e) {
    // Ustun allaqachon bor — xato chiqsa e'tibor bermaymiz
  }

  console.log('✅ Turso DB ulandi!');
}

// Bu token uchun oldin ajratilgan kapital bormi?
async function getTokenAllocation(userId, token) {
  const r = await db.execute({
    sql: `SELECT allocated FROM trades WHERE user_id = ? AND token = ? AND action = 'buy' AND allocated IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    args: [userId, token]
  });
  return r.rows.length > 0 ? r.rows[0].allocated : null;
}

async function saveTrade(trade) {
  const result = await db.execute({
    sql: `INSERT INTO trades (user_id, action, token, price, amount, allocated, profit, photo_file_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [trade.user_id, trade.action, trade.token, trade.price, trade.amount || null, trade.allocated || null, trade.profit || null, trade.photo_file_id || null]
  });
  return Number(result.lastInsertRowid);
}

async function getTodayTrades(userId) {
  const r = await db.execute({
    sql: `SELECT * FROM trades WHERE user_id = ? AND DATE(created_at) = DATE('now','localtime') ORDER BY created_at DESC`,
    args: [userId]
  });
  return r.rows;
}

async function getWeekTrades(userId) {
  const r = await db.execute({
    sql: `SELECT * FROM trades WHERE user_id = ? AND created_at >= datetime('now','-7 days','localtime') ORDER BY created_at DESC`,
    args: [userId]
  });
  return r.rows;
}

async function getMonthTrades(userId) {
  const r = await db.execute({
    sql: `SELECT * FROM trades WHERE user_id = ? AND strftime('%Y-%m',created_at) = strftime('%Y-%m','now','localtime') ORDER BY created_at DESC`,
    args: [userId]
  });
  return r.rows;
}

async function getAllTrades(userId) {
  const r = await db.execute({
    sql: `SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC`,
    args: [userId]
  });
  return r.rows;
}

function getTradeStats(trades) {
  const sells = trades.filter(t => t.action === 'sell' && t.profit !== null);
  if (sells.length === 0) return null;

  const total = sells.length;
  const profitable = sells.filter(t => t.profit > 0);
  const losing = sells.filter(t => t.profit <= 0);
  const totalPnL = sells.reduce((s, t) => s + t.profit, 0);
  const best = sells.reduce((b, t) => (!b || t.profit > b.profit) ? t : b, null);
  const worst = sells.reduce((w, t) => (!w || t.profit < w.profit) ? t : w, null);
  const winRate = ((profitable.length / total) * 100).toFixed(1);
  const avgPnL = (totalPnL / total).toFixed(2);

  const tokenStats = {};
  sells.forEach(t => {
    if (!tokenStats[t.token]) tokenStats[t.token] = { count: 0, pnl: 0 };
    tokenStats[t.token].count++;
    tokenStats[t.token].pnl += t.profit;
  });
  const topToken = Object.entries(tokenStats).sort((a, b) => b[1].pnl - a[1].pnl)[0];

  return { total, profitable: profitable.length, losing: losing.length, totalPnL, best, worst, winRate, avgPnL, topToken: topToken ? { name: topToken[0], ...topToken[1] } : null };
}

async function getSetting(userId, key) {
  const r = await db.execute({ sql: 'SELECT value FROM settings WHERE user_id = ? AND key = ?', args: [userId, key] });
  return r.rows.length > 0 ? r.rows[0].value : null;
}

async function setSetting(userId, key, value) {
  await db.execute({ sql: 'INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)', args: [userId, key, value] });
}

module.exports = { initDB, saveTrade, getTokenAllocation, getTodayTrades, getWeekTrades, getMonthTrades, getAllTrades, getTradeStats, getSetting, setSetting };
