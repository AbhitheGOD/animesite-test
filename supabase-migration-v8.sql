-- Add status column to watchlist table for per-item watch status
ALTER TABLE public.watchlist
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'plan_to_watch'
CHECK (status IN ('watching', 'completed', 'plan_to_watch'));

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS watchlist_status_idx ON public.watchlist(user_id, status);
