update public.events
set payload = payload - 'question'
where event_name = 'ai_question_sent'
  and payload ? 'question';
