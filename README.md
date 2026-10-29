This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Dashboard checks

`npm run test:dashboard` runs TypeScript validation, the current session-record/upload-route tests, then legacy presentation/scoring compatibility checks. It stops on the first failed check. `npm run typecheck`, `npm run test:sessions`, and `npm run test:dashboard:legacy` run those groups separately.

For local Unity integration, set `VICSI_UNITY_PROJECT` to the Unity project directory. The integration checks use the existing `EducationalSessionRecordTest` capture plus the `ProcedureTimelineUploadTest` completion-event capture. Run those Unity suites before checking a new checkout with that environment variable set. Without a Unity path, synthetic dashboard fixtures still run and Unity-specific checks are reported as skipped.

`npm run test:dashboard:browser` additionally checks the student/instructor pages at phone, tablet and desktop widths using isolated local fixtures. It requires the Unity capture and the configured local Edge executable; it does not read or write production data.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
