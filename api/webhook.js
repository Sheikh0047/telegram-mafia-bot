const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ذخیره وضعیت بازی به صورت موقت در حافظه (در نسخه فوق‌پیشرفته می‌توانید از دیتابیس استفاده کنید)
let gameSessions = {}; // کلید: شناسه چت گروه، مقدار: اطلاعات بازی

// ایموجی‌های جذاب برای نقش‌ها
const ROLE_EMOJIS = {
  mafia: "🦹‍♂️",
  godfather: "🎩",
  doctor: "💉",
  detective: "🕵️‍♂️",
  citizen: "👤",
  sniper: "🎯"
};

// تابع ارتباط با OpenRouter برای مدیریت هوشمندانه بازی توسط گاد
async function askGameMaster(prompt, groupContext = "") {
  try {
    const response = "https://openrouter.ai/api/v1/chat/completions";
    const res = await fetch(response, {
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
            "content": "تو گاد (God) و راویِ حرفه‌ای و جذاب یک بازی مافیای تلگرامی هستی. با لحنی مرموز، هیجان‌انگیز، سینمایی و پر از ایموجی بازی را مدیریت کن. قوانین را دقیق اجرا کن و به بازیکنان حس یک نبرد واقعی را بده."
          },
          {
            "role": "user",
            "content": `وضعیت گروه: ${groupContext}\n\nدرخواست/رویداد جدید: ${prompt}`
          }
        ]
      })
    });

    const data = await res.json();
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    }
    return "خطا در پردازش هوش مصنوعی گاد بازی!";
  } catch (error) {
    console.error("OpenRouter Error:", error);
    return "⚠️ متأسفانه ارتباط با گاد بازی (هوش مصنوعی) دچار اختلال شد.";
  }
}

// دستور استارت ربات
bot.start((ctx) => {
  ctx.reply("✨ سلام! من **گادِ هوشمند بازی مافیا** هستم. 🎭\n\nبرای شروع بازی در گروه:\n۱. من را به گروه اضافه کنید.\n۲. دستور `/mafia` را بفرستید تا ثبت‌نام باز شود.");
});

// شروع لابی بازی مافیا
bot.command('mafia', (ctx) => {
  const chatId = ctx.chat.id;
  
  if (ctx.chat.type === 'private') {
    return ctx.reply("❌ بازی مافیا باید داخل گروه‌ها انجام شود! لطفا مرا به گروه خود اضافه کنید.");
  }

  // ایجاد یا ریست کردن لابی بازی برای این گروه
  gameSessions[chatId] = {
    status: 'lobby', // lobby, playing
    players: [],     // لیست بازیکنان { id, name }
    roles: {}        // نقش‌های تخصیص‌یافته
  };

  ctx.reply(
    "🌙 **تاریکی فرا می‌رسد...** 🌙\n\n" +
    "بازی جدید مافیا در حال ثبت‌نام است! 👥\n" +
    "کسانی که می‌خواهند در این نبرد شرکت کنند، روی دستور زیر بزنید:\n\n" +
    "👉 /join\n\n" +
    "⏳ منتظر حضور بازیکنان هستیم... (پس از تکمیل نفرات، گاد بازی را شروع می‌کند)"
  );
});

// پیوستن به بازی
bot.command('join', (ctx) => {
  const chatId = ctx.chat.id;
  const user = ctx.from;

  if (!gameSessions[chatId] || gameSessions[chatId].status !== 'lobby') {
    return ctx.reply("❌ در حال حاضر ثبت‌نام بازی فعالی در این گروه وجود ندارد. با دستور /mafia بازی را شروع کنید.");
  }

  // بررسی تکراری نبودن بازیکن
  const exists = gameSessions[chatId].players.some(p => p.id === user.id);
  if (exists) {
    return ctx.reply(`⚠️ ${user.first_name} عزیز، شما قبلاً به لیست بازیکنان پیوسته‌اید!`);
  }

  gameSessions[chatId].players.push({
    id: user.id,
    name: user.first_name
  });

  const count = gameSessions[chatId].players.length;
  ctx.reply(`✅ **${user.first_name}** با موفقیت به جمع بازیکنان پیوست! (${count} بازیکن آماده نبرد) 🎮`);
});

// شروع رسمی بازی و تقسیم نقش‌ها توسط هوش مصنوعی
bot.command('startgame', async (ctx) => {
  const chatId = ctx.chat.id;
  const session = gameSessions[chatId];

  if (!session || session.status !== 'lobby') {
    return ctx.reply("❌ هیچ لابی فعالی برای شروع بازی وجود ندارد.");
  }

  if (session.players.length < 3) {
    return ctx.reply("⚠️ تعداد بازیکنان برای شروع مافیا کم است! حداقل به ۳ بازیکن نیاز داریم.");
  }

  session.status = 'playing';
  const playersList = session.players.map(p => p.name).join(', ');

  // درخواست از هوش مصنوعی برای شروع بازی و سناریو
  const prompt = `بازی با این بازیکنان شروع شد: ${playersList}. به عنوان گاد، سناریو را آغاز کن، فاز شب را اعلام کن و به بازیکنان خوش‌آمد بگو.`;
  const aiIntro = await askGameMaster(prompt, `تعداد بازیکنان: ${session.players.length}`);

  ctx.reply(`🎬 **بازی رسماً آغاز شد!** 🎬\n\n${aiIntro}`);
});

// دستور کمک (راهنما)
bot.command('help', (ctx) => {
  ctx.reply(
    "📜 **راهنمای ربات مافیا:**\n\n" +
    "🔹 `/mafia` - شروع ثبت‌نام بازی جدید در گروه\n" +
    "🔹 `/join` - پیوستن به بازی در حال ثبت‌نام\n" +
    "🔹 `/startgame` - شروع رسمی بازی توسط گاد\n" +
    "🔹 `/help` - راهنمای ربات"
  );
});

// تنظیم وب‌هک برای Vercel
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).json({ status: 'ok' });
    } else {
      res.status(200).send('Telegram Mafia Bot with AI God is active and running on Vercel! 🚀');
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
