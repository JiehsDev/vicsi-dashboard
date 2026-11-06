# Loading feedback

Feedback is driven by real navigation, form, or request state. There are no
artificial delays or invented completion percentages.

- `loading.tsx` boundaries cover the initial workspace, investigation records,
  administration, profile, classes and individual session views. Placeholders
  disappear automatically as React streams the actual content. Existing error
  boundaries continue to provide retry controls.
- `LoadingLink` uses Next's `useLinkStatus` for workspace, class, student and
  session navigation. A fixed top indicator says **Opening page…** while the
  clicked navigation is pending; it creates no layout shift or modal blocking.
  Cached navigation skips it, and Next clears superseded/canceled navigation.
- `SubmitButton` uses React's `useFormStatus`, changes its label, shows a spinner
  and disables itself until the action settles. Sign-in, account creation, class
  creation, joining classes and invitation management use it.
- `PendingForm` bridges form status to the existing form-associated Save/Enroll
  buttons in class-dialog footers. The pending state also disables Cancel and
  prevents ordinary Escape dismissal while saving. Failure responses restore the
  controls using React's normal action lifecycle.
- Existing confirmation, profile, administrator, email and recovery actions keep
  their existing request handling and gain consistent spinner/busy feedback.
  Logout still requires confirmation before any signout request starts.
- Result filters and class-code lookup use Next's GET Form navigation with pending
  submit labels. Their existing actions, names and query parameters are preserved.
- Account-link checking and QR-code preparation have labeled status indicators.
- Pagination remains immediate because authorized table pages are already in
  memory. It does not display a fake loading delay or change its scroll behavior.

Status text is announced politely, spinners/placeholders are decorative, and
pending controls expose `aria-busy`. All colors come from the selected palette.
Reduced-motion preferences disable spinner, progress and skeleton animation.

`npm run test:loading` exercises real React pending forms (including the external
dialog footer button), confirmation-before-submission, duplicate clicks, failure
recovery, controlled link-pending feedback, both viewport sizes, all palettes and
both modes, status contrast and reduced motion. Navigation uses a test-only
adapter; application code uses the installed Next hook. Synthetic browser tests
perform no database writes or real authentication changes.
