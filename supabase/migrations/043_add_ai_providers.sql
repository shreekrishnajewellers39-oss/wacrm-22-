-- ============================================================
-- 043_add_ai_providers
--
-- Expands supported AI providers in `ai_configs` and `ai_usage_log`
-- beyond OpenAI and Anthropic to include:
--   - 'gemini'     (Google AI Studio / Gemini)
--   - 'groq'       (Groq Llama 3)
--   - 'deepseek'   (DeepSeek)
--   - 'openrouter' (OpenRouter)
--
-- Idempotent — safe to re-run.
-- ============================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname, relname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname IN ('ai_configs', 'ai_usage_log')
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%provider%'
    ) LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.relname) || ' DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE ai_configs ADD CONSTRAINT ai_configs_provider_check 
  CHECK (provider IN ('openai', 'anthropic', 'gemini', 'groq', 'deepseek', 'openrouter'));

ALTER TABLE ai_usage_log ADD CONSTRAINT ai_usage_log_provider_check 
  CHECK (provider IN ('openai', 'anthropic', 'gemini', 'groq', 'deepseek', 'openrouter'));
