import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ContactSubmissionSchema } from '@rgs-ledger/validation';

describe('Phase 4B: Public Contact & Inquiries Validation', () => {
  it('validates legitimate contact submission payload', () => {
    const valid = {
      name: 'Priya Sharma',
      email: 'priya@example.com',
      subject: 'Inquiry regarding UPI QR integration',
      message: 'Hello, we are interested in connecting our merchant account with RGS Ledger.'
    };

    const parsed = ContactSubmissionSchema.safeParse(valid);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(parsed.data.name, 'Priya Sharma');
      assert.strictEqual(parsed.data.email, 'priya@example.com');
    }
  });

  it('rejects invalid or incomplete contact submissions', () => {
    // Missing email
    const noEmail = {
      name: 'Rohan',
      subject: 'Question',
      message: 'Too short'
    };
    assert.strictEqual(ContactSubmissionSchema.safeParse(noEmail).success, false);

    // Invalid email
    const invalidEmail = {
      name: 'Rohan',
      email: 'not-an-email',
      subject: 'Question',
      message: 'A message that is long enough.'
    };
    assert.strictEqual(ContactSubmissionSchema.safeParse(invalidEmail).success, false);

    // Message too short (< 10 chars)
    const shortMsg = {
      name: 'Rohan',
      email: 'rohan@example.com',
      subject: 'Question',
      message: 'Hi!'
    };
    assert.strictEqual(ContactSubmissionSchema.safeParse(shortMsg).success, false);
  });
});
