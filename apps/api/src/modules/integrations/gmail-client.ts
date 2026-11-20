export interface GmailMessageSummary {
  id: string;
  threadId: string;
}

export interface GmailListMessagesResponse {
  messages: GmailMessageSummary[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface ParsedEmailContent {
  id: string;
  sender: string;
  subject: string;
  date: Date;
  snippet: string;
  bodyText: string;
}

export interface IGmailClient {
  listMessages(
    accessToken: string,
    options?: { q?: string; pageToken?: string; maxResults?: number }
  ): Promise<GmailListMessagesResponse>;

  getMessage(accessToken: string, messageId: string): Promise<any>;
}

export class DefaultGmailClient implements IGmailClient {
  private async executeWithRetry<T>(fn: () => Promise<Response>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const response = await fn();

        if (response.status === 401) {
          throw new Error('GMAIL_TOKEN_EXPIRED: Access token expired or invalid.');
        }

        if (response.status === 429 || response.status === 403) {
          const body = await response.text();
          if (body.includes('rateLimitExceeded') || body.includes('userRateLimitExceeded') || response.status === 429) {
            if (attempt < maxRetries) {
              const backoffMs = Math.pow(2, attempt) * 500;
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
            throw new Error(`GMAIL_QUOTA_EXCEEDED: Rate limit or quota exceeded [${response.status}].`);
          }
        }

        if (!response.ok) {
          const text = await response.text();
          if (response.status >= 500 && attempt < maxRetries) {
            const backoffMs = Math.pow(2, attempt) * 500;
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }
          throw new Error(`Gmail API error [${response.status}]: ${text}`);
        }

        return (await response.json()) as T;
      } catch (err: any) {
        if (
          err.message?.includes('GMAIL_TOKEN_EXPIRED') ||
          err.message?.includes('GMAIL_QUOTA_EXCEEDED') ||
          attempt >= maxRetries
        ) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }

    throw new Error('Gmail API request failed after maximum retries.');
  }

  public async listMessages(
    accessToken: string,
    options?: { q?: string; pageToken?: string; maxResults?: number }
  ): Promise<GmailListMessagesResponse> {
    const params = new URLSearchParams();
    if (options?.q) params.set('q', options.q);
    if (options?.pageToken) params.set('pageToken', options.pageToken);
    if (options?.maxResults) params.set('maxResults', String(options.maxResults));

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`;

    const data = await this.executeWithRetry<any>(() =>
      fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
    );

    return {
      messages: data.messages || [],
      nextPageToken: data.nextPageToken,
      resultSizeEstimate: data.resultSizeEstimate
    };
  }

  public async getMessage(accessToken: string, messageId: string): Promise<any> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`;

    return this.executeWithRetry<any>(() =>
      fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
    );
  }

  /**
   * Parses raw Gmail message payload into standardized text content and headers.
   */
  public static extractContent(msg: any): ParsedEmailContent {
    const headers = msg.payload?.headers || [];
    const getHeader = (name: string): string => {
      const h = headers.find((item: any) => item.name?.toLowerCase() === name.toLowerCase());
      return h ? h.value : '';
    };

    const sender = getHeader('from');
    const subject = getHeader('subject');
    const dateStr = getHeader('date');
    const internalDate = msg.internalDate ? new Date(parseInt(msg.internalDate, 10)) : new Date();
    const date = dateStr ? new Date(dateStr) : internalDate;

    // Helper to decode base64url body data
    const decodeBase64 = (b64: string): string => {
      try {
        return Buffer.from(b64, 'base64url').toString('utf8');
      } catch {
        return '';
      }
    };

    let bodyText = '';

    // Recursive extractor across mime parts
    const extractParts = (part: any) => {
      if (!part) return;
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText += decodeBase64(part.body.data) + '\n';
      } else if (part.mimeType === 'text/html' && part.body?.data && !bodyText) {
        // Strip basic HTML tags if plain text wasn't found
        const html = decodeBase64(part.body.data);
        bodyText += html.replace(/<[^>]*>/g, ' ') + '\n';
      }
      if (part.parts && Array.isArray(part.parts)) {
        for (const subPart of part.parts) {
          extractParts(subPart);
        }
      }
    };

    if (msg.payload) {
      if (msg.payload.body?.data) {
        bodyText = decodeBase64(msg.payload.body.data);
      } else if (msg.payload.parts) {
        extractParts(msg.payload);
      }
    }

    const cleanBody = (bodyText || msg.snippet || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    return {
      id: msg.id,
      sender: sender.toLowerCase(),
      subject,
      date: isNaN(date.getTime()) ? internalDate : date,
      snippet: msg.snippet || '',
      bodyText: cleanBody
    };
  }
}

export const defaultGmailClient = new DefaultGmailClient();
