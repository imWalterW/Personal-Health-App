import { GoogleGenAI, Type } from "@google/genai";
import { DailyLog, UserProfile, Meal } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Analyze a meal description or image to estimate nutrition
export const analyzeMeal = async (description: string, mealType: string, imageBase64?: string): Promise<Omit<Meal, 'id' | 'timestamp'>> => {
  try {
    const prompt = description 
      ? `Analyze the following meal: "${description}". Estimate calories, protein (g), carbs (g), and fats (g).`
      : `Analyze this food image. Estimate calories, protein (g), carbs (g), and fats (g). Name the dish.`;

    const parts: any[] = [{ text: prompt }];
    
    if (imageBase64) {
      // Remove data URL prefix if present for the API call if the SDK requires raw base64, 
      // but usually the SDK helpers handle it or we pass the data part. 
      // The @google/genai SDK usually expects the data string without the mime prefix in inlineData.data
      const base64Data = imageBase64.split(',')[1]; 
      const mimeType = imageBase64.split(';')[0].split(':')[1];
      
      parts.unshift({
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            fats: { type: Type.NUMBER },
            type: { type: Type.STRING } // Echo back the meal type
          },
          required: ["name", "calories", "protein", "carbs", "fats"],
        },
      },
    });

    const data = JSON.parse(response.text || "{}");
    return {
      name: data.name || (description ? description.slice(0, 20) : "Uploaded Meal"),
      calories: data.calories || 0,
      protein: data.protein || 0,
      carbs: data.carbs || 0,
      fats: data.fats || 0,
      type: (mealType as any) || 'snack'
    };
  } catch (error) {
    console.error("Gemini Meal Analysis Error:", error);
    // Fallback for demo if API fails or key is missing
    return {
      name: description || "Unknown Meal",
      calories: 300,
      protein: 10,
      carbs: 30,
      fats: 10,
      type: (mealType as any) || 'snack'
    };
  }
};

// Generate a meal suggestion based on remaining calories and time of day
export const suggestMeal = async (
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack', 
  targetCalories: number, 
  dietaryPrefs: string = "healthy"
): Promise<{ name: string; description: string; estimatedCalories: number }> => {
  try {
    const prompt = `Suggest a ${dietaryPrefs} ${mealType} that is approximately ${targetCalories} calories. 
    Return a JSON object with name, description, and estimatedCalories.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            estimatedCalories: { type: Type.NUMBER }
          },
          required: ["name", "description", "estimatedCalories"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return {
      name: "Grilled Chicken Salad",
      description: "Mixed greens with grilled chicken breast, cherry tomatoes, and vinaigrette.",
      estimatedCalories: 400
    };
  }
};

// Generate Daily Insight
export const generateInsight = async (logs: DailyLog[], profile: UserProfile): Promise<string> => {
  try {
    // Summarize last few days
    const summary = logs.slice(-3).map(l => 
      `Date: ${l.date}, Steps: ${l.steps}, Water: ${l.waterBottles * 0.75}L, Calories: ${l.meals.reduce((acc, m) => acc + m.calories, 0)}`
    ).join('\n');

    const prompt = `Based on the following recent health data for a user aiming for ${profile.stepGoal} steps and ${profile.calorieGoal} calories/day, give a one sentence motivational insight or specific health tip.
    Data:
    ${summary}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "Keep moving and staying hydrated to reach your goals!";
  } catch (error) {
    return "Consistency is key! Log your meals and activities daily to see progress.";
  }
};