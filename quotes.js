// 50 ta mashhur treyderlar xatosi - har kuni bittasi yuboriladi
const TRADING_MISTAKES = [
  {
    emoji: "💸",
    title: "Stop-loss qo'ymaslik",
    text: "Ko'plab yangi treyderlar stop-loss qo'ymaydi. Warren Buffett aytganidek: *\"Birinchi qoida — pulni yo'qotma. Ikkinchi qoida — birinchi qoidani unutma.\"* Har doim stop-loss qo'y!"
  },
  {
    emoji: "🎰",
    title: "Overtrading — haddan ortiq savdo",
    text: "Kuniga 10-20 ta pozitsiya ochish — bu savdo emas, bu qimorbozlik. Eng yaxshi treyderlar oyiga 5-10 ta sifatli signal kutadi. *Sabr — eng kuchli strategiya.*"
  },
  {
    emoji: "😤",
    title: "Yo'qotishdan keyin qasos olish",
    text: "Minus bo'lgandan so'ng darhol ikki baravar katta pozitsiya ochish — bu eng xavfli holat. Treyding psixologiyasi: *Yo'qotganda emas, aniq signal bo'lganda savdo qil.*"
  },
  {
    emoji: "📰",
    title: "Faqat yangiliklarga ishonish",
    text: "\"Elon Musk tweet qildi, DOGE olaman!\" — bu strategiya emas. Ko'plab treyderlar yangilikni ko'rishguncha narx allaqachon harakat qilib bo'lgan. *Narx — eng yaxshi yangilik.*"
  },
  {
    emoji: "🏦",
    title: "Kapitalning 100%ini bir savdoga qo'yish",
    text: "Hech qachon barcha pulingni bir pozitsiyaga solma. Professional treyderlar har savdoga kapitalning 1-5%ini xavf qiladi. *Diversifikatsiya — himoya qalqoni.*"
  },
  {
    emoji: "📈",
    title: "FOMO — o'tkazib yuborish qo'rquvi",
    text: "Narx 50% ko'tarilib ketganda yugurish — kech qolganlik belgisi. Jesse Livermore: *\"Bozor har doim imkoniyat beradi, sabr bilan kutish kerak.\"*"
  },
  {
    emoji: "🔮",
    title: "Bozorni bashorat qilishga urinish",
    text: "\"Bitcoin 100K ga boradi\" yoki \"Hamma narsa qulab tushadi\" degan bashoratlar noto'g'ri. *Bozor hech kimga qarzdor emas. Tendentsiyaga ergash, bashorat qilma.*"
  },
  {
    emoji: "💊",
    title: "Zarar beruvchi pozitsiyani ushlab turish",
    text: "\"Narx qaytib keladi\" deb -30%, -50%, -80% ga tushirish — bu eng katta xato. *Kichik yo'qotishni qabul qil, katta yo'qotishni kutma.*"
  },
  {
    emoji: "🧪",
    title: "Strategiysiz savdo",
    text: "\"Ko'tarilayotgan ko'rinadi, olay\" — bu strategiya emas. Har bir savdoda kirish, chiqish, stop-loss va maqsad narxi aniq bo'lishi kerak. *Plan bo'lmasa, muvaffaqiyat bo'lmaydi.*"
  },
  {
    emoji: "👥",
    title: "Telegram guruhlariga ko'r-ko'rona ishonish",
    text: "\"VIP signallar\" guruhlarining 90%i firibgarlik. Ular seni pump-dump sxemalarida ishlatadi. *Boshqaning signali bilan boy bo'lmaysan — o'zingning tajribang asosida savdo qil.*"
  },
  {
    emoji: "⚡",
    title: "Kuchli leveraj ishlatish",
    text: "50x, 100x leveraj bilan savdo qilish — bu lotereya. Bir necha foizlik harakat barcha kapitalingni yo'q qilishi mumkin. *Yangi boshlovchilar uchun maksimum 5-10x.*"
  },
  {
    emoji: "📊",
    title: "Texnik tahlilni o'rganmaslik",
    text: "Grafiklardagi asosiy naqshlarni bilmasdan savdo qilish ko'r holda haydashga o'xshaydi. *Support, resistance, trend — bularni bilmasang, bozor seni biladi.*"
  },
  {
    emoji: "🌙",
    title: "Tunda uyqusiz savdo qilish",
    text: "Charchagan miyada qabul qilingan qarorlar 80% noto'g'ri. Professionallar uyqu va dam olishni strategiyaning bir qismi deb biladi. *Dam olgan aql — keskin aql.*"
  },
  {
    emoji: "💬",
    title: "Har kimga savdolaringni aytish",
    text: "\"Men ham BTC oldim!\" — buni aytgan zahot, narx tushishi mumkin 😄. Jiddiyroq sabab: boshqalarning fikri sening strategiyangni buzadi. *Yaxshi treyder jim bo'ladi.*"
  },
  {
    emoji: "🎯",
    title: "Take-profit qo'ymaslik",
    text: "+200% bo'lgan pozitsiyani ochiq qoldirib, natijada -10% bilan chiqish. *Foyda — faqat pozitsiyani yopgandan so'ng foyda. Qog'ozdagi foyda emas.*"
  },
  {
    emoji: "🔄",
    title: "Bir xil xatoni qayta-qayta takrorlash",
    text: "Har savdodan so'ng tahlil qilmaslik. George Soros: *\"Muhim narsa to'g'ri yoki noto'g'ri emasligingda emas — to'g'ri bo'lganda qancha ishlashingda va noto'g'ri bo'lganda qancha yo'qotishingda.*\""
  },
  {
    emoji: "📱",
    title: "Narxni har 5 daqiqada tekshirish",
    text: "Obsessiv narx tekshirish — bu stress va noto'g'ri qarorlarga olib keladi. *Alert qo'y, va olib ket. Grafik seni topmaydi — sen grafikni topasan.*"
  },
  {
    emoji: "🏃",
    title: "Tezkor boy bo'lishga urinish",
    text: "\"Bir oyda 10x qilaman\" — bu fikr bilan boshlanadi ko'p yo'qotishlar. Warren Buffett 60 yil davomida katta boylik yaratdi. *Treyding — marathon, sprint emas.*"
  },
  {
    emoji: "💰",
    title: "Kredit bilan savdo qilish",
    text: "Qarz pul bilan savdo qilish — bu psixologik bosim va noto'g'ri qarorlarga olib keladi. *Faqat yo'qotishga rozi bo'lgan pulni savdoga qo'y.*"
  },
  {
    emoji: "🗓️",
    title: "Kundalik yuritmaslik",
    text: "Har bir savdoni yozib bormaslik — taraqqiyotning eng katta to'sig'i. *Yozilmagan savdo — o'rganilmagan dars.*"
  },
  {
    emoji: "🎲",
    title: "Coin flipping mentality",
    text: "\"50/50 ehtimol\" deb savdo qilish. Professional treyderlar faqat 60-70%+ ehtimollik bo'lgan setaplarda kiradi. *Kam savdo, ko'p muvaffaqiyat.*"
  },
  {
    emoji: "📉",
    title: "Bear bozorida ham faqat buy qilish",
    text: "Bozor pasayishida ham ko'tarilishini kutish — bu pul yo'qotish formulasi. *Shorting va hedging strategiyalarini o'rgan.*"
  },
  {
    emoji: "🤖",
    title: "Indikatorlarga ko'r-ko'rona ishonish",
    text: "RSI, MACD — bular vosita, haqiqat emas. Hamma indikatorlar past narxga asoslangan — kelajakni ko'rsatmaydi. *Indikatorlar yordamchi, asosiy emas.*"
  },
  {
    emoji: "🌊",
    title: "Trendga qarshi savdo",
    text: "\"Narx juda ko'tarildi, hozir tushadi\" deb short ochish va yonib ketish. Jesse Livermore: *\"Trend — do'sting, u bilan yur, unga qarshi emas.*\""
  },
  {
    emoji: "🧠",
    title: "Confirmation bias",
    text: "Faqat o'z fikringni tasdiqlaydi gan ma'lumotlarni qidirish. *Har doim o'zingga qarshi argumentlarni ham o'rna.*"
  },
  {
    emoji: "📦",
    title: "Position sizing ni bilmaslik",
    text: "Kichik kapital bilan katta savdo — bu roulette. *Kelly Criterion yoki Fixed % risk management o'rgan.*"
  },
  {
    emoji: "🏆",
    title: "Win streak dan mast bo'lish",
    text: "5 marta ketma-ket yutgandan so'ng invincible his qilish va katta xato qilish. *Eng xavfli payt — g'alaba ketma-ketligi.*"
  },
  {
    emoji: "😰",
    title: "Panic selling",
    text: "Narx 10% tushganda qo'rqib chiqib ketish va keyin o'sha narxdan oshib ketishini kuzatish. *Savdoga kirishdan oldin exit strategiyangni aniq bel.*"
  },
  {
    emoji: "🔍",
    title: "Due diligence qilmaslik",
    text: "Telegram da ko'rgan tokenni o'rganmasdan olish. *Har doim so'ra: Bu loyiha nima qiladi? Kim qildi? Nima uchun narxi o'sishi kerak?*"
  },
  {
    emoji: "⏰",
    title: "Timeframe ni aralashtirib yuborish",
    text: "Daily chartda signal ko'rib, 1 minutlik chartda savdo qilish. *Bir timeframe tanlang va unga sodiq bo'ling.*"
  },
  {
    emoji: "💎",
    title: "Diamond hands — noto'g'ri vaqtda",
    text: "\"HODL!\" — bu ba'zida yo'qotishlar qilingan fikrni qoplash uchun aytiladi. *Stop-loss — diamond hands dan ko'ra qimmatroq.*"
  },
  {
    emoji: "📣",
    title: "Influencerlarga ko'r-ko'rona ergashish",
    text: "Twitter/YouTube da mashhur treyderlar seni boy qilmaydi — ular o'zlari uchun pozitsiya qilishgan bo'ladi. *Hech kim sizning pulingizni o'z pulidan ko'ra ko'proq qadrlamaydi.*"
  },
  {
    emoji: "🌐",
    title: "Makroiqtisodiyotni e'tiborsiz qoldirish",
    text: "Fed rate hike, dollar kuchayishi, regulation — bular kripto bozorini sezilarli darajada ta'sir qiladi. *Global iqtisodiyotdan xabardor bo'l.*"
  },
  {
    emoji: "🔐",
    title: "Security ni e'tiborsiz qoldirish",
    text: "Ko'plab treyderlar hack, phishing, scam orqali pul yo'qotadi. *Hardware wallet, 2FA, va ehtiyot choralar — bular ham strategiya.*"
  },
  {
    emoji: "📐",
    title: "Risk/Reward ni hisoblamaslik",
    text: "1:1 risk/reward bilan savdo qilish — bu uzoq muddatda zarar. *Har savdoda minimum 1:2 yoki 1:3 risk/reward izla.*"
  },
  {
    emoji: "🕯️",
    title: "Candlestick pattern larni bilmaslik",
    text: "Doji, Hammer, Engulfing — bular narx harakatining tilida. *Bu pattern larni o'rganish — narx nima deyotganini eshitish.*"
  },
  {
    emoji: "🌍",
    title: "Volume ni e'tiborsiz qoldirish",
    text: "Past volume bilan ko'tarilish — soxta signal. Yuqori volume bilan harakat — haqiqiy signal. *Volume — narx harakatining tasdiqlovchisi.*"
  },
  {
    emoji: "🎪",
    title: "Pump and dump ga ilinish",
    text: "\"X coin 1000% o'sadi!\" — bu ko'pincha pump sxemasi. *Kichik market cap tokenlar bilan ehtiyot bo'l.*"
  },
  {
    emoji: "🧮",
    title: "Vergi va komissiyalarni hisoblasmaslik",
    text: "Her savdodagi 0.1% komissiya va soliq — ular sezilarli darajada foyda ni kamaytiradi. *Haqiqiy foyda = Gross foyda - Komissiya - Soliq.*"
  },
  {
    emoji: "🏋️",
    title: "Mental va jismoniy sog'liqni e'tiborsiz qoldirish",
    text: "Charchagan, uxlamagan, stress ichidagi treyder — bu yuruvchi bankrot. *Sport, uyqu, meditatsiya — bular trading strategiyasi.*"
  },
  {
    emoji: "🎓",
    title: "O'rganishni to'xtatish",
    text: "\"Men etarlicha bilaman\" degan fikr — eng xavfli fikr. Bozor har doim o'zgaradi. *Eng yaxshi treyderlar — umrbod talabalar.*"
  },
  {
    emoji: "🏠",
    title: "Hayotiy xarajatlarni trading kapitaliga qo'shish",
    text: "Ijara puli, oziq-ovqat pulini trading ga qo'yish — bu psixologik bosim va noto'g'ri qarorlar. *Faqat ortiqcha pul bilan savdo qil.*"
  },
  {
    emoji: "⚖️",
    title: "Overconfidence — ortiqcha ishonch",
    text: "Bir necha muvaffaqiyatli savdodan so'ng o'zini expert deb hisoblash. *Bozor doimo eng aqlli treyderlarni ham sindiradi.*"
  },
  {
    emoji: "🔁",
    title: "Yutuqlarni darhol qayta investitsiya qilish",
    text: "Har bir foyda ni yangi savdoga solish — bu compounding qaror emas, bu ochko'zlik. *Foyda bir qismini olib qo'y.*"
  },
  {
    emoji: "🎭",
    title: "Savdoni o'yin deb bilish",
    text: "Trading — bu ehtimoliyat o'yini, lekin real pul bilan. *Har qarorning moliyaviy oqibatini his qil.*"
  },
  {
    emoji: "📍",
    title: "Anchoring bias — birinchi narxga yopishib qolish",
    text: "\"Bitcoin bir vaqt 69K bo'lgan, yana o'sha yerga boradi\" degan noto'g'ri kutish. *Narx o'tmishga qarzdor emas.*"
  },
  {
    emoji: "🌡️",
    title: "Bozor temperaturasini o'lchamas lik",
    text: "Fear & Greed Index, funding rate, OI — bular bozor kayfiyatini ko'rsatadi. *Hammalar qo'rqayotganda sotib ol, hammalar ochko'z bo'lganda sot.*"
  },
  {
    emoji: "🛑",
    title: "Stop-loss ni ko'chirish",
    text: "Stop-loss yaqinlashganda uni pastroqqa ko'chirish — bu o'zini aldash. *Stop-loss — qaror, his emas. Uni o'zgartirma.*"
  },
  {
    emoji: "🌱",
    title: "Natijani emas, jarayonni baholash",
    text: "Yaxshi qaror ham ba'zan yomon natija berishi mumkin va aksincha. *Strategiyangni natija emas, mantiqqa ko'ra baholang.*"
  },
  {
    emoji: "🔭",
    title: "Uzoq muddatli fikr yuritmaslik",
    text: "Faqat hozirgi savdoga e'tibor berish. Paul Tudor Jones: *\"Hech narsaga shunchalik mahliyo bo'lmangki, katta manzaradan ko'zingiz uzilsa.\"*"
  }
];

function getDailyQuote() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const index = dayOfYear % TRADING_MISTAKES.length;
  return TRADING_MISTAKES[index];
}

function getQuoteByIndex(index) {
  return TRADING_MISTAKES[index % TRADING_MISTAKES.length];
}

module.exports = { TRADING_MISTAKES, getDailyQuote, getQuoteByIndex };
