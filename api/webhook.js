const { Telegraf, Markup } = require('telegraf');
const fetch = require('node-fetch');

const bot = new Telegraf(process.env.BOT_TOKEN);

// دیتابیس موقت در حافظه برای مدیریت بازی‌ها
let gameSessions = {}; 

// تعریف نقش‌ها و ایموجی‌ها
const ROLES = {
  mafia: { name: "مافیا ساده", emoji: "🦹‍♂️", team: "mafia" },
  godfather: { name: "پدرخوانده", emoji: "🎩", team: "mafia" },
  doctor: { name: "دکتر", emoji: "💉", team: "citizen" },
  detective: { name: "کارآگاه", emoji: "🕵️‍♂️", team: "citizen" },
  sniper: { name: "تک‌تیرانداز", emoji: "🎯", team: "citizen" },
  citizen: { name: "شهروند ساده", emoji: "👤", team: "citizen" }
};

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
            "content": "تو گاد (God) و راویِ فوق‌العاده حرفه‌ای، مرموز و جذاب یک بازی مافیای تلگرامی هستی. با لحنی سینمایی و هیجان‌انگیز، وقایع بازی، شروع شب، رای‌گیری‌ها و نتایج را روایت کن."
          },
          {
            "role": "user",
            "content": `وضعیت: ${context}\n\nدرخواست: ${prompt}`
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

// تابع کمکی برای ساخت متن لابی همراه با لیست مرتب بازیکنان
function getLobbyText(players) {
  let text = "🌙 **تاریکی فرا می‌رسد...** 🌙\n\n" +
             "بازی جدید مافیا در حال ثبت‌نام است! 👥\n\n" +
             `📊 **تعداد بازیکنان تا این لحظه:** ${players.length} نفر\n\n`;

  if (players.length > 0) {
    text += "📋 **لیست بازیکنان حاضر:**\n";
    players.forEach((p, index) => {
      text += `${index + 1}. 👤 ${p.name}\n`;
    });
  } else {
    text += "📋 *هنوز هیچ‌کس به بازی نپیوسته است. اولین نفر باشید!*";
  }

  text += "\n\n⚠️ **نکته:** حتماً قبل از زدن دکمه پیوستن، ربات را در پی‌وی استارت کرده باشید تا نقش‌تان را برایتان بفرستم!";
  return text;
}

// دکمه‌های شیشه‌ای لابی (پیوستن + شروع بازی)
function getLobbyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🎮 پیوستن به بازی (Join)", "action_join")],
    [Markup.button.callback("🚀 شروع بازی (Start)", "action_start_game")]
  ]);
}

// دستور استارت ربات (در پی‌وی)
bot.start((ctx) => {
  if (ctx.chat.type === 'private') {
    ctx.reply(
      "✨ سلام! من **گاد هوشمند بازی مافیا** هستم. 🎭\n\n" +
      "من اینجا هستم تا نقش مخفی‌ات رو بهت بگم، قابلیت‌های شب رو مدیریت کنم و بازی رو پیش ببرم.\n\n" +
      "فقط کافیه منو به گروهت اضافه کنی و دستور `/mafia` رو بزنی تا بازی شروع بشه! 🚀",
      Markup.inlineKeyboard([
        [Markup.button.url("➕ افزودن ربات به گروه", `https://t.me/${bot.botInfo?.username || 'YourBotUsername'}?startgroup=true`)]
      ])
    );
  } else {
    ctx.reply("سلام! من ربات مافیا هستم. برای شروع بازی از دستورات داخل گروه استفاده کنید.");
  }
});

// دستور شروع لابی بازی در گروه
bot.command('mafia', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (ctx.chat.type === 'private') {
    return ctx.reply("❌ بازی مافیا باید داخل گروه‌ها انجام شود! لطفا مرا به گروه خود اضافه کنید.");
  }

  gameSessions[chatId] = {
    status: 'lobby', 
    players: [],     
    rolesAssigned: {} 
  };

  await ctx.reply(getLobbyText([]), getLobbyKeyboard());
});

// دکمه شیشه‌ای پیوستن به بازی
bot.action('action_join', async (ctx) => {
  const chatId = ctx.chat.id;
  const user = ctx.from;

  if (!gameSessions[chatId] || gameSessions[chatId].status !== 'lobby') {
    return ctx.answerCbQuery("❌ ثبت‌نام بازی در این گروه فعال نیست یا بازی شروع شده است!", { show_alert: true });
  }

  const exists = gameSessions[chatId].players.some(p => p.id === user.id);
  if (exists) {
    return ctx.answerCbQuery("⚠️ شما قبلاً به لیست بازیکنان پیوسته‌اید!", { show_alert: true });
  }

  gameSessions[chatId].players.push({
    id: user.id,
    name: user.first_name,
    username: user.username || user.first_name
  });

  await ctx.answerCbQuery(`✅ ${user.first_name} با موفقیت به بازی پیوست!`);

  // ویرایش پیام لابی در گروه برای آپدیت لیست و تعداد نفرات
  try {
    await ctx.editMessageText(
      getLobbyText(gameSessions[chatId].players),
      getLobbyKeyboard()
    );
  } catch (err) {
    // اگر متن پیام تغییر نکرده بود خطا ندهد
    console.log("Edit message error (safe to ignore if text didn't change):", err);
  }
});

// دستور پیوستن متنی (پشتیبانی از /join)
bot.command('join', async (ctx) => {
  const chatId = ctx.chat.id;
  const user = ctx.from;

  if (!gameSessions[chatId] || gameSessions[chatId].status !== 'lobby') {
    return ctx.reply("❌ ثبت‌نام فعالی وجود ندارد.");
  }

  const exists = gameSessions[chatId].players.some(p => p.id === user.id);
  if (exists) {
    return ctx.reply(`⚠️ ${user.first_name} عزیز، شما از قبل در لیست هستید.`);
  }

  gameSessions[chatId].players.push({
    id: user.id,
    name: user.first_name,
    username: user.username || user.first_name
  });

  // ارسال پیام جدید یا آپدیت لابی
  ctx.reply(`✅ **${user.first_name}** به لیست بازیکنان اضافه شد! (${gameSessions[chatId].players.length} نفر)`);
});

// دکمه شیشه‌ای شروع بازی (یا دستور /startgame)
async function handleGameStart(ctx, chatId) {
  const session = gameSessions[chatId];

  if (!session || session.status !== 'lobby') {
    return ctx.answerCbQuery ? ctx.answerCbQuery("❌ هیچ لابی فعالی وجود ندارد.", { show_alert: true }) : ctx.reply("❌ لابی فعالی وجود ندارد.");
  }

  if (session.players.length < 3) {
    const msg = "⚠️ تعداد بازیکنان کم است! حداقل به ۳ بازیکن نیاز داریم.";
    return ctx.answerCbQuery ? ctx.answerCbQuery(msg, { show_alert: true }) : ctx.reply(msg);
  }

  session.status = 'playing';
  const players = session.players;

  // توزیع هوشمند نقش‌ها
  const assignedRoles = {};
  players.forEach((p, index) => {
    let roleKey = 'citizen';
    if (index === 0) roleKey = 'godfather';
    else if (index === 1 && players.length >= 2) roleKey = 'doctor';
    else if (index === 2 && players.length >= 3) roleKey = 'detective';
    else if (index % 2 === 0) roleKey = 'mafia';

    assignedRoles[p.id] = roleKey;
  });

  session.rolesAssigned = assignedRoles;

  // ارسال نقش به پی‌وی هر بازیکن
  for (const p of players) {
    const roleKey = assignedRoles[p.id];
    const roleInfo = ROLES[roleKey];

    try {
      let extraText = "";
      if (roleInfo.team === 'mafia') {
        const mafiaTeam = players
          .filter(pl => assignedRoles[pl.id] === 'mafia' || assignedRoles[pl.id] === 'godfather')
          .map(pl => pl.name)
          .join('، ');
        extraText = `\n\n👥 **هم‌تیمی‌های مافیا:** ${mafiaTeam}\n(شب‌ها باید با هم برای کشتن شهروندان هماهنگ بشید!)`;
      }

      await bot.telegram.sendMessage(
        p.id,
        `🎭 **نقش شما در بازی مافیا تعیین شد!**\n\n` +
        `👤 نام شما: **${p.name}**\n` +
        `🏷 نقش: **${roleInfo.name}** ${roleInfo.emoji}\n` +
        `🛡 تیم: **${roleInfo.team === 'mafia' ? '🦹‍♂️ مافیا (خبیث)' : '🛡 شهروند (پارس/پاک)'}**` +
        extraText,
        Markup.inlineKeyboard([
          [Markup.button.callback("📜 مشاهده راهنمای نقش", "action_role_help")]
        ])
      );
    } catch (err) {
      console.log(`Could not send PM to user ${p.id}:`, err);
    }
  }

  // درخواست از هوش مصنوعی برای متن آغازین
  const prompt = `بازی با ${players.length} بازیکن شروع شد. نقش‌ها پخش شد. فاز اول (شب اول) را با بیانی حماسی اعلام کن.`;
  const aiIntro = await askGameMaster(prompt, `تعداد بازیکنان: ${players.length}`);

  const startText = `🎬 **بازی رسماً آغاز شد و نقش‌ها مخفیانه در پی‌وی به بازیکنان ارسال شد!** 🕵️‍♂️🦹‍♂️\n\n` +
                    `${aiIntro}\n\n` +
                    `🌙 **شب اول آغاز شد!** بازیکنان دارای مسئولیت به پی‌وی ربات مراجعه کنند.`;

  if (ctx.editMessageText) {
    try {
      await ctx.editMessageText(startText, Markup.inlineKeyboard([
        [Markup.button.callback("🌙 ورود به فاز شب / اکشن‌ها", "action_night_actions")]
      ]));
    } catch (e) {
      ctx.reply(startText);
    }
  } else {
    ctx.reply(startText);
  }
}

// هندلر کلیک دکمه شروع بازی
bot.action('action_start_game', async (ctx) => {
  await ctx.answerCbQuery("🚀 بازی در حال استارت است...");
  await handleGameStart(ctx, ctx.chat.id);
});

// دستور متنی شروع بازی
bot.command('startgame', (ctx) => {
  handleGameStart(ctx, ctx.chat.id);
});

// راهنمای نقش در پی‌وی
bot.action('action_role_help', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply("📖 نقش شما کاملاً محرمانه است. به هیچ‌کس اعتماد نکنید و فریب حرف دیگران را در گروه نخورید!");
});

// مدیریت کلیک دکمه فاز شب
bot.action('action_night_actions', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  let userRole = null;
  let activeChatId = null;

  for (const [chatId, session] of Object.entries(gameSessions)) {
    if (session.rolesAssigned && session.rolesAssigned[userId]) {
      userRole = session.rolesAssigned[userId];
      activeChatId = chatId;
      break;
    }
  }

  if (!userRole) {
    return ctx.reply("❌ شما در هیچ بازی فعالی حضور ندارید یا بازی هنوز شروع نشده است.");
  }

  const session = gameSessions[activeChatId];
  const playersList = session.players.filter(p => p.id !== userId);

  if (userRole === 'mafia' || userRole === 'godfather') {
    const buttons = playersList.map(p => [Markup.button.callback(`🎯 شلیک به: ${p.name}`, `shoot_${p.id}`)]);
    ctx.reply("🔫 **فاز شب مافیا:**\nکدام بازیکن را برای حذف در این شب هدف می‌گیرید؟", Markup.inlineKeyboard(buttons));
  } else if (userRole === 'doctor') {
    const buttons = session.players.map(p => [Markup.button.callback(`💉 نجات: ${p.name}`, `heal_${p.id}`)]);
    ctx.reply("🏥 **فاز شب دکتر:**\nامشب جان کدام بازیکن را نجات می‌دهید؟", Markup.inlineKeyboard(buttons));
  } else if (userRole === 'detective') {
    const buttons = playersList.map(p => [Markup.button.callback(`🕵️‍♂️ استعلام: ${p.name}`, `detect_${p.id}`)]);
    ctx.reply("🔍 **فاز شب کارآگاه:**\nهویت کدام بازیکن را استعلام می‌گیرید؟", Markup.inlineKeyboard(buttons));
  } else {
    ctx.reply("💤 شهروند ساده در شب خواب است... منتظر طلوع خورشید و فاز روز بمانید! ☀️");
  }
});

// ثبت کلیک‌های شبانه
bot.action(/shoot_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("🎯 شلیک شما ثبت شد!");
  ctx.reply("✅ شلیک ثبت شد. منتظر طلوع آفتاب باشید.");
});

bot.action(/heal_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("💉 نجات شما ثبت شد!");
  ctx.reply("✅ نجات ثبت شد.");
});

bot.action(/detect_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("🔍 استعلام گرفته شد!");
  ctx.reply("🔎 استعلام انجام شد. نتیجه در صبح اعلام می‌گردد.");
});

bot.command('help', (ctx) => {
  ctx.reply("📜 دستورات ربات:\n`/mafia` - شروع لابی در گروه\nبا دکمه‌های شیشه‌ای می‌توانید جوین شوید یا بازی را استارت بزنید.");
});

// هندلر اصلی وب‌هک Vercel
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).json({ status: 'ok' });
    } else {
      res.status(200).send('Telegram Mafia Bot is active! 🚀');
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
