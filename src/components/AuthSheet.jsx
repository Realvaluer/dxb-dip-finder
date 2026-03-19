import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function AuthSheet() {
  const { authSheetOpen, closeAuth, login } = useAuth();
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (authSheetOpen) { setStep('email'); setEmail(''); setCode(['','','','','','']); setError(''); }
  }, [authSheetOpen]);

  async function sendCode() {
    if (!email || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code');
      setStep('code');
      setCanResend(false);
      setTimeout(() => setCanResend(true), 30000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCodeInput(index, value) {
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleCodeKeyDown(index, e) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function verifyCode() {
    const codeStr = code.join('');
    if (codeStr.length !== 6 || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: codeStr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      login(data.token, data.email, data.user_id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!authSheetOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={closeAuth} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-bg rounded-t-2xl overflow-hidden" style={{ maxWidth: '100vw' }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-6 pb-8 pt-2">
          {step === 'email' ? (
            <>
              <h2 className="text-lg font-bold mb-1">Save listings</h2>
              <p className="text-sm text-muted mb-5">Enter your email to save properties and get alerts</p>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendCode()}
                placeholder="your@email.com"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-white placeholder-muted outline-none focus:border-accent/50 mb-3"
                autoFocus
              />
              {error && <p className="text-dip-red text-xs mb-3">{error}</p>}
              <button
                onClick={sendCode}
                disabled={!email || loading}
                className="w-full bg-accent text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 min-h-[44px]"
              >
                {loading ? 'Sending...' : 'Send code'}
              </button>
              <p className="text-[11px] text-muted text-center mt-3">We'll send a 6-digit verification code</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold mb-1">Check your email</h2>
              <p className="text-sm text-muted mb-5">We sent a code to {email}</p>
              <div className="flex gap-2 justify-center mb-4">
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => inputRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleCodeInput(i, e.target.value)}
                    onKeyDown={e => handleCodeKeyDown(i, e)}
                    className="w-11 h-13 bg-card border border-border rounded-xl text-center text-lg font-bold text-white outline-none focus:border-accent"
                    autoFocus={i === 0}
                  />
                ))}
              </div>
              {error && <p className="text-dip-red text-xs mb-3 text-center">{error}</p>}
              <button
                onClick={verifyCode}
                disabled={code.join('').length !== 6 || loading}
                className="w-full bg-accent text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 min-h-[44px] mb-3"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
              <div className="flex justify-between text-xs">
                <button onClick={() => { setStep('email'); setError(''); }} className="text-muted">Use different email</button>
                <button onClick={sendCode} disabled={!canResend} className={`${canResend ? 'text-accent' : 'text-muted/40'}`}>
                  Resend code
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
