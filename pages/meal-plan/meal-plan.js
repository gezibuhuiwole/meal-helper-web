const { mealPeriods } = require("../../utils/menu-data");
const { buildMealPlanViewModel } = require("../../utils/meal-plan-state");

Page({
  data: {
    mealTabs: [],
    categoryTabs: [],
    dietaryTabs: [],
    visibleDishes: [],
    currentMealKey: "",
    currentMealLabel: "",
    currentCategoryId: "",
    currentCategoryLabel: "",
    currentDietaryTypeId: "all",
    currentDietaryTypeLabel: "全部",
    visibleDishCount: 0,
    activeMealLabels: [],
    activeMealSummary: "",
    totalCalories: 0,
    totalPrice: 0,
    selectedCount: 0,
    selectedIngredients: [],
    selectedIngredientsPreview: [],
    selectedIngredientCount: 0,
    selectedDishNames: []
  },

  onLoad() {
    this.activeMeals = mealPeriods.map((meal) => meal.key);
    this.currentMealKey = mealPeriods[0].key;
    this.currentCategoryByMeal = {};
    this.currentDietaryByMeal = {};
    this.selectedIdsByMeal = {
      breakfast: [],
      lunch: [],
      dinner: []
    };

    this.syncData();
  },

  syncData() {
    const nextState = buildMealPlanViewModel({
      activeMeals: this.activeMeals,
      selectedIdsByMeal: this.selectedIdsByMeal,
      currentMealKey: this.currentMealKey,
      currentCategoryByMeal: this.currentCategoryByMeal,
      currentDietaryByMeal: this.currentDietaryByMeal
    });

    this.currentMealKey = nextState.currentMealKey;
    this.currentCategoryByMeal = {
      ...this.currentCategoryByMeal,
      [nextState.currentMealKey]: nextState.currentCategoryId
    };
    this.currentDietaryByMeal = {
      ...this.currentDietaryByMeal,
      [nextState.currentMealKey]: nextState.currentDietaryTypeId
    };
    this.setData(nextState);
  },

  handleMealSwitch(event) {
    const { mealKey } = event.currentTarget.dataset;
    const nextActiveMeals = this.activeMeals.includes(mealKey)
      ? this.activeMeals.filter((key) => key !== mealKey)
      : [...this.activeMeals, mealKey];

    if (!nextActiveMeals.length) {
      wx.showToast({
        title: "至少保留一餐哦",
        icon: "none"
      });
      return;
    }

    this.activeMeals = nextActiveMeals;
    this.syncData();
  },

  handleMealFocus(event) {
    const { mealKey } = event.currentTarget.dataset;

    if (!this.activeMeals.includes(mealKey)) {
      wx.showToast({
        title: "先开启这餐再看菜",
        icon: "none"
      });
      return;
    }

    this.currentMealKey = mealKey;
    this.syncData();
  },

  handleCategoryFocus(event) {
    const { categoryId } = event.currentTarget.dataset;

    this.currentCategoryByMeal = {
      ...this.currentCategoryByMeal,
      [this.currentMealKey]: categoryId
    };
    this.currentDietaryByMeal = {
      ...this.currentDietaryByMeal,
      [this.currentMealKey]: "all"
    };

    this.syncData();
  },

  handleDietaryFocus(event) {
    const { dietaryId } = event.currentTarget.dataset;

    this.currentDietaryByMeal = {
      ...this.currentDietaryByMeal,
      [this.currentMealKey]: dietaryId
    };

    this.syncData();
  },

  handleDishToggle(event) {
    const { mealKey, dishId } = event.currentTarget.dataset;

    if (!this.activeMeals.includes(mealKey)) {
      wx.showToast({
        title: "先开启这餐再选菜",
        icon: "none"
      });
      return;
    }

    const current = this.selectedIdsByMeal[mealKey] || [];
    const exists = current.includes(dishId);

    this.selectedIdsByMeal = {
      ...this.selectedIdsByMeal,
      [mealKey]: exists ? current.filter((id) => id !== dishId) : [...current, dishId]
    };
    this.currentMealKey = mealKey;

    this.syncData();
  }
});
