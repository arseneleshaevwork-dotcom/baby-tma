revoke all on function public.cleanup_expired_web_auth() from public, anon, authenticated;
grant execute on function public.cleanup_expired_web_auth() to service_role;

revoke all on function public.get_or_create_web_billing_guest_internal(text) from public, anon, authenticated;
grant execute on function public.get_or_create_web_billing_guest_internal(text) to service_role;
