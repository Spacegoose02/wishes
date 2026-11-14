# Wishes API (v1)

A small API so another app, such as **Den Duty**, can put things on a kid's wishlist. For example, a
Helpdesk "Add to my wishlist" pick for clothes, shoes or a toy.

It does two things only: list the kids a key can add for, and add a wish. It never shows who
claimed or bought anything.

## Keys

1. In Wishes, open **Settings → Sign-in & 2FA → Connected apps**.
2. Type a name (for example `Den Duty`) and press **Make a key**. Copy the key (`wsh_…`) right away:
   Wishes only shows it once and stores just a hash of it.
3. Put it in the other app's settings, and send it on every call:

   ```
   Authorization: Bearer wsh_...
   ```

A key acts as the grown-up who made it. It can add wishes for that person, their kid profiles, and
kid profiles in their families (the same kids they can edit in Wishes). Press **Revoke** to cut a
key off immediately. Wishes added with a key show "Added by <key name>" to the list's managers.

All responses are JSON. Errors look like `{ "error": "Something readable" }`.

| Status | Meaning |
| --- | --- |
| 200 | Fine (or: that wish was already on the list, see `duplicate`) |
| 201 | Wish added |
| 400 | The request is missing something (the error says what) |
| 401 | Missing, wrong or revoked key |
| 404 | No such kid or list for this key |
| 409 | The kid has no list yet, or two kids share that name |
| 413 | Body over 16 KB |

## GET /api/v1/kids

Who this key can add wishes for. `default_list_id` is where a wish goes when you name the kid but not
the list: the list with the soonest upcoming date, otherwise the newest undated list.

```json
{
  "user": { "id": 1, "name": "Mom" },
  "kids": [
    {
      "profile_id": 2,
      "name": "Ava",
      "avatar": "goose",
      "is_kid": true,
      "default_list_id": 7,
      "lists": [
        { "list_id": 7, "title": "Ava's birthday", "emoji": "🎂", "occasion": "Birthday", "event_date": "2026-12-04" }
      ]
    }
  ]
}
```

The key owner's own profile is included with `is_kid: false`.

## POST /api/v1/wishes

Adds one wish. Say whose list it goes on with **one** of:

- `list_id`: an exact list from `/kids`
- `profile_id`: that kid's default list
- `kid`: the kid's name (case doesn't matter). Handy when the other app only knows names. If two
  profiles share the name you get a 409 with their `profile_ids`.

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | **Required.** Up to 200 characters |
| `notes` | string | Up to 1000 characters, e.g. "size 2, blue please" |
| `url` | string | A product link |
| `price_cents` | integer | e.g. `2499` for $24.99 |
| `store` | string | Worked out from `url` if left out |
| `image_url` | string | https only |
| `category` | string | `clothes`, `toys`, `games`, `books`, `electronics`, `sports`, `crafts`, … Guessed from the title if left out |
| `kind` | string | `product` (default), `experience`, `gift_card`, `fund` |
| `size`, `color`, `variant` | string | Optional details |
| `quantity` | integer | 1–99, default 1 |
| `priority` | integer | 1–3, default 2 |
| `approved` | boolean | Default `false`: the wish waits for a parent's OK in Wishes (like kid mode) and the list's managers get an alert. Send `true` only when a grown-up already said yes in your app; shoppers then see it right away |

Sending a title that's already an active wish on that list (ignoring case and spaces) adds nothing
and returns the existing wish with status 200 and `"duplicate": true`, so retries are safe.

```bash
curl -X POST https://wishes.example.com/api/v1/wishes \
  -H "Authorization: Bearer wsh_..." \
  -H "Content-Type: application/json" \
  -d '{"kid": "Ava", "title": "Light-up sneakers", "notes": "Size 1. Asked in Den Duty Helpdesk", "category": "clothes"}'
```

```json
{
  "duplicate": false,
  "wish": {
    "id": 42,
    "title": "Light-up sneakers",
    "list_id": 7,
    "list_title": "Ava's birthday",
    "profile_id": 2,
    "profile_name": "Ava",
    "needs_approval": true,
    "link": "https://wishes.example.com/lists/7#item-42"
  }
}
```

`link` opens the wish in Wishes (for a grown-up who is signed in). Set `APP_URL` on the Wishes server
so it uses the public address.

## What Den Duty needs

1. A setting for the Wishes address (e.g. `https://wishes.example.com`) and the API key, stored as a secret.
2. A way to match each Den Duty kid to a Wishes kid. Simplest: send the kid's name as `kid`. Sturdier:
   call `GET /api/v1/kids` once, let the parent pick, and save the `profile_id`.
3. A Helpdesk pick, "Add to my wishlist", that sends `POST /api/v1/wishes` with the kid and what they
   typed as `title` (plus `notes`, and `category` such as `clothes` or `toys` if Den Duty knows it).
4. What to tell the kid:
   - `201` with `needs_approval: true`: "🎁 Sent to your wishlist! A grown-up will check it."
   - `200` with `duplicate: true`: "It's already on your wishlist."
   - `409` (no list yet) or other errors: show the `error` text to the parent, not the kid.
5. If Den Duty's own parent "yes" happens first (like Buy something), send `"approved": true` so
   it skips the second approval in Wishes.

The call is server to server, so there's no CORS setup. If Den Duty can't reach Wishes, it should
keep the ask and retry later; duplicates are handled.
