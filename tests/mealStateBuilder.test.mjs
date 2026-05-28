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

function assertGraphNativeSession(session) {
  assert.ok(session.intentGraph, "expected graph-native session to expose an intent graph")
  assert.ok(session.candidateFragments, "expected graph-native session to expose candidate fragments")
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

  assertGraphNativeSession(session)
  assert.ok(session.active)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
})

test("graph-native meal session keeps the egg and tea clarification thread out of legacy fallback", () => {
  const { snapshots } = replayMealConversation([
    user("i had egg and tea"),
    assistant("How many eggs did you have?"),
    user("earl grey"),
    assistant("How much earl grey tea did you have?"),
    user("250ml no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
    assistant("What were the fried eggs cooked in?"),
    user("cooked in 100g salted butter"),
  ])

  for (const snapshot of snapshots) assertGraphNativeSession(snapshot.session)
  assert.equal(snapshots[0].session.clarifyQuestion, "How many eggs did you have?")
  assert.equal(snapshots[1].session.clarifyQuestion, "How much earl grey tea did you have?")
  assert.equal(snapshots[2].session.clarifyQuestion, "How many eggs did you have?")
  assert.equal(snapshots[3].session.clarifyQuestion, "What were the fried eggs cooked in?")
  assert.equal(snapshots[4].session.readyToLog, true)
  assert.equal(snapshots[4].session.summary, "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
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

test("meal session binds standalone numeric replies to the pending food quantity instead of inventing numeric food items", () => {
  const { session, snapshots } = replayMealConversation([
    user("i had egg and cake"),
    assistant("How many eggs did you have?"),
    user("18.5"),
  ])

  assert.ok(session)
  assert.equal(snapshots[1].session.readyToLog, true)
  assert.equal(snapshots[1].session.summary, "18.5 eggs, plus 1 serve cake")
  assert.equal(session.items.some((item) => item.base_name === "18.5" || item.base_name === "18"), false)
  assert.equal(session.invalidStructure, false)
})

test("graph-native meal session treats bare had/ate/drank starts as logging intent", () => {
  const session = buildMealContext([], "had steak", emptyMealSession())

  assert.ok(session)
  assert.equal(session.wantsLogging, true)
  assert.equal(session.clarifyQuestion, "How much steak did you have?")
})

test("graph-native meal session preserves logging intent across a quantity clarification", () => {
  const { session } = replayMealConversation([
    user("had steak"),
    assistant("How much steak did you have?"),
    user("300g"),
  ])

  assert.ok(session)
  assert.equal(session.wantsLogging, true)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "300g steak")
})

test("mixed meal and workout starts stay graph-native and do not create pushup nutrition junk", () => {
  const { session } = replayMealConversation([
    user("i had milk and did a pushup and then i had eggs"),
  ])

  assertGraphNativeSession(session)
  assert.equal(session.readyToLog, false)
  assert.deepEqual(
    session.items.filter((item) => !item.attached_to).map((item) => item.base_name).sort(),
    ["egg", "milk"],
  )
  assert.equal(session.items.some((item) => /push/i.test(item.base_name)), false)
})

test("workout-only follow-ups do not mutate an unresolved mixed-turn meal candidate", () => {
  const { snapshots } = replayMealConversation([
    user("i had milk and did a pushup and then i had eggs"),
    assistant("How much milk did you have?"),
    user("i did 14 pushups"),
  ])

  const before = snapshots[0].session
  const after = snapshots[1].session
  assertGraphNativeSession(after)
  assert.equal(after.readyToLog, false)
  assert.equal(after.pendingClarification?.targetBaseName, before.pendingClarification?.targetBaseName)
  assert.deepEqual(
    after.items.filter((item) => !item.attached_to).map((item) => item.base_name).sort(),
    ["egg", "milk"],
  )
})

test("meal session keeps pending milk clarification intact during a workout-only follow-up", () => {
  const existingSession = {
    ...emptyMealSession(),
    active: true,
    mealConversation: true,
    graphNative: false,
    wantsLogging: true,
    summary: "light milk, plus eggs",
    clarifyQuestion: "How much light milk did you have?",
    pendingClarification: {
      type: "quantity",
      targetReference: "milk::light::light",
      targetBaseName: "milk",
      targetLabel: "Light Milk",
      expectedValueType: "number",
    },
    items: [
      {
        base_name: "milk",
        label: "Light Milk",
        category: "drink",
        quantity: null,
        preparation: [],
        modifiers: ["Light"],
        exclusions: [],
        attached_to: null,
        relation: null,
        variant_key: "light",
        meal_type: "",
      },
      {
        base_name: "egg",
        label: "Eggs",
        category: "food",
        quantity: null,
        preparation: [],
        modifiers: [],
        exclusions: [],
        attached_to: null,
        relation: null,
        variant_key: "",
        meal_type: "",
      },
    ],
  }

  const next = buildMealContext([
    user("i had milk and did a pushup and then i had eggs"),
    assistant("How much light milk did you have?"),
  ], "i did 45 total", existingSession)

  assert.ok(next)
  assert.equal(next.summary, "light milk, plus eggs")
  assert.equal(next.clarifyQuestion, "How much light milk did you have?")
  assert.equal(next.pendingClarification?.targetBaseName, "milk")
  assert.equal(next.items.find((item) => item.base_name === "egg")?.quantity || null, null)
})

test("graph-native meal session handles explicit drink modifiers on a fresh turn", () => {
  const session = buildMealContext([], "i had earl grey tea 250ml no sugar no milk", emptyMealSession())

  assert.ok(session)
  assertGraphNativeSession(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "250ml Earl Grey tea with no milk and no sugar")
})

test("graph-native meal session keeps a simple tea clarification thread out of legacy fallback", () => {
  const { snapshots, session } = replayMealConversation([
    user("i had tea"),
    assistant("How much tea did you have?"),
    user("earl grey"),
    assistant("How much earl grey tea did you have?"),
    user("250ml no sugar no milk"),
  ])

  for (const snapshot of snapshots) assertGraphNativeSession(snapshot.session)
  assert.equal(snapshots[0].session.clarifyQuestion, "How much tea did you have?")
  assert.equal(snapshots[1].session.clarifyQuestion, "How much earl grey tea did you have?")
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "250ml Earl Grey tea with no milk and no sugar")
})

test("graph-native meal session keeps a simple steak and tea start out of legacy fallback", () => {
  const session = buildMealContext([], "i had steak and tea", emptyMealSession())

  assert.ok(session)
  assertGraphNativeSession(session)
  assert.deepEqual(
    session.items.filter((item) => !item.attached_to).map((item) => item.base_name).sort(),
    ["steak", "tea"],
  )
  assert.equal(session.clarifyQuestion, "How much tea did you have?")
})

test("graph-native meal session keeps a simple quantity correction out of legacy fallback", () => {
  const { snapshots, session } = replayMealConversation([
    user("i had chicken"),
    assistant("How much chicken did you have?"),
    user("200g"),
    assistant("Logged."),
    user("actually 250g"),
  ])

  assertGraphNativeSession(snapshots[0].session)
  assertGraphNativeSession(snapshots[1].session)
  assertGraphNativeSession(snapshots[2].session)
  assert.equal(snapshots[1].session.summary, "200g chicken")
  assert.equal(session.summary, "250g chicken")
  assert.equal(session.readyToLog, true)
})

test("graph-native meal session keeps simple attachment turns out of legacy fallback", () => {
  const session = buildMealContext([], "i had chips with gravy", emptyMealSession())

  assert.ok(session)
  assertGraphNativeSession(session)
  assert.equal(session.readyToLog, false)
  assert.equal(session.summary, "chips with gravy")
  assert.equal(session.clarifyQuestion, "How much chips did you have?")
})

test("graph-native meal session keeps cooked-in turns out of legacy fallback", () => {
  const session = buildMealContext([], "i had steak cooked in 20g butter", emptyMealSession())

  assert.ok(session)
  assertGraphNativeSession(session)
  assert.equal(session.readyToLog, false)
  assert.equal(session.summary, "steak cooked in 20g butter")
  assert.equal(session.clarifyQuestion, "How much steak did you have?")
})

test("meal session preserves quantity clarification context and does not treat a food word as the missing number", () => {
  const { session, snapshots } = replayMealConversation([
    user("i had egg and cake"),
    assistant("How many eggs did you have?"),
    user("egg"),
  ])

  assert.ok(session)
  assert.equal(snapshots[1].session.readyToLog, false)
  assert.equal(snapshots[1].session.clarifyQuestion, "I'm asking how many eggs you had.")
  assert.equal(session.items.filter((item) => item.base_name === "egg" && !item.attached_to).length, 1)
  assert.equal(session.items.some((item) => item.base_name === "18" || item.base_name === "18.5"), false)
  assert.equal(session.invalidStructure, false)
})

test("meal session keeps a typed clarification when the reply is unrelated text", () => {
  const { session } = replayMealConversation([
    user("i had eggs"),
    assistant("How many eggs did you have?"),
    user("blue"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, false)
  assert.match(session.clarifyQuestion, /how many eggs/i)
  assert.equal(session.items.some((item) => item.base_name === "blue"), false)
})

test("meal session binds a bare number to the explicitly asked food even when other items are still unresolved", () => {
  const { session } = replayMealConversation([
    user("i had eggs and coffees"),
    assistant("How many eggs did you have?"),
    user("18"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, false)
  assert.match(session.clarifyQuestion, /how much coffee/i)
  assert.match(session.summary, /18 eggs/i)
  assert.equal(session.items.some((item) => item.base_name === "18"), false)
})

test("meal session keeps decimal quantities when the pending clarification expects a number", () => {
  const { session } = replayMealConversation([
    user("i had pizza"),
    assistant("How much pizza did you have?"),
    user("0.5"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.match(session.summary.toLowerCase(), /0\.5 .*pizza/)
})

test("inline correction keeps only the final quantity in a legacy single-turn meal", () => {
  const session = buildMealContext([], "i had 200g chicken no wait half a pound", emptyMealSession())

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "0.5 lb chicken")
  assert.equal(session.items.some((item) => item.base_name === "chicken no"), false)
  assert.equal(session.items[0]?.quantity?.amount, 0.5)
  assert.equal(session.items[0]?.quantity?.unit, "lb")
})

test("inline correction keeps only the final quantity when phrased as like half a pound", () => {
  const session = buildMealContext([], "i had 200g chicken no wait like half a pound", emptyMealSession())

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "0.5 lb chicken")
  assert.equal(session.items.some((item) => item.base_name === "chicken no"), false)
  assert.equal(session.items[0]?.quantity?.amount, 0.5)
  assert.equal(session.items[0]?.quantity?.unit, "lb")
})

test("inline correction replaces a counted food quantity cleanly", () => {
  const session = buildMealContext([], "i had 3 eggs actually make that 4", emptyMealSession())

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "4 eggs")
  assert.equal(session.items.some((item) => item.base_name === "actually"), false)
  assert.equal(session.items[0]?.quantity?.amount, 4)
  assert.equal(session.items[0]?.quantity?.unit, "egg")
})

test("inline correction replaces a drink quantity cleanly", () => {
  const session = buildMealContext([], "i had 500ml milk no wait 250ml", emptyMealSession())

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "250ml milk")
  assert.equal(session.items[0]?.quantity?.amount, 250)
  assert.equal(session.items[0]?.quantity?.unit, "ml")
})

test("inline correction replaces a measured food quantity cleanly", () => {
  const session = buildMealContext([], "i had 100g rice actually 200g", emptyMealSession())

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "200g rice")
  assert.equal(session.items.some((item) => /actually/i.test(item.base_name)), false)
  assert.equal(session.items[0]?.quantity?.amount, 200)
  assert.equal(session.items[0]?.quantity?.unit, "g")
})

test("meal session keeps clarification binding stable and ignores complaint text in the pie egg milk conversation", () => {
  const { session, snapshots } = replayMealConversation([
    user("i had pie and egg and milk today"),
    assistant("How many eggs did you have?"),
    user("19.2"),
    assistant("How much milk did you have?"),
    user("eggs, you asked how many eggs and I gave you a number, why can't you understand?"),
    assistant("How much milk did you have?"),
    user("500ml"),
  ])

  assert.ok(session)
  assert.equal(snapshots[1].session.clarifyQuestion, "How much milk did you have?")
  assert.equal(snapshots[2].session.clarifyQuestion, "How much milk did you have?")
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 serve pie, plus 19.2 eggs, plus 500ml milk")
  assert.equal(session.items.some((item) => /you|asked|understand|number/i.test(`${item.base_name} ${item.label}`)), false)
  assert.equal(session.invalidStructure, false)
})

test("meal session does not coerce another unresolved drink detail into a cooking medium attachment", () => {
  const { session, snapshots } = replayMealConversation([
    user("i had tofu and milk"),
    assistant("How much tofu did you have?"),
    user("4 fried tofu"),
    assistant("What were the fried tofu cooked in?"),
    user("437ml milk no sugar"),
    assistant("What were the fried tofu cooked in?"),
    user("cooked in 15g olive oil"),
  ])

  assert.ok(session)
  assert.equal(snapshots[2].session.clarifyQuestion, "What were the fried tofu cooked in?")
  assert.equal(snapshots[2].session.summary, "4 fried tofu, plus 437ml milk with no sugar")
  assert.equal(
    snapshots[2].session.items.some((item) => item.attached_to?.includes("tofu") && /milk/i.test(`${item.base_name} ${item.label}`)),
    false,
  )
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "4 fried tofu cooked in 15g olive oil, plus 437ml milk with no sugar")
})

test("meal session keeps a user-only fragmented drink reply from hijacking a pending cooked-in clarification", () => {
  const { session, snapshots } = replayMealConversation([
    user("i had eggs and coffee"),
    user("1 fried eggs"),
    user("472ml coffee no sugar"),
    user("cooked in 15g gravy"),
  ])

  assert.ok(session)
  assertGraphNativeSession(session)
  assert.equal(snapshots[2].session.clarifyQuestion, "What were the fried eggs cooked in?")
  assert.equal(snapshots[2].session.summary, "1 fried eggs, plus 472ml coffee with no sugar")
  assert.equal(
    snapshots[2].session.items.some((item) => item.attached_to?.includes("egg") && /coffee/i.test(`${item.base_name} ${item.label}`)),
    false,
  )
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 fried eggs cooked in 15g gravy, plus 472ml coffee with no sugar")
})

test("meal session keeps a user-only fragmented ingredient reply from clearing a pending drink quantity", () => {
  const { session, snapshots } = replayMealConversation([
    user("i had eggs and coffee"),
    user("1 fried eggs"),
    user("cooked in 15g gravy"),
    user("472ml coffee no sugar"),
  ])

  assert.ok(session)
  assertGraphNativeSession(session)
  assert.equal(snapshots[2].session.clarifyQuestion, "How much coffee did you have?")
  assert.equal(snapshots[2].session.summary, "1 fried eggs cooked in 15g gravy, plus coffee")
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 fried eggs cooked in 15g gravy, plus 472ml coffee with no sugar")
})

test("meal session keeps a simple user-only steak and tea fragmentation out of legacy collapse", () => {
  const { session, snapshots } = replayMealConversation([
    user("i had steak and tea"),
    user("1 roasted steak"),
    user("399ml tea no sugar"),
    user("cooked in 15g butter"),
  ])

  assert.ok(session)
  assertGraphNativeSession(session)
  assert.equal(snapshots[0].session.summary, "1 serve steak, plus tea")
  assert.equal(snapshots[0].session.clarifyQuestion, "How much tea did you have?")
  assert.equal(snapshots[1].session.summary, "1 roasted steak, plus tea")
  assert.equal(snapshots[1].session.clarifyQuestion, "How much tea did you have?")
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 roasted steak cooked in 15g butter, plus 399ml tea with no sugar")
})

test("meal session keeps frustration text out of saved summaries across varied meal combinations", () => {
  const scenarios = [
    {
      intro: "i had pie and egg and milk today",
      answers: {
        egg: "19.2",
        milk: "500ml",
      },
      expected: "1 serve pie, plus 19.2 eggs, plus 500ml milk",
    },
    {
      intro: "i had cake and eggs and coffee",
      answers: {
        egg: "7.5",
        coffee: "350ml",
      },
      expected: "1 serve cake, plus 7.5 eggs, plus 350ml coffee",
    },
    {
      intro: "i had rice and chicken and sauce",
      answers: {
        rice: "1 serve",
        chicken: "300g",
        sauce: "20g",
      },
      expectedParts: ["rice", "20g sauce"],
    },
    {
      intro: "i had burger and chips and drink",
      answers: {
        burger: "1 serve",
        chip: "1.5 bowls",
        drink: "375ml",
      },
      expectedParts: ["burger", "chips", "drink"],
    },
  ]

  for (const scenario of scenarios) {
    let session = buildMealContext([], scenario.intro, emptyMealSession())
    const history = [user(scenario.intro)]
    let insertedComplaint = false

    for (let turn = 0; turn < 5 && session && !session.readyToLog; turn += 1) {
      const target = session.pendingClarification?.targetBaseName || ""
      const answer = scenario.answers[target]
      assert.ok(answer, `missing answer for ${scenario.intro} targeting ${target}`)

      history.push(assistant(session.clarifyQuestion))
      const answeredSession = buildMealContext(history, answer, session)
      history.push(user(answer))
      session = answeredSession

      if (!insertedComplaint && session && !session.readyToLog && session.pendingClarification?.targetBaseName) {
        const complaintTarget = session.pendingClarification.targetBaseName
        history.push(assistant(session.clarifyQuestion))
        const complainedSession = buildMealContext(
          history,
          "you asked, I gave you a number, why can't you understand?",
          session
        )
        history.push(user("you asked, I gave you a number, why can't you understand?"))
        assert.equal(complainedSession.pendingClarification?.targetBaseName, complaintTarget)
        session = complainedSession
        insertedComplaint = true
      }
    }

    assert.ok(session)
    assert.equal(session.readyToLog, true)
    if (scenario.expected) {
      assert.equal(session.summary, scenario.expected)
    }
    for (const piece of scenario.expectedParts || []) {
      assert.match(session.summary, new RegExp(piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
    }
    assert.equal(session.items.some((item) => /you|asked|understand|number/i.test(`${item.base_name} ${item.label}`)), false)
  }
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
  assert.match(String(session.items.find((item) => item.base_name === "olive oil")?.attached_to || ""), /^chicken::fried/)
})

test("meal session allocates grouped remainder to a new preparation-specific subgroup instead of attaching it to the wrong item", () => {
  const { session } = replayMealConversation([
    user("I had 500g chicken total, 300g grilled, the rest fried in 20g olive oil"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.summary, "300g grilled chicken, plus 200g fried chicken cooked in 20g olive oil")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.match(String(session.items.find((item) => item.base_name === "olive oil")?.attached_to || ""), /^chicken::fried/)
})

test("meal session inherits grouped host bases so split variants stay attached to the shared food instead of turning into junk items", () => {
  const { session } = replayMealConversation([
    user("I had tacos"),
    user("3 total"),
    user("2 beef"),
    user("the rest chicken"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.summary, "2 beef tacos, plus 1 chicken taco")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.equal(session.items.every((item) => item.base_name === "taco"), true)
})

test("meal session keeps grouped drinks coherent when the remainder gets a later modifier", () => {
  const { session } = replayMealConversation([
    user("I had coffee"),
    user("2 coffees total"),
    user("1 black"),
    user("the rest with milk"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.summary, "1 black coffee, plus 1 coffee with milk")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.equal(session.items.find((item) => item.base_name === "milk")?.attached_to, "coffee::milk")
})

test("meal session keeps inline cooking-medium clauses attached to the intended measured subgroup", () => {
  const { session } = replayMealConversation([
    user("I had 300g fried chicken in 20g oil and 200g rice"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "300g fried chicken cooked in 20g oil, plus 200g rice")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  const oil = session.items.find((item) => item.base_name === "oil")
  assert.ok(oil)
  assert.match(String(oil.attached_to || ""), /^chicken::fried/)
  assert.equal(session.clarifyQuestion, "")
})

test("meal session supports host-variant splits like tacos without collapsing the filling into the base item", () => {
  const { session } = replayMealConversation([
    user("I had tacos"),
    assistant("How many tacos did you have?"),
    user("2 tacos beef, 1 chicken"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "2 beef tacos, plus 1 chicken taco")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.equal(session.items.filter((item) => item.base_name === "taco").length, 2)
  assert.doesNotMatch(session.summary, /\btaco beef\b|\bbeef total\b/i)
})

test("meal session supports grouped split carbs without collapsing fried and plain servings together", () => {
  const { session } = replayMealConversation([
    user("I had 2 cups rice total, 1 cup plain, 1 cup fried with 10g oil"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 cup plain rice, plus 1 cup fried rice cooked in 10g oil")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.match(String(session.items.find((item) => item.base_name === "oil")?.attached_to || ""), /^rice::fried/)
})

test("meal session accepts grouped totals when a sibling preparation already carries the cooking medium", () => {
  const { session } = replayMealConversation([
    user("i had 15 eggs total, 13 fried, 2 grilled in 20g butter"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.clarifyQuestion, "")
  assert.match(session.summary, /13 fried eggs/i)
  assert.match(session.summary, /2 grilled eggs cooked in 20g butter/i)
})

test("meal session keeps inherited grouped subgroups intact when a later subgroup adds its own ingredient tail", () => {
  const { session } = replayMealConversation([
    user("i had 500g chicken total, 300g grilled, 200g plain in 20g olive oil"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.summary, "300g grilled chicken, plus 200g plain chicken cooked in 20g olive oil")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.match(String(session.items.find((item) => item.base_name === "olive oil")?.attached_to || ""), /^chicken::plain/)
})

test("meal session keeps same-preparation grouped subgroups separate when only one branch has a cooking tail", () => {
  const { session } = replayMealConversation([
    user("i had 17 eggs total, 11 plain, 6 plain in 20g olive oil"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.summary, "11 plain eggs, plus 6 plain eggs cooked in 20g olive oil")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.equal(session.items.find((item) => item.base_name === "olive oil")?.attached_to, "egg::plain::plain olive oil")
})

test("meal session keeps repeated same-preparation grouped branches separate when only one branch carries a cooking medium", () => {
  const { session } = replayMealConversation([
    user("i had 10 rice total, 5 fried, 5 fried in 20g butter"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.summary, "5 fried rice, plus 5 fried rice cooked in 20g butter")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.match(String(session.items.find((item) => item.base_name === "butter")?.attached_to || ""), /^rice::fried/)
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

test("meal session keeps separate counted foods in the same turn instead of inheriting the previous base name", () => {
  const { session } = replayMealConversation([
    user("I had 3 beers and a burger"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "3 beers, plus 1 burger")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  assert.doesNotMatch(session.summary, /\bburger beer\b|\bbeer burger\b|\b1l\b/i)
})

test("meal session attaches subject-specific additions to the referenced item instead of the most recent item", () => {
  const { session } = replayMealConversation([
    user("I had 1 bowl salad and 1 bowl fries"),
    user("the fries had gravy"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 bowl salad, plus 1 bowl fries with gravy")
  const gravy = session.items.find((item) => item.base_name === "gravy")
  assert.ok(gravy)
  assert.match(String(gravy.attached_to || ""), /^fry/)
})

test("meal session keeps separate quantified foods and attaches later subject-specific ingredients to the correct one", () => {
  const { session } = replayMealConversation([
    user("I had 300g steak"),
    user("and 2 eggs"),
    user("the steak had butter"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "300g steak with butter, plus 2 eggs")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
  const butter = session.items.find((item) => item.base_name === "butter")
  assert.ok(butter)
  assert.match(String(butter.attached_to || ""), /^steak/)
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
    {
      name: "separate counted foods",
      conversation: [
        user("3 beers and a burger"),
      ],
      expect: [
        /3 beers/i,
        /1 burger/i,
      ],
    },
    {
      name: "inline measured cooking clause",
      conversation: [
        user("300g fried chicken in 20g oil and 200g rice"),
      ],
      expect: [
        /300g fried chicken cooked in 20g oil/i,
        /200g rice/i,
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

test("meal session keeps explicit breakfast and lunch groups separate inside one conversation", () => {
  const { session } = replayMealConversation([
    user("breakfast was 2 eggs and 1 slice toast"),
    user("lunch was 200g steak and 1 cup rice"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.meal_groups.length, 2)
  assert.deepEqual(
    session.meal_groups.map((group) => group.meal_type),
    ["breakfast", "lunch"],
  )
  assert.equal(session.meal_groups[0].summary, "2 eggs, plus 1 slice toast")
  assert.equal(session.meal_groups[1].summary, "200g steak, plus 1 cup rice")
})

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
