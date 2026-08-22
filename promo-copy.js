(function(root) {
  'use strict';

  const PARTNER_APPLICATION_URL = 'https://arseneleshaevwork-dotcom.github.io/baby-tma/?partner=1';

  function buildPartnerRecruitPromo(applicationUrl = PARTNER_APPLICATION_URL) {
    return `Если вам доверяют родители малышей, давайте сотрудничать.

«Режим Малыша» помогает родителям собрать режим дня по возрасту, видеть ближайшее окно сна, вести дневник сна и кормлений и получать персональные подсказки.

Партнёру:
— 30% с подходящих подтверждённых оплат;
— персональные ссылки для Telegram и веба;
— кабинет со статистикой;
— готовые промо-материалы;
— выплаты вручную от 1 000 ₽.

Подать заявку: ${String(applicationUrl || PARTNER_APPLICATION_URL).trim()}`;
  }

  function buildClientPromo(partnerLink) {
    const link = String(partnerLink || '').trim();
    return `🌙 «Режим Малыша» — спокойный помощник для родителей

Когда день малыша постоянно меняется, сложно понять, когда укладывать и что действительно помогает. Здесь всё важное собрано в одном месте:

— режим на сегодня с учётом возраста;
— ближайшее окно сна;
— дневник сна и кормлений;
— персональные подсказки;
— ИИ-помощник по вопросам режима;
— важные даты и напоминания.

Начать можно бесплатно: ${link}`;
  }

  const api = { PARTNER_APPLICATION_URL, buildPartnerRecruitPromo, buildClientPromo };
  root.BabyPromo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
