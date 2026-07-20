//! `robots.txt` parsing and matching.
//!
//! Molao's crawl is polite by construction, not by operator discipline: this
//! module is the part of [`crate::fetch`] that a court or LII's own
//! `robots.txt` actually controls. It implements the common, practically
//! universal subset of the format — `User-agent`, `Disallow`, `Allow`,
//! `Crawl-delay`, `*` and `$` wildcards, longest-match-wins with `Allow`
//! breaking ties — because that subset is what real sites publish. It does
//! **not** implement `Sitemap`, `Host`, or the more exotic corners of RFC
//! 9309 (percent-encoding normalisation, `Clean-param`); a `robots.txt` using
//! those directives still parses, the directives are just ignored, and no
//! parse ever fails outright — malformed lines are skipped, matching real
//! crawlers' behaviour, because a site with a slightly broken `robots.txt`
//! should get the benefit of the doubt on the well-formed directives it did
//! write, not an all-or-nothing rejection.

/// A parsed `robots.txt`.
#[derive(Debug, Clone, Default)]
pub struct Robots {
    groups: Vec<Group>,
}

#[derive(Debug, Clone, Default)]
struct Group {
    /// Lower-cased `User-agent` tokens this group applies to. `"*"` is the
    /// wildcard group.
    agents: Vec<String>,
    rules: Vec<Rule>,
    crawl_delay: Option<f64>,
}

#[derive(Debug, Clone)]
struct Rule {
    allow: bool,
    pattern: String,
}

impl Robots {
    /// Parse a `robots.txt` body. Never fails: an unparseable line is simply
    /// not a directive, matching how every real crawler treats malformed
    /// robots files (RFC 9309 §2.2 requires implementations to be tolerant of
    /// small errors).
    pub fn parse(body: &str) -> Self {
        let mut groups: Vec<Group> = Vec::new();
        let mut current: Option<Group> = None;
        // True immediately after a `User-agent` line: a *run* of consecutive
        // `User-agent` lines shares one group and its following rules, per
        // the spec's grouping rule.
        let mut in_agent_run = false;

        for raw_line in body.lines() {
            let line = strip_comment(raw_line).trim();
            if line.is_empty() {
                continue;
            }
            let Some((field, value)) = line.split_once(':') else {
                continue;
            };
            let field = field.trim().to_ascii_lowercase();
            let value = value.trim();

            match field.as_str() {
                "user-agent" => {
                    if !in_agent_run {
                        if let Some(g) = current.take() {
                            groups.push(g);
                        }
                        current = Some(Group::default());
                    }
                    if let Some(g) = current.as_mut() {
                        g.agents.push(value.to_ascii_lowercase());
                    }
                    in_agent_run = true;
                }
                "disallow" => {
                    in_agent_run = false;
                    if let Some(g) = current.as_mut() {
                        // An empty Disallow value means "disallow nothing" —
                        // it is not a rule at all, so it must not be able to
                        // out-rank a real Allow rule of length zero.
                        if !value.is_empty() {
                            g.rules.push(Rule {
                                allow: false,
                                pattern: value.to_string(),
                            });
                        }
                    }
                }
                "allow" => {
                    in_agent_run = false;
                    if let Some(g) = current.as_mut() {
                        if !value.is_empty() {
                            g.rules.push(Rule {
                                allow: true,
                                pattern: value.to_string(),
                            });
                        }
                    }
                }
                "crawl-delay" => {
                    in_agent_run = false;
                    if let Some(g) = current.as_mut() {
                        g.crawl_delay = value.parse::<f64>().ok();
                    }
                }
                _ => {
                    // Sitemap, Host, and anything a site invents: not our
                    // concern, and not an error.
                    in_agent_run = false;
                }
            }
        }
        if let Some(g) = current.take() {
            groups.push(g);
        }
        Robots { groups }
    }

    fn matching_group(&self, user_agent: &str) -> Option<&Group> {
        let token = product_token(user_agent);
        self.groups
            .iter()
            .find(|g| g.agents.iter().any(|a| a == &token))
            .or_else(|| {
                self.groups
                    .iter()
                    .find(|g| g.agents.iter().any(|a| a == "*"))
            })
    }

    /// Is `path` allowed for `user_agent`? No matching group, or a matching
    /// group with no rule that touches `path`, means allowed — the correct,
    /// conservative default for a site that has said nothing.
    pub fn is_allowed(&self, user_agent: &str, path: &str) -> bool {
        let Some(group) = self.matching_group(user_agent) else {
            return true;
        };

        // Longest matching pattern wins; an exact-length tie goes to Allow.
        // This is the de-facto standard resolution rule (used by Google,
        // Bing, and RFC 9309's informative guidance) precisely because it
        // lets a site carve an exception out of a broad Disallow without the
        // two rules' relative order mattering.
        let mut best: Option<&Rule> = None;
        for rule in &group.rules {
            if !pattern_matches(&rule.pattern, path) {
                continue;
            }
            let take = match best {
                None => true,
                Some(b) => {
                    rule.pattern.len() > b.pattern.len()
                        || (rule.pattern.len() == b.pattern.len() && rule.allow && !b.allow)
                }
            };
            if take {
                best = Some(rule);
            }
        }
        best.is_none_or(|r| r.allow)
    }

    /// The `Crawl-delay` the matching group asked for, if any and if it
    /// parsed as a number.
    pub fn crawl_delay(&self, user_agent: &str) -> Option<time::Duration> {
        self.matching_group(user_agent)
            .and_then(|g| g.crawl_delay)
            .filter(|d| d.is_finite() && *d >= 0.0)
            .map(time::Duration::seconds_f64)
    }
}

/// The bit of a User-Agent header robots.txt matching actually compares:
/// everything before the first `/`. `"molao-node/0.1 (+https://…)"` becomes
/// `"molao-node"`.
fn product_token(user_agent: &str) -> String {
    user_agent
        .split('/')
        .next()
        .unwrap_or(user_agent)
        .trim()
        .to_ascii_lowercase()
}

fn strip_comment(line: &str) -> &str {
    match line.find('#') {
        Some(i) => &line[..i],
        None => line,
    }
}

/// Does `path` match a robots.txt `pattern`? Supports `*` (any run of
/// characters) and a trailing `$` (anchor to the end of `path`), which
/// between them cover every pattern seen in practice; anything not covered
/// degrades to a literal, still-correct prefix match.
fn pattern_matches(pattern: &str, path: &str) -> bool {
    let (pattern, anchored_end) = match pattern.strip_suffix('$') {
        Some(p) => (p, true),
        None => (pattern, false),
    };
    if pattern.is_empty() {
        return true;
    }

    let parts: Vec<&str> = pattern.split('*').collect();

    let Some(first) = parts.first() else {
        return true;
    };
    if !path.starts_with(first) {
        return false;
    }
    let mut pos = first.len();

    if parts.len() == 1 {
        return !anchored_end || pos == path.len();
    }

    for part in &parts[1..parts.len() - 1] {
        if part.is_empty() {
            continue;
        }
        match path[pos..].find(part) {
            Some(i) => pos += i + part.len(),
            None => return false,
        }
    }

    let last = parts[parts.len() - 1];
    if last.is_empty() {
        return true; // pattern ends in `*`: prefix match already satisfied
    }
    if anchored_end {
        path.len() >= pos && path[pos..].ends_with(last)
    } else {
        path[pos..].contains(last)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_robots_file_means_everything_is_allowed() {
        let robots = Robots::parse("");
        assert!(robots.is_allowed("molao-node/0.1", "/anything"));
    }

    #[test]
    fn a_disallowed_prefix_is_refused() {
        let robots = Robots::parse(
            "User-agent: *\n\
             Disallow: /private/\n",
        );
        assert!(!robots.is_allowed("molao-node/0.1", "/private/thing"));
        assert!(robots.is_allowed("molao-node/0.1", "/public/thing"));
    }

    #[test]
    fn a_longer_allow_overrides_a_shorter_disallow() {
        let robots = Robots::parse(
            "User-agent: *\n\
             Disallow: /docs/\n\
             Allow: /docs/public/\n",
        );
        assert!(!robots.is_allowed("molao-node/0.1", "/docs/secret"));
        assert!(robots.is_allowed("molao-node/0.1", "/docs/public/notice"));
    }

    #[test]
    fn our_named_group_takes_priority_over_the_wildcard_group() {
        let robots = Robots::parse(
            "User-agent: *\n\
             Disallow: /\n\
             \n\
             User-agent: molao-node\n\
             Allow: /judgments/\n",
        );
        assert!(robots.is_allowed("molao-node/0.1 (+https://example)", "/judgments/1"));
        assert!(!robots.is_allowed("some-other-bot/1.0", "/judgments/1"));
    }

    #[test]
    fn consecutive_user_agent_lines_share_one_group() {
        let robots = Robots::parse(
            "User-agent: molao-node\n\
             User-agent: other-bot\n\
             Disallow: /nope/\n",
        );
        assert!(!robots.is_allowed("molao-node/0.1", "/nope/x"));
        assert!(!robots.is_allowed("other-bot/1.0", "/nope/x"));
    }

    #[test]
    fn wildcard_and_end_anchor_patterns_match() {
        let robots = Robots::parse(
            "User-agent: *\n\
             Disallow: /*.pdf$\n",
        );
        assert!(!robots.is_allowed("molao-node/0.1", "/files/judgment.pdf"));
        assert!(robots.is_allowed("molao-node/0.1", "/files/judgment.pdf.html"));
        assert!(robots.is_allowed("molao-node/0.1", "/files/judgment.html"));
    }

    #[test]
    fn an_empty_disallow_value_disallows_nothing() {
        let robots = Robots::parse(
            "User-agent: *\n\
             Disallow:\n",
        );
        assert!(robots.is_allowed("molao-node/0.1", "/anything"));
    }

    #[test]
    fn crawl_delay_is_parsed_when_present() {
        let robots = Robots::parse(
            "User-agent: *\n\
             Crawl-delay: 5\n",
        );
        assert_eq!(
            robots.crawl_delay("molao-node/0.1"),
            Some(time::Duration::seconds(5))
        );
        assert_eq!(Robots::parse("").crawl_delay("molao-node/0.1"), None);
    }

    #[test]
    fn a_negative_crawl_delay_is_ignored_not_trusted() {
        let robots = Robots::parse(
            "User-agent: *\n\
             Crawl-delay: -5\n",
        );
        assert_eq!(robots.crawl_delay("molao-node/0.1"), None);
    }

    #[test]
    fn malformed_lines_do_not_break_parsing_of_the_rest() {
        let robots = Robots::parse(
            "this is not a directive\n\
             User-agent: *\n\
             Disallow: /private/\n\
             Sitemap: https://example.org/sitemap.xml\n",
        );
        assert!(!robots.is_allowed("molao-node/0.1", "/private/x"));
        assert!(robots.is_allowed("molao-node/0.1", "/public/x"));
    }

    #[test]
    fn comments_are_stripped() {
        let robots = Robots::parse(
            "User-agent: * # everyone\n\
             Disallow: /private/ # keep out\n",
        );
        assert!(!robots.is_allowed("molao-node/0.1", "/private/x"));
    }
}
