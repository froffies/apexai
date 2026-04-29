import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AuthScreen from '@/components/AuthScreen';
import ErrorBoundary from '@/components/ErrorBoundary';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './Layout.jsx';
import { lazy, Suspense, useState, useEffect } from 'react';
import { getCachedAppRecord } from '@/lib/appStorage';
import { defaultProfile, storageKeys } from '@/lib/fitnessDefaults';
import { installGlobalTelemetry, trackRoute } from '@/lib/telemetry';
import { useLocalStorage } from '@/lib/useLocalStorage';
import { getTabFromPath, initialTabStacks, TAB_ROOTS, TabStackContext } from '@/lib/tabStack';

const Home = lazy(() => import('@/pages/Home'));
const Coach = lazy(() => import('@/pages/Coach'));
const Workouts = lazy(() => import('@/pages/Workouts'));
const Nutrition = lazy(() => import('@/pages/Nutrition'));
const Progress = lazy(() => import('@/pages/Progress'));
const Profile = lazy(() => import('@/pages/Profile'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const NutritionLog = lazy(() => import('@/pages/NutritionLog'));
const WorkoutsLog = lazy(() => import('@/pages/WorkoutsLog'));
const ProgressPhotos = lazy(() => import('@/pages/ProgressPhotos'));
const WorkoutLibrary = lazy(() => import('@/pages/WorkoutLibrary'));
const Challenges = lazy(() => import('@/pages/Challenges'));
const ShoppingList = lazy(() => import('@/pages/ShoppingList'));
const Recipes = lazy(() => import('@/pages/Recipes'));
const Analytics = lazy(() => import('@/pages/Analytics'));

function TabStackProvider({ children }) {
  const location = useLocation();
  const [tabStacks, setTabStacks] = useState(initialTabStacks);
  const [currentTab, setCurrentTab] = useState('Home');

  useEffect(() => {
    const tab = getTabFromPath(location.pathname);
    if (!tab) return;

    setCurrentTab(tab);
    setTabStacks((prev) => {
      const root = TAB_ROOTS[tab];
      const currentStack = prev[tab] || [root];
      if (location.pathname === root) {
        if (currentStack.length === 1 && currentStack[0] === root) return prev;
        return { ...prev, [tab]: [root] };
      }
      if (currentStack[currentStack.length - 1] === location.pathname) return prev;
      return {
        ...prev,
        [tab]: [...currentStack.filter((path) => path !== location.pathname), location.pathname],
      };
    });
  }, [location.pathname]);

  const value = {
    tabStacks, currentTab,
    pushToStack: (tab, path) => setTabStacks(prev => ({ ...prev, [tab]: [...prev[tab], path] })),
    replaceStack: (tab, path) => setTabStacks(prev => ({ ...prev, [tab]: [path] })),
    resetStack: (tab) => setTabStacks(prev => ({ ...prev, [tab]: [TAB_ROOTS[tab]] })),
    getLastPath: (tab) => {
      const stack = tabStacks[tab];
      return stack?.[stack.length - 1] || TAB_ROOTS[tab] || "/";
    },
  };

  return <TabStackContext.Provider value={value}>{children}</TabStackContext.Provider>;
}

const PageFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-white">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
  const [profile] = useLocalStorage(storageKeys.profile, defaultProfile);
  const location = useLocation();
  const effectiveProfile = getCachedAppRecord(storageKeys.profile) || profile;

  useEffect(() => {
    trackRoute(location.pathname)
  }, [location.pathname])

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') return <AuthScreen />;
  }

  if (!effectiveProfile?.onboarded && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  if (effectiveProfile?.onboarded && location.pathname === "/onboarding") {
    return <Navigate to="/" replace />;
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<LayoutWrapper currentPageName="Home"><Home /></LayoutWrapper>} />
        <Route path="/Home" element={<Navigate to="/" replace />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/Onboarding" element={<Navigate to="/onboarding" replace />} />
        <Route path="/Coach" element={<LayoutWrapper currentPageName="Coach"><Coach /></LayoutWrapper>} />
        <Route path="/Workouts" element={<LayoutWrapper currentPageName="Workouts"><Workouts /></LayoutWrapper>} />
        <Route path="/Nutrition" element={<LayoutWrapper currentPageName="Nutrition"><Nutrition /></LayoutWrapper>} />
        <Route path="/Progress" element={<LayoutWrapper currentPageName="Progress"><Progress /></LayoutWrapper>} />
        <Route path="/Profile" element={<LayoutWrapper currentPageName="Profile"><Profile /></LayoutWrapper>} />
        <Route path="/NutritionLog" element={<Navigate to="/nutrition/log" replace />} />
        <Route path="/nutrition/log" element={<LayoutWrapper currentPageName="NutritionLog"><NutritionLog /></LayoutWrapper>} />
        <Route path="/WorkoutsLog" element={<Navigate to="/workouts/log" replace />} />
        <Route path="/workouts/log" element={<LayoutWrapper currentPageName="WorkoutsLog"><WorkoutsLog /></LayoutWrapper>} />
        <Route path="/Recipes" element={<LayoutWrapper currentPageName="Recipes"><Recipes /></LayoutWrapper>} />
        <Route path="/ProgressPhotos" element={<LayoutWrapper currentPageName="ProgressPhotos"><ProgressPhotos /></LayoutWrapper>} />
        <Route path="/WorkoutLibrary" element={<LayoutWrapper currentPageName="WorkoutLibrary"><WorkoutLibrary /></LayoutWrapper>} />
        <Route path="/Challenges" element={<LayoutWrapper currentPageName="Challenges"><Challenges /></LayoutWrapper>} />
        <Route path="/ShoppingList" element={<LayoutWrapper currentPageName="ShoppingList"><ShoppingList /></LayoutWrapper>} />
        <Route path="/Analytics" element={<LayoutWrapper currentPageName="Analytics"><Analytics /></LayoutWrapper>} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const applyMode = () => document.documentElement.classList.toggle("dark", media.matches)
    applyMode()
    media.addEventListener("change", applyMode)
    return () => media.removeEventListener("change", applyMode)
  }, [])

  useEffect(() => {
    installGlobalTelemetry()
  }, [])

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <TabStackProvider>
              <AuthenticatedApp />
            </TabStackProvider>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
