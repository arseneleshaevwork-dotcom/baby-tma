const MAX_NAME_LENGTH = 24;

export function buildBotReply({ text = '', firstName = '', baby = null, miniAppUrl = '', now = new Date() } = {}) {
  const cleanText = String(text || '').trim();
  const name = String(firstName || '').trim() || 'мама';
  const reminderConsent = parseReminderConsent(cleanText);

  if (reminderConsent !== null) {
    return {
      action: reminderConsent ? 'enable_reminders' : 'disable_reminders',
      text: reminderConsent
        ? 'Готово. Буду мягко напоминать о важных датах малыша и возрастных этапах. Открывайте мини-приложение, чтобы собрать режим на сегодня.'
        : 'Хорошо, напоминания отключила. Если передумаете, напишите /reminders_on.',
      reply_markup: openAppKeyboard(miniAppUrl)
    };
  }

  if (cleanText === '/help') {
    return {
      action: 'help',
      text: buildHelpText(),
      reply_markup: openAppKeyboard(miniAppUrl)
    };
  }

  if (cleanText === '/profile') {
    if (!baby?.name && !baby?.birthdate) {
      return {
        action: 'ask_name',
        text: 'Профиль малыша пока не заполнен.\n\nКак зовут малыша? Напишите имя одним сообщением.',
        reply_markup: openAppKeyboard(miniAppUrl)
      };
    }
    return {
      action: 'show_profile',
      text: buildProfileText(baby),
      reply_markup: profileKeyboard(miniAppUrl)
    };
  }

  if (cleanText === '/reset') {
    return {
      action: 'reset_profile',
      text: 'Профиль малыша сброшен.\n\nНачнем заново. Как зовут малыша? Напишите имя одним сообщением.',
      reply_markup: openAppKeyboard(miniAppUrl)
    };
  }

  if (cleanText.startsWith('/start')) {
    return {
      action: baby?.name ? 'welcome_back' : 'ask_name',
      text: baby?.name
        ? `🌸 ${name}, рада видеть вас снова.\n\nЯ помогу вести режим ${baby.name}: сон, кормления, дневник, ИИ-подсказки и важные даты.\n\nОткройте мини-приложение, чтобы собрать план на сегодня.`
        : `🌸 ${name}, добро пожаловать в «Режим малыша».\n\nЯ помогу:\n• собрать спокойный режим дня;\n• вести дневник сна и кормлений;\n• подсказать, что меняется по возрасту;\n• напомнить о важных датах малыша.\n\nКак зовут малыша? Напишите имя одним сообщением.`,
      reply_markup: openAppKeyboard(miniAppUrl)
    };
  }

  if (!baby?.name && isLikelyBabyName(cleanText)) {
    const babyName = normalizeName(cleanText);
    return {
      action: 'save_name',
      profile: { name: babyName },
      text: `Приятно познакомиться, ${babyName}.\n\nТеперь пришлите дату рождения малыша в формате ДД.ММ.ГГГГ. Например: 20.12.2025.\n\nТак я смогу поздравлять с важными датами и точнее подбирать режим по возрасту.`,
      reply_markup: skipBirthdateKeyboard(miniAppUrl)
    };
  }

  if (cleanText === 'skip_birthdate' && baby?.name && !baby?.birthdate) {
    return {
      action: 'skip_birthdate',
      text: `Хорошо, дату рождения можно добавить позже.\n\nЯ все равно помогу с режимом и дневником. Включить напоминания о важных событиях и подсказках?`,
      reply_markup: remindersKeyboard(miniAppUrl)
    };
  }

  if (baby?.name && !baby?.birthdate) {
    const birthdate = normalizeBirthdate(cleanText);
    if (birthdate) {
      const ageMonths = calculateAgeMonths(birthdate, now);
      const nextMonth = ageMonths + 1;
      return {
        action: 'save_birthdate',
        profile: {
          name: baby.name,
          birthdate,
          age_months: ageMonths
        },
        text: `Готово. Я сохранила дату рождения.\n\n${baby.nameForText || baby.name} сейчас ${formatAge(ageMonths)}. ${baby.nameForText || baby.name} скоро ${formatAge(nextMonth)} — я напомню, когда подойдет важная дата.\n\nВключить напоминания о днях рождения и возрастных этапах?`,
        reply_markup: remindersKeyboard(miniAppUrl)
      };
    }

    return {
      action: 'ask_birthdate',
      text: `Пришлите дату рождения ${baby.name} в формате ДД.ММ.ГГГГ. Например: 20.12.2025.\n\nЕсли хотите пропустить, нажмите кнопку ниже.`,
      reply_markup: skipBirthdateKeyboard(miniAppUrl)
    };
  }

  return {
    action: 'help',
    text: buildHelpText(),
    reply_markup: openAppKeyboard(miniAppUrl)
  };
}

export function parseReminderConsent(text = '') {
  const value = String(text || '').trim().toLowerCase();
  if (['/reminders_on', 'reminders_on', 'да', 'да, включить', 'включить', 'ок', 'хорошо'].includes(value)) return true;
  if (['/reminders_off', 'reminders_off', 'нет', 'не сейчас', 'выключить', 'позже'].includes(value)) return false;
  return null;
}

export function normalizeBirthdate(text = '') {
  const value = String(text || '').trim();
  const dotted = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const dashed = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const year = dotted ? Number(dotted[3]) : dashed ? Number(dashed[1]) : null;
  const month = dotted ? Number(dotted[2]) : dashed ? Number(dashed[2]) : null;
  const day = dotted ? Number(dotted[1]) : dashed ? Number(dashed[3]) : null;
  if (!year || !month || !day) return null;
  if (year < 2015 || year > new Date().getUTCFullYear()) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function calculateAgeMonths(birthdate, now = new Date()) {
  const birth = parseDateOnly(birthdate);
  const current = now instanceof Date ? now : new Date(now);
  if (!birth || Number.isNaN(current.getTime())) return null;
  let months = (current.getUTCFullYear() - birth.getUTCFullYear()) * 12
    + current.getUTCMonth() - birth.getUTCMonth();
  if (current.getUTCDate() < birth.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function isLikelyBabyName(text) {
  if (!text || text.startsWith('/')) return false;
  if (normalizeBirthdate(text)) return false;
  return /^[а-яёА-ЯЁa-zA-Z\s-]{2,24}$/.test(text);
}

function normalizeName(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME_LENGTH);
}

function formatAge(months) {
  if (months === null || months === undefined) return 'возраст не указан';
  if (months === 1) return '1 месяц';
  if ([2, 3, 4].includes(months)) return `${months} месяца`;
  if (months === 12) return '1 год';
  if (months > 12) {
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return rest ? `${years} г. ${rest} мес.` : `${years} г.`;
  }
  return `${months} месяцев`;
}

function buildProfileText(baby = {}) {
  const name = baby.name || 'не указано';
  const birthdate = baby.birthdate || 'не указана';
  const age = baby.age_months === null || baby.age_months === undefined
    ? 'возраст не указан'
    : formatAge(Number(baby.age_months));
  return `👶 Профиль малыша\n\nИмя: ${name}\nДата рождения: ${birthdate}\nВозраст: ${age}\n\nОткройте мини-приложение, чтобы собрать режим на сегодня или вести дневник.`;
}

function buildHelpText() {
  return `Я помогу с режимом малыша: сон, кормления, дневник, ИИ-подсказки и напоминания.\n\nКоманды:\n/start — начать заново\n/profile — профиль малыша\n/reminders_on — включить напоминания\n/reminders_off — отключить напоминания\n/reset — сбросить профиль малыша\n/help — помощь\n\nМожно просто открыть мини-приложение и собрать режим на сегодня.`;
}

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function openAppKeyboard(miniAppUrl) {
  return {
    inline_keyboard: [[{
      text: 'Открыть мини-приложение',
      web_app: { url: miniAppUrl }
    }]]
  };
}

function skipBirthdateKeyboard(miniAppUrl) {
  return {
    inline_keyboard: [
      [{ text: 'Открыть мини-приложение', web_app: { url: miniAppUrl } }],
      [{ text: 'Пропустить дату', callback_data: 'skip_birthdate' }]
    ]
  };
}

function remindersKeyboard(miniAppUrl) {
  return {
    inline_keyboard: [
      [{ text: 'Да, включить', callback_data: 'reminders_on' }],
      [{ text: 'Не сейчас', callback_data: 'reminders_off' }],
      [{ text: 'Открыть мини-приложение', web_app: { url: miniAppUrl } }]
    ]
  };
}

function profileKeyboard(miniAppUrl) {
  return {
    inline_keyboard: [
      [{ text: 'Открыть мини-приложение', web_app: { url: miniAppUrl } }],
      [{ text: 'Сбросить профиль', callback_data: '/reset' }]
    ]
  };
}
