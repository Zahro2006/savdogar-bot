require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const moment = require('moment');

const { initDB, saveTrade, getTokenAllocation, getTodayTrades, getWeekTrades, getMonthTrades, getAllTrades, getTradeStats, getSetting, setSetting } = require('./database');
const { buyTemplate, sellTemplate, dailyTemplate, weeklyTemplate, monthlyTemplate } = require('./templates');
const { getDailyQuote } = require('./quotes');

const bot = new Telegraf(process.env.BOT_TOKEN);
const userStates = new Map();

// ===== KLAVIATURALAR =====
const mainMenu = Markup.keyboard([
  ['📊 Yangi savdo', '📁 Kanal sozlamalari'],
  ['📈 Tahlil', '📋 Savdolar tarixi'],
  ['🌅 Bugungi dars']
]).resize();

const tradeTypeKb = Markup.keyboard([
  ['🟢 OLISH', '🔴 SOTISH'],
  ['🔙 Orqaga']
]).resize();

const backKb = Markup.keyboard([['🔙 Orqaga']]).resize();
const skipKb = Markup.keyboard([['⏭ O\'tkazish', '🔙 Orqaga']]).resize();

const analysisKb = Markup.keyboard([
  ['📅 Bugungi', '📆 Haftalik'],
  ['🗓 Oylik', '📊 Umumiy'],
  ['🔙 Orqaga']
]).resize();

// ===== HOLAT =====
function setState(id, s) { userStates.set(id, s); }
function getState(id) { return userStates.get(id) || {}; }
function clearState(id) { userStates.delete(id); }

// ===== KANALGA YUBORISH =====
async function postToChannel(ctx, userId, text, photoId) {
  const ch = await getSetting(userId, 'channel');
  if (!ch) return null;
  try {
    if (photoId) {
      const msg = await ctx.telegram.sendPhoto(ch, photoId, { caption: text });
      return msg.message_id;
    } else {
      const msg = await ctx.telegram.sendMessage(ch, text);
      return msg.message_id;
    }
  } catch (e) {
    console.error('Kanal xatosi:', e.message);
    return null;
  }
}

async function postAnalysis(ctx, userId, text) {
  const ch = await getSetting(userId, 'channel');
  if (!ch) return;
  try { await ctx.telegram.sendMessage(ch, text); } catch (e) { console.error(e.message); }
}

// ===== /start =====
bot.start(async ctx => {
  clearState(ctx.from.id);
  await ctx.replyWithMarkdown(
    `👋 Salom, *${ctx.from.first_name}*!\n\n` +
    `📒 Bu bot spot savdolaringizni kuzatib, kanalingizga post qiladi.\n\n` +
    `*Nima qila olasiz:*\n` +
    `├ 🟢 Olish postini yuborish\n` +
    `├ 🔴 Sotish postini yuborish\n` +
    `├ 📈 Kunlik, haftalik, oylik tahlil\n` +
    `└ 🌅 Har kuni treyder darsi\n\n` +
    `Boshlash uchun 👇`,
    mainMenu
  );
});

// ===== ASOSIY HANDLER =====
bot.on('message', async ctx => {
  const userId = ctx.from.id;
  const state = getState(userId);
  const text = ctx.message.text || '';
  const photo = ctx.message.photo;

  // Orqaga
  if (text === '🔙 Orqaga') {
    clearState(userId);
    return ctx.reply('🏠 Bosh menu', mainMenu);
  }

  // ===== BOSH MENU =====
  if (text === '📊 Yangi savdo') {
    setState(userId, { step: 'select_type' });
    return ctx.reply('Qaysi savdo?', tradeTypeKb);
  }

  // ===== OLISH FLOW =====
  if (text === '🟢 OLISH' && state.step === 'select_type') {
    setState(userId, { step: 'buy_token', action: 'buy', data: {} });
    return ctx.reply('🪙 Qaysi tokenni oldingiz?\n(Misol: BTC, ETH, SOL)', backKb);
  }

  if (state.step === 'buy_token') {
    setState(userId, { ...state, step: 'buy_price', data: { token: text.trim().toUpperCase() } });
    return ctx.reply(`💵 #${text.toUpperCase()} ni qancha narxda oldingiz? ($)`, backKb);
  }

  if (state.step === 'buy_price') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ To\'g\'ri narx kiriting! Misol: 45230.5');
    setState(userId, { ...state, step: 'buy_amount', data: { ...state.data, price } });
    return ctx.reply('💰 Necha dollarlik oldingiz? (USDT miqdori)\nMisol: 500', backKb);
  }

  if (state.step === 'buy_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ To\'g\'ri miqdor kiriting! Misol: 500');

    // Bu token uchun oldin kapital ajratilganmi?
    const prevAllocated = await getTokenAllocation(userId, state.data.token);
    if (prevAllocated) {
      // Oldin ajratilgan — yana so'ramasdan davom etamiz
      setState(userId, { ...state, step: 'buy_photo', data: { ...state.data, amount, allocated: prevAllocated } });
      return ctx.reply('📸 Screenshot yuboring\n(Birja dan olish tasdiqi)', skipKb);
    } else {
      // Birinchi marta — ajratilgan kapitalini so'raymiz
      setState(userId, { ...state, step: 'buy_allocated', data: { ...state.data, amount } });
      return ctx.reply(`📦 #${state.data.token} uchun jami qancha kapital ajratdingiz?\n(Misol: 600)\n\nBu faqat bir marta so'raladi.`, backKb);
    }
  }

  if (state.step === 'buy_allocated') {
    const allocated = parseFloat(text);
    if (isNaN(allocated) || allocated <= 0) return ctx.reply('❌ To\'g\'ri miqdor kiriting! Misol: 600');
    setState(userId, { ...state, step: 'buy_photo', data: { ...state.data, allocated } });
    return ctx.reply('📸 Screenshot yuboring\n(Birja dan olish tasdiqi)', skipKb);
  }

  if (state.step === 'buy_photo') {
    let photoId = null;
    if (photo) {
      photoId = photo[photo.length - 1].file_id;
    } else if (text !== '⏭ O\'tkazish') {
      return ctx.reply('📸 Rasm yuboring yoki o\'tkazib yuboring', skipKb);
    }

    const data = { ...state.data, photo_file_id: photoId };
    const tradeData = { user_id: userId, action: 'buy', token: data.token, price: data.price, amount: data.amount, allocated: data.allocated || null, photo_file_id: data.photo_file_id };
    const postText = buyTemplate(data);

    // Preview ko'rsatish
    setState(userId, { step: 'buy_confirm', data: tradeData, postText });

    const confirmKb = Markup.keyboard([['✅ Tasdiqlash', '❌ Bekor qilish']]).resize();
    if (photoId) {
      await ctx.replyWithPhoto(photoId, { caption: '👀 Preview:\n\n' + postText });
    } else {
      await ctx.reply('👀 Preview:\n\n' + postText);
    }
    return ctx.reply('Kanalga yuboraymi?', confirmKb);
  }

  if (state.step === 'buy_confirm') {
    if (text === '✅ Tasdiqlash') {
      await saveTrade(state.data);
      const msgId = await postToChannel(ctx, userId, state.postText, state.data.photo_file_id);
      clearState(userId);
      const ch = await getSetting(userId, 'channel');
      return ctx.reply(
        msgId ? '✅ Post kanalga yuborildi!' : (ch ? '⚠️ Kanalga yuborib bo\'lmadi. Bot admin ekanini tekshiring.' : '💾 Savdo saqlandi. Kanal ulanmagan.'),
        mainMenu
      );
    }
    if (text === '❌ Bekor qilish') {
      clearState(userId);
      return ctx.reply('❌ Bekor qilindi.', mainMenu);
    }
    return;
  }

  // ===== SOTISH FLOW =====
  if (text === '🔴 SOTISH' && state.step === 'select_type') {
    setState(userId, { step: 'sell_token', action: 'sell', data: {} });
    return ctx.reply('🪙 Qaysi tokenni sottingiz?\n(Misol: BTC, ETH, SOL)', backKb);
  }

  if (state.step === 'sell_token') {
    setState(userId, { ...state, step: 'sell_price', data: { token: text.trim().toUpperCase() } });
    return ctx.reply(`💵 #${text.toUpperCase()} ni qancha narxda sottingiz? ($)`, backKb);
  }

  if (state.step === 'sell_price') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ To\'g\'ri narx kiriting! Misol: 48500');
    setState(userId, { ...state, step: 'sell_profit', data: { ...state.data, price } });
    return ctx.reply('💰 Foyda/zarar miqdori qancha? (USDT)\nMisol: +45.5 yoki -12', backKb);
  }

  if (state.step === 'sell_profit') {
    const profit = parseFloat(text.replace('+', ''));
    if (isNaN(profit)) return ctx.reply('❌ To\'g\'ri kiriting! Misol: 45.5 yoki -12');
    setState(userId, { ...state, step: 'sell_photo', data: { ...state.data, profit } });
    return ctx.reply('📸 Screenshot yuboring\n(Birja dan sotish tasdiqi)', skipKb);
  }

  if (state.step === 'sell_photo') {
    let photoId = null;
    if (photo) {
      photoId = photo[photo.length - 1].file_id;
    } else if (text !== '⏭ O\'tkazish') {
      return ctx.reply('📸 Rasm yuboring yoki o\'tkazib yuboring', skipKb);
    }

    const data = { ...state.data, photo_file_id: photoId };
    const tradeData = { user_id: userId, action: 'sell', token: data.token, price: data.price, profit: data.profit, photo_file_id: data.photo_file_id };
    const postText = sellTemplate(data);

    setState(userId, { step: 'sell_confirm', data: tradeData, postText });

    const confirmKb = Markup.keyboard([['✅ Tasdiqlash', '❌ Bekor qilish']]).resize();
    if (photoId) {
      await ctx.replyWithPhoto(photoId, { caption: '👀 Preview:\n\n' + postText });
    } else {
      await ctx.reply('👀 Preview:\n\n' + postText);
    }
    return ctx.reply('Kanalga yuboraymi?', confirmKb);
  }

  if (state.step === 'sell_confirm') {
    if (text === '✅ Tasdiqlash') {
      await saveTrade(state.data);
      const msgId = await postToChannel(ctx, userId, state.postText, state.data.photo_file_id);
      clearState(userId);
      const ch = await getSetting(userId, 'channel');
      return ctx.reply(
        msgId ? '✅ Post kanalga yuborildi!' : (ch ? '⚠️ Kanalga yuborib bo\'lmadi. Bot admin ekanini tekshiring.' : '💾 Savdo saqlandi. Kanal ulanmagan.'),
        mainMenu
      );
    }
    if (text === '❌ Bekor qilish') {
      clearState(userId);
      return ctx.reply('❌ Bekor qilindi.', mainMenu);
    }
    return;
  }

  // ===== KANAL SOZLAMALARI =====
  if (text === '📁 Kanal sozlamalari') {
    const ch = await getSetting(userId, 'channel');
    setState(userId, { step: 'awaiting_channel' });
    return ctx.reply(
      `📢 Kanal sozlamalari\n\n` +
      `Hozirgi kanal: ${ch ? ch : 'Ulanmagan ❌'}\n\n` +
      `Kanal username yuboring:\nMisol: @mening_kanal\n\n` +
      `Muhim: Bot kanalda ADMIN bolishi kerak!`,
      backKb
    );
  }

  if (state.step === 'awaiting_channel') {
    let ch = text.trim();
    if (!ch.startsWith('@') && !ch.startsWith('-')) ch = '@' + ch;
    try {
      const msg = await ctx.telegram.sendMessage(ch, '✅ Kanal muvaffaqiyatli ulandi! Savdo botingiz tayyor.');
      await ctx.telegram.deleteMessage(ch, msg.message_id).catch(() => {});
      await setSetting(userId, 'channel', ch);
      clearState(userId);
      return ctx.reply(`✅ Kanal ulandi: ${ch}`, mainMenu);
    } catch {
      return ctx.reply('❌ Ulab bolmadi.\n\nBot kanalda admin ekanini tekshiring va qayta yuboring.', backKb);
    }
  }

  // ===== TAHLIL =====
  if (text === '📈 Tahlil') {
    setState(userId, { step: 'analysis' });
    return ctx.reply('📈 Tahlil', analysisKb);
  }

  if (text === '📅 Bugungi') {
    const trades = await getTodayTrades(userId);
    const stats = getTradeStats(trades);
    const date = moment().format('DD.MM.YYYY');
    const msg = dailyTemplate(stats, trades, date);
    await ctx.reply(msg);
    await postAnalysis(ctx, userId, msg);
    return;
  }

  if (text === '📆 Haftalik') {
    const trades = await getWeekTrades(userId);
    const stats = getTradeStats(trades);
    const weekStr = `${moment().subtract(6, 'days').format('DD.MM')} - ${moment().format('DD.MM.YYYY')}`;
    const msg = weeklyTemplate(stats, trades, weekStr);
    await ctx.reply(msg);
    await postAnalysis(ctx, userId, msg);
    return;
  }

  if (text === '🗓 Oylik') {
    const trades = await getMonthTrades(userId);
    const stats = getTradeStats(trades);
    const msg = monthlyTemplate(stats, trades, moment().format('MMMM YYYY'));
    await ctx.reply(msg);
    await postAnalysis(ctx, userId, msg);
    return;
  }

  if (text === '📊 Umumiy') {
    const trades = await getAllTrades(userId);
    const stats = getTradeStats(trades);
    const buyCount = trades.filter(t => t.action === 'buy').length;
    const sellCount = trades.filter(t => t.action === 'sell').length;

    if (!stats) {
      return ctx.reply(`📊 Umumiy statistika\n\n📥 Xaridlar: ${buyCount} ta\n📤 Sotuvlar: ${sellCount} ta\n\n💤 Hali yopilgan savdo yo'q.`);
    }

    const pnlSign = stats.totalPnL >= 0 ? '+' : '';
    return ctx.reply(
      `📊 Umumiy statistika\n\n` +
      `📥 Jami xaridlar: ${buyCount} ta\n` +
      `📤 Jami sotuvlar: ${sellCount} ta\n\n` +
      `✅ Foydali: ${stats.profitable} ta\n` +
      `❌ Zararli: ${stats.losing} ta\n` +
      `🎯 Win rate: ${stats.winRate}%\n\n` +
      `💰 Jami foyda: ${pnlSign}${stats.totalPnL.toFixed(2)} USDT\n` +
      `📈 O'rtacha: ${stats.avgPnL > 0 ? '+' : ''}${stats.avgPnL} USDT\n\n` +
      `🏆 Best: #${stats.best?.token} (+${stats.best?.profit} USDT)\n` +
      `😬 Worst: #${stats.worst?.token} (${stats.worst?.profit} USDT)\n` +
      (stats.topToken ? `🥇 Top token: #${stats.topToken.name} (${stats.topToken.pnl.toFixed(2)} USDT)` : '')
    );
  }

  // ===== SAVDOLAR TARIXI =====
  if (text === '📋 Savdolar tarixi') {
    const trades = await getAllTrades(userId);
    if (trades.length === 0) return ctx.reply('📭 Hali savdo yo\'q.', mainMenu);

    const recent = trades.slice(0, 10);
    let msg = `📋 So'nggi ${recent.length} ta savdo:\n\n`;
    recent.forEach((t, i) => {
      const emoji = t.action === 'buy' ? '🟢' : '🔴';
      const action = t.action === 'buy' ? 'Olish' : 'Sotish';
      msg += `${i + 1}. ${emoji} #${t.token} — ${action} $${t.price}`;
      if (t.profit !== null) msg += ` (${t.profit > 0 ? '+' : ''}${t.profit} USDT)`;
      msg += `\n   📅 ${t.created_at?.substring(0, 16)}\n\n`;
    });
    return ctx.reply(msg);
  }

  // ===== BUGUNGI DARS =====
  if (text === '🌅 Bugungi dars') {
    const q = getDailyQuote();
    return ctx.reply(`🌅 Kunlik Treyder Darsi\n\n${q.emoji} ${q.title}\n\n${q.text.replace(/\*/g, '')}\n\n💪 Bugun shu xatoni takrorlamaslikka harakat qil!`);
  }
});

// ===== CRON =====
// Kunlik tahlil 23:00
cron.schedule('0 23 * * *', () => console.log('Kunlik tahlil vaqti...'));
// Treyder darsi 08:00
cron.schedule('0 8 * * *', () => console.log('Bugungi dars vaqti...'));

bot.catch((err, ctx) => {
  console.error('Bot xatosi:', err);
  ctx.reply('⚠️ Xato yuz berdi. /start bosing.').catch(() => {});
});

initDB().then(() => {
  bot.launch({ dropPendingUpdates: true });
  console.log('✅ Bot ishga tushdi!');
}).catch(err => {
  console.error('❌ DB xato:', err.message);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
