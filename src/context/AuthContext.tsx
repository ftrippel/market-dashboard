import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase';
import { isMobileAuthDevice } from '../utils/device';

interface AuthContextValue {
  configured: boolean;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const googleProvider = new GoogleAuthProvider();

async function ensureAuthPersistence(): Promise<void> {
  await setPersistence(getFirebaseAuth(), browserLocalPersistence);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    let active = true;

    void (async () => {
      try {
        await ensureAuthPersistence();
        await getRedirectResult(auth);
      } catch (err) {
        console.error('Firebase redirect sign-in failed:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [configured]);

  const signInWithGoogle = useCallback(async () => {
    if (!configured) {
      throw new Error('Firebase is not configured.');
    }

    const auth = getFirebaseAuth();
    await ensureAuthPersistence();

    if (isMobileAuthDevice()) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }

    await signInWithPopup(auth, googleProvider);
  }, [configured]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    await firebaseSignOut(getFirebaseAuth());
  }, [configured]);

  const value = useMemo(
    () => ({
      configured,
      user,
      loading,
      signInWithGoogle,
      signOut,
    }),
    [configured, user, loading, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
