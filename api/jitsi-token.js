export default async function handler(req, res) {
  res.json({
    url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: !!process.env.SUPABASE_SERVICE_KEY,
    allKeys: Object.keys(process.env).filter(k => k.includes('SUPA'))
  });
}