import { useState } from "react"
import { Clipboard, Plus, ShoppingBasket, Sparkles, Trash2 } from "lucide-react"
import ChoiceGrid from "@/components/ChoiceGrid"
import PageHeader from "@/components/PageHeader"
import { starterRecipes, storageKeys } from "@/lib/fitnessDefaults"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

const categoryChoices = ["protein", "carbs", "produce", "dairy", "pantry", "other"].map((category) => ({
  value: category,
  label: category.charAt(0).toUpperCase() + category.slice(1),
}))

function categoryFor(name) {
  const text = name.toLowerCase()
  if (/chicken|beef|tuna|salmon|egg|protein|yoghurt/.test(text)) return "protein"
  if (/rice|oat|toast|potato|wrap/.test(text)) return "carbs"
  if (/berry|banana|salad|lettuce|vegetable|tomato/.test(text)) return "produce"
  if (/milk|cheese|yoghurt/.test(text)) return "dairy"
  return "other"
}

export default function ShoppingList() {
  const [items, setItems] = useLocalStorage(storageKeys.shopping, [])
  const [recipes] = useLocalStorage(storageKeys.recipes, starterRecipes)
  const [mealPlans] = useLocalStorage(storageKeys.mealPlans, [])
  const [form, setForm] = useState({ name: "", quantity: "", category: "protein" })
  const [status, setStatus] = useState("")

  const save = (event) => {
    event.preventDefault()
    if (!form.name.trim()) return
    setItems((current) => [{ ...form, id: uid("shop"), purchased: false, list_date: todayISO() }, ...current])
    setForm({ name: "", quantity: "", category: "protein" })
  }
  const toggle = (id) => setItems((current) => current.map((item) => item.id === id ? { ...item, purchased: !item.purchased } : item))
  const remove = (id) => setItems((current) => current.filter((item) => item.id !== id))
  const clearPurchased = () => setItems((current) => current.filter((item) => !item.purchased))

  const generateList = () => {
    const ingredients = [
      ...recipes.flatMap((recipe) => recipe.ingredients || []),
      ...mealPlans.flatMap((plan) => (plan.meals || []).map((meal) => meal.food_name)),
    ]
    const unique = [...new Set(ingredients.map((item) => String(item).trim()).filter(Boolean))]
    setItems((current) => [
      ...unique.map((name) => ({ id: uid("shop"), name, quantity: "1", category: categoryFor(name), purchased: false, list_date: todayISO() })),
      ...current,
    ])
    setStatus(`Generated ${unique.length} items from recipes and meal plans.`)
  }

  const shareList = async () => {
    const text = items.map((item) => `${item.purchased ? "[x]" : "[ ]"} ${item.name}${item.quantity ? ` (${item.quantity})` : ""}`).join("\n")
    if (navigator.share) {
      await navigator.share({ title: "ApexAI shopping list", text })
    } else {
      await navigator.clipboard.writeText(text)
      setStatus("Copied list for Notes or Reminders.")
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Shopping"
        title="Grocery list"
        subtitle="Generate a list from meal plans and recipes, toggle purchased items, then share to Notes or Reminders."
        action={<button type="button" onClick={generateList} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><Sparkles size={16} /> Generate</button>}
      />

      <form onSubmit={save} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Item" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
        <input value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="Quantity" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
        <ChoiceGrid label="Category" value={form.category} onChange={(value) => setForm((current) => ({ ...current, category: value }))} options={categoryChoices} columns={3} className="md:col-span-2" />
        <button type="submit" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white md:col-span-2"><Plus size={16} /> Add</button>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><ShoppingBasket size={20} className="text-indigo-600" /><h2 className="text-lg font-bold text-slate-950">Items</h2></div>
          <div className="flex gap-2">
            <button type="button" onClick={shareList} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"><Clipboard size={16} /> Share</button>
            <button type="button" onClick={clearPurchased} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700">Clear purchased</button>
          </div>
        </div>
        {status && <p className="mt-3 text-sm font-medium text-slate-600">{status}</p>}
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
              <label className="flex min-w-0 items-center gap-3">
                <input type="checkbox" checked={item.purchased} onChange={() => toggle(item.id)} className="h-4 w-4" />
                <span className={item.purchased ? "text-slate-400 line-through" : "text-slate-900"}>{item.name} {item.quantity && <span className="text-sm text-slate-500">({item.quantity})</span>}</span>
              </label>
              <button type="button" onClick={() => remove(item.id)} className="min-h-11 min-w-11 rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600"><Trash2 size={16} /></button>
            </div>
          ))}
          {!items.length && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No items yet.</p>}
        </div>
      </section>
    </div>
  )
}
