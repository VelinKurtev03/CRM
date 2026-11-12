# Calendar

**Calendar** in the sidebar (`/calendar`) shows what is on your plate, by day, week or month.

## What it shows

Only your own items:

| Item | Where it comes from | Shown on |
| --- | --- | --- |
| Meeting, Call | Activities of that type that **you** logged ([[Activities]]) | The day and time it happened |
| Task due | Tasks **assigned to you**, whatever their status (done ones are struck through) ([[Tasks]]) | Its due date |
| Deal closes | **Open** deals you own, by expected close ([[Deals]]) | The expected close date |

Each kind has its own colour and icon, and a legend sits above the calendar. A source you may not read
(`activities:read`, `tasks:read`, `deals:read`) is simply left out. Meetings and calls are logged after the fact
(an activity cannot be in the future), so they appear in the past; creating and rescheduling future events is a later story.

## Views

| View | Shows |
| --- | --- |
| **Day** | One day as a list, all-day items (tasks, deal deadlines) first, then by time. |
| **Week** (default) | Monday to Sunday, one column per day (stacked on a phone). |
| **Month** | The month's full weeks, up to three items per day with **+N more**. |

Use the arrows to step back and forward, **Today** to jump to now, and click a day (its number or **+N more**) to
open it in the Day view. Times use your own time zone. The view and date are kept in the address
(`/calendar?view=month&date=2026-11-12`), so you can bookmark or share a spot.

Items link to what they are about: a call or meeting to its contact (or deal), a deal to its edit page (with
`deals:write`), and a task to your task list.

Endpoint: `GET /calendar`, see the [[API Reference]].
