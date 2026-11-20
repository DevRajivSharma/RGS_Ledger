export interface Env {
  API_DISPATCH_URL: string;
  SCHEDULER_SHARED_SECRET: string;
}

export default {
  /**
   * Scheduled cron trigger handler
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const dispatchUrl = env.API_DISPATCH_URL;
    const secret = env.SCHEDULER_SHARED_SECRET;

    ctx.waitUntil(
      fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-scheduler-secret': secret || ''
        },
        body: JSON.stringify({
          cronTriggerTime: event.scheduledTime,
          source: 'cloudflare-worker-scheduler'
        })
      })
    );
  },

  /**
   * Optional HTTP fetch handler for manual ping
   */
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response(JSON.stringify({ status: 'ok', worker: 'rgs-ledger-scheduler' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
