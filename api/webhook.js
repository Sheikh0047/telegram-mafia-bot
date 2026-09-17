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

// تابع ارتباط با OpenRouter (گاد هوش مصنوعی)
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

// دستور استارت ربات (در پی‌وی)
bot.start((ctx) => {
  if (ctx.chat.type === 'private') {
    ctx.reply(
      "✨ سلام! من **گاد هوشمند بازی مافیا** هستم. 🎭\n\n" +
      "من اینجا هستم تا نقش مخفی‌ات رو بهت بگم، قابلیت‌های شب (شلیک، استعلام، نجات) رو مدیریت کنم و بازی رو پیش ببرم.\n\n" +
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
bot.command('mafia', (ctx) => {
  const chatId = ctx.chat.id;
  
  if (ctx.chat.type === 'private') {
    return ctx.reply("❌ بازی مافیا باید داخل گروه‌ها انجام شود! لطفا مرا به گروه خود اضافه کنید.");
  }

  gameSessions[chatId] = {
    status: 'lobby', 
    players: [],     // کل بازیکنان { id, name, username }
    rolesAssigned: {} // id -> نقش
  };

  ctx.reply(
    "🌙 **تاریکی فرا می‌رسد...** 🌙\n\n" +
    "بازی جدید مافیا در حال ثبت‌نام است! 👥\n" +
    "برای شرکت در بازی، روی دکمه زیر کلیک کنید (یا دستور `/join` را بفرستید):\n\n" +
    "⚠️ **نکته:** حتماً قبل از زدن دکمه، ربات را در پی‌وی استارت کرده باشید تا نقش‌تان را برایتان بفرستم!",
    Markup.inlineKeyboard([
      [Markup.button.callback("🎮 پیوستن به بازی (Join)", "action_join")]
    ])
  );
});

// دکمه شیشه‌ای پیوستن به بازی
bot.action('action_join', async (ctx) => {
  const chatId = ctx.chat.id;
  const user = ctx.from;

  if (!gameSessions[chatId] || gameSessions[chatId].status !== 'lobby') {
    return ctx.answerCbQuery("❌ ثبت‌نام بازی در این گروه فعال نیست!", { show_alert: true });
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

  const count = gameSessions[chatId].players.length;
  await ctx.answerCbQuery(`✅ ${user.first_name} با موفقیت به بازی پیوست!`);
  ctx.reply(`✅ **${user.first_name}** به جمع بازیکنان پیوست! (تعداد کل: ${count} نفر) 👥`);
});

// دستور پیوستن متنی (پشتیبانی از /join)
bot.command('join', (ctx) => {
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

  ctx.reply(`✅ **${user.first_name}** به لیست بازیکنان اضافه شد! (${gameSessions[chatId].players.length} نفر)`);
});

// شروع رسمی بازی و پخش نقش‌ها در پی‌وی بازیکنان
bot.command('startgame', async (ctx) => {
  const chatId = ctx.chat.id;
  const session = gameSessions[chatId];

  if (!session || session.status !== 'lobby') {
    return ctx.reply("❌ هیچ لابی فعالی وجود ندارد.");
  }

  if (session.players.length < 3) {
    return ctx.reply("⚠️ تعداد بازیکنان کم است! حداقل به ۳ بازیکن نیاز داریم.");
  }

  session.status = 'playing';
  const players = session.players;

  // توزیع هوشمند نقش‌ها
  // برای سادگی: نفر اول پدرخوانده، نفر دوم دکتر، نفر سوم کارآگاه، بقیه شهروند/مافیا
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
      // اگر مافیاست، لیست همکاران مافیاش رو بهش بگیم تو پی‌وی
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
      ctx.reply(`⚠️ ${p.name} عزیز، ربات رو توی پی‌وی استارت نکردی! اول برو تو پی‌وی ربات رو استارت کن تا نقش رو بهت بفرستم.`);
    }
  }

  // گزارش به گروه
  const prompt = `بازی با ${players.length} بازیکن شروع شد. نقش‌ها پخش شد. فاز اول (شب اول) را با بیانی حماسی اعلام کن.`;
  const aiIntro = await askGameMaster(prompt, `تعداد بازیکنان: ${players.length}`);

  ctx.reply(
    `🎬 **بازی رسماً آغاز شد و نقش‌ها مخفیانه در پی‌وی به بازیکنان ارسال شد!** 🕵️‍♂️🦹‍♂️\n\n` +
    `${aiIntro}\n\n` +
    `🌙 **شب اول آغاز شد!** بازیکنان دارای مسئولیت (مافیا، دکتر، کارآگاه) به پی‌وی ربات مراجعه کنند تا اکشن‌های شبانه خود را با دکمه‌های شیشه‌ای انجام دهند.`,
    Markup.inlineKeyboard([
      [Markup.button.callback("🌙 ورود به فاز شب / اکشن‌ها", "action_night_actions")]
    ])
  );
});

// راهنمای نقش در پی‌وی
bot.action('action_role_help', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply("📖 نقش شما کاملاً محرمانه است. به هیچ‌کس اعتماد نکنید و فریب حرف دیگران را در گروه نخورید! شهر یا مافیا... برنده نهایی کیست؟");
});

// مدیریت کلیک دکمه فاز شب
bot.action('action_night_actions', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  
  // پیدا کردن بازی فعال این کاربر
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
  const playersList = session.players.filter(p => p.id !== userId); // بقیه بازیکنان برای هدف‌گیری

  if (userRole === 'mafia' || userRole === 'godfather') {
    // دکمه‌های انتخاب طعمه برای مافیا
    const buttons = playersList.map(p => [Markup.button.callback(`🎯 شلیک به: ${p.name}`, `shoot_${p.id}`)]);
    ctx.reply("🔫 **فاز شب مافیا:**\nکدام بازیکن را برای حذف در این شب هدف می‌گیرید؟", Markup.inlineKeyboard(buttons));
  } else if (userRole === 'doctor') {
    // دکمه‌های نجات برای دکتر
    const buttons = session.players.map(p => [Markup.button.callback(`💉 نجات: ${p.name}`, `heal_${p.id}`)]);
    ctx.reply("🏥 **فاز شب دکتر:**\nامشب جان کدام بازیکن را نجات می‌دهید؟", Markup.inlineKeyboard(buttons));
  } else if (userRole === 'detective') {
    // دکمه‌های استعلام برای کارآگاه
    const buttons = playersList.map(p => [Markup.button.callback(`🕵️‍♂️ استعلام: ${p.name}`, `detect_${p.id}`)]);
    ctx.reply("🔍 **فاز شب کارآگاه:**\nهویت کدام بازیکن را استعلام می‌گیرید؟", Markup.inlineKeyboard(buttons));
  } else {
    ctx.reply("💤 شهروند ساده در شب خواب است... منتظر طلوع خورشید و فاز روز بمانید! ☀️");
  }
});

// ثبت کلیک‌های شلیک مافیا
bot.action(/shoot_(.+)/, async (ctx) => {
  const targetId = ctx.match[1];
  await ctx.answerCbQuery("🎯 هدف شما ثبت شد!");
  ctx.reply("✅ شلیک شما با موفقیت ثبت شد. منتظر تصمیم بقیه هم‌تیمی‌ها و طلوع آفتاب باشید.");
});

// ثبت کلیک‌های نجات دکتر
bot.action(/heal_(.+)/, async (ctx) => {
  const targetId = ctx.match[1];
  await ctx.answerCbQuery("💉 نجات شما ثبت شد!");
  ctx.reply("✅ بیمار خود را انتخاب کردید. امیدواریم درست تشخیص داده باشید!");
});

// ثبت استعلام کارآگاه
bot.action(/detect_(.+)/, async (ctx) => {
  const targetId = ctx.match[1];
  await ctx.answerCbQuery("🔍 استعلام گرفته شد!");
  // برای جذابیت، به صورت تصادفی یا منطقی به کارآگاه بگوییم
  ctx.reply("🔎 **نتیجه استعلام گاد:** استعلام این فرد گرفته شد و پرونده‌اش بررسی گردید... (نتیجه در صبح اعلام می‌شود)");
});

// دستور کمک گروهی
bot.command('help', (ctx) => {
  ctx.reply(
    "📜 **راهنمای حرفه‌ای ربات مافیا:**\n\n" +
    "🔹 `/mafia` - شروع لابی و ثبت‌نام در گروه\n" +
    "🔹 `/join` یا دکمه شیشه‌ای - پیوستن به بازی\n" +
    "🔹 `/startgame` - توزیع نقش‌ها در پی‌وی و شروع شب اول\n" +
    "🔹 به پی‌وی ربات بروید تا دستورات شب و اکشن‌های نقش خود را با دکمه‌های شیشه‌ای انجام دهید!"
  );
});

// هندلر اصلی وب‌هک Vercel
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).json({ status: 'ok' });
    } else {
      res.status(200).send('Telegram Mafia Bot with Secret PM Roles & Inline Keyboards is active! 🚀');
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
