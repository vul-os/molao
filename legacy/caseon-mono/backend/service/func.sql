CREATE OR REPLACE FUNCTION match_file_vectors(
    query_embedding vector(512),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    file_id uuid,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fv.file_id,
        1 - (fv.embedding <-> query_embedding) AS similarity
    FROM 
        file_vectors_small fv
    WHERE 
        1 - (fv.embedding <-> query_embedding) > match_threshold
    ORDER BY 
        similarity DESC
    LIMIT match_count;
END;
$$;