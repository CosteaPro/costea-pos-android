INSERT INTO public.platform_admins (user_id)
SELECT u.id FROM auth.users u WHERE lower(u.email) = 'info@costeapro.com'
ON CONFLICT DO NOTHING;