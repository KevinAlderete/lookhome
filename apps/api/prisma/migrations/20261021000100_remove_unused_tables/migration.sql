BEGIN;

-- Stop before any DDL if a target table contains data in any deployment.
DO $guard$
DECLARE
  candidate_table text;
  has_rows boolean;
BEGIN
  FOREACH candidate_table IN ARRAY ARRAY[
    'audit_logs',
    'domain_events',
    'feature_flags',
    'fees_config',
    'invoices',
    'media_variants',
    'notification_channels',
    'oauth_accounts',
    'payments',
    'payouts',
    'rate_limits',
    'refunds',
    'saved_searches',
    'search_index_jobs',
    'trust_scores',
    'user_documents'
  ] LOOP
    IF to_regclass(format('%I.%I', 'public', candidate_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I LIMIT 1)',
      'public',
      candidate_table
    ) INTO has_rows;

    IF has_rows THEN
      RAISE EXCEPTION
        'Refusing to drop public.%: it contains data; export and review it before applying this migration',
        candidate_table;
    END IF;
  END LOOP;
END
$guard$;

-- Remove dependent historical finance tables first.
DROP TABLE IF EXISTS public.refunds;
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.payouts;
DROP TABLE IF EXISTS public.invoices;

DROP TABLE IF EXISTS public.fees_config;
DROP TABLE IF EXISTS public.search_index_jobs;
DROP TABLE IF EXISTS public.saved_searches;
DROP TABLE IF EXISTS public.audit_logs;
DROP TABLE IF EXISTS public.domain_events;
DROP TABLE IF EXISTS public.feature_flags;
DROP TABLE IF EXISTS public.rate_limits;
DROP TABLE IF EXISTS public.oauth_accounts;
DROP TABLE IF EXISTS public.trust_scores;
DROP TABLE IF EXISTS public.notification_channels;
DROP TABLE IF EXISTS public.user_documents;
DROP TABLE IF EXISTS public.media_variants;

DROP TYPE IF EXISTS public.payment_provider;
DROP TYPE IF EXISTS public.payment_status;
DROP TYPE IF EXISTS public.payout_status;
DROP TYPE IF EXISTS public.refund_status;
DROP TYPE IF EXISTS public.invoice_status;
DROP TYPE IF EXISTS public.document_type;
DROP TYPE IF EXISTS public.notification_channel_type;
DROP TYPE IF EXISTS public.notify_frequency;
DROP TYPE IF EXISTS public.search_job_action;
DROP TYPE IF EXISTS public.search_job_status;
DROP TYPE IF EXISTS public.domain_event_status;

COMMIT;
