import type { FirebaseError } from 'firebase/app';

export function formatAuthError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as FirebaseError).code);
    switch (code) {
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked. Allow popups for this site and try again.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Sign-in was cancelled.';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized for Google sign-in (Firebase → Authorized domains).';
      case 'auth/operation-not-allowed':
        return 'Google sign-in is not enabled in Firebase.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        break;
    }
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return 'Sign-in failed.';
}
