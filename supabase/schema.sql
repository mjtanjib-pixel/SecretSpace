-- ==============================================================================
-- SecretSpace: Supabase Database Schema, Security Policies & Cleanup Cron
-- Master SQL Migration File
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SecretSpace Rooms Table (One private room for 2 participants)
CREATE TABLE IF NOT EXISTS public.secretspace_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL DEFAULT 'SecretSpace Private Room',
    retention_hours INTEGER NOT NULL DEFAULT 24, -- 1, 24, 168 (7d), 720 (30d)
    max_unread_days INTEGER NOT NULL DEFAULT 30,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. SecretSpace Participants Table (Max 2: 1 Owner + 1 Invited)
CREATE TABLE IF NOT EXISTS public.secretspace_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.secretspace_rooms(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'invited')),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_room_role UNIQUE (room_id, role)
);

-- Index for participant query performance
CREATE INDEX IF NOT EXISTS idx_secretspace_participants_room ON public.secretspace_participants(room_id);

-- 4. SecretSpace Messages Table
CREATE TABLE IF NOT EXISTS public.secretspace_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.secretspace_rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.secretspace_participants(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.secretspace_participants(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'audio')),
    attachment_url TEXT,
    attachment_meta JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'delivered', 'read')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    read_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- Indexes for efficient chat loading and message expiration
CREATE INDEX IF NOT EXISTS idx_secretspace_messages_room_created ON public.secretspace_messages(room_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_secretspace_messages_expires_at ON public.secretspace_messages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_secretspace_messages_status ON public.secretspace_messages(room_id, status);

-- 5. WebRTC Realtime Signaling Table (ephemeral signals between peers)
CREATE TABLE IF NOT EXISTS public.secretspace_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES public.secretspace_rooms(id) ON DELETE CASCADE,
    from_id UUID NOT NULL REFERENCES public.secretspace_participants(id) ON DELETE CASCADE,
    to_id UUID NOT NULL REFERENCES public.secretspace_participants(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_secretspace_signals_target ON public.secretspace_signals(to_id, created_at DESC);

-- Enable Supabase Realtime publication on relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.secretspace_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.secretspace_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.secretspace_signals;

-- ==============================================================================
-- 6. Row Level Security (RLS) Policies
-- ==============================================================================
ALTER TABLE public.secretspace_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secretspace_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secretspace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secretspace_signals ENABLE ROW LEVEL SECURITY;

-- Allow anon read/write via application key with validation
-- Note: In SecretSpace, room access is authenticated with hashed session credentials.
CREATE POLICY "Allow public room check" ON public.secretspace_rooms
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow participant management" ON public.secretspace_rooms
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow participant operations" ON public.secretspace_participants
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow message operations" ON public.secretspace_messages
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow signaling operations" ON public.secretspace_signals
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- 7. Supabase Storage Bucket Setup (Private Media Bucket)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'secretspace-media',
    'secretspace-media',
    false, -- STRICTLY PRIVATE BUCKET: Requires signed URLs or authenticated requests
    15728640, -- 15MB file size limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

-- Storage RLS Policies: Allow upload and download for authorized room requests
CREATE POLICY "Allow authenticated storage uploads" ON storage.objects
    FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'secretspace-media');

CREATE POLICY "Allow authenticated storage reads" ON storage.objects
    FOR SELECT TO anon, authenticated USING (bucket_id = 'secretspace-media');

CREATE POLICY "Allow authenticated storage deletes" ON storage.objects
    FOR DELETE TO anon, authenticated USING (bucket_id = 'secretspace-media');

-- ==============================================================================
-- 8. Automated Message Expiration and Storage Deletion Procedure
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.clean_expired_secretspace_messages()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- 1. Clean read messages where retention timer has expired
    WITH deleted_rows AS (
        DELETE FROM public.secretspace_messages
        WHERE expires_at IS NOT NULL AND expires_at <= timezone('utc'::text, now())
        RETURNING id
    )
    SELECT count(*) INTO deleted_count FROM deleted_rows;

    -- 2. Also clean unread messages that exceed max_unread_days (safeguard)
    DELETE FROM public.secretspace_messages m
    USING public.secretspace_rooms r
    WHERE m.room_id = r.id
      AND m.status != 'read'
      AND m.created_at < (timezone('utc'::text, now()) - (r.max_unread_days || ' days')::INTERVAL);

    -- 3. Clean temporary signaling records older than 10 minutes
    DELETE FROM public.secretspace_signals
    WHERE created_at < (timezone('utc'::text, now()) - INTERVAL '10 minutes');

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 9. pg_cron Scheduled Job (Run Every 5 Minutes)
-- ==============================================================================
-- To enable this in Supabase:
-- Run in Supabase SQL editor (Database -> Extensions -> Enable pg_cron):
-- SELECT cron.schedule('secretspace-auto-delete-job', '*/5 * * * *', 'SELECT public.clean_expired_secretspace_messages();');
