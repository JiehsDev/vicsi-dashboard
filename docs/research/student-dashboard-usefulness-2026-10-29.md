# Student dashboard: usefulness and orientation proposal

Research date: 29 October 2026. Scope: the ViCSI research student website. This is a proposal; no application behavior, deployment, grading rules or database records were changed.

## Current product findings

Reviewed the current source and the saved student-session layout, not a new live authenticated browser session.

- `src/app/results/page.tsx`: student landing page is My Sessions, followed by filters and a session table.
- `src/components/AppShell.tsx`: students have one navigation destination, My Sessions.
- `src/components/SessionTable.tsx`: an empty list says “No sessions found” and “Complete an investigation or adjust the filters.” It does not explain the difference between no attempts and an unsuccessful filter.
- `src/components/ResultFilters.tsx`: the current version already tells users when test sessions are hidden and provides Show test sessions. Preserve that behavior.
- `src/components/SessionRecord.tsx`: detailed session evidence already exists: procedure timeline, recorder statements and weights, deduction questions and selected responses, and score breakdown. Navigation to the useful material and its summary can improve without rebuilding the assessment engine.
- `src/lib/results.ts`: existing data includes scenario, dates, duration, owner, verification state, server receipt time, scoring version and deduction components. Details include the player's recorded actions and answers.
- `src/app/pairing/page.tsx`: the legacy pairing page is bypassed and redirects to results. The current headset uses permanent student identification codes; do not revive the old pairing instructions as a superficial navigation change.

Interpretation: the student experience currently emphasizes finding an archived record. It needs clearer support for preparing, understanding the latest attempt and deciding what to review next.

## External references and implications

1. [Canvas: How do I use the Dashboard?](https://community.instructure.com/en/kb/articles/664620-how-do-i-use-the-dashboard) describes course access, a to-do list, upcoming assignments and recent feedback. Useful pattern: prioritize work and feedback, with direct access to each.
2. [Moodle: Dashboard](https://docs.moodle.org/en/Dashboard) describes progress, upcoming deadlines, course overview and a timeline. Useful pattern: situate students within their actual learning activity. A calendar is useful only if assignments and deadlines are genuinely populated.
3. [NN/g: Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/) recommends communicating status, providing learning cues and linking directly to useful actions. Useful pattern: an empty result area should explain its cause and offer a next step.
4. [W3C: Use Clear Step-by-step Instructions](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p07-step-instructions/) recommends concise instructions next to the activity and before an error occurs. Useful pattern: provide preparation and headset instructions where students start.
5. [W3C: Use a Clear and Understandable Page Structure](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o2p03-page-structure/) recommends meaningful headings, logical groups and consistent visual structure. Useful pattern: one prominent next action, clear supporting sections and recognizable navigation.

These references support design patterns, not a claim that the proposed ViCSI changes have already improved student outcomes. The recommendations below need usability testing with ViCSI students.

## Recommended student information architecture

- Home: preparation or next action, latest result, targeted review and recent activity.
- My Sessions: the existing searchable history, retaining filters and test-session handling.
- How to Play: short, illustrated headset instructions and common problems.

Keep detailed results under their session route. Give long results an accessible section navigation: Summary, Questions, Documentation and Timeline. On mobile, use a compact section selector or anchor links without forcing a large table or persistent sidebar into the reading area.

## First release: highest practical value

| Addition | Student value | Data / implementation scope |
| --- | --- | --- |
| State-aware next-action card | Answers “What should I do now?” | No attempts: prepare for the first investigation. Completed latest attempt: review it. Filter with no matches: clear filters. Do not suggest resuming a headset attempt unless the game supports it. |
| Latest investigation card | Shows the newest applicable result without searching | Scenario, date, duration, received status and deduction components from stored results. Link directly to the session summary. Do not treat an unavailable grade as 0%. |
| Review focus | Answers “What should I work on?” | Up to two concise recommendations based on the student's stored responses. Example: review the distinction between contact and responsibility. Link to the exact recorded question. Label limited evidence appropriately; do not invent a mastery percentage. |
| Better empty states | Removes uncertainty before any result exists | Separate first use, filtered empty, hidden test records and failed loading. Each gets a relevant action. A missing server row is not proof of a pending headset upload. |
| Quick-start guide | Connects the website with the actual headset workflow | Explain student code, identity confirmation, where the VR investigation is launched, how completion works and where results appear. The web button should say View headset instructions, not Start game if it cannot launch the game. |
| Plain-language score explanation | Makes the result interpretable | Explain reasoning /60, evidence relationships /25 and conclusion /15. Explain that confirmed wrong relationship interpretations incur the authored penalty; recorder /24 is separate. Keep existing grading rules unchanged. |

Suggested Home order:

1. Welcome, student identity and a single next-action card.
2. Latest investigation summary with Review results.
3. Two focused review suggestions, linking to recorded feedback.
4. Up to three recent sessions with View all sessions.
5. A small persistent Help / How to Play link.

Example after a completed attempt, illustrative content only:

> Your latest investigation is ready to review.  
> The Last Drink — deduction result 60/100.  
> Reasoning 45/60 · Relationships 0/25 · Conclusion 15/15.  
> Next: review the evidence-relationship interpretations from this attempt.  
> Review results

## Required states and truthful status language

| State | Message / action |
| --- | --- |
| No received attempts | “Your first investigation starts in the headset.” → View preparation guide. |
| Results available | “Your latest investigation is ready to review.” → Review latest result. |
| No filter matches | “No sessions match these filters.” → Clear filters. |
| Test sessions excluded | Preserve the existing hidden-test notice and Show test sessions action. |
| Received, final result unavailable | Show the actual assessment status in plain language. Do not promise automatic processing when the record requires instructor review. |
| No recent server receipt | Show Last session received and a help route. Say that the website cannot yet confirm a new upload; do not show fabricated live headset or sync status. |
| Request failure | Explain that results could not be loaded and provide Retry. Do not present this as a first-time empty account. |

## Later additions

- Personal progress: compare attempts only when scenario/content and scoring versions are meaningfully comparable. Keep test sessions and historical scoring versions explicitly distinguished. With one attempt, show a baseline; with none, show preparation rather than an empty chart.
- Instructor feedback: a small feedback inbox with a link to the affected session could be useful, but it requires a real comment/release/unread workflow and storage. Do not add an empty feedback panel before that exists.
- Reflection: a private “What will I do differently?” prompt after result review could support discussion, but adding research measures or changing the study experience should be considered deliberately. Treat this as a separate feature.
- Assignments and deadlines: surface them only for actual enrolled, active work. Add due-date UI after verifying an actual deadline field and workflow; do not infer due dates from session or creation timestamps.

## Presentation and interaction details

- Give the primary action stronger visual emphasis than filters and secondary links.
- Keep Home short; put filters in My Sessions.
- Use descriptive actions such as Review latest result, Review relationship questions and View headset instructions.
- Show selected navigation, breadcrumbs and recognizable Back to my sessions links.
- Express score and status with text as well as color; retain readable contrast, keyboard focus and mobile layouts.
- Show enough explanation beside unusual concepts such as relationship penalties and separate documentation points.
- Base review suggestions on the completed attempt. Avoid providing case-specific answers before an assessment or adding a competitive ranking layer to the research website.

## Suggested implementation sequence

1. Home route, three-item navigation, next-action and latest-result cards; retain current session routes and authorization.
2. Empty/error/filter states, preparation guide and server-receipt guidance.
3. Direct result-section links, at most two deterministic review suggestions and the score explainer.
4. Comparable-attempt progress after the basic experience is tested.
5. Instructor feedback or reflections as separate scoped features if needed.

The first three steps can largely use existing session data and authored help content. Progress requires comparability logic; real instructor comments require new persisted behavior. Do not deploy as part of this research-only task.

## Evaluation before release

Use realistic accounts covering no attempts, one completed attempt, several comparable attempts, a missing/unavailable grade, excluded test sessions and filtered-empty results. Include mobile and keyboard navigation.

Ask a small group of representative students to:

1. Explain where to begin their first investigation.
2. Find and explain their newest result.
3. Explain why a relationship score may be zero after the questions were answered.
4. Find one recorded answer to review.
5. Find help when a headset session has not appeared.

Record task success, time to first useful action, wrong turns and explanation accuracy. A practical design target is that most students identify the correct next action in roughly 10 seconds without prompting; this is a proposed acceptance target, not an established research finding.
