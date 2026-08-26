-- ═══════════════════════════════════════════════════════════════════
-- TOTAL_SCORE TRIGGER (race condition жою)
-- questions-ке өзгеріс болғанда variants.total_score автоматты қайта есептеледі.
-- Клиенттегі қолмен жаңарту коды (localStorage.ts) алынып тасталды.
-- Вставьте весь файл в SQL Editor проекта Supabase и нажмите RUN.
-- Скрипт безопасен для повторного запуска.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_variant_total_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  -- Сұрақ бойынша бірден көп variant_id өзгерсе, ескі нұсқаны да жаңарту керек
  IF TG_OP = 'UPDATE' AND OLD.variant_id IS DISTINCT FROM NEW.variant_id THEN
    UPDATE public.variants
    SET total_score = (SELECT COUNT(*) FROM public.questions WHERE variant_id = OLD.variant_id)
    WHERE id = OLD.variant_id;
  END IF;

  v_id := COALESCE(NEW.variant_id, OLD.variant_id);
  UPDATE public.variants
  SET total_score = (SELECT COUNT(*) FROM public.questions WHERE variant_id = v_id)
  WHERE id = v_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_variant_total_score_trigger ON public.questions;
CREATE TRIGGER sync_variant_total_score_trigger
  AFTER INSERT OR DELETE OR UPDATE OF variant_id ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.sync_variant_total_score();

-- Бар мәндерді қалпына келтіру (егер қандай да бір себеппен дұрыс емес болса)
UPDATE public.variants v
SET total_score = (SELECT COUNT(*) FROM public.questions q WHERE q.variant_id = v.id);