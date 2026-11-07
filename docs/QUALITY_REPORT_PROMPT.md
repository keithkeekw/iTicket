# Ticket Quality Report – AI prompt

A ready-to-use prompt for turning an iTicket export into a ticket quality report.

> **Data handling:** the exported CSV contains customer and agent names, ticket subjects and review findings. It may contain PII or company confidential information. Only upload it to an AI tool approved by your organisation, and follow standard handling and processing per XR doctrine for both the CSV and the report.

## How to use it

1. In **Quality Review → Saved reviews**, set the filters for the period and scope you want, e.g. a **Reviewed** date range and a group.
2. Choose **Export CSV**. You get one row per review, with these columns:
   - ticket details: ticket number, subject, group, assignee, resolving agent;
   - scores: total score, rating, and each category's score and findings;
   - the AI summary;
   - human input: reviewer comments and score edits;
   - previous versions.
3. Attach the CSV to an approved AI assistant, paste the prompt below, and fill in the `[brackets]`.

## The prompt

```text
You are a support quality analyst at Extreme Reach. Attached is a CSV export from iTicket:
one row per AI quality review of a Zendesk ticket.

How to read the data
- Scores are 1–5 per category (1 Poor, 2 Below Standard, 3 Acceptable, 4 Good, 5 Excellent).
- Category weights: Comprehension 10%, Troubleshooting & Documentation Quality 35%,
  Professional Communication 15%, Business English Quality 15%, Resolution Accuracy 25%.
- "Total score" is the weighted total; Rating bands: ≥4.5 Excellent, ≥3.5 Good, ≥2.5 Acceptable,
  ≥1.5 Below Standard, otherwise Poor.
- Use only rows where "Review status" = Current for all figures. Use "Previous total" / "Previous rating"
  only to describe change after re-review.
- "<Category> – findings" are the AI's reasons for each score; "Reviewer comments" and "Score edits"
  are human notes and corrections. Where a score was edited, treat the edited score as correct.
- "Re-opens" > 0 means the customer re-opened the ticket after it was solved.

Reporting period: [e.g. 1–30 November 2026]
Scope: [e.g. all groups / Global Support only]
Audience: [e.g. Support leadership]

Write a ticket quality report with these sections:

1. Executive summary (5 bullet points max): overall average score and rating, % of tickets rated
   Good or better vs Below Standard or worse, the biggest strength, the biggest risk, and the one
   action that would improve quality most.
2. Overall picture: number of tickets reviewed, average total score, rating distribution (count and %),
   and average score per category. Name the weakest category, and explain its impact given its weight.
3. By group: one table with tickets, average total and per-category averages, plus % Below
   Standard or worse. Call out groups that differ noticeably from the overall average.
4. By agent: one table per resolving agent with tickets, average total, weakest category and
   number of Below Standard / Poor tickets. Only draw conclusions for agents with [5] or more
   reviews, and mark the others as "too few to judge".
5. Recurring issues: group the findings from scores of 1–2 into themes (e.g. missing internal notes,
   status changes without explanation, unclear customer replies). For each theme, give how often it
   appears, which categories it affects, and 2–3 example ticket numbers.
6. What good looks like: 3 short examples of 5/5 findings worth sharing with the team, with ticket
   numbers.
7. Re-opened and re-reviewed tickets: how many were re-opened, how their scores compare with the rest,
   and what changed where a ticket was reviewed more than once.
8. Recommendations: 3–5 specific, practical actions (coaching topics, process or template changes),
   each linked to the evidence above.

Rules
- Base every figure on the data, and show counts with percentages. Don't guess at missing values.
- Quote findings briefly, and refer to tickets by number.
- Keep the tone constructive. This is for coaching, not blame.
- Flag data quality issues you notice (e.g. very few reviews for a group or agent, many score edits).
- Format: headings, short paragraphs, tables where useful; about [2] pages.
```

## Variations

- **Team-lead version:** change the audience to "Team lead for [group]". Replace section 4 with "Coaching notes per agent (2–3 bullets each)".
- **Week-on-week trend:** export two periods. Add: "Compare the two attached files (previous vs current period) and report the change in each figure."
- **Single-agent coaching:** filter Saved reviews by resolving agent before exporting. Ask for "a one-page coaching summary for [agent], based on their reviews".

## Tips

- **Keep each export to the current period.** The prompt works best with a few hundred reviews or fewer.
- **Keep the weights and rating bands in step with the app.** They match the current rubric in Settings → Prompt Management, so update this prompt when the rubric changes.
