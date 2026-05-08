-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  psychiatrist_id uuid REFERENCES public.profiles(id),
  is_psychiatrist_active boolean NOT NULL DEFAULT false,
  last_message text,
  last_message_role text, -- 'caregiver' or 'assistant'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(caregiver_id)
);

-- Enable realtime on this table
ALTER TABLE public.active_sessions REPLICA IDENTITY FULL;
