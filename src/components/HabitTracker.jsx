import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { defaultHabits, storageKeys } from "@/lib/fitnessDefaults"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

export default function HabitTracker() {
  const [habits, setHabits] = useLocalStorage(storageKeys.habits, defaultHabits)
  const [habitName, setHabitName] = useState("")
  const today = todayISO()
  const todaysHabits = habits.filter((habit) => habit.date === today)

  const addHabit = (event) => {
    event.preventDefault()
    const habit = habitName.trim()
    if (!habit) return
    setHabits((current) => [{ id: uid("habit"), date: today, habit, completed: false }, ...current])
    setHabitName("")
  }

  const toggleHabit = (id) => {
    setHabits((current) => current.map((habit) => (habit.id === id ? { ...habit, completed: !habit.completed } : habit)))
  }

  const removeHabit = (id) => {
    setHabits((current) => current.filter((habit) => habit.id !== id))
  }

  const completed = todaysHabits.filter((habit) => habit.completed).length

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Habit tracker</h2>
          <p className="mt-1 text-sm text-slate-500">{completed}/{todaysHabits.length} completed today</p>
        </div>
      </div>

      <form onSubmit={addHabit} className="mt-4 flex gap-2">
        <input
          value={habitName}
          onChange={(event) => setHabitName(event.target.value)}
          placeholder="Add daily habit"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button type="submit" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Add
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {todaysHabits.map((habit) => (
          <div key={habit.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <label className="flex min-w-0 items-center gap-3">
              <input type="checkbox" checked={habit.completed} onChange={() => toggleHabit(habit.id)} className="h-4 w-4" />
              <span className={habit.completed ? "text-slate-400 line-through" : "text-slate-900"}>{habit.habit}</span>
            </label>
            <button type="button" onClick={() => removeHabit(habit.id)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
