// Product-level guidance that connects schedule, diary and learning content.

const BabyCoach = (() => {
  const REQUIRED_DIARY_DAYS = 3;

  function getLearningProgress(logs, requiredDays = REQUIRED_DIARY_DAYS) {
    const uniqueDates = [...new Set((Array.isArray(logs) ? logs : [])
      .map(log => String(log?.date || ''))
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
    const completed = Math.min(uniqueDates.length, requiredDays);
    return {
      completed,
      totalDays: uniqueDates.length,
      required: requiredDays,
      remaining: Math.max(0, requiredDays - completed),
      ready: completed >= requiredDays,
      percent: Math.round(completed / requiredDays * 100)
    };
  }

  function getNextSleep(blocks, now = new Date()) {
    const current = now instanceof Date ? now : new Date(now);
    if (!Array.isArray(blocks) || Number.isNaN(current.getTime())) return null;

    const candidates = blocks.map(block => {
      if (block?.tag !== 'sleep' || !/(Дневной сон|Ночной сон)/i.test(String(block?.title || ''))) return null;
      const at = timeOnDate(block.time, current);
      if (!at || at.getTime() < current.getTime() - 5 * 60000) return null;
      return { block, at };
    }).filter(Boolean).sort((a, b) => a.at - b.at);

    if (!candidates.length) return null;
    const next = candidates[0];
    const minutesUntil = Math.max(0, Math.ceil((next.at.getTime() - current.getTime()) / 60000));
    const prepareAt = new Date(next.at.getTime() - 10 * 60000);
    return {
      time: String(next.block.time || ''),
      prepareTime: formatClock(prepareAt),
      title: String(next.block.title || 'Сон'),
      note: String(next.block.note || ''),
      at: next.at.toISOString(),
      prepareAt: prepareAt.toISOString(),
      minutesUntil,
      countdown: formatDuration(minutesUntil),
      preparation: minutesUntil > 10 ? formatDuration(minutesUntil - 10) : 'сейчас'
    };
  }

  function buildMorningSummary(logs, age, sleepIntel) {
    const recent = (Array.isArray(logs) ? logs : []).slice().sort(byDate).slice(-7);
    if (!recent.length || !sleepIntel) return null;
    const latest = recent[recent.length - 1];
    const norms = sleepIntel.getSleepNorms(age);
    const night = Math.max(0, Number(latest.nightLen) || 0);
    const day = Math.max(0, Number(latest.dayNaps) || 0);
    const total = night + day;
    const delta = Math.round(total - norms.totalMin);
    const wakingCount = Math.max(0, Number(latest.nightWakings) || 0);
    const tag = Array.isArray(latest.tags) ? latest.tags[0] : null;
    const tags = Array.isArray(latest.tags) ? latest.tags : [];
    const trend = typeof sleepIntel.summarizeSleepLogs === 'function'
      ? sleepIntel.summarizeSleepLogs(recent, age).trend
      : 'flat';

    let tone = 'ok';
    let status = 'balanced';
    let title = 'Сон близок к возрастному ориентиру';
    let action = 'Сохраняйте привычные подъём и вечерний ритуал.';
    if (delta < 0 && tags.some(value => ['long_soothe', 'cry_sleep'].includes(value))) {
      tone = 'attention';
      status = 'overtired';
      title = 'Возможен перегул';
      action = 'Сегодня начните следующее укладывание на 10–15 минут раньше и отметьте результат.';
    } else if (delta < -45) {
      tone = 'attention';
      status = 'sleep_debt';
      title = 'Сегодня стоит беречь сон';
      action = 'Сделайте день спокойнее и начните вечерний ритуал на 15 минут раньше.';
    } else if (trend === 'worse') {
      tone = 'attention';
      status = 'unstable';
      title = 'Режим стал менее стабильным';
      action = 'Не меняйте весь день: сохраните подъём и скорректируйте только следующее окно сна.';
    } else if (delta > 60) {
      tone = 'info';
      status = 'extra_sleep';
      title = 'Сна получилось больше обычного';
      action = 'Ориентируйтесь на самочувствие и не сдвигайте ночь резко.';
    }

    const reasons = [];
    if (wakingCount) reasons.push(`${wakingCount} ночн. пробужд.`);
    if (tag) reasons.push(tagLabel(tag));
    return {
      tone,
      status,
      title,
      date: latest.date,
      nightMin: night,
      dayMin: day,
      totalMin: total,
      deltaMin: delta,
      stats: `${formatHours(night)} ночью · ${formatHours(day)} днём`,
      reason: reasons.length ? reasons.join(' · ') : 'без тревожных отметок',
      action
    };
  }

  function buildWeeklyReview(logs, age, sleepIntel) {
    const progress = getLearningProgress(logs);
    if (!progress.ready || !sleepIntel) return null;
    const summary = sleepIntel.summarizeSleepLogs(logs, age);
    const plan = sleepIntel.buildTomorrowPlan(summary, age, {
      wake: summary.recent[summary.recent.length - 1]?.wake || '07:00',
      bedtime: summary.recent[summary.recent.length - 1]?.bed || '20:00'
    });
    const trend = {
      improving: 'Сон постепенно улучшается',
      worse: 'Последние дни сон стал короче',
      flat: 'Режим выглядит стабильным'
    }[summary.trend] || 'Режим выглядит стабильным';
    return {
      days: summary.recent.length,
      title: `Итог за ${summary.recent.length} ${dayWord(summary.recent.length)}`,
      trend,
      night: formatHours(summary.avgNight),
      day: formatHours(summary.avgDay),
      total: formatHours(summary.avgTotal),
      sleepDebt: summary.sleepDebt ? formatHours(summary.sleepDebt) : 'нет',
      focus: plan.goal,
      reason: plan.reason,
      plan
    };
  }

  function getAgeLearningPath(age) {
    const months = Math.max(0, Number(age) || 0);
    if (months <= 3) return path('Первые месяцы', [
      ['sleep-environment', 'Безопасный и спокойный сон'],
      ['wake-windows', 'Как замечать усталость'],
      ['colic', 'Плач и колики без паники']
    ]);
    if (months <= 6) return path('Сон становится взрослее', [
      ['sleep-regression', 'Что меняется около 4 месяцев'],
      ['wake-windows', 'Подобрать окна бодрствования'],
      ['bedtime-ritual', 'Собрать короткий ритуал']
    ]);
    if (months <= 11) return path('Ритм и новые навыки', [
      ['night-waking', 'Разобрать ночные пробуждения'],
      ['growth-spurts', 'Скачки роста и развития'],
      ['complementary-food', 'Мягко встроить прикорм']
    ]);
    if (months <= 18) return path('Переход на новый режим', [
      ['nap-transition', 'Понять готовность к одному сну'],
      ['overexcitement', 'Не допускать перегула'],
      ['bedtime-ritual', 'Укрепить вечерний ритуал']
    ]);
    return path('Сон и самостоятельность', [
      ['bedtime-ritual', 'Сохранить предсказуемый вечер'],
      ['overexcitement', 'Снижать вечернее возбуждение'],
      ['dad-role', 'Разделить заботу между близкими']
    ]);
  }

  function path(title, items) {
    return { title, items: items.map(([id, label], index) => ({ id, label, step: index + 1 })) };
  }

  function timeOnDate(value, base) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    const date = new Date(base);
    date.setHours(h, m, 0, 0);
    return date;
  }

  function formatDuration(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if (value < 60) return `${value} мин`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  }

  function formatHours(minutes) {
    return `${(Math.max(0, Number(minutes) || 0) / 60).toFixed(1)} ч`;
  }

  function formatClock(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function tagLabel(tag) {
    return {
      long_soothe: 'долгое укладывание', cry_sleep: 'плач при засыпании',
      cry_wake: 'плач при пробуждении', illness: 'болезнь', travel: 'поездка',
      teeth: 'зубы', regression: 'возможный регресс', slept_well: 'спал спокойно'
    }[tag] || 'есть отметка дня';
  }

  function dayWord(value) {
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
    return 'дней';
  }

  function byDate(a, b) {
    return String(a?.date || '').localeCompare(String(b?.date || ''));
  }

  return {
    REQUIRED_DIARY_DAYS,
    getLearningProgress,
    getNextSleep,
    buildMorningSummary,
    buildWeeklyReview,
    getAgeLearningPath,
    formatDuration
  };
})();

if (typeof window !== 'undefined') window.BabyCoach = BabyCoach;
if (typeof module !== 'undefined') module.exports = BabyCoach;
