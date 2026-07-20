//! Full-text search over the corpus.
//!
//! ## The FTS5 query problem
//!
//! FTS5 has its own query language: `AND`, `OR`, `NOT`, `NEAR`, column filters
//! (`title:`), prefix (`*`), phrases (`"..."`), and grouping. Handing raw user
//! input to it is wrong twice over.
//!
//! It is a **correctness** problem: a lawyer searching for `S v Makwanyane
//! (CC)` gets a syntax error, because the parentheses are grouping operators.
//! Searching for `damages -delictual` silently means "NOT delictual". A search
//! box that errors on the punctuation lawyers actually type is broken.
//!
//! It is also a **safety** problem. Bound parameters stop SQL injection — and
//! this module uses them everywhere — but the FTS5 *expression* is data inside
//! a parameter, so binding does not stop a crafted expression from making the
//! query error or run pathologically (`NEAR` chains, deep nesting).
//!
//! So we do not pass user text through. [`sanitise_query`] re-*builds* the
//! expression from scratch: it extracts word tokens, discards every operator
//! character, and emits each token as a quoted phrase. The output is by
//! construction a conjunction of literal phrases — no operator can survive,
//! whatever the input. Users lose boolean syntax; they were never going to type
//! it, and a query that always works beats a query language nobody knows.
//!
//! Two conveniences survive because they are unambiguous and cannot be turned
//! into anything else: a double-quoted run is kept as one phrase, and a
//! trailing `*` on a word is kept as a prefix search.
//!
//! ## Ranking
//!
//! Results order by `bm25() - authority * AUTHORITY_WEIGHT`. In SQLite, `bm25()`
//! returns a *negative* score where more negative is more relevant, so
//! subtracting authority pushes well-cited judgments up an ascending sort. The
//! constant is a blunt instrument: it says "a leading case beats a marginally
//! better textual match", which is how a lawyer reads a result list, but it has
//! no theoretical basis and is a knob, not a finding.

use crate::error::Result;
use crate::Corpus;
use rusqlite::types::Value;

/// How strongly graph authority outweighs textual relevance. See module docs —
/// a heuristic, tuned by eye against the demo corpus.
const AUTHORITY_WEIGHT: f64 = 2.0;

/// Hard ceiling on returned rows, whatever the caller asks for. A public
/// read-only endpoint with no auth needs one bound that no request can raise.
pub const MAX_LIMIT: u32 = 100;

/// Restrictions applied alongside the text query.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SearchFilters {
    /// Neutral-citation court code, e.g. `ZACC`. Matched case-insensitively.
    pub court: Option<String>,
    /// Inclusive first year of judgment.
    pub year_from: Option<i32>,
    /// Inclusive last year of judgment.
    pub year_to: Option<i32>,
    /// Region profile, e.g. `ZA`. Matched case-insensitively.
    pub region: Option<String>,
}

impl SearchFilters {
    /// Filter by court code.
    pub fn court(mut self, code: impl Into<String>) -> Self {
        self.court = Some(code.into());
        self
    }

    /// Filter by region profile.
    pub fn region(mut self, code: impl Into<String>) -> Self {
        self.region = Some(code.into());
        self
    }

    /// Filter to an inclusive year range. Either bound may be `None`.
    pub fn years(mut self, from: Option<i32>, to: Option<i32>) -> Self {
        self.year_from = from;
        self.year_to = to;
        self
    }
}

/// One search result, shaped for the `/api/search` contract.
#[derive(Debug, Clone, PartialEq)]
pub struct Hit {
    /// Hex `DocId`.
    pub id: String,
    /// Style of cause.
    pub title: String,
    /// Court code, e.g. `ZASCA`.
    pub court: String,
    /// Full court name, or the bare code when the registry does not know it.
    pub court_name: String,
    /// Region profile the judgment is filed under, e.g. `ZA`.
    pub region: String,
    /// ISO 8601 date of judgment.
    pub date: Option<String>,
    /// Neutral citation as printed, if the judgment has one.
    pub neutral_citation: Option<String>,
    /// Matched text with `<mark>` around the terms. Empty for a browse (no
    /// query) listing, where there is nothing to mark.
    pub snippet: String,
    /// Graph authority score, as last written by `molao-graph`.
    pub authority: f64,
    /// Distinct judgments in the corpus that cite this one.
    pub cited_by_count: u64,
}

/// Rewrite arbitrary user input into a safe FTS5 expression.
///
/// Returns `None` when nothing searchable is left — an all-punctuation query
/// like `***` or `""` is not an error, it just has no terms, and callers treat
/// it as a browse rather than a failure.
///
/// The output is always a space-separated list of quoted phrases (optionally
/// prefix-marked), which FTS5 reads as a conjunction.
pub fn sanitise_query(input: &str) -> Option<String> {
    let mut terms: Vec<String> = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '"' {
            // A user-quoted run becomes exactly one phrase. Everything inside
            // is still filtered to word characters, so an embedded quote or
            // operator cannot break out.
            let mut phrase = String::new();
            for c in chars.by_ref() {
                if c == '"' {
                    break;
                }
                phrase.push(if c.is_alphanumeric() { c } else { ' ' });
            }
            let words: Vec<&str> = phrase.split_whitespace().collect();
            if !words.is_empty() {
                terms.push(format!("\"{}\"", words.join(" ")));
            }
        } else if c.is_alphanumeric() {
            let mut word = String::from(c);
            while let Some(&n) = chars.peek() {
                if n.is_alphanumeric() {
                    word.push(n);
                    chars.next();
                } else {
                    break;
                }
            }
            // A trailing `*` is the one operator we keep: it is unambiguous and
            // it is what users mean when they type it.
            let prefix = chars.peek() == Some(&'*');
            if prefix {
                chars.next();
            }
            terms.push(if prefix {
                format!("\"{word}\"*")
            } else {
                format!("\"{word}\"")
            });
        }
        // Every other character — operators, punctuation, control codes — is
        // dropped. This is the whole safety property.
    }

    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

/// SQL fragment plus bound values for the active filters.
///
/// Filters are only ever composed as `AND <fixed sql>` with `?` placeholders;
/// no user value is ever formatted into the statement text.
fn filter_sql(filters: &SearchFilters, params: &mut Vec<Value>) -> String {
    let mut sql = String::new();
    if let Some(court) = &filters.court {
        params.push(Value::Text(court.to_uppercase()));
        sql.push_str(&format!(" AND UPPER(j.court) = ?{}", params.len()));
    }
    if let Some(region) = &filters.region {
        params.push(Value::Text(crate::normalise_region(region)));
        sql.push_str(&format!(" AND UPPER(j.region) = ?{}", params.len()));
    }
    if let Some(from) = filters.year_from {
        params.push(Value::Text(format!("{from:04}")));
        // Dates are stored ISO 8601, so a lexical compare on the first four
        // characters is a correct year compare and needs no date parsing.
        sql.push_str(&format!(
            " AND j.date IS NOT NULL AND SUBSTR(j.date, 1, 4) >= ?{}",
            params.len()
        ));
    }
    if let Some(to) = filters.year_to {
        params.push(Value::Text(format!("{to:04}")));
        sql.push_str(&format!(
            " AND j.date IS NOT NULL AND SUBSTR(j.date, 1, 4) <= ?{}",
            params.len()
        ));
    }
    sql
}

impl Corpus {
    /// Search the corpus.
    ///
    /// Returns `(total_matching, page)`. `total` is the count before
    /// `limit`/`offset`, so a UI can paginate.
    ///
    /// A query with no searchable terms is a **browse**: filters still apply,
    /// results come back ordered by authority, and snippets are empty. That is
    /// deliberate — an empty search box on a legal corpus should show the
    /// leading cases, not an error.
    ///
    /// Never fails on user input: see [`sanitise_query`].
    pub fn search(
        &self,
        query: &str,
        filters: &SearchFilters,
        limit: u32,
        offset: u32,
    ) -> Result<(u64, Vec<Hit>)> {
        let limit = limit.clamp(1, MAX_LIMIT);
        match sanitise_query(query) {
            Some(expr) => self.search_matching(&expr, filters, limit, offset),
            None => self.browse(filters, limit, offset),
        }
    }

    fn search_matching(
        &self,
        expr: &str,
        filters: &SearchFilters,
        limit: u32,
        offset: u32,
    ) -> Result<(u64, Vec<Hit>)> {
        let mut params: Vec<Value> = vec![Value::Text(expr.to_string())];
        let where_sql = filter_sql(filters, &mut params);

        let count_sql = format!(
            "SELECT COUNT(*) FROM judgments_fts f \
             JOIN judgments j ON j.rowid = f.rowid \
             WHERE judgments_fts MATCH ?1{where_sql}"
        );
        let total: i64 =
            self.conn
                .query_row(&count_sql, rusqlite::params_from_iter(params.iter()), |r| {
                    r.get(0)
                })?;

        params.push(Value::Integer(i64::from(limit)));
        let limit_idx = params.len();
        params.push(Value::Integer(i64::from(offset)));
        let offset_idx = params.len();

        let sql = format!(
            "SELECT j.id, j.title, j.court, j.date, j.neutral_citation, j.authority, \
                    snippet(judgments_fts, 1, '<mark>', '</mark>', '…', 18), \
                    (SELECT COUNT(DISTINCT c.from_doc) FROM citations c WHERE c.to_doc = j.id), \
                    j.region \
             FROM judgments_fts f \
             JOIN judgments j ON j.rowid = f.rowid \
             WHERE judgments_fts MATCH ?1{where_sql} \
             ORDER BY bm25(judgments_fts) - (j.authority * {AUTHORITY_WEIGHT}), j.id \
             LIMIT ?{limit_idx} OFFSET ?{offset_idx}"
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), row_to_hit)?;
        let hits = rows.collect::<rusqlite::Result<Vec<Hit>>>()?;
        Ok((total.max(0) as u64, hits))
    }

    fn browse(&self, filters: &SearchFilters, limit: u32, offset: u32) -> Result<(u64, Vec<Hit>)> {
        let mut params: Vec<Value> = Vec::new();
        let where_sql = filter_sql(filters, &mut params);
        // `WHERE 1=1` so the filter fragments can all start with AND.
        let count_sql = format!("SELECT COUNT(*) FROM judgments j WHERE 1=1{where_sql}");
        let total: i64 =
            self.conn
                .query_row(&count_sql, rusqlite::params_from_iter(params.iter()), |r| {
                    r.get(0)
                })?;

        params.push(Value::Integer(i64::from(limit)));
        let limit_idx = params.len();
        params.push(Value::Integer(i64::from(offset)));
        let offset_idx = params.len();

        let sql = format!(
            "SELECT j.id, j.title, j.court, j.date, j.neutral_citation, j.authority, '', \
                    (SELECT COUNT(DISTINCT c.from_doc) FROM citations c WHERE c.to_doc = j.id), \
                    j.region \
             FROM judgments j WHERE 1=1{where_sql} \
             ORDER BY j.authority DESC, j.id \
             LIMIT ?{limit_idx} OFFSET ?{offset_idx}"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), row_to_hit)?;
        let hits = rows.collect::<rusqlite::Result<Vec<Hit>>>()?;
        Ok((total.max(0) as u64, hits))
    }
}

fn row_to_hit(r: &rusqlite::Row<'_>) -> rusqlite::Result<Hit> {
    let court: String = r.get(2)?;
    let cited_by: i64 = r.get(7)?;
    Ok(Hit {
        id: r.get(0)?,
        title: r.get(1)?,
        court_name: molao_core::court::lookup(&court)
            .map(|c| c.name.to_string())
            .unwrap_or_else(|| court.clone()),
        court,
        date: r.get(3)?,
        neutral_citation: r.get(4)?,
        authority: r.get(5)?,
        snippet: r.get(6)?,
        cited_by_count: cited_by.max(0) as u64,
        region: r.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_words_become_quoted_phrases() {
        assert_eq!(
            sanitise_query("unfair dismissal").as_deref(),
            Some(r#""unfair" "dismissal""#)
        );
    }

    #[test]
    fn fts5_operators_cannot_survive_sanitisation() {
        // Each of these is a valid FTS5 expression that must be reduced to
        // literal terms rather than executed as syntax.
        for (input, expected) in [
            ("damages OR NOT delict", r#""damages" "OR" "NOT" "delict""#),
            ("title:makwanyane", r#""title" "makwanyane""#),
            ("NEAR(a b, 3)", r#""NEAR" "a" "b" "3""#),
            ("((((", ""),
            ("a AND (b OR c)", r#""a" "AND" "b" "OR" "c""#),
        ] {
            let got = sanitise_query(input).unwrap_or_default();
            assert_eq!(got, expected, "input {input:?}");
            assert!(!got.contains('('), "grouping survived: {got}");
            assert!(!got.contains(':'), "column filter survived: {got}");
        }
    }

    #[test]
    fn a_user_quoted_phrase_stays_one_phrase() {
        assert_eq!(
            sanitise_query(r#""s v makwanyane""#).as_deref(),
            Some(r#""s v makwanyane""#)
        );
    }

    #[test]
    fn an_unbalanced_quote_does_not_break_out() {
        // The dangling quote must not leave the expression malformed.
        let q = sanitise_query(r#"damages "unfair dismissal"#).unwrap();
        assert_eq!(q.matches('"').count() % 2, 0, "unbalanced quotes in {q}");
    }

    #[test]
    fn a_trailing_star_is_kept_as_a_prefix_search() {
        assert_eq!(sanitise_query("delict*").as_deref(), Some(r#""delict"*"#));
        // but a bare star is not a query
        assert_eq!(sanitise_query("***"), None);
    }

    #[test]
    fn empty_and_punctuation_only_queries_are_none_not_errors() {
        assert_eq!(sanitise_query(""), None);
        assert_eq!(sanitise_query("   "), None);
        assert_eq!(
            sanitise_query("-- ; DROP TABLE judgments;"),
            Some(r#""DROP" "TABLE" "judgments""#.to_string())
        );
    }

    #[test]
    fn non_ascii_words_are_preserved() {
        // SA judgments carry Afrikaans and isiZulu text; dropping non-ASCII
        // would quietly make parts of the corpus unsearchable.
        assert_eq!(
            sanitise_query("geregtigheid").as_deref(),
            Some(r#""geregtigheid""#)
        );
        assert_eq!(sanitise_query("é").as_deref(), Some(r#""é""#));
    }
}
