"use client"
import React, { useEffect, useState } from 'react'
import './LoginSignup.css'
import Image from 'next/image'
import user_icon from '../../Assets/user.png'
import email_icon from '../../Assets/mail.png'
import password_icon from '../../Assets/Password.png'
import { EMAIL_DOMAIN_ERROR, isAllowedEmail } from '@/lib/email-domain'

const RESEND_COOLDOWN_SECONDS = 60;

const linkStyle: React.CSSProperties = {
  color: '#4A90E2',
  cursor: 'pointer',
  fontWeight: 'bold',
  textDecoration: 'underline'
};

const LoginSignup: React.FC = () => {
  const [action, setAction] = useState<"Login" | "Sign Up" | "Verify Email">("Login");
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Count down until another code may be requested
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
    setSuccess('');
  };

  const startVerification = (email: string, message: string, codeJustSent: boolean) => {
    setAction("Verify Email");
    setPendingEmail(email);
    setCode('');
    setSuccess(message);
    setResendIn(codeJustSent ? RESEND_COOLDOWN_SECONDS : 0);
    setFormData({ name: '', email: '', password: '' });
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (formData.email && !isAllowedEmail(formData.email)) {
      setError(EMAIL_DOMAIN_ERROR);
      return;
    }

    setLoading(true);

    try {
      const endpoint = action === "Sign Up" ? '/api/signup' : '/api/signin';
      const payload = action === "Sign Up"
        ? { name: formData.name, email: formData.email, password: formData.password }
        : { email: formData.email, password: formData.password };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      // Sign-up sent a code, or sign-in found a sign-up that was never verified
      if (data.verificationRequired) {
        startVerification(
          data.email,
          action === "Sign Up"
            ? data.message
            : 'Your email is not verified yet. Enter the code we emailed you, or request a new one.',
          action === "Sign Up"
        );
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      setSuccess('Logged in successfully!');

      // Handle successful response (e.g., store token, redirect)
      if (data.token) {
        // Store token in localStorage or cookie
        // localStorage.setItem('authToken', data.token);
        // Redirect to dashboard or home page
        window.location.href = '/dashboard';
      }

      // Reset form
      setFormData({ name: '', email: '', password: '' });

    } catch (err: unknown) {
        if (err instanceof Error) {
             setError(err.message);
        }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (data.signupExpired) {
        setAction("Sign Up");
        throw new Error(data.message);
      }

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      setSuccess('Email verified! Account created successfully!');
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/verify-email/resend', { method: 'POST' });
      const data = await response.json();

      if (data.signupExpired) {
        setAction("Sign Up");
        throw new Error(data.message);
      }

      if (response.status === 429 && data.retryAfter) {
        setResendIn(data.retryAfter);
      }

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      setResendIn(RESEND_COOLDOWN_SECONDS);
      setSuccess(data.message);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  const switchTo = (next: "Login" | "Sign Up") => {
    setAction(next);
    setError('');
    setSuccess('');
  };

  return (
    <div className='container'>
      <div className="header">
        <div className="text">{action}</div>
        <div className="underline"></div>
      </div>

      {error && <div className="error-message" style={{ color: 'red', textAlign: 'center', marginBottom: '10px' }}>{error}</div>}
      {success && <div className="success-message" style={{ color: 'green', textAlign: 'center', marginBottom: '10px' }}>{success}</div>}

      {action === "Verify Email" ? (
        <>
          <div className="verify-instructions">
            Enter the 6-digit code we sent to <strong>{pendingEmail}</strong>. It expires in 15 minutes.
          </div>

          <div className="inputs">
            <div className="input">
              <div className="input-icon">
                <Image src={email_icon} alt="Email icon" width={24} height={24} />
              </div>
              <input
                type="text"
                name="code"
                placeholder="Verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
              />
            </div>
          </div>

          <div className="mode-toggle" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginTop: '20px',
            marginBottom: '10px',
            fontSize: '14px',
            color: '#666'
          }}>
            <span>Didn&apos;t get it?</span>
            {resendIn > 0
              ? <span>Resend in {resendIn}s</span>
              : <span onClick={handleResend} style={linkStyle}>Resend code</span>
            }
            <span>·</span>
            <span onClick={() => switchTo("Sign Up")} style={linkStyle}>Start over</span>
          </div>
        </>
      ) : (
        <>
          <div className="inputs">
            {action === "Login" ? <div></div> :
              <div className="input">
                <div className="input-icon">
                  <Image src={user_icon} alt="User icon" width={24} height={24} />
                </div>
                <input
                  type="text"
                  name="name"
                  placeholder="Name"
                  value={formData.name}
                  onChange={handleInputChange}
                />
              </div>
            }

            <div className="input">
              <div className="input-icon">
                <Image src={email_icon} alt="Email icon" width={24} height={24} />
              </div>
              <input
                type="email"
                name="email"
                placeholder="WashU email (@wustl.edu)"
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>

            <div className="input">
              <div className="input-icon">
                <Image src={password_icon} alt="Password icon" width={24} height={24} />
              </div>
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleInputChange}
              />
            </div>
          </div>

          {action === "Sign Up" ? <div></div> :
            <div className="forgot-password">Lost Password? <span>Click Here!</span></div>
          }

          <div className="mode-toggle" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginTop: '20px',
            marginBottom: '10px',
            fontSize: '14px',
            color: '#666'
          }}>
            <span>{action === "Login" ? "Don't have an account?" : "Already have an account?"}</span>
            <span
              onClick={() => switchTo(action === "Login" ? "Sign Up" : "Login")}
              style={linkStyle}
            >
              {action === "Login" ? "Sign Up" : "Login"}
            </span>
          </div>
        </>
      )}

      <button
        className="submit-button"
        onClick={action === "Verify Email" ? handleVerify : handleSubmit}
        disabled={loading}
        style={{
          width: '100%',
          padding: '15px',
          marginTop: '10px',
          backgroundColor: loading ? '#ccc' : '#4A90E2',
          color: 'white',
          border: 'none',
          borderRadius: '50px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          fontWeight: 'bold'
        }}
      >
        {loading
          ? 'Processing...'
          : action === "Verify Email" ? 'Verify Email' : action === "Sign Up" ? 'Create Account' : 'Sign In'}
      </button>
    </div>
  )
}

export default LoginSignup
