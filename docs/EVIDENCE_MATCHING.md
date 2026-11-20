# Dual-Source Evidence Matching Engine

## 1. Evidence Channels

RGS Ledger validates payment credits by acquiring independent corroboration across two distinct channels:

```
[Customer Pays via UPI App]
             |
             +----------------------------+
             |                            |
             v                            v
  [Bank Generates Email]        [Bank Sends Push Alert to Device]
             |                            |
             v                            v
   [Gmail / Outlook Parser]    [Android NotificationListenerService]
             |                            |
  (Evidence Channel: EMAIL)   (Evidence Channel: ANDROID)
             |                            |
             +------------+---------------+
                          |
                          v
         [Evidence Matching Engine]
                          |
              +-----------+-----------+
              | Matches Policy Rules? |
              +-----------+-----------+
                          |
       +------------------+------------------+
       |                                     |
    [Both Channels Match]             [Only 1 Channel Matches]
       |                                     |
       v                                     v
   `SUCCESS`                          `PARTIAL_SUCCESS`
```

### Channel Rules:
- **Email Channel**: Ingested via Gmail or Microsoft Outlook APIs. Receiving both a Gmail and an Outlook notification for the same transaction still counts as **one** evidence channel (EMAIL).
- **Android Channel**: Ingested via the paired merchant Android companion device using native `NotificationListenerService`.
- **Match Criteria**:
  1. `merchantId` must match.
  2. Transaction amount in paise must match the `PaymentRequest.amountPaise`.
  3. UTR or bank reference number must match or transaction timestamp must fall within the payment's active validity window.
  4. Raw payload hash must be unique to prevent replay/duplicate injection.

---

## 2. Evidence Processing State Machine

Incoming evidence records enter the `payment_evidence` collection in one of five states:

- `UNMATCHED`: Ingested and parsed, but not yet linked to any open `payment_request`.
- `MATCHED`: Successfully paired with an open `payment_request`.
- `CONFLICTING`: Transaction details (amount or order ref) conflict with existing matched records.
- `DUPLICATE`: Identical raw payload hash or previously matched UTR re-submitted.
- `DISCARDED`: Notification does not represent a valid credit transaction (e.g. debit alert or marketing spam).
