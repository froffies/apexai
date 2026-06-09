import { createIngredientItemFromFood, recalcRecipeFromIngredients } from "./nutritionHelpers.js"

const auSource = "Australian Food Composition Database / FSANZ AFCD Release 3, curated local catalogue"
const auDerivedSource = "Australian Food Composition Database / FSANZ AFCD Release 3 reference values, scaled to a common serve"
const nzSource = "New Zealand Food Composition Database / FOODfiles Concise Tables 14th Edition, curated local catalogue"
const estimatedSource = "ApexAI internal meal profile estimate"
const photoDishSource = "ApexAI curated plate-photo dish profile"

function curatedFood(food, { source, sourceType }) {
  return {
    ...food,
    source,
    source_type: sourceType,
    macro_confidence: "high",
  }
}

function estimatedFood(food) {
  return {
    ...food,
    source: estimatedSource,
    source_type: "estimated_internal_profile",
    macro_confidence: "medium",
  }
}

function derivedFood(food) {
  return {
    ...food,
    source: auDerivedSource,
    source_type: "curated_au_catalogue",
    macro_confidence: "high",
  }
}

function photoDishFood(food) {
  return {
    ...food,
    source: photoDishSource,
    source_type: "photo_dish_profile",
    macro_confidence: "medium",
  }
}

const auVerifiedFoods = [
  { id: "egg_chicken_whole_raw", name: "Egg, chicken, whole, raw", aliases: ["egg", "eggs", "whole egg", "raw egg"], quantity: "100g", calories: 127, protein_g: 12.6, carbs_g: 0.3, fat_g: 8.5, category: "protein" },
  { id: "egg_chicken_whole_hard_boiled", name: "Egg, chicken, whole, hard-boiled", aliases: ["hard boiled egg", "hard boiled eggs", "boiled egg", "boiled eggs"], quantity: "100g", calories: 136, protein_g: 12.4, carbs_g: 0.7, fat_g: 9.4, category: "protein" },
  { id: "egg_chicken_whole_fried", name: "Egg, chicken, whole, fried, no fat added", aliases: ["fried egg", "fried eggs"], quantity: "100g", calories: 145, protein_g: 14.3, carbs_g: 0.3, fat_g: 9.6, category: "protein" },
  { id: "egg_chicken_whole_scrambled", name: "Egg, chicken, whole, scrambled, with regular fat cow's milk, no fat added", aliases: ["scrambled egg", "scrambled eggs"], quantity: "100g", calories: 120, protein_g: 10.8, carbs_g: 2.1, fat_g: 7.7, category: "protein" },
  { id: "milk_cow_regular", name: "Milk, cow, fluid, regular fat (~3.5%)", aliases: ["milk", "full cream milk", "whole milk", "regular milk"], quantity: "100ml", calories: 66, protein_g: 3.4, carbs_g: 5.5, fat_g: 3.5, category: "dairy" },
  { id: "milk_cow_reduced_fat_1", name: "Milk, cow, fluid, reduced fat (~1%)", aliases: ["light milk", "reduced fat milk", "low fat milk"], quantity: "100ml", calories: 45, protein_g: 3.5, carbs_g: 5, fat_g: 1.2, category: "dairy" },
  { id: "milk_cow_skim", name: "Milk, cow, fluid, skim (~0.15% fat)", aliases: ["skim milk", "fat free milk"], quantity: "100ml", calories: 36, protein_g: 3.7, carbs_g: 5.5, fat_g: 0, category: "dairy" },
  { id: "milk_cow_lactose_free_regular", name: "Milk, cow, fluid, lactose free, regular fat (~3.5%)", aliases: ["lactose free milk", "lactose free whole milk"], quantity: "100ml", calories: 60, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.2, category: "dairy" },
  { id: "milk_cow_lactose_free_reduced", name: "Milk, cow, fluid, lactose free, reduced fat (~1%)", aliases: ["lactose free light milk", "lactose free reduced fat milk"], quantity: "100ml", calories: 44, protein_g: 3.4, carbs_g: 5.1, fat_g: 1.2, category: "dairy" },
  { id: "soy_beverage_regular", name: "Soy beverage, regular fat (~3%), unfortified", aliases: ["soy milk", "soy beverage"], quantity: "100ml", calories: 60, protein_g: 3.8, carbs_g: 4.8, fat_g: 2.8, category: "drink" },
  { id: "soy_beverage_added_calcium", name: "Soy beverage, regular fat (~3%), added Ca", aliases: ["soy milk calcium", "fortified soy milk"], quantity: "100ml", calories: 60, protein_g: 3.8, carbs_g: 4.8, fat_g: 2.8, category: "drink" },
  { id: "almond_beverage_no_added_sugar", name: "Almond beverage, no added sugar, unfortified", aliases: ["almond milk", "unsweetened almond milk"], quantity: "100ml", calories: 16, protein_g: 0.5, carbs_g: 0, fat_g: 1.5, category: "drink" },
  { id: "almond_beverage_calcium", name: "Almond beverage, no added sugar, added Ca", aliases: ["almond milk calcium", "fortified almond milk"], quantity: "100ml", calories: 16, protein_g: 0.5, carbs_g: 0, fat_g: 1.5, category: "drink" },
  { id: "oat_beverage_unfortified", name: "Oat beverage, fluid, unfortified", aliases: ["oat milk", "oat beverage"], quantity: "100ml", calories: 56, protein_g: 1.4, carbs_g: 10.7, fat_g: 0.8, category: "drink" },
  { id: "oat_beverage_calcium", name: "Oat beverage, fluid, added Ca", aliases: ["fortified oat milk", "oat milk calcium"], quantity: "100ml", calories: 56, protein_g: 1.4, carbs_g: 10.7, fat_g: 0.8, category: "drink" },
  { id: "yoghurt_natural_regular", name: "Yoghurt, natural, regular fat (~3%)", aliases: ["natural yoghurt", "plain yoghurt", "regular yoghurt"], quantity: "100ml", calories: 76, protein_g: 5.3, carbs_g: 5.2, fat_g: 3.3, category: "dairy" },
  { id: "yoghurt_flavoured_low_fat", name: "Yoghurt, flavoured, low fat (~2%)", aliases: ["low fat yoghurt", "flavoured yoghurt"], quantity: "100ml", calories: 85, protein_g: 4.8, carbs_g: 12.7, fat_g: 1.4, category: "dairy" },
  { id: "yoghurt_vanilla", name: "Yoghurt, vanilla flavoured (~2%)", aliases: ["vanilla yoghurt"], quantity: "100ml", calories: 102, protein_g: 5.2, carbs_g: 15, fat_g: 2, category: "dairy" },
  { id: "cheddar_regular", name: "Cheese, cheddar, natural, regular fat", aliases: ["cheddar cheese", "regular cheddar"], quantity: "100g", calories: 403, protein_g: 24.6, carbs_g: 0.3, fat_g: 33.4, category: "dairy" },
  { id: "cheddar_reduced_fat", name: "Cheese, cheddar, natural, reduced fat (~25%)", aliases: ["reduced fat cheddar", "lite cheddar"], quantity: "100g", calories: 324, protein_g: 27.9, carbs_g: 0, fat_g: 23.4, category: "dairy" },
  { id: "bread_white", name: "Bread, from white flour", aliases: ["white bread", "bread"], quantity: "100g", calories: 251, protein_g: 9.5, carbs_g: 46.2, fat_g: 2, category: "carbs" },
  { id: "bread_white_toasted", name: "Bread, from white flour, toasted", aliases: ["white toast", "toast"], quantity: "100g", calories: 297, protein_g: 10.8, carbs_g: 54.3, fat_g: 2.8, category: "carbs" },
  { id: "bread_wholemeal", name: "Bread, from wholemeal flour", aliases: ["wholemeal bread", "whole wheat bread"], quantity: "100g", calories: 237, protein_g: 10.4, carbs_g: 39.2, fat_g: 2.5, category: "carbs" },
  { id: "bread_wholemeal_toasted", name: "Bread, from wholemeal flour, toasted", aliases: ["wholemeal toast", "whole wheat toast"], quantity: "100g", calories: 279, protein_g: 12.2, carbs_g: 46.1, fat_g: 2.9, category: "carbs" },
  { id: "bread_rye_sourdough", name: "Bread, from rye flour, sour dough", aliases: ["rye bread", "sourdough rye"], quantity: "100g", calories: 234, protein_g: 9.2, carbs_g: 42.7, fat_g: 1.6, category: "carbs" },
  { id: "bread_rye_sourdough_toasted", name: "Bread, from rye flour, sour dough, toasted", aliases: ["rye toast", "toasted rye bread"], quantity: "100g", calories: 276, protein_g: 10.8, carbs_g: 50.2, fat_g: 1.9, category: "carbs" },
  { id: "oats_rolled_uncooked", name: "Oats, rolled, uncooked", aliases: ["rolled oats", "oats"], quantity: "100g", calories: 374, protein_g: 12.2, carbs_g: 54.5, fat_g: 9.5, category: "breakfast" },
  { id: "porridge_oats_water", name: "Porridge, rolled oats, prepared with water", aliases: ["porridge", "oat porridge"], quantity: "100g", calories: 89, protein_g: 3, carbs_g: 11.4, fat_g: 2.9, category: "breakfast" },
  { id: "rice_white_boiled", name: "Rice, white, boiled or rice cooker, no added salt", aliases: ["white rice", "boiled white rice", "cooked white rice"], quantity: "100g", calories: 158, protein_g: 3.1, carbs_g: 34.7, fat_g: 0.2, category: "carbs" },
  { id: "rice_brown_boiled", name: "Rice, brown, boiled, no added salt", aliases: ["brown rice", "boiled brown rice", "cooked brown rice"], quantity: "100g", calories: 166, protein_g: 4.1, carbs_g: 33.5, fat_g: 1.1, category: "carbs" },
  { id: "pasta_white_boiled", name: "Pasta, white wheat flour, boiled from dry, no added salt", aliases: ["pasta", "cooked pasta", "white pasta"], quantity: "100g", calories: 137, protein_g: 5.3, carbs_g: 26.2, fat_g: 0.4, category: "carbs" },
  { id: "muesli_toasted_fruit_nuts", name: "Muesli, toasted, added dried fruit & nuts, unfortified", aliases: ["toasted muesli", "muesli"], quantity: "100g", calories: 402, protein_g: 8.9, carbs_g: 56.6, fat_g: 13.3, category: "breakfast" },
  { id: "rice_bubbles", name: "Breakfast cereal, puffed or popped rice, added vitamins & minerals (Kellogg's Rice Bubbles)", aliases: ["rice bubbles", "kelloggs rice bubbles"], quantity: "100g", calories: 370, protein_g: 6.8, carbs_g: 81.2, fat_g: 1.1, category: "breakfast" },
  { id: "milo_powder", name: "Beverage base, chocolate flavour, added vitamins & minerals (Milo)", aliases: ["milo"], quantity: "100g", calories: 385, protein_g: 12.4, carbs_g: 60.1, fat_g: 9.9, category: "drink" },
  { id: "vegemite", name: "Spread, yeast, vegemite", aliases: ["vegemite"], quantity: "100g", calories: 163, protein_g: 24.4, carbs_g: 10.9, fat_g: 0.9, category: "pantry" },
  { id: "chicken_breast_grilled", name: "Chicken, breast, lean flesh, grilled, no added fat", aliases: ["chicken breast", "grilled chicken breast"], quantity: "100g", calories: 143, protein_g: 29.8, carbs_g: 0, fat_g: 2.5, category: "protein" },
  { id: "chicken_breast_raw", name: "Chicken, breast, lean flesh, raw", aliases: ["raw chicken breast"], quantity: "100g", calories: 98, protein_g: 22.5, carbs_g: 0, fat_g: 0.8, category: "protein" },
  { id: "chicken_thigh_baked", name: "Chicken, thigh, lean flesh, baked, no added fat", aliases: ["chicken thigh", "baked chicken thigh"], quantity: "100g", calories: 175, protein_g: 24.2, carbs_g: 0, fat_g: 8.7, category: "protein" },
  { id: "chicken_thigh_raw", name: "Chicken, thigh, lean flesh, raw", aliases: ["raw chicken thigh"], quantity: "100g", calories: 104, protein_g: 19.1, carbs_g: 0, fat_g: 3, category: "protein" },
  { id: "beef_mince_lower_fat_cooked", name: "Beef, mince, lower fat, stir-fried, no added fat", aliases: ["lean beef mince", "lower fat beef mince", "beef mince"], quantity: "100g", calories: 203, protein_g: 32.3, carbs_g: 0, fat_g: 8.1, category: "protein" },
  { id: "beef_mince_lower_fat_raw", name: "Beef, mince, lower fat, raw", aliases: ["raw beef mince"], quantity: "100g", calories: 129, protein_g: 22.9, carbs_g: 0, fat_g: 4.1, category: "protein" },
  { id: "beef_rump_steak_grilled", name: "Beef, rump steak, lean, grilled, no added fat", aliases: ["rump steak", "grilled rump steak", "steak"], quantity: "100g", calories: 170, protein_g: 32, carbs_g: 0, fat_g: 4.5, category: "protein" },
  { id: "beef_rump_steak_raw", name: "Beef, rump steak, lean, raw", aliases: ["raw rump steak"], quantity: "100g", calories: 108, protein_g: 20.4, carbs_g: 0, fat_g: 2.8, category: "protein" },
  { id: "beef_sirloin_steak_grilled", name: "Beef, sirloin steak, lean, grilled, no added fat", aliases: ["sirloin steak", "grilled sirloin steak"], quantity: "100g", calories: 158, protein_g: 30.5, carbs_g: 0, fat_g: 3.8, category: "protein" },
  { id: "beef_sirloin_steak_raw", name: "Beef, sirloin steak, lean, raw", aliases: ["raw sirloin steak"], quantity: "100g", calories: 115, protein_g: 24.1, carbs_g: 0, fat_g: 1.9, category: "protein" },
  { id: "salmon_atlantic_grilled", name: "Salmon, Atlantic, fillet, grilled, no added fat", aliases: ["salmon", "grilled salmon"], quantity: "100g", calories: 258, protein_g: 22.9, carbs_g: 0, fat_g: 18.6, category: "protein" },
  { id: "salmon_atlantic_raw", name: "Salmon, Atlantic, fillet, raw", aliases: ["raw salmon"], quantity: "100g", calories: 231, protein_g: 20.5, carbs_g: 0, fat_g: 16.7, category: "protein" },
  { id: "tuna_canned_water", name: "Tuna, unflavoured, canned in water, drained", aliases: ["tuna", "tuna canned in water"], quantity: "100g", calories: 129, protein_g: 26.1, carbs_g: 0, fat_g: 2.6, category: "protein" },
  { id: "butter_salted", name: "Butter, plain, salted", aliases: ["salted butter", "butter"], quantity: "100g", calories: 734, protein_g: 1.1, carbs_g: 0.6, fat_g: 82.2, category: "dairy" },
  { id: "butter_unsalted", name: "Butter, plain, no added salt", aliases: ["unsalted butter"], quantity: "100g", calories: 734, protein_g: 1.1, carbs_g: 0.6, fat_g: 82.2, category: "dairy" },
  { id: "olive_oil", name: "Oil, olive", aliases: ["olive oil"], quantity: "100ml", calories: 812, protein_g: 0, carbs_g: 0, fat_g: 91.9, category: "pantry" },
  { id: "peanut_butter_no_added_sugar_or_salt", name: "Peanut butter, smooth & crunchy, no added sugar or salt", aliases: ["peanut butter"], quantity: "100g", calories: 628, protein_g: 24.3, carbs_g: 9.4, fat_g: 54.3, category: "pantry" },
  { id: "banana_cavendish", name: "Banana, cavendish, peeled, raw", aliases: ["banana"], quantity: "100g", calories: 95, protein_g: 1.4, carbs_g: 19.9, fat_g: 0.2, category: "produce" },
  { id: "apple_royal_gala", name: "Apple, royal gala, unpeeled, raw", aliases: ["royal gala apple", "apple"], quantity: "100g", calories: 53, protein_g: 0.4, carbs_g: 12.1, fat_g: 0, category: "produce" },
  { id: "apple_pink_lady", name: "Apple, pink lady, unpeeled, raw", aliases: ["pink lady apple"], quantity: "100g", calories: 58, protein_g: 0.2, carbs_g: 12.3, fat_g: 0, category: "produce" },
  { id: "avocado_hass", name: "Avocado, hass, raw", aliases: ["avocado", "hass avocado"], quantity: "100g", calories: 156, protein_g: 1.6, carbs_g: 2.2, fat_g: 14.6, category: "produce" },
  { id: "broccoli_raw", name: "Broccoli, fresh, raw", aliases: ["broccoli"], quantity: "100g", calories: 32, protein_g: 4, carbs_g: 1.2, fat_g: 0.4, category: "produce" },
  { id: "broccoli_boiled", name: "Broccoli, fresh, boiled, drained", aliases: ["boiled broccoli"], quantity: "100g", calories: 24, protein_g: 2.9, carbs_g: 1.2, fat_g: 0.3, category: "produce" },
  { id: "carrot_raw", name: "Carrot, mature, peeled, fresh, raw", aliases: ["carrot"], quantity: "100g", calories: 35, protein_g: 0.6, carbs_g: 6.6, fat_g: 0, category: "produce" },
  { id: "potato_sebago_boiled", name: "Potato, sebago, peeled, boiled, drained", aliases: ["potato", "boiled potato"], quantity: "100g", calories: 73, protein_g: 2.5, carbs_g: 13.1, fat_g: 0.4, category: "produce" },
  { id: "potato_sebago_raw", name: "Potato, sebago, peeled, raw", aliases: ["raw potato"], quantity: "100g", calories: 72, protein_g: 2.5, carbs_g: 13.8, fat_g: 0.2, category: "produce" },
  { id: "sweet_potato_boiled", name: "Sweet potato, orange flesh, peeled, fresh, boiled, drained", aliases: ["sweet potato", "boiled sweet potato"], quantity: "100g", calories: 70, protein_g: 1.6, carbs_g: 14.2, fat_g: 0.2, category: "produce" },
  { id: "sweet_potato_raw", name: "Sweet potato, orange flesh, peeled, fresh, raw", aliases: ["raw sweet potato"], quantity: "100g", calories: 65, protein_g: 1.4, carbs_g: 13.2, fat_g: 0.2, category: "produce" },
  { id: "flat_white_latte_cappuccino", name: "Coffee, flat white/latte/cappuccino, from ground coffee beans, with regular fat cow's milk", aliases: ["flat white", "latte", "cappuccino"], quantity: "100ml", calories: 48, protein_g: 2.9, carbs_g: 3.5, fat_g: 2.6, category: "drink" },
  { id: "coffee_espresso", name: "Coffee, espresso, from ground coffee beans", aliases: ["espresso"], quantity: "100ml", calories: 10, protein_g: 1.7, carbs_g: 0, fat_g: 0.3, category: "drink" },
  { id: "coffee_long_black", name: "Coffee, long black, from ground coffee beans", aliases: ["long black", "black coffee"], quantity: "100ml", calories: 2, protein_g: 0.3, carbs_g: 0, fat_g: 0.1, category: "drink" },
  { id: "tea_black", name: "Tea, regular, black, brewed from leaf or teabags, without milk", aliases: ["black tea", "tea"], quantity: "100ml", calories: 0, protein_g: 0.1, carbs_g: 0, fat_g: 0, category: "drink" },
  { id: "tea_green", name: "Tea, green, plain, without milk", aliases: ["green tea"], quantity: "100ml", calories: 1, protein_g: 0.2, carbs_g: 0, fat_g: 0, category: "drink" },
  { id: "juice_orange", name: "Juice, orange, commercial", aliases: ["orange juice"], quantity: "100ml", calories: 34, protein_g: 0.8, carbs_g: 7.1, fat_g: 0, category: "drink" },
].map((food) => curatedFood(food, { source: auSource, sourceType: "curated_au_catalogue" }))

const nzVerifiedFoods = [
  { id: "a1070", name: "Griffins Dark Chocolate Wheaten", aliases: ["griffins dark chocolate wheaten", "griffins wheaten dark chocolate", "dark chocolate wheaten", "wheaten biscuit griffins"], quantity: "100g", calories: 471, protein_g: 6.38, carbs_g: 55.6, fat_g: 23.8, category: "snack" },
  { id: "a1072", name: "Griffins Chit Chat Dark Chocolate Delight", aliases: ["griffins chit chat", "griffins chit chat dark chocolate delight", "chit chat biscuit"], quantity: "100g", calories: 504, protein_g: 5.54, carbs_g: 65, fat_g: 24.3, category: "snack" },
  { id: "a71", name: "Griffins MallowPuffs", aliases: ["griffins mallowpuffs", "mallowpuffs"], quantity: "100g", calories: 430, protein_g: 5.32, carbs_g: 63.9, fat_g: 16.6, category: "snack" },
  { id: "a1075", name: "Griffins Milk Chocolate Wheaten", aliases: ["griffins milk chocolate wheaten", "milk chocolate wheaten", "griffins wheaten milk chocolate"], quantity: "100g", calories: 490, protein_g: 6.15, carbs_g: 60, fat_g: 24.2, category: "snack" },
  { id: "a62", name: "Griffins Krispie", aliases: ["griffins krispie", "krispie biscuit"], quantity: "100g", calories: 445, protein_g: 5.36, carbs_g: 65.4, fat_g: 17, category: "snack" },
  { id: "a119", name: "Griffins Meal Mates", aliases: ["griffins meal mates", "meal mates crackers"], quantity: "100g", calories: 468, protein_g: 8.03, carbs_g: 49.9, fat_g: 25.7, category: "snack" },
  { id: "a137", name: "Griffins Snax", aliases: ["griffins snax", "snax crackers"], quantity: "100g", calories: 473, protein_g: 7.19, carbs_g: 54.6, fat_g: 24.5, category: "snack" },
  { id: "a1060", name: "Arnotts Farmbake Chocolate Chip Fudge", aliases: ["arnotts farmbake chocolate chip fudge", "farmbake chocolate chip fudge"], quantity: "100g", calories: 485, protein_g: 5.86, carbs_g: 68.9, fat_g: 20.1, category: "snack" },
  { id: "a1076", name: "Arnotts Tim Tam Classic Dark", aliases: ["arnotts tim tam classic dark", "tim tam classic dark"], quantity: "100g", calories: 526, protein_g: 5.45, carbs_g: 63.7, fat_g: 26.9, category: "snack" },
  { id: "a1069", name: "Arnotts Digestives Dark Chocolate", aliases: ["arnotts digestives dark chocolate", "dark chocolate digestives arnotts"], quantity: "100g", calories: 495, protein_g: 6.09, carbs_g: 61.9, fat_g: 23.7, category: "snack" },
  { id: "a1074", name: "Arnotts Digestives Milk Chocolate", aliases: ["arnotts digestives milk chocolate", "milk chocolate digestives arnotts"], quantity: "100g", calories: 495, protein_g: 6.03, carbs_g: 65.1, fat_g: 22.4, category: "snack" },
  { id: "a1066", name: "Arnotts Farmbake White and Dark Chocolate", aliases: ["arnotts farmbake white dark chocolate", "farmbake white and dark chocolate"], quantity: "100g", calories: 497, protein_g: 4.96, carbs_g: 70, fat_g: 21.3, category: "snack" },
  { id: "a1064", name: "Arnotts Tim Tam Double Coat", aliases: ["arnotts tim tam double coat", "tim tam double coat"], quantity: "100g", calories: 531, protein_g: 4.93, carbs_g: 68.5, fat_g: 26, category: "snack" },
  { id: "a1071", name: "Arnotts Tim Tam Original", aliases: ["arnotts tim tam original", "tim tam original"], quantity: "100g", calories: 531, protein_g: 4.9, carbs_g: 68.5, fat_g: 26, category: "snack" },
  { id: "a1029", name: "Arnotts Cruskits Corn", aliases: ["arnotts cruskits corn", "cruskits corn"], quantity: "100g", calories: 344, protein_g: 8.13, carbs_g: 73.3, fat_g: 1.2, category: "snack" },
  { id: "a1031", name: "Arnotts Cruskits Mixed Grain Light", aliases: ["arnotts cruskits mixed grain light", "cruskits mixed grain light"], quantity: "100g", calories: 344, protein_g: 12.5, carbs_g: 65.1, fat_g: 2.5, category: "snack" },
  { id: "a1030", name: "Arnotts Salada Light Original", aliases: ["arnotts salada light original", "salada light original"], quantity: "100g", calories: 344, protein_g: 10.8, carbs_g: 66.3, fat_g: 2.65, category: "snack" },
  { id: "a140", name: "Arnotts Water Crackers", aliases: ["arnotts water crackers", "water crackers arnotts"], quantity: "100g", calories: 409, protein_g: 10, carbs_g: 73.7, fat_g: 7.2, category: "snack" },
  { id: "c1097", name: "Anchor Fast Start", aliases: ["anchor fast start", "fast start anchor", "anchor liquid breakfast"], quantity: "100ml", calories: 80, protein_g: 5, carbs_g: 14, fat_g: 2, category: "drink" },
  { id: "c1094", name: "Sanitarium Up&Go", aliases: ["up&go", "up and go", "sanitarium up&go", "sanitarium up and go"], quantity: "100ml", calories: 64, protein_g: 3.15, carbs_g: 11.8, fat_g: 1.7, category: "drink" },
  { id: "c166", name: "Sanitarium So Good Essential Soy Milk", aliases: ["so good essential", "sanitarium so good essential", "so good essential soy milk"], quantity: "100ml", calories: 51, protein_g: 2.79, carbs_g: 4.63, fat_g: 2.26, category: "drink" },
  { id: "c30", name: "Sanitarium So Good Lite Soy Milk", aliases: ["so good lite", "sanitarium so good lite", "so good lite soy milk"], quantity: "100ml", calories: 42, protein_g: 2.91, carbs_g: 3.67, fat_g: 1.59, category: "drink" },
  { id: "c29", name: "Sanitarium So Good Regular Soy Milk", aliases: ["so good regular", "sanitarium so good regular", "so good regular soy milk"], quantity: "100ml", calories: 60, protein_g: 2.62, carbs_g: 3.66, fat_g: 3.7, category: "drink" },
  { id: "c92", name: "Sanitarium So Good Vanilla Soy Milk", aliases: ["so good vanilla", "sanitarium so good vanilla", "so good vanilla soy milk"], quantity: "100ml", calories: 76, protein_g: 2.39, carbs_g: 6.7, fat_g: 4.23, category: "drink" },
  { id: "d1053", name: "Sanitarium Cluster Crisp Manuka Honey Cashew", aliases: ["cluster crisp manuka honey cashew", "sanitarium cluster crisp manuka honey"], quantity: "100g", calories: 387, protein_g: 7.81, carbs_g: 56.8, fat_g: 12.9, category: "breakfast" },
  { id: "d1045", name: "Sanitarium Cluster Crisp Original", aliases: ["cluster crisp", "sanitarium cluster crisp"], quantity: "100g", calories: 385, protein_g: 7.81, carbs_g: 56.8, fat_g: 12.7, category: "breakfast" },
  { id: "d1052", name: "Sanitarium Cluster Crisp Vanilla Almond", aliases: ["cluster crisp vanilla almond", "sanitarium cluster crisp vanilla almond"], quantity: "100g", calories: 382, protein_g: 7.81, carbs_g: 56.8, fat_g: 12.4, category: "breakfast" },
  { id: "d1049", name: "Sanitarium Light n Tasty Apricot", aliases: ["light n tasty apricot", "sanitarium light n tasty apricot", "light n tasty apricot cereal"], quantity: "100g", calories: 354, protein_g: 7.39, carbs_g: 69.9, fat_g: 2.9, category: "breakfast" },
  { id: "d1050", name: "Sanitarium Light n Tasty Berry", aliases: ["light n tasty berry", "sanitarium light n tasty berry", "light n tasty berry cereal"], quantity: "100g", calories: 349, protein_g: 7.39, carbs_g: 69.6, fat_g: 2.6, category: "breakfast" },
  { id: "d1051", name: "Sanitarium Light n Tasty Peach Raspberry", aliases: ["light n tasty peach raspberry", "sanitarium light n tasty peach raspberry"], quantity: "100g", calories: 351, protein_g: 7.39, carbs_g: 67.6, fat_g: 3.8, category: "breakfast" },
  { id: "d1017", name: "Sanitarium Puffed Wheat", aliases: ["sanitarium puffed wheat", "puffed wheat sanitarium"], quantity: "100g", calories: 390, protein_g: 11.6, carbs_g: 77.9, fat_g: 1.4, category: "breakfast" },
  { id: "d1029", name: "Sanitarium Ricies", aliases: ["sanitarium ricies", "ricies cereal"], quantity: "100g", calories: 351, protein_g: 5.95, carbs_g: 77.9, fat_g: 1.1, category: "breakfast" },
  { id: "d1018", name: "Sanitarium San Bran", aliases: ["sanitarium san bran", "san bran cereal"], quantity: "100g", calories: 296, protein_g: 12.4, carbs_g: 41.4, fat_g: 1.4, category: "breakfast" },
  { id: "d1057", name: "Sanitarium Skippy Cornflakes", aliases: ["sanitarium skippy cornflakes", "skippy cornflakes"], quantity: "100g", calories: 359, protein_g: 7.5, carbs_g: 76.2, fat_g: 1.3, category: "breakfast" },
  { id: "d1047", name: "Sanitarium Toasted Muesli Golden Oats and Fruit", aliases: ["sanitarium toasted muesli golden oats fruit", "toasted muesli golden oats fruit"], quantity: "100g", calories: 425, protein_g: 8.81, carbs_g: 60, fat_g: 14.4, category: "breakfast" },
  { id: "d1055", name: "Sanitarium Toasted Muesli Super Fruity", aliases: ["sanitarium toasted muesli super fruity", "toasted muesli super fruity"], quantity: "100g", calories: 404, protein_g: 8.81, carbs_g: 64.8, fat_g: 9.8, category: "breakfast" },
  { id: "d1054", name: "Sanitarium Toasted Strawberry and Rhubarb", aliases: ["sanitarium toasted strawberry rhubarb", "toasted strawberry and rhubarb"], quantity: "100g", calories: 385, protein_g: 8.81, carbs_g: 55.9, fat_g: 11.7, category: "breakfast" },
  { id: "d1056", name: "Sanitarium Weet-Bix", aliases: ["weet-bix", "weet bix", "sanitarium weet-bix", "sanitarium weet bix", "weetbix"], quantity: "100g", calories: 330, protein_g: 12.5, carbs_g: 58.4, fat_g: 2.3, category: "breakfast" },
  { id: "d1012", name: "Sanitarium Weet-Bix Oat Bran", aliases: ["weet-bix oat bran", "weet bix oat bran", "sanitarium weet-bix oat bran", "weetbix oat bran"], quantity: "100g", calories: 392, protein_g: 12.8, carbs_g: 72.6, fat_g: 2.5, category: "breakfast" },
  { id: "d1035", name: "Sanitarium Weeties", aliases: ["sanitarium weeties", "weeties cereal"], quantity: "100g", calories: 332, protein_g: 11.9, carbs_g: 61.5, fat_g: 2.1, category: "breakfast" },
  { id: "p1004", name: "Sanitarium Marmite", aliases: ["sanitarium marmite", "marmite nz"], quantity: "100g", calories: 162, protein_g: 17.4, carbs_g: 14.5, fat_g: 1.2, category: "pantry" },
  { id: "c1017", name: "Meadow Fresh Body Boost Shots", aliases: ["meadow fresh body boost shots", "activate body boost shots meadow fresh"], quantity: "100ml", calories: 44, protein_g: 1.1, carbs_g: 8, fat_g: 0.8, category: "drink" },
  { id: "f1075", name: "Meadow Fresh Low Fat Fruit Yoghurt", aliases: ["meadow fresh low fat fruit yoghurt", "meadow fresh yoghurt low fat fruit"], quantity: "100g", calories: 79, protein_g: 4.34, carbs_g: 12.7, fat_g: 1, category: "dairy" },
  { id: "f1073", name: "Meadow Fresh Live Lite Yoghurt", aliases: ["meadow fresh live lite yoghurt", "live lite yoghurt meadow fresh"], quantity: "100g", calories: 52, protein_g: 4.91, carbs_g: 8, fat_g: 0.2, category: "dairy" },
  { id: "f1057", name: "Mainland Light Cheddar", aliases: ["mainland light cheddar", "mainland cheddar light"], quantity: "100g", calories: 318, protein_g: 29.3, carbs_g: 0, fat_g: 22.4, category: "dairy" },
  { id: "f110", name: "Tip Top Jelly Tip Ice Cream", aliases: ["tip top jelly tip", "jelly tip ice cream"], quantity: "100g", calories: 237, protein_g: 2.74, carbs_g: 25.6, fat_g: 13.8, category: "dessert" },
  { id: "f77", name: "Tip Top Frozen Apricot Yoghurt", aliases: ["tip top frozen apricot yoghurt", "tip top apricot frozen yoghurt"], quantity: "100g", calories: 91, protein_g: 2.49, carbs_g: 17.8, fat_g: 1.03, category: "dessert" },
  { id: "j1002", name: "Pams Summer Gold Canola Margarine", aliases: ["pams summer gold canola margarine", "pams summer gold margarine"], quantity: "100g", calories: 626, protein_g: 0.31, carbs_g: 0, fat_g: 70.6, category: "pantry" },
  { id: "j1004", name: "Pams Summer Gold Lite Margarine", aliases: ["pams summer gold lite margarine", "pams lite margarine"], quantity: "100g", calories: 516, protein_g: 0.31, carbs_g: 0, fat_g: 58.1, category: "pantry" },
  { id: "x1037", name: "Pams Crunchy Wedges", aliases: ["pams wedges", "pams crunchy wedges"], quantity: "100g", calories: 154, protein_g: 3.44, carbs_g: 24.5, fat_g: 3.88, category: "frozen" },
  { id: "u23", name: "Uncle Tobys Strawberry Fruit Roll", aliases: ["uncle tobys strawberry fruit roll", "strawberry fruit roll uncle tobys"], quantity: "100g", calories: 315, protein_g: 0.75, carbs_g: 74.8, fat_g: 0.33, category: "snack" },
  { id: "v1006", name: "Watties Tuscan Tomato Soup", aliases: ["watties tuscan tomato soup", "watties tomato soup", "wattie's tuscan tomato soup"], quantity: "100ml", calories: 28, protein_g: 0.94, carbs_g: 4.8, fat_g: 0.35, category: "soup" },
  { id: "v1008", name: "Watties Chicken and Corn Soup", aliases: ["watties chicken and corn soup", "wattie's chicken and corn soup"], quantity: "100ml", calories: 26, protein_g: 1.25, carbs_g: 3.75, fat_g: 0.4, category: "soup" },
  { id: "v1003", name: "Watties Chicken and Vegetable Soup", aliases: ["watties chicken and vegetable soup", "wattie's chicken and vegetable soup"], quantity: "100ml", calories: 29, protein_g: 2.06, carbs_g: 3.86, fat_g: 0.25, category: "soup" },
  { id: "v1004", name: "Watties Lentil and Vegetables Soup", aliases: ["watties lentil and vegetables soup", "wattie's lentil and vegetables soup"], quantity: "100ml", calories: 43, protein_g: 1.38, carbs_g: 5.88, fat_g: 0.5, category: "soup" },
  { id: "v1007", name: "Watties Pumpkin Soup", aliases: ["watties pumpkin soup", "wattie's pumpkin soup"], quantity: "100ml", calories: 24, protein_g: 0.63, carbs_g: 3.06, fat_g: 0.85, category: "soup" },
  { id: "x1033", name: "Watties Crunchy Steak Cut Fries", aliases: ["watties crunchy steak cut fries", "wattie's steak cut fries"], quantity: "100g", calories: 187, protein_g: 3.13, carbs_g: 24.1, fat_g: 8.2, category: "frozen" },
  { id: "x1078", name: "Watties Tomato Puree", aliases: ["watties tomato puree", "wattie's tomato puree"], quantity: "100g", calories: 39, protein_g: 1.51, carbs_g: 6.8, fat_g: 0.2, category: "pantry" },
  { id: "x1004", name: "Watties Baked Beans", aliases: ["watties baked beans", "wattie's baked beans", "baked beans watties nz"], quantity: "100g", calories: 84, protein_g: 5, carbs_g: 12, fat_g: 0.6, category: "pantry" },
  { id: "f1046", name: "Anchor Salted Butter", aliases: ["anchor salted butter", "anchor butter"], quantity: "100g", calories: 729, protein_g: 0.45, carbs_g: 0.44, fat_g: 82.1, category: "dairy" },
  { id: "f1110", name: "Lewis Road Whole Milk", aliases: ["lewis road whole milk", "lewis road milk", "lewis road dairy whole milk"], quantity: "100ml", calories: 61, protein_g: 3.48, carbs_g: 4.3, fat_g: 3.3, category: "dairy" },
  { id: "f1111", name: "Lewis Road Lite Milk", aliases: ["lewis road lite milk", "lewis road light milk"], quantity: "100ml", calories: 44, protein_g: 3.37, carbs_g: 4.4, fat_g: 1.46, category: "dairy" },
].map((food) => curatedFood(food, { source: nzSource, sourceType: "nz_curated_catalogue" }))

const auDerivedFoods = [
  { id: "eggs_2", name: "2 large eggs", aliases: ["2 eggs", "two eggs"], quantity: "2 large eggs", calories: 148, protein_g: 12.6, carbs_g: 1.1, fat_g: 10.2, category: "protein" },
  { id: "toast_2", name: "2 slices wholemeal toast", aliases: ["2 toast", "2 slices toast"], quantity: "2 slices", calories: 188, protein_g: 8, carbs_g: 31, fat_g: 2.8, category: "carbs" },
  { id: "banana", name: "Banana", aliases: ["medium banana"], quantity: "1 medium", calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, category: "produce" },
  { id: "flat_white", name: "Large flat white", aliases: ["large flat white"], quantity: "large", calories: 155, protein_g: 8, carbs_g: 12, fat_g: 8, category: "drink" },
  { id: "burger_bun", name: "Burger bun", aliases: ["hamburger bun", "bun", "bread roll"], quantity: "1 bun", calories: 190, protein_g: 6.4, carbs_g: 34.8, fat_g: 3.2, category: "carbs" },
  { id: "beef_patty_grilled", name: "Grilled beef patty", aliases: ["beef patty", "burger patty", "grilled patty", "grilled beef patty"], quantity: "1 patty", calories: 250, protein_g: 24, carbs_g: 0, fat_g: 17, category: "protein" },
  { id: "bacon_2_slices", name: "Cooked bacon", aliases: ["bacon", "cooked bacon", "2 slices bacon"], quantity: "2 slices", calories: 84, protein_g: 6, carbs_g: 0.2, fat_g: 6.6, category: "protein" },
  { id: "cheddar_slice", name: "Cheddar cheese slice", aliases: ["cheese slice", "slice cheddar cheese"], quantity: "1 slice", calories: 80, protein_g: 5, carbs_g: 0.1, fat_g: 6.6, category: "dairy" },
  { id: "lettuce_leaf", name: "Lettuce leaf", aliases: ["lettuce", "leaf lettuce"], quantity: "1 leaf", calories: 1, protein_g: 0.1, carbs_g: 0.2, fat_g: 0, category: "produce" },
  { id: "tomato_2_slices", name: "Tomato slices", aliases: ["tomato", "sliced tomato", "2 slices tomato", "cherry tomatoes"], quantity: "2 slices", calories: 4, protein_g: 0.2, carbs_g: 0.9, fat_g: 0, category: "produce" },
  { id: "onion_2_slices", name: "Onion slices", aliases: ["onion", "sliced onion", "2 slices onion"], quantity: "2 slices", calories: 6, protein_g: 0.1, carbs_g: 1.4, fat_g: 0, category: "produce" },
  { id: "capsicum_2_slices", name: "Capsicum slices", aliases: ["capsicum", "green capsicum", "red capsicum", "sliced capsicum", "2 slices capsicum"], quantity: "2 slices", calories: 5, protein_g: 0.2, carbs_g: 1.1, fat_g: 0, category: "produce" },
  { id: "pickle_4_slices", name: "Pickle slices", aliases: ["pickles", "pickle", "gherkin", "4 slices pickle"], quantity: "4 slices", calories: 3, protein_g: 0.1, carbs_g: 0.6, fat_g: 0, category: "produce" },
  { id: "mustard_tsp", name: "Mustard", aliases: ["mustard", "1 teaspoon mustard"], quantity: "1 teaspoon", calories: 4, protein_g: 0.2, carbs_g: 0.3, fat_g: 0.2, category: "pantry" },
  { id: "basil_5g", name: "Fresh basil", aliases: ["basil", "fresh basil"], quantity: "5g", calories: 1, protein_g: 0.2, carbs_g: 0.1, fat_g: 0, category: "produce" },
  { id: "coriander_10g", name: "Fresh coriander", aliases: ["coriander", "coriander garnish"], quantity: "10g", calories: 2, protein_g: 0.2, carbs_g: 0.4, fat_g: 0, category: "produce" },
  { id: "hot_chips_small", name: "Hot chips", aliases: ["fries", "chips", "hot chips", "small fries"], quantity: "1 small serve", calories: 260, protein_g: 3.4, carbs_g: 34, fat_g: 12, category: "carbs" },
  { id: "naan_piece", name: "Plain naan", aliases: ["naan", "naan bread", "1 piece naan bread"], quantity: "1 piece", calories: 285, protein_g: 9, carbs_g: 50, fat_g: 6, category: "carbs" },
  { id: "pasta_cooked_200g", name: "Cooked pasta", aliases: ["pasta", "spaghetti", "fettuccine", "plain pasta"], quantity: "200g", calories: 274, protein_g: 10.6, carbs_g: 52.4, fat_g: 0.8, category: "carbs" },
  { id: "tomato_pasta_sauce_125g", name: "Tomato pasta sauce", aliases: ["tomato sauce", "pasta sauce", "tomato pasta sauce"], quantity: "125g", calories: 60, protein_g: 1.8, carbs_g: 11.5, fat_g: 1.2, category: "pantry" },
  { id: "cheese_grated_15g", name: "Grated cheese", aliases: ["grated cheese", "shredded cheese", "parmesan", "parmesan cheese", "grated parmesan"], quantity: "15g", calories: 61, protein_g: 3.7, carbs_g: 0.1, fat_g: 5, category: "dairy" },
  { id: "cherry_tomatoes_100g", name: "Cherry tomatoes", aliases: ["cherry tomatoes", "fresh tomatoes"], quantity: "100g", calories: 18, protein_g: 0.9, carbs_g: 3.9, fat_g: 0.2, category: "produce" },
  { id: "chicken_curry_200g", name: "Cooked chicken curry", aliases: ["chicken curry", "cooked chicken curry", "butter chicken", "chicken in sauce"], quantity: "200g", calories: 360, protein_g: 28, carbs_g: 14, fat_g: 20, category: "mixed meal" },
  { id: "rice_cooked_200g", name: "Cooked rice", aliases: ["cooked rice", "rice"], quantity: "200g", calories: 316, protein_g: 6.2, carbs_g: 69.4, fat_g: 0.4, category: "carbs" },
].map(derivedFood)

const estimatedFoods = [
  { id: "protein_shake_40", name: "Protein shake", aliases: ["protein shake", "40g protein", "shake"], quantity: "40g protein serve", calories: 210, protein_g: 40, carbs_g: 5, fat_g: 3, category: "protein" },
  { id: "chicken_burrito_bowl", name: "Chicken burrito bowl", aliases: ["chicken burrito bowl", "burrito bowl"], quantity: "1 large bowl", calories: 680, protein_g: 48, carbs_g: 76, fat_g: 18, category: "mixed meal" },
  { id: "greek_yoghurt_berries_oats", name: "Greek yoghurt, berries, and oats", aliases: ["yoghurt berries oats", "greek yoghurt", "yogurt berries oats"], quantity: "1 bowl", calories: 430, protein_g: 32, carbs_g: 48, fat_g: 11, category: "breakfast" },
  { id: "chicken_rice_bowl", name: "Chicken rice bowl", aliases: ["chicken rice", "chicken rice bowl"], quantity: "1 bowl", calories: 620, protein_g: 45, carbs_g: 68, fat_g: 16, category: "mixed meal" },
  { id: "salmon_potato_salad", name: "Salmon, potato, and salad", aliases: ["salmon potato salad", "salmon and potato"], quantity: "1 plate", calories: 560, protein_g: 39, carbs_g: 42, fat_g: 24, category: "dinner" },
  { id: "lean_beef_bowl", name: "Lean beef burrito bowl", aliases: ["lean beef bowl", "beef burrito bowl"], quantity: "1 bowl", calories: 720, protein_g: 52, carbs_g: 78, fat_g: 22, category: "mixed meal" },
  { id: "tuna_rice", name: "Tuna and rice", aliases: ["tuna rice", "tuna and rice"], quantity: "1 bowl", calories: 465, protein_g: 39, carbs_g: 58, fat_g: 8, category: "protein" },
].map(estimatedFood)

const photoDishProfiles = [
  { id: "photo_burger", name: "Burger", aliases: ["burger", "wholemeal burger", "cheeseburger", "burger with egg", "burger with bacon", "grilled burger"], quantity: "1 burger", calories: 650, protein_g: 32, carbs_g: 45, fat_g: 38, category: "mixed meal" },
  { id: "photo_burger_with_fries", name: "Burger with fries", aliases: ["burger with fries", "burger and fries", "cheeseburger with fries", "burger served with fries"], quantity: "1 burger + small fries", calories: 910, protein_g: 35, carbs_g: 82, fat_g: 50, category: "mixed meal" },
  { id: "photo_butter_chicken_rice", name: "Butter chicken with rice", aliases: ["butter chicken", "butter chicken with rice", "chicken curry with rice"], quantity: "1 bowl", calories: 760, protein_g: 34, carbs_g: 74, fat_g: 34, category: "mixed meal" },
  { id: "photo_pasta_tomato", name: "Pasta with tomato sauce", aliases: ["pasta with tomato sauce", "spaghetti with tomato sauce", "pasta"], quantity: "1 plate", calories: 420, protein_g: 14, carbs_g: 70, fat_g: 9, category: "mixed meal" },
  { id: "photo_fried_rice", name: "Fried rice", aliases: ["fried rice"], quantity: "1 plate", calories: 620, protein_g: 17, carbs_g: 86, fat_g: 21, category: "mixed meal" },
  { id: "photo_biryani", name: "Biryani", aliases: ["biryani", "veg biryani", "vegetable biryani", "chicken biryani"], quantity: "1 bowl", calories: 680, protein_g: 19, carbs_g: 92, fat_g: 24, category: "mixed meal" },
  { id: "photo_samosa", name: "Samosas", aliases: ["samosa", "samosas", "fried samosa", "fried samosas", "deep fried samosa", "deep fried samosas"], quantity: "1 serve", calories: 320, protein_g: 7, carbs_g: 36, fat_g: 16, category: "snack" },
  { id: "photo_dosa", name: "Dosa", aliases: ["dosa", "dosas"], quantity: "1 serve", calories: 340, protein_g: 8, carbs_g: 52, fat_g: 11, category: "mixed meal" },
  { id: "photo_idli_sambar", name: "Idli with sambar", aliases: ["idli", "idly", "idli with sambar"], quantity: "1 serve", calories: 330, protein_g: 10, carbs_g: 58, fat_g: 6, category: "mixed meal" },
  { id: "photo_macarons", name: "Macarons", aliases: ["macaron", "macarons"], quantity: "5 pieces", calories: 360, protein_g: 6, carbs_g: 46, fat_g: 17, category: "dessert" },
  { id: "photo_pizza", name: "Pizza", aliases: ["pizza", "pepperoni pizza", "pizza slice", "slice of pizza", "slice of pepperoni pizza"], quantity: "2 slices", calories: 570, protein_g: 24, carbs_g: 60, fat_g: 25, category: "mixed meal" },
].map(photoDishFood)

export const verifiedFoods = [...auDerivedFoods, ...auVerifiedFoods, ...nzVerifiedFoods, ...estimatedFoods]

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function compactNormalize(text) {
  return normalize(text).replace(/\s+/g, "")
}

function tokenize(text) {
  return normalize(text).split(" ").filter(Boolean)
}

function namesForFood(food) {
  return [food.name, ...(Array.isArray(food.aliases) ? food.aliases : []), food.category].filter(Boolean)
}

function sourceRank(food) {
  if (food.source_type === "curated_au_catalogue") return 4
  if (food.source_type === "nz_curated_catalogue") return 3
  if (food.source_type === "photo_dish_profile") return 2.5
  if (food.source_type === "barcode_label" || food.source_type === "open_food_facts_label") return 2
  return 1
}

function scoreFoodMatch(query, food) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return 0

  const compactQuery = compactNormalize(query)
  const queryTokens = tokenize(query)
  const names = namesForFood(food)

  let bestScore = 0
  for (const name of names) {
    const normalizedName = normalize(name)
    const compactName = compactNormalize(name)
    const nameTokens = tokenize(name)

    if (normalizedName === normalizedQuery || compactName === compactQuery) {
      bestScore = Math.max(bestScore, 300)
      continue
    }

    if (normalizedName.startsWith(`${normalizedQuery} `) || compactName.startsWith(compactQuery)) {
      bestScore = Math.max(bestScore, 240)
      continue
    }

    if (queryTokens.length && queryTokens.every((term) => nameTokens.some((token) => token === term || token.startsWith(term)))) {
      bestScore = Math.max(bestScore, 200 + Math.min(20, queryTokens.length * 4))
      continue
    }

    if (normalizedQuery.length >= 5 && normalizedName.includes(normalizedQuery)) {
      bestScore = Math.max(bestScore, 140)
    }
  }

  return bestScore ? bestScore + sourceRank(food) : 0
}

function summarizeSource(foods) {
  const sourceTypes = [...new Set(foods.map((food) => food.source_type).filter(Boolean))]
  if (!sourceTypes.length) return auSource
  if (sourceTypes.every((type) => type === "curated_au_catalogue")) return auSource
  if (sourceTypes.every((type) => type === "nz_curated_catalogue")) return nzSource
  if (sourceTypes.every((type) => type === "estimated_internal_profile")) return estimatedSource
  return [auSource, nzSource, estimatedSource]
    .filter((source, index, all) => index === all.indexOf(source))
    .join(" | ")
}

function isEstimatedSourceType(value) {
  return String(value || "").trim().toLowerCase() === "estimated_internal_profile"
}

function looksLikeCompositePhotoQuery(query = "") {
  const normalizedQuery = normalize(query)
  return /\b(?:and|with|bowl|plate|salad|burrito|sandwich|wrap|taco|burger|pizza|biryani|curry|fried rice|stir fry|pasta bake|dessert)\b/.test(normalizedQuery)
}

function simplifyPhotoSearchQuery(query = "") {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery || looksLikeCompositePhotoQuery(normalizedQuery)) return normalizedQuery

  const simplified = normalizedQuery
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|oz|lb|lbs|ml|l|pieces?|piece|serves?|servings?|bowls?|plates?|cups?|slices?)\b/g, " ")
    .replace(/\b(?:ripe|fresh|plain|cooked|steamed|fried|grilled|baked|boiled|poached|scrambled|toasted|roasted|crispy|creamy|mixed|wholemeal|wholegrain|garnish|garnished|served|serving|slice|slices|piece|pieces|plate|bowl|glass|cup|deep|featuring|drizzle|dipping)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return simplified || normalizedQuery
}

function foodLooksCompositeForPhoto(food = {}) {
  return namesForFood(food).some((name) => /\b(?:and|with|bowl|plate|salad|burrito|sandwich|wrap|taco|burger|pizza|biryani|curry|fried rice|stir fry|dessert)\b/.test(normalize(name)))
}

function inferPhotoTargetCategories(query = "") {
  const normalizedQuery = normalize(query)
  const categories = new Set()

  if (/\b(?:egg|eggs|chicken|steak|beef|lamb|pork|fish|salmon|tuna)\b/.test(normalizedQuery)) categories.add("protein")
  if (/\b(?:milk|yoghurt|yogurt|cheese|butter)\b/.test(normalizedQuery)) categories.add("dairy")
  if (/\b(?:tea|coffee|juice|water|smoothie|shake)\b/.test(normalizedQuery)) categories.add("drink")
  if (/\b(?:rice|pasta|bread|toast|oats|porridge|potato|fries|chips|noodle|noodles)\b/.test(normalizedQuery)) categories.add("carbs")
  if (/\b(?:banana|apple|berry|berries|blueberry|orange|fruit|avocado|salad|tomato|vegetable|vegetables|veggie|veggies)\b/.test(normalizedQuery)) categories.add("produce")
  if (/\b(?:oats|porridge|muesli|cereal|weetbix|weet bix|weet-bix)\b/.test(normalizedQuery)) categories.add("breakfast")
  if (/\b(?:vegemite|marmite|chutney|jam|sauce|condiment)\b/.test(normalizedQuery)) categories.add("pantry")

  return categories
}

export function findVerifiedFood(query) {
  const ranked = searchVerifiedFoods(query)
  return ranked[0] || null
}

export function searchVerifiedFoods(query) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return verifiedFoods

  return verifiedFoods
    .map((food) => ({ food, score: scoreFoodMatch(query, food) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.food.name.localeCompare(right.food.name))
    .map((entry) => entry.food)
}

export function searchPhotoReferenceFoods(query) {
  const variants = [...new Set([query, simplifyPhotoSearchQuery(query)].filter(Boolean))]
  const baseMatches = variants
    .flatMap((variant) => searchVerifiedFoods(variant))
    .filter((food, index, all) => !isEstimatedSourceType(food.source_type) && all.findIndex((entry) => entry.id === food.id) === index)
  const shouldIncludeDishProfiles = looksLikeCompositePhotoQuery(query) || baseMatches.length <= 2
  const dishMatches = shouldIncludeDishProfiles
    ? variants
      .flatMap((variant) => photoDishProfiles
        .map((food) => ({ food, score: scoreFoodMatch(variant, food) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.food.name.localeCompare(right.food.name))
        .map((entry) => entry.food))
      .filter((food, index, all) => all.findIndex((entry) => entry.id === food.id) === index)
    : []
  const ranked = [...baseMatches, ...dishMatches].filter((food, index, all) => all.findIndex((entry) => entry.id === food.id) === index)
  if (!ranked.length) return []

  const targetCategories = inferPhotoTargetCategories(query)
  const simpleQuery = tokenize(query).length <= 2 && !looksLikeCompositePhotoQuery(query)
  const shapeFiltered = ranked.filter((food) => !(simpleQuery && foodLooksCompositeForPhoto(food)))
  const categoryFiltered = targetCategories.size
    ? shapeFiltered.filter((food) => targetCategories.has(String(food.category || "").trim().toLowerCase()))
    : shapeFiltered

  if (categoryFiltered.length) return categoryFiltered
  if (shapeFiltered.length) return shapeFiltered
  return ranked
}

export function foodToMeal(food, overrides = {}) {
  const estimated = overrides.estimated ?? isEstimatedSourceType(food.source_type)
  return {
    food_name: food.name,
    quantity: food.quantity,
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
    estimated,
    nutrition_source: food.source,
    nutrition_source_type: food.source_type || "curated_au_catalogue",
    macro_confidence: food.macro_confidence || (estimated ? "medium" : "high"),
    ...overrides,
  }
}

export function buildMealSuggestion(ingredients) {
  const terms = normalize(ingredients)
  const matches = verifiedFoods.filter((food) => {
    const haystacks = namesForFood(food)
    return terms.split(" ").some((term) => term.length > 2 && haystacks.some((name) => tokenize(name).some((token) => token === term || token.startsWith(term))))
  })

  const chosen = matches.length
    ? matches.slice(0, 2)
    : [
        verifiedFoods.find((food) => food.id === "egg_chicken_whole_raw"),
        verifiedFoods.find((food) => food.id === "oats_rolled_uncooked"),
        verifiedFoods.find((food) => food.id === "banana_cavendish"),
      ].filter(Boolean)

  const totals = chosen.reduce(
    (total, food) => ({
      calories: total.calories + food.calories,
      protein_g: total.protein_g + food.protein_g,
      carbs_g: total.carbs_g + food.carbs_g,
      fat_g: total.fat_g + food.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  return {
    id: `suggestion_${chosen.map((food) => food.id).join("_")}`,
    name: chosen.map((food) => food.name).join(" + "),
    description: "Built from the local AU/NZ nutrition catalogue, preferring trusted AFCD and NZFCD matches.",
    ingredients: chosen.map((food) => food.name),
    source: summarizeSource(chosen),
    ...totals,
  }
}

export function generateLocalChefRecipe(pantry, mealType = "dinner", servings = 2, allowEstimated = true) {
  const suggestion = buildMealSuggestion(pantry)
  const ingredientTerms = normalize(pantry).split(/[\n,]/).map((term) => term.trim()).filter(Boolean)
  const matchedFoods = ingredientTerms
    .map((term) => findVerifiedFood(term))
    .filter(Boolean)

  const chosenFoods = matchedFoods.length ? matchedFoods : suggestion.ingredients.map((name) => findVerifiedFood(name)).filter(Boolean)
  const safeServings = Math.max(1, Math.round(Number(servings) || 2))
  const ingredients = [
    ...chosenFoods.map((food) => createIngredientItemFromFood(food)),
    ...(!allowEstimated ? [] : ingredientTerms.filter((term) => !findVerifiedFood(term)).map((term) => ({
      id: `estimated_${term.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      name: term,
      quantity: "to taste",
      estimated: true,
      source: "Estimated from your ingredient list",
      source_type: "estimated_internal_profile",
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    }))),
  ]

  return recalcRecipeFromIngredients({
    title: matchedFoods.length > 1 ? `${matchedFoods[0].name} pantry bowl` : suggestion.name,
    description: "Pantry recipe built from the local verified AU/NZ catalogue while live recipe help is unavailable.",
    meal_type: mealType,
    servings: safeServings,
    ingredients,
    steps: [
      "Prep the ingredients you listed and use the matched protein or base first.",
      "Cook the main ingredients together and season simply with pantry staples you trust.",
      "Plate the meal, then adjust portion size to fit the macro target shown below.",
    ],
    notes: allowEstimated
      ? "This recipe uses the curated AU/NZ food catalogue and may estimate unmatched ingredients from what you entered."
      : "This recipe only uses ingredients the app could verify in the local AU/NZ catalogue.",
  })
}
