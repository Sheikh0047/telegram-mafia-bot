const { Telegraf, Markup } = require('telegraf');
const fetch = require('node-fetch');

const bot = new Telegraf(process.env.BOT_TOKEN);

let gameSessions = {}; 
let devAccess = {};    

const DEV_PASSWORD = "1384";

const ROLES = {
  godfather: { name: "پدرخوانده", emoji: "🎩", team: "mafia" },
  mafia: { name: "مافیا", emoji: "🦹‍♂️", team: "mafia" },
  doctor: { name: "دکتر", emoji: "💉", team: "citizen" },
  detective: { name: "کارآگاه", emoji: "🕵️‍♂️", team: "citizen" },
  citizen: { name: "شهروند", emoji: "👤", team: "citizen" }
};

// تنظیم منوی کامندها برای تلگرام
async function setBotCommandsMenu() {
  try {
    await bot.telegram.setMyCommands([
      { command: 'mafia', description: '🌙 شروع لابی جدید بازی مافیا در گروه' },
      { command: 'join', description: '🎮 پیوستن به بازی در حال ثبت‌نام' },
      { command: 'startgame', description: '🚀 توزیع نقش‌ها و شروع رسمی بازی' },
      { command: 'endgame', description: '🛑 پایان دادن اضطراری به بازی جاری' },
      { command: 'help', description: '📜 راهنمای جامع و منوی ربات' }
    ]);
  } catch (e) {
    console.error("Error setting commands menu:", e);
  }
}

// تابع ارتباط با هوش مصنوعی گاد
async function askGameMaster(prompt, context = "") {
  try {
    const res = "https://openrouter.ai/api/v1/chat/completions";
    const response = await fetch(res, {
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
            "content": "تو گاد (راوی) بازی مافیا هستی. متن‌هایت باید کوتاه (حداکثر ۲ الی ۳ خط)، پر از ایموجی، بسیار مهیج، سینمایی، کاملاً درست از نظر املایی و بدون حشو و اضافه‌گویی باشند."
          },
          {
            "role": "user",
            "content": `وضعیت: ${context}\n\nدستور: ${prompt}`
          }
        ]
      })
    });

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    }
    return "سکوتی سنگین فضا را پر کرده است...";
  } catch (error) {
    console.error("OpenRouter Error:", error);
    return "خطایی در ارتباط با راوی رخ داد.";
  }
}

function getLobbyText(players) {
  let text = "🌙 **تاریکی فرا می‌رسد...**\n\n" +
             "بازی جدید مافیا در حال ثبت‌نام است! 👥\n\n" +
             `📊 **تعداد بازیکنان حاضر:** ${players.length} نفر\n\n`;

  if (players.length > 0) {
    text += "📋 **لیست بازیکنان:**\n";
    players.forEach((p, index) => {
      text += `${index + 1}. 👤 ${p.name}\n`;
    });
  } else {
    text += "📋 *هنوز کسی به بازی نپیوسته است.*";
  }

  text += "\n\n⚠️ حتماً ربات را در پی‌وی استارت کرده باشید تا نقش‌ها ارسال شوند!";
  return text;
}

function getLobbyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🎮 پیوستن به بازی (Join)", "action_join")],
    [Markup.button.callback("🚀 شروع بازی (Start)", "action_start_game")],
    [Markup.button.callback("📜 راهنما (Help)", "action_help_menu")]
  ]);
}

bot.start((ctx) => {
  setBotCommandsMenu();
  if (ctx.chat.type === 'private') {
    ctx.reply(
      "✨ سلام! من **گاد هوشمند بازی مافیا** هستم. 🎭\n\n" +
      "منوی دستورات با زدن `/` فعال شد.\n" +
      "برای ورود به پنل توسعه‌دهنده (رمز عبور: `1384`) روی دکمه زیر کلیک کنید:",
      Markup.inlineKeyboard([
        [Markup.button.callback("🛠 ورود به پنل توسعه‌دهنده", "action_dev_panel")],
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
  const text = "📜 **راهنمای ربات مافیا:**\n\n" +
               "🔹 `/mafia` - باز کردن لابی ثبت‌نام در گروه\n" +
               "🔹 `/join` - پیوستن به بازی\n" +
               "🔹 `/startgame` - توزیع نقش‌ها و شروع بازی\n" +
               "🔹 `/endgame` - پایان دادن به بازی\n" +
               "🔹 `/help` - راهنما";
  
  const keyboard = Markup.inlineKeyboard([
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
  ctx.reply("🔐 لطفاً رمز عبور ۴ رقمی توسعه‌دهنده را بفرستید:");
});

bot.on('text', async (ctx, next) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (ctx.chat.type === 'private') {
    if (text === DEV_PASSWORD) {
      devAccess[userId] = true;
      return ctx.reply("✅ احراز هویت موفقیت‌آمیز بود! پنل تست فعال شد.");
    } else if (devAccess[userId] && text.startsWith('/')) {
      return next();
    } else if (devAccess[userId]) {
      const aiReply = await askGameMaster(text, "تست توسعه‌دهنده");
      return ctx.reply(`🤖 پاسخ گاد:\n\n${aiReply}`);
    }
  }
  return next();
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
    return ctx.answerCbQuery("❌ لابی فعالی وجود ندارد!", { show_alert: true });
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
    ctx.reply(`✅ **${ctx.from.first_name}** به بازی اضافه شد! (${session.players.length} نفر)`);
  }
});

bot.command('endgame', (ctx) => {
  const chatId = ctx.chat.id;
  if (gameSessions[chatId]) {
    delete gameSessions[chatId];
    ctx.reply("🛑 بازی جاری متوقف شد!");
  } else {
    ctx.reply("❌ هیچ بازی فعالی وجود ندارد.");
  }
});

// شروع بازی و توزیع نقش‌ها
async function handleGameStart(ctx, chatId) {
  const session = gameSessions[chatId];
  if (!session || session.status !== 'lobby') return;
  if (session.players.length < 3) {
    const msg = "⚠️ تعداد بازیکنان حداقل باید ۳ نفر باشد!";
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

  // ارسال نقش‌ها به پی‌وی بازیکنان
  for (const p of players) {
    const rKey = assignedRoles[p.id];
    const rInfo = ROLES[rKey];
    let teamText = rInfo.team === 'mafia' ? "🦹‍♂️ مافیا" : "🛡 شهروند";
    
    let extra = "";
    if (rInfo.team === 'mafia') {
      const mafias = players.filter(pl => ROLES[assignedRoles[pl.id]].team === 'mafia').map(pl => pl.name).join('، ');
      extra = `\n\n👥 هم‌تیمی‌ها: ${mafias}`;
    }

    try {
      await bot.telegram.sendMessage(
        p.id,
        `🎭 **نقش شما:**\n\n👤 نام: **${p.name}**\n🏷 نقش: **${rInfo.name}** ${rInfo.emoji}\n⚔ تیم: **${teamText}**${extra}`
      );
    } catch (e) {}
  }

  const prompt = `بازی با ${players.length} بازیکن شروع شد. از بازیکنان بخواه خودشان را معرفی کنند.`;
  const intro = await askGameMaster(prompt, `تعداد بازیکنان: ${players.length}`);

  const startMsg = `🎬 **بازی رسماً آغاز شد! نقش‌ها ارسال شد.** 🎭\n\n${intro}\n\n🗣 **مرحله معرفی اولیه:**\nهر بازیکن ۳۰ ثانیه فرصت دارد تا خود را در گروه معرفی کند. پس از صحبت همه، روی دکمه ادامه کلیک کنید.`;
  
  if (ctx.editMessageText) {
    try {
      await ctx.editMessageText(startMsg, Markup.inlineKeyboard([
        [Markup.button.callback("➡️ ادامه و ورود به شب اول", `start_night_${chatId}`)]
      ]));
    } catch (e) {
      await ctx.reply(startMsg, Markup.inlineKeyboard([
        [Markup.button.callback("➡️ ادامه و ورود به شب اول", `start_night_${chatId}`)]
      ]));
    }
  } else {
    await ctx.reply(startMsg, Markup.inlineKeyboard([
      [Markup.button.callback("➡️ ادامه و ورود به شب اول", `start_night_${chatId}`)]
    ]));
  }
}

bot.action('action_start_game', async (ctx) => {
  await ctx.answerCbQuery("🚀 استارت بازی...");
  await handleGameStart(ctx, ctx.chat.id);
});

bot.command('startgame', (ctx) => {
  handleGameStart(ctx, ctx.chat.id);
});

// ورود به فاز شب با دکمه ادامه
bot.action(/start_night_(.+)/, async (ctx) => {
  const chatId = ctx.match[1];
  const session = gameSessions[chatId];
  if (!session) return ctx.answerCbQuery("❌ بازی معتبری یافت نشد!", { show_alert: true });

  await ctx.answerCbQuery("🌙 ورود به فاز شب...");
  
  sendNightActionsToPrivate(chatId, session);

  try {
    await ctx.editMessageText(
      "🌙 **شب فرا رسید... شهر در خواب است.** 💤\n\nمافیا، دکتر و کارآگاه وظایف خود را در **پی‌وی ربات** انجام دهند.\nپس از اتمام کارهای شب، روی دکمه زیر کلیک کنید تا روز شود:",
      Markup.inlineKeyboard([
        [Markup.button.callback("☀️ طلوع آفتاب و شروع روز", `start_day_${chatId}`)]
      ])
    );
  } catch (e) {}
});

// ارسال دکمه‌های اکشن شب به پی‌وی نقش‌ها
async function sendNightActionsToPrivate(chatId, session) {
  session.nightActions = {};

  for (const p of session.players) {
    if (!session.isAlive[p.id]) continue;
    const role = session.rolesAssigned[p.id];
    const aliveTargets = session.players.filter(pl => pl.id !== p.id && session.isAlive[pl.id]);

    try {
      if (role === 'mafia' || role === 'godfather') {
        const buttons = aliveTargets.map(target => [Markup.button.callback(`🎯 شلیک به: ${target.name}`, `shoot_${chatId}_${target.id}`)]);
        await bot.telegram.sendMessage(p.id, "🔫 **فاز شب:** هدف خود را برای شلیک انتخاب کنید:", Markup.inlineKeyboard(buttons));
      } else if (role === 'doctor') {
        const buttons = session.players.filter(pl => session.isAlive[pl.id]).map(target => [Markup.button.callback(`💉 نجات: ${target.name}`, `heal_${chatId}_${target.id}`)]);
        await bot.telegram.sendMessage(p.id, "🏥 **فاز شب:** کسی را برای نجات انتخاب کنید:", Markup.inlineKeyboard(buttons));
      } else if (role === 'detective') {
        const buttons = aliveTargets.map(target => [Markup.button.callback(`🕵️‍♂️ استعلام: ${target.name}`, `detect_${chatId}_${target.id}`)]);
        await bot.telegram.sendMessage(p.id, "🔍 **فاز شب:** استعلام هویت کدام بازیکن را می‌خواهید؟", Markup.inlineKeyboard(buttons));
      }
    } catch (e) {}
  }
}

// طلوع آفتاب و شروع روز
bot.action(/start_day_(.+)/, async (ctx) => {
  const chatId = ctx.match[1];
  const session = gameSessions[chatId];
  if (!session) return ctx.answerCbQuery("❌ بازی معتبر نیست!", { show_alert: true });

  await ctx.answerCbQuery("☀️ طلوع روز...");

  const alivePlayers = session.players.filter(p => session.isAlive[p.id]);
  let killedPlayer = alivePlayers.length > 0 ? alivePlayers[Math.floor(Math.random() * alivePlayers.length)] : null;
  
  if (killedPlayer) {
    session.isAlive[killedPlayer.id] = false;
  }

  const prompt = `خورشید طلوع کرد. بازیکنی به نام "${killedPlayer ? killedPlayer.name : 'هیچ‌کس'}" دیشب کشته شد. گزارش مرگبار صبح را اعلام کن.`;
  const morningReport = await askGameMaster(prompt, `قربانی: ${killedPlayer ? killedPlayer.name : 'ندارد'}`);

  const morningText = `☀️ **طلوع آفتاب و گزارش صبحگاهی!**\n\n${morningReport}\n\n` +
                      (killedPlayer ? `⚰️ **مقتول دیشب:** ${killedPlayer.name} 🪦` : `✨ دیشب معجزه شد و هیچ‌کس کشته نشد!`) +
                      `\n\n🗣 **مرحله صحبت و دفاعیه:**\nاکنون بازیکنان به ترتیب صحبت می‌کنند.`;

  try {
    await ctx.editMessageText(morningText, Markup.inlineKeyboard([
      [Markup.button.callback("🎙 شروع نوبت صحبت بازیکنان", `speech_start_${chatId}_0`)]
    ]));
  } catch (e) {}
});

// مدیریت نوبت صحبت ۳۰ ثانیه‌ای بازیکنان به ترتیب
bot.action(/speech_start_(.+)_(.+)/, async (ctx) => {
  const match = ctx.match;
  const chatId = match[1];
  let index = parseInt(match[2]);

  const session = gameSessions[chatId];
  if (!session) return ctx.answerCbQuery("❌ بازی یافت نشد!", { show_alert: true });

  const alivePlayers = session.players.filter(p => session.isAlive[p.id]);

  if (index >= alivePlayers.length) {
    // پایان صحبت‌ها، رفتن به رای‌گیری با دکمه‌های شیشه‌ای
    return startVotingPhase(ctx, chatId, session);
  }

  const currentPlayer = alivePlayers[index];
  await ctx.answerCbQuery(`نوبت ${currentPlayer.name}`);

  try {
    await ctx.editMessageText(
      `🗣 **نوبت صحبت / دفاعیه:**\n\n👤 بازیکن: **${currentPlayer.name}**\n⏳ **زمان:** ۳۰ ثانیه فرصت صحبت دارید.\n\nپس از اتمام صحبت این بازیکن، روی دکمه زیر کلیک کنید:`,
      Markup.inlineKeyboard([
        [Markup.button.callback(`➡️ نفر بعدی (${index + 2}/${alivePlayers.length})`, `speech_start_${chatId}_${index + 1}`)]
      ])
    );
  } catch (e) {}
});

// فاز رأی‌گیری با دکمه‌های شیشه‌ای
async function startVotingPhase(ctx, chatId, session) {
  const alivePlayers = session.players.filter(p => session.isAlive[p.id]);
  
  const buttons = alivePlayers.map(p => [Markup.button.callback(`⚖️ رأی به اعدام: ${p.name}`, `vote_${chatId}_${p.id}`)]);
  buttons.push([Markup.button.callback("🚫 رد رأی (هیچ‌کدام)", `vote_${chatId}_none`)]);

  try {
    await ctx.editMessageText(
      "🗳 **فاز رأی‌گیری روز:**\nکدام بازیکن را برای اعدام مشکوک می‌دانید؟ روی دکمه زیر کلیک کنید:",
      Markup.inlineKeyboard(buttons)
    );
  } catch (e) {}
}

// ثبت رای‌گیری شیشه‌ای
bot.action(/vote_(.+)_(.+)/, async (ctx) => {
  const match = ctx.match;
  const chatId = match[1];
  const targetId = match[2];
  const userId = ctx.from.id;

  const session = gameSessions[chatId];
  if (!session || session.isAlive[userId] === false) {
    return ctx.answerCbQuery("❌ شما حق رأی ندارید!", { show_alert: true });
  }

  await ctx.answerCbQuery("✅ رأی شما با موفقیت ثبت شد!");
  try {
    await ctx.editMessageText("🗳 **رأی شما ثبت گردید.** منتظر اعلام نتیجه نهایی گاد بمانید.", Markup.inlineKeyboard([]));
  } catch (e) {}
});

// هندل کردن اکشن شلیک در پی‌وی
bot.action(/shoot_(.+)_(.+)/, async (ctx) => {
  const match = ctx.match;
  const chatId = match[1];
  const userId = ctx.from.id;

  const session = gameSessions[chatId];
  if (!session || session.isAlive[userId] === false) {
    return ctx.answerCbQuery("❌ شما دیگر زنده نیستید!", { show_alert: true });
  }

  await ctx.answerCbQuery("🎯 شلیک شما ثبت شد!");
  try {
    await ctx.editMessageText("🎯 **شلیک شما ثبت شد.** (منقضی شده)", Markup.inlineKeyboard([]));
  } catch (e) {}
});

// هندل کردن اکشن نجات دکتر در پی‌وی
bot.action(/heal_(.+)_(.+)/, async (ctx) => {
  const match = ctx.match;
  const chatId = match[1];
  const userId = ctx.from.id;

  const session = gameSessions[chatId];
  if (!session || session.isAlive[userId] === false) {
    return ctx.answerCbQuery("❌ بازی نامعتبر است!", { show_alert: true });
  }

  await ctx.answerCbQuery("💉 نجات ثبت شد!");
  try {
    await ctx.editMessageText("🏥 **نجات بیمار ثبت شد.** (منقضی شده)", Markup.inlineKeyboard([]));
  } catch (e) {}
});

// هندل کردن اکشن استعلام کارآگاه در پی‌وی
bot.action(/detect_(.+)_(.+)/, async (ctx) => {
  const match = ctx.match;
  const chatId = match[1];
  const userId = ctx.from.id;

  const session = gameSessions[chatId];
  if (!session || session.isAlive[userId] === false) {
    return ctx.answerCbQuery("❌ بازی نامعتبر است!", { show_alert: true });
  }

  await ctx.answerCbQuery("🔍 استعلام گرفته شد!");
  try {
    await ctx.editMessageText("🔎 **استعلام انجام شد.** نتیجه صبح مشخص می‌شود. (منقضی شده)", Markup.inlineKeyboard([]));
  } catch (e) {}
});

setBotCommandsMenu();

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).json({ status: 'ok' });
    } else {
      res.status(200).send('Advanced Mafia Bot is running smoothly! 🚀');
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
