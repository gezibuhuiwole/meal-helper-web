const mealPeriods = require("../data/tables/meal-periods");
const regions = require("../data/tables/regions");
const cuisines = require("../data/tables/cuisines");
const dishCategories = require("../data/tables/dish-categories");
const dishSubcategories = require("../data/tables/dish-subcategories");
const dietaryTypes = require("../data/tables/dietary-types");
const ingredients = require("../data/tables/ingredients");
const dishes = require("../data/tables/dishes");
const dishMetrics = require("../data/tables/dish-metrics");
const dishMealPeriods = require("../data/tables/dish-meal-periods");
const dishIngredients = require("../data/tables/dish-ingredients");

function indexBy(rows, key) {
  return rows.reduce((result, row) => {
    result[row[key]] = row;
    return result;
  }, {});
}

const regionById = indexBy(regions, "id");
const cuisineById = indexBy(cuisines, "id");
const categoryById = indexBy(dishCategories, "id");
const subcategoryById = indexBy(dishSubcategories, "id");
const dietaryTypeById = indexBy(dietaryTypes, "id");
const ingredientById = indexBy(ingredients, "id");
const dishById = indexBy(dishes, "id");

const metricsByDishId = dishMetrics.reduce((result, row) => {
  result[row.dishId] = row;
  return result;
}, {});

const mealLinksByDishId = dishMealPeriods.reduce((result, row) => {
  if (!result[row.dishId]) {
    result[row.dishId] = [];
  }
  result[row.dishId].push(row);
  return result;
}, {});

const ingredientLinksByDishId = dishIngredients.reduce((result, row) => {
  if (!result[row.dishId]) {
    result[row.dishId] = [];
  }
  result[row.dishId].push(row);
  return result;
}, {});

function hydrateDish(dish) {
  const metrics = metricsByDishId[dish.id] || {};
  const cuisine = cuisineById[dish.cuisineId] || {};
  const region = regionById[dish.regionId] || {};
  const category = categoryById[dish.categoryId] || {};
  const subcategory = subcategoryById[dish.subcategoryId] || {};
  const dietaryType = dietaryTypeById[dish.dietaryTypeId] || {};
  const mealLinks = (mealLinksByDishId[dish.id] || []).sort((a, b) => a.sortOrder - b.sortOrder);
  const ingredientLinks = (ingredientLinksByDishId[dish.id] || []).sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: dish.id,
    name: dish.name,
    calories: metrics.caloriesKcal || 0,
    price: metrics.priceEstimateCny || 0,
    servingNote: metrics.servingNote || "",
    cuisine: cuisine.name || "",
    cuisineId: dish.cuisineId,
    region: region.name || "",
    regionId: dish.regionId,
    category: category.name || "",
    categoryId: dish.categoryId,
    subcategory: subcategory.name || "",
    subcategoryId: dish.subcategoryId,
    dietaryType: dietaryType.label || "",
    dietaryTypeId: dish.dietaryTypeId,
    ingredients: ingredientLinks
      .map((link) => ingredientById[link.ingredientId])
      .filter(Boolean)
      .map((ingredient) => ingredient.name),
    mealPeriodIds: mealLinks.map((link) => link.mealPeriodId),
    defaultMealPeriodId: dish.defaultMealPeriodId
  };
}

function getMealCatalog() {
  const hydratedDishes = dishes.filter((dish) => dish.isActive).map(hydrateDish);
  const dishesByMeal = {};

  mealPeriods.forEach((mealPeriod) => {
    dishesByMeal[mealPeriod.key] = hydratedDishes
      .filter((dish) => dish.mealPeriodIds.includes(mealPeriod.id))
      .sort((left, right) => left.price - right.price || left.calories - right.calories || left.name.localeCompare(right.name));
  });

  return {
    mealPeriods: mealPeriods.map((mealPeriod) => ({
      id: mealPeriod.id,
      key: mealPeriod.key,
      label: mealPeriod.label,
      sortOrder: mealPeriod.sortOrder
    })),
    dishes: dishesByMeal
  };
}

function getDishById(dishId) {
  const dish = dishById[dishId];
  return dish ? hydrateDish(dish) : null;
}

module.exports = {
  getMealCatalog,
  getDishById
};
