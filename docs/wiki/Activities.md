# Activities

An activity records an interaction with a customer: a **call**, **meeting**, **email**, **SMS** or **note**.

- On a **contact**, the Activities section has a *Log activity* form above the list.
- On a **deal**, the edit page has the same section below the form.
- Each activity has a type, a subject (up to 200 characters), optional details (up to 5000) and the time it
  happened. The time starts as now and can be moved back, but not into the future. The person who logged it is
  recorded.
- Newest first; each list shows the latest 50 and says how many there are in all.

An activity can belong to a contact, a deal, or both (the API accepts both ids; the screens log against the page
you are on).

## Who can do what

| Action | Needs |
| --- | --- |
| See activities | `activities:read` (every role) |
| Log an activity | `activities:write` (Sales, Support, Manager, Admin), and permission to read the contact or deal |

Editing, deleting and a grouped timeline are not part of this story yet. Deleting a contact or deal deletes its
activities with it.

Endpoints are in the [[API Reference]].
