import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * State machine simulating the companion app's authoritative permission,
 * lifecycle auto-refresh, and navigation transitions on Android 13 / OnePlus Nord CE 2.
 */
export enum CompanionUiState {
  CHECKING = 'CHECKING',
  PERMISSION_NOT_GRANTED = 'PERMISSION_NOT_GRANTED',
  PERMISSION_GRANTED_UNPAIRED = 'PERMISSION_GRANTED_UNPAIRED',
  PERMISSION_GRANTED_PAIRED = 'PERMISSION_GRANTED_PAIRED',
  ERROR = 'ERROR'
}

export interface AndroidSystemState {
  apiLevel: number;
  notificationAccessGranted: boolean;
  listenerServiceConnected: boolean;
  shouldThrowExceptionOnCheck?: boolean;
}

export interface DeviceStore {
  deviceId: string | null;
  deviceToken: string | null;
  isPaired: boolean;
}

export class CompanionAppStateMachine {
  public uiState: CompanionUiState = CompanionUiState.CHECKING;
  public lastErrorMessage: string | null = null;
  public logs: string[] = [];

  constructor(
    private system: AndroidSystemState,
    private store: DeviceStore
  ) {}

  /**
   * Evaluates authoritative permission and transitions navigation state.
   */
  public evaluateState(eventContext: string): CompanionUiState {
    this.logs.push(`[RGS_PERMISSION] Evaluating state on ${eventContext}`);

    try {
      if (this.system.shouldThrowExceptionOnCheck) {
        throw new Error('SecurityException: Remote permission service unreachable');
      }

      // Authoritative check: NotificationManager.isNotificationListenerAccessGranted(ComponentName)
      const isGranted = this.system.notificationAccessGranted;
      const isConnected = this.system.listenerServiceConnected;
      const isPaired = this.store.isPaired;

      this.logs.push(
        `[RGS_PERMISSION] Check result: isGranted=${isGranted}, listenerConnected=${isConnected}, isPaired=${isPaired}`
      );

      let targetState: CompanionUiState;
      if (!isGranted) {
        targetState = CompanionUiState.PERMISSION_NOT_GRANTED;
      } else if (!isPaired) {
        targetState = CompanionUiState.PERMISSION_GRANTED_UNPAIRED;
      } else {
        targetState = CompanionUiState.PERMISSION_GRANTED_PAIRED;
      }

      if (this.uiState !== targetState) {
        this.logs.push(`[RGS_PERMISSION] Transitioning: ${this.uiState} -> ${targetState}`);
        this.uiState = targetState;
      }

      return this.uiState;
    } catch (err: any) {
      this.lastErrorMessage = err.message || 'Unknown error';
      this.logs.push(`[RGS_PERMISSION] Evaluation failed: ${this.lastErrorMessage}`);
      this.uiState = CompanionUiState.ERROR;
      return this.uiState;
    }
  }

  public onResume(): CompanionUiState {
    this.logs.push('[RGS_PERMISSION] Activity onResume triggered');
    return this.evaluateState('onResume');
  }

  public onColdStart(): CompanionUiState {
    this.logs.push('[RGS_PERMISSION] Activity onCreate cold start triggered');
    return this.evaluateState('onCreate');
  }
}

describe('Android Companion Permission Detection & Lifecycle Navigation Suite', () => {

  it('Case 1: Fresh installation, permission denied -> Shows Permission Required view', () => {
    const system: AndroidSystemState = {
      apiLevel: 33, // Android 13 (OnePlus Nord CE 2)
      notificationAccessGranted: false,
      listenerServiceConnected: false
    };
    const store: DeviceStore = { deviceId: null, deviceToken: null, isPaired: false };

    const app = new CompanionAppStateMachine(system, store);
    const state = app.onColdStart();

    assert.strictEqual(state, CompanionUiState.PERMISSION_NOT_GRANTED);
    assert.strictEqual(app.uiState, CompanionUiState.PERMISSION_NOT_GRANTED);
    assert.ok(app.logs.some(l => l.includes('PERMISSION_NOT_GRANTED')));
  });

  it('Case 2: Grant permission in Settings and return to app -> onResume transitions immediately to pairing screen', () => {
    const system: AndroidSystemState = {
      apiLevel: 33,
      notificationAccessGranted: false,
      listenerServiceConnected: false
    };
    const store: DeviceStore = { deviceId: null, deviceToken: null, isPaired: false };
    const app = new CompanionAppStateMachine(system, store);
    app.onColdStart();
    assert.strictEqual(app.uiState, CompanionUiState.PERMISSION_NOT_GRANTED);

    // User is redirected to Settings, grants Notification Access, and returns:
    system.notificationAccessGranted = true;
    system.listenerServiceConnected = true;

    const resumedState = app.onResume();

    assert.strictEqual(resumedState, CompanionUiState.PERMISSION_GRANTED_UNPAIRED);
    assert.ok(app.logs.some(l => l.includes('Transitioning: PERMISSION_NOT_GRANTED -> PERMISSION_GRANTED_UNPAIRED')));
  });

  it('Case 3: Permission already granted before opening the app -> Cold start immediately opens pairing/dashboard', () => {
    const system: AndroidSystemState = {
      apiLevel: 33,
      notificationAccessGranted: true,
      listenerServiceConnected: true
    };
    const store: DeviceStore = { deviceId: null, deviceToken: null, isPaired: false };
    const app = new CompanionAppStateMachine(system, store);

    const state = app.onColdStart();

    assert.strictEqual(state, CompanionUiState.PERMISSION_GRANTED_UNPAIRED);
    assert.notStrictEqual(state, CompanionUiState.PERMISSION_NOT_GRANTED, 'Must not flash permission required');
  });

  it('Case 4: Leave app, revoke permission in Settings, return -> onResume transitions back to Permission Required', () => {
    const system: AndroidSystemState = {
      apiLevel: 33,
      notificationAccessGranted: true,
      listenerServiceConnected: true
    };
    const store: DeviceStore = { deviceId: 'dev_123', deviceToken: 'tok_abc', isPaired: true };
    const app = new CompanionAppStateMachine(system, store);
    app.onColdStart();
    assert.strictEqual(app.uiState, CompanionUiState.PERMISSION_GRANTED_PAIRED);

    // User revokes notification access in Android Settings and returns:
    system.notificationAccessGranted = false;
    system.listenerServiceConnected = false;

    const resumedState = app.onResume();

    assert.strictEqual(resumedState, CompanionUiState.PERMISSION_NOT_GRANTED);
    assert.ok(app.logs.some(l => l.includes('Transitioning: PERMISSION_GRANTED_PAIRED -> PERMISSION_NOT_GRANTED')));
  });

  it('Case 5: Kill and restart the app with permission granted -> Retains paired dashboard state without asking again', () => {
    const system: AndroidSystemState = {
      apiLevel: 33,
      notificationAccessGranted: true,
      listenerServiceConnected: true
    };
    const store: DeviceStore = { deviceId: 'dev_123', deviceToken: 'tok_abc', isPaired: true };
    const app = new CompanionAppStateMachine(system, store);

    const state = app.onColdStart();

    assert.strictEqual(state, CompanionUiState.PERMISSION_GRANTED_PAIRED);
    assert.strictEqual(app.uiState, CompanionUiState.PERMISSION_GRANTED_PAIRED);
  });

  it('Case 6: Temporarily background the app and resume it -> Maintains active view without unnecessary resets', () => {
    const system: AndroidSystemState = {
      apiLevel: 33,
      notificationAccessGranted: true,
      listenerServiceConnected: true
    };
    const store: DeviceStore = { deviceId: 'dev_123', deviceToken: 'tok_abc', isPaired: true };
    const app = new CompanionAppStateMachine(system, store);
    app.onColdStart();
    assert.strictEqual(app.uiState, CompanionUiState.PERMISSION_GRANTED_PAIRED);

    const initialLogCount = app.logs.length;
    // App backgrounded and resumed without system changes
    const resumedState = app.onResume();

    assert.strictEqual(resumedState, CompanionUiState.PERMISSION_GRANTED_PAIRED);
    // Does not log any state transitions
    assert.ok(!app.logs.slice(initialLogCount).some(l => l.includes('Transitioning:')));
  });

  it('Case 7: Native permission-check failure -> Gracefully renders ERROR state with retry, never assumes granted', () => {
    const system: AndroidSystemState = {
      apiLevel: 33,
      notificationAccessGranted: false,
      listenerServiceConnected: false,
      shouldThrowExceptionOnCheck: true
    };
    const store: DeviceStore = { deviceId: null, deviceToken: null, isPaired: false };
    const app = new CompanionAppStateMachine(system, store);

    const state = app.onColdStart();

    assert.strictEqual(state, CompanionUiState.ERROR);
    assert.ok(app.lastErrorMessage?.includes('SecurityException'));
    assert.notStrictEqual(state, CompanionUiState.PERMISSION_GRANTED_UNPAIRED);
    assert.notStrictEqual(state, CompanionUiState.PERMISSION_GRANTED_PAIRED);

    // Now issue is resolved and retry is clicked
    system.shouldThrowExceptionOnCheck = false;
    system.notificationAccessGranted = true;

    const retriedState = app.evaluateState('RetryButton');
    assert.strictEqual(retriedState, CompanionUiState.PERMISSION_GRANTED_UNPAIRED);
  });

  it('Accurately distinguishes between Permission Granted and Service Connected states', () => {
    const system: AndroidSystemState = {
      apiLevel: 33,
      notificationAccessGranted: true, // Permission granted in settings
      listenerServiceConnected: false // But service is not bound yet
    };
    const store: DeviceStore = { deviceId: null, deviceToken: null, isPaired: false };
    const app = new CompanionAppStateMachine(system, store);

    const state = app.onColdStart();
    assert.strictEqual(state, CompanionUiState.PERMISSION_GRANTED_UNPAIRED);

    // Verify diagnostic logs distinguish between the two
    const checkLog = app.logs.find(l => l.includes('Check result:'));
    assert.ok(checkLog?.includes('isGranted=true'));
    assert.ok(checkLog?.includes('listenerConnected=false'));
  });
});
