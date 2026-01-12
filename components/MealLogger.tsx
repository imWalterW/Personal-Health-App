import React, { useState, useEffect, useRef } from 'react';
import { analyzeMeal, suggestMeal } from '../services/gemini';
import { Meal, UserProfile } from '../types';
import { Loader2, Utensils, Sparkles, Plus, Camera, Image as ImageIcon, X } from 'lucide-react';

interface MealLoggerProps {
  onAddMeal: (meal: Meal) => void;
  onClose: () => void;
  currentCalories: number;
  calorieGoal: number;
  profile: UserProfile;
  autoSuggest?: boolean;
}

// Helper to compress images before sending to API
const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const MealLogger: React.FC<MealLoggerProps> = ({ 
  onAddMeal, 
  onClose, 
  currentCalories, 
  calorieGoal, 
  profile,
  autoSuggest = false 
}) => {
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [suggestion, setSuggestion] = useState<{ name: string; description: string; estimatedCalories: number } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine current meal type based on time
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 11) setMealType('breakfast');
    else if (hour < 16) setMealType('lunch');
    else setMealType('dinner');
  }, []);

  // Handle auto-suggestion if triggered from dashboard
  useEffect(() => {
    if (autoSuggest) {
      // Small timeout to allow state to settle
      const timer = setTimeout(() => {
        handleSuggest();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoSuggest]);

  const handleSuggest = async () => {
    setIsAnalyzing(true);
    setSuggestion(null);
    setImagePreview(null);
    
    // Calculate split targets
    const breakfastTarget = profile.calorieGoal * 0.3;
    const lunchTarget = profile.calorieGoal * 0.4;
    const dinnerTarget = profile.calorieGoal * 0.3;

    let target = 500;
    if (mealType === 'breakfast') target = breakfastTarget;
    if (mealType === 'lunch') target = lunchTarget;
    if (mealType === 'dinner') target = dinnerTarget;

    const result = await suggestMeal(mealType, target);
    setSuggestion(result);
    setIsAnalyzing(false);
  };

  const handleAnalyzeAndAdd = async () => {
    if ((!description.trim() && !imagePreview) && !suggestion) return;
    setIsAnalyzing(true);
    
    const textToAnalyze = description || (suggestion ? `${suggestion.name} - ${suggestion.description}` : '');
    
    const analysis = await analyzeMeal(textToAnalyze, mealType, imagePreview || undefined);
    
    const newMeal: Meal = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      ...analysis,
      type: mealType // Ensure type from state is used
    };

    onAddMeal(newMeal);
    setIsAnalyzing(false);
    onClose();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawResult = reader.result as string;
        try {
          const compressed = await compressImage(rawResult);
          setImagePreview(compressed);
        } catch (e) {
          console.error("Compression failed", e);
          setImagePreview(rawResult);
        }
        setSuggestion(null); // Clear suggestion if user uploads image
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xl font-bold dark:text-white">Log Meal</h3>
        <select 
          value={mealType} 
          onChange={(e) => setMealType(e.target.value as any)}
          className="bg-gray-100 dark:bg-slate-800 border-none rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary dark:text-white"
        >
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
        </select>
      </div>

      {!suggestion ? (
        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your meal or upload a photo..."
              className="w-full h-32 p-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-primary focus:outline-none resize-none dark:text-white transition-colors"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-3 right-3 p-2 bg-white dark:bg-slate-700 rounded-full shadow-md hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
            >
              <Camera className="w-5 h-5 text-gray-500 dark:text-gray-300" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload}
            />
          </div>

          {imagePreview && (
            <div className="relative rounded-xl overflow-hidden h-40 bg-gray-100 dark:bg-slate-800 flex items-center justify-center border border-dashed border-gray-300 dark:border-slate-700">
              <img src={imagePreview} alt="Preview" className="h-full object-contain" />
              <button 
                onClick={() => setImagePreview(null)}
                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={handleSuggest}
              disabled={isAnalyzing}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-secondary/10 text-secondary hover:bg-secondary/20 rounded-xl transition-colors font-medium"
            >
              {isAnalyzing && !imagePreview && !description ? <Loader2 className="animate-spin w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              AI Suggest
            </button>
            <button
              onClick={handleAnalyzeAndAdd}
              disabled={(!description.trim() && !imagePreview) || isAnalyzing}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-primary text-white hover:bg-primary/90 rounded-xl transition-colors font-medium shadow-lg shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {imagePreview ? 'Analyze Photo' : 'Add Meal'}
            </button>
          </div>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-secondary/10 border border-secondary/20 p-4 rounded-xl mb-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-secondary mt-1 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-secondary">{suggestion.name}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{suggestion.description}</p>
                <p className="text-xs font-medium text-secondary mt-2">~{suggestion.estimatedCalories} kcal</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSuggestion(null)}
              className="flex-1 py-3 px-4 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleAnalyzeAndAdd}
              className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-medium shadow-lg shadow-primary/30 hover:bg-primary/90"
            >
              Log This Meal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};