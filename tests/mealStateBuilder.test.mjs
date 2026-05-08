import assert from "node:assert/strict"
import test from "node:test"
import { buildMealContext, emptyMealSession } from "../server/mealStateBuilder.mjs"

function user(content) {
  return { role: "user", content }
}

function assistant(content) {
  return { role: "assistant", content }
}

function replayMealConversation(conversation, recentLimit = 20) {
  let session = emptyMealSession()
  const history = []
  const snapshots = []

  for (const entry of conversation) {
    if (entry.role === "user") {
      const recentMessages = history.slice(-recentLimit)
      const nextSession = buildMealContext(recentMessages, entry.content, session.active ? session : null)
      if (nextSession) session = nextSession
      snapshots.push({ prompt: entry.content, session })
    }
    history.push(entry)
  }

  return { session, snapshots, history }
}

test("meal session accumulates the exact fragmented egg and tea conversation into one ready-to-log meal", () => {
  const conversation = [
    user("i had egg and tea"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml, no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
    assistant("Anything they were cooked in?"),
    user("cooked in 100g of salted butter"),
    assistant("What dish was the butter used for?"),
    user("the eggs"),
    assistant("I still need more detail."),
    user("17 eggs fried in 100g of salted butter"),
    assistant("still says it needs more detail"),
    user("i just did"),
  ]

  const { session } = replayMealConversation(conversation)

  assert.ok(session.active)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
})

test("meal session clarification flow advances instead of repeating the same missing question", () => {
  const { snapshots } = replayMealConversation([
    user("i had egg and tea"),
    assistant("How much egg did you have?"),
    user("earl grey"),
    assistant("How much Earl Grey tea did you have?"),
    user("250ml, no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
  ])

  assert.equal(snapshots[0].session.clarifyQuestion, "How many eggs did you have?")
  assert.equal(snapshots[1].session.clarifyQuestion, "How much earl grey tea did you have?")
  assert.equal(snapshots[2].session.clarifyQuestion, "How many eggs did you have?")
  assert.equal(snapshots[3].session.clarifyQuestion, "What were the fried eggs cooked in?")
})

test("meal session survives truncated recent history because the existing session remains the source of truth", () => {
  const conversation = [
    user("i had egg and tea"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml, no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
    assistant("Anything they were cooked in?"),
    user("cooked in 100g of salted butter"),
  ]

  const { session } = replayMealConversation(conversation)
  const followUp = buildMealContext([
    assistant("What dish was the butter used for?"),
  ], "the eggs", session)

  assert.ok(followUp)
  assert.equal(followUp.readyToLog, true)
  assert.equal(followUp.summary, "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
})

test("meal session handles out-of-order details and later cooking fat additions", () => {
  const { session } = replayMealConversation([
    user("200g"),
    assistant("What was that for?"),
    user("chicken and rice"),
    assistant("Anything it was cooked in?"),
    user("also cooked in 1 tbsp olive oil"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.match(session.summary.toLowerCase(), /200g chicken/)
  assert.match(session.summary.toLowerCase(), /rice/)
  assert.match(session.summary.toLowerCase(), /1 tbsp olive oil/)
})

test("meal session corrections replace quantities instead of duplicating foods", () => {
  const { session } = replayMealConversation([
    user("i had 2 eggs and tea"),
    assistant("How much tea did you have?"),
    user("250ml"),
    user("actually 3 eggs not 2"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "3 eggs, plus 250ml tea")
  assert.equal(session.items.filter((item) => item.base_name === "egg").length, 1)
})

test("meal session caps repeated clarification loops and logs with a reasonable default once the user keeps repeating themselves", () => {
  const { session } = replayMealConversation([
    user("i had beans"),
    assistant("How much beans did you have?"),
    user("beans"),
    assistant("I still need the amount for the beans."),
    user("beans"),
  ])

  assert.ok(session)
  assert.equal(session.shouldStopClarifying, true)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 serve beans")
})

test("meal session keeps unusual but valid quantities and drink exclusions", () => {
  const { session } = replayMealConversation([
    user("i had 5 tins of heinz baked beans and 2L fresh squeezed apple juice"),
    assistant("Anything else with the juice?"),
    user("and an entire bunch of celery"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.match(session.summary.toLowerCase(), /5 tins heinz baked beans/)
  assert.match(session.summary.toLowerCase(), /2l fresh squeezed apple juice/)
  assert.match(session.summary.toLowerCase(), /1 bunch celery/)
})

test("meal session handles fifty varied fragmented conversations without loops or data loss", () => {
  const scenarios = [
    [
      user("i had chicken and rice"),
      assistant("How much chicken did you have?"),
      user("200g chicken"),
      assistant("How much rice did you have?"),
      user("1 cup rice"),
      user("also cooked in 1 tbsp olive oil"),
    ],
    [
      user("tea and toast"),
      assistant("What type of tea was it?"),
      user("earl grey"),
      assistant("How much tea did you have and was there any milk or sugar?"),
      user("250ml no milk"),
      user("1 slice rye toast"),
      user("1 tbsp vegemite"),
    ],
    [
      user("eggs"),
      assistant("How many eggs did you have?"),
      user("17 fried eggs"),
      assistant("What were they cooked in?"),
      user("100g salted butter"),
      user("used to fry the eggs"),
    ],
    [
      user("beans"),
      assistant("How much beans did you have?"),
      user("5 tins heinz baked beans"),
    ],
    [
      user("apple juice and celery"),
      assistant("How much juice did you have?"),
      user("2l fresh squeezed apple juice"),
      user("1 bunch celery"),
    ],
  ]

  for (let index = 0; index < 50; index += 1) {
    const conversation = scenarios[index % scenarios.length]
    const { session } = replayMealConversation(conversation)
    assert.ok(session, `scenario ${index + 1} should produce a meal session`)
    assert.equal(session.readyToLog, true, `scenario ${index + 1} should be ready to log`)
    assert.equal(session.clarifyQuestion, "", `scenario ${index + 1} should not ask another clarification`)
    assert.match(session.summary, /\S+/, `scenario ${index + 1} should keep a non-empty summary`)
  }
})

test("meal session logs mixed same-food preparations without inventing bogus water-based items", () => {
  const conversation = [
    user("i had egg"),
    assistant("How many eggs did you have?"),
    user("15 fried eggs and two that were hard boiled"),
    assistant("What were the eggs cooked in?"),
    user("fried eggs cooked in butter, hard boiled were just boiled in water"),
  ]

  const { session } = replayMealConversation(conversation)

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.summary, "15 fried eggs cooked in butter, plus 2 hard boiled eggs")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.equal(session.items.filter((item) => item.base_name === "water").length, 0)
})

test("meal session keeps grouped totals, split preparations, and targeted cooking additions together", () => {
  const conversation = [
    user("i had egg"),
    assistant("How many eggs did you have?"),
    user("18 total, 12 fried eggs, 4 hardboiled eggs and 2 raw"),
    assistant("What were the eggs cooked in?"),
    user("the fried eggs were cooking in 100g of unsalted butter"),
    assistant("What were the eggs cooked in?"),
    user("i told you"),
  ]

  const { snapshots, session } = replayMealConversation(conversation)

  assert.equal(snapshots[1].session.clarifyQuestion, "What were the fried eggs cooked in?")
  assert.equal(snapshots[2].session.readyToLog, true)
  assert.equal(snapshots[2].session.clarifyQuestion, "")
  assert.equal(session.summary, "12 fried eggs cooked in 100g unsalted butter, plus 4 hard boiled eggs, plus 2 raw eggs")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 3)
  assert.equal(session.items.filter((item) => item.base_name === "unsalted butter").length, 1)
  assert.equal(session.items.find((item) => item.base_name === "unsalted butter")?.attached_to, "egg::fried")
  assert.equal(session.declaredTotals.length, 1)
  assert.doesNotMatch(session.summary, /\b1l\b/i)
})

test("meal session supports grouped quantity splits for another food with preparation-specific oil", () => {
  const { session } = replayMealConversation([
    user("I had 500g chicken total, 300g grilled, 200g fried in 20g olive oil"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "300g grilled chicken, plus 200g fried chicken cooked in 20g olive oil")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.equal(session.items.find((item) => item.base_name === "olive oil")?.attached_to, "chicken::fried")
})

test("meal session supports grouped split carbs without collapsing fried and plain servings together", () => {
  const { session } = replayMealConversation([
    user("I had 2 cups rice total, 1 cup plain, 1 cup fried with 10g oil"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 cup plain rice, plus 1 cup fried rice cooked in 10g oil")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.equal(session.items.find((item) => item.base_name === "oil")?.attached_to, "rice::fried")
})

test("meal session asks one useful clarification when grouped totals do not add up", () => {
  const { session } = replayMealConversation([
    user("I had 18 eggs total, 12 fried eggs and 4 hardboiled eggs"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, false)
  assert.equal(session.clarifyQuestion, "You said 18 eggs total, but I only have 16 eggs accounted for. What should the split be?")
})

test("meal session keeps multiple foods and their specific cooking additions separate", () => {
  const { session } = replayMealConversation([
    user("I had steak, rice and broccoli"),
    user("300g steak medium rare cooked in butter"),
    user("2 cups rice"),
    user("150g broccoli"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "300g steak medium rare cooked in butter, plus 2 cups rice, plus 150g broccoli")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 3)
  assert.match(String(session.items.find((item) => item.base_name === "butter")?.attached_to || ""), /^steak::/)
})

test("meal session parses drink variants and attaches milk only to the intended drink", () => {
  const { session } = replayMealConversation([
    user("I had 2 coffees"),
    user("one black"),
    user("one with milk"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 black coffee, plus 1 coffee with milk")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  const milk = session.items.find((item) => item.base_name === "milk")
  assert.ok(milk)
  assert.match(String(milk.attached_to || ""), /coffee/)
})

test("meal session keeps condiments attached to the intended primary item", () => {
  const { session } = replayMealConversation([
    user("I had burger with cheese and mayo"),
    user("1 burger"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 burger with cheese and mayo")
  const condimentItems = session.items.filter((item) => item.attached_to)
  assert.equal(condimentItems.length, 2)
  assert.ok(condimentItems.every((item) => /burger/.test(String(item.attached_to || ""))))
})

test("meal session handles grouped totals and cooking additions across two hundred varied conversations", () => {
  const groupedScenarios = [
    {
      name: "eggs grouped",
      conversation: [
        user("18 eggs total"),
        user("12 fried"),
        user("4 boiled"),
        user("2 raw"),
        user("fried in 20g butter"),
      ],
      expect: [
        /12 fried eggs cooked in 20g butter/i,
        /4 boiled eggs/i,
        /2 raw eggs/i,
      ],
    },
    {
      name: "chicken grouped",
      conversation: [
        user("500g chicken total"),
        user("300g grilled"),
        user("rest fried"),
        user("fried in 20g olive oil"),
      ],
      expect: [
        /300g grilled chicken/i,
        /200g fried chicken cooked in 20g olive oil/i,
      ],
    },
    {
      name: "rice grouped",
      conversation: [
        user("2 cups rice total"),
        user("1 cup plain"),
        user("rest fried"),
        user("fried with 10g oil"),
      ],
      expect: [
        /1 cup plain rice/i,
        /1 cup fried rice cooked in 10g oil/i,
      ],
    },
    {
      name: "quantity first chicken",
      conversation: [
        user("200g"),
        user("chicken and rice"),
        user("also cooked in 1 tbsp olive oil"),
      ],
      expect: [
        /200g chicken/i,
        /1 serve rice cooked in 1 tbsp olive oil/i,
      ],
    },
    {
      name: "coffee variants",
      conversation: [
        user("2 coffees"),
        user("one black"),
        user("one with milk"),
      ],
      expect: [
        /1 black coffee/i,
        /1 coffee with milk/i,
      ],
    },
    {
      name: "burger condiments",
      conversation: [
        user("burger with cheese and mayo"),
        user("1 burger"),
      ],
      expect: [
        /1 burger with cheese and mayo/i,
      ],
    },
    {
      name: "drink exclusions",
      conversation: [
        user("tea"),
        user("earl grey"),
        user("250ml"),
        user("no sugar no milk"),
      ],
      expect: [
        /250ml Earl Grey tea with no milk and no sugar/i,
      ],
    },
    {
      name: "rest of meal split",
      conversation: [
        user("3 tacos"),
        user("2 beef"),
        user("rest chicken"),
      ],
      expect: [
        /2 beef taco/i,
        /1 chicken taco/i,
      ],
    },
    {
      name: "sauce attachment",
      conversation: [
        user("300g pasta"),
        user("mixed with 80g pesto"),
      ],
      expect: [
        /300g pasta mixed with 80g pesto/i,
      ],
    },
    {
      name: "topping attachment",
      conversation: [
        user("chips"),
        user("1 bowl"),
        user("with gravy"),
      ],
      expect: [
        /1 bowl chips with gravy/i,
      ],
    },
  ]

  for (let index = 0; index < 200; index += 1) {
    const scenario = groupedScenarios[index % groupedScenarios.length]
    const { session } = replayMealConversation(scenario.conversation)
    assert.ok(session, `${scenario.name} scenario ${index + 1} should produce a meal session`)
    assert.equal(session.readyToLog, true, `${scenario.name} scenario ${index + 1} should be ready to log`)
    assert.equal(session.clarifyQuestion, "", `${scenario.name} scenario ${index + 1} should not ask another clarification`)
    assert.doesNotMatch(session.summary, /\b1l\b/i, `${scenario.name} scenario ${index + 1} should not invent litres`)
    assert.doesNotMatch(session.summary, /\bundefined\b|null\b/i, `${scenario.name} scenario ${index + 1} should not corrupt the summary`)
    for (const expectation of scenario.expect) {
      assert.match(session.summary, expectation, `${scenario.name} scenario ${index + 1} should keep expected structure`)
    }
  }
})

function createSeededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function choose(random, values) {
  return values[Math.floor(random() * values.length)]
}

function quantityValueForUnit(amount, unit, noun) {
  if (unit === "egg") return `${amount} ${amount === 1 ? noun : `${noun}s`}`
  if (unit === "cup") return `${amount} ${amount === 1 ? "cup" : "cups"}`
  if (unit === "g") return `${amount}g`
  return `${amount} ${unit}`
}

function normalizePrimaryQuantities(items, baseName, unit) {
  return items
    .filter((item) => !item.attached_to && item.base_name === baseName && item.quantity?.unit === unit)
    .reduce((total, item) => total + Number(item.quantity?.amount || 0), 0)
}

test("meal session fuzzes two hundred randomized grouped meals without corrupting relationships", () => {
  const random = createSeededRandom(426913)
  const templates = [
    {
      baseName: "egg",
      noun: "egg",
      totalUnit: "egg",
      total: [6, 8, 10, 12, 18],
      preparations: ["fried", "boiled", "raw"],
      cookingAdditions: ["butter", "olive oil"],
      cookingAmounts: ["10g", "20g", "1 tbsp"],
    },
    {
      baseName: "chicken",
      noun: "chicken",
      totalUnit: "g",
      total: [300, 400, 500, 600],
      preparations: ["grilled", "fried", "roasted"],
      cookingAdditions: ["olive oil", "butter"],
      cookingAmounts: ["10g", "15g", "20g"],
    },
    {
      baseName: "rice",
      noun: "rice",
      totalUnit: "cup",
      total: [2, 3, 4],
      preparations: ["plain", "fried"],
      cookingAdditions: ["oil", "soy sauce"],
      cookingAmounts: ["10g", "1 tbsp"],
    },
    {
      baseName: "pasta",
      noun: "pasta",
      totalUnit: "bowl",
      total: [2, 3],
      preparations: ["plain", "mixed"],
      cookingAdditions: ["pesto", "sauce"],
      cookingAmounts: ["80g", "2 tbsp"],
    },
  ]

  for (let index = 0; index < 200; index += 1) {
    const template = choose(random, templates)
    const totalAmount = choose(random, template.total)
    const prepA = choose(random, template.preparations)
    let prepB = choose(random, template.preparations)
    if (template.preparations.length > 1) {
      while (prepB === prepA) prepB = choose(random, template.preparations)
    }

    const splitAmount = template.totalUnit === "g"
      ? Math.round(totalAmount * 0.6)
      : Math.max(1, Math.floor(totalAmount / 2))
    const remainderAmount = totalAmount - splitAmount
    const cookingAddition = choose(random, template.cookingAdditions)
    const cookingAmount = choose(random, template.cookingAmounts)
    const attachmentPreparation = prepA === "fried" || prepA === "mixed"
      ? prepA
      : prepB === "fried" || prepB === "mixed"
        ? prepB
        : prepB

    const totalLine = template.totalUnit === "egg"
      ? `${totalAmount} ${template.noun}s total`
      : `${quantityValueForUnit(totalAmount, template.totalUnit, template.noun)} ${template.noun} total`

    const splitLine = random() > 0.5
      ? `${quantityValueForUnit(splitAmount, template.totalUnit, template.noun)} ${prepA}`
      : `${quantityValueForUnit(splitAmount, template.totalUnit, template.noun)} ${prepA} ${template.noun}`

    const remainderLine = random() > 0.5
      ? `rest ${prepB}`
      : `${quantityValueForUnit(remainderAmount, template.totalUnit, template.noun)} ${prepB}`

    const attachmentLine = random() > 0.5
      ? `${attachmentPreparation} with ${cookingAmount} ${cookingAddition}`
      : `${attachmentPreparation} cooked in ${cookingAmount} ${cookingAddition}`

    const conversation = [
      user(totalLine),
      user(splitLine),
      user(remainderLine),
      user(attachmentLine),
    ]

    const { session } = replayMealConversation(conversation)
    assert.ok(session, `scenario ${index + 1} should produce a meal session`)
    assert.equal(session.readyToLog, true, `scenario ${index + 1} should be ready to log`)
    assert.equal(session.clarifyQuestion, "", `scenario ${index + 1} should not keep clarifying`)
    assert.doesNotMatch(session.summary, /\bundefined\b|null\b|\b1l\b/i, `scenario ${index + 1} should not corrupt the summary`)

    const primaryItems = session.items.filter((item) => !item.attached_to)
    assert.ok(primaryItems.length >= 2, `scenario ${index + 1} should keep grouped primary items`)
    assert.ok(primaryItems.every((item) => item.base_name === template.baseName), `scenario ${index + 1} should keep the same base food`)
    assert.ok(primaryItems.some((item) => item.preparation?.includes(prepA)), `scenario ${index + 1} should keep the first preparation`)
    assert.ok(primaryItems.some((item) => item.preparation?.includes(prepB)), `scenario ${index + 1} should keep the second preparation`)

    const normalizedTotal = normalizePrimaryQuantities(primaryItems, template.baseName, template.totalUnit)
    assert.equal(normalizedTotal, totalAmount, `scenario ${index + 1} should preserve grouped totals`)

    const cookingItem = session.items.find((item) => item.base_name === cookingAddition)
    assert.ok(cookingItem, `scenario ${index + 1} should keep the cooking addition`)
    assert.match(String(cookingItem.attached_to || ""), new RegExp(`^${template.baseName}::`), `scenario ${index + 1} should attach the cooking addition to a subgroup`)
  }
})
