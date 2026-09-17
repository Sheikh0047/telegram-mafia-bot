const { Telegraf, Markup } = require('telegraf');
const fetch = require('node-fetch');

const bot = new Telegraf(process.env.BOT_TOKEN);

let gameSessions = {}; 
let devAccess = {};    

const DEV_PASSWORD = "1384";

const ROLES = {
  godfather: { name: "پدرخوانده", emoji: "🎩", team: "mafia" },
  mafia: { name: "مافیا ساده", emoji: "🦹‍♂️", team: "mafia" },
  doctor: { name: "دکتر", emoji: "💉", team: "citizen" },
  detective: { name: "کارآگاه", emoji: "🕵️‍♂️", team: "citizen" },
  sniper: { name: "تک‌تیرانداز", emoji: "🎯", team: "citizen" },
  citizen: { name: "شهروند ساده", emoji: "👤", team: "citizen" }
};

// تنظیم خودکار منوی کامندها برای تلگرام (ظاهر شدن توضیحات فارسی با زدن /)
async function setBotCommandsMenu() {
  try {
    await bot.telegram.setMyCommands([
      { command: 'mafia', description: '🌙 شروع لابی جدید بازی مافیا در گروه' },
      { command: 'join', description: '🎮 پیوستن به بازی در حال ثبت‌نام' },
      { command: 'startgame', description: '🚀 توزیع نقش‌ها و شروع رسمی بازی' },
      { command: 'endgame', description: '🛑 پایان دادن اضطراری به بازی جاری' },
      { command: 'help', description: '📜 راهنمای جامع و منوی شیشه‌ای ربات' }
    ]);
  } catch (e) {
    console.error("Error setting commands menu:", e);
  }
}

// تابع ارتباط با OpenRouter (گاد هوشمند)
async function askGameMaster(prompt, context = "") {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://github.com",
        "X-Title": "Telegram Mafia Bot",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "openrouter/auto",
        "messages": [
          {
            "role": "system",
            "content": "تو گاد (God) و راویِ بسیار حرفه‌ای، مرموز، سینمایی و جذاب یک بازی مافیای تلگرامی هستی. با ایموجی‌های فراوان، لحنی حماسی و باهوش، اتفاقات بازی، مرگ‌ها، فازهای شب و روز را روایت کن."
          },
          {
            "role": "user",
            "content": `وضعیت بازی: ${context}\n\nدرخواست: ${prompt}`
          }
        ]
      })
    });

    const data = await res.json();
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    }
    return "خطا در پردازش هوش مصنوعی گاد!";
  } catch (error) {
    console.error("OpenRouter Error:", error);
    return "⚠️ خطا در ارتباط با گاد هوش مصنوعی.";
  }
}

function getLobbyText(players) {
  let text = "🌙 **تاریکی فرا می‌رسد...** 🌙\n\n" +
             "بازی جدید مافیا در حال ثبت‌نام است! 👥\n\n" +
             `📊 **تعداد بازیکنان حاضر:** ${players.length} نفر\n\n`;

  if (players.length > 0) {
    text += "📋 **لیست مرتب بازیکنان:**\n";
    players.forEach((p, index) => {
      text += `${index + 1}. 👤 ${p.name}\n`;
    });
  } else {
    text += "📋 *هنوز هیچ‌کس به بازی نپیوسته است.*";
  }

  text += "\n\n⚠️ **نکته:** حتماً ربات را در پی‌وی استارت کرده باشید تا نقش‌ها برایتان ارسال شوند!";
  return text;
}

function getLobbyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🎮 پیوستن به بازی (Join)", "action_join")],
    [Markup.button.callback("🚀 شروع بازی (Start)", "action_start_game")],
    [Markup.button.callback("📜 راهنمای بازی (Help)", "action_help_menu")]
  ]);
}

bot.start((ctx) => {
  setBotCommandsMenu();
  if (ctx.chat.type === 'private') {
    ctx.reply(
      "✨ سلام! من **گاد هوشمند بازی مافیا** هستم. 🎭\n\n" +
      "منوی دستورات با زدن `/` فعال شد.\n" +
      "برای ورود به **پنل تست توسعه‌دهنده** (رمز عبور: `1384`) روی دکمه زیر کلیک کنید:",
      Markup.inlineKeyboard([
        [Markup.button.callback("🛠 ورود به پنل تست توسعه‌دهنده", "action_dev_panel")],
        [Markup.button.url("➕ افزودن ربات به گروه", `https://t.me/${bot.botInfo?.username || 'Bot'}?startgroup=true`)]
      ])
    );
  } else {
    ctx.reply("سلام! ربات مافیا در گروه فعال شد.");
  }
});

bot.command('help', (ctx) => {
  sendHelpMenu(ctx);
});

bot.action('action_help_menu', async (ctx) => {
  await ctx.answerCbQuery();
  sendHelpMenu(ctx, true);
});

function sendHelpMenu(ctx, isEdit = false) {
  const text = "📜 **راهنمای جامع ربات مافیا:**\n\n" +
               "🔹 `/mafia` - باز کردن لابی ثبت‌نام در گروه\n" +
               "🔹 `/join` - پیوستن به بازی\n" +
               "🔹 `/startgame` - توزیع نقش‌ها و شروع بازی\n" +
               "🔹 `/endgame` - پایان دادن اضطراری به بازی\n" +
               "🔹 `/help` - نمایش این منوی راهنما\n\n" +
               "🌙 در فاز شب، بازیکنان به پی‌وی ربات مراجعه کنند تا اکشن‌ها را انجام دهند.";
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("🔄 بروزرسانی راهنما", "action_help_menu")],
    [Markup.button.callback("❌ بستن منو", "action_close_msg")]
  ]);

  if (isEdit && ctx.editMessageText) {
    ctx.editMessageText(text, keyboard).catch(() => {});
  } else {
    ctx.reply(text, keyboard);
  }
}

bot.action('action_close_msg', async (ctx) => {
  await ctx.answerCbQuery();
  try { await ctx.deleteMessage(); } catch(e) {}
});

bot.action('action_dev_panel', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply("🔐 لطفاً رمز عبور ۴ رقمی توسعه‌دهنده را ارسال کنید (مثال: 1384):");
});

bot.on('text', async (ctx, next) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (ctx.chat.type === 'private') {
    if (text === DEV_PASSWORD) {
      devAccess[userId] = true;
      return ctx.reply(
        "✅ **احراز هویت موفقیت‌آمیز بود! پنل تست توسعه‌دهنده فعال شد.** 🛠",
        Markup.inlineKeyboard([
          [Markup.button.callback("🧪 تست هوش مصنوعی گاد", "dev_test_ai")],
          [Markup.button.callback("📊 بررسی وضعیت حافظه ربات", "dev_test_status")],
          [Markup.button.callback("🚪 خروج از پنل", "action_close_msg")]
        ])
      );
    } else if (devAccess[userId] && text.startsWith('/')) {
      return next();
    } else if (devAccess[userId]) {
      const aiReply = await askGameMaster(text, "تست توسعه‌دهنده در پنل شخصی");
      return ctx.reply(`🤖 **پاسخ تست هوش مصنوعی گاد:**\n\n${aiReply}`);
    }
  }
  return next();
});

bot.action('dev_test_ai', async (ctx) => {
  await ctx.answerCbQuery("تست هوش مصنوعی اجرا شد!");
  const res = await askGameMaster("یک جمله حماسی برای شروع تست ربات بگو.", "تست دیولوپر");
  ctx.reply(`🤖 تست ارتباط با OpenRouter:\n${res}`);
});

bot.action('dev_test_status', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(`📊 تعداد لابی‌های فعال در حافظه ربات: ${Object.keys(gameSessions).length} گروه.`);
});

bot.command('mafia', async (ctx) => {
  const chatId = ctx.chat.id;
  if (ctx.chat.type === 'private') return ctx.reply("❌ بازی مافیا باید داخل گروه انجام شود!");

  gameSessions[chatId] = {
    status: 'lobby',
    players: [],     
    rolesAssigned: {}, 
    isAlive: {},       
    nightActions: {}   
  };

  await ctx.reply(getLobbyText([]), getLobbyKeyboard());
});

bot.action('action_join', async (ctx) => {
  const chatId = ctx.chat.id;
  const user = ctx.from;

  const session = gameSessions[chatId];
  if (!session || session.status !== 'lobby') {
    return ctx.answerCbQuery("❌ لابی فعالی وجود ندارد یا بازی شروع شده است!", { show_alert: true });
  }

  if (session.players.some(p => p.id === user.id)) {
    return ctx.answerCbQuery("⚠️ شما قبلاً ثبت‌نام کرده‌اید!", { show_alert: true });
  }

  session.players.push({ id: user.id, name: user.first_name });
  await ctx.answerCbQuery(`✅ ${user.first_name} پیوست!`);

  try {
    await ctx.editMessageText(getLobbyText(session.players), getLobbyKeyboard());
  } catch (e) {}
});

bot.command('join', (ctx) => {
  const chatId = ctx.chat.id;
  const session = gameSessions[chatId];
  if (!session || session.status !== 'lobby') return ctx.reply("❌ ثبت‌نامی فعال نیست.");
  
  if (!session.players.some(p => p.id === ctx.from.id)) {
    session.players.push({ id: ctx.from.id, name: ctx.from.first_name });
    ctx.reply(`✅ **${ctx.from.first_name}** به لیست بازیکنان اضافه شد! (${session.players.length} نفر)`);
  }
});

bot.command('endgame', (ctx) => {
  const chatId = ctx.chat.id;
  if (gameSessions[chatId]) {
    delete gameSessions[chatId];
    ctx.reply("🛑 بازی جاری توسط دستور ادمین متوقف و لغو شد!");
  } else {
    ctx.reply("❌ هیچ بازی فعالی در این گروه جریان ندارد.");
  }
});

async function handleGameStart(ctx, chatId) {
  const session = gameSessions[chatId];
  if (!session || session.status !== 'lobby') return;
  if (session.players.length < 3) {
    const msg = "⚠️ تعداد بازیکنان برای شروع مافیا کمتر از حد مجاز است (حداقل ۳ نفر)!";
    return ctx.answerCbQuery ? ctx.answerCbQuery(msg, { show_alert: true }) : ctx.reply(msg);
  }

  session.status = 'playing';
  const players = session.players;

  const assignedRoles = {};
  players.forEach((p, i) => {
    session.isAlive[p.id] = true;
    if (i === 0) assignedRoles[p.id] = 'godfather';
    else if (i === 1) assignedRoles[p.id] = 'doctor';
    else if (i === 2) assignedRoles[p.id] = 'detective';
    else if (i % 2 === 0 && i < players.length - 1) assignedRoles[p.id] = 'mafia';
    else assignedRoles[p.id] = 'citizen';
  });
  session.rolesAssigned = assignedRoles;

  for (const p of players) {
    const rKey = assignedRoles[p.id];
    const rInfo = ROLES[rKey];
    let teamText = rInfo.team === 'mafia' ? "🦹‍♂️ مافیا (خبیث)" : "🛡 شهروند (پاک)";
    
    let extra = "";
    if (rInfo.team === 'mafia') {
      const mafias = players.filter(pl => ROLES[assignedRoles[pl.id]].team === 'mafia').map(pl => pl.name).join('، ');
      extra = `\n\n👥 **هم‌تیمی‌های مافیا:** ${mafias}`;
    }

    try {
      await bot.telegram.sendMessage(
        p.id,
        `🎭 **نقش شما تخصیص یافت!**\n\n👤 نام: **${p.name}**\n🏷 نقش: **${rInfo.name}** ${rInfo.emoji}\n⚔ تیم: **${teamText}**${extra}`
      );
    } catch (e) {}
  }

  const prompt = `بازی با ${players.length} بازیکن شروع شد. سناریو و جو فضا را به عنوان گاد توصیف کن.`;
  const intro = await askGameMaster(prompt, `تعداد بازیکنان: ${players.length}`);

  const startMsg = `🎬 **بازی رسماً آغاز شد! نقش‌ها در پی‌وی ارسال گردید.** 🎭\n\n${intro}\n\n` +
                   `🌙 **شب اول آغاز شد!**\n⏳ وضعیت تایمر شب: در حال محاسبه...`;

  let sentMsg;
  if (ctx.editMessageText) {
    try {
      sentMsg = await ctx.editMessageText(startMsg, Markup.inlineKeyboard([
        [Markup.button.callback("🌙 ورود به فاز شب / اکشن‌ها", "action_night_actions")]
      ]));
    } catch (e) {
      sentMsg = await ctx.reply(startMsg, Markup.inlineKeyboard([
        [Markup.button.callback("🌙 ورود به فاز شب / اکشن‌ها", "action_night_actions")]
      ]));
    }
  } else {
    sentMsg = await ctx.reply(startMsg, Markup.inlineKeyboard([
      [Markup.button.callback("🌙 ورود به فاز شب / اکشن‌ها", "action_night_actions")]
    ]));
  }

  runNightTimer(chatId, sentMsg.chat.id, sentMsg.message_id);
}

bot.action('action_start_game', async (ctx) => {
  await ctx.answerCbQuery("🚀 استارت بازی...");
  await handleGameStart(ctx, ctx.chat.id);
});

bot.command('startgame', (ctx) => {
  handleGameStart(ctx, ctx.chat.id);
});

async function runNightTimer(chatId, targetChatId, messageId) {
  let timeLeft = 120;

  const interval = setInterval(async () => {
    timeLeft -= 15; 
    if (timeLeft <= 0) {
      clearInterval(interval);
      await processNightResults(chatId, targetChatId, messageId);
    } else {
      let mins = Math.floor(timeLeft / 60);
      let secs = timeLeft % 60;
      let timerText = `🌙 **شب اول در جریان است...**\n⏳ **زمان باقی‌مانده تا صبح:** ${mins} دقیقه و ${secs} ثانیه\n\nمافیا، دکتر و کارآگاه وظایف خود را در پی‌وی انجام دهند.`;
      
      try {
        await bot.telegram.editMessageText(targetChatId, messageId, undefined, timerText, Markup.inlineKeyboard([
          [Markup.button.callback("🌙 اکشن‌های شب (پی‌وی)", "action_night_actions")]
        ]));
      } catch (e) {}
    }
  }, 15000);
}

async function processNightResults(chatId, targetChatId, messageId) {
  const session = gameSessions[chatId];
  if (!session) return;

  const alivePlayers = session.players.filter(p => session.isAlive[p.id]);
  let killedPlayer = alivePlayers.length > 0 ? alivePlayers[Math.floor(Math.random() * alivePlayers.length)] : null;
  
  if (killedPlayer) {
    session.isAlive[killedPlayer.id] = false;
  }

  const prompt = `شب به پایان رسید. خورشید طلوع کرد. بازیکنی به نام "${killedPlayer ? killedPlayer.name : 'هیچ‌کس'}" در شب گذشته کشته شد. این واقعه را با بیانی سینمایی، مرموز، خفن و تأثیرگذار اعلام کن.`;
  const morningReport = await askGameMaster(prompt, `قربانی شب: ${killedPlayer ? killedPlayer.name : 'ندارد'}`);

  const morningText = `☀️ **طلوع آفتاب و گزارش مرگبار صبحگاهی!** 🌅\n\n${morningReport}\n\n` +
                      (killedPlayer ? `⚰️ **بازیکن حذف شده در شب:** ${killedPlayer.name} 🪦` : `✨ معجزه رخ داد! امشب هیچ‌کس کشته نشد.`);

  try {
    await bot.telegram.editMessageText(targetChatId, messageId, undefined, morningText, Markup.inlineKeyboard([
      [Markup.button.callback("🗳 ورود به فاز رأی‌گیری روز", "action_day_vote")]
    ]));
  } catch (e) {}
}

bot.action('action_night_actions', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  let activeChatId = null;
  let userRole = null;

  for (const [cId, session] of Object.entries(gameSessions)) {
    if (session.rolesAssigned && session.rolesAssigned[userId]) {
      activeChatId = cId;
      userRole = session.rolesAssigned[userId];
      break;
    }
  }

  if (!activeChatId) {
    return ctx.reply("❌ شما در هیچ بازی فعالی حضور ندارید.");
  }

  const session = gameSessions[activeChatId];

  if (session.isAlive[userId] === false) {
    return ctx.reply("❌ شما در این بازی کشته شده‌اید و دیگر به بخش شب دسترسی ندارید! 🪦");
  }

  const playersList = session.players.filter(p => p.id !== userId && session.isAlive[p.id]);

  if (userRole === 'mafia' || userRole === 'godfather') {
    const buttons = playersList.map(p => [Markup.button.callback(`🎯 شلیک به: ${p.name}`, `shoot_${p.id}`)]);
    ctx.reply("🔫 **فاز شب مافیا:**\nانتخاب هدف برای شلیک:", Markup.inlineKeyboard(buttons));
  } else if (userRole === 'doctor') {
    const buttons = session.players.map(p => [Markup.button.callback(`💉 نجات: ${p.name}`, `heal_${p.id}`)]);
    ctx.reply("🏥 **فاز شب دکتر:**\nانتخاب بازیکن برای نجات:", Markup.inlineKeyboard(buttons));
  } else if (userRole === 'detective') {
    const buttons = playersList.map(p => [Markup.button.callback(`🕵️‍♂️ استعلام: ${p.name}`, `detect_${p.id}`)]);
    ctx.reply("🔍 **فاز شب کارآگاه:**\nاستعلام هویت بازیکن:", Markup.inlineKeyboard(buttons));
  } else {
    ctx.reply("💤 شما شهروند ساده هستید و در شب خوابید...");
  }
});

bot.action(/shoot_(.+)/, async (ctx) => {
  const userId = ctx.from.id;
  let session = Object.values(gameSessions).find(s => s.rolesAssigned && s.rolesAssigned[userId]);
  if (session && session.isAlive[userId] === false) {
    return ctx.answerCbQuery("❌ شما مرده‌اید!", { show_alert: true });
  }
  await ctx.answerCbQuery("🎯 شلیک ثبت شد!");
  ctx.reply("✅ شلیک شما با موفقیت ثبت گردید.");
});

bot.action(/heal_(.+)/, async (ctx) => {
  const userId = ctx.from.id;
  let session = Object.values(gameSessions).find(s => s.rolesAssigned && s.rolesAssigned[userId]);
  if (session && session.isAlive[userId] === false) {
    return ctx.answerCbQuery("❌ شما مرده‌اید!", { show_alert: true });
  }
  await ctx.answerCbQuery("💉 نجات ثبت شد!");
  ctx.reply("✅ بیمار مورد نظر نجات یافت.");
});

bot.action(/detect_(.+)/, async (ctx) => {
  const userId = ctx.from.id;
  let session = Object.values(gameSessions).find(s => s.rolesAssigned && s.rolesAssigned[userId]);
  if (session && session.isAlive[userId] === false) {
    return ctx.answerCbQuery("❌ شما مرده‌اید!", { show_alert: true });
  }
  await ctx.answerCbQuery("🔍 استعلام گرفته شد!");
  ctx.reply("🔎 استعلام انجام شد. نتیجه در صبح مشخص می‌شود.");
});

bot.action('action_day_vote', async (ctx) => {
  await ctx.answerCbQuery("رأی‌گیری روز به زودی فعال می‌شود...");
  ctx.reply("🗳 فاز روز آغاز شد. در گروه درباره اعدام افراد گفتگو و رأی‌گیری کنید.");
});

setBotCommandsMenu();

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).json({ status: 'ok' });
    } else {
      res.status(200).send('Advanced Telegram Mafia Bot is running successfully! 🚀');
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
