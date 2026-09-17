const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

const bot = new Telegraf(process.env.BOT_TOKEN);

// تابع ارتباط با OpenRouter برای مدیریت هوشمندانه بازی توسط گاد (AI)
async function askGameMaster(prompt) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
            "content": "تو گاد (God) و راویِ یک بازی مافیای تلگرامی بسیار حرفه‌ای هستی. با لحنی جذاب، مرموز و دقیق بازی را مدیریت کن، قوانین را اجرا کن، نقش‌ها را اعلام کن و وضعیت روز و شب را کنترل کن."
          },
          {
            "role": "user",
            "content": prompt
          }
        ]
      })
    });

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    } else {
      return "خطا در پردازش هوش مصنوعی گاد بازی!";
    }
  } catch (error) {
    console.error("OpenRouter Error:", error);
    error;
    return "متأسفانه ارتباط با گاد بازی (هوش مصنوعی) دچار اختلال شد.";
  }
}

// دستور شروع و معرفی ربات
bot.start(async (ctx) => {
  ctx.reply("سلام! من گادِ هوشمند بازی مافیا هستم. 🎭\nبرای شروع بازی در گروه، دستور /mafia را بزنید تا ثبت‌نام شروع شود.");
});

// دستور شروع بازی مافیا
bot.command('mafia', async (ctx) => {
  const prompt = "بازی مافیا جدیدی در گروه درخواست شده است. اعلام کن که ثبت‌نام شروع شده و بازیکنان با زدن دستور /join می‌توانند شرکت کنند.";
  const aiResponse = await askGameMaster(prompt);
  ctx.reply(aiResponse);
});

// دستور پیوستن به بازی
bot.command('join', (ctx) => {
  const username = ctx.from.first_name || "بازیکن";
  ctx.reply(`✅ ${username} با موفقیت به لیست بازیکنان مافیا اضافه شد!`);
});

// تنظیم وب‌هک برای Vercel
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).json({ status: 'ok' });
    } else {
      res.status(200).send('Telegram Mafia Bot is active and running on Vercel! 🚀');
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
