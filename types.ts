
export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  timestamp: number;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  weight: number; // kg
  steps: number;
  walkTime: number; // minutes
  workoutTime: number; // minutes
  waterBottles: number; // count (1 = 750ml)
  sleep: number; // hours
  meals: Meal[];
}

export interface UserProfile {
  name: string;
  height: number; // cm
  weightGoal: number; // kg
  stepGoal: number;
  walkTimeGoal: number; // minutes
  workoutTimeGoal: number; // minutes
  waterGoal?: number; // bottles
  calorieGoal: number;
  sleepGoal: number; // hours
  avatarUrl: string | null;
  darkMode: boolean;
  autoBackup?: boolean;
  notificationsEnabled?: boolean;
  googleClientId?: string;
}

export interface AppState {
  profile: UserProfile;
  logs: { [date: string]: DailyLog };
  lastBackup: number | null;
}

export enum ModalType {
  NONE,
  WEIGHT,
  STEPS,
  WALK,
  WORKOUT,
  MEAL,
  NUTRITION_LIST,
  WATER,
  SLEEP,
  SETTINGS,
  BACKUP
}
