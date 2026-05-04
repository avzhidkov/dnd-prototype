import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const APP_ID = 'dreamstory';
const APP_SECRET = 'ds_jwt_secret_2026_xK9mP3';
const JITSI_HOST = 'room.dream-story.ru';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { room, characterName, userId } = req.body;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const authHeader = req.headers.authorization;
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader?.replace('Bearer ', '')
  );

  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const token = jwt.sign({
    aud: APP_ID,
    iss: APP_ID,
    sub: JITSI_HOST,
    room: room,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
    context: {
      user: {
        id: userId || user.id,
        name: characterName || user.email,
        email: user.email,
      }
    }
  }, APP_SECRET);

  res.json({ token });
}