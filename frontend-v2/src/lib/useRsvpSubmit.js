import { useCallback, useRef, useState } from 'react';
import { submitRsvp, generateCaptcha } from '@/api/invitations';
import { classifyRsvpError } from '@/lib/rsvpError';

/** RSVP submission with the backend's rate-limit + adaptive-CAPTCHA contract
   (server.py submit_rsvp, ~5825-5940). Shared by GuestInvitation's full form
   and CeremonyInvitation's quick-RSVP buttons.
   status: idle | submitting | captcha | done | rate_limited | error */
export function useRsvpSubmit(slug) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [captcha, setCaptcha] = useState(null); // { challenge_id, challenge }
  const pendingPayload = useRef(null);

  const attempt = useCallback(async (payload, captchaId, captchaAnswer) => {
    setStatus('submitting');
    setError('');
    try {
      await submitRsvp(slug, payload, captchaId, captchaAnswer);
      setStatus('done');
      setCaptcha(null);
    } catch (e) {
      const cls = classifyRsvpError(e.response?.status, e.response?.data?.detail);
      if (cls.kind === 'captcha') {
        pendingPayload.current = payload;
        try {
          const { data } = await generateCaptcha();
          setCaptcha(data);
          setStatus('captcha');
          setError(cls.message);
        } catch (_e2) {
          setStatus('error');
          setError('Could not load the verification step. Please try again.');
        }
        return;
      }
      setStatus(cls.kind === 'rate_limited' ? 'rate_limited' : 'error');
      setError(cls.message);
    }
  }, [slug]);

  const submit = useCallback((payload) => attempt(payload), [attempt]);

  const answerCaptcha = useCallback((answer) => {
    if (!captcha || !pendingPayload.current) return;
    attempt(pendingPayload.current, captcha.challenge_id, answer);
  }, [attempt, captcha]);

  const reset = useCallback(() => { setStatus('idle'); setError(''); setCaptcha(null); }, []);

  return { status, error, captcha, submit, answerCaptcha, reset };
}
