//! A seam for "what time is it".
//!
//! [`crate::fetch::FetchClient`] rate-limits per host by comparing "now"
//! against the last time it fetched that host. Wiring that straight to
//! `OffsetDateTime::now_utc()` would force every rate-limit test to either
//! sleep in real time — slow, and flaky near the boundary — or skip testing
//! the rate limiter at all. Neither is acceptable for the one piece of this
//! crate that stands between a polite crawler and a hammered court website.
//! So "now" is a trait, and tests move a fake clock by hand instead of
//! sleeping.

use std::sync::Mutex;
use time::OffsetDateTime;

/// Anything that can tell the fetcher what time it is.
pub trait Clock: std::fmt::Debug + Send + Sync {
    /// The current time, UTC.
    fn now(&self) -> OffsetDateTime;
}

/// The real clock. What every non-test caller should use.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> OffsetDateTime {
        OffsetDateTime::now_utc()
    }
}

/// A clock a test moves by hand.
///
/// Starts at a fixed instant and only advances when [`FakeClock::advance`] is
/// called — never on its own — so a rate-limit test is deterministic rather
/// than timing-dependent. Interior mutability behind a `Mutex` because
/// [`Clock::now`] takes `&self`: the trait is shared behind a `FetchClient`,
/// not owned mutably by the code that wants to advance time.
#[derive(Debug)]
pub struct FakeClock(Mutex<OffsetDateTime>);

impl FakeClock {
    /// A fake clock that starts at `start`.
    pub fn new(start: OffsetDateTime) -> Self {
        FakeClock(Mutex::new(start))
    }

    /// Move the clock forward. There is deliberately no way to move it
    /// backward — a fetch client that ever saw time go backward would have to
    /// decide whether to trust it, and that is not a decision this crate
    /// needs to make.
    pub fn advance(&self, by: time::Duration) {
        // A poisoned mutex here means an earlier panic in this process, not
        // untrusted input misbehaving — the standard case for `.expect`
        // rather than a `Result` return.
        let mut t = self.0.lock().expect("fake clock mutex poisoned");
        *t += by;
    }
}

impl Clock for FakeClock {
    fn now(&self) -> OffsetDateTime {
        *self.0.lock().expect("fake clock mutex poisoned")
    }
}

/// Lets a caller hold an `Arc<FakeClock>` to advance after handing a clone to
/// something that owns a `Box<dyn Clock>` (like [`crate::fetch::FetchClient`]) —
/// otherwise the only handle able to call [`FakeClock::advance`] would be
/// consumed by the thing under test.
impl<C: Clock + ?Sized> Clock for std::sync::Arc<C> {
    fn now(&self) -> OffsetDateTime {
        (**self).now()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fake_clock_only_moves_when_told() {
        let start = OffsetDateTime::UNIX_EPOCH;
        let clock = FakeClock::new(start);
        assert_eq!(clock.now(), start);
        assert_eq!(clock.now(), start, "reading the clock must not advance it");

        clock.advance(time::Duration::seconds(30));
        assert_eq!(clock.now(), start + time::Duration::seconds(30));
    }

    #[test]
    fn the_system_clock_reports_something_recent() {
        // Not much to assert about real time except that it is, in fact,
        // now-ish and not the Unix epoch.
        let now = SystemClock.now();
        assert!(now.unix_timestamp() > 1_700_000_000);
    }
}
