-- Run this in Supabase SQL Editor to confirm all pending users
UPDATE auth.users 
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL;
