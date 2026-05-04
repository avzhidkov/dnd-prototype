import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.json({ ok: true, jwt: typeof jwt, supabase: typeof createClient });
}