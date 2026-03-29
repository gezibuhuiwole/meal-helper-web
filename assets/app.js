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
const STORAGE_KEY = "meal-helper-web-state-v1";

const app = document.getElementById("app");

const state = {
  route: "home",
  activeMeals: [],
  currentMealKey: "",
  currentCategoryByMeal: {},
  currentDietaryByMeal: {},
  selectedIdsByMeal: {
    breakfast: [],
    lunch: [],
    dinner: []
  }
};

let catalog = null;
let dishLookup = {};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('\"', "&quot;")
    .replaceAll("'", "&#39;");
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    activeMeals: state.activeMeals,
    currentMealKey: state.currentMealKey,
    currentCategoryByMeal: state.currentCategoryByMeal,
    currentDietaryByMeal: state.currentDietaryByMeal,
    selectedIdsByMeal: state.selectedIdsByMeal
  }));
}

function restoreState() {
  if (!catalog) {
    return;
  }

  const fallbackMeals = catalog.mealPeriods.map((meal) => meal.key);
  state.activeMeals = [...fallbackMeals];
  state.currentMealKey = fallbackMeals[0] || "";

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.activeMeals) && parsed.activeMeals.length) {
      state.activeMeals = parsed.activeMeals.filter((mealKey) => fallbackMeals.includes(mealKey));
    }

    if (!state.activeMeals.length) {
      state.activeMeals = [...fallbackMeals];
    }

    if (parsed.currentMealKey && state.activeMeals.includes(parsed.currentMealKey)) {
      state.currentMealKey = parsed.currentMealKey;
    }

    state.currentCategoryByMeal = parsed.currentCategoryByMeal || {};
    state.currentDietaryByMeal = parsed.currentDietaryByMeal || {};
    const selectedByMeal = parsed.selectedIdsByMeal || {};
    state.selectedIdsByMeal = {
      breakfast: Array.isArray(selectedByMeal.breakfast) ? selectedByMeal.breakfast : [],
      lunch: Array.isArray(selectedByMeal.lunch) ? selectedByMeal.lunch : [],
      dinner: Array.isArray(selectedByMeal.dinner) ? selectedByMeal.dinner : []
    };
  } catch (error) {
    console.warn("Failed to restore state", error);
  }
}

function syncRoute() {
  state.route = window.location.hash === "#plan" ? "plan" : "home";
}

function getSelectedIds(mealKey) {
  return state.selectedIdsByMeal[mealKey] || [];
}

function buildMealDishCards(mealKey) {
  const selectedSet = new Set(getSelectedIds(mealKey));

  return (catalog.dishes[mealKey] || []).map((dish) => ({
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

function buildCategoryState(mealKey, mealDishes) {
  const currentCategoryId = state.currentCategoryByMeal[mealKey];
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
    return left.label.localeCompare(right.label, "zh-Hans-CN");
  });

  const fallbackCategoryId = categoryTabs.some((item) => item.id === currentCategoryId)
    ? currentCategoryId
    : (categoryTabs[0] ? categoryTabs[0].id : "");
  const currentCategory = categoryTabs.find((item) => item.id === fallbackCategoryId) || null;
  const categoryDishes = mealDishes.filter((dish) => dish.categoryId === fallbackCategoryId);

  return {
    categoryTabs,
    currentCategoryId: fallbackCategoryId,
    currentCategoryLabel: currentCategory ? currentCategory.label : "",
    categoryDishes
  };
}

function buildDietaryState(categoryDishes, mealKey) {
  const currentDietaryTypeId = state.currentDietaryByMeal[mealKey];
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

  const dietaryTabs = [{ id: "all", label: DIETARY_LABEL_MAP.all, count: categoryDishes.length }].concat(
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

function buildSelectedDishes() {
  return catalog.mealPeriods.reduce((result, meal) => {
    if (!state.activeMeals.includes(meal.key)) {
      result[meal.key] = [];
      return result;
    }

    result[meal.key] = getSelectedIds(meal.key)
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
    .map((name) => ({ name, count: counts[name] }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-Hans-CN"));
}

function summarizeSelection() {
  const selectedDishesByMeal = buildSelectedDishes();
  const allSelectedDishes = catalog.mealPeriods.reduce((result, meal) => result.concat(selectedDishesByMeal[meal.key] || []), []);
  const selectedIngredients = buildIngredients(allSelectedDishes);

  const totals = allSelectedDishes.reduce((result, dish) => {
    result.totalCalories += dish.calories || 0;
    result.totalPrice += dish.price || 0;
    result.selectedCount += 1;
    return result;
  }, { totalCalories: 0, totalPrice: 0, selectedCount: 0 });

  return {
    totalCalories: totals.totalCalories,
    totalPrice: totals.totalPrice,
    selectedCount: totals.selectedCount,
    selectedIngredients,
    selectedIngredientsPreview: selectedIngredients.slice(0, 8),
    selectedIngredientCount: selectedIngredients.length
  };
}

function buildMealTabs() {
  return catalog.mealPeriods.map((meal) => ({
    ...meal,
    enabled: state.activeMeals.includes(meal.key),
    selectedCount: getSelectedIds(meal.key).length
  }));
}

function buildViewModel() {
  const mealTabs = buildMealTabs();
  const fallbackMealKey = state.currentMealKey && state.activeMeals.includes(state.currentMealKey)
    ? state.currentMealKey
    : (state.activeMeals[0] || catalog.mealPeriods[0].key);
  const currentMeal = catalog.mealPeriods.find((meal) => meal.key === fallbackMealKey) || catalog.mealPeriods[0];
  const mealDishes = buildMealDishCards(currentMeal.key);
  const categoryState = buildCategoryState(currentMeal.key, mealDishes);
  const dietaryState = buildDietaryState(categoryState.categoryDishes, currentMeal.key);
  const summary = summarizeSelection();
  const activeMealLabels = mealTabs.filter((meal) => meal.enabled).map((meal) => meal.label);

  state.currentMealKey = currentMeal.key;
  state.currentCategoryByMeal[currentMeal.key] = categoryState.currentCategoryId;
  state.currentDietaryByMeal[currentMeal.key] = dietaryState.currentDietaryTypeId;

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
    activeMealSummary: activeMealLabels.join(" · ") || "未选择餐次",
    totalCalories: summary.totalCalories,
    totalPrice: summary.totalPrice,
    selectedCount: summary.selectedCount,
    selectedIngredientsPreview: summary.selectedIngredientsPreview,
    selectedIngredientCount: summary.selectedIngredientCount
  };
}

function renderHome() {
  app.innerHTML = `
    <main class="home-stack">
      <section class="hero card">
        <div class="hero-eyebrow">Meal Helper Web</div>
        <div class="hero-title">今天吃什么，先把三餐安排好。</div>
        <div class="hero-desc">这版已经整理成纯网页，不再依赖微信小程序。你可以按早餐、午餐、晚餐选菜，实时查看热量、金额和所需食材。</div>
        <div class="hero-actions">
          <button class="primary-btn" data-action="start-plan">开始点餐</button>
          <button class="secondary-btn" data-action="jump-plan">继续上次选择</button>
        </div>
        <div class="home-note">当前开放功能：按餐次点餐、分类筛选、荤素筛选、热量与金额汇总。</div>
      </section>

      <section class="helper-card card">
        <div class="section-head">
          <div>
            <div class="section-title">这版怎么用</div>
            <div class="section-desc">保留最核心的一条链路，先让它稳定好用。</div>
          </div>
          <div class="count-badge">共 ${catalog.counts.totalDishes} 道菜</div>
        </div>
        <div class="helper-list">
          <div class="helper-item">1. 先进入点餐页，默认早餐、午餐、晚餐全部开启。</div>
          <div class="helper-item">2. 先选餐次，再按菜品分类和荤素筛选缩小范围。</div>
          <div class="helper-item">3. 点选菜品后，顶部会实时汇总热量、金额和所需食材。</div>
        </div>
      </section>

      <div class="footer-note">数据保存在当前浏览器本地，适合你自己日常使用。</div>
    </main>
  `;
}

function renderPlanner() {
  const vm = buildViewModel();
  const ingredientHtml = vm.selectedIngredientsPreview.length
    ? vm.selectedIngredientsPreview.map((item) => `<div class="ingredient-chip">${escapeHtml(item.name)} x${item.count}</div>`).join("")
    : '<div class="empty-state">暂未选择菜品</div>';
  const mealTabsHtml = vm.mealTabs.map((meal) => `
    <button class="meal-tab ${meal.key === vm.currentMealKey ? "current" : ""} ${meal.enabled ? "" : "off"}" data-action="focus-meal" data-meal-key="${meal.key}">
      <div class="meal-tab-label">${escapeHtml(meal.label)}</div>
      <div class="meal-tab-meta">${meal.selectedCount} 道</div>
      <span class="meal-toggle ${meal.enabled ? "on" : "off"}" data-action="toggle-meal" data-meal-key="${meal.key}">${meal.enabled ? "开" : "关"}</span>
    </button>
  `).join("");
  const categoryHtml = vm.categoryTabs.map((category) => `
    <button class="filter-chip ${category.id === vm.currentCategoryId ? "current" : ""}" data-action="focus-category" data-category-id="${category.id}">
      <span>${escapeHtml(category.label)}</span>
      <span class="filter-chip-count">${category.count}</span>
    </button>
  `).join("");
  const dietaryHtml = vm.dietaryTabs.map((dietary) => `
    <button class="filter-chip ${dietary.id === vm.currentDietaryTypeId ? "current" : ""}" data-action="focus-dietary" data-dietary-id="${dietary.id}">
      <span>${escapeHtml(dietary.label)}</span>
      <span class="filter-chip-count">${dietary.count}</span>
    </button>
  `).join("");
  const dishesHtml = vm.visibleDishes.length
    ? vm.visibleDishes.map((dish) => `
      <button class="dish-card ${dish.selected ? "selected" : ""}" data-action="toggle-dish" data-meal-key="${vm.currentMealKey}" data-dish-id="${dish.id}">
        <div class="dish-card-top">
          <div class="dish-name">${escapeHtml(dish.name)}</div>
          <span class="dish-cta">${dish.selected ? "已选" : "选择"}</span>
        </div>
        <div class="dish-meta">${dish.calories} kcal · ¥${dish.price}${dish.servingNote ? ` · ${escapeHtml(dish.servingNote)}` : ""}</div>
        <div class="tag-list">${dish.ingredientPreview.map((ingredient) => `<span class="tag">${escapeHtml(ingredient)}</span>`).join("")}</div>
      </button>
    `).join("")
    : '<div class="empty-state">这个筛选下暂时没有菜，换一个分类试试。</div>';

  app.innerHTML = `
    <main class="planner-stack">
      <section class="summary card">
        <div class="summary-topline">
          <div>
            <div class="summary-title">今日点餐</div>
            <div class="summary-meta">按餐次和分类选择菜品，实时查看热量、金额和食材。</div>
          </div>
          <div class="meal-pill">${escapeHtml(vm.activeMealSummary)}</div>
        </div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">已选</div><div class="stat-value">${vm.selectedCount} 道</div></div>
          <div class="stat-box"><div class="stat-label">热量</div><div class="stat-value">${vm.totalCalories} kcal</div></div>
          <div class="stat-box"><div class="stat-label">金额</div><div class="stat-value">¥${vm.totalPrice}</div></div>
        </div>
        <div class="ingredient-strip">
          <div class="ingredient-title">需准备食材 · ${vm.selectedIngredientCount} 种</div>
          <div class="ingredient-scroll">${ingredientHtml}</div>
        </div>
        <div class="summary-actions">
          <button class="inline-btn" data-action="back-home">返回首页</button>
          <button class="inline-btn" data-action="clear-all">清空选择</button>
        </div>
      </section>

      <section class="workspace card">
        <div class="workspace-head">
          <div>
            <div class="workspace-title">${escapeHtml(vm.currentMealLabel)}</div>
            <div class="workspace-desc">先选餐次，再按分类和荤素筛选缩小范围。</div>
          </div>
          <div class="workspace-badge">${escapeHtml(vm.currentCategoryLabel)} · ${escapeHtml(vm.currentDietaryTypeLabel)} · ${vm.visibleDishes.length} 道</div>
        </div>
        <div class="workspace-body">
          <div class="meal-tabs">${mealTabsHtml}</div>
          <div>
            <div class="filter-section"><div class="filter-title">菜品分类</div><div class="filter-row">${categoryHtml}</div></div>
            <div class="filter-section"><div class="filter-title">荤素筛选</div><div class="filter-row">${dietaryHtml}</div></div>
            <div class="dish-grid">${dishesHtml}</div>
          </div>
        </div>
      </section>

      <div class="footer-note">当前版本为自用网页版本，数据仅保存在当前浏览器本地。</div>
    </main>
  `;
}

function clearAll() {
  state.selectedIdsByMeal = { breakfast: [], lunch: [], dinner: [] };
  saveState();
}

function handleClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;

  if (action === 'start-plan' || action === 'jump-plan') {
    window.location.hash = '#plan';
    return;
  }

  if (action === 'back-home') {
    window.location.hash = '#home';
    return;
  }

  if (action === 'clear-all') {
    clearAll();
    render();
    return;
  }

  if (action === 'toggle-meal') {
    const mealKey = trigger.dataset.mealKey;
    const nextActiveMeals = state.activeMeals.includes(mealKey)
      ? state.activeMeals.filter((key) => key !== mealKey)
      : [...state.activeMeals, mealKey];

    if (!nextActiveMeals.length) {
      return;
    }

    state.activeMeals = nextActiveMeals;
    if (!state.activeMeals.includes(state.currentMealKey)) {
      state.currentMealKey = state.activeMeals[0];
    }
    saveState();
    render();
    return;
  }

  if (action === 'focus-meal') {
    const mealKey = trigger.dataset.mealKey;
    if (!state.activeMeals.includes(mealKey)) {
      return;
    }
    state.currentMealKey = mealKey;
    saveState();
    render();
    return;
  }

  if (action === 'focus-category') {
    state.currentCategoryByMeal[state.currentMealKey] = trigger.dataset.categoryId;
    state.currentDietaryByMeal[state.currentMealKey] = 'all';
    saveState();
    render();
    return;
  }

  if (action === 'focus-dietary') {
    state.currentDietaryByMeal[state.currentMealKey] = trigger.dataset.dietaryId;
    saveState();
    render();
    return;
  }

  if (action === 'toggle-dish') {
    const mealKey = trigger.dataset.mealKey;
    const dishId = trigger.dataset.dishId;
    if (!state.activeMeals.includes(mealKey)) {
      return;
    }
    const current = getSelectedIds(mealKey);
    const exists = current.includes(dishId);
    state.selectedIdsByMeal[mealKey] = exists ? current.filter((id) => id !== dishId) : [...current, dishId];
    state.currentMealKey = mealKey;
    saveState();
    render();
  }
}

function render() {
  syncRoute();
  if (!catalog) {
    app.innerHTML = '<div class="card hero"><div class="hero-title">加载中...</div></div>';
    return;
  }

  if (state.route === 'plan') {
    renderPlanner();
    return;
  }

  renderHome();
}

async function init() {
  const response = await fetch('./assets/catalog.json');
  catalog = await response.json();
  dishLookup = Object.values(catalog.dishes).flat().reduce((result, dish) => {
    result[dish.id] = dish;
    return result;
  }, {});

  restoreState();
  syncRoute();
  render();
}

window.addEventListener('hashchange', render);
app.addEventListener('click', handleClick);
init().catch((error) => {
  console.error(error);
  app.innerHTML = '<div class="hero card"><div class="hero-title">加载失败</div><div class="hero-desc">站点资源没有正确加载，可以稍后刷新，或用本地静态服务器重新打开。</div></div>';
});
