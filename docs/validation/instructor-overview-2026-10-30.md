# Instructor review queue and class overview

Implemented locally on `feature/student-dashboard-home`, above the existing five-row session table. No new database fields or dependencies are required.

## Review queue

Uses the latest played, received attempt per student/scenario, excluding test sessions. Flags an incomplete received record, a score requiring verification review, an unavailable verified final score, or a recorded 1.7.0 component below 50% of its maximum. The threshold is explicitly a teaching review suggestion, not a passing grade. Verification problems sort first; newer attempts sort first within each priority.

Each row gives the student, scenario, class, date and concrete reason, with a link to session information or score summary. Five entries appear initially; additional entries are available through an accessible disclosure. No live headset state, risk prediction, grade override or completed professor review is inferred.

## Class overview

Only completed, verified, non-test attempts qualify. Within each scenario/content/scoring/ground-truth group, each student contributes their latest played qualifying attempt once, including when they have records in multiple selected classes. Later upload receipts do not turn older gameplay into the latest attempt. Groups are never averaged together; a selector switches the displayed group while preserving filters.

The overview shows the average deduction score, student count, and reasoning /60, relationships /25 and conclusion /15 component means. Each component states its own count of recorded results. Missing, invalid or historical components remain unavailable; recorded zero is retained. Historical overall results are labeled separately. Recorder documentation remains a separate score available inside the session.

Filters apply to both panels and the session table. Overview calculations cover all matching records, not only the paginated rows. Invalid dates suppress the overview rather than presenting misleading zero results.

## Validation

- 105 dashboard checks pass; six existing Unity-source-dependent checks remain skipped.
- 136 browser checks pass, including overview/empty layouts at phone, tablet and desktop widths, actionable links, version selection, and dark-mode text contrast.
- TypeScript, targeted ESLint and the production build pass. Synthetic desktop and mobile screenshots were inspected.
- No production database changes, deployment or headset testing are claimed. The previously prepared assignment-removal migration 020 remains a separate pending rollout requirement.
