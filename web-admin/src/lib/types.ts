// Row types for the TrueFeel schema (Supabase project kwqqmjfsrgoczbutuisx).
//
// Column names follow the live database, not the Yuuki CMS this was modelled
// on. The notable differences, because they change what a toggle means:
//
//   Yuuki            TrueFeel
//   is_public        available        (what the app filters on — see below)
//   is_pro           tier = 'pro'
//   price_gems       price_ruby
//   vrm_url          model_url
//   sort_order       characters.order (TEXT, zero-padded "001")
//   is_default       characters.default_costume_id
//
// What the app actually shows (src/ of the mobile app):
//   characters  is_public AND available AND base_model_url not a .png, by "order"
//   costumes    available, by created_at
//   medias      available (+ tier for PRO media in chat)

export type Tier = 'free' | 'pro';

export type Character = {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  instruction: string | null;
  is_public: boolean | null;
  available: boolean | null;
  tier: Tier | string | null;
  order: string | null;
  thumbnail_url: string | null;
  small_thumb_url: string | null;
  avatar: string | null;
  small_avatar: string | null;
  base_model_url: string | null;
  video_url: string | null;
  agent_elevenlabs_id: string | null;
  background_default_id: string | null;
  default_costume_id: string | null;
  price_ruby: number | null;
  price_vcoin: number | null;
  total_costumes: number | null;
  created_at: string;
};

export type Costume = {
  id: string;
  character_id: string;
  costume_name: string;
  url: string;
  thumbnail: string | null;
  model_url: string | null;
  video_url: string | null;
  tier: Tier | string | null;
  unlock_type: 'default' | 'ads' | 'pro' | 'ruby' | null;
  unlock_at_level: number | null;
  available: boolean | null;
  price_ruby: number | null;
  price_vcoin: number | null;
  description: string | null;
  created_at: string;
};

export type Background = {
  id: string;
  name: string;
  image: string | null;
  thumbnail: string | null;
  video_url: string | null;
  public: boolean | null;
  available: boolean | null;
  tier: Tier | string | null;
  unlock_type: 'default' | 'ads' | 'pro' | 'ruby' | null;
  unlock_at_level: number | null;
  is_dark: boolean | null;
  price_ruby: number | null;
  price_vcoin: number | null;
  description: string | null;
  rarity: string | null;
  created_at: string;
};

export type MediaRow = {
  id: string;
  url: string;
  thumbnail: string | null;
  character_id: string | null;
  media_type: 'photo' | 'video' | string | null;
  tier: Tier | string | null;
  available: boolean | null;
  should_hide: boolean | null;
  price_ruby: number | null;
  name: string | null;
  created_at: string;
};

export type Translation = {
  id?: string;
  character_id: string;
  language_code: string;
  name: string | null;
  description: string | null;
  updated_at?: string | null;
};

export type GameConfigRow = {
  id: string;
  config_key: string;
  config_value: unknown;
  description: string | null;
  updated_at: string | null;
};

export type LoginReward = {
  id: string;
  day_number: number;
  reward_vcoin: number | null;
  reward_ruby: number | null;
  reward_energy: number | null;
};

export type Dance = {
  id: string;
  name: string;
  file_url: string;
  thumbnail_url: string | null;
  music_url: string | null;
  duration_seconds: number | null;
  unlock_type: 'default' | 'ads' | 'pro' | 'ruby';
  unlock_at_level: number | null;
  tier: string;
  price_ruby: number;
  sort_order: number;
  available: boolean;
  created_at: string;
};

export type Quest = {
  id: string;
  kind: 'daily' | 'special';
  event: string;
  target: number;
  reward_ruby: number;
  title: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

export type EconomyConfig = {
  key: string;
  value: number;
  description: string | null;
};
