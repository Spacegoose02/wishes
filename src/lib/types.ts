export type User = {
  id: number;
  email: string;
  name: string;
  password_hash: string | null;
  oidc_sub: string | null;
  avatar: string;
  theme: string;
  totp_secret: string | null;
  totp_enabled: number;
  is_admin: number;
  unlocked_avatars: string;
  badges: string;
  bonus_rolls: number;
  created_at: number;
};

export type Profile = {
  id: number;
  user_id: number;
  name: string;
  avatar: string;
  is_primary: number;
  birthday: string | null;
  linked_user_id: number | null;
  age: number | null;
  likes: string;
  dislikes: string;
  sizes: string;
  gift_notes: string;
};

export type Family = {
  id: number;
  name: string;
  invite_code: string;
  created_by: number | null;
};

export type Visibility = "private" | "family" | "custom";

export type WishList = {
  id: number;
  profile_id: number;
  title: string;
  description: string;
  emoji: string;
  occasion: string;
  event_date: string | null;
  visibility: Visibility;
  review_purchases: number;
  yearly: number;
  created_at: number;
};

export type Item = {
  id: number;
  list_id: number;
  title: string;
  url: string;
  store: string;
  price_cents: number | null;
  currency: string;
  image_url: string;
  notes: string;
  priority: number;
  quantity: number;
  claimed_by: number | null;
  claimed_name: string | null;
  purchased: number;
  price_checked_at: number | null;
  created_by_guest: string | null;
  category: string;
  variant: string;
  color: string;
  size: string;
  offers_checked_at: number | null;
  must_have: number;
  needs_approval: number;
  archived_at: number | null;
  kind: "product" | "experience" | "gift_card" | "fund";
  archive_reason: "" | "received" | "unwanted";
  created_at: number;
};

export type Suggestion = {
  id: number;
  list_id: number;
  title: string;
  reason: string;
  url: string;
  est_price_cents: number | null;
  source: string;
  store: string;
  category: string;
  image_url: string;
  status: "pending" | "accepted" | "rejected";
};

export type Purchase = {
  id: number;
  item_id: number | null;
  list_id: number;
  item_title: string;
  buyer_user_id: number | null;
  buyer_name: string;
  quantity: number;
  price_cents: number | null;
  store: string;
  note: string;
  status: "confirmed" | "pending" | "rejected";
  reviewed_by: number | null;
  created_at: number;
};
