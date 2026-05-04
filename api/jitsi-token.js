import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  const { data, error } = await supabase.auth.getUser(token);
  
  res.json({ 
    user: data?.user?.email || null,
    error: error?.message || null,
    tokenStart: token?.substring(0, 20)
  });
}