# Calendar

**Calendar** in the sidebar (`/calendar`) shows what is on your plate, by day, week or month.

## What it shows

Only your own items:

| Item | Where it comes from | Shown on |
| --- | --- | --- |
| Meeting, Call | Activities of that type that **you** logged ([[Activities]]) | The day and time it happened |
| Event | Events you add from the calendar (see below) | The day and time you chose, or all day |
| Task due | Tasks **assigned to you**, whatever their status (done ones are struck through) ([[Tasks]]) | Its due date |
| Deal closes | **Open** deals you own, by expected close ([[Deals]]) | The expected close date |

Each kind has its own colour and icon, and a legend sits above the calendar. A source you may not read
(`activities:read`, `tasks:read`, `deals:read`) is simply left out. Meetings and calls are logged after the fact
(an activity cannot be in the future), so they appear in the past. To plan something ahead, add an **event**.

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

## Adding from the calendar

Click **Add** (top right), or the **+** on any day, to open the Add to calendar box:

- **Event**: a title, date, start and end time (or **All day**) and an optional location. Without an end time it lasts
  an hour. Events are private to you and need no permission.
- **Task**: a title and due date, assigned to you. Only shown with `tasks:write`; the full form on the [[Tasks]] page has
  assignee, priority and reminder.

## Rescheduling

- **Drag** an event or task onto another day in the Week or Month view. An event keeps its time and length.
- Or **click** it to open a Move box with the date (and, for an event, the start and end), which also works with a
  keyboard and in the Day view.

You can move your own events, and tasks if you have `tasks:write` (moving a task changes its due date for whoever it is
assigned to; if it has a reminder, that is sent again for the new date). Calls, meetings and deal deadlines are not
moved from here: change a deal's expected close on the deal.

Endpoints: `GET /calendar`, `POST /calendar/events`, `PATCH /calendar/events/{id}` and `PATCH /tasks/{id}`; see the [[API Reference]].
