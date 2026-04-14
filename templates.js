const moment = require('moment');

function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return parseFloat(num.toFixed(4)).toString();
}

function formatPnL(pnl) {
  if (pnl > 0) return `+${formatNumber(pnl)}`;
  return formatNumber(pnl);
}

function getPnLEmoji(pnl) {
  if (pnl > 10) return '🚀';
  if (pnl > 0) return '📈';
  if (pnl < -10) return '💥';
  return '📉';
}

function calculateDuration(entryDate, exitDate) {
  const entry = moment(entryDate, 'DD.MM.YYYY HH:mm');
  const exit = moment(exitDate, 'DD.MM.YYYY HH:mm');
  const diff = moment.duration(exit.diff(entry));
  const days = Math.floor(diff.asDays());
  const hours = diff.hours();
  const minutes = diff.minutes();

  if (days > 0) return `${days} kun ${hours} soat`;
  if (hours > 0) return `${hours} soat ${minutes} daqiqa`;
  return `${minutes} daqiqa`;
}

function calculateSpotPnL(entryPrice, exitPrice, amount) {
  const profitPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
  const profitLoss = (profitPercent / 100) * amount;
  return { profitLoss, profitPercent };
}

function calculateFuturesPnL(entryPrice, exitPrice, amount, leverage, direction) {
  let profitPercent;
  if (direction === 'long') {
    profitPercent = ((exitPrice - entryPrice) / entryPrice) * leverage * 100;
  } else {
    profitPercent = ((entryPrice - exitPrice) / entryPrice) * leverage * 100;
  }
  const profitLoss = (profitPercent / 100) * amount;
  return { profitLoss, profitPercent };
}

function spotTradeTemplate(trade) {
  const pnlEmoji = getPnLEmoji(trade.profit_loss);
  const pnlSign = trade.profit_loss >= 0 ? '+' : '';
  const duration = calculateDuration(trade.entry_date, trade.exit_date);

  return `
╔══════════════════════╗
     📊 *SPOT SAVDO*
╚══════════════════════╝

🪙 Token: *#${trade.token.toUpperCase()}*

📥 *Kirish:*
   └ 💵 Narx: \`$${trade.entry_price}\`
   └ 📅 Sana: \`${trade.entry_date}\`

📤 *Chiqish:*
   └ 💵 Narx: \`$${trade.exit_price}\`
   └ 📅 Sana: \`${trade.exit_date}\`

💰 Miqdor: \`${trade.amount} USDT\`
⏱ Muddat: \`${duration}\`

${pnlEmoji} *Natija: ${pnlSign}${formatNumber(trade.profit_loss)} USDT (${pnlSign}${formatNumber(trade.profit_percent)}%)*

${trade.correct_actions ? `✅ *To'g'ri qilganlar:*\n${trade.correct_actions}\n` : ''}
${trade.mistakes ? `❌ *Xatolar:*\n${trade.mistakes}\n` : ''}
${trade.notes ? `📝 *Izoh:*\n${trade.notes}` : ''}

🕐 _${moment().format('DD.MM.YYYY HH:mm')}_
  `.trim();
}

function futuresTradeTemplate(trade) {
  const pnlEmoji = getPnLEmoji(trade.profit_loss);
  const pnlSign = trade.profit_loss >= 0 ? '+' : '';
  const directionEmoji = trade.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
  const duration = calculateDuration(trade.entry_date, trade.exit_date);

  return `
╔══════════════════════╗
    ⚡ *FUTURES SAVDO*
╚══════════════════════╝

🪙 Token: *#${trade.token.toUpperCase()}*
📍 Yo'nalish: *${directionEmoji}*
🔢 Leverage: *${trade.leverage}x*

📥 *Kirish:*
   └ 💵 Narx: \`$${trade.entry_price}\`
   └ 📅 Sana: \`${trade.entry_date}\`

📤 *Chiqish:*
   └ 💵 Narx: \`$${trade.exit_price}\`
   └ 📅 Sana: \`${trade.exit_date}\`

💰 Pozitsiya: \`${trade.amount} USDT\`
⏱ Muddat: \`${duration}\`

${pnlEmoji} *Natija: ${pnlSign}${formatNumber(trade.profit_loss)} USDT (${pnlSign}${formatNumber(trade.profit_percent)}%)*

${trade.correct_actions ? `✅ *To'g'ri qilganlar:*\n${trade.correct_actions}\n` : ''}
${trade.mistakes ? `❌ *Xatolar:*\n${trade.mistakes}\n` : ''}
${trade.notes ? `📝 *Izoh:*\n${trade.notes}` : ''}

🕐 _${moment().format('DD.MM.YYYY HH:mm')}_
  `.trim();
}

function dailyAnalysisTemplate(stats, trades, date) {
  if (!stats || stats.total === 0) {
    return `📊 *${date} — Kunlik Tahlil*\n\n😴 Bugun hech qanday savdo amalga oshirilmadi.\n\nErtaga omad! 💪`;
  }

  const pnlEmoji = getPnLEmoji(stats.totalPnL);
  const winEmoji = stats.winRate >= 70 ? '🏆' : stats.winRate >= 50 ? '👍' : '📚';

  // Soat bo'yicha tahlil
  const hourStats = {};
  trades.forEach(t => {
    const hour = moment(t.entry_date, 'DD.MM.YYYY HH:mm').hour();
    if (!hourStats[hour]) hourStats[hour] = { count: 0, pnl: 0 };
    hourStats[hour].count++;
    hourStats[hour].pnl += t.profit_loss || 0;
  });
  const bestHour = Object.entries(hourStats).sort((a, b) => b[1].pnl - a[1].pnl)[0];

  // Prognoz
  const dailyRate = stats.totalPnL;
  const monthly = (dailyRate * 22).toFixed(2);
  const yearly = (dailyRate * 250).toFixed(2);

  return `
📊 *${date} — Kunlik Tahlil*
━━━━━━━━━━━━━━━━━━━━━━

📋 *Umumiy natija:*
├ Jami savdolar: ${stats.total} ta
├ ✅ Foydali: ${stats.profitable} ta
├ ❌ Zarar: ${stats.losing} ta
└ ${winEmoji} Win rate: ${stats.winRate}%

${pnlEmoji} *Moliyaviy natija:*
├ Jami P&L: *${formatPnL(stats.totalPnL)} USDT*
├ O'rtacha savdo: ${formatPnL(parseFloat(stats.avgPnL))} USDT
└ Jami hajm: ${formatNumber(stats.totalInvested)} USDT

🏆 *Eng yaxshi savdo:*
└ ${stats.bestTrade ? `#${stats.bestTrade.token.toUpperCase()} → +${formatNumber(stats.bestTrade.profit_loss)} USDT` : 'yo\'q'}

😬 *Eng yomon savdo:*
└ ${stats.worstTrade && stats.worstTrade.profit_loss < 0 ? `#${stats.worstTrade.token.toUpperCase()} → ${formatNumber(stats.worstTrade.profit_loss)} USDT` : 'zarar yo\'q! 🎉'}

${bestHour ? `⏰ *Eng samarali soat:* ${bestHour[0]}:00 (${formatPnL(bestHour[1].pnl)} USDT)` : ''}

${stats.topToken ? `🪙 *Eng yaxshi token:* #${stats.topToken.name.toUpperCase()} (${formatPnL(stats.topToken.pnl)} USDT)` : ''}

📈 *Shu tezlikda davom etsangiz:*
├ 📅 Oylik: ~${monthly > 0 ? '+' : ''}${monthly} USDT
└ 📆 Yillik: ~${yearly > 0 ? '+' : ''}${yearly} USDT

${generateAdvice(stats)}

🕐 _Tahlil: ${moment().format('DD.MM.YYYY HH:mm')}_
  `.trim();
}

function weeklyAnalysisTemplate(stats, trades, weekStr) {
  if (!stats || stats.total === 0) {
    return `📊 *Haftalik Tahlil* (${weekStr})\n\n😴 Bu hafta hech qanday savdo amalga oshirilmadi.`;
  }

  // Kun bo'yicha tahlil
  const dayNames = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
  const dayStats = {};
  trades.forEach(t => {
    const day = moment(t.entry_date, 'DD.MM.YYYY HH:mm').day();
    if (!dayStats[day]) dayStats[day] = { count: 0, pnl: 0 };
    dayStats[day].count++;
    dayStats[day].pnl += t.profit_loss || 0;
  });
  const bestDay = Object.entries(dayStats).sort((a, b) => b[1].pnl - a[1].pnl)[0];

  const pnlEmoji = getPnLEmoji(stats.totalPnL);

  return `
📅 *Haftalik Tahlil* (${weekStr})
━━━━━━━━━━━━━━━━━━━━━━

📋 *Statistika:*
├ Jami savdolar: ${stats.total} ta
├ ✅ Foydali: ${stats.profitable} ta
├ ❌ Zarar: ${stats.losing} ta
└ 🎯 Win rate: ${stats.winRate}%

${pnlEmoji} *Moliyaviy natija:*
├ Jami P&L: *${formatPnL(stats.totalPnL)} USDT*
├ Kuniga o'rtacha: ${formatPnL(stats.totalPnL / 7)} USDT
└ Jami hajm: ${formatNumber(stats.totalInvested)} USDT

🏆 *Best trade:* ${stats.bestTrade ? `#${stats.bestTrade.token.toUpperCase()} → +${formatNumber(stats.bestTrade.profit_loss)} USDT` : 'yo\'q'}
📉 *Worst trade:* ${stats.worstTrade ? `#${stats.worstTrade.token.toUpperCase()} → ${formatNumber(stats.worstTrade.profit_loss)} USDT` : 'yo\'q'}

${bestDay ? `📆 *Eng yaxshi kun:* ${dayNames[parseInt(bestDay[0])]} (${formatPnL(bestDay[1].pnl)} USDT)` : ''}
${stats.topToken ? `🪙 *Top token:* #${stats.topToken.name.toUpperCase()} (${stats.topToken.count} savdo, ${formatPnL(stats.topToken.pnl)} USDT)` : ''}

${generateAdvice(stats)}

🕐 _Tahlil: ${moment().format('DD.MM.YYYY HH:mm')}_
  `.trim();
}

function monthlyAnalysisTemplate(stats, trades, monthStr) {
  if (!stats || stats.total === 0) {
    return `📊 *Oylik Tahlil* (${monthStr})\n\n😴 Bu oy hech qanday savdo amalga oshirilmadi.`;
  }

  const pnlEmoji = getPnLEmoji(stats.totalPnL);
  const roi = stats.totalInvested > 0 ? ((stats.totalPnL / stats.totalInvested) * 100).toFixed(2) : 0;

  return `
🗓️ *Oylik Tahlil* (${monthStr})
━━━━━━━━━━━━━━━━━━━━━━

📋 *Statistika:*
├ Jami savdolar: ${stats.total} ta
├ ✅ Foydali: ${stats.profitable} ta
├ ❌ Zarar: ${stats.losing} ta
└ 🎯 Win rate: ${stats.winRate}%

${pnlEmoji} *Moliyaviy natija:*
├ Jami P&L: *${formatPnL(stats.totalPnL)} USDT*
├ ROI: ${roi > 0 ? '+' : ''}${roi}%
├ O'rtacha savdo/kun: ${(stats.total / 30).toFixed(1)} ta
└ Jami hajm: ${formatNumber(stats.totalInvested)} USDT

🏆 *Best trade:* ${stats.bestTrade ? `#${stats.bestTrade.token.toUpperCase()} → +${formatNumber(stats.bestTrade.profit_loss)} USDT` : 'yo\'q'}
📉 *Worst trade:* ${stats.worstTrade ? `#${stats.worstTrade.token.toUpperCase()} → ${formatNumber(stats.worstTrade.profit_loss)} USDT` : 'yo\'q'}
${stats.topToken ? `🪙 *Top token:* #${stats.topToken.name.toUpperCase()} (${formatPnL(stats.topToken.pnl)} USDT)` : ''}

${generateAdvice(stats)}

🕐 _Tahlil: ${moment().format('DD.MM.YYYY HH:mm')}_
  `.trim();
}

function generateAdvice(stats) {
  const advice = [];

  if (stats.winRate < 40) {
    advice.push('⚠️ Win rate past — strategiyangizni qayta ko\'rib chiqing');
  } else if (stats.winRate >= 70) {
    advice.push('🌟 Ajoyib win rate! Strategiyangiz ishlayapti');
  }

  if (stats.totalPnL < 0) {
    advice.push(`💡 *Bot maslahati:* Bugun ${Math.abs(stats.losing)} ta zarar savdo bo'ldi. Risk management ni kuchaytiring. Har savdoga kapitalning max 2% xavf qiling.`);
  } else if (stats.totalPnL > 0) {
    advice.push(`💡 *Bot maslahati:* ${stats.profitable} ta foydali savdo! Qozongan foydaning bir qismini olib qo'ying va riskni kamaytiring.`);
  }

  return advice.join('\n');
}

function quoteTemplate(quote) {
  return `
🌅 *Kunlik Treyder Darsi*
━━━━━━━━━━━━━━━━━━━━━━

${quote.emoji} *Xato №: ${quote.title}*

${quote.text}

💪 _Bugun shu xatoni takrorlamaslikka harakat qil!_
  `.trim();
}

module.exports = {
  spotTradeTemplate,
  futuresTradeTemplate,
  dailyAnalysisTemplate,
  weeklyAnalysisTemplate,
  monthlyAnalysisTemplate,
  quoteTemplate,
  calculateSpotPnL,
  calculateFuturesPnL,
  formatNumber,
  formatPnL
};
