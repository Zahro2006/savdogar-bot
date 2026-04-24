require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const moment = require('moment');

const {
  initDB, saveTrade, closePosition,
  getOpenPositions, getTotalBoughtForToken, getTokenAllocation,
  getTodayTrades, getWeekTrades, getMonthTrades, getAllTrades,
  getTradeStats, getSetting, setSetting
} = require('./database');

const { buyTemplate, sellTemplate, holdingTemplate, dailyTemplate, weeklyTemplate, monthlyTemplate } = require('./templates');
const { getDailyQuote } = require('./quotes');

const bot = new Telegraf(process.env.BOT_TOKEN);
const userStates = new Map();

// ===== KLAVIATURALAR =====
const mainMenu = Markup.keyboard([
  ['📊 Yangi savdo', '📁 Kanal sozlamalari'],
  ['📈 Tahlil', '📋 Savdolar tarixi'],
  ['🌅 Bugungi dars']
]).resize();

const tradeTypeKb = Markup.keyboard([['🟢 OLISH', '🔴 SOTISH'], ['🔙 Orqaga']]).resize();
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

// ===== 24 SOATLIK TEKSHIRUV =====
async function checkOpenPositions(telegramId) {
  const positions = await getOpenPositions(telegramId);
  if (positions.length === 0) return;

  for (const pos of positions) {
    const openedAgo = moment().diff(moment(pos.created_at), 'hours');
    if (openedAgo < 23) continue; // 24 soat o'tmagan

    try {
      await bot.telegram.sendMessage(
        telegramId,
        `🔔 Ochiq pozitsiya tekshiruvi\n\n` +
        `🪙 Token: #${pos.token}\n` +
        `💵 Olingan narx: $${pos.price}\n` +
        `💰 Miqdor: $${pos.amount} USDT\n` +
        `📅 Olingan: ${pos.created_at?.substring(0, 16)}\n\n` +
        `Bu tokenni sotdingizmi?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Ha, sotdim', `sold_${pos.id}`)],
          [Markup.button.callback('❌ Yo\'q, hali sotmadim', `holding_${pos.id}`)]
        ])
      );
    } catch (e) {
      console.error('Pozitsiya tekshiruvida xato:', e.message);
    }
  }
}

// ===== CALLBACK QUERY (inline tugmalar) =====
bot.on('callback_query', async ctx => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;

  await ctx.answerCbQuery();

  // HA, sotdim
  if (data.startsWith('sold_')) {
    const tradeId = parseInt(data.replace('sold_', ''));
    setState(userId, { step: 'notify_sell_profit', tradeId });
    await ctx.reply(
      '💰 Qancha foyda/zarar bo\'ldi? (USDT)\nMisol: +45.5 yoki -12',
      backKb
    );
  }

  // YO'Q, hali sotmadim
  if (data.startsWith('holding_')) {
    const tradeId = parseInt(data.replace('holding_', ''));
    setState(userId, { step: 'notify_holding_reason', tradeId });

    const reasons = [
      'Hali TP ga yetmadi', 'Yana xarid qilmoqchiman', 'Uzoq muddatli ushlayman', 'Boshqa sabab'
    ];
    await ctx.reply(
      '📝 Nega sotmadingiz?',
      Markup.keyboard([...reasons.map(r => [r]), ['🔙 Orqaga']]).resize()
    );
  }
});

// ===== START =====
bot.start(async ctx => {
  clearState(ctx.from.id);
  await setSetting(ctx.from.id, 'chat_id', ctx.from.id.toString());
  await ctx.replyWithMarkdown(
    `👋 Salom, *${ctx.from.first_name}*!\n\n` +
    `📒 Spot savdolaringizni kuzatib, kanalingizga post qiladi.\n\n` +
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

  if (text === '🔙 Orqaga') {
    clearState(userId);
    return ctx.reply('🏠 Bosh menu', mainMenu);
  }

  // ========== 24H TEKSHIRUV JAVOBLARI ==========

  // Sotdim — foyda so'rash
  if (state.step === 'notify_sell_profit') {
    const profit = parseFloat(text.replace('+', ''));
    if (isNaN(profit)) return ctx.reply('❌ To\'g\'ri kiriting! Misol: 45.5 yoki -12');
    setState(userId, { ...state, step: 'notify_sell_photo', profit });
    return ctx.reply('📸 Screenshot yuboring (ixtiyoriy)', skipKb);
  }

  if (state.step === 'notify_sell_photo') {
    let photoId = null;
    if (photo) photoId = photo[photo.length - 1].file_id;
    else if (text !== '⏭ O\'tkazish') return ctx.reply('📸 Rasm yuboring yoki o\'tkazing', skipKb);

    // Ochiq pozitsiyani topamiz
    const positions = await getOpenPositions(userId);
    const pos = positions.find(p => p.id === state.tradeId);
    if (!pos) { clearState(userId); return ctx.reply('❌ Pozitsiya topilmadi.', mainMenu); }

    const tradeData = { user_id: userId, action: 'sell', token: pos.token, price: pos.price, profit: state.profit, photo_file_id: photoId, status: 'closed' };
    await saveTrade(tradeData);
    await closePosition(state.tradeId);

    const postText = sellTemplate({ token: pos.token, price: pos.price, profit: state.profit });
    await postToChannel(ctx, userId, postText, photoId);

    clearState(userId);
    return ctx.reply('✅ Sotish qayd etildi va kanalga yuborildi!', mainMenu);
  }

  // Sotmadim — sabab
  if (state.step === 'notify_holding_reason') {
    setState(userId, { ...state, step: 'notify_holding_photo', reason: text });
    return ctx.reply(
      '📸 Hozirgi holat screenshotini yuboring (ixtiyoriy)\n\n' +
      '⚠️ Eslatma: Narx qaytadi deb uzoq kutish katta risk! Kapitalingizni himoya qiling.',
      skipKb
    );
  }

  if (state.step === 'notify_holding_photo') {
    let photoId = null;
    if (photo) photoId = photo[photo.length - 1].file_id;
    else if (text !== '⏭ O\'tkazish') return ctx.reply('📸 Rasm yuboring yoki o\'tkazing', skipKb);

    const positions = await getOpenPositions(userId);
    const pos = positions.find(p => p.id === state.tradeId);
    if (!pos) { clearState(userId); return ctx.reply('❌ Pozitsiya topilmadi.', mainMenu); }

    const postText = holdingTemplate({
      token: pos.token, price: pos.price, amount: pos.amount,
      allocated: pos.allocated, reason: state.reason
    });
    await postToChannel(ctx, userId, postText, photoId);

    clearState(userId);
    return ctx.reply('✅ "Kutilmoqda" post kanalga yuborildi!\n\n🛡 Kapitalingizni himoya qiling!', mainMenu);
  }

  // ========== YANGI SAVDO ==========
  if (text === '📊 Yangi savdo') {
    setState(userId, { step: 'select_type' });
    return ctx.reply('Qaysi savdo?', tradeTypeKb);
  }

  // ===== OLISH FLOW =====
  if (text === '🟢 OLISH' && state.step === 'select_type') {
    setState(userId, { step: 'buy_token', data: {} });
    return ctx.reply('🪙 Qaysi tokenni oldingiz?\n(Misol: BTC, ETH, SOL)', backKb);
  }

  if (state.step === 'buy_token') {
    setState(userId, { ...state, step: 'buy_price', data: { token: text.trim().toUpperCase() } });
    return ctx.reply(`💵 #${text.toUpperCase()} ni qancha narxda oldingiz? ($)`, backKb);
  }

  if (state.step === 'buy_price') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ To\'g\'ri narx kiriting!');
    setState(userId, { ...state, step: 'buy_amount', data: { ...state.data, price } });
    return ctx.reply('💰 Bu safar necha $ lik oldingiz? (USDT)\nMisol: 150', backKb);
  }

  if (state.step === 'buy_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ To\'g\'ri miqdor kiriting!');

    const prevAllocated = await getTokenAllocation(userId, state.data.token);

    if (prevAllocated) {
      // Allaqachon kapital belgilangan — validatsiya
      const alreadyBought = await getTotalBoughtForToken(userId, state.data.token);
      const newTotal = alreadyBought + amount;

      if (newTotal > prevAllocated) {
        const over = (newTotal - prevAllocated).toFixed(2);
        return ctx.reply(
          `🚫 DIQQAT! FOMOGA BERILMANG!\n\n` +
          `📦 Ajratilgan kapital: $${prevAllocated} USDT\n` +
          `📊 Allaqachon olingan: $${alreadyBought} USDT\n` +
          `🆕 Siz kiritmoqchi: $${amount} USDT\n` +
          `❌ Ortiqcha: $${over} USDT\n\n` +
          `⚠️ Bu xarid ajratilgan kapitaldan oshadi!\n` +
          `💡 Belgilangan kapitaldan oshmaslikni tavsiya qilamiz.\n\n` +
          `Baribir davom etishni xohlaysizmi?`,
          Markup.keyboard([
            ['⚠️ Ha, baribir davom etaman'],
            ['❌ Bekor qilish']
          ]).resize()
        );
      }

      setState(userId, { ...state, step: 'buy_photo', data: { ...state.data, amount, allocated: prevAllocated, totalBought: newTotal } });
      return ctx.reply('📸 Screenshot yuboring (ixtiyoriy)', skipKb);
    } else {
      // Birinchi marta — kapital so'raymiz
      setState(userId, { ...state, step: 'buy_allocated', data: { ...state.data, amount } });
      return ctx.reply(
        `📦 #${state.data.token} uchun jami qancha kapital ajratdingiz?\n` +
        `(Misol: 450)\n\n` +
        `💡 Bu bir marta so'raladi. Keyingi xaridlarda avtomatik tekshiriladi.`,
        backKb
      );
    }
  }

  // Kapital kiritilgandan keyin ortiqcha xarid tasdiqi
  if (state.step === 'buy_amount' || (text === '⚠️ Ha, baribir davom etaman' && state.step === 'buy_photo')) {
    // fomo tasdiqlash
  }

  if (text === '⚠️ Ha, baribir davom etaman') {
    setState(userId, { ...state, step: 'buy_photo' });
    return ctx.reply('📸 Screenshot yuboring (ixtiyoriy)\n\n⚠️ Kapitalingizni himoya qiling!', skipKb);
  }

  if (text === '❌ Bekor qilish' && !state.step?.includes('confirm')) {
    clearState(userId);
    return ctx.reply('❌ Bekor qilindi.', mainMenu);
  }

  if (state.step === 'buy_allocated') {
    const allocated = parseFloat(text);
    if (isNaN(allocated) || allocated <= 0) return ctx.reply('❌ To\'g\'ri miqdor kiriting!');

    const amount = state.data.amount;
    if (amount > allocated) {
      return ctx.reply(
        `🚫 FOMOGA BERILMANG!\n\n` +
        `Siz $${amount} xarid qilmoqchisiz, lekin atigi $${allocated} kapital ajratdingiz!\n\n` +
        `⚠️ Kapital xariddan ko'p bo'lishi kerak.\n` +
        `Ajratilgan kapital miqdorini qayta kiriting:`,
        backKb
      );
    }

    setState(userId, { ...state, step: 'buy_photo', data: { ...state.data, allocated, totalBought: amount } });
    return ctx.reply('📸 Screenshot yuboring (ixtiyoriy)', skipKb);
  }

  if (state.step === 'buy_photo') {
    let photoId = null;
    if (photo) photoId = photo[photo.length - 1].file_id;
    else if (text !== '⏭ O\'tkazish') return ctx.reply('📸 Rasm yuboring yoki o\'tkazib yuboring', skipKb);

    const data = { ...state.data, photo_file_id: photoId };
    const postText = buyTemplate(data);
    const tradeData = {
      user_id: userId, action: 'buy', token: data.token,
      price: data.price, amount: data.amount, allocated: data.allocated,
      photo_file_id: data.photo_file_id, status: 'open'
    };

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
      return ctx.reply(msgId ? '✅ Post kanalga yuborildi!' : (ch ? '⚠️ Kanalga yuborib bo\'lmadi.' : '💾 Saqlandi. Kanal ulanmagan.'), mainMenu);
    }
    if (text === '❌ Bekor qilish') { clearState(userId); return ctx.reply('❌ Bekor qilindi.', mainMenu); }
    return;
  }

  // ===== SOTISH FLOW =====
  if (text === '🔴 SOTISH' && state.step === 'select_type') {
    // Ochiq pozitsiyalarni ko'rsatamiz
    const positions = await getOpenPositions(userId);
    if (positions.length === 0) {
      return ctx.reply('📭 Ochiq pozitsiya yo\'q.\nAvval "OLISH" orqali savdo kiriting.', mainMenu);
    }

    const kb = Markup.keyboard([
      ...positions.map(p => [`${p.token} — $${p.price} (${p.amount} USDT)`]),
      ['🔙 Orqaga']
    ]).resize();

    setState(userId, { step: 'sell_select', positions });
    return ctx.reply('🔴 Qaysi tokenni sottingiz?\nRo\'yxatdan tanlang:', kb);
  }

  if (state.step === 'sell_select') {
    // Tokenni aniqlaymiz
    const token = text.split(' — ')[0]?.trim();
    const pos = state.positions?.find(p => p.token === token);
    if (!pos) return ctx.reply('Ro\'yxatdan tanlang!');
    setState(userId, { step: 'sell_price', selectedPos: pos });
    return ctx.reply(`💵 #${token} ni qancha narxda sottingiz? ($)`, backKb);
  }

  if (state.step === 'sell_price') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ To\'g\'ri narx kiriting!');
    setState(userId, { ...state, step: 'sell_profit', data: { price } });
    return ctx.reply('💰 Foyda/Zarar miqdori? (USDT)\nMisol: +45.5 yoki -12', backKb);
  }

  if (state.step === 'sell_profit') {
    const profit = parseFloat(text.replace('+', ''));
    if (isNaN(profit)) return ctx.reply('❌ To\'g\'ri kiriting! Misol: 45.5 yoki -12');
    setState(userId, { ...state, step: 'sell_photo', data: { ...state.data, profit } });
    return ctx.reply('📸 Screenshot yuboring (ixtiyoriy)', skipKb);
  }

  if (state.step === 'sell_photo') {
    let photoId = null;
    if (photo) photoId = photo[photo.length - 1].file_id;
    else if (text !== '⏭ O\'tkazish') return ctx.reply('📸 Rasm yuboring yoki o\'tkazib yuboring', skipKb);

    const pos = state.selectedPos;
    const data = { ...state.data, photo_file_id: photoId };
    const tradeData = { user_id: userId, action: 'sell', token: pos.token, price: data.price, profit: data.profit, photo_file_id: data.photo_file_id, status: 'closed' };
    const postText = sellTemplate({ token: pos.token, price: data.price, profit: data.profit });

    setState(userId, { step: 'sell_confirm', data: tradeData, postText, posId: pos.id });
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
      await closePosition(state.posId);
      const msgId = await postToChannel(ctx, userId, state.postText, state.data.photo_file_id);
      clearState(userId);
      const ch = await getSetting(userId, 'channel');
      return ctx.reply(msgId ? '✅ Post kanalga yuborildi!' : (ch ? '⚠️ Kanalga yuborib bo\'lmadi.' : '💾 Saqlandi. Kanal ulanmagan.'), mainMenu);
    }
    if (text === '❌ Bekor qilish') { clearState(userId); return ctx.reply('❌ Bekor qilindi.', mainMenu); }
    return;
  }

  // ===== KANAL =====
  if (text === '📁 Kanal sozlamalari') {
    const ch = await getSetting(userId, 'channel');
    setState(userId, { step: 'awaiting_channel' });
    return ctx.reply(
      `📢 Kanal sozlamalari\n\nHozirgi kanal: ${ch ? ch : 'Ulanmagan ❌'}\n\nKanal username yuboring:\nMisol: @mening_kanal\n\nMuhim: Bot kanalda ADMIN bolishi kerak!`,
      backKb
    );
  }

  if (state.step === 'awaiting_channel') {
    let ch = text.trim();
    if (!ch.startsWith('@') && !ch.startsWith('-')) ch = '@' + ch;
    try {
      const msg = await ctx.telegram.sendMessage(ch, '✅ Kanal muvaffaqiyatli ulandi!');
      await ctx.telegram.deleteMessage(ch, msg.message_id).catch(() => {});
      await setSetting(userId, 'channel', ch);
      clearState(userId);
      return ctx.reply(`✅ Kanal ulandi: ${ch}`, mainMenu);
    } catch {
      return ctx.reply('❌ Ulab bolmadi. Bot kanalda admin ekanini tekshiring.', backKb);
    }
  }

  // ===== TAHLIL =====
  if (text === '📈 Tahlil') { setState(userId, { step: 'analysis' }); return ctx.reply('📈 Tahlil', analysisKb); }

  if (text === '📅 Bugungi') {
    const trades = await getTodayTrades(userId);
    const stats = getTradeStats(trades);
    const msg = dailyTemplate(stats, trades, moment().format('DD.MM.YYYY'));
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
    if (!stats) return ctx.reply(`📊 Umumiy\n\n📥 Xaridlar: ${buyCount} ta\n📤 Sotuvlar: ${sellCount} ta\n\n💤 Hali yopilgan savdo yo'q.`);

    const pnlSign = stats.totalPnL >= 0 ? '+' : '';
    return ctx.reply(
      `📊 Umumiy statistika\n\n📥 Xaridlar: ${buyCount} ta\n📤 Sotuvlar: ${sellCount} ta\n\n` +
      `✅ Foydali: ${stats.profitable} ta\n❌ Zararli: ${stats.losing} ta\n🎯 Win rate: ${stats.winRate}%\n\n` +
      `💰 Jami foyda: ${pnlSign}${stats.totalPnL.toFixed(2)} USDT\n📈 O'rtacha: ${stats.avgPnL > 0 ? '+' : ''}${stats.avgPnL} USDT\n\n` +
      `🏆 Best: #${stats.best?.token} (+${stats.best?.profit} USDT)\n😬 Worst: #${stats.worst?.token} (${stats.worst?.profit} USDT)\n` +
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
      msg += `${i + 1}. ${emoji} #${t.token} — ${t.action === 'buy' ? 'Olish' : 'Sotish'} $${t.price}`;
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

// ===== CRON JOBS =====
// Har 24 soatda ochiq pozitsiyalarni tekshirish — har kuni 10:00
cron.schedule('0 10 * * *', async () => {
  console.log('⏰ Ochiq pozitsiyalar tekshirilmoqda...');
  // Barcha foydalanuvchilarni settings dan topamiz
  try {
    const { db } = require('./database');
    const r = await db.execute(`SELECT DISTINCT user_id FROM settings WHERE key = 'chat_id'`);
    for (const row of r.rows) {
      await checkOpenPositions(Number(row.user_id));
    }
  } catch (e) { console.error('Cron xato:', e.message); }
});

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
