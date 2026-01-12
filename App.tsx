import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Droplets, Flame, Footprints, Timer, 
  TrendingUp, Moon, Sun, User as UserIcon, 
  Plus, UploadCloud, DownloadCloud,
  ChevronRight, ChevronLeft, X, RefreshCw, Lightbulb, Cloud, CheckCircle, AlertCircle, Bell, Scale, Minus, Trash2, Loader2
} from 'lucide-react';
import { RadialProgress } from './components/RadialChart';
import { MealLogger } from './components/MealLogger';
import { generateInsight } from './services/gemini';
import { initGoogleAuth, signInToGoogle, uploadDataToDrive, downloadDataFromDrive } from './services/googleDrive';
import { DailyLog, UserProfile, ModalType, AppState } from './types';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar 
} from 'recharts';

// --- Icons defined early to prevent TDZ issues ---
const UtensilsIcon = ({className}: {className?: string}) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>
);

// --- Helper Functions ---

const getTodayDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const calculateStreak = (logs: { [date: string]: DailyLog }): number => {
  const dates = Object.keys(logs).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  if (dates.length === 0) return 0;
  
  let streak = 0;
  const todayStr = getTodayDate();
  
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yYear = d.getFullYear();
  const yMonth = String(d.getMonth() + 1).padStart(2, '0');
  const yDay = String(d.getDate()).padStart(2, '0');
  const yesterdayStr = `${yYear}-${yMonth}-${yDay}`;

  if (logs[todayStr]) {
    streak = 1;
  } else if (!logs[yesterdayStr]) {
    return 0;
  }

  const validDates = dates.filter(d => d <= todayStr);
  
  if (validDates.length === 0) return 0;
  if (!logs[todayStr] && logs[yesterdayStr]) streak = 1;

  for (let i = (logs[todayStr] ? 1 : 0); i < validDates.length; i++) {
     const currentDate = new Date(validDates[i]);
     const prevDateInLoop = new Date(validDates[i-1]); 
     const thisDateInLoop = new Date(validDates[i]);   
     
     const diffTime = Math.abs(prevDateInLoop.getTime() - thisDateInLoop.getTime());
     const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

     if (diffDays === 1) {
       streak++;
     } else {
       break;
     }
  }

  return streak;
};

// --- Components ---

interface ModalProps {
  children?: React.ReactNode;
  title: string;
  onClose: () => void;
}

const Modal = ({ children, title, onClose }: ModalProps) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
      <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50">
        <h2 className="font-bold text-lg dark:text-white">{title}</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors">
          <X className="w-5 h-5 dark:text-gray-400" />
        </button>
      </div>
      <div className="overflow-y-auto p-0 flex-1">
        {children}
      </div>
    </div>
  </div>
);

interface MetricInputProps { 
  initialValue: number; 
  unit: string; 
  onSave: (val: number) => void;
}

const MetricInput = ({ initialValue, unit, onSave }: MetricInputProps) => {
  const [val, setVal] = useState<string>(initialValue ? initialValue.toString() : '');
  
  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-center gap-2">
        <input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="text-4xl font-bold text-center w-32 bg-transparent border-b-2 border-primary focus:outline-none dark:text-white"
          autoFocus
        />
        <span className="text-xl text-gray-500">{unit}</span>
      </div>
      <button 
        onClick={() => onSave(Number(val) || 0)}
        className="w-full py-3 bg-primary text-white rounded-xl font-bold text-lg shadow-lg shadow-primary/30 active:scale-95 transition-all"
      >
        Update
      </button>
    </div>
  );
};

// --- Constants ---
const defaultState: AppState = {
  profile: {
    name: 'Guest',
    height: 170,
    weightGoal: 70,
    stepGoal: 10000,
    walkTimeGoal: 60,
    workoutTimeGoal: 30,
    waterGoal: 8,
    calorieGoal: 2000,
    sleepGoal: 8,
    avatarUrl: null,
    darkMode: false,
    autoBackup: false,
    notificationsEnabled: false
  },
  logs: {},
  lastBackup: null,
};

// --- Main App ---

export default function App() {
  // Safe State Initialization
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem('vitalsync_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Robust merge: ensure logs is an object, merging with default for safety
        return {
          ...defaultState,
          ...parsed,
          logs: parsed.logs || {}, 
          profile: { ...defaultState.profile, ...(parsed.profile || {}) }
        };
      }
    } catch (e) {
      console.error("Failed to load state", e);
    }
    return defaultState;
  });

  const [activeModal, setActiveModal] = useState<ModalType>(ModalType.NONE);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stats' | 'profile'>('dashboard');
  const [insight, setInsight] = useState<string>('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [autoSuggestMeal, setAutoSuggestMeal] = useState(false);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());

  // Google Drive State with safe initialization
  const [googleToken, setGoogleToken] = useState<string | null>(() => {
    try {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('vitalsync_g_token');
        const expiry = localStorage.getItem('vitalsync_g_expiry');
        if (token && expiry && Date.now() < parseInt(expiry, 10)) {
          return token;
        }
      }
    } catch (e) {
      console.error("Error loading token", e);
    }
    return null;
  });

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived State
  const today = getTodayDate();
  
  // Safety check for logs access
  const safeLogs = state.logs || {};
  const currentLog: DailyLog = safeLogs[selectedDate] || {
    date: selectedDate,
    weight: 0,
    steps: 0,
    walkTime: 0,
    workoutTime: 0,
    waterBottles: 0,
    sleep: 0,
    meals: []
  };

  const currentCalories = currentLog.meals ? currentLog.meals.reduce((acc, m) => acc + m.calories, 0) : 0;
  const streak = calculateStreak(safeLogs);
  const bmi = state.profile.height > 0 && currentLog.weight > 0 
    ? (currentLog.weight / ((state.profile.height/100) ** 2)).toFixed(1) 
    : '--';
  const bmiNum = parseFloat(bmi);
  const isHealthyBMI = !isNaN(bmiNum) && bmiNum >= 18.5 && bmiNum <= 24.9;
  const isBMIConfigured = !isNaN(bmiNum);
  const waterGoal = state.profile.waterGoal || 8;

  // --- Effects ---

  useEffect(() => {
    try {
      localStorage.setItem('vitalsync_data', JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save state", e);
    }
    
    if (state.profile.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state]);

  useEffect(() => {
    const logsArray = (Object.values(safeLogs) as DailyLog[]).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (logsArray.length > 0 && !insight) {
      handleNewTip();
    }
  }, [Object.keys(safeLogs).length]);

  // Google Auth Init
  useEffect(() => {
    initGoogleAuth(state.profile.googleClientId, (tokenResponse) => {
      const token = tokenResponse.access_token;
      // expires_in is in seconds
      const expiry = Date.now() + (tokenResponse.expires_in * 1000);
      
      try {
        localStorage.setItem('vitalsync_g_token', token);
        localStorage.setItem('vitalsync_g_expiry', expiry.toString());
      } catch (e) {
        console.error("Failed to save token", e);
      }

      setGoogleToken(token);
      setSyncStatus('success');
      setSyncMessage('Connected');
      setTimeout(() => {
        setSyncStatus('idle');
        setSyncMessage('');
      }, 3000);
    });
  }, []);

  // Notifications
  useEffect(() => {
    if (!state.profile.notificationsEnabled) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }

    const interval = setInterval(() => {
      const now = new Date();
      const currentHour = now.getHours();
      // Hydration
      if (currentHour >= 8 && currentHour <= 22 && currentHour % 2 === 0 && now.getMinutes() === 0) {
        if (Notification.permission === 'granted') {
          new Notification("Hydration Check 💧", { body: "Time to drink some water!" });
        }
      }
      // Daily Log
      if (currentHour === 20 && now.getMinutes() === 0) {
         if (Notification.permission === 'granted') {
          new Notification("Daily Log Reminder 📝", { body: "Have you logged your meals today?" });
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [state.profile.notificationsEnabled]);

  // Auto Backup Effect
  useEffect(() => {
    if (state.profile.autoBackup && googleToken && syncStatus === 'idle') {
      const timer = setTimeout(() => {
        handleDriveBackup(true);
      }, 5000); // Debounce backup 5s
      return () => clearTimeout(timer);
    }
  }, [state, googleToken]);

  // --- Handlers ---

  const updateLog = (updates: Partial<DailyLog>) => {
    setState(prev => ({
      ...prev,
      logs: {
        ...prev.logs,
        [selectedDate]: { ...currentLog, ...updates }
      }
    }));
    triggerAnimation();
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    setState(prev => ({
      ...prev,
      profile: { ...prev.profile, ...updates }
    }));
  };

  const changeDate = (offset: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + offset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  const handleNotificationToggle = () => {
    if (!("Notification" in window)) {
        alert("This browser does not support notifications.");
        return;
    }
    if (!state.profile.notificationsEnabled) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          updateProfile({ notificationsEnabled: true });
        } else {
          alert("Permission denied.");
        }
      });
    } else {
      updateProfile({ notificationsEnabled: false });
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        setState(prev => ({ ...prev, ...data })); // Merge safely
        alert('Data imported successfully!');
      } catch (err) {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `vitalsync_backup_${today}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setState(prev => ({ ...prev, lastBackup: Date.now() }));
  };

  const handleDriveBackup = async (silent = false) => {
    if (!googleToken) return;
    if (!silent) {
      setSyncStatus('syncing');
      setSyncMessage('Backing up...');
    }
    try {
      await uploadDataToDrive(state, googleToken);
      setState(prev => ({ ...prev, lastBackup: Date.now() }));
      if (!silent) {
        setSyncStatus('success');
        setSyncMessage('Backup Complete');
        setTimeout(() => { setSyncStatus('idle'); setSyncMessage(''); }, 3000);
      }
    } catch (error) {
      console.error(error);
      if (!silent) {
        setSyncStatus('error');
        setSyncMessage('Backup Failed');
        setTimeout(() => { setSyncStatus('idle'); setSyncMessage(''); }, 3000);
      }
    }
  };

  const handleDriveRestore = async () => {
    if (!googleToken) return;
    setSyncStatus('syncing');
    setSyncMessage('Restoring...');
    try {
      const data = await downloadDataFromDrive(googleToken);
      if (data && data.profile) {
        setState(prev => ({ ...prev, ...data }));
        setSyncStatus('success');
        setSyncMessage('Restore Complete');
        setTimeout(() => { setSyncStatus('idle'); setSyncMessage(''); }, 3000);
      } else {
        throw new Error("Invalid data");
      }
    } catch (error) {
      console.error(error);
      setSyncStatus('error');
      setSyncMessage('Failed to Restore');
      setTimeout(() => { setSyncStatus('idle'); setSyncMessage(''); }, 3000);
    }
  };

  const triggerAnimation = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 2000);
  };

  const handleNewTip = async () => {
    setLoadingInsight(true);
    const logsArray = (Object.values(safeLogs) as DailyLog[]).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const newInsight = await generateInsight(logsArray, state.profile);
    setInsight(newInsight);
    setLoadingInsight(false);
  };

  const closeModal = () => {
    setActiveModal(ModalType.NONE);
    setAutoSuggestMeal(false);
  };
  
  const handleDeleteMeal = (mealId: string) => {
    if (window.confirm("Are you sure?")) {
      const updatedMeals = currentLog.meals.filter(m => m.id !== mealId);
      updateLog({ meals: updatedMeals });
    }
  };

  // --- Renderers ---

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Hello, {state.profile.name}</h1>
          <div className="flex items-center gap-2 mt-1">
             <button onClick={() => changeDate(-1)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
             <input type="date" value={selectedDate} max={today} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-sm text-gray-500 dark:text-gray-400 font-medium focus:outline-none cursor-pointer" />
             <button onClick={() => changeDate(1)} disabled={selectedDate === today} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
           <div className="flex items-center gap-1 px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-sm font-semibold">
              <Flame className="w-4 h-4 fill-current" />
              <span>{streak} Day Streak</span>
            </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg relative overflow-hidden group transition-all">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Activity className="w-24 h-24" />
        </div>
        <div className="relative z-10">
          <h3 className="font-bold text-sm opacity-80 mb-1 flex items-center gap-2">AI Health Insight {loadingInsight && <RefreshCw className="w-3 h-3 animate-spin" />}</h3>
          <p className="text-sm leading-relaxed min-h-[40px]">{insight || "Analyzing your data..."}</p>
          <div className="flex gap-2 mt-4">
            <button onClick={handleNewTip} disabled={loadingInsight} className="flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"><RefreshCw className={`w-3 h-3 ${loadingInsight ? 'animate-spin' : ''}`} /> New Tip</button>
            <button onClick={() => { setAutoSuggestMeal(true); setActiveModal(ModalType.MEAL); }} className="flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"><Lightbulb className="w-3 h-3" /> Suggest Meal</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div onClick={() => setActiveModal(ModalType.NUTRITION_LIST)} className="col-span-2 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 relative overflow-hidden cursor-pointer hover:border-green-500/50 transition-colors">
           <div className="flex justify-between items-center mb-4">
             <div>
               <h3 className="font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-2"><UtensilsIcon className="w-4 h-4" /> Nutrition {currentCalories >= state.profile.calorieGoal && <CheckCircle className="w-4 h-4 text-green-500" />}</h3>
               <p className="text-2xl font-bold dark:text-white mt-1">{currentCalories} <span className="text-sm font-normal text-gray-400">/ {state.profile.calorieGoal} kcal</span></p>
             </div>
             <div className="w-16 h-16 relative"><RadialProgress current={currentCalories} total={state.profile.calorieGoal} color="#10b981" label="Kcal" /></div>
           </div>
           <div className="space-y-2 mb-4">
             {currentLog.meals.slice(-2).map(meal => (
               <div key={meal.id} className="flex justify-between text-sm p-2 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                 <span className="truncate flex-1 dark:text-gray-200">{meal.name}</span>
                 <span className="font-mono text-gray-500 dark:text-gray-400">{meal.calories} kcal</span>
               </div>
             ))}
             {currentLog.meals.length > 2 && <p className="text-xs text-center text-gray-400">+{currentLog.meals.length - 2} more...</p>}
           </div>
           <button onClick={(e) => { e.stopPropagation(); setAutoSuggestMeal(false); setActiveModal(ModalType.MEAL); }} className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"><Plus className="w-4 h-4" /> Log Meal</button>
        </div>

        <div onClick={() => setActiveModal(ModalType.STEPS)} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:border-primary/50 transition-colors cursor-pointer active:scale-95 relative">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600"><Footprints className="w-5 h-5" /></div>
            <div className="flex items-center gap-1"><span className="text-xs text-gray-400">Goal: {state.profile.stepGoal}</span>{currentLog.steps >= state.profile.stepGoal && <CheckCircle className="w-3 h-3 text-green-500" />}</div>
          </div>
          <p className="text-2xl font-bold dark:text-white">{currentLog.steps.toLocaleString()}</p>
          <p className="text-xs text-gray-500">Steps</p>
          <div className="mt-3 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min(100, (currentLog.steps / state.profile.stepGoal) * 100)}%` }}></div></div>
        </div>

        <div onClick={() => setActiveModal(ModalType.WEIGHT)} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:border-blue-500/50 transition-colors cursor-pointer active:scale-95 relative">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600"><Scale className="w-5 h-5" /></div>
            <div className="flex items-center gap-1">{isBMIConfigured && (isHealthyBMI ? <CheckCircle className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-amber-500" />)}<span className="text-xs text-gray-400">BMI: {bmi}</span></div>
          </div>
          <p className="text-2xl font-bold dark:text-white">{currentLog.weight || '--'} <span className="text-sm font-normal text-gray-400">kg</span></p>
          <p className="text-xs text-gray-500">Weight</p>
        </div>

        <div onClick={() => setActiveModal(ModalType.WALK)} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:border-teal-500/50 transition-colors cursor-pointer active:scale-95 relative">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg text-teal-600"><Timer className="w-5 h-5" /></div>
            <div className="flex items-center gap-1"><span className="text-xs text-gray-400">Goal: {state.profile.walkTimeGoal}</span>{currentLog.walkTime >= state.profile.walkTimeGoal && <CheckCircle className="w-3 h-3 text-green-500" />}</div>
          </div>
          <p className="text-2xl font-bold dark:text-white">{currentLog.walkTime} <span className="text-sm font-normal text-gray-400">min</span></p>
          <p className="text-xs text-gray-500">Walking</p>
        </div>

        <div onClick={() => setActiveModal(ModalType.WORKOUT)} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:border-purple-500/50 transition-colors cursor-pointer active:scale-95 relative">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600"><Activity className="w-5 h-5" /></div>
            <div className="flex items-center gap-1"><span className="text-xs text-gray-400">Goal: {state.profile.workoutTimeGoal}</span>{currentLog.workoutTime >= state.profile.workoutTimeGoal && <CheckCircle className="w-3 h-3 text-green-500" />}</div>
          </div>
          <p className="text-2xl font-bold dark:text-white">{currentLog.workoutTime} <span className="text-sm font-normal text-gray-400">min</span></p>
          <p className="text-xs text-gray-500">Workout</p>
        </div>
      </div>
      
      <div onClick={() => setActiveModal(ModalType.WATER)} className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 relative overflow-hidden transition-transform cursor-pointer">
        <div className="absolute top-0 left-0 bottom-0 bg-blue-500/10 transition-all duration-700 ease-in-out" style={{ width: `${Math.min(100, (currentLog.waterBottles / waterGoal) * 100)}%` }} />
        {showConfetti && <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-ping text-blue-500 font-bold text-4xl opacity-20">+</div>}
        <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600"><Droplets className="w-6 h-6" /></div>
                <div>
                    <p className="text-2xl font-bold dark:text-white flex items-center gap-2">{currentLog.waterBottles} <span className="text-sm font-normal text-gray-400">/ {waterGoal}</span>{currentLog.waterBottles >= waterGoal && <CheckCircle className="w-4 h-4 text-green-500" />}</p>
                    <p className="text-xs text-gray-500">Hydration ({(currentLog.waterBottles * 0.75).toFixed(2)}L)</p>
                </div>
            </div>
             <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); if (currentLog.waterBottles > 0) updateLog({ waterBottles: currentLog.waterBottles - 1 }); }} className="w-8 h-8 bg-blue-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors"><Minus className="w-4 h-4 text-blue-500" /></button>
                <button onClick={(e) => { e.stopPropagation(); updateLog({ waterBottles: currentLog.waterBottles + 1 }); }} className="w-10 h-10 bg-blue-50 dark:bg-slate-700/50 rounded-full flex items-center justify-center hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors"><Plus className="w-5 h-5 text-blue-500" /></button>
            </div>
        </div>
      </div>

      <div onClick={() => setActiveModal(ModalType.SLEEP)} className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between cursor-pointer active:scale-95 transition-transform">
          <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-600"><Moon className="w-6 h-6" /></div>
              <div>
                  <p className="text-2xl font-bold dark:text-white flex items-center gap-2">{currentLog.sleep || 0} <span className="text-sm font-normal text-gray-400">hrs</span>{currentLog.sleep >= state.profile.sleepGoal && <CheckCircle className="w-4 h-4 text-green-500" />}</p>
                  <p className="text-xs text-gray-500">Sleep Duration</p>
              </div>
          </div>
          <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center"><ChevronRight className="w-5 h-5 text-gray-500" /></div>
      </div>
    </div>
  );

  const renderStats = () => {
    const data = (Object.values(safeLogs) as DailyLog[]).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-14);
    const weightData = data.filter(d => d.weight > 0);
    
    // Filter data for non-zero values
    const stepsData = data.filter(d => d.steps > 0);
    const walkData = data.filter(d => d.walkTime > 0);
    const workoutData = data.filter(d => d.workoutTime > 0);
    const caloriesData = data.filter(d => d.meals.reduce((acc, m) => acc + m.calories, 0) > 0);
    const waterData = data.filter(d => d.waterBottles > 0);
    const sleepData = data.filter(d => d.sleep > 0);

    // Calculations
    const avgSteps = Math.round(stepsData.reduce((acc, curr) => acc + curr.steps, 0) / (stepsData.length || 1));
    const avgWalk = Math.round(walkData.reduce((acc, curr) => acc + curr.walkTime, 0) / (walkData.length || 1));
    const avgWorkout = Math.round(workoutData.reduce((acc, curr) => acc + curr.workoutTime, 0) / (workoutData.length || 1));
    const avgCalories = Math.round(caloriesData.reduce((acc, curr) => acc + curr.meals.reduce((mAcc, m) => mAcc + m.calories, 0), 0) / (caloriesData.length || 1));
    const avgWater = (waterData.reduce((acc, curr) => acc + curr.waterBottles, 0) / (waterData.length || 1)).toFixed(1);
    const avgSleep = (sleepData.reduce((acc, curr) => acc + (curr.sleep || 0), 0) / (sleepData.length || 1)).toFixed(1);
    const avgWeight = weightData.length > 0 
        ? (weightData.reduce((acc, curr) => acc + curr.weight, 0) / weightData.length).toFixed(1) 
        : '--';

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold dark:text-white">Highlights</h1>
        
        {/* Summary Cards Grid */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Steps */}
          <div className="p-4 rounded-2xl shadow-sm border border-orange-100 dark:border-slate-700 bg-gradient-to-br from-orange-50 to-white dark:from-slate-800 dark:to-slate-800/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Footprints className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Avg Steps</p>
            </div>
            <p className="text-2xl font-bold dark:text-white">{avgSteps}</p>
          </div>
          
          {/* Walking */}
          <div className="p-4 rounded-2xl shadow-sm border border-teal-100 dark:border-slate-700 bg-gradient-to-br from-teal-50 to-white dark:from-slate-800 dark:to-slate-800/50">
             <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                <Timer className="w-4 h-4 text-teal-500" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Avg Walking</p>
            </div>
            <p className="text-2xl font-bold dark:text-white">{avgWalk} <span className="text-sm font-medium text-gray-400">min</span></p>
          </div>

          {/* Workout */}
          <div className="p-4 rounded-2xl shadow-sm border border-purple-100 dark:border-slate-700 bg-gradient-to-br from-purple-50 to-white dark:from-slate-800 dark:to-slate-800/50">
             <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Activity className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Avg Workout</p>
            </div>
            <p className="text-2xl font-bold dark:text-white">{avgWorkout} <span className="text-sm font-medium text-gray-400">min</span></p>
          </div>

          {/* Calories */}
          <div className="p-4 rounded-2xl shadow-sm border border-orange-100 dark:border-slate-700 bg-gradient-to-br from-orange-50 to-white dark:from-slate-800 dark:to-slate-800/50">
             <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Flame className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Avg Calories</p>
            </div>
            <p className="text-2xl font-bold dark:text-white">{avgCalories} <span className="text-sm font-medium text-gray-400">kcal</span></p>
          </div>

          {/* Water */}
          <div className="p-4 rounded-2xl shadow-sm border border-blue-100 dark:border-slate-700 bg-gradient-to-br from-blue-50 to-white dark:from-slate-800 dark:to-slate-800/50">
             <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Droplets className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Avg Water</p>
            </div>
            <p className="text-2xl font-bold dark:text-white">{avgWater} <span className="text-sm font-medium text-gray-400">btl</span></p>
          </div>

          {/* Sleep */}
          <div className="p-4 rounded-2xl shadow-sm border border-indigo-100 dark:border-slate-700 bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-800/50">
             <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Moon className="w-4 h-4 text-indigo-500" />
              </div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Avg Sleep</p>
            </div>
            <p className="text-2xl font-bold dark:text-white">{avgSleep} <span className="text-sm font-medium text-gray-400">hrs</span></p>
          </div>

           {/* Weight */}
           <div className="col-span-2 p-4 rounded-2xl shadow-sm border border-blue-100 dark:border-slate-700 bg-gradient-to-br from-blue-50 to-white dark:from-slate-800 dark:to-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Scale className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Avg Weight</p>
                  <p className="text-2xl font-bold dark:text-white">{avgWeight} <span className="text-sm font-medium text-gray-400">kg</span></p>
                </div>
            </div>
            {/* Can add a small sparkline or icon here if needed, but keeping it simple as per request */}
          </div>
        </div>
        
        {/* Steps Chart */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="font-semibold mb-4 dark:text-gray-300 flex items-center gap-2"><Footprints className="w-4 h-4 text-orange-500" /> Steps History</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs><linearGradient id="colorSteps" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                <XAxis dataKey="date" tickFormatter={(val) => val.slice(5)} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis hide />
                <RechartsTooltip contentStyle={{ backgroundColor: state.profile.darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="steps" stroke="#f97316" fillOpacity={1} fill="url(#colorSteps)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Walking Duration Chart */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
           <h3 className="font-semibold mb-4 dark:text-gray-300 flex items-center gap-2"><Timer className="w-4 h-4 text-teal-500" /> Walking Duration</h3>
           <div className="h-56">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data}>
                 <defs><linearGradient id="colorWalk" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#14b8a6" stopOpacity={0.8}/><stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/></linearGradient></defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                 <XAxis dataKey="date" tickFormatter={(val) => val.slice(5)} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis hide />
                 <RechartsTooltip contentStyle={{ backgroundColor: state.profile.darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                 <Area type="monotone" dataKey="walkTime" stroke="#14b8a6" fillOpacity={1} fill="url(#colorWalk)" strokeWidth={2} />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Workout Duration Chart */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
           <h3 className="font-semibold mb-4 dark:text-gray-300 flex items-center gap-2"><Activity className="w-4 h-4 text-purple-500" /> Workout Duration</h3>
           <div className="h-56">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data}>
                 <defs><linearGradient id="colorWorkout" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.8}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0}/></linearGradient></defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                 <XAxis dataKey="date" tickFormatter={(val) => val.slice(5)} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis hide />
                 <RechartsTooltip contentStyle={{ backgroundColor: state.profile.darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                 <Area type="monotone" dataKey="workoutTime" stroke="#a855f7" fillOpacity={1} fill="url(#colorWorkout)" strokeWidth={2} />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Calories Chart */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
           <h3 className="font-semibold mb-4 dark:text-gray-300 flex items-center gap-2"><Flame className="w-4 h-4 text-orange-500" /> Calories Consumed</h3>
           <div className="h-56">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data.map(d => ({ ...d, calories: d.meals.reduce((acc, m) => acc + m.calories, 0) }))}>
                 <defs><linearGradient id="colorCal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient></defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                 <XAxis dataKey="date" tickFormatter={(val) => val.slice(5)} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis hide />
                 <RechartsTooltip contentStyle={{ backgroundColor: state.profile.darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                 <Area type="monotone" dataKey="calories" stroke="#f97316" fillOpacity={1} fill="url(#colorCal)" strokeWidth={2} />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Water Intake Chart (Updated to AreaChart) */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
           <h3 className="font-semibold mb-4 dark:text-gray-300 flex items-center gap-2"><Droplets className="w-4 h-4 text-blue-500" /> Water Intake</h3>
           <div className="h-56">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data}>
                 <defs><linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                 <XAxis dataKey="date" tickFormatter={(val) => val.slice(5)} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis hide />
                 <RechartsTooltip contentStyle={{ backgroundColor: state.profile.darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                 <Area type="monotone" dataKey="waterBottles" stroke="#3b82f6" fillOpacity={1} fill="url(#colorWater)" strokeWidth={2} />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Sleep Duration Chart (Updated to AreaChart) */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
           <h3 className="font-semibold mb-4 dark:text-gray-300 flex items-center gap-2"><Moon className="w-4 h-4 text-indigo-500" /> Sleep Duration</h3>
           <div className="h-56">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data}>
                 <defs><linearGradient id="colorSleep" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient></defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                 <XAxis dataKey="date" tickFormatter={(val) => val.slice(5)} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis hide />
                 <RechartsTooltip contentStyle={{ backgroundColor: state.profile.darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                 <Area type="monotone" dataKey="sleep" stroke="#6366f1" fillOpacity={1} fill="url(#colorSleep)" strokeWidth={2} />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Weight Chart */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
           <h3 className="font-semibold mb-4 dark:text-gray-300 flex items-center gap-2"><Scale className="w-4 h-4 text-blue-500" /> Weight Trend</h3>
           <div className="h-56"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weightData.length > 0 ? weightData : [{date: today, weight: 0}]}><defs><linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} /><XAxis dataKey="date" tickFormatter={(val) => val.slice(5)} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} /><YAxis domain={['auto', 'auto']} hide /><RechartsTooltip contentStyle={{ backgroundColor: state.profile.darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} /><Area type="monotone" dataKey="weight" stroke="#3b82f6" fillOpacity={1} fill="url(#colorWeight)" strokeWidth={2} connectNulls /></AreaChart></ResponsiveContainer></div>
        </div>
      </div>
    );
  };

  const renderProfile = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold dark:text-white">Profile & Settings</h2>
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col items-center">
         <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-upload')?.click()}>
          <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 dark:bg-slate-700 ring-4 ring-white dark:ring-slate-800 shadow-lg">
            {state.profile.avatarUrl ? <img src={state.profile.avatarUrl} alt="Profile" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400"><UserIcon className="w-10 h-10" /></div>}
          </div>
          <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><UploadCloud className="w-6 h-6 text-white" /></div>
          <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => updateProfile({ avatarUrl: ev.target?.result as string }); reader.readAsDataURL(file); }}} />
        </div>
         <h3 className="text-xl font-bold dark:text-white mt-4">{state.profile.name}</h3>
         <p className="text-gray-500 text-sm">Fitness Enthusiast</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 space-y-4">
        <div><label className="text-sm text-gray-500 block mb-1">Display Name</label><input type="text" value={state.profile.name} onChange={(e) => updateProfile({ name: e.target.value })} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white border-none focus:ring-2 focus:ring-primary" /></div>
        <div className="grid grid-cols-2 gap-4">
           <div><label className="text-sm text-gray-500 block mb-1">Height (cm)</label><input type="number" value={state.profile.height || ''} onChange={(e) => updateProfile({ height: Number(e.target.value) })} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white border-none focus:ring-2 focus:ring-primary" /></div>
           <div><label className="text-sm text-gray-500 block mb-1">Weight Goal (kg)</label><input type="number" value={state.profile.weightGoal || ''} onChange={(e) => updateProfile({ weightGoal: Number(e.target.value) })} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white border-none focus:ring-2 focus:ring-primary" /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
            <div><label className="text-[10px] text-gray-500 block mb-1">Step Goal</label><input type="number" value={state.profile.stepGoal || ''} onChange={(e) => updateProfile({ stepGoal: Number(e.target.value) })} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white border-none focus:ring-2 focus:ring-primary text-sm" /></div>
             <div><label className="text-[10px] text-gray-500 block mb-1">Walk Goal (m)</label><input type="number" value={state.profile.walkTimeGoal || ''} onChange={(e) => updateProfile({ walkTimeGoal: Number(e.target.value) })} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white border-none focus:ring-2 focus:ring-primary text-sm" /></div>
             <div><label className="text-[10px] text-gray-500 block mb-1">Workout (m)</label><input type="number" value={state.profile.workoutTimeGoal || ''} onChange={(e) => updateProfile({ workoutTimeGoal: Number(e.target.value) })} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white border-none focus:ring-2 focus:ring-primary text-sm" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm text-gray-500 block mb-1">Calories Goal</label><input type="number" value={state.profile.calorieGoal || ''} onChange={(e) => updateProfile({ calorieGoal: Number(e.target.value) })} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white border-none focus:ring-2 focus:ring-primary" /></div>
          <div><label className="text-sm text-gray-500 block mb-1">Sleep Goal (hrs)</label><input type="number" value={state.profile.sleepGoal || ''} onChange={(e) => updateProfile({ sleepGoal: Number(e.target.value) })} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white border-none focus:ring-2 focus:ring-primary" /></div>
        </div>
        <div><label className="text-sm text-gray-500 block mb-1">Water Goal (Bottles)</label><input type="number" value={state.profile.waterGoal || ''} onChange={(e) => updateProfile({ waterGoal: Number(e.target.value) })} className="w-full p-2 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white border-none focus:ring-2 focus:ring-primary" /></div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
         <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
           <span className="flex items-center gap-3 dark:text-gray-200"><Bell className="w-5 h-5 text-gray-400" /> Notifications</span>
           <button onClick={handleNotificationToggle} className={`w-12 h-6 rounded-full transition-colors relative ${state.profile.notificationsEnabled ? 'bg-primary' : 'bg-gray-200 dark:bg-slate-700'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${state.profile.notificationsEnabled ? 'left-7' : 'left-1'}`} /></button>
         </div>
         <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-3 dark:text-gray-200"><Cloud className="w-5 h-5 text-gray-400" /> Google Drive Backup</span>
                <div className="flex gap-2">{googleToken ? <CheckCircle className="w-5 h-5 text-green-500" /> : <button onClick={signInToGoogle} className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-slate-600 px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-600 transition-colors">Connect</button>}</div>
            </div>
             {googleToken && (
                <div className="flex flex-col gap-3">
                   <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                        <span className="text-sm dark:text-gray-300">Auto Backup on Change</span>
                        <button onClick={() => updateProfile({ autoBackup: !state.profile.autoBackup })} className={`w-10 h-5 rounded-full transition-colors relative ${state.profile.autoBackup ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`}><div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${state.profile.autoBackup ? 'left-6' : 'left-1'}`} /></button>
                   </div>
                    <div className="flex gap-3">
                        <button onClick={() => handleDriveBackup()} disabled={syncStatus === 'syncing'} className="flex-1 py-2 flex items-center justify-center gap-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            {syncStatus === 'syncing' && syncMessage.includes('Backing') ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Backing up...</span></> : <><UploadCloud className="w-4 h-4" /><span>Backup Now</span></>}
                        </button>
                        <button onClick={handleDriveRestore} disabled={syncStatus === 'syncing'} className="flex-1 py-2 flex items-center justify-center gap-2 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            {syncStatus === 'syncing' && syncMessage.includes('Restoring') ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Restoring...</span></> : <><DownloadCloud className="w-4 h-4" /><span>Restore</span></>}
                        </button>
                    </div>
                </div>
             )}
             {syncStatus === 'success' && <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-xs font-medium text-center flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-1"><CheckCircle className="w-3 h-3" /> {syncMessage}</div>}
             {syncStatus === 'error' && <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium text-center flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-1"><AlertCircle className="w-3 h-3" /> {syncMessage}</div>}
         </div>
      </div>
      
       <div className="grid grid-cols-2 gap-4">
         <button onClick={handleExport} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700/50"><DownloadCloud className="w-6 h-6 text-gray-400" /><span className="text-xs font-medium dark:text-gray-300">Export JSON</span></button>
         <button onClick={() => fileInputRef.current?.click()} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 flex flex-col items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700/50"><UploadCloud className="w-6 h-6 text-gray-400" /><span className="text-xs font-medium dark:text-gray-300">Import JSON</span></button>
         <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
       </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors duration-200 font-sans selection:bg-primary/20">
      <div className="max-w-md mx-auto h-[100dvh] bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col relative border-x border-gray-100 dark:border-slate-800">
        
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide pb-28">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'stats' && renderStats()}
            {activeTab === 'profile' && renderProfile()}
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 pb-safe z-40">
           <div className="flex justify-between items-end px-2 pb-2 pt-2 relative">
             
             {/* Daily */}
             <button 
                onClick={() => setActiveTab('dashboard')} 
                className={`flex flex-col items-center gap-1 w-16 py-1 ${activeTab === 'dashboard' ? 'text-primary' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
             >
               <TrendingUp className="w-6 h-6" />
               <span className="text-[10px] font-medium">Daily</span>
             </button>

             {/* Stats */}
             <button 
                onClick={() => setActiveTab('stats')} 
                className={`flex flex-col items-center gap-1 w-16 py-1 ${activeTab === 'stats' ? 'text-primary' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
             >
                <Activity className="w-6 h-6" />
               <span className="text-[10px] font-medium">Stats</span>
             </button>

             {/* FAB - Center */}
             <div className="relative -top-6">
                <button
                   onClick={() => setActiveModal(ModalType.MEAL)}
                   className="w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-primary/40 flex items-center justify-center hover:scale-105 transition-transform"
                >
                   <Plus className="w-8 h-8" />
                </button>
             </div>

             {/* Profile */}
             <button 
                onClick={() => setActiveTab('profile')} 
                className={`flex flex-col items-center gap-1 w-16 py-1 ${activeTab === 'profile' ? 'text-primary' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
             >
                <UserIcon className="w-6 h-6" />
               <span className="text-[10px] font-medium">Profile</span>
             </button>

             {/* Theme */}
             <button 
                onClick={() => updateProfile({ darkMode: !state.profile.darkMode })} 
                className={`flex flex-col items-center gap-1 w-16 py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300`}
             >
                {state.profile.darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
               <span className="text-[10px] font-medium">Theme</span>
             </button>

           </div>
        </div>

        {/* Modals */}
        {activeModal !== ModalType.NONE && (
           <>
            {activeModal === ModalType.MEAL && (
              <Modal title="Log Meal" onClose={closeModal}>
                <MealLogger 
                  onAddMeal={(meal) => updateLog({ meals: [...currentLog.meals, meal] })} 
                  onClose={closeModal}
                  currentCalories={currentCalories}
                  calorieGoal={state.profile.calorieGoal}
                  profile={state.profile}
                  autoSuggest={autoSuggestMeal}
                />
              </Modal>
            )}

            {activeModal === ModalType.NUTRITION_LIST && (
               <Modal title="Today's Meals" onClose={closeModal}>
                  <div className="p-4 space-y-3">
                    {currentLog.meals.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        <UtensilsIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                        <p>No meals logged yet.</p>
                      </div>
                    ) : (
                      currentLog.meals.map((meal) => (
                        <div key={meal.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                           <div className="flex-1">
                              <p className="font-semibold dark:text-white">{meal.name}</p>
                              <p className="text-xs text-gray-500">{meal.calories} kcal • {meal.type}</p>
                           </div>
                           <button onClick={() => handleDeleteMeal(meal.id)} className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                              <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      ))
                    )}
                    <button onClick={() => setActiveModal(ModalType.MEAL)} className="w-full py-3 mt-4 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" /> Add Meal
                    </button>
                  </div>
               </Modal>
            )}

            {activeModal === ModalType.WEIGHT && (
              <Modal title="Log Weight" onClose={closeModal}>
                <MetricInput initialValue={currentLog.weight} unit="kg" onSave={(val) => { updateLog({ weight: val }); closeModal(); }} />
              </Modal>
            )}

            {activeModal === ModalType.STEPS && (
              <Modal title="Log Steps" onClose={closeModal}>
                <MetricInput initialValue={currentLog.steps} unit="steps" onSave={(val) => { updateLog({ steps: val }); closeModal(); }} />
              </Modal>
            )}

            {activeModal === ModalType.WALK && (
              <Modal title="Walking Duration" onClose={closeModal}>
                <MetricInput initialValue={currentLog.walkTime} unit="min" onSave={(val) => { updateLog({ walkTime: val }); closeModal(); }} />
              </Modal>
            )}
            
            {activeModal === ModalType.WORKOUT && (
              <Modal title="Workout Duration" onClose={closeModal}>
                <MetricInput initialValue={currentLog.workoutTime} unit="min" onSave={(val) => { updateLog({ workoutTime: val }); closeModal(); }} />
              </Modal>
            )}

            {activeModal === ModalType.WATER && (
              <Modal title="Water Intake" onClose={closeModal}>
                 <MetricInput initialValue={currentLog.waterBottles} unit="bottles" onSave={(val) => { updateLog({ waterBottles: val }); closeModal(); }} />
              </Modal>
            )}

            {activeModal === ModalType.SLEEP && (
              <Modal title="Sleep Duration" onClose={closeModal}>
                 <MetricInput initialValue={currentLog.sleep} unit="hours" onSave={(val) => { updateLog({ sleep: val }); closeModal(); }} />
              </Modal>
            )}
           </>
        )}

      </div>
    </div>
  );
}