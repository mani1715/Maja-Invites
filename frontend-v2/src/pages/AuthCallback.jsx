import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Google OAuth return target for the couple-account flow, which the
// credits/accounts pivot retired. Studios have no OAuth login (email/OTP +
// password only), so this route has nothing left to complete — bounce
// straight to studio sign-in. Kept (rather than deleted) in case the
// backend or an old bookmark still redirects here.
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/auth', { replace: true });
  }, [navigate]);

  return <div className="mj-loader">Signing you in…</div>;
}
