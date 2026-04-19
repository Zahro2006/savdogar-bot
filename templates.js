const moment = require('moment');

function buyTemplate(data) {
  return `🟢 SPOT — OLISH

🪙 Token: #${data.token.toUpperCase()}
💵 Narx: $${data.price}
💰 Miqdor: $${data.amount} USDT

🕐 ${moment().utcOffset('+05:00').format('DD.MM.YYYY HH:mm')}
#spot #olish #${data.token.toUpperCase()}`;
}

function sellTemplate(data) {
  const profitEmoji = data.profit >= 0 ? '📈' : '📉';
  const profitSign = data.profit >= 0 ? '+' : '';
  return `🔴 SPOT — SOTISH

🪙 Token: #${data.token.toUpperCase()}
💵 Sotish narxi: $${data.price}
${profitEmoji} Foyda: ${profitSign}${data.profit} USDT

🕐 ${moment().utcOffset('+05:00').format('DD.MM.YYYY HH:mm')}
#spot #sotish #${data.token.toUpperCase()}`;
}

function dailyTemplate(stats, trades, date) {
  const buyCount = trades.filter(t => t.action === 'buy').length;
  const sellCount = trades.filter(t => t.action === 'sell').length;

  if (!stats) {
    return `📊 Kunlik hisobot — ${date}\n\n📥 Xaridlar: ${buyCount} ta\n📤 Sotuvlar: ${sellCount} ta\n\n💤 Bugun yopilgan savdo yo'q.`;
  }

  const pnlSign = stats.totalPnL >= 0 ? '+' : '';
  const pnlEmoji = stats.totalPnL >= 0 ? '🟢' : '🔴';
  const monthly = (stats.totalPnL * 22).toFixed(0);

  return `📊 Kunlik hisobot — ${date}

📥 Xaridlar: ${buyCount} ta
📤 Sotuvlar: ${sellCount} ta (${stats.total} ta yopildi)

✅ Foydali: ${stats.profitable} ta
❌ Zararli: ${stats.losing} ta
🎯 Win rate: ${stats.winRate}%

${pnlEmoji} Natija: ${pnlSign}${stats.totalPnL.toFixed(2)} USDT
📈 O'rtacha: ${stats.avgPnL > 0 ? '+' : ''}${stats.avgPnL} USDT

🏆 Eng yaxshi: #${stats.best?.token} (+${stats.best?.profit} USDT)
😬 Eng yomon: #${stats.worst?.token} (${stats.worst?.profit} USDT)

📅 Shu tezlikda oyda: ~${monthly > 0 ? '+' : ''}${monthly} USDT

🕐 ${moment().utcOffset('+05:00').format('DD.MM.YYYY HH:mm')}`;
}

function weeklyTemplate(stats, trades, weekStr) {
  const buyCount = trades.filter(t => t.action === 'buy').length;
  const sellCount = trades.filter(t => t.action === 'sell').length;

  if (!stats) {
    return `📆 Haftalik hisobot (${weekStr})\n\n📥 Xaridlar: ${buyCount} ta\n📤 Sotuvlar: ${sellCount} ta\n\n💤 Bu hafta yopilgan savdo yo'q.`;
  }

  const pnlSign = stats.totalPnL >= 0 ? '+' : '';
  const pnlEmoji = stats.totalPnL >= 0 ? '🟢' : '🔴';

  return `📆 Haftalik hisobot (${weekStr})

📥 Xaridlar: ${buyCount} ta
📤 Sotuvlar: ${sellCount} ta

✅ Foydali: ${stats.profitable} ta
❌ Zararli: ${stats.losing} ta
🎯 Win rate: ${stats.winRate}%

${pnlEmoji} Jami: ${pnlSign}${stats.totalPnL.toFixed(2)} USDT
📈 O'rtacha: ${stats.avgPnL > 0 ? '+' : ''}${stats.avgPnL} USDT

🏆 Best: #${stats.best?.token} (+${stats.best?.profit} USDT)
😬 Worst: #${stats.worst?.token} (${stats.worst?.profit} USDT)
${stats.topToken ? `🥇 Top token: #${stats.topToken.name} (+${stats.topToken.pnl.toFixed(2)} USDT)` : ''}

🕐 ${moment().utcOffset('+05:00').format('DD.MM.YYYY HH:mm')}`;
}

function monthlyTemplate(stats, trades, monthStr) {
  const buyCount = trades.filter(t => t.action === 'buy').length;
  const sellCount = trades.filter(t => t.action === 'sell').length;

  if (!stats) {
    return `🗓 Oylik hisobot (${monthStr})\n\n📥 Xaridlar: ${buyCount} ta\n📤 Sotuvlar: ${sellCount} ta\n\n💤 Bu oy yopilgan savdo yo'q.`;
  }

  const pnlSign = stats.totalPnL >= 0 ? '+' : '';
  const pnlEmoji = stats.totalPnL >= 0 ? '🟢' : '🔴';

  return `🗓 Oylik hisobot (${monthStr})

📥 Xaridlar: ${buyCount} ta
📤 Sotuvlar: ${sellCount} ta

✅ Foydali: ${stats.profitable} ta
❌ Zararli: ${stats.losing} ta
🎯 Win rate: ${stats.winRate}%

${pnlEmoji} Jami: ${pnlSign}${stats.totalPnL.toFixed(2)} USDT
📈 O'rtacha savdoda: ${stats.avgPnL > 0 ? '+' : ''}${stats.avgPnL} USDT

🏆 Best: #${stats.best?.token} (+${stats.best?.profit} USDT)
😬 Worst: #${stats.worst?.token} (${stats.worst?.profit} USDT)
${stats.topToken ? `🥇 Top token: #${stats.topToken.name} (${stats.topToken.pnl.toFixed(2)} USDT)` : ''}

🕐 ${moment().utcOffset('+05:00').format('DD.MM.YYYY HH:mm')}`;
}

module.exports = { buyTemplate, sellTemplate, dailyTemplate, weeklyTemplate, monthlyTemplate };
