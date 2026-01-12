import { GoogleGenAI, Type } from "@google/genai";
import { DailyLog, UserProfile, Meal } from "../types";

// Initialize AI with API_KEY from environment as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper function to handle rate limits and transient errors
const generateWithRetry = async (model: string, params: any, retries = 3) => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const result = await ai.models.generateContent({
        model,
        ...params
      });
      return result;
    } catch (error: any) {
      lastError = error;
      // Retry on 429 (Too Many Requests) or 503 (Service Unavailable)
      if (error?.status === 429 || error?.status === 503 || error?.message?.includes('429') || error?.message?.includes('503')) {
        // console.warn(`Attempt ${i + 1} failed with ${error.status || 'error'}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i))); // 1s, 2s, 4s
        continue;
      }
      // Break immediately for other errors (like 400 Bad Request)
      throw error;
    }
  }
  throw lastError;
};

// Analyze a meal description or image to estimate nutrition
export const analyzeMeal = async (description: string, mealType: string, imageBase64?: string): Promise<Omit<Meal, 'id' | 'timestamp'>> => {
  try {
    const prompt = description 
      ? `Analyze the following meal: "${description}". Estimate calories, protein (g), carbs (g), and fats (g). Return a raw JSON object (no markdown) with keys: name, calories, protein, carbs, fats.`
      : `Analyze this food image. Estimate calories, protein (g), carbs (g), and fats (g). Name the dish. Return a raw JSON object (no markdown) with keys: name, calories, protein, carbs, fats.`;

    const parts: any[] = [{ text: prompt }];
    
    if (imageBase64) {
      // Robust base64 handling
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64; 
      const mimeType = imageBase64.includes(';') ? imageBase64.split(';')[0].split(':')[1] : 'image/jpeg';
      
      parts.unshift({
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      });
    }

    // Using generateWithRetry to handle potential rate limits
    const response = await generateWithRetry(
      "gemini-3-flash-preview",
      {
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          // Removed responseSchema to prevent validation errors on simple inputs
        },
      }
    );

    const rawText = response.text || "{}";
    
    // Robust JSON extraction: Find the first '{' and last '}'
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    
    let jsonText = rawText;
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = rawText.substring(firstBrace, lastBrace + 1);
    } else {
      // Fallback: strip markdown if braces not found cleanly
      jsonText = rawText.replace(/```json|```/g, '').trim();
    }
    
    const data = JSON.parse(jsonText);
    
    return {
      name: data.name || (description ? description.slice(0, 20) : "Uploaded Meal"),
      calories: Number(data.calories) || 0,
      protein: Number(data.protein) || 0,
      carbs: Number(data.carbs) || 0,
      fats: Number(data.fats) || 0,
      type: (mealType as any) || 'snack'
    };
  } catch (error) {
    console.error("Gemini Meal Analysis Error:", error);
    // Return default values so the app doesn't crash, but log the error
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

    // Using generateWithRetry here as well
    const response = await generateWithRetry(
      "gemini-3-flash-preview",
      {
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
      }
    );

    const rawText = response.text || "{}";
    
    // Robust JSON extraction for suggestions
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    
    let jsonText = rawText;
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = rawText.substring(firstBrace, lastBrace + 1);
    } else {
      jsonText = rawText.replace(/```json|```/g, '').trim();
    }

    return JSON.parse(jsonText);
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
    const summary = logs.slice(-3).map(l => 
      `Date: ${l.date}, Steps: ${l.steps}, Water: ${l.waterBottles * 0.75}L, Calories: ${l.meals.reduce((acc, m) => acc + m.calories, 0)}`
    ).join('\n');

    const prompt = `Based on the following recent health data for a user aiming for ${profile.stepGoal} steps and ${profile.calorieGoal} calories/day, give a one sentence motivational insight or specific health tip.
    Data:
    ${summary}`;

    // Insights are less critical, but we can still use retry logic if we want consistency
    const response = await generateWithRetry(
      "gemini-3-flash-preview",
      {
        contents: prompt,
      }
    );

    return response.text || "Keep moving and staying hydrated to reach your goals!";
  } catch (error) {
    return "Consistency is key! Log your meals and activities daily to see progress.";
  }
};