import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.json({ ok: true, jwt: typeof jwt });
}