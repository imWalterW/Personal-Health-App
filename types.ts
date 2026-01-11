
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
  meals: Meal[];
}

export interface UserProfile {
  name: string;
  height: number; // cm
  weightGoal: number; // kg
  stepGoal: number;
  calorieGoal: number;
  avatarUrl: string | null;
  darkMode: boolean;
  autoBackup?: boolean;
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
  WATER,
  SETTINGS,
  BACKUP
}
