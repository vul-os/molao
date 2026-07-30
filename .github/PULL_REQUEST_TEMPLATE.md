<!--
Thank you for contributing. Delete any section that does not apply — a short,
accurate PR is better than a padded one.
-->

## What this changes

<!-- One or two sentences. What was wrong, and what it does now. -->

## Why

<!-- Link the issue if there is one. If this is a source-map or region-profile
     change, cite the evidence: a robots.txt, a licence page, a practice
     direction. This is a legal reference work — assertions need sources. -->

## Verification

<!-- Paste real command output. A claim of passing is not evidence. -->

```
```

- [ ] `cargo test --workspace` passes
- [ ] `cargo clippy` clean
- [ ] `npm run typecheck` and `npm run lint` pass (if `apps/web` changed)
- [ ] `npm run check-site` passes (if `site/` changed)

## Honest status

Molao's credibility rests on not overstating itself, and that is checked in
review as seriously as the code.

- [ ] I did not upgrade a "designed, not built", "not yet", or "nobody has
      done this" claim unless **this change makes it true**
- [ ] Anything still missing is still described as missing, and precisely —
      shrink a caveat truthfully rather than deleting it
- [ ] If I built part of a feature, the docs say which part is still absent

## If this touches a guard or a test

- [ ] I did not weaken, `#[ignore]`, skip, or lower an expected count to go green
- [ ] If I added or rely on a check, I **broke the thing it guards and watched
      it fail**, then reverted — reading a guard does not establish it can fail

<!-- Note on that last box: a guard sitting behind a broader integrity check can
     silently pass because the *backstop* caught your tampering, which looks
     identical to the guard being dead. To isolate one, disable the backstop
     alongside it. -->

## If this touches sourcing

- [ ] No `robots.txt`, `Content-Signal`, crawl-delay or per-judgment `Disallow`
      is bypassed, and the user agent is never disguised
- [ ] No 🔴 verdict in `docs/SOURCE-MAP.md` is weakened without published
      evidence that the source's own policy changed
