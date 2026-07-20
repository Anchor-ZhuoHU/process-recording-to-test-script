# Assignment brief (own-words summary)

> The original brief is another company's interview document, so it is not included in this
> repo. This is my own summary of what it asked for; `DECISIONS.md` logs how each requirement
> was met.

- **Format:** 3.5 hours total: a 3-hour timed build, followed by a 30-minute debrief walking
  through the solution and its technical considerations.
- **The problem:** consultants at system integrators hand-write "test scripts", step-by-step
  documents with screenshots for processes like creating a purchase order. Documenting a
  2-minute process takes up to 45 minutes by hand.
- **The task:** a web app where a user uploads a screen recording (expect videos under
  3 minutes) and the backend uses the Gemini Video Understanding API to return the ordered
  steps, each with a screenshot (Gemini can return timestamps).
- **Part 1:** video in; a list of steps with screenshots out.
- **Part 2:** user-defined columns per client template, built so that a custom template
  cannot break the generation.
- **Judging criteria (as stated):** both technical quality and product sense; clean,
  maintainable, "pretend you're building this for real" code; completion matters less than
  the approach and the justification of decisions. AI coding agents were explicitly
  encouraged, with the candidate owning code quality.
- **Provided materials:** sample screen recordings of ERP procurement flows and a vendor API
  reference doc; both stay local-only (see `.gitignore`).
