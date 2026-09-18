const { Telegraf, Markup } = require('telegraf');
const fetch = require('node-fetch');

const bot = new Telegraf(process.env.BOT_TOKEN);

let gameSessions = {}; 
let devAccess = {};    
let activeGroups = new Set(); // ذخیره آیدی گروه‌هایی که ربات در آن‌ها فعال است
let groupRecentUsers = {};    // ذخیره کاربران اخیر هر گروه برای تگ کردن

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
      { command: 'start', description: '✨ شروع ربات و معرفی گاد' },
      { command: 'mafia', description: '🌙 شروع لابی جدید بازی مافیا' },
      { command: 'join', description: '🎮 پیوستن به بازی' },
      { command: 'startgame', description: '🚀 شروع رسمی بازی' },
      { command: 'endgame', description: '🛑 پایان دادن به بازی جاری' },
      { command: 'help', description: '📜 راهنمای ربات' }
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
            "content": "تو گاد (راوی مرموز، جذاب و کمی طعنه‌آمیز) بازی مافیا هستی. متن‌هایت باید کوتاه (حداکثر ۲ الی ۳ خط)، پر از ایموجی، بسیار مهیج و سینمایی باشند."
          },
          {
            "role": "user",
            "content": `وضعیت: ${context}\n\nپیام یا دستور: ${prompt}`
          }
        ]
      })
    });

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    }
    return "سکوتی مرموز فضا را پر کرده است...";
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

  text += "\n\n⚠️ حتماً ربات را در پی‌وی استارت کرده باشید تا نقش‌ها و چت‌های خصوصی کار کنند!";
  return text;
}

function getLobbyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🎮 پیوستن به بازی (Join)", "action_join")],
    [Markup.button.callback("🚀 شروع بازی (Start)", "action_start_game")],
    [Markup.button.callback("📜 راهنما (Help)", "action_help_menu")]
  ]);
}

async function checkGameEnd(ctx, chatId, session) {
  let alivePlayers = session.players.filter(p => session.isAlive[p.id]);
  
  let mafiaCount = alivePlayers.filter(p => {
    let role = session.rolesAssigned[p.id];
    return ROLES[role].team === 'mafia';
  }).length;

  let citizenCount = alivePlayers.filter(p => {
    let role = session.rolesAssigned[p.id];
    return ROLES[role].team === 'citizen';
  }).length;

  let gameOver = false;
  let winMessage = "";

  if (mafiaCount >= citizenCount && mafiaCount > 0) {
    gameOver = true;
    winMessage = "🦹‍♂️🔥 **پیروزی تیم مافیا!**\n\nتعداد مافیاها به حد نصاب رسید و شهر را به تسخیر خود درآوردند. مافیا برنده شد!";
  } else if (mafiaCount === 0) {
    gameOver = true;
    winMessage = "🛡✨ **پیروزی بزرگ شهروندان!**\n\nتمامی اعضای خائن مافیا ریشه‌کن شدند و شهر دوباره امن شد. شهروندان برنده شدند!";
  }

  if (gameOver) {
    try {
      const msg = await ctx.editMessageText(winMessage, Markup.inlineKeyboard([]));
      if (msg && msg.message_id) {
        await bot.telegram.pinChatMessage(chatId, msg.message_id);
      }
    } catch (e) {
      const sent = await bot.telegram.sendMessage(chatId, winMessage);
      try { await bot.telegram.pinChatMessage(chatId, sent.message_id); } catch(err) {}
    }
    delete gameSessions[chatId];
    return true;
  }

  return false;
}

bot.start(async (ctx) => {
  setBotCommandsMenu();

  const frames = [
    "✨ 🌟 💫 **آماده‌سازی تاریکی...** 💫 🌟 ✨\n\n🔮 درگاه‌های شهر مافیا در حال باز شدن است...",
    "⚡ 🔵 🟣 **گاد هوشمند بیدار شد!** 🟣 🔵 ⚡\n\n🎭 من راوی و گرداننده تاریک‌ترین بازی قرن هستم...",
    "🔥 🔴 🟡 **شهر آماده نبرد است...** 🟡 🔴 🔥\n\n👑 برای ساخت لابی و ورود بازیکنان، روی دکمه زیر کلیک کنید!"
  ];

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("لابی", "action_start_lobby_from_start")]
  ]);

  try {
    let sentMsg = await ctx.reply(frames[0], keyboard);
    
    setTimeout(async () => {
      try { await bot.telegram.editMessageText(ctx.chat.id, sentMsg.message_id, undefined, frames[1], keyboard); } catch (e) {}
    }, 1000);

    setTimeout(async () => {
      try { await bot.telegram.editMessageText(ctx.chat.id, sentMsg.message_id, undefined, frames[2], keyboard); } catch (e) {}
    }, 2000);

  } catch (e) {
    ctx.reply("✨ سلام! من گاد هوشمند بازی مافیا هستم.", keyboard);
  }
});

bot.action('action_start_lobby_from_start', async (ctx) => {
  const chatId = ctx.chat.id;
  await ctx.answerCbQuery("🌙 لابی بازی ایجاد شد...");

  gameSessions[chatId] = {
    status: 'lobby',
    round: 0,
    players: [],     
    rolesAssigned: {}, 
    isAlive: {},       
    nightActions: {},
    votes: {},
    detectiveInquiries: {},
    privateMessageIds: {}
  };

  try {
    const sentMsg = await ctx.editMessageText(getLobbyText([]), getLobbyKeyboard());
    if (sentMsg && sentMsg.message_id) {
      await bot.telegram.pinChatMessage(chatId, sentMsg.message_id);
    }
  } catch (e) {}
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
               "🔹 `/start` - معرفی گاد\n" +
               "🔹 `/mafia` - باز کردن لابی در گروه\n" +
               "🔹 `/join` - پیوستن به بازی\n" +
               "🔹 `/startgame` - شروع بازی\n" +
               "🔹 `/endgame` - پایان بازی\n" +
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

// مدیریت هوشمند پیام‌های متنی (ثبت گروه‌ها، ذخیره کاربران برای تگ رندوم، چت آزاد با گاد)
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  // اگر پیام در گروه است، گروه را ثبت و کاربر را ذخیره کن
  if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
    activeGroups.add(chatId);
    
    if (!groupRecentUsers[chatId]) {
      groupRecentUsers[chatId] = [];
    }
    // اضافه کردن کاربر به لیست کاربران اخیر (اگر تکراری نباشد)
    if (!groupRecentUsers[chatId].some(u => u.id === userId)) {
      groupRecentUsers[chatId].push({ id: userId, name: ctx.from.first_name, username: ctx.from.username });
      // حداکثر ۲۰ کاربر آخر نگه داشته شوند
      if (groupRecentUsers[chatId].length > 20) groupRecentUsers[chatId].shift();
    }

    const botUsername = ctx.botInfo ? ctx.botInfo.username : '';
    const isMentioned = text.includes(`@${botUsername}`);
    const isReplyToBot = ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === ctx.botInfo.id;

    if (isMentioned || isReplyToBot) {
      const cleanPrompt = text.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
      if (cleanPrompt.length > 0) {
        const aiResponse = await askGameMaster(cleanPrompt, `چت آزاد در گروه با بازیکن ${ctx.from.first_name}`);
        return ctx.reply(`🗣 **گاد:**\n\n${aiResponse}`, {
          reply_parameters: { message_id: ctx.message.message_id }
        });
      }
    }
  } 
  
  // اگر در پی‌وی باشد
  else if (ctx.chat.type === 'private') {
    if (text === DEV_PASSWORD) {
      devAccess[userId] = true;
      return ctx.reply("✅ احراز هویت موفقیت‌آمیز بود! پنل تست فعال شد.");
    } else if (devAccess[userId] && text.startsWith('/')) {
      return next();
    } else if (devAccess[userId]) {
      const aiReply = await askGameMaster(text, "تست توسعه‌دهنده");
      return ctx.reply(`🤖 پاسخ گاد:\n\n${aiReply}`);
    } else {
      let activeSession = null;
      for (const s of Object.values(gameSessions)) {
        if (s.status === 'playing' && s.players.some(p => p.id === userId)) {
          activeSession = s;
          break;
        }
      }

      if (activeSession) {
        const playerRoleKey = activeSession.rolesAssigned[userId];
        const roleInfo = ROLES[playerRoleKey];
        const contextInfo = `بازیکن ${ctx.from.first_name} با نقش ${roleInfo.name} در پی‌وی با شما صحبت می‌کند.`;
        const aiPvReply = await askGameMaster(text, contextInfo);
        return ctx.reply(`🎭 **گاد:**\n\n${aiPvReply}`);
      } else {
        return ctx.reply("✨ سلام! برای شروع یا شرکت در بازی مافیا، لطفا وارد گروه شوید و لابی را باز کنید.");
      }
    }
  }

  return next();
});

// تایمر خودکار: هر ۲ ساعت یک‌بار (می‌توانید زمان را کم یا زیاد کنید) ربات به طور تصادفی یک گروه و یک کاربر را انتخاب می‌کند و تعامل را شروع می‌کند
setInterval(async () => {
  if (activeGroups.size === 0) return;

  for (const chatId of activeGroups) {
    const users = groupRecentUsers[chatId];
    if (!users || users.length === 0) continue;

    // انتخاب رندوم یک کاربر از لیست کاربران اخیر گروه
    const randomUser = users[Math.floor(Math.random() * users.length)];
    
    const prompt = `یک پیام کوتاه، مرموز و جذاب بساز که در آن کاربر ${randomUser.name} را تگ کنی، احوالپرسی کنی یا درباره سکوت یا وضعیت گروه متلک/تکه‌ای بیندازی تا بحث داغ شود.`;
    const aiMessage = await askGameMaster(prompt, "شروع تعامل خودکار گاد در گروه");

    try {
      // ساخت تگ به صورت استاندارد در تلگرام (استفاده از نام کاربر به عنوان متن لینک یا منتشن)
      const userTagText = randomUser.username ? `@${randomUser.username}` : `[${randomUser.name}](tg://user?id=${randomUser.id})`;
      await bot.telegram.sendMessage(chatId, `🎭 **گاد:**\n\n${userTagText} ${aiMessage}`, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error("Auto message error:", e);
    }
  }
}, 2 * 60 * 60 * 1000); // هر ۲ ساعت (برای تست می‌توانید عدد را به مثلاً ۵ دقیقه یعنی 5 * 60 * 1000 تغییر دهید)

bot.command('mafia', async (ctx) => {
  const chatId = ctx.chat.id;
  if (ctx.chat.type === 'private') return ctx.reply("❌ بازی مافیا باید داخل گروه انجام شود!");

  activeGroups.add(chatId);

  gameSessions[chatId] = {
    status: 'lobby',
    round: 0,
    players: [],     
    rolesAssigned: {}, 
    isAlive: {},       
    nightActions: {},
    votes: {},
    detectiveInquiries: {},
    privateMessageIds: {}
  };

  const sentMsg = await ctx.reply(getLobbyText([]), getLobbyKeyboard());
  try {
    await bot.telegram.pinChatMessage(chatId, sentMsg.message_id);
  } catch (e) {}
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

async function handleGameStart(ctx, chatId) {
  const session = gameSessions[chatId];
  if (!session || session.status !== 'lobby') return;
  if (session.players.length < 3) {
    const msg = "⚠️ تعداد بازیکنان حداقل باید ۳ نفر باشد!";
    return ctx.answerCbQuery ? ctx.answerCbQuery(msg, { show_alert: true }) : ctx.reply(msg);
  }

  session.status = 'playing';
  session.round = 1;
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

      const introPrompt = `به بازیکن ${p.name} که نقش ${rInfo.name} را دارد خوش‌آمد بگو، با او کمی گرم بگیر و به عنوان گاد درباره این نقش و رازهای بازی سرنخ بده تا گفتگو شروع شود.`;
      const aiWelcomeMessage = await askGameMaster(introPrompt, `نقش بازیکن: ${rInfo.name}`);
      await bot.telegram.sendMessage(p.id, `🗣 **گاد:**\n\n${aiWelcomeMessage}`);

    } catch (e) {}
  }

  const prompt = `بازی با ${players.length} بازیکن شروع شد. از بازیکنان بخواه خودشان را معرفی کنند.`;
  const intro = await askGameMaster(prompt, `تعداد بازیکنان: ${players.length}`);

  const startMsg = `🎬 **بازی رسماً آغاز شد! نقش‌ها ارسال شد.** 🎭\n\n${intro}\n\n🗣 **مرحله معرفی اولیه:**\nهر بازیکن ۳۰ ثانیه فرصت دارد تا خود را در گروه معرفی کند. پس از صحبت همه، روی دکمه ادامه کلیک کنید.`;
  
  let sentMsg;
  if (ctx.editMessageText) {
    try {
      sentMsg = await ctx.editMessageText(startMsg, Markup.inlineKeyboard([
        [Markup.button.callback("➡️ ادامه و ورود به شب اول", `start_night_${chatId}`)]
      ]));
    } catch (e) {
      sentMsg = await ctx.reply(startMsg, Markup.inlineKeyboard([
        [Markup.button.callback("➡️ ادامه و ورود به شب اول", `start_night_${chatId}`)]
      ]));
    }
  } else {
    sentMsg = await ctx.reply(startMsg, Markup.inlineKeyboard([
      [Markup.button.callback("➡️ ادامه و ورود به شب اول", `start_night_${chatId}`)]
    ]));
  }

  if (sentMsg && sentMsg.message_id) {
    try { await bot.telegram.pinChatMessage(chatId, sentMsg.message_id); } catch (e) {}
  }
}

bot.action('action_start_game', async (ctx) => {
  await ctx.answerCbQuery("🚀 استارت بازی...");
  await handleGameStart(ctx, ctx.chat.id);
});

bot.command('startgame', (ctx) => {
  handleGameStart(ctx, ctx.chat.id);
});

bot.action(/start_night_(.+)/, async (ctx) => {
  const chatId = ctx.match[1];
  const session = gameSessions[chatId];
  if (!session) return ctx.answerCbQuery("❌ بازی معتبری یافت نشد!", { show_alert: true });

  await ctx.answerCbQuery("🌙 ورود به فاز شب...");
  
  sendNightActionsToPrivate(chatId, session);

  try {
    const nightMsg = await ctx.editMessageText(
      `🌙 **شب ${session.round} فرا رسید... شهر در خواب است.** 💤\n\nمافیا، دکتر و کارآگاه وظایف خود را در **پی‌وی ربات** انجام دهند.\nپس از اتمام کارهای شب، روی دکمه زیر کلیک کنید تا روز شود:`,
      Markup.inlineKeyboard([
        [Markup.button.callback("☀️ طلوع آفتاب و شروع روز", `start_day_${chatId}`)]
      ])
    );
    if (nightMsg && nightMsg.message_id) {
      try { await bot.telegram.pinChatMessage(chatId, nightMsg.message_id); } catch (e) {}
    }
  } catch (e) {}
});

async function sendNightActionsToPrivate(chatId, session) {
  session.nightActions = {};
  session.privateMessageIds = session.privateMessageIds || {};

  for (const p of session.players) {
    if (!session.isAlive[p.id]) continue;
    const role = session.rolesAssigned[p.id];
    const aliveTargets = session.players.filter(pl => pl.id !== p.id && session.isAlive[pl.id]);

    try {
      let sentMsg = null;
      if (role === 'mafia' || role === 'godfather') {
        const buttons = aliveTargets.map(target => [Markup.button.callback(`🎯 شلیک به: ${target.name}`, `shoot_${chatId}_${target.id}`)]);
        sentMsg = await bot.telegram.sendMessage(p.id, `🌙 **شب ${session.round} - فاز شلیک:**\nهدف خود را برای شلیک انتخاب کنید:`, Markup.inlineKeyboard(buttons));
      } else if (role === 'doctor') {
        const buttons = session.players.filter(pl => session.isAlive[pl.id]).map(target => [Markup.button.callback(`💉 نجات: ${target.name}`, `heal_${chatId}_${target.id}`)]);
        sentMsg = await bot.telegram.sendMessage(p.id, `🌙 **شب ${session.round} - فاز نجات:**\nکسی را برای نجات انتخاب کنید:`, Markup.inlineKeyboard(buttons));
      } else if (role === 'detective') {
        const buttons = aliveTargets.map(target => [Markup.button.callback(`🕵️‍♂️ استعلام: ${target.name}`, `detect_${chatId}_${target.id}`)]);
        sentMsg = await bot.telegram.sendMessage(p.id, `🌙 **شب ${session.round} - فاز استعلام:**\nهویت کدام بازیکن را می‌خواهید استعلام بگیرید؟`, Markup.inlineKeyboard(buttons));
      }

      if (sentMsg) {
        session.privateMessageIds[p.id] = sentMsg.message_id;
      }
    } catch (e) {}
  }
}

bot.action(/start_day_(.+)/, async (ctx) => {
  const chatId = ctx.match[1];
  const session = gameSessions[chatId];
  if (!session) return ctx.answerCbQuery("❌ بازی معتبر نیست!", { show_alert: true });

  await ctx.answerCbQuery("☀️ طلوع روز...");

  if (session.privateMessageIds) {
    for (const [playerId, msgId] of Object.entries(session.privateMessageIds)) {
      try {
        await bot.telegram.editMessageText(
          playerId, 
          msgId, 
          undefined, 
          "⏳ **فاز شب به پایان رسید و این دکمه منقضی شد.**", 
          Markup.inlineKeyboard([])
        );
      } catch (e) {}
    }
    session.privateMessageIds = {};
  }

  const alivePlayers = session.players.filter(p => session.isAlive[p.id]);
  let killedPlayer = alivePlayers.length > 0 ? alivePlayers[Math.floor(Math.random() * alivePlayers.length)] : null;
  
  if (killedPlayer) {
    session.isAlive[killedPlayer.id] = false;
  }

  let isEnded = await checkGameEnd(ctx, chatId, session);
  if (isEnded) return;

  for (const [detectiveId, targetId] of Object.entries(session.detectiveInquiries || {})) {
    const targetPlayer = session.players.find(p => p.id == targetId);
    if (targetPlayer) {
      const targetRole = session.rolesAssigned[targetId];
      const isMafiaTeam = ROLES[targetRole].team === 'mafia' && targetRole !== 'godfather';
      
      const inquiryResultText = isMafiaTeam 
        ? `🚨 **نتیجه استعلام کارآگاه:**\n\nبازیکن **${targetPlayer.name}** جزء تیم **مافیا** است! 🦹‍♂️⚠️`
        : `🛡 **نتیجه استعلام کارآگاه:**\n\nبازیکن **${targetPlayer.name}** پاک (شهروند یا پدرخوانده) است. ✅`;

      try {
        await bot.telegram.sendMessage(detectiveId, inquiryResultText);
      } catch (e) {}
    }
  }
  session.detectiveInquiries = {};

  const prompt = `خورشید طلوع کرد. بازیکنی به نام "${killedPlayer ? killedPlayer.name : 'هیچ‌کس'}" دیشب کشته شد. گزارش مرگبار صبح را اعلام کن.`;
  const morningReport = await askGameMaster(prompt, `قربانی: ${killedPlayer ? killedPlayer.name : 'ندارد'}`);

  const morningText = `☀️ **طلوع آفتاب و گزارش صبحگاهی!**\n\n${morningReport}\n\n` +
                      (killedPlayer ? `⚰️ **مقتول دیشب:** ${killedPlayer.name} 🪦` : `✨ دیشب معجزه شد و هیچ‌کس کشته نشد!`) +
                      `\n\n🗣 **مرحله صحبت و دفاعیه:**\nاکنون بازیکنان به ترتیب صحبت می‌کنند.`;

  try {
    const morningMsg = await ctx.editMessageText(morningText, Markup.inlineKeyboard([
      [Markup.button.callback("🎙 شروع نوبت صحبت بازیکنان", `speech_start_${chatId}_0`)]
    ]));
    if (morningMsg && morningMsg.message_id) {
      try { await bot.telegram.pinChatMessage(chatId, morningMsg.message_id); } catch (e) {}
    }
  } catch (e) {}
});

bot.action(/speech_start_(.+)_(.+)/, async (ctx) => {
  const match = ctx.match;
  const chatId = match[1];
  let index = parseInt(match[2]);

  const session = gameSessions[chatId];
  if (!session) return ctx.answerCbQuery("❌ بازی یافت نشد!", { show_alert: true });

  const alivePlayers = session.players.filter(p => session.isAlive[p.id]);

  if (index >= alivePlayers.length) {
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

async function startVotingPhase(ctx, chatId, session) {
  session.votes = {}; 
  const alivePlayers = session.players.filter(p => session.isAlive[p.id]);
  
  const buttons = alivePlayers.map(p => [Markup.button.callback(`⚖️ رأی به: ${p.name}`, `vote_${chatId}_${p.id}`)]);
  buttons.push([Markup.button.callback("🚫 رد رأی (هیچ‌کدام)", `vote_${chatId}_none`)]);
  buttons.push([Markup.button.callback("🔒 پایان رأی‌گیری و اعلام نتیجه", `end_vote_${chatId}`)]);

  try {
    const voteMsg = await ctx.editMessageText(
      "🗳 **فاز رأی‌گیری روز:**\nکدام بازیکن را برای اعدام مشکوک می‌دانید؟ روی دکمه‌ها کلیک کنید، سپس پایان رأی‌گیری را بزنید:",
      Markup.inlineKeyboard(buttons)
    );
    if (voteMsg && voteMsg.message_id) {
      try { await bot.telegram.pinChatMessage(chatId, voteMsg.message_id); } catch (e) {}
    }
  } catch (e) {}
}

bot.action(/vote_(.+)_(.+)/, async (ctx) => {
  const match = ctx.match;
  const chatId = match[1];
  const targetId = match[2];
  const userId = ctx.from.id;

  const session = gameSessions[chatId];
  if (!session || session.isAlive[userId] === false) {
    return ctx.answerCbQuery("❌ شما حق رأی ندارید یا مرده‌اید!", { show_alert: true });
  }

  session.votes[userId] = targetId;
  await ctx.answerCbQuery("✅ رأی شما با موفقیت ثبت شد!");
});

bot.action(/end_vote_(.+)/, async (ctx) => {
  const chatIdReal = ctx.match[1];
  const session = gameSessions[chatIdReal];
  if (!session) return ctx.answerCbQuery("❌ بازی معتبری یافت نشد!", { show_alert: true });

  await ctx.answerCbQuery("⚖️ در حال شمارش آرا...");

  let voteCounts = {};
  Object.values(session.votes).forEach(targetId => {
    if (targetId !== 'none') {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }
  });

  let maxVotes = 0;
  let targetToExecuteId = null;
  for (const [tId, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      targetToExecuteId = tId;
    }
  }

  let executedPlayer = null;
  let executionMessage = "";

  if (targetToExecuteId) {
    executedPlayer = session.players.find(p => p.id == targetToExecuteId);
    if (executedPlayer) {
      session.isAlive[executedPlayer.id] = false;
      const roleKey = session.rolesAssigned[executedPlayer.id];
      const roleInfo = ROLES[roleKey];

      if (roleInfo.team === 'citizen') {
        executionMessage = `🚨 **اشتباه بزرگ شهر!**\nشهروند بی‌گناه، **${executedPlayer.name}** با نقش **${roleInfo.name} ${roleInfo.emoji}** را به اشتباه اعدام کردید! 🪦❌`;
      } else {
        executionMessage = `🎯 **پیروزی شهر در دادگاه!**\nبازیکن خائن **${executedPlayer.name}** با نقش **${roleInfo.name} ${roleInfo.emoji}** (عضو مافیا) با رأی قاطع اعدام شد! 🔥⚖️`;
      }
    }
  } else {
    executionMessage = "✨ شهر تصمیم گرفت امروز هیچ‌کس را اعدام نکند.";
  }

  session.round += 1;

  let isEnded = await checkGameEnd(ctx, chatIdReal, session);
  if (isEnded) return;

  const prompt = `رأی‌گیری روز به پایان رسید. نتیجه اعدام: ${executedPlayer ? executedPlayer.name : 'هیچ‌کس'}. گزارش اعدام را با بیانی حماسی اعلام کن.`;
  const voteResultReport = await askGameMaster(prompt, `اعدامی: ${executedPlayer ? executedPlayer.name : 'هیچ‌کس'}`);

  const resultText = `⚖️ **نتیجه نهایی دادگاه روز:**\n\n${voteResultReport}\n\n${executionMessage}`;

  try {
    const resMsg = await ctx.editMessageText(resultText, Markup.inlineKeyboard([
      [Markup.button.callback("🌙 ورود به فاز شب بعدی", `start_night_${chatIdReal}`)]
    ]));
    if (resMsg && resMsg.message_id) {
      try { await bot.telegram.pinChatMessage(chatIdReal, resMsg.message_id); } catch (e) {}
    }
  } catch (e) {}
});

// اکشن‌های شب در پی‌وی
bot.action(/shoot_(.+)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("🎯 شلیک شما ثبت شد!");
  try {
    await ctx.editMessageText("🎯 **شلیک شما ثبت شد و منقضی گردید.**", Markup.inlineKeyboard([]));
  } catch (e) {}
});

bot.action(/heal_(.+)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("💉 نجات ثبت شد!");
  try {
    await ctx.editMessageText("🏥 **نجات بیمار ثبت شد و منقضی گردید.**", Markup.inlineKeyboard([]));
  } catch (e) {}
});

bot.action(/detect_(.+)_(.+)/, async (ctx) => {
  const match = ctx.match;
  const chatId = match[1];
  const targetId = match[2];
  const userId = ctx.from.id;

  const session = gameSessions[chatId];
  if (!session || session.isAlive[userId] === false) {
    return ctx.answerCbQuery("❌ بازی نامعتبر است!", { show_alert: true });
  }

  if (!session.detectiveInquiries) session.detectiveInquiries = {};
  session.detectiveInquiries[userId] = targetId;

  await ctx.answerCbQuery("🔍 استعلام ثبت شد!");
  try {
    await ctx.editMessageText("🔎 **استعلام شما ثبت گردید و منقضی شد.** نتیجه صبح در پی‌وی اعلام می‌شود.", Markup.inlineKeyboard([]));
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
