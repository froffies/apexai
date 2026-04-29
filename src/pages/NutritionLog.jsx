import { useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft } from "lucide-react";
import MealLogModal from "@/components/MealLogModal";
import { useTabStack } from "@/lib/tabStack";

export default function NutritionLog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultMealType = searchParams.get("meal");
  const tabStack = useTabStack();

  const handleClose = () => {
    tabStack?.resetStack('Nutrition');
    navigate(createPageUrl("Nutrition"));
  };

  return (
    <div className="min-h-screen bg-black/40">
      <div className="bg-white px-4 py-3 border-b border-gray-100 flex items-center gap-3" style={{ paddingTop: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.25rem))' }}>
        <button onClick={handleClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 active:scale-95 transition-transform">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Log Food</h1>
      </div>
      <MealLogModal defaultMealType={defaultMealType} onClose={handleClose} standalone />
    </div>
  );
}
