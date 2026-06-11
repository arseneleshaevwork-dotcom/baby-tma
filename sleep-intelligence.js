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

if (typeof window !== 'undefined') {
  window.SleepIntel = { getSleepNorms, summarizeSleepLogs, getAgeSleepMilestone, buildSleepSuggestions };
}

if (typeof module !== 'undefined') {
  module.exports = { getSleepNorms, summarizeSleepLogs, getAgeSleepMilestone, buildSleepSuggestions };
}
