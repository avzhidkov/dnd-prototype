import jwt from 'jsonwebtoken';

const APP_ID = 'dreamstory';
const APP_SECRET = 'ds_jwt_secret_2026_xK9mP3';
const JITSI_HOST = 'room.dream-story.ru';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { room, characterName } = req.body;

  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Декодируем Supabase токен без верификации подписи
  const decoded = jwt.decode(token);

  if (!decoded || !decoded.sub) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Проверяем что токен не истёк
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    return res.status(401).json({ error: 'Token expired' });
  }

  const jitsiToken = jwt.sign({
    aud: APP_ID,
    iss: APP_ID,
    sub: JITSI_HOST,
    room: room,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
    context: {
      user: {
        id: decoded.sub,
        name: characterName || decoded.email,
        email: decoded.email,
      }
    }
  }, APP_SECRET);

  res.json({ token: jitsiToken });
}