require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const moment = require('moment-timezone');
const TZ = 'Asia/Tashkent';

const {
  db, initDB, saveTrade,
  getOpenPositions, getOpenPositionsGrouped,
  closeTokenPositions, getTokenAllocation, getTotalBoughtForToken,
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
const confirmKb = Markup.keyboard([['✅ Tasdiqlash', '❌ Bekor qilish']]).resize();
const analysisKb = Markup.keyboard([
  ['📅 Bugungi', '📆 Haftalik'],
  ['🗓 Oylik', '📊 Umumiy'],
  ['🔙 Orqaga']
]).resize();

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
  try { await ctx.telegram.sendMessage(ch, text); } catch {}
}

// ===== OCHIQ POZITSIYALAR RO'YXATI KLAVIATURASI =====
function buildPositionsKeyboard(positions) {
  // positions — guruhlangan (token bo'yicha)
  const rows = positions.map(p => {
    const count = p.buy_count > 1 ? ` (${p.buy_count}x xarid)` : '';
    return [`${p.token} — $${Number(p.total_amount).toFixed(0)} USDT${count}`];
  });
  rows.push(['🔙 Orqaga']);
  return Markup.keyboard(rows).resize();
}

// ===== 24 SOATLIK TEKSHIRUV =====
async function checkOpenPositions(telegramId) {
  const positions = await getOpenPositions(telegramId);
  if (positions.length === 0) return;

  for (const pos of positions) {
    const openedAgo = moment().tz(TZ).diff(moment(pos.created_at), 'hours');
    if (openedAgo < 23) continue;

    try {
      await bot.telegram.sendMessage(
        telegramId,
        `🔔 Ochiq pozitsiya tekshiruvi\n\n` +
        `🪙 Token: #${pos.token}\n` +
        `💵 Narx: $${pos.price}\n` +
        `💰 Miqdor: $${pos.amount} USDT\n` +
        `📅 Olingan: ${pos.created_at?.substring(0, 16)}\n\n` +
        `Bu tokenni sotdingizmi?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Ha, sotdim', `sold_${pos.id}_${pos.token}`)],
          [Markup.button.callback('❌ Yo\'q, hali', `holding_${pos.id}_${pos.token}`)]
        ])
      );
    } catch (e) { console.error('24h xato:', e.message); }
  }
}

// ===== CALLBACK (inline tugmalar) =====
bot.on('callback_query', async ctx => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();

  if (data.startsWith('sold_')) {
    const parts = data.split('_');
    const tradeId = parseInt(parts[1]);
    const token = parts.slice(2).join('_');
    setState(userId, { step: 'notify_sell_profit', tradeId, token });
    return ctx.reply(`💰 #${token} dan qancha foyda/zarar bo'ldi? (USDT)\nMisol: 45.5 yoki -12`, backKb);
  }

  if (data.startsWith('holding_')) {
    const parts = data.split('_');
    const tradeId = parseInt(parts[1]);
    const token = parts.slice(2).join('_');
    setState(userId, { step: 'notify_holding_reason', tradeId, token });
    return ctx.reply(
      `📝 #${token} ni nima uchun sotmadingiz?`,
      Markup.keyboard([
        ['Hali TP ga yetmadi'], ['Yana xarid qilmoqchiman'],
        ['Uzoq muddatli ushlayman'], ['Boshqa sabab'],
        ['🔙 Orqaga']
      ]).resize()
    );
  }
});

// ===== /start =====
bot.start(async ctx => {
  clearState(ctx.from.id);
  await setSetting(ctx.from.id, 'chat_id', ctx.from.id.toString());
  await ctx.replyWithMarkdown(
    `👋 Salom, *${ctx.from.first_name}*!\n\n` +
    `📒 Spot savdolaringizni kuzatib, kanalingizga post qiladi.\n\nBoshlash uchun 👇`,
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

    const positions = await getOpenPositions(userId);
    const pos = positions.find(p => p.id === state.tradeId);
    if (!pos) { clearState(userId); return ctx.reply('❌ Pozitsiya topilmadi.', mainMenu); }

    await saveTrade({ user_id: userId, action: 'sell', token: pos.token, price: pos.price, profit: state.profit, photo_file_id: photoId, status: 'closed' });
    await closeTokenPositions(userId, pos.token);

    const postText = sellTemplate({ token: pos.token, price: pos.price, profit: state.profit });
    await postToChannel(ctx, userId, postText, photoId);
    clearState(userId);
    return ctx.reply('✅ Sotish qayd etildi va kanalga yuborildi!', mainMenu);
  }

  if (state.step === 'notify_holding_reason') {
    setState(userId, { ...state, step: 'notify_holding_photo', reason: text });
    return ctx.reply(
      '📸 Hozirgi holat screenshotini yuboring (ixtiyoriy)\n\n' +
      '⚠️ Narq qaytadi deb uzoq kutish katta risk! Kapitalingizni himoya qiling.',
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

    const totalBought = await getTotalBoughtForToken(userId, pos.token);
    const postText = holdingTemplate({
      token: pos.token, price: pos.price,
      totalBought, allocated: pos.allocated, reason: state.reason
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
    // Mavjud ochiq pozitsiyalarni ko'rsatamiz
    const openPositions = await getOpenPositionsGrouped(userId);

    if (openPositions.length > 0) {
      // Eski tokenlar + yangi token
      const rows = openPositions.map(p => {
        const count = p.buy_count > 1 ? ` (${p.buy_count}x)` : '';
        return [`${p.token} — jami $${Number(p.total_amount).toFixed(0)}${count}`];
      });
      rows.push(['➕ Yangi token']);
      rows.push(['🔙 Orqaga']);

      setState(userId, { step: 'buy_select_token', openPositions });
      return ctx.reply(
        '🟢 OLISH\n\nMavjud tokendan qo\'shish yoki yangi token:',
        Markup.keyboard(rows).resize()
      );
    } else {
      // Hech qanday ochiq pozitsiya yo'q — to'g'ri token so'rab ketamiz
      setState(userId, { step: 'buy_token', data: {} });
      return ctx.reply('🪙 Qaysi tokenni oldingiz?\n(Misol: BTC, ETH, SOL)', backKb);
    }
  }

  // Mavjud tokendan tanlash yoki yangi
  if (state.step === 'buy_select_token') {
    if (text === '➕ Yangi token') {
      setState(userId, { step: 'buy_token', data: {} });
      return ctx.reply('🪙 Yangi token nomini kiriting:\n(Misol: BTC, ETH, SOL)', backKb);
    }

    // Mavjud tokenni tanladik
    const token = text.split(' — ')[0]?.trim();
    const pos = state.openPositions?.find(p => p.token === token);
    if (!pos) return ctx.reply('Ro\'yxatdan tanlang yoki "Yangi token" bosing');

    setState(userId, { step: 'buy_price', data: { token, existingToken: true } });
    return ctx.reply(`💵 #${token} ni qancha narxda oldingiz? ($)`, backKb);
  }

  // Yangi token nomi
  if (state.step === 'buy_token') {
    const token = text.trim().toUpperCase();
    setState(userId, { ...state, step: 'buy_price', data: { token } });
    return ctx.reply(`💵 #${token} ni qancha narxda oldingiz? ($)`, backKb);
  }

  // Narx
  if (state.step === 'buy_price') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ To\'g\'ri narx kiriting!');
    setState(userId, { ...state, step: 'buy_amount', data: { ...state.data, price } });
    return ctx.reply('💰 Bu safar necha $ lik oldingiz? (USDT)\nMisol: 150', backKb);
  }

  // Miqdor
  if (state.step === 'buy_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ To\'g\'ri miqdor kiriting!');

    const { token } = state.data;
    const prevAllocated = await getTokenAllocation(userId, token);

    if (prevAllocated) {
      // Kapital allaqachon belgilangan — validatsiya
      const alreadyBought = await getTotalBoughtForToken(userId, token);
      const newTotal = alreadyBought + amount;

      if (newTotal > prevAllocated) {
        const over = (newTotal - prevAllocated).toFixed(2);
        setState(userId, { ...state, step: 'buy_fomo_confirm', data: { ...state.data, amount, allocated: prevAllocated, totalBought: newTotal, overBudget: true, overBy: over } });
        return ctx.reply(
          `🚫 FOMOGA BERILMANG!\n\n` +
          `📦 Ajratilgan kapital: $${prevAllocated} USDT\n` +
          `📊 Allaqachon olingan: $${alreadyBought} USDT\n` +
          `🆕 Siz kiritayotgan: $${amount} USDT\n` +
          `❌ Ortiqcha: $${over} USDT\n\n` +
          `⚠️ Belgilangan kapitaldan oshib ketadi!\nBaribir davom etasizmi?`,
          Markup.keyboard([['⚠️ Ha, davom etaman'], ['❌ Bekor qilish']]).resize()
        );
      }

      setState(userId, { ...state, step: 'buy_photo', data: { ...state.data, amount, allocated: prevAllocated, totalBought: newTotal } });
      return ctx.reply('📸 Screenshot yuboring (ixtiyoriy)', skipKb);

    } else {
      // Birinchi marta — kapital so'raymiz
      setState(userId, { ...state, step: 'buy_allocated', data: { ...state.data, amount } });
      return ctx.reply(
        `📦 #${token} uchun jami qancha kapital ajratdingiz?\n(Misol: 450)\n\n` +
        `💡 Faqat bir marta so'raladi. Keyingi xaridlarda avtomatik tekshiriladi.`,
        backKb
      );
    }
  }

  // FOMO tasdiq
  if (state.step === 'buy_fomo_confirm') {
    if (text === '⚠️ Ha, davom etaman') {
      setState(userId, { ...state, step: 'buy_photo' });
      return ctx.reply('📸 Screenshot yuboring (ixtiyoriy)\n\n⚠️ Kapitalingizni himoya qiling!', skipKb);
    }
    if (text === '❌ Bekor qilish') { clearState(userId); return ctx.reply('❌ Bekor qilindi.', mainMenu); }
    return;
  }

  // Kapital
  if (state.step === 'buy_allocated') {
    const allocated = parseFloat(text);
    if (isNaN(allocated) || allocated <= 0) return ctx.reply('❌ To\'g\'ri miqdor kiriting!');

    const amount = state.data.amount;
    if (amount > allocated) {
      return ctx.reply(
        `🚫 FOMOGA BERILMANG!\n\n` +
        `Siz $${amount} xarid qilmoqchisiz lekin faqat $${allocated} kapital ajratdingiz!\n\n` +
        `Kapital xariddan katta bo'lishi kerak.\nQayta kiriting:`,
        backKb
      );
    }

    setState(userId, { ...state, step: 'buy_photo', data: { ...state.data, allocated, totalBought: amount } });
    return ctx.reply('📸 Screenshot yuboring (ixtiyoriy)', skipKb);
  }

  // Screenshot
  if (state.step === 'buy_photo') {
    let photoId = null;
    if (photo) photoId = photo[photo.length - 1].file_id;
    else if (text !== '⏭ O\'tkazish') return ctx.reply('📸 Rasm yuboring yoki o\'tkazib yuboring', skipKb);

    const d = { ...state.data, photo_file_id: photoId };
    const postText = buyTemplate(d);
    const tradeData = { user_id: userId, action: 'buy', token: d.token, price: d.price, amount: d.amount, allocated: d.allocated, photo_file_id: d.photo_file_id, status: 'open' };

    setState(userId, { step: 'buy_confirm', data: tradeData, postText });
    if (photoId) await ctx.replyWithPhoto(photoId, { caption: '👀 Preview:\n\n' + postText });
    else await ctx.reply('👀 Preview:\n\n' + postText);
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
    const positions = await getOpenPositionsGrouped(userId);
    if (positions.length === 0) {
      return ctx.reply('📭 Ochiq pozitsiya yo\'q.\nAvval "OLISH" orqali savdo kiriting.', mainMenu);
    }
    setState(userId, { step: 'sell_select', positions });
    return ctx.reply('🔴 Qaysi tokenni sottingiz?', buildPositionsKeyboard(positions));
  }

  if (state.step === 'sell_select') {
    const token = text.split(' — ')[0]?.trim();
    const pos = state.positions?.find(p => p.token === token);
    if (!pos) return ctx.reply('Ro\'yxatdan tanlang!');

    setState(userId, { step: 'sell_price', selectedToken: token, selectedPos: pos });
    return ctx.reply(`💵 #${token} ni qancha narxda sottingiz? ($)`, backKb);
  }

  if (state.step === 'sell_price') {
    const price = parseFloat(text);
    if (isNaN(price) || price <= 0) return ctx.reply('❌ To\'g\'ri narx kiriting!');
    setState(userId, { ...state, step: 'sell_profit', data: { price } });
    return ctx.reply('💰 Foyda/Zarar miqdori? (USDT)\nMisol: 45.5 yoki -12', backKb);
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

    const token = state.selectedToken;
    const pos = state.selectedPos;
    const d = state.data;
    const tradeData = { user_id: userId, action: 'sell', token, price: d.price, profit: d.profit, photo_file_id: photoId, status: 'closed' };
    const postText = sellTemplate({ token, price: d.price, profit: d.profit });

    setState(userId, { step: 'sell_confirm', data: tradeData, postText, token });
    if (photoId) await ctx.replyWithPhoto(photoId, { caption: '👀 Preview:\n\n' + postText });
    else await ctx.reply('👀 Preview:\n\n' + postText);
    return ctx.reply('Kanalga yuboraymi?', confirmKb);
  }

  if (state.step === 'sell_confirm') {
    if (text === '✅ Tasdiqlash') {
      await saveTrade(state.data);
      await closeTokenPositions(userId, state.token);
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
      `📢 Kanal sozlamalari\n\nHozirgi kanal: ${ch || 'Ulanmagan ❌'}\n\nKanal username yuboring:\nMisol: @mening_kanal\n\nMuhim: Bot kanalda ADMIN bolishi kerak!`,
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
    const msg = dailyTemplate(getTradeStats(trades), trades, moment().tz(TZ).format('DD.MM.YYYY'));
    await ctx.reply(msg); await postAnalysis(ctx, userId, msg); return;
  }
  if (text === '📆 Haftalik') {
    const trades = await getWeekTrades(userId);
    const weekStr = `${moment().tz(TZ).subtract(6, 'days').format('DD.MM')} - ${moment().tz(TZ).format('DD.MM.YYYY')}`;
    const msg = weeklyTemplate(getTradeStats(trades), trades, weekStr);
    await ctx.reply(msg); await postAnalysis(ctx, userId, msg); return;
  }
  if (text === '🗓 Oylik') {
    const trades = await getMonthTrades(userId);
    const msg = monthlyTemplate(getTradeStats(trades), trades, moment().tz(TZ).format('MMMM YYYY'));
    await ctx.reply(msg); await postAnalysis(ctx, userId, msg); return;
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
      `🏆 Best: #${stats.best?.token} (+${stats.best?.profit} USDT)\n` +
      `😬 Worst: #${stats.worst?.token} (${stats.worst?.profit} USDT)\n` +
      (stats.topToken ? `🥇 Top: #${stats.topToken.name} (${stats.topToken.pnl.toFixed(2)} USDT)` : '')
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
      msg += `${i + 1}. ${emoji} #${t.token} $${t.price}`;
      if (t.profit !== null) msg += ` → ${Number(t.profit) > 0 ? '+' : ''}${t.profit} USDT`;
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
cron.schedule('0 10 * * *', async () => {
  console.log('⏰ Ochiq pozitsiyalar tekshirilmoqda...');
  try {
    const r = await db.execute(`SELECT DISTINCT user_id FROM settings WHERE key = 'chat_id'`);
    for (const row of r.rows) await checkOpenPositions(Number(row.user_id));
  } catch (e) { console.error('Cron xato:', e.message); }
}, { timezone: 'Asia/Tashkent' });

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
