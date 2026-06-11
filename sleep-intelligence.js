// Sleep intelligence helpers shared by diary analytics and premium insights.

function getSleepNorms(age) {
  const profile = typeof getProfile === 'function' ? getProfile(age) : null;
  const dayMin = profile ? profile.nd.reduce((sum, min) => sum + min, 0) : 180;
  const nightMin = profile ? Math.round(profile.ns * 60) : 600;
  const totalMin = profile ? Math.round(profile.ts * 60) : dayMin + nightMin;

  return {
    dayMin,
    nightMin,
    totalMin,
    label: profile ? profile.label : `${age} мес.`
  };
}

function summarizeSleepLogs(logs, age) {
  const recent = (logs || []).slice(-7);
  const norms = getSleepNorms(age);

  if (!recent.length) {
    return {
      recent,
      norms,
      avgNight: 0,
      avgDay: 0,
      avgTotal: 0,
      sleepDebt: 0,
      trend: 'flat',
      topTag: null,
      tagCounts: {}
    };
  }

  const avgNight = recent.reduce((sum, log) => sum + (log.nightLen || 0), 0) / recent.length;
  const avgDay = recent.reduce((sum, log) => sum + (log.dayNaps || 0), 0) / recent.length;
  const avgTotal = avgNight + avgDay;
  const sleepDebt = Math.max(0, Math.round((norms.totalMin - avgTotal) * recent.length));

  const firstHalf = recent.slice(0, Math.max(1, Math.floor(recent.length / 2)));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));
  const avgTotalFor = (items) => items.reduce((sum, log) => sum + (log.nightLen || 0) + (log.dayNaps || 0), 0) / items.length;
  const trendDelta = secondHalf.length ? avgTotalFor(secondHalf) - avgTotalFor(firstHalf) : 0;

  const tagCounts = {};
  recent.forEach(log => (log.tags || []).forEach(tag => {
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }));
  const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0] || null;

  return {
    recent,
    norms,
    avgNight,
    avgDay,
    avgTotal,
    sleepDebt,
    trend: trendDelta > 20 ? 'improving' : trendDelta < -20 ? 'worse' : 'flat',
    topTag,
    tagCounts
  };
}

function getAgeSleepMilestone(age) {
  if (age >= 3 && age <= 5) {
    return {
      icon: '📉',
      title: 'Возможен регресс сна',
      text: 'В 4 месяца сон часто меняется из-за созревания циклов сна. Держите ритуал и не вводите новые ассоциации.'
    };
  }
  if (age >= 7 && age <= 10) {
    return {
      icon: '🧠',
      title: 'Скачок развития',
      text: 'В 8-10 месяцев новые навыки и тревога разлуки могут ухудшать сон. Режим лучше поддерживать мягко.'
    };
  }
  if (age >= 12 && age <= 18) {
    return {
      icon: '☀️',
      title: 'Переход на один сон',
      text: 'Если второй сон срывается 5+ дней, постепенно двигайте дневной сон к 12:00-13:00.'
    };
  }
  if (age >= 18 && age <= 24) {
    return {
      icon: '💬',
      title: 'Скачок самостоятельности',
      text: 'В этом возрасте протесты перед сном часто связаны с развитием речи и границами. Помогает короткий стабильный ритуал.'
    };
  }
  return null;
}

function buildSleepSuggestions(summary, age) {
  const suggestions = [];
  const { recent, norms, avgNight, avgDay, sleepDebt, topTag, trend } = summary;
  if (!recent.length) return suggestions;

  if (sleepDebt >= 90) {
    suggestions.push({
      icon: '🌙',
      type: 'warning',
      title: 'Накопился недосып',
      text: `За ${recent.length} дн. малыш недобрал примерно ${Math.round(sleepDebt / 60 * 10) / 10}ч сна. Сегодня лучше сделать спокойный день и уложить на 15-20 мин раньше.`,
      action: 'recovery'
    });
  }

  if (avgNight < norms.nightMin - 30) {
    suggestions.push({
      icon: '🌃',
      type: 'warning',
      title: 'Ночной сон ниже ориентира',
      text: `Средний ночной сон ${(avgNight / 60).toFixed(1)}ч при ориентире ${(norms.nightMin / 60).toFixed(1)}ч. Проверьте последнее окно бодрствования и ритуал.`
    });
  }

  if (avgDay > norms.dayMin + 40 && age >= 9) {
    suggestions.push({
      icon: '☀️',
      type: 'info',
      title: 'Дневной сон может забирать ночь',
      text: `Днём получается ${(avgDay / 60).toFixed(1)}ч. Если ночь стала короче, попробуйте ограничить поздний дневной сон.`
    });
  }

  if (topTag && topTag[1] >= 2) {
    const tagInfo = typeof SLEEP_TAGS !== 'undefined'
      ? SLEEP_TAGS.find(tag => tag.id === topTag[0])
      : null;
    suggestions.push({
      icon: '🏷',
      type: 'info',
      title: 'Повторяющийся паттерн',
      text: `${tagInfo ? tagInfo.label : topTag[0]} встречается ${topTag[1]} раза за последние дни. Это хороший повод корректировать не весь режим, а именно этот участок дня.`
    });
  }

  if (trend === 'worse') {
    suggestions.push({
      icon: '📉',
      type: 'warning',
      title: 'Сон ухудшается',
      text: 'Последние дни суммарного сна становится меньше. Попробуйте 2 дня без поездок, гостей и поздних активностей.'
    });
  }

  const milestone = getAgeSleepMilestone(age);
  if (milestone) {
    suggestions.push({ ...milestone, type: 'info' });
  }

  if (!suggestions.length) {
    suggestions.push({
      icon: '✨',
      type: 'success',
      title: 'Режим выглядит стабильным',
      text: 'По последним записям сон близок к возрастной норме. Сохраняйте ритуал и гибкость +/- 20 минут.'
    });
  }

  return suggestions.slice(0, 4);
}

function buildTomorrowPlan(summary, age, context = {}) {
  const milestone = getAgeSleepMilestone(age);

  if (summary.sleepDebt >= 90 || summary.trend === 'worse') {
    return {
      type: 'recovery',
      icon: '🌙',
      goal: 'Компенсировать недосып',
      title: 'Восстановительный день',
      target: 'спокойный день + раннее укладывание',
      reason: `За последние дни накопилось около ${(summary.sleepDebt / 60).toFixed(1)}ч недосыпа, поэтому завтра важнее восстановление, а не идеальная активность.`,
      schedule: [
        { label: 'Подъём', value: shiftTime(context.wake || '07:00', 15) },
        { label: 'Дневной сон', value: 'на 15-20 мин длиннее обычного' },
        { label: 'Ночь', value: shiftTime(context.bedtime || '20:00', -20) }
      ],
      rules: [
        'Сделайте тихий день: меньше гостей, поездок и активных игр.',
        'Начните вечерний ритуал на 20 минут раньше.',
        'Если дневной сон короткий, не компенсируйте поздними активностями вечером.'
      ],
      apply: {
        wakeShift: 15,
        bedtimeShift: -20,
        buffer: 20,
        situation: 'normal'
      }
    };
  }

  if (age >= 12 && age <= 18) {
    return {
      type: 'transition',
      icon: '☀️',
      goal: 'Мягко держать один дневной сон',
      title: 'День стабилизации перехода',
      target: 'один сон в середине дня',
      reason: milestone ? milestone.text : 'В этом возрасте режим часто перестраивается, поэтому лучше держать понятные якоря дня.',
      schedule: [
        { label: 'Подъём', value: context.wake || '07:00' },
        { label: 'Дневной сон', value: '12:00-13:00 старт' },
        { label: 'Ночь', value: context.bedtime || '19:30' }
      ],
      rules: [
        'Держите дневной сон в коридоре 12:00-13:00.',
        'Если малыш просится на второй сон, сделайте короткий отдых до 20 минут.',
        'Не сдвигайте ночь позже, даже если дневной сон был длинным.'
      ],
      apply: {
        wakeShift: 0,
        bedtimeShift: 0,
        buffer: 10,
        situation: 'normal'
      }
    };
  }

  if (summary.topTag && summary.topTag[0] === 'long_soothe') {
    return {
      type: 'settling',
      icon: '⏳',
      goal: 'Сократить долгое укладывание',
      title: 'День точного окна сна',
      target: 'ритуал раньше, меньше перевозбуждения',
      reason: 'Долгое укладывание повторяется несколько дней. Часто помогает не менять весь режим, а точнее поймать последнее окно бодрствования.',
      schedule: [
        { label: 'Активность', value: 'убрать за 60 мин до сна' },
        { label: 'Ритуал', value: 'начать на 15 мин раньше' },
        { label: 'Ночь', value: shiftTime(context.bedtime || '20:00', -15) }
      ],
      rules: [
        'Последний час без активных игр и экранов.',
        'Сделайте один и тот же короткий ритуал.',
        'Если плач усиливается, вернитесь к контакту и повторите попытку мягко.'
      ],
      apply: {
        wakeShift: 0,
        bedtimeShift: -15,
        buffer: 10,
        situation: 'normal'
      }
    };
  }

  return {
    type: 'stable',
    icon: '✨',
    goal: 'Сохранить стабильность',
    title: 'Обычный день по режиму',
    target: 'сохранить текущие якоря',
    reason: 'Сон близок к возрастной норме. Завтра лучше ничего резко не менять.',
    schedule: [
      { label: 'Подъём', value: context.wake || '07:00' },
      { label: 'Дневной сон', value: 'по текущему режиму' },
      { label: 'Ночь', value: context.bedtime || '20:00' }
    ],
    rules: [
      'Сохраняйте подъём и вечерний ритуал.',
      'Отклонение 15-20 минут допустимо.',
      'Запишите день в дневник, чтобы видеть тренд.'
    ],
    apply: {
      wakeShift: 0,
      bedtimeShift: 0,
      buffer: 0,
      situation: 'normal'
    }
  };
}

function shiftTime(time, deltaMin) {
  const parts = String(time || '07:00').split(':').map(Number);
  const h = Number.isFinite(parts[0]) ? parts[0] : 7;
  const m = Number.isFinite(parts[1]) ? parts[1] : 0;
  const total = (h * 60 + m + deltaMin + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

if (typeof window !== 'undefined') {
  window.SleepIntel = { getSleepNorms, summarizeSleepLogs, getAgeSleepMilestone, buildSleepSuggestions, buildTomorrowPlan };
}

if (typeof module !== 'undefined') {
  module.exports = { getSleepNorms, summarizeSleepLogs, getAgeSleepMilestone, buildSleepSuggestions, buildTomorrowPlan };
}
