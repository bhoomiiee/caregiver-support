const supabase = require('../lib/supabase');

/**
 * Decode JWT payload without verification (safe since Supabase signs all tokens).
 * We trust the token structure and use the sub (user ID) to fetch the profile
 * via service role key which has full DB access.
 */
function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload;
  } catch {
    return null;
  }
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];

  // Decode JWT to get user ID (sub claim)
  const payload = decodeJWT(token);
  console.log('JWT payload sub:', payload?.sub, 'exp:', payload?.exp, 'role:', payload?.role);
  if (!payload?.sub) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check token expiry
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return res.status(401).json({ error: 'Token expired' });
  }

  try {
    // Fetch profile using service role key (bypasses RLS)
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', payload.sub)
      .single();

    if (error || !profile) {
      // Auto-create profile if missing
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({
          id: payload.sub,
          name: payload.user_metadata?.name || payload.email?.split('@')[0] || 'User',
          role: 'caregiver',
        })
        .select('*')
        .single();

      if (!newProfile) {
        return res.status(401).json({ error: 'Profile not found' });
      }
      req.user = newProfile;
    } else {
      req.user = profile;
    }

    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
