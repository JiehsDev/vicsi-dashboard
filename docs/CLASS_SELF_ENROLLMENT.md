# Class self-enrollment

Instructors open **Class → Enroll student → Share class invite**, then select **Create
class invite**. Manual enrollment by student number remains available.

An invitation provides a ten-character class code, a copyable link, and a downloadable
PNG QR code. All three lead to the same enrollment flow. QR images are generated in the
browser with [node-qrcode](https://github.com/soldair/node-qrcode); no invite is sent to
an external QR service. The link uses the dashboard origin currently being visited.

Students can enter the code in **My Classes**, open the link, or scan the QR code.
Sign-in and account creation preserve a validated class-join destination. Students
preview the instructor, class, section, and academic period, then explicitly choose
**Join class**. Opening a link does not enroll anyone. Enrollment appears in the existing
instructor roster and uses the existing student/session permissions.

**Turn invites off** prevents new self-enrollment without removing any members.
**Replace code & link** invalidates the old code, link, and QR code. Archived classes
also reject invitations. Manual enrollment and class archive behavior are unchanged.

## Database activation

Apply `supabase/migrations/021_class_self_enrollment.sql` after migration 020 to the
dashboard's Supabase project. This adds one invite table and two scoped RPCs. It does
not modify existing memberships or sessions. Direct browser writes are denied;
instructors can read/manage only their own invites; authenticated students enroll
themselves through the RPC. Anonymous users cannot execute it. Invalid guesses commit
a per-user rate-limit counter (30 attempts per ten minutes).

The migration has **not** been applied to the configured live database: both pooler
connections (5432 and 6543) timed out on 2026-11-05. The instructor UI keeps manual
enrollment available and reports temporary invite unavailability until activation.
An authorized database operator can run the SQL in the Supabase SQL Editor. The
checked-in `Tools/testing/class-invites-migration.mjs` can also verify prerequisites
and apply only this migration with `--apply` when connectivity is available; it
requires `pg` (or `PG_MODULE_PATH` pointing to an external installation). It loads the
existing `.env.local` and never prints credentials. Do not run a blanket migration push
to activate this one feature.

## Validation

- Isolated PostgreSQL/PGlite checks execute the real migration and verify ownership,
  RLS, authenticated self-enrollment, preview versus joining, idempotency, invite
  disable/reset, archived classes, and persistent rate limiting. Only the test entropy
  adapter differs: production uses the project's existing pgcrypto extension.
- Server-action and browser-session checks cover join redirects, safe return paths,
  friendly errors, and instructor invite management.
- Browser fixtures cover desktop, tablet, and mobile in both themes. The generated PNG
  was decoded with an independent QR decoder and matched the exact invitation URL.
- No real student was enrolled and no production invitation was created during tests.

The PostgreSQL test accepts `PGLITE_MODULE_PATH` for an external PGlite installation;
QR decoding accepts `QR_DECODER_MODULE_PATH` for an external `jsqr` installation. These
are validation tools, not application dependencies. Screenshots stay in local Temp.
