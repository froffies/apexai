import { useState } from "react";
import { Trash2, Plus, Play, Edit3, Check } from "lucide-react";

const MUSCLE_COLORS = {
  chest: "bg-red-100 text-red-700", back: "bg-blue-100 text-blue-700",
  legs: "bg-green-100 text-green-700", shoulders: "bg-purple-100 text-purple-700",
  arms: "bg-orange-100 text-orange-700", core: "bg-yellow-100 text-yellow-700",
  cardio: "bg-cyan-100 text-cyan-700",
};

export default function WorkoutPlanCard({ workoutName, exercises: initialExercises, onBeginWorkout }) {
  const [exercises, setExercises] = useState(initialExercises || []);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editValues, setEditValues] = useState({ name: "", setsReps: "", weight_kg: 0 });

  const removeExercise = (idx) => setExercises(prev => prev.filter((_, i) => i !== idx));
  const startEdit = (idx) => { setEditingIdx(idx); setEditValues({ ...exercises[idx] }); };
  const saveEdit = () => { setExercises(prev => prev.map((e, i) => i === editingIdx ? { ...e, ...editValues } : e)); setEditingIdx(null); };
  const addExercise = () => { const newEx = { name: "New Exercise", muscle: "", setsReps: "3x10", weight_kg: 0 }; setExercises(prev => [...prev, newEx]); setEditingIdx(exercises.length); setEditValues(newEx); };

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-indigo-600 px-4 py-3">
        <div><p className="text-sm font-semibold text-white">{workoutName || "Workout Plan"}</p><p className="text-xs text-indigo-200">{exercises.length} exercises</p></div>
        <Play size={18} className="text-white" />
      </div>
      <div className="divide-y divide-gray-50">
        {exercises.map((ex, idx) => (
          <div key={idx} className="px-4 py-3">
            {editingIdx === idx ? (
              <div className="space-y-2">
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" value={editValues.name || ""} onChange={e => setEditValues(v => ({ ...v, name: e.target.value }))} placeholder="Exercise name" />
                <div className="flex gap-2">
                  <input className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" value={editValues.setsReps || ""} onChange={e => setEditValues(v => ({ ...v, setsReps: e.target.value }))} placeholder="e.g. 4x8" />
                  <input className="w-24 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" value={editValues.weight_kg || ""} onChange={e => setEditValues(v => ({ ...v, weight_kg: parseFloat(e.target.value) || 0 }))} placeholder="kg" type="number" />
                </div>
                <button onClick={saveEdit} className="flex w-full items-center justify-center gap-1 rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white"><Check size={12} /> Save</button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{ex.name}</p>
                  {ex.muscle && MUSCLE_COLORS[ex.muscle?.toLowerCase()] && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${MUSCLE_COLORS[ex.muscle?.toLowerCase()]}`}>{ex.muscle}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right"><p className="text-sm font-semibold text-indigo-600">{ex.setsReps}</p>{ex.weight_kg > 0 && <p className="text-xs text-gray-400">{ex.weight_kg}kg</p>}</div>
                  <button onClick={() => startEdit(idx)} className="rounded-xl p-2 text-gray-300 hover:text-indigo-500"><Edit3 size={14} /></button>
                  <button onClick={() => removeExercise(idx)} className="rounded-xl p-2 text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 bg-gray-50 px-4 py-3">
        <button onClick={addExercise} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white py-2 text-sm font-semibold text-gray-600"><Plus size={13} /> Add exercise</button>
        <button onClick={() => onBeginWorkout(exercises)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white"><Play size={13} /> Begin workout</button>
      </div>
    </div>
  );
}
