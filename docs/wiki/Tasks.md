# Tasks

A task is a follow-up: something to do, by someone, by a date.

## Creating a task

Click **Add task** on the dashboard (or go to `/tasks/new`). Only the title is required.

| Field | Notes |
| --- | --- |
| Title | Up to 200 characters |
| Assignee | **Me** by default, or any active user |
| Due date | Optional. The task is due at the end of that day |
| Priority | Low, **Medium** (default) or High |
| Status | **To do** (default), In progress or Done |
| Description | Optional, up to 5000 characters |

After saving you return to the dashboard, where your open tasks are listed soonest due first.

The API can also link a task to a contact or a deal (`contactId`, `dealId`); a linked contact's tasks appear on the
contact's page. The form does not offer this yet.

## Who can do what

| Action | Needs |
| --- | --- |
| Create a task, and see who it can be assigned to | `tasks:write` (Sales, Support, Manager, Admin) |
| Link a task to a contact or deal | also `contacts:read` or `deals:read` |

Anyone who can create tasks can assign them to any active user. Editing, listing, filtering and reminders are
later stories.

Endpoints are in the [[API Reference]].
