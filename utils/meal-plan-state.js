const { mealPeriods, dishes } = require("./menu-data");

const CATEGORY_ORDER_BY_MEAL = {
  breakfast: ["主食", "小吃", "饮品", "主菜", "汤羹", "轻食碗/沙拉"],
  lunch: ["主菜", "主食", "小吃", "汤羹", "轻食碗/沙拉", "饮品"],
  dinner: ["主菜", "主食", "汤羹", "轻食碗/沙拉", "小吃", "饮品"]
};

const DIETARY_ORDER = ["all", "diet_meat", "diet_vegetarian", "diet_seafood", "diet_mixed"];
const DIETARY_LABEL_MAP = {
  all: "全部",
  diet_meat: "肉类",
  diet_vegetarian: "素菜",
  diet_seafood: "海鲜",
  diet_mixed: "综合"
};

function buildDishLookup() {
  return mealPeriods.reduce((result, meal) => {
    (dishes[meal.key] || []).forEach((dish) => {
      result[dish.id] = dish;
    });
    return result;
  }, {});
}

const dishLookup = buildDishLookup();

function getSelectedIds(selectedIdsByMeal, mealKey) {
  return selectedIdsByMeal[mealKey] || [];
}

function buildMealDishCards(mealKey, selectedIdsByMeal) {
  const selectedSet = new Set(getSelectedIds(selectedIdsByMeal, mealKey));

  return (dishes[mealKey] || []).map((dish) => ({
    ...dish,
    selected: selectedSet.has(dish.id),
    ingredientPreview: (dish.ingredients || []).slice(0, 2)
  }));
}

function getCategoryRank(mealKey, label) {
  const order = CATEGORY_ORDER_BY_MEAL[mealKey] || [];
  const index = order.indexOf(label);
  return index === -1 ? order.length + 1 : index;
}

function buildCategoryState(mealKey, mealDishes, currentCategoryId) {
  const categoryMap = mealDishes.reduce((result, dish) => {
    if (!result[dish.categoryId]) {
      result[dish.categoryId] = {
        id: dish.categoryId,
        label: dish.category || "其他",
        count: 0,
        selectedCount: 0
      };
    }

    result[dish.categoryId].count += 1;
    if (dish.selected) {
      result[dish.categoryId].selectedCount += 1;
    }

    return result;
  }, {});

  const categoryTabs = Object.values(categoryMap).sort((left, right) => {
    const rankDiff = getCategoryRank(mealKey, left.label) - getCategoryRank(mealKey, right.label);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });

  const fallbackCategoryId = categoryTabs.some((item) => item.id === currentCategoryId)
    ? currentCategoryId
    : (categoryTabs[0] && categoryTabs[0].id) || "";
  const currentCategory = categoryTabs.find((item) => item.id === fallbackCategoryId) || null;
  const categoryDishes = mealDishes.filter((dish) => dish.categoryId === fallbackCategoryId);

  return {
    categoryTabs,
    currentCategoryId: fallbackCategoryId,
    currentCategoryLabel: currentCategory ? currentCategory.label : "",
    categoryDishes
  };
}

function buildDietaryState(categoryDishes, currentDietaryTypeId) {
  const dietaryMap = categoryDishes.reduce((result, dish) => {
    if (!dish.dietaryTypeId) {
      return result;
    }

    if (!result[dish.dietaryTypeId]) {
      result[dish.dietaryTypeId] = {
        id: dish.dietaryTypeId,
        label: DIETARY_LABEL_MAP[dish.dietaryTypeId] || dish.dietaryType || "其他",
        count: 0
      };
    }

    result[dish.dietaryTypeId].count += 1;
    return result;
  }, {});

  const dietaryTabs = [
    {
      id: "all",
      label: DIETARY_LABEL_MAP.all,
      count: categoryDishes.length
    }
  ].concat(
    Object.values(dietaryMap).sort((left, right) => {
      const rankDiff = DIETARY_ORDER.indexOf(left.id) - DIETARY_ORDER.indexOf(right.id);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return right.count - left.count;
    })
  );

  const fallbackDietaryTypeId = dietaryTabs.some((item) => item.id === currentDietaryTypeId)
    ? currentDietaryTypeId
    : "all";
  const currentDietaryType = dietaryTabs.find((item) => item.id === fallbackDietaryTypeId) || dietaryTabs[0];
  const visibleDishes = fallbackDietaryTypeId === "all"
    ? categoryDishes
    : categoryDishes.filter((dish) => dish.dietaryTypeId === fallbackDietaryTypeId);

  return {
    dietaryTabs,
    currentDietaryTypeId: fallbackDietaryTypeId,
    currentDietaryTypeLabel: currentDietaryType ? currentDietaryType.label : DIETARY_LABEL_MAP.all,
    visibleDishes
  };
}

function buildSelectedDishes(activeMeals, selectedIdsByMeal) {
  return mealPeriods.reduce((result, meal) => {
    if (!activeMeals.includes(meal.key)) {
      result[meal.key] = [];
      return result;
    }

    result[meal.key] = getSelectedIds(selectedIdsByMeal, meal.key)
      .map((dishId) => dishLookup[dishId])
      .filter(Boolean);
    return result;
  }, {});
}

function buildIngredients(selectedDishes) {
  const counts = {};

  selectedDishes.forEach((dish) => {
    (dish.ingredients || []).forEach((ingredient) => {
      counts[ingredient] = (counts[ingredient] || 0) + 1;
    });
  });

  return Object.keys(counts)
    .map((name) => ({
      name,
      count: counts[name]
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function buildMealTabs(activeMeals, selectedIdsByMeal) {
  return mealPeriods.map((meal) => ({
    ...meal,
    enabled: activeMeals.includes(meal.key),
    selectedCount: getSelectedIds(selectedIdsByMeal, meal.key).length
  }));
}

function summarizeSelection(activeMeals, selectedIdsByMeal) {
  const selectedDishesByMeal = buildSelectedDishes(activeMeals, selectedIdsByMeal);
  const allSelectedDishes = mealPeriods.reduce((result, meal) => result.concat(selectedDishesByMeal[meal.key] || []), []);
  const selectedIngredients = buildIngredients(allSelectedDishes);

  const totals = allSelectedDishes.reduce(
    (result, dish) => {
      result.totalCalories += dish.calories || 0;
      result.totalPrice += dish.price || 0;
      result.selectedCount += 1;
      return result;
    },
    {
      totalCalories: 0,
      totalPrice: 0,
      selectedCount: 0
    }
  );

  return {
    ...totals,
    selectedIngredients,
    selectedIngredientsPreview: selectedIngredients.slice(0, 8),
    selectedIngredientCount: selectedIngredients.length,
    selectedDishNames: allSelectedDishes.map((dish) => dish.name)
  };
}

function buildMealPlanViewModel(options) {
  const { activeMeals, selectedIdsByMeal, currentMealKey, currentCategoryByMeal, currentDietaryByMeal } = options;
  const mealTabs = buildMealTabs(activeMeals, selectedIdsByMeal);
  const fallbackMealKey = currentMealKey && activeMeals.includes(currentMealKey)
    ? currentMealKey
    : activeMeals[0] || mealPeriods[0].key;
  const currentMeal = mealPeriods.find((meal) => meal.key === fallbackMealKey) || mealPeriods[0];
  const mealDishes = buildMealDishCards(currentMeal.key, selectedIdsByMeal);
  const categoryState = buildCategoryState(currentMeal.key, mealDishes, (currentCategoryByMeal || {})[currentMeal.key]);
  const dietaryState = buildDietaryState(categoryState.categoryDishes, (currentDietaryByMeal || {})[currentMeal.key]);
  const summary = summarizeSelection(activeMeals, selectedIdsByMeal);
  const activeMealLabels = mealTabs.filter((meal) => meal.enabled).map((meal) => meal.label);

  return {
    mealTabs,
    categoryTabs: categoryState.categoryTabs,
    dietaryTabs: dietaryState.dietaryTabs,
    currentMealKey: currentMeal.key,
    currentMealLabel: currentMeal.label,
    currentCategoryId: categoryState.currentCategoryId,
    currentCategoryLabel: categoryState.currentCategoryLabel,
    currentDietaryTypeId: dietaryState.currentDietaryTypeId,
    currentDietaryTypeLabel: dietaryState.currentDietaryTypeLabel,
    visibleDishes: dietaryState.visibleDishes,
    visibleDishCount: dietaryState.visibleDishes.length,
    activeMealLabels,
    activeMealSummary: activeMealLabels.join(" · "),
    ...summary
  };
}

module.exports = {
  buildMealPlanViewModel,
  summarizeSelection
};
