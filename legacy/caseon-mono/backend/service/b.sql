CREATE OR REPLACE FUNCTION check_firm_usage_limits(input_firm_id UUID) 
RETURNS TABLE (
    can_query BOOLEAN,
    daily_usage BIGINT,
    monthly_usage BIGINT,
    daily_limit INTEGER,
    monthly_limit INTEGER,
    daily_remaining INTEGER,
    monthly_remaining INTEGER,
    plan_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH usage_counts AS (
        SELECT 
            COUNT(*) FILTER (WHERE DATE(fu.created_at) = CURRENT_DATE) as daily_count,
            COUNT(*) FILTER (WHERE fu.created_at >= DATE_TRUNC('month', CURRENT_DATE)) as monthly_count
        FROM firm_usage fu
        WHERE fu.firm_id = input_firm_id
    ),
    plan_limits AS (
        SELECT 
            COALESCE(p.name, 'Free') as name,
            COALESCE((p.limits->'limits'->>'per_day')::INTEGER, 100) as day_limit,
            COALESCE((p.limits->'limits'->>'per_month')::INTEGER, 2000) as month_limit
        FROM firms f
        LEFT JOIN plans p ON f.plan_id = p.id
        WHERE f.id = input_firm_id
    )
    SELECT 
        (uc.daily_count < pl.day_limit AND uc.monthly_count < pl.month_limit) as can_query_bool,
        uc.daily_count,
        uc.monthly_count,
        pl.day_limit,
        pl.month_limit,
        GREATEST(0, pl.day_limit - uc.daily_count::INTEGER) as daily_rem,
        GREATEST(0, pl.month_limit - uc.monthly_count::INTEGER) as monthly_rem,
        pl.name::TEXT
    FROM usage_counts uc
    CROSS JOIN plan_limits pl;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

