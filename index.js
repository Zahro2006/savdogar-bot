require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const moment = require('moment');

const {
  initDB, saveTrade, updateTradeMessageId,
  getTodayTrades, getWeekTrades, getMonthTrades, getAllTrades,
  getTradeStats, getSetting, setSetting
} = require('./database');

const { getDailyQuote, getQuoteByIndex } = require('./quotes');

const {
  spotTradeTemplate, futuresTradeTemplate,
  dailyAnalysisTemplate, weeklyAnalysisTemplate, monthlyAnalysisTemplate,
  quoteTemplate, calculateSpotPnL, calculateFuturesPnL
} = require('./templates');

// ===== BOT SETUP =====
const bot = new Telegraf(process.env.BOT_TOKEN);

// Foydalanuvchi holatlari (xotira)
const userStates = new Map();

// ===== KLAVIATURALAR =====
const mainMenu = Markup.keyboard([
  ['📊 Yangi savdo', '📁 Mening kanallarim'],
  ['📈 Tahlil', '📋 Barcha savdolar'],
  ['ℹ️ Ma\'lumot', '🌅 Bugungi dars']
]).resize();

const tradeTypeKeyboard = Markup.keyboard([
  ['📈 Spot savdo', '⚡ Futures savdo'],
  ['🔙 Orqaga']
]).resize();

const directionKeyboard = Markup.keyboard([
  ['🟢 LONG', '🔴 SHORT'],
  ['🔙 Orqaga']
]).resize();

const skipKeyboard = Markup.keyboard([
  ['⏭️ O\'tkazib yuborish'],
  ['🔙 Orqaga']
]).resize();

const nowKeyboard = Markup.keyboard([
  ['🕐 Hozir', '⏭️ O\'tkazib yuborish'],
  ['🔙 Orqaga']
]).resize();

const channelMenu = Markup.keyboard([
  ['📈 Spot kanali', '⚡ Futures kanali'],
  ['🔙 Orqaga']
]).resize();

const analysisMenu = Markup.keyboard([
  ['📅 Bugungi tahlil', '📆 Haftalik tahlil'],
  ['🗓️ Oylik tahlil', '📊 Umumiy statistika'],
  ['🔙 Orqaga']
]).resize();

const confirmKeyboard = Markup.keyboard([
  ['✅ Tasdiqlash', '✏️ Qayta kiritish'],
  ['🔙 Bosh menu']
]).resize();

// ===== YORDAMCHI FUNKSIYALAR =====
function setState(userId, state) {
  userStates.set(userId, state);
}

function getState(userId) {
  return userStates.get(userId) || { step: 'main' };
}

function clearState(userId) {
  userStates.delete(userId);
}

function parseDate(input) {
  if (!input || input === '🕐 Hozir') return moment().format('DD.MM.YYYY HH:mm');
  const formats = ['DD.MM.YYYY HH:mm', 'DD.MM.YY HH:mm', 'DD/MM/YYYY HH:mm', 'YYYY-MM-DD HH:mm', 'DD.MM.YYYY', 'HH:mm'];
  for (const fmt of formats) {
    const m = moment(input, fmt, true);
    if (m.isValid()) return m.format('DD.MM.YYYY HH:mm');
  }
  return moment().format('DD.MM.YYYY HH:mm');
}

async function postToChannel(ctx, userId, type, message) {
  const key = type === 'spot' ? 'spot_channel' : 'futures_channel';
  const channelId = await getSetting(userId, key);
  if (!channelId) return null;

  try {
    const sent = await ctx.telegram.sendMessage(channelId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    return sent.message_id;
  } catch (e) {
    console.error('Kanalga yuborishda xato:', e.message);
    return null;
  }
}

async function sendAnalysisToChannels(ctx, userId, message) {
  const channels = [
    await getSetting(userId, 'spot_channel'),
    await getSetting(userId, 'futures_channel')
  ].filter((v, i, a) => v && a.indexOf(v) === i); // unique

  for (const ch of channels) {
    try {
      await ctx.telegram.sendMessage(ch, message, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('Tahlil yuborishda xato:', e.message);
    }
  }
}

// ===== SPOT TRADE FLOW =====
const SPOT_STEPS = [
  { key: 'token', question: '🪙 *Token nomini kiriting:*\n_(Misol: BTC, ETH, SOL)_', hint: '' },
  { key: 'entry_price', question: '💵 *Kirish narxini kiriting:*\n_(Misol: 45230.50)_', hint: '' },
  { key: 'entry_date', question: '📅 *Kirish sanasi va vaqtini kiriting:*\n_(Misol: 15.01.2025 14:30 yoki "Hozir")_', hint: '', keyboard: nowKeyboard },
  { key: 'exit_price', question: '💵 *Chiqish narxini kiriting:*\n_(Misol: 47500.00)_', hint: '' },
  { key: 'exit_date', question: '📅 *Chiqish sanasi va vaqtini kiriting:*\n_(Misol: 17.01.2025 09:15 yoki "Hozir")_', hint: '', keyboard: nowKeyboard },
  { key: 'amount', question: '💰 *Qancha USDT miqdorida savdo qildingiz?*\n_(Misol: 500)_', hint: '' },
  { key: 'correct_actions', question: '✅ *Bu savdoda nima to\'g\'ri qildingiz?*\n_(Bir necha narsa bo\'lsa vergul bilan yozing)_', hint: '', keyboard: skipKeyboard },
  { key: 'mistakes', question: '❌ *Bu savdoda qanday xato qildingiz?*\n_(Yoki hech qanday xato bo\'lmasa o\'tkazib yuboring)_', hint: '', keyboard: skipKeyboard },
  { key: 'notes', question: '📝 *Qo\'shimcha izoh (ixtiyoriy):*', hint: '', keyboard: skipKeyboard }
];

const FUTURES_STEPS = [
  { key: 'direction', question: '📍 *Savdo yo\'nalishini tanlang:*', hint: '', keyboard: directionKeyboard },
  { key: 'token', question: '🪙 *Token nomini kiriting:*\n_(Misol: BTC, ETH, SOL)_', hint: '' },
  { key: 'leverage', question: '🔢 *Leverage ni kiriting:*\n_(Misol: 10 yoki 20)_', hint: '' },
  { key: 'entry_price', question: '💵 *Kirish narxini kiriting:*', hint: '' },
  { key: 'entry_date', question: '📅 *Kirish sanasi va vaqti:*\n_(Misol: 15.01.2025 14:30 yoki "Hozir")_', hint: '', keyboard: nowKeyboard },
  { key: 'exit_price', question: '💵 *Chiqish narxini kiriting:*', hint: '' },
  { key: 'exit_date', question: '📅 *Chiqish sanasi va vaqti:*\n_(Misol: 17.01.2025 09:15 yoki "Hozir")_', hint: '', keyboard: nowKeyboard },
  { key: 'amount', question: '💰 *Pozitsiya hajmi (USDT):*\n_(Misol: 200)_', hint: '' },
  { key: 'correct_actions', question: '✅ *Bu savdoda nima to\'g\'ri qildingiz?*', hint: '', keyboard: skipKeyboard },
  { key: 'mistakes', question: '❌ *Bu savdoda qanday xato qildingiz?*', hint: '', keyboard: skipKeyboard },
  { key: 'notes', question: '📝 *Qo\'shimcha izoh (ixtiyoriy):*', hint: '', keyboard: skipKeyboard }
];

// ===== START KOMANDASI =====
bot.start(async (ctx) => {
  const name = ctx.from.first_name || 'Treyder';
  clearState(ctx.from.id);

  await ctx.replyWithMarkdown(
    `🎉 *Xush kelibsiz, ${name}!*\n\n` +
    `📊 Bu bot sizning kripto savdolaringizni kuzatib boradi va tahlil qiladi.\n\n` +
    `*Nima qila olasiz?*\n` +
    `├ 📊 Spot va Futures savdolarini kiritish\n` +
    `├ 📁 Kanallaringizga avtomatik jo'natish\n` +
    `├ 📈 Kunlik, haftalik, oylik tahlil\n` +
    `└ 🌅 Har kuni treyder darslari\n\n` +
    `*Boshlash uchun tugmalardan foydalaning:* 👇`,
    mainMenu
  );
});

bot.help(async (ctx) => {
  await ctx.replyWithMarkdown(
    `📚 *Yordam*\n\n` +
    `📊 *Yangi savdo* — yangi spot yoki futures savdo kiritish\n` +
    `📁 *Mening kanallarim* — kanal ulash va boshqarish\n` +
    `📈 *Tahlil* — savdolaringiz tahlili\n` +
    `📋 *Barcha savdolar* — barcha savdolar ro'yxati\n` +
    `🌅 *Bugungi dars* — treyder xatolari darsi\n\n` +
    `💡 *Maslahat:* Har bir savdoni kiritganda xatolar va to'g'ri qilganlarni ham yozing — bu sizning rivojlanishingizni tezlashtiradi!`,
    mainMenu
  );
});

// ===== ASOSIY XABAR HANDLERI =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;
  const state = getState(userId);

  // ---- BOSH MENU ----
  if (text === '🔙 Orqaga' || text === '🔙 Bosh menu') {
    clearState(userId);
    return ctx.reply('🏠 Bosh menu:', mainMenu);
  }

  // ---- YANGI SAVDO ----
  if (text === '📊 Yangi savdo') {
    setState(userId, { step: 'select_trade_type', data: {} });
    return ctx.replyWithMarkdown('📊 *Savdo turini tanlang:*', tradeTypeKeyboard);
  }

  if (text === '📈 Spot savdo' && state.step === 'select_trade_type') {
    setState(userId, { step: 'spot_0', type: 'spot', data: {} });
    return ctx.replyWithMarkdown(SPOT_STEPS[0].question, Markup.keyboard([['🔙 Orqaga']]).resize());
  }

  if (text === '⚡ Futures savdo' && state.step === 'select_trade_type') {
    setState(userId, { step: 'futures_0', type: 'futures', data: {} });
    return ctx.replyWithMarkdown(FUTURES_STEPS[0].question, FUTURES_STEPS[0].keyboard || Markup.keyboard([['🔙 Orqaga']]).resize());
  }

  // ---- SPOT FLOW ----
  if (state.step && state.step.startsWith('spot_') && state.step !== 'spot_confirm') {
    const stepIndex = parseInt(state.step.replace('spot_', ''));
    const currentStep = SPOT_STEPS[stepIndex];
    const key = currentStep.key;

    let value = text === '⏭️ O\'tkazib yuborish' ? '' : text;
    if (key.includes('date')) value = parseDate(value);

    if (key === 'entry_price' || key === 'exit_price' || key === 'amount') {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        return ctx.reply('❌ Iltimos, to\'g\'ri raqam kiriting!');
      }
      value = num;
    }

    const newData = { ...state.data, [key]: value };

    if (stepIndex < SPOT_STEPS.length - 1) {
      setState(userId, { step: `spot_${stepIndex + 1}`, type: 'spot', data: newData });
      const next = SPOT_STEPS[stepIndex + 1];
      return ctx.replyWithMarkdown(next.question, next.keyboard || Markup.keyboard([['⏭️ O\'tkazib yuborish'], ['🔙 Orqaga']]).resize());
    } else {
      // Barcha ma'lumot to'plandi - hisoblash
      newData[key] = value;
      const { profitLoss, profitPercent } = calculateSpotPnL(
        newData.entry_price, newData.exit_price, newData.amount
      );
      newData.profit_loss = profitLoss;
      newData.profit_percent = profitPercent;

      setState(userId, { step: 'spot_confirm', type: 'spot', data: newData });
      const preview = spotTradeTemplate(newData);
      await ctx.replyWithMarkdown('👀 *Ko\'rib chiqing:*\n\n' + preview, confirmKeyboard);
    }
    return;
  }

  // ---- FUTURES FLOW ----
  if (state.step && state.step.startsWith('futures_') && state.step !== 'futures_confirm') {
    const stepIndex = parseInt(state.step.replace('futures_', ''));
    const currentStep = FUTURES_STEPS[stepIndex];
    const key = currentStep.key;

    let value = text === '⏭️ O\'tkazib yuborish' ? '' : text;

    if (key === 'direction') {
      if (text === '🟢 LONG') value = 'long';
      else if (text === '🔴 SHORT') value = 'short';
      else return ctx.reply('❌ LONG yoki SHORT tanlang!', directionKeyboard);
    }

    if (key.includes('date')) value = parseDate(value);

    if (key === 'entry_price' || key === 'exit_price' || key === 'amount' || key === 'leverage') {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        return ctx.reply('❌ Iltimos, to\'g\'ri raqam kiriting!');
      }
      value = num;
    }

    const newData = { ...state.data, [key]: value };

    if (stepIndex < FUTURES_STEPS.length - 1) {
      setState(userId, { step: `futures_${stepIndex + 1}`, type: 'futures', data: newData });
      const next = FUTURES_STEPS[stepIndex + 1];
      const kb = next.keyboard || (key === 'direction' ? Markup.keyboard([['🔙 Orqaga']]).resize() : Markup.keyboard([['⏭️ O\'tkazib yuborish'], ['🔙 Orqaga']]).resize());
      return ctx.replyWithMarkdown(next.question, kb);
    } else {
      newData[key] = value;
      const { profitLoss, profitPercent } = calculateFuturesPnL(
        newData.entry_price, newData.exit_price, newData.amount, newData.leverage, newData.direction
      );
      newData.profit_loss = profitLoss;
      newData.profit_percent = profitPercent;

      setState(userId, { step: 'futures_confirm', type: 'futures', data: newData });
      const preview = futuresTradeTemplate(newData);
      await ctx.replyWithMarkdown('👀 *Ko\'rib chiqing:*\n\n' + preview, confirmKeyboard);
    }
    return;
  }

  // ---- TASDIQLASH ----
  if (state.step === 'spot_confirm' || state.step === 'futures_confirm') {
    if (text === '✅ Tasdiqlash') {
      const tradeData = {
        user_id: userId,
        type: state.type,
        direction: state.data.direction || null,
        token: state.data.token.toUpperCase(),
        leverage: state.data.leverage || 1,
        entry_price: state.data.entry_price,
        entry_date: state.data.entry_date,
        exit_price: state.data.exit_price,
        exit_date: state.data.exit_date,
        amount: state.data.amount,
        profit_loss: state.data.profit_loss,
        profit_percent: state.data.profit_percent,
        correct_actions: state.data.correct_actions || null,
        mistakes: state.data.mistakes || null,
        notes: state.data.notes || null
      };

      const tradeId = await saveTrade(tradeData);

      // Kanalga yuborish
      const template = state.type === 'spot'
        ? spotTradeTemplate(tradeData)
        : futuresTradeTemplate(tradeData);

      const msgId = await postToChannel(ctx, userId, state.type, template);
      if (msgId) await updateTradeMessageId(tradeId, msgId);

      const channelKey = state.type === 'spot' ? 'spot_channel' : 'futures_channel';
      const hasChannel = await getSetting(userId, channelKey);

      const resultMsg = state.data.profit_loss >= 0
        ? `🎉 *Savdo saqlandi!* +${state.data.profit_loss.toFixed(2)} USDT`
        : `💾 *Savdo saqlandi!* ${state.data.profit_loss.toFixed(2)} USDT`;

      clearState(userId);
      await ctx.replyWithMarkdown(
        resultMsg + (hasChannel ? '\n✅ Kanalga yuborildi!' : '\n⚠️ Kanal ulanmagan. Kanal ulash uchun "Mening kanallarim" bo\'limiga o\'ting.'),
        mainMenu
      );
      return;
    }

    if (text === '✏️ Qayta kiritish') {
      clearState(userId);
      return ctx.reply('🔄 Qaytadan boshlash:', tradeTypeKeyboard);
    }
    return;
  }

  // ---- KANALLAR ----
  if (text === '📁 Mening kanallarim') {
    const spotCh = await getSetting(userId, 'spot_channel');
    const futuresCh = await getSetting(userId, 'futures_channel');
    const spotName = await getSetting(userId, 'spot_channel_name');
    const futuresName = await getSetting(userId, 'futures_channel_name');

    setState(userId, { step: 'channels_menu' });
    return ctx.replyWithMarkdown(
      `📁 *Mening kanallarim*\n\n` +
      `📈 *Spot kanali:* ${spotCh ? `✅ ${spotName || spotCh}` : '❌ Ulanmagan'}\n` +
      `⚡ *Futures kanali:* ${futuresCh ? `✅ ${futuresName || futuresCh}` : '❌ Ulanmagan'}\n\n` +
      `Qaysi kanalni sozlashni xohlaysiz?`,
      channelMenu
    );
  }

  if ((text === '📈 Spot kanali' || text === '⚡ Futures kanali') && state.step === 'channels_menu') {
    const chType = text === '📈 Spot kanali' ? 'spot' : 'futures';
    setState(userId, { step: 'awaiting_channel', channelType: chType });
    return ctx.reply(
      `📢 ${text} ni ulash\n\n` +
      `Quyidagilardan birini bajaring:\n` +
      `1️⃣ Kanal username ni yuboring (misol: @mening_kanal)\n` +
      `2️⃣ Kanal ID sini yuboring (misol: -1001234567890)\n\n` +
      `Muhim: Bot kanalda ADMIN bo'lishi kerak!\n` +
      `Bot kanalga qo'shib, admin qilib, keyin username yuboring.`,
      Markup.keyboard([['🔙 Orqaga']]).resize()
    );
  }

  if (state.step === 'awaiting_channel') {
    let channelId = text.trim();
    // @username ni ID ga aylantirish
    if (!channelId.startsWith('-') && !channelId.startsWith('@')) {
      channelId = '@' + channelId;
    }

    try {
      // Test message
      const testMsg = await ctx.telegram.sendMessage(channelId,
        `✅ *Kanal muvaffaqiyatli ulandi!*\n\n🤖 Crypto Trade Bot endi bu kanalga savdolarni yuborib boradi.`,
        { parse_mode: 'Markdown' }
      );

      const key = state.channelType === 'spot' ? 'spot_channel' : 'futures_channel';
      const nameKey = state.channelType === 'spot' ? 'spot_channel_name' : 'futures_channel_name';

      await setSetting(userId, key, channelId);
      await setSetting(userId, nameKey, channelId);

      // Test xabarni o'chirish (ixtiyoriy)
      try { await ctx.telegram.deleteMessage(channelId, testMsg.message_id); } catch {}

      clearState(userId);
      await ctx.replyWithMarkdown(
        `✅ *${state.channelType === 'spot' ? 'Spot' : 'Futures'} kanal muvaffaqiyatli ulandi!*\n\n` +
        `📢 Kanal: \`${channelId}\`\n\n` +
        `Endi yangi savdolar bu kanalga avtomatik yuboriladi.`,
        mainMenu
      );
    } catch (e) {
      return ctx.replyWithMarkdown(
        `❌ *Xato!* Kanalga ulanib bo'lmadi.\n\n` +
        `*Sabablar:*\n` +
        `• Bot kanalga admin qilib qo'shilmagan\n` +
        `• Username noto'g'ri kiritilgan\n` +
        `• Kanal mavjud emas\n\n` +
        `Qayta urinib ko'ring yoki boshqa kanal kiriting.`
      );
    }
    return;
  }

  // ---- TAHLIL ----
  if (text === '📈 Tahlil') {
    setState(userId, { step: 'analysis_menu' });
    return ctx.replyWithMarkdown('📈 *Tahlil bo\'limiga xush kelibsiz!*\nQaysi davrni tahlil qilmoqchisiz?', analysisMenu);
  }

  if (text === '📅 Bugungi tahlil') {
    const trades = await getTodayTrades(userId);
    const stats = getTradeStats(trades);
    const date = moment().format('DD.MM.YYYY');
    const msg = dailyAnalysisTemplate(stats, trades, date);
    await ctx.replyWithMarkdown(msg);
    if (stats && stats.total > 0) {
      await sendAnalysisToChannels(ctx, userId, msg);
      await ctx.reply('✅ Tahlil kanallarga ham yuborildi!');
    }
    return;
  }

  if (text === '📆 Haftalik tahlil') {
    const trades = await getWeekTrades(userId);
    const stats = getTradeStats(trades);
    const weekStr = `${moment().subtract(6, 'days').format('DD.MM')} - ${moment().format('DD.MM.YYYY')}`;
    const msg = weeklyAnalysisTemplate(stats, trades, weekStr);
    await ctx.replyWithMarkdown(msg);
    if (stats && stats.total > 0) {
      await sendAnalysisToChannels(ctx, userId, msg);
      await ctx.reply('✅ Haftalik tahlil kanallarga yuborildi!');
    }
    return;
  }

  if (text === '🗓️ Oylik tahlil') {
    const trades = await getMonthTrades(userId);
    const stats = getTradeStats(trades);
    const monthStr = moment().format('MMMM YYYY');
    const msg = monthlyAnalysisTemplate(stats, trades, monthStr);
    await ctx.replyWithMarkdown(msg);
    if (stats && stats.total > 0) {
      await sendAnalysisToChannels(ctx, userId, msg);
      await ctx.reply('✅ Oylik tahlil kanallarga yuborildi!');
    }
    return;
  }

  if (text === '📊 Umumiy statistika') {
    const trades = await getAllTrades(userId);
    const stats = getTradeStats(trades);
    if (!stats) return ctx.reply('📭 Hali hech qanday savdo yo\'q.');

    const spotCount = trades.filter(t => t.type === 'spot').length;
    const futuresCount = trades.filter(t => t.type === 'futures').length;
    const spotPnL = trades.filter(t => t.type === 'spot').reduce((s, t) => s + (t.profit_loss || 0), 0);
    const futuresPnL = trades.filter(t => t.type === 'futures').reduce((s, t) => s + (t.profit_loss || 0), 0);

    return ctx.replyWithMarkdown(
      `📊 *Umumiy Statistika*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Jami:*\n` +
      `├ Barcha savdolar: ${stats.total} ta\n` +
      `├ 📈 Spot: ${spotCount} ta (${spotPnL >= 0 ? '+' : ''}${spotPnL.toFixed(2)} USDT)\n` +
      `├ ⚡ Futures: ${futuresCount} ta (${futuresPnL >= 0 ? '+' : ''}${futuresPnL.toFixed(2)} USDT)\n` +
      `├ ✅ Foydali: ${stats.profitable} ta\n` +
      `├ ❌ Zarar: ${stats.losing} ta\n` +
      `└ 🎯 Win rate: ${stats.winRate}%\n\n` +
      `💰 *Moliyaviy:*\n` +
      `├ Jami P&L: *${stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)} USDT*\n` +
      `├ O'rtacha/savdo: ${parseFloat(stats.avgPnL) >= 0 ? '+' : ''}${stats.avgPnL} USDT\n` +
      `└ Jami hajm: ${stats.totalInvested.toFixed(2)} USDT\n\n` +
      (stats.topToken ? `🥇 *Top token:* #${stats.topToken.name} (${stats.topToken.count} savdo, ${stats.topToken.pnl >= 0 ? '+' : ''}${stats.topToken.pnl.toFixed(2)} USDT)\n` : '') +
      `\n🏆 *Best trade:* ${stats.bestTrade ? `#${stats.bestTrade.token} → +${stats.bestTrade.profit_loss.toFixed(2)} USDT` : 'yo\'q'}\n` +
      `📉 *Worst trade:* ${stats.worstTrade ? `#${stats.worstTrade.token} → ${stats.worstTrade.profit_loss.toFixed(2)} USDT` : 'yo\'q'}`
    );
  }

  // ---- BARCHA SAVDOLAR ----
  if (text === '📋 Barcha savdolar') {
    const trades = await getAllTrades(userId);
    if (trades.length === 0) {
      return ctx.reply('📭 Hali hech qanday savdo yo\'q.\n\n📊 "Yangi savdo" tugmasini bosib birinchi savdoni kiriting!', mainMenu);
    }

    const recent = trades.slice(0, 10);
    let msg = `📋 *So'nggi ${recent.length} ta savdo:*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    recent.forEach((t, i) => {
      const emoji = t.profit_loss >= 0 ? '📈' : '📉';
      const typeEmoji = t.type === 'spot' ? '📊' : '⚡';
      const pnl = t.profit_loss >= 0 ? `+${t.profit_loss.toFixed(2)}` : t.profit_loss.toFixed(2);
      msg += `${i + 1}. ${typeEmoji} *#${t.token}* ${t.type === 'futures' ? `(${t.direction?.toUpperCase()} ${t.leverage}x)` : ''}\n`;
      msg += `   ${emoji} ${pnl} USDT (${t.profit_percent >= 0 ? '+' : ''}${t.profit_percent?.toFixed(1)}%)\n`;
      msg += `   📅 ${t.entry_date} → ${t.exit_date}\n\n`;
    });

    if (trades.length > 10) msg += `_...va yana ${trades.length - 10} ta savdo_`;
    return ctx.replyWithMarkdown(msg);
  }

  // ---- BUGUNGI DARS ----
  if (text === '🌅 Bugungi dars') {
    const quote = getDailyQuote();
    const msg = quoteTemplate(quote);
    return ctx.replyWithMarkdown(msg);
  }

  // ---- MA'LUMOT ----
  if (text === 'ℹ️ Ma\'lumot') {
    return ctx.replyWithMarkdown(
      `ℹ️ *Crypto Trade Bot haqida*\n\n` +
      `*Spot savdo qo'llanmasi:*\n` +
      `• Token: Tanganing belgisi (BTC, ETH...)\n` +
      `• Kirish narxi: Siz olgandagi narx\n` +
      `• Chiqish narxi: Siz sotgandagi narx\n` +
      `• Miqdor: Qancha USDT bilan savdo qildingiz\n\n` +
      `*Futures qo'llanmasi:*\n` +
      `• LONG: Narx ko'tarilishiga o'ynash\n` +
      `• SHORT: Narx tushishiga o'ynash\n` +
      `• Leverage: Kuchaytirgich (masalan 10x)\n` +
      `• Pozitsiya: USDT hajmi\n\n` +
      `*P&L hisoblash:*\n` +
      `• Spot: (Chiqish - Kirish) / Kirish × Miqdor\n` +
      `• Futures: Yo'nalishga qarab × Leverage\n\n` +
      `*Kanal ulash:*\n` +
      `1. Kanal yarating\n` +
      `2. Botni kanalga admin qilib qo'shing\n` +
      `3. "Mening kanallarim" → kanal username kiriting\n\n` +
      `*Avtomatik tahlil:*\n` +
      `• ⏰ 23:55 — Kunlik tahlil\n` +
      `• 📅 Yakshanba 22:00 — Haftalik tahlil\n` +
      `• 🗓️ Har oy 1-kuni — Oylik tahlil\n` +
      `• 🌅 Har kuni 08:00 — Treyder darsi\n`
    );
  }
});

// ===== CRON JOBS (AVTOMATIK TAHLIL) =====
// Kunlik tahlil - har kuni 23:55 da
cron.schedule('55 23 * * *', async () => {
  console.log('⏰ Kunlik tahlil yuborilmoqda...');
  // Bu yerda barcha foydalanuvchilar uchun yuboring
  // (oddiy foydalanuvchi uchun manual trigger ham bor)
});

// Bugungi motivatsion dars - har kuni 08:00 da
cron.schedule('0 8 * * *', async () => {
  console.log('🌅 Bugungi dars yuborilmoqda...');
});

// ===== GLOBAL ERROR HANDLER =====
bot.catch((err, ctx) => {
  console.error('Bot xatosi:', err);
  ctx.reply('⚠️ Xato yuz berdi. Iltimos qayta urinib ko\'ring yoki /start bosing.').catch(() => {});
});

// ===== BOTNI ISHGA TUSHIRISH =====
initDB().then(() => {
  bot.launch({
    dropPendingUpdates: true
  }).then(() => {
    console.log('✅ Crypto Trade Bot ishga tushdi!');
    console.log(`🤖 Bot: @${bot.botInfo?.username}`);
  }).catch(err => {
    console.error('❌ Bot ishga tushmadi:', err.message);
    process.exit(1);
  });
}).catch(err => {
  console.error('❌ Turso DB ulanmadi:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
