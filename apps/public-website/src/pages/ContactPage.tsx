import React, { useState } from 'react';
import { APP_URLS } from '../config/urls.js';

export const ContactPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setFeedback(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${APP_URLS.api}/api/v1/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          subject: subject.trim(),
          message: message.trim()
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to submit contact message.');
      }

      setFeedback({
        type: 'success',
        message: 'Thank you for contacting RGS Ledger. Your message has been received by our engineering and support team.'
      });
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error submitting message. Please check your connection and try again.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px 60px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ display: 'inline-block', padding: '4px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#1E40AF', marginBottom: '16px' }}>
          Get in Touch
        </div>
        <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#111827', margin: '0 0 14px 0', letterSpacing: '-0.5px' }}>
          Contact Support & Sales
        </h1>
        <p style={{ fontSize: '15px', lineHeight: 1.6, color: '#4B5563', margin: 0 }}>
          Have technical questions regarding our dual-source matching engine, Android companion setup, or API integration? Send us a message below.
        </p>
      </div>

      {/* Contact Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '36px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        {feedback && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              marginBottom: '24px',
              fontSize: '13px',
              lineHeight: 1.5,
              background: feedback.type === 'success' ? '#ECFDF5' : '#FEF2F2',
              color: feedback.type === 'success' ? '#065F46' : '#991B1B',
              border: feedback.type === 'success' ? '1px solid #A7F3D0' : '1px solid #FECACA'
            }}
          >
            {feedback.message}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Your Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rajiv Sharma"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Business Email *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Subject *
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Question about Union Bank Notification Templates"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Message & Inquiry Details *
            </label>
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your question, integration setup, or feedback in detail..."
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
            Submissions are securely stored and protected against spam by rate limiting. We never share your contact details.
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '12px 24px',
              background: submitting ? '#93C5FD' : '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer'
            }}
          >
            {submitting ? 'Sending Message...' : 'Submit Inquiry →'}
          </button>
        </form>
      </div>
    </div>
  );
};
