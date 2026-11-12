# Tasks

A task is a follow-up: something to do, by someone, by a date.

## Creating a task

Click **Add task** on the dashboard (or go to `/tasks/new`). Only the title is required.

| Field | Notes |
| --- | --- |
| Title | Up to 200 characters |
| Assignee | **Me** by default, or any active user |
| Due date | Optional. The task is due at the end of that day |
| Reminder | Needs a due date. **1 day before** by default; or 15 minutes, 1 hour, 1 week before, or none |
| Priority | Low, **Medium** (default) or High |
| Status | **To do** (default), In progress or Done |
| Description | Optional, up to 5000 characters |

After saving you return to the dashboard, where your open tasks are listed soonest due first.

The API can also link a task to a contact or a deal (`contactId`, `dealId`); a linked contact's tasks appear on the
contact's page. The form does not offer this yet.

## The task list

**Tasks** in the sidebar (`/tasks`) lists every task, soonest due first, with tasks that have no due date last.
Each row shows the title, assignee, due date, priority and status. Narrow it with three filters, which combine:

| Filter | Choices |
| --- | --- |
| Assignee | Anyone (default), **Me**, Unassigned, or any active user |
| Status | Any, To do, In progress, Done |
| Priority | Any, Low, Medium, High |

**Clear** removes the filters. They live in the address (`/tasks?assignee=me&status=TODO`), so a filtered list can
be bookmarked or shared. Twenty tasks are shown per page. Editing tasks from the list comes with a later story.

## Reminders

When a task has a due date and a reminder, the API checks once a minute and sends the assignee one notification
(on the dashboard's notifications) once the reminder time has come. A task that is already past its reminder time
when it is created is reminded about on the next check. Each task is reminded only once, and tasks that are Done or
have no assignee get none. Reminders are in the app only; there is no email yet.

## Who can do what

| Action | Needs |
| --- | --- |
| See the task list and the people to filter by | `tasks:read` (Sales, Support, Manager, Admin) |
| Create a task | `tasks:write` (Sales, Support, Manager, Admin) |
| Link a task to a contact or deal | also `contacts:read` or `deals:read` |

Anyone who can create tasks can assign them to any active user. Other editing is a later story. A task's due date can be moved by dragging it on the [[Calendar]].

Endpoints are in the [[API Reference]].
